/* StormVector Nature Guide — static, buildless, no weather bot or speech engine. */
const $ = id => document.getElementById(id);
const forecastCache = Nature.makeCache();
let view = 'explore';
let origin = {name:'Waupun, WI',lat:43.6333,lon:-88.7296};
let selected = null;
let selectedVersion = 0;
let originVersion = 0;
let selectedForecast = null;
let selectedAlerts = null;
let saved = new Set();
let reportSnapshot = null;
let aurora = null;
let kpRows = [];
let spaceVersion = 0;
let spaceFetchedAt = null;
let map = null;
let markers = null;
let overlay = null;
let visible = [];
let pendingCompare = false;
const regionNames = {WI:'Wisconsin',MN:'Minnesota',UP:'Upper Peninsula',MI:'Michigan · Lower Peninsula'};
const themes = {
  explore:['EXPLORE / THE GREAT LAKES','A little farther. A little wilder.','Find your','next outside.','Follow the color. Watch the northern sky. Find a quiet trail. Explore the Great Lakes with the conditions in view.'],
  fall:['FALL / FOLLOW THE COLOR','A season worth taking the long way.','Follow the','changing color.','Wooded trails, scenic overlooks, and current Wisconsin color reports. The seasons do not stop at the state line.'],
  aurora:['NORTHERN LIGHTS / LOOK UP','A northern horizon. A little patience.','Meet the','northern sky.','Bring space weather, nighttime clouds, and a northern destination together. Conditions matter more than a promise.'],
  winter:['WINTER / OUTSIDE IN THE QUIET','Find the quieter side of winter.','Explore the','winter north.','Snowy forests, lakeshore scenery, and winter outings. Check snow guidance and access before setting out.'],
  weather:['LOCAL WEATHER / YOUR AREA','The conditions, before you go.','Know your','local sky.','See the forecast, daylight, and official alerts for your starting area, then plan an outing nearby.'],
  saved:['YOUR SHORTLIST / SAVED HERE','Your next stops, all together.','Keep your','next adventure.','Save the places you want to come back to. Your shortlist stays in this browser.'],
};
function el(tag,text,cls) {
  const node=document.createElement(tag);
  if(text!=null)node.textContent=text;
  if(cls)node.className=cls;
  return node;
}
const fmt=(v,suffix='',digits=0)=>v==null?'Unavailable':`${v.toFixed(digits)}${suffix}`;
const dayLabel=d=>new Date(`${d}T12:00:00Z`).toLocaleDateString([],{timeZone:'UTC',weekday:'short',month:'short',day:'numeric'});
const timeLabel=t=>new Date(t).toLocaleString([],{dateStyle:'medium',timeStyle:'short'});
function button(text,handler,cls='quiet') {const b=el('button',text,cls);b.type='button';b.addEventListener('click',handler);return b;}
function link(text,url) {const a=el('a',text);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;}
function readStorage(key,fallback) {try{return JSON.parse(localStorage.getItem(`stormvector:nature:${key}`))??fallback;}catch{return fallback;}}
function writeStorage(key,data) {try{localStorage.setItem(`stormvector:nature:${key}`,JSON.stringify(data));return true;}catch{return false;}}
async function fetchJson(url) {
  const r=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw Error(`Feed unavailable (${r.status})`);
  return r.json();
}
function forecastKey(p) {return `${p.lat},${p.lon}`;}
function getForecast(p) {return forecastCache.get(forecastKey(p),async()=>Nature.parseForecast(await fetchJson(Nature.forecastUrl(p))));}
function selectedDate() {return $('tripDate').value;}
function today() {return Nature.dateInZone(Date.now(),'America/Chicago');}
function init() {
  const storedOrigin=readStorage('origin',null);
  if(storedOrigin&&typeof storedOrigin.name==='string'&&Number.isFinite(storedOrigin.lat)&&Number.isFinite(storedOrigin.lon))origin=storedOrigin;
  const savedIds=readStorage('saved',[]);
  saved=new Set(Array.isArray(savedIds)?savedIds.filter(id=>DESTINATIONS.some(d=>d.id===id)):[]);
  setDateRange();
  $('savedCount').textContent=saved.size;
  ['regionFilter','interestFilter','radiusFilter','tripDate'].forEach(id=>$(id).addEventListener('change',()=>{renderResults();renderDestination();}));
  $('placeSearch').addEventListener('input',renderResults);
  $('reportSearch').addEventListener('input',renderReports);
  $('originForm').addEventListener('submit',setOriginFromSearch);
  $('nearMe').addEventListener('click',useGps);
  $('compareWeather').addEventListener('click',compareVisible);
  $('refreshData').addEventListener('click',refreshData);
  $('fitMap').addEventListener('click',fitMap);
  window.addEventListener('hashchange',route);
  initMap();
  route();
  loadReports();loadSpaceWeather();
  // Refresh NOAA while visible; forecast cache expires after 30 minutes. Never depend on background timers for warnings.
  setInterval(()=>{if(!document.hidden)loadSpaceWeather();},10*60000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){setDateRange();loadSpaceWeather();if(selected)selectDestination(selected);}});
}
function setDateRange() {
  const first=today(),last=new Date(`${first}T12:00:00Z`);last.setUTCDate(last.getUTCDate()+6);
  $('tripDate').min=first;$('tripDate').max=last.toISOString().slice(0,10);
  if(!$('tripDate').value||$('tripDate').value<first||$('tripDate').value>$('tripDate').max)$('tripDate').value=first;
}
function route() {
  const requested=location.hash.slice(1);
  if(requested==='guide'){document.getElementById('guide').scrollIntoView({behavior:'smooth'});return;}
  view=themes[requested]?requested:'explore';
  document.body.dataset.view=view;
  document.querySelectorAll('[data-view]').forEach(a=>{a.classList.toggle('active',a.dataset.view===view);if(a.dataset.view===view)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  const t=themes[view];$('viewEyebrow').textContent=t[0];$('viewTitle').textContent=t[1];
  $('heroTitle').replaceChildren(el('span',t[2]),el('br'),el('span',t[3],'accent'));
  $('heroCopy').textContent=t[4];
  $('interestFilter').value=['fall','aurora','winter'].includes(view)?view:'all';
  $('reportsPanel').hidden=view!=='fall';$('auroraPanel').hidden=view!=='aurora';
  $('mapModeLabel').textContent=view==='fall'?'Destinations + reported foliage':view==='aurora'?'Destinations + short-term aurora grid':'Destination map';
  renderContext();renderResults();renderReports();renderKp();
  if(view==='weather')selectDestination({...origin,id:'local',region:'LOCAL',tags:[],summary:'Your starting area. Use its forecast to plan an outing nearby.',access:'Weather at this point does not establish road, trail, or park conditions.'});
  else if(!selected||selected.id==='local'||!visible.some(p=>p.id===selected.id)){if(visible[0])selectDestination(visible[0]);else{selected=null;selectedVersion++;renderDestination();}}
  if(map)requestAnimationFrame(()=>map.invalidateSize());
}
function filters() {return {region:$('regionFilter').value,interest:$('interestFilter').value,query:$('placeSearch').value,
  radius:$('radiusFilter').value==='all'?Infinity:Number($('radiusFilter').value),origin,saved:view==='saved'?saved:null};}
function renderResults() {
  visible=Nature.filterPlaces(DESTINATIONS,filters());
  $('originLabel').textContent=`Starting near ${origin.name}`;
  $('resultsStatus').textContent=`${visible.length} place${visible.length===1?'':'s'} · closest first · ${dayLabel(selectedDate())}`;
  $('resultsTitle').textContent=view==='saved'?'Your saved places':'Places worth exploring';
  const grid=$('destinationGrid');grid.replaceChildren();
  if(!visible.length){grid.append(el('p',view==='saved'?'No saved places match these filters. Save a destination with the bookmark button.':'No places match these filters. Try a larger radius or another experience.','empty-state'));}
  visible.forEach(p=>{
    const card=el('article',null,`place-card ${selected?.id===p.id?'selected':''}`);
    const scene=el('div',null,`place-scene scene-${p.scene}`);scene.setAttribute('aria-hidden','true');scene.append(el('span',regionNames[p.region],'scene-region'));card.append(scene);
    const content=el('div',null,'place-content');content.append(el('p',`${regionNames[p.region]} · ${Math.round(p.distance)} mi straight-line`,'eyebrow'),el('h3',p.name),el('p',p.summary,'place-summary'));
    const tags=el('div',null,'tags');p.tags.slice(0,3).forEach(t=>tags.append(el('span',t)));content.append(tags);
    const report=Nature.nearestReport(p,reportSnapshot);
    if(report)content.append(el('p',`${fmt(report.percent,'%')} reported color${report.status==='recent'?'':' · older / unverified report'}`,'color-note'));
    const forecast=forecastCache.peek(forecastKey(p)),day=forecast?.days.find(d=>d.date===selectedDate());
    content.append(el('p',day?`${Nature.weather(day.code)[0]} ${fmt(day.high,'°F')} · ${fmt(day.rainChance,'%')} precip.${view==='winter'?` · ${fmt(day.snow,' in snow',1)}`:''}`:'Select to load destination weather','card-weather'));
    if(day)content.append(el('small',`${Nature.outingNote(day)} · Loaded ${timeLabel(forecast.retrievedAt)}`,'fineprint'));
    const actions=el('div',null,'card-actions');actions.append(button('Explore conditions ↗',()=>{selectDestination(p);$('destinationPanel').scrollIntoView({behavior:'smooth',block:'nearest'});},'primary-link'));
    const save=button(saved.has(p.id)?'★ Saved':'☆ Save',()=>toggleSave(p.id));save.setAttribute('aria-pressed',String(saved.has(p.id)));save.setAttribute('aria-label',`${saved.has(p.id)?'Unsave':'Save'} ${p.name}`);actions.append(save);content.append(actions);card.append(content);grid.append(card);
  });
  renderMap();
}
function toggleSave(id) {
  if(saved.has(id))saved.delete(id);else saved.add(id);
  const ok=writeStorage('saved',[...saved]);$('savedCount').textContent=saved.size;
  renderResults();renderDestination();
  if(!ok)$('resultsStatus').textContent='Saved for this session. Browser storage is unavailable.';
}
function renderContext() {
  const panel=$('contextPanel');panel.replaceChildren();
  const copy={
    explore:['Explore the place. Understand the conditions.','Use interests, radius, and a date to make a shortlist. Destination cards open local weather and nature details here.'],
    fall:['Reported color, not a guessed percentage.','Wisconsin observations appear on the map and in the report table below. Destination labels refer to nearby reports in the same county, not a tree-by-tree park survey. Minnesota and Michigan current foliage feeds are not connected yet.'],
    aurora:['A place to look north is only part of the story.','The purple markers are northern-sky destinations, not verified dark-sky sites or confirmed night access. Combine NOAA guidance with each place’s nighttime cloud forecast. The short-term aurora oval does not predict an entire evening.'],
    winter:['Snow in the forecast is a starting point.','Use destination snow guidance and cold-weather alerts to plan. Fresh snow, frozen waterfalls, open trails, and safe ice are different conditions; weather alone cannot confirm them.'],
    weather:['Your area, in one view.','Set a city above for local weather. Then explore nearby destinations without leaving StormVector.'],
    saved:['A shortlist that travels with your browser.','Saved places stay on this device. Filters still apply, so you can narrow down your next outing.'],
  }[view];
  panel.append(el('strong',copy[0]),el('p',copy[1]));
}
async function selectDestination(place) {
  const version=++selectedVersion;
  selected=place;selectedForecast=null;selectedAlerts=null;
  renderDestination();renderResults();
  const current=()=>version===selectedVersion;
  await Promise.allSettled([
    (async()=>{try{const forecast=await getForecast(place);if(!current())return;selectedForecast=forecast;}catch{if(!current())return;selectedForecast=false;}if(current()){renderDestination();renderResults();}})(),
    (async()=>{try{const data=await fetchJson(`https://api.weather.gov/alerts/active?point=${place.lat},${place.lon}`);if(!Array.isArray(data.features))throw Error('Invalid alert feed');if(!current())return;selectedAlerts={items:data.features,checkedAt:Date.now()};}catch{if(!current())return;selectedAlerts=false;}if(current())renderDestination();})(),
  ]);
}
function renderDestination() {
  const panel=$('destinationPanel');panel.replaceChildren();
  if(!selected){panel.append(el('h3','Choose your next stop'),el('p','Select a place from the map or destination list.'));return;}
  const p=selected,forecast=selectedForecast;
  panel.append(el('p',p.region==='LOCAL'?'YOUR AREA':regionNames[p.region],'eyebrow'),el('h2',p.name),el('p',p.summary,'destination-summary'));
  if(p.id!=='local'){const save=button(saved.has(p.id)?'★ Saved to your shortlist':'☆ Save this place',()=>toggleSave(p.id));save.setAttribute('aria-pressed',String(saved.has(p.id)));panel.append(save);}
  if(p.visit)panel.append(el('p',p.visit));
  const report=Nature.nearestReport(p,reportSnapshot);
  if(view==='fall'){
    const color=el('div',null,'detail-block');color.append(el('h3','Nearby fall color report'));
    if(report){color.append(el('strong',`${fmt(report.percent,'%')} reported color`),el('p',`${report.name} · ${report.county} County · ${Math.round(report.distance)} mi from this map point`),
      el('p',`Reporter updated ${timeLabel(report.reportedAt)}${report.status==='recent'?'':' · Older or unverified; check the report date.'}`,'fineprint'),el('p',report.peak?`Reporter’s estimated peak: ${report.peak}`:'Peak timing unavailable'));
    }else color.append(el('p','Current foliage observations are not connected for this destination. No color percentage is estimated from weather.'));
    panel.append(color);
  }
  const day=forecast&&forecast.days.find(d=>d.date===selectedDate());
  const weather=el('section',null,'detail-block');weather.append(el('h3',`${dayLabel(selectedDate())} · Destination weather`));
  if(forecast===null)weather.append(el('p','Loading destination forecast…','loading'));
  else if(forecast===false)weather.append(el('p','Forecast unavailable. Try Refresh data.','feed-error'));
  else if(!day)weather.append(el('p','This date is outside the loaded forecast. Choose a date in the next seven days.'));
  else{
    weather.append(el('div',`${Nature.weather(day.code)[0]} ${Nature.weather(day.code)[1]}`,'weather-title'));
    const metrics=el('div',null,'detail-metrics');
    [['High / low',`${fmt(day.high,'°')} / ${fmt(day.low,'°')}`],['Precip. chance',fmt(day.rainChance,'%')],['Wind gusts',fmt(day.gust,' mph')],['Forecast snow',fmt(day.snow,' in',1)]].forEach(([label,text])=>{const n=el('div');n.append(el('small',label),el('strong',text));metrics.append(n);});weather.append(metrics);
    weather.append(el('p',Nature.outingNote(day),'planning-note'));
    const daylight=el('div',null,'daylight');daylight.append(el('span',`Sunrise ${Nature.daylightLabel(day.sunrise,forecast.timezone)}`),el('span',`Sunset ${Nature.daylightLabel(day.sunset,forecast.timezone)}`));weather.append(daylight);
    weather.append(el('p',`Open-Meteo · ${forecast.timezone} · Loaded ${timeLabel(forecast.retrievedAt)}. Daily snowfall includes the full day; it is not snow depth. Daily extremes can occur at different times.`,'fineprint'));
    const week=el('div',null,'week-strip');forecast.days.forEach(d=>{const b=button(`${dayLabel(d.date)}\n${fmt(d.high,'°')} / ${fmt(d.low,'°')}`,()=>{$('tripDate').value=d.date;renderDestination();renderResults();},'week-day');b.setAttribute('aria-pressed',String(d.date===selectedDate()));week.append(b);});weather.append(week);
  }
  panel.append(weather);
  if(view==='aurora')renderNightPanel(panel,p,forecast);
  const safety=el('section',null,'detail-block safety-block');safety.append(el('h3','Official alerts at this point'));
  if(selectedAlerts===null)safety.append(el('p','Checking NWS…','loading'));
  else if(selectedAlerts===false)safety.append(el('p','NWS alerts unavailable here. This is not an all-clear.','feed-error'));
  else{
    const expired=Date.now()-selectedAlerts.checkedAt>10*60000;
    safety.append(el('p',`${selectedAlerts.items.length} alert${selectedAlerts.items.length===1?'':'s'} returned · Checked ${timeLabel(selectedAlerts.checkedAt)}${expired?' · Older check; refresh before heading out.':''}`,'fineprint'));
    selectedAlerts.items.forEach(a=>{const f=a.properties||{},d=el('details',null,'alert-detail');d.append(el('summary',f.event||'NWS alert'),el('p',f.headline||f.description||'Details unavailable.'));if(f.instruction)d.append(el('p',f.instruction));d.append(el('p',f.expires?`Expires ${timeLabel(f.expires)}`:'Expiration unavailable','fineprint'));safety.append(d);});
  }
  panel.append(safety);
  const access=el('details',null,'access-detail');access.append(el('summary','Before you visit'),el('p',p.access),el('p','Park hours, permits, trail closures, and overnight access are not verified live.','fineprint'));
  if(p.source)access.append(link('Optional: official park information ↗',p.source));panel.append(access);
}
function renderNightPanel(panel,p,forecast) {
  const section=el('section',null,'detail-block');section.append(el('h3','Your northern-sky window'));
  const sameDay=aurora&&!aurora.stale&&selectedDate()===Nature.dateInZone(aurora.validAt,forecast?.timezone||'America/Chicago');
  const strength=sameDay?Nature.auroraAt(p,aurora):null;
  section.append(el('p',!sameDay?'Current NOAA short-term activity does not apply to this selected date.':strength==null?'NOAA short-term overhead activity unavailable at this map point.':`Short-term overhead model value: ${fmt(strength,'%')}. This is not your probability of seeing aurora.`,'fineprint'));
  const hours=Nature.nightHours(forecast,selectedDate());
  if(!hours.length)section.append(el('p','Nighttime cloud guidance unavailable for this date.'));
  else{
    const known=hours.filter(h=>h.cloud!=null);
    const best=known.reduce((best,h)=>!best||h.cloud<best.cloud?h:best,null);
    section.append(el('p',best?`Lowest forecast cloud cover: ${fmt(best.cloud,'%')} around ${Nature.daylightLabel(best.timestamp,forecast.timezone)}.`:'Cloud cover unavailable.'));
    const list=el('div',null,'cloud-strip');hours.forEach(h=>{const n=el('div');n.append(el('span',Nature.daylightLabel(h.timestamp,forecast.timezone)),el('strong',fmt(h.cloud,'%')),el('small','clouds'));list.append(n);});section.append(list);
    section.append(el('p',`Evening through next morning · ${forecast.timezone}. Nighttime means after sunset / before sunrise; twilight and moonlight are not accounted for.`,'fineprint'));
  }
  section.append(el('p','A camera can sometimes record color your eyes barely see. This guide does not forecast naked-eye visibility.','fineprint'));panel.append(section);
}
async function compareVisible() {
  if(pendingCompare)return;
  pendingCompare=true;$('compareWeather').disabled=true;$('compareWeather').textContent='Comparing…';
  const targets=visible.slice(0,6);
  let cursor=0;
  await Promise.allSettled(Array.from({length:Math.min(3,targets.length)},async()=>{while(cursor<targets.length){const p=targets[cursor++];try{await getForecast(p);}catch{}renderResults();}}));
  pendingCompare=false;$('compareWeather').disabled=false;$('compareWeather').textContent='Compare weather';
  $('resultsStatus').textContent=`Compared weather for up to ${targets.length} displayed places. Unavailable feeds stay labeled.`;
}
async function loadReports() {
  try{
    let data;
    try{data=await fetchJson(`https://raw.githubusercontent.com/bsborden96/Stormvector/main/data/fall-reports.json?t=${Math.floor(Date.now()/600000)}`);}
    catch{data=await fetchJson('data/fall-reports.json');}
    if(!Array.isArray(data.reports)||!data.retrievedAt)throw Error('Invalid report snapshot');reportSnapshot=data;
    $('stripFoliage').textContent=`${data.reports.length} Wisconsin color reports`;
  }catch{reportSnapshot=null;$('stripFoliage').textContent='Color reports unavailable';}
  renderResults();renderReports();renderDestination();
}
function renderReports() {
  const list=$('reportRows');list.replaceChildren();
  if(!reportSnapshot){$('reportStatus').textContent='Foliage reports are unavailable. No sample percentages are shown.';return;}
  $('reportStatus').textContent=`Travel Wisconsin snapshot retrieved ${timeLabel(reportSnapshot.retrievedAt)}. Reporter dates below are separate. Reports older than seven days, or snapshots older than 36 hours, are marked older. Future trip dates do not change current observations. Current Minnesota and Michigan foliage feeds are not connected.`;
  const q=$('reportSearch').value.trim().toLowerCase();
  const reports=reportSnapshot.reports.filter(r=>`${r.name} ${r.county}`.toLowerCase().includes(q));
  reports.forEach(r=>{const status=Nature.reportStatus(r,reportSnapshot.retrievedAt),row=el('tr');row.append(el('th',`${r.name}\n${r.county} County`),el('td',`${fmt(r.percent,'%')} · ${r.condition}`),el('td',r.peak||'Unavailable'),el('td',`${timeLabel(r.reportedAt)}${status==='recent'?'':' · Older / unverified'}`));row.children[0].scope='row';
    const td=el('td');td.append(button('Locate',()=>{if(map)map.setView([r.lat,r.lon],10);$('guide').scrollIntoView({behavior:'smooth'});}));row.append(td);list.append(row);});
  if(!reports.length){const row=el('tr'),cell=el('td','No reports match that town or county.');cell.colSpan=5;row.append(cell);list.append(row);}
}
async function loadSpaceWeather() {
  const version=++spaceVersion;
  const results=await Promise.allSettled([
    fetchJson('https://services.swpc.noaa.gov/json/ovation_aurora_latest.json').then(data=>Nature.parseAurora(data)),
    fetchJson('https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json').then(data=>Nature.parseKp(data)),
  ]);
  if(version!==spaceVersion)return;
  aurora=results[0].status==='fulfilled'?results[0].value:null;
  kpRows=results[1].status==='fulfilled'?results[1].value:[];
  spaceFetchedAt=Date.now();
  $('stripAurora').textContent=aurora&&!aurora.stale?`Aurora model valid ${new Date(aurora.validAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}`:'Aurora feed unavailable / stale';
  const image=$('auroraImage');image.src=`https://services.swpc.noaa.gov/images/aurora-forecast-northern-hemisphere.jpg?t=${Math.floor(Date.now()/600000)}`;
  image.onerror=()=>{image.hidden=true;$('auroraImageStatus').textContent='NOAA aurora image unavailable. The native grid is shown on the regional map when available.';};
  image.onload=()=>{image.hidden=false;};
  $('auroraImageStatus').textContent=aurora?`NOAA model valid ${timeLabel(aurora.validAt)}${aurora.stale?' · Stale guidance; do not treat as current.':''}`:'NOAA model feed unavailable. Check the valid time printed on the image; it is not verified here.';
  renderKp();renderMap();if(view==='aurora')renderDestination();
}
function renderKp() {
  $('kpRows').replaceChildren();
  $('kpStatus').textContent=kpRows.length?`Loaded ${timeLabel(spaceFetchedAt)} · NOAA estimated / predicted Kp`:'Kp guidance unavailable.';
  kpRows.slice(0,16).forEach(r=>{const row=el('tr');row.append(el('td',timeLabel(r.time)),el('td',fmt(r.kp,'',1)),el('td',r.kind));$('kpRows').append(row);});
}
function initMap() {
  if(typeof L==='undefined'){showMapFailure();return;}
  try{
    map=L.map('natureMap',{scrollWheelZoom:false}).setView([46,-89.5],6);
    const tiles=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:16,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'}).addTo(map);
    let failures=0;tiles.on('tileerror',()=>{if(++failures>=3)$('mapFallback').hidden=false;});
    markers=L.layerGroup().addTo(map);overlay=L.layerGroup().addTo(map);
  }catch{showMapFailure();}
}
function showMapFailure() {$('natureMap').hidden=true;$('mapFallback').hidden=false;}
function renderMap() {
  if(!map)return;
  markers.clearLayers();overlay.clearLayers();
  visible.forEach(p=>{const icon=L.divIcon({className:'nature-marker',html:'<span></span>',iconSize:[24,24],iconAnchor:[12,12]});const m=L.marker([p.lat,p.lon],{icon,title:p.name,alt:p.name,keyboard:true}).addTo(markers);
    m.bindTooltip(el('span',p.name));m.on('click',()=>selectDestination(p));});
  L.circleMarker([origin.lat,origin.lon],{radius:6,color:'#ffffff',fillColor:'#8b5cf6',fillOpacity:1}).addTo(markers).bindTooltip(el('span',`Starting area: ${origin.name}`));
  if(view==='fall'&&reportSnapshot){reportSnapshot.reports.forEach(r=>{const status=Nature.reportStatus(r,reportSnapshot.retrievedAt),color=status!=='recent'?'#8d909b':r.percent>=85?'#ff6b55':r.percent>=50?'#efb85f':'#6ba880';
    L.circleMarker([r.lat,r.lon],{radius:5,color,fillColor:color,fillOpacity:.8,weight:1}).addTo(overlay).bindTooltip(el('span',`${r.name}: ${fmt(r.percent,'%')} · ${status==='recent'?'reported':'older report'}`));});}
  if(view==='aurora'&&aurora&&!aurora.stale){aurora.points.filter(p=>p.strength>0).forEach(p=>L.rectangle([[p.lat-.5,p.lon-.5],[p.lat+.5,p.lon+.5]],{color:'#67efa2',weight:0,fillOpacity:Math.min(.55,.06+p.strength/180)}).addTo(overlay).bindTooltip(el('span',`NOAA overhead model: ${p.strength}% · not visibility probability`)));}
  $('mapLegend').textContent=view==='fall'?'● Places · small dots: foliage reports · gray: older reports':view==='aurora'?'● Places · green cells: NOAA overhead aurora model':'● Destinations · tap a marker to explore';
}
function fitMap() {if(map&&visible.length)map.fitBounds(L.latLngBounds(visible.map(p=>[p.lat,p.lon])).pad(.15),{maxZoom:10});}
async function refreshData() {
  forecastCache.clear();$('refreshData').disabled=true;
  try{await Promise.allSettled([loadReports(),loadSpaceWeather(),selected?selectDestination(selected):Promise.resolve()]);}
  finally{$('refreshData').disabled=false;}
}
function changeOrigin(next) {
  origin=next;writeStorage('origin',origin);$('originStatus').textContent='Starting area updated.';
  renderResults();if(view==='weather')selectDestination({...origin,id:'local',region:'LOCAL',tags:[],summary:'Your starting area. Use its forecast to plan an outing nearby.',access:'Weather does not establish road or trail conditions.'});
}
async function setOriginFromSearch(e) {
  e.preventDefault();const query=$('originSearch').value.trim();if(!query)return;
  const version=++originVersion;$('setOrigin').disabled=true;$('originStatus').textContent='Finding your area…';
  const known=[origin,{name:'Waupun, WI',lat:43.6333,lon:-88.7296},{name:'Madison, WI',lat:43.0731,lon:-89.4012},{name:'Minneapolis, MN',lat:44.9778,lon:-93.265},{name:'Marquette, MI',lat:46.5436,lon:-87.3954}].find(p=>p.name.toLowerCase()===query.toLowerCase());
  try{
    if(known){if(version===originVersion)changeOrigin(known);return;}
    const data=await fetchJson(`https://nominatim.openstreetmap.org/search?${new URLSearchParams({q:query,format:'json',countrycodes:'us',limit:1})}`);
    if(version!==originVersion)return;if(!data.length)throw Error('No location');
    const p=data[0],lat=Number(p.lat),lon=Number(p.lon);if(!Number.isFinite(lat)||!Number.isFinite(lon))throw Error('Invalid coordinates');
    changeOrigin({name:p.display_name.split(',').slice(0,2).join(','),lat,lon});
  }catch{if(version===originVersion)$('originStatus').textContent='Could not find this area. Try city and state.';}
  finally{if(version===originVersion)$('setOrigin').disabled=false;}
}
function useGps() {
  if(!navigator.geolocation){$('originStatus').textContent='Location is unavailable in this browser.';return;}
  const version=++originVersion;$('originStatus').textContent='Requesting your location…';
  navigator.geolocation.getCurrentPosition(pos=>{if(version!==originVersion)return;$('setOrigin').disabled=false;changeOrigin({name:'your location',lat:pos.coords.latitude,lon:pos.coords.longitude});},()=>{if(version===originVersion){$('originStatus').textContent='Location unavailable. Set a city instead.';$('setOrigin').disabled=false;}},{timeout:10000,maximumAge:60000});
}
document.addEventListener('DOMContentLoaded',init);
