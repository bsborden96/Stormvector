/* StormVector Nature Guide — static, buildless, no weather bot or speech engine. */
const $ = id => document.getElementById(id);
const forecastCache = Nature.makeCache();
const forecastErrors = new Map();
let autoForecastRunning = false;
let view = 'explore';
let origin = {name:'Waupun, WI',lat:43.6333,lon:-88.7296,source:'default'};
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
let driveRequest = 0;
let driveRoute = null;
const driveCache = new Map();
let mapRenderKey = '';
let sheetReturnFocus = null;
const regionNames = {WI:'Wisconsin',MN:'Minnesota',UP:'Upper Peninsula',MI:'Michigan · Lower Peninsula'};
const themes = {
  explore:['EXPLORE / THE GREAT LAKES','A little farther. A little wilder.','Find your','next outside.','Follow the color. Watch the northern sky. Find a quiet trail. Explore the Great Lakes with the conditions in view.'],
  fall:['FALL / FOLLOW THE COLOR','A season worth taking the long way.','Follow the','changing color.','Wooded trails, scenic overlooks, and current Wisconsin color reports. The seasons do not stop at the state line.'],
  aurora:['NORTHERN LIGHTS / LOOK UP','A northern horizon. A little patience.','Meet the','northern sky.','Bring space weather, nighttime clouds, and a northern destination together. Conditions matter more than a promise.'],
  winter:['WINTER / OUTSIDE IN THE QUIET','Find the quieter side of winter.','Explore the','winter north.','Snowy forests, lakeshore scenery, and winter outings. Check snow guidance and access before setting out.'],
  weather:['LOCAL WEATHER / YOUR AREA','The conditions, before you go.','Know your','local sky.','See the forecast, daylight, and official alerts for your starting area, then plan an outing nearby.'],
  saved:['YOUR SHORTLIST / SAVED HERE','Your next stops, all together.','Keep your','next adventure.','Save the places you want to come back to. Your shortlist stays in this browser.'],
  photos:['COMMUNITY / PHOTOS ON THE MAP','A field journal from all of us.','Every moment.','A place on the map.','Share the northern lights, fresh snow, fall color, and nature you find. Explore community photos where they were taken.'],
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
async function getForecast(p) {
  try{const f=await forecastCache.get(forecastKey(p),async()=>Nature.parseForecast(await fetchJson(Nature.forecastUrl(p))));forecastErrors.delete(forecastKey(p));return f;}
  catch(e){forecastErrors.set(forecastKey(p),Date.now());throw e;}
}
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
  $('centerOnMe').addEventListener('click',centerOnOrigin);
  $('showWisconsin').addEventListener('click',()=>{if(map)map.fitBounds([[42.45,-92.95],[47.15,-86.75]]);});
  ['showFallReports','showParkPins','showOldReports'].forEach(id=>$(id).addEventListener('change',()=>{mapRenderKey='';renderMap();}));
  window.addEventListener('hashchange',route);
  setupExperience();
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
  let requested=location.hash.slice(1);
  const photoAnchor=['photoForm','communityGallery'].includes(requested)?requested:null;
  if(photoAnchor&&view!=='photos')requested='photos';
  else if(['guide','photoForm','communityGallery'].includes(requested)){document.getElementById(requested==='communityGallery'?'communityMap':requested).scrollIntoView({behavior:'smooth'});return;}
  view=themes[requested]?requested:'explore';
  closeSheet(false);
  document.body.dataset.view=view;
  $('menuToggle').setAttribute('aria-expanded','false');
  $('mainNav').classList.remove('menu-open');
  document.title=`${view==='explore'?'Nature & the North':{fall:'Fall Colors',aurora:'Northern Lights',winter:'Winter',weather:'Local Weather',photos:'Community Photos',saved:'Saved Places'}[view]} · StormVector`;
  document.querySelectorAll('[data-view]').forEach(a=>{a.classList.toggle('active',a.dataset.view===view);if(a.dataset.view===view)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  const t=themes[view];$('viewEyebrow').textContent=t[0];$('viewTitle').textContent=t[1];
  $('heroTitle').replaceChildren(el('span',t[2]),el('br'),el('span',t[3],'accent'));
  $('heroCopy').textContent=t[4];
  $('sceneLabel').textContent={aurora:'DARK SKIES / CLOUD WINDOWS / NOAA GUIDANCE',fall:'WOODED TRAILS / FALL COLOR / CHANGING SEASONS',winter:'SNOWY FORESTS / COLD DAYS / WINTER QUIET',weather:'YOUR LOCATION / YOUR WEEK / YOUR WEATHER',photos:'SHARED MOMENTS / REAL PLACES / COMMUNITY PHOTOS'}[view]||'THE GREAT LAKES / FOUR SEASONS / ONE GUIDE';
  Experience.renderHero(view);
  $('guide').hidden=view==='photos';$('communityPanel').hidden=view!=='photos';$('liveStrip').hidden=true;$('nearMe').hidden=view==='photos';
  $('filterDrawer').open=view==='weather';
  $('mapSwitch').hidden=view==='weather';
  $('locationBar').hidden=view==='photos';
  ['fallMapControls','fallMapKey','fallMapStatus'].forEach(id=>$(id).hidden=view!=='fall');
  $('mapHeading').textContent=view==='fall'?'WISCONSIN FALL COLOR MAP':'EXPLORE THE REGION';
  $('comparisonPanel').hidden=true;
  if(view==='saved')setMapDisplay('list');else if(document.body.dataset.display==='list')setMapDisplay('map');
  $('heroAction').href=view==='photos'?'#photoForm':'#guide';$('heroAction').textContent=view==='photos'?'Share your photo ↓':view==='aurora'?'Plan a night under the sky ↗':view==='winter'?'See the snow forecast ↗':view==='fall'?'Follow the color ↗':'Explore the map ↗';
  if(view==='photos'){Community.activate();if(photoAnchor)requestAnimationFrame(()=>document.getElementById(photoAnchor==='communityGallery'?'communityMap':photoAnchor).scrollIntoView({behavior:'smooth'}));return;}
  // Seasonal tabs include every place; interests can still narrow the results explicitly.
  $('interestFilter').value='all';
  $('reportsPanel').hidden=view!=='fall';$('auroraPanel').hidden=view!=='aurora';
  $('mapModeLabel').textContent=view==='fall'?'Fall color reports · tap a dot':view==='aurora'?'Destinations + short-term aurora grid':'Destination map';
  renderContext();renderResults();renderReports();renderKp();renderDestination();
  if(view==='weather')selectDestination({...origin,id:'local',region:'LOCAL',tags:[],summary:'Your starting area. Use its forecast to plan an outing nearby.',access:'Weather at this point does not establish road, trail, or park conditions.'});
  else if(!selected||selected.id==='local'||!visible.some(p=>p.id===selected.id)){if(visible[0])selectDestination(visible[0]);else{selected=null;selectedVersion++;renderDestination();}}
  else selectDestination(selected);
  if(map)requestAnimationFrame(()=>{map.invalidateSize();if(view==='fall')map.fitBounds([[42.45,-92.95],[47.15,-86.75]]);else if(origin.source!=='default')centerOnOrigin();});
}
function filters() {return {region:$('regionFilter').value,interest:$('interestFilter').value,query:$('placeSearch').value,
  radius:$('radiusFilter').value==='all'?Infinity:Number($('radiusFilter').value),origin,saved:view==='saved'?saved:null};}
function renderResults() {
  if(view==='photos')return;
  visible=Experience.rank(Nature.filterPlaces(DESTINATIONS,filters()),view,reportSnapshot,forecastCache,selectedDate(),kpRows);
  renderLocation();
  $('resultsStatus').textContent=`${visible.length} place${visible.length===1?'':'s'} · ${{fall:'recent color first',aurora:'northern-sky places first',winter:'forecast snow first'}[view]||'closest first'} · ${dayLabel(selectedDate())}`;
  $('resultsTitle').textContent={saved:'Your saved places',aurora:'Night-sky conditions by place',winter:'Winter conditions by place',fall:'Color and outing conditions by place',weather:'Compare destination weather'}[view]||'Places worth exploring';
  const grid=$('destinationGrid');grid.replaceChildren();
  if(!visible.length){grid.append(el('p',view==='saved'?'No saved places match these filters. Save a destination with the bookmark button.':'No places match these filters. Try a larger radius or another experience.','empty-state'));}
  visible.forEach(p=>{
    const card=el('article',null,`place-card ${selected?.id===p.id?'selected':''}`);
    const guide=Experience.guide(p);
    if(guide?.image){const scene=el('img',null,'place-photo');scene.src=guide.image;scene.alt=guide.imageAlt||p.name;scene.loading='lazy';scene.width=600;scene.height=400;card.append(scene);}
    else {const label=el('div',regionNames[p.region],'place-region');card.append(label);}
    const content=el('div',null,'place-content');content.append(el('p',`${regionNames[p.region]} · ${Math.round(p.distance)} mi straight-line`,'eyebrow'),el('h3',p.name),el('p',p.summary,'place-summary'));
    const tags=el('div',null,'tags');p.tags.slice(0,3).forEach(t=>tags.append(el('span',({shore:'Lakeshore',fall:'Fall color',aurora:'Northern skies',forest:'Forest',winter:'Winter scenery',trails:'Trails',wildlife:'Wildlife',waterfalls:'Waterfalls',overlooks:'Overlooks'})[t]||t)));content.append(tags);
    if(guide)content.append(el('p',guide.stop,'card-stop'));
    const report=Nature.nearestReport(p,reportSnapshot);
    if(report&&view==='fall')content.append(el('p',`${fmt(report.percent,'%')} reported color${report.status==='recent'?'':' · older / unverified report'}`,'color-note'));
    const forecast=forecastCache.peek(forecastKey(p)),day=forecast?.days.find(d=>d.date===selectedDate());
    content.append(el('p',day?`${Nature.weather(day.code)[0]} ${fmt(day.high,'°F')} · ${fmt(day.rainChance,'%')} precip.`:forecastErrors.has(forecastKey(p))?'Forecast unavailable · try Refresh data':'Loading destination forecast…','card-weather'));
    if(day)content.append(el('p',SeasonalViews.cardNote(view,p,forecast,reportSnapshot,kpRows,selectedDate()),'card-season-note'),el('small',`Loaded ${timeLabel(forecast.retrievedAt)}`,'fineprint'));
    const actions=el('div',null,'card-actions');actions.append(button('Explore conditions ↗',()=>{selectDestination(p);openSheet();},'primary-link'));
    const save=button(saved.has(p.id)?'★ Saved':'☆ Save',()=>toggleSave(p.id));save.setAttribute('aria-pressed',String(saved.has(p.id)));save.setAttribute('aria-label',`${saved.has(p.id)?'Unsave':'Save'} ${p.name}`);actions.append(save);content.append(actions);card.append(content);grid.append(card);
  });
  renderBrief();
  renderMap();
  ensureVisibleForecasts();
}
async function ensureVisibleForecasts() {
  if(autoForecastRunning||view==='photos')return;
  const targets=visible.filter(p=>!forecastCache.peek(forecastKey(p))&&(!forecastErrors.has(forecastKey(p))||Date.now()-forecastErrors.get(forecastKey(p))>30*60000));
  if(!targets.length)return;
  autoForecastRunning=true;let cursor=0;
  try{await Promise.allSettled(Array.from({length:Math.min(3,targets.length)},async()=>{while(cursor<targets.length){const p=targets[cursor++];try{await getForecast(p);}catch{}renderResults();}}));}
  finally{autoForecastRunning=false;queueMicrotask(ensureVisibleForecasts);}
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
  selected=place;selectedForecast=forecastCache.peek(forecastKey(place));selectedAlerts=null;
  driveRequest++;if(driveRoute&&map)map.removeLayer(driveRoute);driveRoute=null;
  renderDestination();renderResults();
  const current=()=>version===selectedVersion;
  await Promise.allSettled([
    (async()=>{try{const forecast=await getForecast(place);if(!current())return;selectedForecast=forecast;}catch{if(!current())return;selectedForecast=false;}if(current()){renderDestination();renderResults();}})(),
    (async()=>{try{const data=await fetchJson(`https://api.weather.gov/alerts/active?point=${place.lat},${place.lon}`);if(!Array.isArray(data.features))throw Error('Invalid alert feed');if(!current())return;selectedAlerts={items:data.features,checkedAt:Date.now()};}catch{if(!current())return;selectedAlerts=false;}if(current())renderDestination();})(),
  ]);
}
function renderDestination() {
  const panel=$('destinationPanel');const focused=panel.contains?.(document.activeElement)?document.activeElement?.textContent:null;panel.replaceChildren();
  SeasonalViews.render($('seasonDashboard'),{view,place:selected,forecast:selectedForecast,reports:reportSnapshot,kp:kpRows,date:selectedDate(),onDate:date=>{if(date<$('tripDate').min||date>$('tripDate').max)return;$('tripDate').value=date;renderDestination();renderResults();}});
  if(!selected){panel.append(el('h3','Choose your next stop'),el('p','Select a place from the map or destination list.'));return;}
  const p=selected,forecast=selectedForecast;
  panel.append(el('p',p.region==='LOCAL'?'YOUR AREA':regionNames[p.region],'eyebrow'),el('h2',p.name),el('p',p.summary,'destination-summary'));
  if(p.id!=='local'&&!p.reportOnly){const save=button(saved.has(p.id)?'★ Saved to your shortlist':'☆ Save this place',()=>toggleSave(p.id));save.setAttribute('aria-pressed',String(saved.has(p.id)));panel.append(save);}
  if(p.visit)panel.append(el('p',p.visit));
  if(p.id!=='local'){
    panel.append(button('Close place details',()=>closeSheet(),'quiet sheet-close'));
    Experience.renderGuide(panel,p);
    const drive=el('div',null,'drive-planner');drive.append(button('Estimate the drive',()=>estimateDrive(p,drive)),el('p','Road estimate from your starting area. Approximate park point. No live traffic; routes may include ferries.','fineprint'));panel.append(drive);
    const photos=el('a','See community photos ↗','quiet');photos.href='#photos';photos.addEventListener('click',()=>{ $('photoSearch').value=p.name; });panel.append(photos);
  }
  const report=Nature.nearestReport(p,reportSnapshot);
  if(view==='fall'){
    const color=el('div',null,'detail-block');color.append(el('h3','Nearby fall color report'));
    if(report){color.append(el('strong',`${fmt(report.percent,'%')} reported color`),el('p',`${report.name} · ${report.county} County · ${Math.round(report.distance)} mi from this map point`),
      el('p',`Reporter updated ${timeLabel(report.reportedAt)}${report.status==='recent'?'':' · Older or unverified; check the report date.'}`,'fineprint'),el('p',report.peak?`Reporter’s estimated peak: ${report.peak}`:'Peak timing unavailable'));
    }else color.append(el('p','Current foliage observations are not connected for this destination. No color percentage is estimated from weather.'));
    panel.append(color);
  }
  const day=forecast&&forecast.days.find(d=>d.date===selectedDate());
  if(view==='aurora')renderNightPanel(panel,p,forecast);
  if(view==='weather')Experience.renderCurrent(panel,forecast);
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
    const week=el('div',null,'week-strip');forecast.days.forEach(d=>{const b=button(`${dayLabel(d.date)}\n${fmt(d.high,'°')} / ${fmt(d.low,'°')}`,()=>{$('tripDate').value=d.date;renderDestination();renderResults();},'week-day');b.setAttribute('aria-pressed',String(d.date===selectedDate()));week.append(b);});if(view!=='weather')weather.append(week);
  }
  panel.append(weather);
  if(view!=='aurora')Experience.renderHourly(panel,forecast,selectedDate(),p,kpRows,view);
  const safety=el('section',null,'detail-block safety-block');safety.append(el('h3','Official alerts at this point'));
  if(selectedAlerts===null)safety.append(el('p','Checking NWS…','loading'));
  else if(selectedAlerts===false)safety.append(el('p','NWS alerts unavailable here. This is not an all-clear.','feed-error'));
  else{
    const expired=Date.now()-selectedAlerts.checkedAt>10*60000;
    safety.append(el('p',`${selectedAlerts.items.length} alert${selectedAlerts.items.length===1?'':'s'} returned · Checked ${timeLabel(selectedAlerts.checkedAt)}${expired?' · Older check; refresh before heading out.':''}`,'fineprint'));
    selectedAlerts.items.forEach(a=>{const f=a.properties||{},d=el('details',null,'alert-detail');d.append(el('summary',f.event||'NWS alert'),el('p',f.headline||f.description||'Details unavailable.'));if(f.instruction)d.append(el('p',f.instruction));d.append(el('p',f.expires?`Expires ${timeLabel(f.expires)}`:'Expiration unavailable','fineprint'));safety.append(d);});
  }
  if(selectedAlerts?.items?.length)panel.insertBefore(safety,panel.children[2]||null);else panel.append(safety);
  const access=el('details',null,'access-detail');access.append(el('summary','Before you visit'),el('p',p.access),el('p','Park hours, permits, trail closures, and overnight access are not verified live.','fineprint'));
  if(p.source)access.append(link('Official park information ↗',p.source));panel.append(access);
  if(focused){const replacement=[...panel.querySelectorAll('button,a')].find(n=>n.textContent===focused);replacement?.focus({preventScroll:true});}
}
function renderNightPanel(panel,p,forecast) {
  const section=el('section',null,'detail-block');section.append(el('h3','Your northern-sky window'));
  const sameDay=aurora&&!aurora.stale&&selectedDate()===Nature.dateInZone(aurora.validAt,forecast?.timezone||'America/Chicago');
  const strength=sameDay?Nature.auroraAt(p,aurora):null;
  section.append(el('p',!sameDay?'Current NOAA short-term activity does not apply to this selected date.':strength==null?'NOAA short-term overhead activity unavailable at this map point.':`Short-term overhead model value: ${fmt(strength,'%')}. This is not your probability of seeing aurora.`,'fineprint'));
  Experience.renderHourly(section,forecast,selectedDate(),p,kpRows,'aurora');
  section.append(el('p','A camera can sometimes record color your eyes barely see. This guide does not forecast naked-eye visibility.','fineprint'));panel.append(section);
}
async function compareVisible() {
  if(pendingCompare)return;
  pendingCompare=true;$('compareWeather').disabled=true;$('compareWeather').textContent='Comparing…';
  const targets=visible;
  let cursor=0;
  await Promise.allSettled(Array.from({length:Math.min(3,targets.length)},async()=>{while(cursor<targets.length){const p=targets[cursor++];try{await getForecast(p);}catch{}renderResults();}}));
  pendingCompare=false;$('compareWeather').disabled=false;$('compareWeather').textContent='Compare weather';
  $('resultsStatus').textContent=`Weather comparison updated for ${targets.length} displayed places.`;
  const panel=$('comparisonPanel');panel.replaceChildren(el('h2','Compare your next stops'));panel.hidden=false;
  const wrap=el('div',null,'table-wrap'),table=el('table'),head=el('tr');['Place','High / low','Rain chance','Gusts','Snow'].forEach(label=>head.append(el('th',label)));const thead=el('thead');thead.append(head);table.append(el('caption',`Destination model forecasts · ${dayLabel(selectedDate())}`),thead);const body=el('tbody');
  targets.forEach(p=>{const d=forecastCache.peek(forecastKey(p))?.days.find(d=>d.date===selectedDate()),row=el('tr'),name=el('th');name.scope='row';name.append(button(p.name,()=>{selectDestination(p);openSheet();}));row.append(name,...[d?`${fmt(d.high,'°')} / ${fmt(d.low,'°')}`:'Unavailable',fmt(d?.rainChance,'%'),fmt(d?.gust,' mph'),fmt(d?.snow,' in',1)].map(text=>el('td',text)));body.append(row);});table.append(body);wrap.append(table);panel.append(wrap);panel.scrollIntoView({behavior:'smooth',block:'start'});
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
  reports.forEach(r=>{const status=Nature.reportStatus(r,reportSnapshot.retrievedAt),row=el('tr');row.append(el('th',`${r.name}\n${r.county} County`),el('td',`${fmt(r.percent,'%')}${r.locationUnverified?' · location unverified':''}`),el('td',r.peak||'Unavailable'),el('td',`${timeLabel(r.reportedAt)}${status==='recent'?'':' · Older / unverified'}`));row.children[0].scope='row';
    const td=el('td');td.append(button('Locate',()=>{closeSheet(false);setMapDisplay('map');if(map)map.setView([r.lat,r.lon],10);$('mapLayout').scrollIntoView({behavior:'smooth',block:'start'});}));row.append(td);list.append(row);});
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
  renderAuroraImage();
  renderKp();renderMap();if(view==='aurora'){renderDestination();renderResults();}
}
function renderKp() {
  $('kpRows').replaceChildren();
  $('kpStatus').textContent=kpRows.length?`Loaded ${timeLabel(spaceFetchedAt)} · NOAA estimated / predicted Kp`:'Kp guidance unavailable.';
  kpRows.slice(0,16).forEach(r=>{const row=el('tr');row.append(el('td',timeLabel(r.time)),el('td',fmt(r.kp,'',1)),el('td',r.kind));$('kpRows').append(row);});
}
function initMap() {
  if(typeof L==='undefined'){showMapFailure();return;}
  try{
    map=L.map('natureMap',{scrollWheelZoom:false,tapTolerance:20}).setView([origin.lat,origin.lon],origin.source==='default'?7:10);
    const tiles=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:16,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'}).addTo(map);
    let failures=0;tiles.on('tileerror',()=>{if(++failures>=3)$('mapFallback').hidden=false;});
    markers=L.layerGroup().addTo(map);overlay=L.layerGroup().addTo(map);
  }catch{showMapFailure();}
}
function showMapFailure() {map=null;markers=null;overlay=null;$('natureMap').hidden=true;$('mapFallback').hidden=false;}
function renderMap() {
  if(!map){renderFallMap();return;}
  const key=JSON.stringify([view,visible.map(p=>p.id),selected?.id,origin.lat,origin.lon,origin.accuracy,reportSnapshot?.retrievedAt,aurora?.validAt,$('showFallReports').checked,$('showParkPins').checked,$('showOldReports').checked]);if(key===mapRenderKey)return;mapRenderKey=key;
  markers.clearLayers();overlay.clearLayers();
  (view==='fall'&&!$('showParkPins').checked?[]:visible).forEach(p=>{const icon=L.divIcon({className:`nature-marker ${selected?.id===p.id?'is-selected':''}`,html:'<span></span>',iconSize:[24,24],iconAnchor:[12,12]});const m=L.marker([p.lat,p.lon],{icon,title:p.name,alt:p.name,keyboard:true}).addTo(markers);
    m.bindTooltip(el('span',p.name));m.on('click',()=>{selectDestination(p);openSheet();});});
  if(origin.source==='gps'&&Number.isFinite(origin.accuracy))L.circle([origin.lat,origin.lon],{radius:origin.accuracy,color:'#59bded',weight:1,fillOpacity:.1,interactive:false}).addTo(markers);
  L.circleMarker([origin.lat,origin.lon],{radius:8,color:'#ffffff',fillColor:'#168ed1',fillOpacity:1}).addTo(markers).bindTooltip(el('span',`Starting area: ${origin.name}`));
  renderFallMap();
  if(view==='aurora'&&aurora&&!aurora.stale){aurora.points.filter(p=>p.strength>0).forEach(p=>L.rectangle([[p.lat-.5,p.lon-.5],[p.lat+.5,p.lon+.5]],{color:'#67efa2',weight:0,fillOpacity:Math.min(.55,.06+p.strength/180)}).addTo(overlay).bindTooltip(el('span',`NOAA overhead model: ${p.strength}% · not visibility probability`)));}
  $('mapLegend').textContent=view==='fall'?'Tap a color dot for its report, date and nearby weather':view==='aurora'?'● Places · green cells: NOAA overhead aurora model':'● Destinations · tap a marker to explore';
}
function fitMap() {if(view==='fall'){if(map)map.fitBounds([[42.45,-92.95],[47.15,-86.75]]);return;}if(map&&visible.length)map.fitBounds(L.latLngBounds(visible.map(p=>[p.lat,p.lon])).pad(.15),{maxZoom:10});}
async function refreshData() {
  forecastCache.clear();forecastErrors.clear();$('refreshData').disabled=true;
  try{await Promise.allSettled([loadReports(),loadSpaceWeather(),selected?selectDestination(selected):Promise.resolve()]);}
  finally{$('refreshData').disabled=false;}
}
function changeOrigin(next) {
  origin=next;writeStorage('origin',origin);driveRequest++;
  if(driveRoute&&map)map.removeLayer(driveRoute);driveRoute=null;
  renderResults();centerOnOrigin();
  $('originStatus').textContent=origin.source==='gps'?'GPS fix received. Nearby distances and map updated.':'Starting area updated. City results use a city-center point.';
  if(view==='weather')selectDestination({...origin,id:'local',region:'LOCAL',tags:[],summary:'Forecast at your selected coordinates.',access:'Weather does not establish road or trail conditions.'});
  else if(visible.length){const closest=[...visible].sort((a,b)=>a.distance-b.distance)[0];selectDestination(closest);}
}
function centerOnOrigin() {
  if(map){setMapDisplay('map');map.setView([origin.lat,origin.lon],10);}
}
function renderLocation() {
  $('originLabel').textContent=origin.source==='gps'?'Starting at your GPS location':`${origin.source==='default'?'Default area':origin.source==='city'?'City center':'Saved area'} · ${origin.name}`;
  const age=Number.isFinite(origin.locatedAt)?Math.max(0,Date.now()-origin.locatedAt):null;
  $('locationAccuracy').textContent=origin.source==='gps'?`${age!=null&&age>15*60000?'Saved GPS fix':'GPS fix'}${Number.isFinite(origin.accuracy)?` · reported accuracy ±${Math.round(origin.accuracy)} m`:''}${origin.locatedAt?` · ${timeLabel(origin.locatedAt)}`:''}. ${origin.accuracy>1000?'Approximate location; enable precise location in your browser settings.':'Tap Use my location to refresh.'}`:'Use my location for a fresh GPS fix, or enter a city. City centers are approximate.';
}
async function setOriginFromSearch(e) {
  e.preventDefault();const query=$('originSearch').value.trim();if(!query)return;
  const version=++originVersion;$('nearMe').disabled=false;$('setOrigin').disabled=true;$('originStatus').textContent='Finding your area…';
  const known=[origin,{name:'Waupun, WI',lat:43.6333,lon:-88.7296},{name:'Madison, WI',lat:43.0731,lon:-89.4012},{name:'Minneapolis, MN',lat:44.9778,lon:-93.265},{name:'Marquette, MI',lat:46.5436,lon:-87.3954}].find(p=>p.name.toLowerCase()===query.toLowerCase());
  try{
    if(known){if(version===originVersion)changeOrigin({...known,source:'city',accuracy:null,locatedAt:Date.now()});return;}
    const data=await fetchJson(`https://nominatim.openstreetmap.org/search?${new URLSearchParams({q:query,format:'json',countrycodes:'us',limit:1})}`);
    if(version!==originVersion)return;if(!data.length)throw Error('No location');
    const p=data[0],lat=Number(p.lat),lon=Number(p.lon);if(!Number.isFinite(lat)||!Number.isFinite(lon))throw Error('Invalid coordinates');
    changeOrigin({name:p.display_name.split(',').slice(0,2).join(','),lat,lon,source:'city',accuracy:null,locatedAt:Date.now()});
  }catch{if(version===originVersion)$('originStatus').textContent='Could not find this area. Try city and state.';}
  finally{if(version===originVersion)$('setOrigin').disabled=false;}
}
function useGps() {
  if(!navigator.geolocation){$('originStatus').textContent='Location is unavailable in this browser. Enter a city instead.';return;}
  const version=++originVersion;$('originStatus').textContent='Getting a fresh GPS fix…';$('nearMe').disabled=true;
  navigator.geolocation.getCurrentPosition(pos=>{
    if(version!==originVersion)return;$('setOrigin').disabled=false;$('nearMe').disabled=false;
    const {latitude:lat,longitude:lon,accuracy}=pos.coords;
    if(!Number.isFinite(lat)||!Number.isFinite(lon)){ $('originStatus').textContent='The browser returned an invalid location. Try again or enter a city.';return; }
    changeOrigin({name:'your location',lat,lon,accuracy:Number.isFinite(accuracy)?accuracy:null,locatedAt:pos.timestamp||Date.now(),source:'gps'});
  },error=>{if(version===originVersion){$('originStatus').textContent=error.code===1?'Location permission is off. Allow location for this site, or enter a city.':error.code===3?'GPS timed out. Try again outdoors or enter a city.':'GPS unavailable. Try again or enter a city.';$('setOrigin').disabled=false;$('nearMe').disabled=false;}},{enableHighAccuracy:true,timeout:15000,maximumAge:0});
}
document.addEventListener('DOMContentLoaded',init);

function setupExperience() {
  $('menuToggle').addEventListener('click',()=>{const open=$('menuToggle').getAttribute('aria-expanded')!=='true';$('menuToggle').setAttribute('aria-expanded',String(open));$('mainNav').classList.toggle('menu-open',open);});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeSheet();$('menuToggle').setAttribute('aria-expanded','false');$('mainNav').classList.remove('menu-open');}});
  $('showMap').addEventListener('click',()=>setMapDisplay('map'));
  $('showList').addEventListener('click',()=>setMapDisplay('list'));
  $('showBoth').addEventListener('click',()=>setMapDisplay('both'));
  setMapDisplay('map');
  // Long raw tables stay below the planning experience on every route.
  $('guide').append($('reportsPanel'),$('auroraPanel'));
  if(typeof GUIDE_SCENES!=='undefined'){
    const seen=new Set();Object.values(GUIDE_SCENES).forEach(p=>{if(seen.has(p.src))return;seen.add(p.src);$('photoCredits').append(link(`${p.caption} · ${p.credit}`,p.source));});
  }
}
function setMapDisplay(display) {
  document.body.dataset.display=display;
  [['showMap','map'],['showList','list'],['showBoth','both']].forEach(([id,value])=>$(id).setAttribute('aria-pressed',String(value===display)));
  if(map)requestAnimationFrame(()=>map.invalidateSize());
}
function openSheet() {
  sheetReturnFocus=document.activeElement;
  const panel=$('destinationPanel');panel.dataset.sheet='open';
  if(window.matchMedia?.('(max-width: 760px)').matches){panel.focus({preventScroll:true});}
  else panel.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function closeSheet(restore=true) {
  const panel=$('destinationPanel');if(panel)delete panel.dataset.sheet;
  if(restore&&sheetReturnFocus?.isConnected)sheetReturnFocus.focus({preventScroll:true});
  sheetReturnFocus=null;
}
function renderBrief() {
  const panel=$('pageBrief');panel.replaceChildren();
  if(view==='weather'||view==='saved'){panel.hidden=true;return;}panel.hidden=false;
  const head=el('div',null,'brief-heading');head.append(el('p',{fall:'THE COLOR SHORTLIST',aurora:'PLAN YOUR NORTHERN NIGHT',winter:'WINTER / WHERE TO START'}[view]||'START SOMEWHERE GOOD','eyebrow'),el('h2',{fall:'Where to look for color.',aurora:'Find a horizon worth staying up for.',winter:'Follow the snow. Know the access.'}[view]||'Your next few possibilities.'));panel.append(head);
  panel.append(el('p',{fall:'Recent reported color first, then distance. Percent color is not leaf retention or a guarantee of peak scenery.',aurora:'Places tagged for northern skies lead this shortlist. Night access and an open northern horizon still need checking.',winter:'Loaded forecasts with more selected-day snow lead the list. New snowfall and snow already on the ground are shown separately.'}[view]||'A few starting points near your area. Open a place for its field guide, weather and community photos.','brief-copy'));
  const list=el('div',null,'featured-places');
  visible.slice(0,3).forEach((p,i)=>{
    const card=el('article',null,'featured-place'),guide=Experience.guide(p),report=Nature.nearestReport(p,reportSnapshot),f=forecastCache.peek(forecastKey(p)),d=f?.days.find(d=>d.date===selectedDate());
    card.append(el('small',`0${i+1} / ${regionNames[p.region]}`),el('h3',p.name),el('p',guide?.stop||p.summary));
    const note=view==='fall'?report?`${fmt(report.percent,'%')} reported · ${report.status==='recent'?'recent':'older report'}`:'No current foliage report':view==='winter'?`New snow ${fmt(d?.snow,' in',1)} · Model depth ${fmt(Experience.currentSnow(f)?.snowDepth,' in',1)}`:`${Math.round(p.distance)} miles straight-line from your area`;
    card.append(el('p',note,'feature-condition'),button('Explore this place ↗',()=>{selectDestination(p);openSheet();},'text-button'));list.append(card);
  });
  if(!visible.length)list.append(el('p','No destinations match. Open the filters to widen your search.'));panel.append(list);
}
async function estimateDrive(p,container) {
  const version=++driveRequest,from={...origin},key=`${from.lat},${from.lon}:${p.lat},${p.lon}`;
  const b=container.querySelector('button');b.disabled=true;b.textContent='Estimating…';
  try{
    let data=driveCache.get(key);
    if(!data){const r=await fetchJson(`https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${p.lon},${p.lat}?overview=simplified&geometries=geojson&alternatives=false&steps=false`);if(r.code!=='Ok'||!r.routes?.length)throw Error('No route');data=r.routes[0];driveCache.set(key,data);}
    if(version!==driveRequest||selected?.id!==p.id)return;
    const minutes=Math.round(data.duration/60),hours=Math.floor(minutes/60);
    b.textContent=`${hours?`${hours} hr `:''}${minutes%60} min · ${Math.round(data.distance/1609.344)} road miles`;
    if(map&&data.geometry?.coordinates){if(driveRoute)map.removeLayer(driveRoute);driveRoute=L.geoJSON(data.geometry,{style:{color:'#4dbdff',weight:4,opacity:.85}}).addTo(map);map.fitBounds(driveRoute.getBounds(),{padding:[24,24]});}
    container.querySelector('p').textContent='OSRM / OpenStreetMap estimate. No traffic, weather delays or access confirmation; check for ferry segments before travel.';
  }catch{if(version===driveRequest)b.textContent='Drive estimate unavailable · retry';}
  finally{if(version===driveRequest)b.disabled=false;}
}
function renderAuroraImage() {
  const image=$('auroraImage');
  if(!aurora||aurora.stale){image.hidden=true;$('auroraImageStatus').textContent='Short-term NOAA grid unavailable or stale. The hourly cloud timeline and dated Kp guidance remain separate.';return;}
  const canvas=document.createElement('canvas');canvas.width=720;canvas.height=380;const ctx=canvas.getContext('2d');if(!ctx){image.hidden=true;return;}
  ctx.fillStyle='#0b1725';ctx.fillRect(0,0,720,380);
  ctx.strokeStyle='#294453';ctx.lineWidth=1;
  for(let lat=40;lat<=52;lat+=2){const y=(52-lat)/12*330;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(720,y);ctx.stroke();ctx.fillStyle='#b7c5cc';ctx.font='12px sans-serif';ctx.fillText(`${lat}°N`,6,y+15);}
  aurora.points.forEach(p=>{ctx.fillStyle=`rgba(107,240,173,${p.strength/100})`;ctx.fillRect((p.lon+98)/18*720,(52-p.lat)/12*330,40,28);});
  DESTINATIONS.forEach(p=>{const x=(p.lon+98)/18*720,y=(52-p.lat)/12*330;ctx.fillStyle='#d5eefb';ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fill();});
  ctx.fillStyle='#b7c5cc';ctx.font='13px sans-serif';ctx.fillText(`NOAA overhead activity · valid ${timeLabel(aurora.validAt)}`,18,355);ctx.fillText('98°W                 92°W                 86°W                 80°W',18,375);
  image.src=canvas.toDataURL('image/png');image.hidden=false;image.alt='Regional NOAA aurora model grid: brighter green cells show stronger overhead activity, with destination dots. See interactive map for place names.';
  $('auroraImageStatus').textContent=`Regional view of the native NOAA grid · valid ${timeLabel(aurora.validAt)}. Latitude/longitude grid, not a visibility probability. Green intensity 0–100%; dots are destinations.`;
}

function renderFallMap() {
  const key=$('fallMapKey');key.replaceChildren();if(view!=='fall')return;
  [['#65aa80','0–24%'],['#d4c45d','25–49%'],['#eaa454','50–74%'],['#e57555','75–100%'],['#7f8b97','Older']].forEach(([color,label])=>{const item=el('span',null,'fall-key-item'),dot=el('i');dot.style.backgroundColor=color;dot.setAttribute('aria-hidden','true');item.append(dot,el('span',label));key.append(item);});
  if(!reportSnapshot){$('fallMapStatus').textContent='Color observations unavailable. No estimated color is filled in.';return;}
  const recent=reportSnapshot.reports.filter(r=>Nature.reportStatus(r,reportSnapshot.retrievedAt)==='recent');
  const reports=$('showOldReports').checked?reportSnapshot.reports:recent;
  $('fallMapStatus').textContent=`${reports.length} report points${$('showOldReports').checked?' including older observations':''} · Travel Wisconsin snapshot ${timeLabel(reportSnapshot.retrievedAt)}. Percent is reported color, not leaf retention. Wisconsin only; unreported areas are not estimated.`;
  if(!map||!overlay||!$('showFallReports').checked)return;
  reports.forEach(r=>{
    const status=Nature.reportStatus(r,reportSnapshot.retrievedAt),color=status!=='recent'?'#7f8b97':r.percent>=75?'#e57555':r.percent>=50?'#eaa454':r.percent>=25?'#d4c45d':'#65aa80';
    const marker=L.circleMarker([r.lat,r.lon],{radius:10,color:'#fff1d4',fillColor:color,fillOpacity:.95,weight:1.5}).addTo(overlay);
    marker.bindTooltip(el('span',`${r.name} · ${fmt(r.percent,'%')} color${status==='recent'?'':' · older'}`));
    const popup=el('div',null,'fall-report-popup');popup.append(el('p','FALL COLOR REPORT','eyebrow'),el('h3',r.name),el('strong',`${fmt(r.percent,'%')} reported color`),el('p',`${r.county} County`),el('p',`Updated ${timeLabel(r.reportedAt)}${status==='recent'?'':' · Older / unverified observation'}`),el('p',`Reporter’s estimated peak: ${r.peak||'Unavailable'}`),el('p','A report point describes the surrounding area, not an exact foliage boundary.','fineprint'));
    popup.append(button('Report & weather here',()=>{selectDestination({id:`report:${r.id||r.name}`,reportOnly:true,name:r.name,lat:r.lat,lon:r.lon,region:'WI',county:r.county,tags:['fall'],summary:'Weather at this foliage report point. The color observation describes the reporter’s surrounding area.',source:reportSnapshot.sourceUrl,access:'This is a report location, not a verified public trailhead. Choose a destination for visit and access notes.'});closeSheet(false);openSheet();},'primary-link'));
    const nearby=Nature.filterPlaces(DESTINATIONS,{origin:r,radius:60}).slice(0,2);
    if(nearby.length){popup.append(el('p','Places nearby','eyebrow'));nearby.forEach(p=>popup.append(button(`${p.name} · ${Math.round(p.distance)} mi`,()=>{selectDestination(p);openSheet();},'quiet')));}
    marker.bindPopup(popup,{maxWidth:310});
  });
}
