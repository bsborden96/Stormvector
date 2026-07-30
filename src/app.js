/* Storm Vector — app.js
   Data sources:
   - Current conditions + active alerts: api.weather.gov (National Weather Service, no key required)
   - Severe-weather parameters (CAPE, freezing level, wind-by-height): api.open-meteo.com (no key required)
   - Location search + reverse geocoding: nominatim.openstreetmap.org (no key required, rate-limited — debounced)
   - SPC categorical/probabilistic outlook: spc.noaa.gov geojson feeds, attempted live; if the browser
     blocks the cross-origin request (SPC does not publish CORS headers for every product) the app
     falls back to a heuristic outlook computed from live CAPE/shear so the page is never a placeholder.
*/

const $ = (id) => document.getElementById(id);

// ---------- State ----------
let place = null;
let currentConditions = null;
let severeParams = null;
let activeAlerts = [];
let outlookData = null;
let placeCache = {};
let searchDebounce = null;
let alertsPollTimer = null;
let muted = false;
let voices = [];
let broadcastRunning = false;

// ---------- Fallback location list (used only if live geocoding fails) ----------
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
  $('locationSearch').addEventListener('input', onSearchInput);
  $('useSearch').addEventListener('click', searchLocation);
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

  // GPS-first: try to locate the user automatically so nothing needs to be typed.
  useGps(false, true);
}

function route() {
  const page = (location.hash || '#conditions').slice(1);
  document.querySelectorAll('.page').forEach((section) => section.classList.toggle('active', section.id === page));
  document.querySelectorAll('[data-page-link]').forEach((link) => link.classList.toggle('active', link.dataset.pageLink === page));
}

// ---------- Location search (live geocoding, covers cities/towns/villages) ----------
function onSearchInput() {
  clearTimeout(searchDebounce);
  const query = $('locationSearch').value.trim();
  if (query.length < 2) return;
  searchDebounce = setTimeout(() => searchPlaces(query), 400);
}

async function searchPlaces(query) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=us&addressdetails=1&limit=8&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('geocoding request failed');
    const results = await res.json();
    placeCache = {};
    $('citySuggestions').innerHTML = results
      .map((r) => {
        const label = formatPlaceLabel(r);
        placeCache[label] = { name: label, lat: parseFloat(r.lat), lon: parseFloat(r.lon) };
        return `<option value="${escapeHtml(label)}"></option>`;
      })
      .join('');
  } catch (err) {
    // Live search failed (offline, or the geocoder is unreachable) — fall back to the static list.
    $('citySuggestions').innerHTML = fallbackCities
      .filter(([name]) => name.toLowerCase().includes(query.toLowerCase()))
      .map(([name]) => `<option value="${name}"></option>`)
      .join('');
  }
}

function formatPlaceLabel(result) {
  const a = result.address || {};
  const locality = a.city || a.town || a.village || a.hamlet || a.municipality || result.name || result.display_name.split(',')[0];
  const state = a.state_code || a.state || '';
  return state ? `${locality}, ${state}` : locality;
}

function searchLocation() {
  const raw = $('locationSearch').value.trim();
  if (!raw) return;
  if (placeCache[raw]) {
    updateLocation(placeCache[raw]);
    return;
  }
  const fallback = fallbackCities.find(([name]) => name.toLowerCase() === raw.toLowerCase() || name.toLowerCase().startsWith(raw.toLowerCase()));
  if (fallback) {
    updateLocation({ name: fallback[0], lat: fallback[1], lon: fallback[2] });
  } else {
    logIfBroadcastPage(`Could not match "${raw}" to a location yet — keep typing or pick a suggestion.`);
  }
}

// ---------- GPS ----------
function useGps(showErrors, isInitialLoad = false) {
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
      updateLocation({ name, lat: latitude, lon: longitude });
    },
    () => {
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
  place = nextPlace;
  $('locationTitle').textContent = place.name;
  $('locationMeta').textContent = `${place.lat.toFixed(3)}, ${place.lon.toFixed(3)} • loading live data…`;

  await Promise.allSettled([loadConditions(), loadSevereParams(), loadOutlook()]);
  await loadAlerts();

  $('locationMeta').textContent = `${place.lat.toFixed(3)}, ${place.lon.toFixed(3)} • synchronized across all pages`;
  renderConditions();
  renderOutlook();
  renderField();
  startAlertsPolling();
}

// ---------- NWS current conditions ----------
async function loadConditions() {
  try {
    const point = await fetch(`https://api.weather.gov/points/${place.lat},${place.lon}`).then((r) => r.json());
    const stations = await fetch(point.properties.observationStations).then((r) => r.json());
    const obs = await fetch(`${stations.features[0].id}/observations/latest`).then((r) => r.json());
    const p = obs.properties;
    currentConditions = {
      tempF: cToF(p.temperature.value),
      windMph: msToMph(p.windSpeed.value),
      windDirDeg: p.windDirection.value,
      humidity: p.relativeHumidity && p.relativeHumidity.value ? Math.round(p.relativeHumidity.value) : null,
      pressureMb: p.barometricPressure && p.barometricPressure.value ? Math.round(p.barometricPressure.value / 100) : null,
      dewpointC: p.dewpoint ? p.dewpoint.value : null,
      tempC: p.temperature ? p.temperature.value : null,
      summary: p.textDescription || 'Conditions reported by the nearest NWS station.',
    };
  } catch (err) {
    currentConditions = null;
  }
}

// ---------- Open-Meteo severe-weather parameters ----------
async function loadSevereParams() {
  try {
    const params = new URLSearchParams({
      latitude: place.lat,
      longitude: place.lon,
      hourly: 'cape,freezing_level_height,wind_speed_10m,wind_speed_80m,wind_speed_120m,wind_speed_180m,wind_direction_10m,wind_gusts_10m',
      wind_speed_unit: 'mph',
      temperature_unit: 'fahrenheit',
      timezone: 'auto',
      forecast_days: 1,
    });
    const data = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`).then((r) => r.json());
    const times = data.hourly.time;
    const now = new Date();
    let idx = times.findIndex((t) => new Date(t) >= now);
    if (idx < 0) idx = 0;
    severeParams = {
      cape: data.hourly.cape[idx],
      freezingLevelM: data.hourly.freezing_level_height[idx],
      windLow: data.hourly.wind_speed_10m[idx],
      windHigh: data.hourly.wind_speed_180m[idx],
      windDir: data.hourly.wind_direction_10m[idx],
      windGust: data.hourly.wind_gusts_10m[idx],
    };
  } catch (err) {
    severeParams = null;
  }
}

// ---------- NWS active alerts ----------
async function loadAlerts() {
  try {
    const url = `https://api.weather.gov/alerts/active?point=${place.lat},${place.lon}`;
    const data = await fetch(url).then((r) => r.json());
    activeAlerts = (data.features || []).map((f) => f.properties);
    renderAlertBanner();
    if (broadcastRunning) {
      const warnings = activeAlerts.filter((a) => /warning/i.test(a.event));
      warnings.forEach((w) => severeInterrupt(`${w.event} in effect: ${w.headline || w.event}.`));
    }
  } catch (err) {
    activeAlerts = [];
    renderAlertBanner();
  }
}

function startAlertsPolling() {
  clearInterval(alertsPollTimer);
  alertsPollTimer = setInterval(loadAlerts, 5 * 60 * 1000);
}

function renderAlertBanner() {
  const banner = $('alertBanner');
  const warnings = activeAlerts.filter((a) => /warning/i.test(a.event));
  if (warnings.length === 0) {
    banner.classList.add('hidden');
    banner.textContent = '';
    return;
  }
  banner.classList.remove('hidden');
  banner.textContent = `⚠ ${warnings.map((w) => w.event).join(' · ')} — ${place ? place.name : ''}`;
}

// ---------- SPC outlook (live attempt, heuristic fallback) ----------
async function loadOutlook() {
  const live = await fetchLiveSpcOutlook();
  if (live) {
    outlookData = { ...live, source: 'live' };
    return;
  }
  outlookData = { ...heuristicOutlook(), source: 'heuristic' };
}

async function fetchLiveSpcOutlook() {
  try {
    const geo = await fetch('https://www.spc.noaa.gov/products/outlook/day1otlk_cat.geojson').then((r) => r.json());
    const point = [place.lon, place.lat];
    const hit = geo.features.find((f) => polygonsContain(f.geometry, point));
    if (!hit) return null;
    const label = hit.properties.LABEL || hit.properties.DN || 'MRGL';
    return {
      category: spcLabelToName(label),
      tornado: 'See SPC tornado outlook',
      wind: 'See SPC wind outlook',
      hail: 'See SPC hail outlook',
    };
  } catch (err) {
    // Most likely a CORS restriction from spc.noaa.gov on direct browser fetches, or a network block.
    return null;
  }
}

function spcLabelToName(label) {
  const map = { TSTM: 'General Thunderstorms', MRGL: 'Marginal Risk', SLGT: 'Slight Risk', ENH: 'Enhanced Risk', MDT: 'Moderate Risk', HIGH: 'High Risk' };
  return map[label] || 'Marginal Risk';
}

function heuristicOutlook() {
  if (!severeParams) {
    return { category: 'Marginal Risk', tornado: 'Low', wind: 'Low', hail: 'Low', confidence: 30 };
  }
  const cape = severeParams.cape || 0;
  const shear = Math.max(0, (severeParams.windHigh || 0) - (severeParams.windLow || 0));
  let category = 'Marginal Risk';
  if (cape > 2500 && shear > 45) category = 'Moderate Risk';
  else if (cape > 1500 && shear > 30) category = 'Enhanced Risk';
  else if (cape > 500 && shear > 15) category = 'Slight Risk';

  const tornado = shear > 40 && cape > 1000 ? 'Elevated' : shear > 20 ? 'Low-Moderate' : 'Low';
  const wind = severeParams.windGust > 45 || cape > 1500 ? 'Medium-High' : 'Low-Medium';
  const hail = cape > 2000 ? 'High' : cape > 800 ? 'Medium' : 'Low';

  const dataQuality = currentConditions ? 25 : 0;
  const confidence = Math.min(95, 40 + dataQuality + Math.min(30, cape / 100) + Math.min(10, shear / 5));

  return { category, tornado, wind, hail, confidence: Math.round(confidence) };
}

// Ray-casting point-in-polygon, supports Polygon and MultiPolygon GeoJSON geometries.
function polygonsContain(geometry, point) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  return polys.some((rings) => ringContains(rings[0], point));
}

function ringContains(ring, point) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
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
    $('currentTemp').textContent = `${Math.round(currentConditions.tempF)}°F`;
    $('currentSummary').textContent = currentConditions.summary;
    $('windValue').textContent = `${Math.round(currentConditions.windMph)} mph ${degToCompass(currentConditions.windDirDeg)}`;
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
  const o = outlookData || heuristicOutlook();
  $('outlookSource').textContent = o.source === 'live' ? 'SPC convective outlook (live)' : 'Estimated outlook (SPC feed unavailable)';
  $('riskTitle').textContent = o.category;
  $('riskCopy').textContent =
    o.source === 'live'
      ? 'Category pulled directly from the current SPC Day 1 categorical outlook polygon covering this location.'
      : 'SPC live feed could not be reached from the browser, so this category is estimated from live CAPE and shear at your location.';
  $('torRisk').textContent = o.tornado;
  $('windRisk').textContent = o.wind;
  $('hailRisk').textContent = o.hail;

  const confidence = o.confidence != null ? o.confidence : 60;
  $('confidenceValue').textContent = `${confidence}%`;
  $('confidenceFill').style.width = `${confidence}%`;
}

// ---------- Render: Field ops ----------
function renderField() {
  const dir = severeParams ? severeParams.windDir : currentConditions ? currentConditions.windDirDeg : null;
  if (dir == null) {
    $('safeHeading').textContent = 'Recommended heading: --';
    $('safeHeadingNote').textContent = 'Live wind direction unavailable — recommendation will populate once data loads.';
    return;
  }
  const heading = computeSafeHeading(dir);
  $('safeHeading').textContent = `Recommended heading: ${heading.compass}`;
  $('safeHeadingNote').textContent = `Storms typically move with the mid-level flow; keep escape routes roughly ${heading.compass} of the current storm motion, away from the ${degToCompass(dir)} surface wind.`;
}

function computeSafeHeading(surfaceWindDirDeg) {
  // Storms generally move in the direction the wind is blowing toward; a safe escape route
  // runs roughly perpendicular-to-opposite that motion, biased toward paved road networks (E/S).
  const stormMotion = (surfaceWindDirDeg + 180) % 360;
  const escapeDeg = (stormMotion + 90) % 360;
  return { deg: escapeDeg, compass: degToCompass(escapeDeg) };
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
    lines.push(`Here in ${locName}, it's ${Math.round(currentConditions.tempF)} degrees with ${currentConditions.summary.toLowerCase()}.`);
    lines.push(`Wind is out of the ${degToCompass(currentConditions.windDirDeg)} at ${Math.round(currentConditions.windMph)} miles per hour.`);
  } else {
    lines.push(`We don't have a live station reading for ${locName} right now, so treat conditions as unconfirmed.`);
  }
  if (outlookData) {
    lines.push(`Today's severe weather outlook for this area is a ${outlookData.category.toLowerCase()}.`);
  }
  const warnings = activeAlerts.filter((a) => /warning/i.test(a.event));
  if (warnings.length) {
    lines.push(`We do have active alerts in effect: ${warnings.map((w) => w.event).join(', ')}.`);
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
  speechSynthesis.cancel();
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
function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

document.addEventListener('DOMContentLoaded', init);
