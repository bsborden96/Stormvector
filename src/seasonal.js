/* StormVector seasonal planning. Model guidance never replaces NWS alerts.
   Snowfall is converted using the units supplied by Open-Meteo. */
const Seasonal = (() => {
  const destinations = {
    north: { name: 'Eagle River, WI', lat: 45.9172, lon: -89.2443 },
    shore: { name: 'Fish Creek, WI', lat: 45.1275, lon: -87.2465 },
    south: { name: 'Waupun, WI', lat: 43.6333, lon: -88.7296 },
  };
  const dailyFields = ['weather_code', 'temperature_2m_max', 'temperature_2m_min',
    'apparent_temperature_min', 'precipitation_probability_max', 'precipitation_sum',
    'snowfall_sum', 'wind_gusts_10m_max'];
  const number = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null;
  const at = (daily, key, i) => number(daily[key]?.[i]);
  function parseForecast(data) {
    if (!Array.isArray(data.daily?.time) || !data.daily.time.length) throw new Error('Missing daily forecast');
    // Refuse unknown units rather than presenting wrong snow or temperature amounts.
    const units = data.daily_units || {};
    if (!['cm', 'inch'].includes(units.snowfall_sum) || units.temperature_2m_max !== '°F' ||
        units.temperature_2m_min !== '°F' || units.apparent_temperature_min !== '°F' ||
        units.wind_gusts_10m_max !== 'mp/h' || units.precipitation_sum !== 'inch') {
      throw new Error('Unexpected forecast units');
    }
    const days = data.daily.time.slice(0, 7).map((date, i) => ({
      date, code: at(data.daily, 'weather_code', i), high: at(data.daily, 'temperature_2m_max', i),
      low: at(data.daily, 'temperature_2m_min', i), feels: at(data.daily, 'apparent_temperature_min', i),
      rainChance: at(data.daily, 'precipitation_probability_max', i),
      precip: at(data.daily, 'precipitation_sum', i),
      snow: at(data.daily, 'snowfall_sum', i) == null ? null : at(data.daily, 'snowfall_sum', i) / (units.snowfall_sum === 'cm' ? 2.54 : 1),
      gust: at(data.daily, 'wind_gusts_10m_max', i),
    }));
    if (days.some(d => !/^\d{4}-\d{2}-\d{2}$/.test(d.date))) throw new Error('Invalid forecast date');
    return { days, timezone: data.timezone || 'Location time', retrievedAt: new Date().toISOString() };
  }
  async function load(target, fetchJson) {
    const params = new URLSearchParams({latitude: target.lat, longitude: target.lon,
      daily: dailyFields.join(','), temperature_unit: 'fahrenheit', wind_speed_unit: 'mph',
      precipitation_unit: 'inch', timezone: 'auto', forecast_days: 7});
    return parseForecast(await fetchJson(`https://api.open-meteo.com/v1/forecast?${params}`));
  }
  function weather(code) {
    if (code === 0) return ['☀', 'Clear sky'];
    if ([1, 2].includes(code)) return ['◐', 'Partly cloudy'];
    if (code === 3) return ['☁', 'Overcast'];
    if ([45, 48].includes(code)) return ['≋', 'Fog'];
    if ([56, 57, 66, 67].includes(code)) return ['◇', 'Freezing precipitation'];
    if ([71, 73, 75, 77, 85, 86].includes(code)) return ['❄', 'Snow'];
    if ([95, 96, 97, 99].includes(code)) return ['ϟ', 'Thunderstorms'];
    if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return ['☂', 'Rain / showers'];
    return ['—', 'Weather unavailable'];
  }
  function outdoor(day) {
    if ([day.high, day.low, day.rainChance, day.gust, day.code].some(v => v == null) || weather(day.code)[1] === 'Weather unavailable') return 'Incomplete guidance';
    if ([95, 96, 97, 99].includes(day.code)) return 'Thunderstorm potential';
    if ([56, 57, 66, 67, 71, 73, 75, 77, 85, 86].includes(day.code) || (day.snow != null && day.snow >= 0.1)) return 'Winter weather potential';
    if (day.rainChance >= 60) return 'Have an indoor backup';
    if (day.gust >= 30) return 'Windy for an outing';
    if (day.high < 40 || day.high > 90) return 'Plan for the temperature';
    if (day.rainChance <= 25 && day.gust < 20 && day.high >= 50 && day.high <= 80) return 'Promising outdoor day';
    return 'Check timing before heading out';
  }
  function winterNote(day) {
    const notes = [];
    if ([56, 57, 66, 67].includes(day.code)) notes.push('Freezing precipitation signal; check NWS');
    if (day.snow != null && day.snow >= 0.1) notes.push('Snow in model guidance');
    if (day.feels != null && day.feels <= 0) notes.push('Very cold feels-like temperature');
    else if (day.low != null && day.low <= 32) notes.push('Freezing low temperature');
    if (day.gust != null && day.gust >= 30) notes.push('Strong gusts');
    if (notes.length) return notes.join(' · ');
    return [day.snow, day.low, day.feels, day.gust, day.code].some(v => v == null)
      ? 'Incomplete winter guidance' : 'No listed winter signal in daily model guidance';
  }
  function winterAlert(feature) {
    return /winter|snow|blizzard|ice storm|freez|frost|cold|wind chill/i.test(feature.properties?.event || '');
  }
  function fallContext(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Choose a date for seasonal context.';
    const [, month, day] = date.split('-').map(Number);
    if (month < 9 || (month === 9 && day < 15)) return 'Ahead of the usual Wisconsin color season. Check current reports for early changes.';
    if (month <= 10) return 'Within Wisconsin’s usual fall color season. Color generally develops north to south; current reports tell you what is happening now.';
    return 'Beyond the usual Wisconsin color season. Some late color may remain; confirm with a current local report.';
  }
  function dateLabel(date, long = false) {
    // Calendar dates belong to the forecast location; avoid conversion to the browser's timezone.
    return new Date(`${date}T12:00:00Z`).toLocaleDateString([], { timeZone: 'UTC', weekday: long ? 'long' : 'short', month: 'short', day: 'numeric' });
  }
  const fmt = (v, suffix = '', digits = 0) => v == null ? 'Unavailable' : `${v.toFixed(digits)}${suffix}`;
  function element(tag, text, cls) {
    const el = document.createElement(tag);
    if (text != null) el.textContent = text;
    if (cls) el.className = cls;
    return el;
  }
  let selectedDay = 0;
  let latest = null;
  function renderDetail() {
    const target = document.getElementById('forecastDetail');
    target.replaceChildren();
    if (!latest) return;
    const d = latest.days[selectedDay];
    target.append(element('p', dateLabel(d.date, true), 'eyebrow'), element('h3', weather(d.code)[1]),
      element('p', `${fmt(d.high, '°F')} high · ${fmt(d.low, '°F')} low · ${fmt(d.rainChance, '%')} chance of precipitation · Gusts ${fmt(d.gust, ' mph')}`),
      element('p', outdoor(d), 'planning-note'),
      element('p', 'This planning note does not account for every hazard. Check official alerts before heading out.', 'source-note'));
    document.querySelectorAll('[data-forecast-day]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.forecastDay) === selectedDay)));
  }
  function render(data, place, status = 'current') {
    latest = data;
    selectedDay = 0;
    const byId = id => document.getElementById(id);
    const source = data ? `Open-Meteo model guidance · ${place.name} · ${data.timezone} · Retrieved ${new Date(data.retrievedAt).toLocaleString()}`
      : status === 'loading' ? 'Loading forecast for this location…' : 'Forecast unavailable. Use the official NWS forecast and try refreshing.';
    byId('forecastStatus').textContent = source;
    byId('winterStatus').textContent = source;
    byId('forecastDays').replaceChildren();
    byId('winterRows').replaceChildren();
    byId('winterMetrics').replaceChildren();
    byId('forecastDetail').replaceChildren();
    byId('fallBestDay').textContent = data ? 'Look for a weather window' : status === 'loading' ? 'Checking your outdoor window…' : 'Outdoor guidance unavailable';
    byId('fallWeatherAdvice').textContent = 'Use current foliage reports for the leaves. Use the local forecast for rain, temperature, and wind.';
    if (!data) return;
    const promising = data.days.find(d => outdoor(d) === 'Promising outdoor day');
    byId('fallBestDay').textContent = promising ? `${dateLabel(promising.date, true)} looks promising` : 'Check the daily details before you go';
    byId('fallWeatherAdvice').textContent = promising
      ? `${fmt(promising.high, '°F')} high · ${fmt(promising.rainChance, '%')} precipitation chance · Gusts ${fmt(promising.gust, ' mph')}. This is weather guidance, not a foliage report or an all-clear.`
      : 'No day meets our simple dry, mild, light-wind criteria. There may still be good windows; check the official forecast for timing.';
    data.days.forEach((d, i) => {
      const button = element('button', null, 'forecast-day');
      button.dataset.forecastDay = i;
      button.setAttribute('aria-pressed', String(i === 0));
      button.append(element('span', dateLabel(d.date)), element('span', weather(d.code)[0], 'weather-symbol'),
        element('strong', fmt(d.high, '°')), element('small', `${fmt(d.low, '°')} low`), element('small', `${fmt(d.rainChance, '%')} precip.`));
      button.addEventListener('click', () => { selectedDay = i; renderDetail(); });
      byId('forecastDays').append(button);
      const row = element('tr');
      const label = element('th', dateLabel(d.date)); label.scope = 'row'; row.append(label);
      [fmt(d.snow, ' in', 1), `${fmt(d.low, '°F')} / ${fmt(d.feels, '°F')}`, fmt(d.gust, ' mph'), winterNote(d)].forEach(t => row.append(element('td', t)));
      byId('winterRows').append(row);
    });
    const snow = data.days.slice(0, 3).map(d => d.snow);
    const lows = data.days.map(d => d.low);
    const feels = data.days.map(d => d.feels);
    const metric = (label, value, note) => {
      const card = element('article'); card.append(element('span', label), element('strong', value), element('small', note)); byId('winterMetrics').append(card);
    };
    metric('Snow / first 3 forecast days', snow.length === 3 && snow.every(v => v != null) ? fmt(snow.reduce((a, b) => a + b, 0), ' in', 1) : 'Unavailable', 'Includes the full first day, including hours already passed.');
    metric('Lowest air temperature / 7 days', lows.every(v => v != null) ? fmt(Math.min(...lows), '°F') : 'Unavailable', 'Daily model minimum at this location.');
    metric('Lowest feels-like / 7 days', feels.every(v => v != null) ? fmt(Math.min(...feels), '°F') : 'Unavailable', 'Apparent temperature; not always wind chill.');
    renderDetail();
  }
  function renderAlerts(alerts, status, checkedAt) {
    const list = document.getElementById('winterAlerts');
    list.replaceChildren();
    const winter = alerts.filter(winterAlert);
    document.getElementById('winterAlertStatus').textContent = status === 'loading' ? 'Checking NWS alerts…'
      : status === 'unavailable' ? 'NWS alert refresh unavailable. Previously loaded alerts may be stale; check NWS.'
      : `${winter.length} active winter / cold alert${winter.length === 1 ? '' : 's'} at your selected location. Checked ${new Date(checkedAt).toLocaleString()}.`;
    winter.forEach(a => {
      const p = a.properties || {};
      const card = element('article', null, 'briefing-alert');
      card.append(element('strong', p.event), element('p', p.headline || p.description || 'See NWS for details.'),
        element('small', p.expires ? `Expires ${new Date(p.expires).toLocaleString()}` : 'See NWS for valid time'));
      if (p.instruction) card.append(element('p', p.instruction));
      const link = element('a', 'Official NWS alerts ↗'); link.href = 'https://www.weather.gov/alerts'; link.target = '_blank'; link.rel = 'noopener noreferrer'; card.append(link);
      list.append(card);
    });
  }
  function init(onDestination) {
    const dateInput = document.getElementById('fallDate');
    const now = new Date();
    dateInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const updateDate = () => { document.getElementById('fallSeasonNote').textContent = fallContext(dateInput.value); };
    dateInput.addEventListener('change', updateDate); updateDate();
    document.querySelectorAll('[data-destination]').forEach(b => b.addEventListener('click', () => onDestination({...destinations[b.dataset.destination]})));
    document.querySelectorAll('[data-spc-day]').forEach(b => b.addEventListener('click', () => {
      const day = b.dataset.spcDay;
      document.querySelectorAll('[data-spc-day]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      const img = document.getElementById('spcMap'); img.src = `https://www.spc.noaa.gov/products/outlook/day${day}otlk.gif`; img.alt = `SPC Day ${day} national categorical outlook`;
      document.getElementById('spcMapLink').href = `https://www.spc.noaa.gov/products/outlook/day${day}otlk.html`;
      document.getElementById('spcMapCaption').textContent = `Day ${day} national categorical outlook. The local category above remains Day 1.`;
      document.getElementById('spcImageStatus').textContent = 'Loading official SPC map…';
    }));
    const img = document.getElementById('spcMap');
    img.addEventListener('error', () => { document.getElementById('spcImageStatus').textContent = 'Map image unavailable. Open the official SPC outlook using the map link.'; });
    img.addEventListener('load', () => { document.getElementById('spcImageStatus').textContent = 'Open the map for the official outlook, valid time, and discussion.'; });
  }
  return { load, parseForecast, weather, outdoor, winterNote, winterAlert, fallContext, dateLabel, render, renderAlerts, init };
})();
if (typeof module !== 'undefined') module.exports = Seasonal;
