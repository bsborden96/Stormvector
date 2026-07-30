const cities = [
  ['Norman, OK',35.2226,-97.4395],['Oklahoma City, OK',35.4676,-97.5164],['Tulsa, OK',36.154,-95.9928],['Dallas, TX',32.7767,-96.797],['Houston, TX',29.7604,-95.3698],['Austin, TX',30.2672,-97.7431],['Kansas City, MO',39.0997,-94.5786],['Wichita, KS',37.6872,-97.3301],['Denver, CO',39.7392,-104.9903],['Chicago, IL',41.8781,-87.6298],['Atlanta, GA',33.749,-84.388],['Miami, FL',25.7617,-80.1918],['New York, NY',40.7128,-74.006],['Los Angeles, CA',34.0522,-118.2437],['Seattle, WA',47.6062,-122.3321],['Phoenix, AZ',33.4484,-112.074],['Minneapolis, MN',44.9778,-93.265],['Little Rock, AR',34.7465,-92.2896],['Birmingham, AL',33.5186,-86.8104],['Nashville, TN',36.1627,-86.7816]
];
const facts = ['A supercell can persist for hours when wind shear keeps the updraft separated from rain-cooled air.','CAPE estimates buoyant energy; high CAPE alone does not guarantee severe storms without lift and shear.','A hook echo can indicate rotation, but warnings rely on multiple radar and environmental clues.','The safest tornado shelter is a basement or small interior room on the lowest floor.'];
const producerStyles = ['calm studio read','urgent field update','plain-language explainer','late-night weather radio tone'];
const $ = (id) => document.getElementById(id);
let place = { name: 'Norman, OK', lat: 35.2226, lon: -97.4395 };
let weather = { temp: '--', wind: '--', humidity: '--', pressure: '--', summary: 'Live conditions unavailable.' };

function init() {
  $('citySuggestions').innerHTML = cities.map(([name]) => `<option value="${name}"></option>`).join('');
  document.querySelectorAll('[data-page-link]').forEach((link) => link.addEventListener('click', route));
  window.addEventListener('hashchange', route);
  $('useSearch').addEventListener('click', searchLocation);
  $('useGps').addEventListener('click', useGps);
  $('chaserToggle').addEventListener('click', toggleChaser);
  $('startBroadcast').addEventListener('click', broadcast);
  $('testFact').addEventListener('click', () => logLine(random(facts)));
  $('testSevere').addEventListener('click', severeInterrupt);
  route();
  updateLocation(place);
  useGps(false);
}

function route() {
  const page = (location.hash || '#conditions').slice(1);
  document.querySelectorAll('.page').forEach((section) => section.classList.toggle('active', section.id === page));
  document.querySelectorAll('[data-page-link]').forEach((link) => link.classList.toggle('active', link.dataset.pageLink === page));
}

function searchLocation() {
  const query = $('locationSearch').value.trim().toLowerCase();
  const match = cities.find(([name]) => name.toLowerCase() === query || name.toLowerCase().startsWith(query));
  if (match) updateLocation({ name: match[0], lat: match[1], lon: match[2] });
}

function useGps(showErrors = true) {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => updateLocation({ name: 'Your GPS location', lat: pos.coords.latitude, lon: pos.coords.longitude }),
    () => showErrors && logLine('GPS was not available, so Storm Vector is using the searched city.')
  );
}

async function updateLocation(nextPlace) {
  place = nextPlace;
  $('locationTitle').textContent = place.name;
  $('locationMeta').textContent = `${place.lat.toFixed(3)}, ${place.lon.toFixed(3)} • synchronized across all pages`;
  await fetchWeather();
  renderWeather();
}

async function fetchWeather() {
  try {
    const point = await fetch(`https://api.weather.gov/points/${place.lat},${place.lon}`).then((r) => r.json());
    const stationUrl = point.properties.observationStations;
    const stations = await fetch(stationUrl).then((r) => r.json());
    const obs = await fetch(`${stations.features[0].id}/observations/latest`).then((r) => r.json());
    const p = obs.properties;
    weather = {
      temp: cToF(p.temperature.value),
      wind: msToMph(p.windSpeed.value),
      humidity: p.relativeHumidity.value ? `${Math.round(p.relativeHumidity.value)}%` : '--',
      pressure: p.barometricPressure.value ? `${Math.round(p.barometricPressure.value / 100)} mb` : '--',
      summary: p.textDescription || 'Current observation received.'
    };
  } catch {
    weather = { temp: '72', wind: '14 mph', humidity: '68%', pressure: '1012 mb', summary: 'Demo conditions shown while live weather loads.' };
  }
}

function renderWeather() {
  $('currentTemp').textContent = `${weather.temp}°`;
  $('currentSummary').textContent = weather.summary;
  $('windValue').textContent = weather.wind;
  $('humidityValue').textContent = weather.humidity;
  $('pressureValue').textContent = weather.pressure;
  const confidence = Math.min(94, 48 + parseInt(weather.humidity, 10) / 2 || 62);
  $('confidenceFill').style.width = `${confidence}%`;
  $('confidenceValue').textContent = `${Math.round(confidence)}%`;
  const severe = parseInt(weather.wind, 10) > 25 || /storm|thunder|hail|tornado/i.test(weather.summary);
  $('riskTitle').textContent = severe ? 'Enhanced Risk Signal' : 'General Thunder Risk';
  $('riskCopy').textContent = severe ? 'Local observations suggest elevated severe-weather attention.' : 'No strong severe signal in the latest observation.';
  $('torRisk').textContent = severe ? 'Monitor' : 'Low';
  $('windRisk').textContent = severe ? 'High' : 'Medium';
  $('hailRisk').textContent = severe ? 'Medium' : 'Low';
}

function toggleChaser() {
  const on = $('chaserGrid').classList.toggle('hidden') === false;
  $('chaserToggle').setAttribute('aria-pressed', String(on));
  $('chaserToggle').textContent = on ? 'Disable Storm Chaser Mode' : 'Enable Storm Chaser Mode';
}

function broadcast() {
  const style = random(producerStyles);
  logLine(`Producer cue: ${style}. Good day from Storm Vector in ${place.name}. Current conditions are ${weather.summary}, ${weather.temp} degrees, wind ${weather.wind}, humidity ${weather.humidity}.`);
  logLine(random(facts));
}

function severeInterrupt() {
  playEasTone();
  logLine(`SEVERE WEATHER INTERRUPT for ${place.name}: Move indoors, keep alerts enabled, and avoid flooded roads. This alert overrides the current broadcast.`, true);
  setTimeout(playEasTone, 1700);
}

function playEasTone() {
  const ctx = new AudioContext();
  [853, 960].forEach((freq) => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.frequency.value = freq;
    gain.gain.value = 0.045;
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 1.2);
  });
}

function logLine(text, alert = false) {
  const p = document.createElement('p');
  p.className = alert ? 'alert' : '';
  p.textContent = text;
  $('broadcastLog').prepend(p);
}

function random(items) { return items[Math.floor(Math.random() * items.length)]; }
function cToF(c) { return Number.isFinite(c) ? Math.round((c * 9) / 5 + 32) : '--'; }
function msToMph(ms) { return Number.isFinite(ms) ? `${Math.round(ms * 2.237)} mph` : '--'; }

init();
