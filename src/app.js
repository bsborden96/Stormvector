/* Storm Vector — app.js
   Data sources:
   - Current conditions + active alerts: api.weather.gov (National Weather Service, no key required)
   - Severe-weather parameters (CAPE, freezing level, wind-by-height): api.open-meteo.com (no key required)
   - User-triggered location search + reverse geocoding: nominatim.openstreetmap.org
   - SPC Day 1 categorical outlook: NOAA's weather map service GeoJSON point query.
*/

const $ = (id) => document.getElementById(id);

// ---------- State ----------
let place = null;
let currentConditions = null;
let severeParams = null;
let activeAlerts = [];
let outlookData = null;
let alertsPollTimer = null;
let muted = false;
let voices = [];
let broadcastRunning = false;
let alertsStatus = 'loading';
let alertsCheckedAt = null;
let seenWarningIds = new Set();
let locationVersion = 0;
let lastChangeText = '';
const STORAGE_PREFIX = 'stormvector:';

// ---------- Known locations available without geocoding ----------
const fallbackCities = [
  ['Norman, OK', 35.2226, -97.4395], ['Oklahoma City, OK', 35.4676, -97.5164], ['Tulsa, OK', 36.154, -95.9928],
  ['Dallas, TX', 32.7767, -96.797], ['Houston, TX', 29.7604, -95.3698], ['Austin, TX', 30.2672, -97.7431],
  ['Kansas City, MO', 39.0997, -94.5786], ['Wichita, KS', 37.6872, -97.3301], ['Denver, CO', 39.7392, -104.9903],
  ['Chicago, IL', 41.8781, -87.6298], ['Atlanta, GA', 33.749, -84.388], ['Miami, FL', 25.7617, -80.1918],
  ['New York, NY', 40.7128, -74.006], ['Los Angeles, CA', 34.0522, -118.2437], ['Seattle, WA', 47.6062, -122.3321],
  ['Phoenix, AZ', 33.4484, -112.074], ['Minneapolis, MN', 44.9778, -93.265], ['Little Rock, AR', 34.7465, -92.2896],
  ['Birmingham, AL', 33.5186, -86.8104], ['Nashville, TN', 36.1627, -86.7816],
];

const facts = [
  'A supercell can persist for hours when wind shear keeps the updraft separated from rain-cooled air.',
  'CAPE estimates buoyant energy; high CAPE alone does not guarantee severe storms without lift and shear.',
  'A hook echo can indicate rotation, but warnings rely on multiple radar and environmental clues.',
  'The safest tornado shelter is a basement or small interior room on the lowest floor.',
];

const producerStyles = [
  { name: 'calm studio read', rate: 0.95, pitch: 1.0 },
  { name: 'urgent field update', rate: 1.15, pitch: 1.08 },
  { name: 'plain-language explainer', rate: 0.92, pitch: 0.96 },
  { name: 'late-night weather radio tone', rate: 0.85, pitch: 0.88 },
];

// ---------- Init ----------
function init() {
  document.querySelectorAll('[data-page-link]').forEach((link) => link.addEventListener('click', route));
  window.addEventListener('hashchange', route);
  $('useSearch').addEventListener('click', searchLocation);
  $('locationSearch').addEventListener('keydown', (e) => { if (e.key === 'Enter') searchLocation(); });
  $('useGps').addEventListener('click', () => useGps(true));
  $('chaserToggle').addEventListener('click', toggleChaser);
  $('startBroadcast').addEventListener('click', broadcast);
  $('testFact').addEventListener('click', () => logLine(random(facts)));
  $('testSevere').addEventListener('click', () => severeInterrupt('This is a test of the Storm Vector severe weather interrupt system.'));
  $('muteToggle').addEventListener('click', toggleMute);
  route();

  if ('speechSynthesis' in window) {
    loadVoices();
    speechSynthesis.addEventListener('voiceschanged', loadVoices);
  }

  const saved = readSavedPlace();
  if (saved) updateLocation(saved);
  else useGps(false, true);
}

function route() {
  const requested = (location.hash || '#area').slice(1);
  const page = document.getElementById(requested)?.classList.contains('page') ? requested : 'area';
  document.querySelectorAll('.page').forEach((section) => section.classList.toggle('active', section.id === page));
  document.querySelectorAll('[data-page-link]').forEach((link) => link.classList.toggle('active', link.dataset.pageLink === page));
}

// ---------- Location search: one request per explicit submission ----------
async function searchPlaces(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=us&addressdetails=1&limit=5&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('Location search is unavailable. Try GPS or a suggested city later.');
  return res.json();
}

function formatPlaceLabel(result) {
  const a = result.address || {};
  const locality = a.city || a.town || a.village || a.hamlet || a.municipality || result.name || result.display_name.split(',')[0];
  const state = a.state_code || a.state || '';
  return state ? `${locality}, ${state}` : locality;
}

async function searchLocation() {
  const raw = $('locationSearch').value.trim();
  if (!raw) return;
  $('useSearch').disabled = true;
  $('locationMeta').textContent = 'Searching for your location…';
  const fallback = fallbackCities.find(([name]) => name.toLowerCase() === raw.toLowerCase());
  if (fallback) {
    updateLocation({ name: fallback[0], lat: fallback[1], lon: fallback[2] });
  } else try {
    const results = await searchPlaces(raw);
    if (!results.length) throw new Error('No matching U.S. location found. Try a city and state.');
    const match = results[0];
    updateLocation({ name: formatPlaceLabel(match), lat: Number(match.lat), lon: Number(match.lon) });
  } catch (err) {
    $('locationMeta').textContent = err.message;
  } finally {
    $('useSearch').disabled = false;
  }
}

function readSavedPlace() {
  try {
    const saved = JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}place`));
    return saved && typeof saved.name === 'string' && Number.isFinite(saved.lat) && Number.isFinite(saved.lon) ? saved : null;
  } catch { return null; }
}

function savePlace(nextPlace) {
  try { localStorage.setItem(`${STORAGE_PREFIX}place`, JSON.stringify(nextPlace)); } catch { /* Storage disabled. */ }
}

// ---------- GPS ----------
function useGps(showErrors, isInitialLoad = false) {
  const requestVersion = locationVersion;
  if (!navigator.geolocation) {
    if (showErrors) logIfBroadcastPage('This browser does not support GPS location.');
    if (isInitialLoad) updateLocation({ name: 'Norman, OK', lat: 35.2226, lon: -97.4395 });
    return;
  }
  $('locationMeta').textContent = 'Requesting GPS location…';
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude, longitude } = pos.coords;
      const name = await reverseGeocode(latitude, longitude);
      if (requestVersion !== locationVersion) return;
      updateLocation({ name, lat: latitude, lon: longitude });
    },
    () => {
      if (requestVersion !== locationVersion) return;
      if (showErrors) logIfBroadcastPage('GPS was not available or was denied — search for a city instead.');
      if (isInitialLoad) {
        $('locationMeta').textContent = 'GPS unavailable — showing a default city. Search above to change it.';
        updateLocation({ name: 'Norman, OK', lat: 35.2226, lon: -97.4395 });
      }
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
  );
}

async function reverseGeocode(lat, lon) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('reverse geocode failed');
    const data = await res.json();
    return formatPlaceLabel(data);
  } catch (err) {
    return 'Your GPS location';
  }
}

// ---------- Orchestrator ----------
async function updateLocation(nextPlace) {
  const version = ++locationVersion;
  place = nextPlace;
  savePlace(nextPlace);
  $('locationTitle').textContent = place.name;
  $('locationMeta').textContent = `${place.lat.toFixed(3)}, ${place.lon.toFixed(3)} • loading live data…`;
  $('briefingTitle').textContent = `Checking ${place.name}…`;
  $('briefingStatus').textContent = 'Loading official alerts and observations.';
  $('briefingChanges').textContent = '';
  activeAlerts = [];
  alertsStatus = 'loading';
  alertsCheckedAt = null;
  currentConditions = null;
  severeParams = null;
  outlookData = null;
  clearInterval(alertsPollTimer);
  renderAlertBanner();
  const [conditions, severe, outlook, alerts] = await Promise.allSettled([
    loadConditions(nextPlace), loadSevereParams(nextPlace), loadOutlook(nextPlace), loadAlerts(nextPlace)
  ]);
  if (version !== locationVersion) return;
  currentConditions = conditions.status === 'fulfilled' ? conditions.value : null;
  severeParams = severe.status === 'fulfilled' ? severe.value : null;
  outlookData = outlook.status === 'fulfilled' ? outlook.value : null;
  applyAlerts(alerts.status === 'fulfilled' ? alerts.value : null, true);
  $('locationMeta').textContent = `${place.lat.toFixed(3)}, ${place.lon.toFixed(3)} • synchronized across all pages`;
  renderConditions();
  renderOutlook();
  renderBriefing();
  startAlertsPolling();
}

// ---------- NWS current conditions ----------
async function loadConditions(target) {
    const point = await fetchJson(`https://api.weather.gov/points/${target.lat},${target.lon}`);
    const stations = await fetchJson(point.properties.observationStations);
    const obs = await fetchJson(`${stations.features[0].id}/observations/latest`);
    const p = obs.properties;
    return {
      tempF: cToF(p.temperature.value),
      windMph: msToMph(p.windSpeed.value),
      windDirDeg: p.windDirection.value,
      humidity: p.relativeHumidity && p.relativeHumidity.value ? Math.round(p.relativeHumidity.value) : null,
      pressureMb: p.barometricPressure && p.barometricPressure.value ? Math.round(p.barometricPressure.value / 100) : null,
      dewpointC: p.dewpoint ? p.dewpoint.value : null,
      tempC: p.temperature ? p.temperature.value : null,
      observedAt: p.timestamp,
      summary: p.textDescription || 'Conditions reported by the nearest NWS station.',
    };
}

// ---------- Open-Meteo severe-weather parameters ----------
async function loadSevereParams(target) {
    const params = new URLSearchParams({
      latitude: target.lat,
      longitude: target.lon,
      hourly: 'cape,freezing_level_height,wind_speed_10m,wind_speed_80m,wind_speed_120m,wind_speed_180m,wind_direction_10m,wind_gusts_10m',
      wind_speed_unit: 'mph',
      temperature_unit: 'fahrenheit',
      timezone: 'GMT',
      forecast_days: 1,
    });
    const data = await fetchJson(`https://api.open-meteo.com/v1/forecast?${params}`);
    const times = data.hourly.time;
    const now = new Date();
    let idx = times.findIndex((t) => new Date(`${t}Z`) >= now);
    if (idx < 0) idx = times.length - 1;
    return {
      cape: data.hourly.cape[idx],
      freezingLevelM: data.hourly.freezing_level_height[idx],
      windLow: data.hourly.wind_speed_10m[idx],
      windHigh: data.hourly.wind_speed_180m[idx],
      windDir: data.hourly.wind_direction_10m[idx],
      windGust: data.hourly.wind_gusts_10m[idx],
    };
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/geo+json, application/json' } });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

// ---------- NWS active alerts ----------
async function loadAlerts(target) {
  const data = await fetchJson(`https://api.weather.gov/alerts/active?point=${target.lat},${target.lon}`);
  return data.features || [];
}

function alertId(feature) {
  return feature.id || feature.properties?.id || `${feature.properties?.event}:${feature.properties?.onset}`;
}

function applyAlerts(features, initial = false) {
  if (!features) {
    alertsStatus = 'unavailable';
    renderAlertBanner();
    renderBriefing();
    return;
  }
  alertsStatus = 'current';
  alertsCheckedAt = new Date().toISOString();
  const previousIds = new Set(activeAlerts.map(alertId));
  const previousWarnings = activeAlerts.filter((a) => /warning/i.test(a.properties?.event || ''));
  const newWarnings = features.filter((a) => /warning/i.test(a.properties?.event || '') && !seenWarningIds.has(alertId(a)));
  activeAlerts = features;
  if (initial) {
    seenWarningIds = new Set(features.filter((a) => /warning/i.test(a.properties?.event || '')).map(alertId));
    const key = alertStorageKey();
    try {
      const previous = JSON.parse(localStorage.getItem(key));
      const previousIds = new Set(Array.isArray(previous?.ids) ? previous.ids : []);
      const added = features.filter((a) => !previousIds.has(alertId(a)));
      lastChangeText = previous
        ? `${added.length} new alert${added.length === 1 ? '' : 's'} since your last visit. Last checked ${formatTime(previous.checkedAt)}.`
        : 'First visit for this location. Changes will appear on your next visit.';
    } catch { lastChangeText = 'Changes since your last visit are unavailable in this browser.'; }
  } else {
    const added = features.filter((a) => !previousIds.has(alertId(a)));
    const removed = previousWarnings.filter((a) => !features.some((b) => alertId(b) === alertId(a)));
    if (added.length || removed.length) lastChangeText = `${added.length} new alert${added.length === 1 ? '' : 's'} · ${removed.length} warning${removed.length === 1 ? '' : 's'} no longer active since the last check.`;
    newWarnings.forEach((a) => {
      seenWarningIds.add(alertId(a));
      if (broadcastRunning) severeInterrupt(`${a.properties.event} in effect: ${a.properties.headline || a.properties.event}.`);
    });
  }
  try { localStorage.setItem(alertStorageKey(), JSON.stringify({ ids: features.map(alertId), checkedAt: alertsCheckedAt })); } catch { /* Storage disabled. */ }
  renderAlertBanner();
  renderBriefing();
}

function alertStorageKey() {
  return `${STORAGE_PREFIX}alerts:${place.lat.toFixed(3)},${place.lon.toFixed(3)}`;
}

function startAlertsPolling() {
  clearInterval(alertsPollTimer);
  alertsPollTimer = setInterval(async () => {
    const target = place;
    try {
      const features = await loadAlerts(target);
      if (place === target) applyAlerts(features);
    } catch {
      if (place === target) applyAlerts(null);
    }
  }, 5 * 60 * 1000);
}

function renderAlertBanner() {
  const banner = $('alertBanner');
  const warnings = activeAlerts.filter((a) => /warning/i.test(a.properties?.event || ''));
  if (warnings.length === 0) {
    banner.classList.add('hidden');
    banner.textContent = '';
    return;
  }
  banner.classList.remove('hidden');
  banner.textContent = `⚠ ${warnings.map((w) => w.properties.event).join(' · ')} — ${place ? place.name : ''}${alertsStatus === 'unavailable' ? ' · alert refresh unavailable' : ''}`;
}

// ---------- SPC outlook: never substitute model heuristics for official categories ----------
async function loadOutlook(target) {
  return fetchLiveSpcOutlook(target);
}

async function fetchLiveSpcOutlook(target) {
    const query = new URLSearchParams({
      geometry: `${target.lon},${target.lat}`,
      geometryType: 'esriGeometryPoint',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: 'label,valid,expire,issue',
      returnGeometry: 'false',
      f: 'geojson',
    });
    const geo = await fetchJson(`https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer/1/query?${query}`);
    if (!Array.isArray(geo.features)) throw new Error('Invalid SPC data');
    const labels = geo.features.map((f) => String(f.properties?.label || '').toUpperCase());
    const ordered = ['TSTM', 'MRGL', 'SLGT', 'ENH', 'MDT', 'HIGH'];
    const rank = Math.max(...labels.map((label) => ordered.indexOf(label)), -1);
    return { category: rank < 0 ? 'Outside plotted Day 1 areas' : spcLabelToName(ordered[rank]), retrievedAt: new Date().toISOString() };
}

function spcLabelToName(label) {
  const map = { TSTM: 'General Thunderstorms', MRGL: 'Marginal Risk', SLGT: 'Slight Risk', ENH: 'Enhanced Risk', MDT: 'Moderate Risk', HIGH: 'High Risk' };
  return map[label] || 'Category unavailable';
}

// ---------- Render: Conditions / Chaser mode ----------
function renderConditions() {
  if (!currentConditions) {
    $('currentTemp').textContent = '--°';
    $('currentSummary').textContent = 'Live data is unavailable for this location right now.';
    $('windValue').textContent = '--';
    $('humidityValue').textContent = '--';
    $('pressureValue').textContent = '--';
  } else {
    $('currentTemp').textContent = currentConditions.tempF == null ? '--°' : `${Math.round(currentConditions.tempF)}°F`;
    $('currentSummary').textContent = currentConditions.summary;
    $('windValue').textContent = currentConditions.windMph == null ? '--' : `${Math.round(currentConditions.windMph)} mph ${degToCompass(currentConditions.windDirDeg)}`;
    $('humidityValue').textContent = currentConditions.humidity != null ? `${currentConditions.humidity}%` : '--';
    $('pressureValue').textContent = currentConditions.pressureMb != null ? `${currentConditions.pressureMb} mb` : '--';
  }
  renderChaserGrid();
}

function renderChaserGrid() {
  if (!severeParams) {
    $('capeValue').textContent = '--';
    $('skewValue').textContent = 'No live model data';
    $('lclValue').textContent = '--';
    $('shearValue').textContent = '--';
    return;
  }
  const cape = Math.round(severeParams.cape || 0);
  $('capeValue').textContent = `${cape.toLocaleString()} J/kg`;
  $('skewValue').textContent = cape > 2000 ? 'Strong instability' : cape > 800 ? 'Moderate instability' : 'Weak / stable';

  if (currentConditions && currentConditions.tempC != null && currentConditions.dewpointC != null) {
    const lclM = Math.round(125 * (currentConditions.tempC - currentConditions.dewpointC));
    $('lclValue').textContent = `${Math.max(lclM, 0).toLocaleString()} m (est.)`;
  } else {
    $('lclValue').textContent = 'Needs live temp/dew point';
  }

  const shear = Math.max(0, Math.round((severeParams.windHigh || 0) - (severeParams.windLow || 0)));
  $('shearValue').textContent = `${shear} mph`;
}

// ---------- Render: Outlook ----------
function renderOutlook() {
  $('outlookSource').textContent = 'SPC Day 1 categorical outlook';
  $('riskTitle').textContent = outlookData?.category || 'Official outlook unavailable';
  $('riskCopy').textContent = outlookData
    ? 'Based on the SPC categorical outlook feed. Check SPC for the complete map, valid time, and hazards.'
    : 'Storm Vector could not load the official SPC feed. No risk category is estimated.';
  $('outlookTime').textContent = outlookData ? `Retrieved ${formatTime(outlookData.retrievedAt)}` : '';
}

// ---------- Render: local briefing ----------
function renderBriefing() {
  if (!place) return;
  const alerts = activeAlerts.map((feature) => feature.properties);
  const warnings = alerts.filter((a) => /warning/i.test(a.event || ''));
  $('briefingTitle').textContent = warnings.length ? `${warnings.length} active warning${warnings.length === 1 ? '' : 's'} near ${place.name}` : `Your briefing for ${place.name}`;
  $('briefingStatus').textContent = alertsStatus === 'unavailable'
    ? `NWS alert refresh failed. ${alertsCheckedAt ? `Last checked ${formatTime(alertsCheckedAt)}. ` : 'No alerts could be loaded. '}Verify directly with NWS.`
    : alertsStatus === 'loading' ? 'Checking NWS alerts…'
    : alerts.length ? `${alerts.length} active NWS alert${alerts.length === 1 ? '' : 's'} · checked ${formatTime(alertsCheckedAt)}.` : `No active NWS alerts returned · checked ${formatTime(alertsCheckedAt)}.`;
  $('briefingChanges').textContent = lastChangeText;
  const list = $('briefingAlerts');
  list.replaceChildren();
  alerts.sort((a, b) => Number(/warning/i.test(b.event || '')) - Number(/warning/i.test(a.event || ''))).forEach((alert) => {
    const item = document.createElement('article');
    item.className = 'briefing-alert';
    const title = document.createElement('strong');
    title.textContent = alert.event || 'NWS alert';
    const detail = document.createElement('p');
    detail.textContent = alert.headline || alert.description?.slice(0, 250) || 'Open the NWS alert for details.';
    const time = document.createElement('small');
    time.textContent = alert.expires ? `Expires ${formatTime(alert.expires)}` : 'Expiration not provided';
    item.append(title, detail, time);
    if (alert['@id'] && /^https:\/\/api\.weather\.gov\//.test(alert['@id'])) {
      const link = document.createElement('a');
      link.href = alert['@id'];
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Full NWS alert';
      item.append(link);
    }
    list.append(item);
  });
  $('briefingOutlook').textContent = outlookData?.category || 'Unavailable — check SPC';
  $('briefingOutlookTime').textContent = outlookData ? `Feed retrieved ${formatTime(outlookData.retrievedAt)}` : 'Official feed could not be loaded';
  $('briefingConditions').textContent = currentConditions?.tempF == null ? 'Unavailable' : `${Math.round(currentConditions.tempF)}°F · ${currentConditions.summary}`;
  $('briefingObservationTime').textContent = currentConditions?.observedAt ? `Observed ${formatTime(currentConditions.observedAt)} at the nearest NWS station` : 'No observation timestamp available';
}

function formatTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'time unavailable' : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

// ---------- Chaser mode toggle ----------
function toggleChaser() {
  const grid = $('chaserGrid');
  const btn = $('chaserToggle');
  const enabling = grid.classList.contains('hidden');
  grid.classList.toggle('hidden');
  btn.setAttribute('aria-pressed', String(enabling));
  btn.textContent = enabling ? 'Disable Storm Chaser Mode' : 'Enable Storm Chaser Mode';
}

// ---------- Voice ----------
function loadVoices() {
  voices = speechSynthesis.getVoices();
}

function pickVoice() {
  return voices.find((v) => /en-US/i.test(v.lang) && /Google|Natural|Samantha|Alex/i.test(v.name)) || voices.find((v) => /en-US/i.test(v.lang)) || voices[0];
}

function speak(text, style) {
  if (muted || !('speechSynthesis' in window)) return;
  const utter = new SpeechSynthesisUtterance(text);
  const voice = pickVoice();
  if (voice) utter.voice = voice;
  utter.rate = style ? style.rate : 1;
  utter.pitch = style ? style.pitch : 1;
  speechSynthesis.speak(utter);
}

function toggleMute() {
  muted = !muted;
  $('muteToggle').setAttribute('aria-pressed', String(muted));
  $('muteToggle').textContent = muted ? 'Unmute Voice' : 'Mute Voice';
  if (muted) speechSynthesis.cancel();
}

// ---------- Broadcast ----------
function logLine(text, isAlert = false) {
  const p = document.createElement('p');
  if (isAlert) p.classList.add('alert');
  p.textContent = text;
  $('broadcastLog').appendChild(p);
  $('broadcastLog').scrollTop = $('broadcastLog').scrollHeight;
}

function logIfBroadcastPage(text) {
  // Small status messages (search errors, GPS fallback) surface in the broadcast log if present,
  // otherwise just update the location meta line so nothing is silently lost.
  if ($('broadcastLog')) logLine(text);
}

function buildScriptLines() {
  const lines = [];
  const locName = place ? place.name : 'your area';
  if (currentConditions) {
    if (currentConditions.tempF != null) lines.push(`The nearest station to ${locName} reports ${Math.round(currentConditions.tempF)} degrees with ${currentConditions.summary.toLowerCase()}.`);
    else lines.push(`The nearest station to ${locName} reports ${currentConditions.summary.toLowerCase()}, but no temperature reading.`);
    if (currentConditions.windMph != null) lines.push(`Wind is out of the ${degToCompass(currentConditions.windDirDeg)} at ${Math.round(currentConditions.windMph)} miles per hour.`);
  } else {
    lines.push(`We don't have a live station reading for ${locName} right now, so treat conditions as unconfirmed.`);
  }
  if (outlookData) {
    lines.push(`Today's severe weather outlook for this area is a ${outlookData.category.toLowerCase()}.`);
  } else {
    lines.push('The official SPC outlook could not be loaded here. Check the SPC website for the current risk.');
  }
  const warnings = activeAlerts.filter((a) => /warning/i.test(a.properties?.event || ''));
  if (warnings.length) {
    lines.push(`We do have active alerts in effect: ${warnings.map((w) => w.properties.event).join(', ')}.`);
  }
  lines.push(random(facts));
  return lines;
}

function broadcast() {
  if (broadcastRunning) return;
  broadcastRunning = true;
  const lines = buildScriptLines();
  let i = 0;
  const style = producerStyles[Math.floor(Math.random() * producerStyles.length)];
  logLine(`— Producer cues a ${style.name} —`);
  const speakNext = () => {
    if (i >= lines.length) {
      broadcastRunning = false;
      return;
    }
    const line = lines[i++];
    logLine(line);
    speak(line, style);
    const estMs = Math.max(1800, line.length * 55);
    setTimeout(speakNext, estMs);
  };
  speakNext();
}

function severeInterrupt(customText) {
  const text = customText || 'Severe weather interrupt: conditions in this area have changed. Stay tuned for updates.';
  logLine(text, true);
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  speak(text, { rate: 1.15, pitch: 1.1 });
}

// ---------- Helpers ----------
function cToF(c) {
  return c == null ? null : (c * 9) / 5 + 32;
}
function msToMph(ms) {
  return ms == null ? null : ms * 2.23694;
}
function degToCompass(deg) {
  if (deg == null) return '--';
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}
function random(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
document.addEventListener('DOMContentLoaded', init);
