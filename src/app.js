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
let locationEditing = false;
let originForecast = null;
let originForecastKey = null;
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
const drivePending = new Map();
let routeQueue = Promise.resolve();
let lastRouteRequest = 0;
let mapRenderKey = '';
let sheetReturnFocus = null;
const regionNames = {WI:'Wisconsin',MN:'Minnesota',UP:'Upper Peninsula',MI:'Michigan · Lower Peninsula'};
const themes = {
  explore:['EXPLORE / GREAT LAKES','Explore the map','Where do you','want to go?','Find a place worth the drive. Check the conditions before you leave.'],
  fall:['FALL COLORS / OBSERVATIONS','The color map','Fall colors','across the north.','Find dated color reports across Wisconsin, Minnesota, Michigan and the UP.'],
  aurora:['NORTHERN LIGHTS / SKY CONDITIONS','Compare northern destinations','Northern lights.','Start with your sky.','Check local darkness and clouds, then compare northern destinations.'],
  winter:['WINTER / SNOW FORECAST','Find snow by destination','Snow, cold','and the week ahead.','Choose a destination to see forecast snowfall, temperatures and wind.'],
  weather:['LOCAL WEATHER / FORECAST','Your local forecast','Weather','where you are.','Current conditions, hourly guidance, a seven-day forecast and official alerts.'],
  saved:['SAVED / YOUR PLACES','Your saved places','Your places.','Ready when you are.','Keep a shortlist and check the weather before you head out. Saved in this browser.'],
  photos:['COMMUNITY / FIELD REPORTS','Community photos','Seen out there.','Shared here.','Explore photos by location, or add a moment of your own.'],
};
function el(tag,text,cls) {
  const node=document.createElement(tag);
  if(text!=null)node.textContent=text;
  if(cls)node.className=cls;
  return node;
}
const fmt=(v,suffix='',digits=0)=>v==null?'Unavailable':`${v.toFixed(digits)}${suffix}`;
const dayLabel=d=>new Date(`${d}T12:00:00Z`).toLocaleDateString([],{timeZone:'UTC',weekday:'short',month:'short',day:'numeric'});
const reportTimeLabel=r=>r.dateOnly?new Date(r.reportedAt).toLocaleDateString():timeLabel(r.reportedAt);
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
  try{const f=await forecastCache.get(forecastKey(p),async()=>Nature.parseForecast(await fetchJson(Nature.forecastUrl(p))));forecastErrors.delete(forecastKey(p));if(typeof Nearby!=='undefined')Nearby.observe(p,f);return f;}
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
  $('changeLocation').addEventListener('click',()=>{locationEditing=true;renderLocation();$('originSearch').focus();});
  document.querySelectorAll('[data-region]').forEach(b=>b.addEventListener('click',()=>setRegion(b.dataset.region)));
  $('regionFilter').addEventListener('change',()=>setRegion($('regionFilter').value));
  $('compareWeather').addEventListener('click',compareVisible);
  $('refreshData').addEventListener('click',refreshData);
  $('fitMap').addEventListener('click',fitMap);
  $('centerOnMe').addEventListener('click',centerOnOrigin);
  $('showRegion').addEventListener('click',fitRegion);
  ['showFallReports','showParkPins','showOldReports','showRegionalEstimates'].forEach(id=>$(id).addEventListener('change',()=>{mapRenderKey='';renderMap();}));
  window.addEventListener('hashchange',route);
  $('activePlace').addEventListener('change',()=>{const p=visible.find(p=>p.id===$('activePlace').value);if(p)selectDestination(p);});
  $('resultSort').addEventListener('change',renderResults);
  $('resetFilters').addEventListener('click',()=>{ $('interestFilter').value='all';$('radiusFilter').value='all';$('placeSearch').value='';$('resultSort').value='recommended';setRegion('all'); });
  setupExperience();
  if(typeof Nearby!=='undefined')Nearby.init();
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
  arrangePage(view);
  $('guide').hidden=view==='photos';$('communityPanel').hidden=view!=='photos';$('liveStrip').hidden=true;$('nearMe').hidden=view==='photos'||(origin.source!=='default'&&!locationEditing);
  $('taskLaunch').hidden=view!=='explore';
  $('workspaceTools').hidden=view==='photos';
  $('activePlaceLabel').hidden=['explore','fall','saved','weather'].includes(view);
  $('tripDate').parentElement?.setAttribute('data-local-date',String(view==='weather'));
  $('sortLabel').hidden=view==='weather';$('resetFilters').hidden=view==='weather';
  $('filterDrawer').hidden=view==='weather';$('filterDrawer').open=false;
  $('reportsPanel').open=view==='fall';
  $('nearbyPanel').hidden=true;
  $('resultSort').value='recommended';
  $('mapSwitch').hidden=view==='weather';
  $('locationBar').hidden=view==='photos';
  ['fallMapControls','fallMapKey','fallMapStatus'].forEach(id=>$(id).hidden=view!=='fall');
  $('mapHeading').textContent=view==='fall'?`${regionNames[$('regionFilter').value]||'GREAT LAKES'} FALL COLORS`:'EXPLORE THE REGION';
  $('comparisonPanel').hidden=true;
  setMapDisplay(['explore','saved','winter','aurora'].includes(view)?'list':'map');
  $('heroAction').href=view==='photos'?'#photoForm':'#guide';$('heroAction').textContent=view==='photos'?'Share your photo ↓':view==='aurora'?'See the sky near you ↗':view==='winter'?'See the snow forecast ↗':view==='fall'?'Follow the color ↗':'Explore the map ↗';
  if(view==='photos'){if(typeof Nearby!=='undefined')Nearby.route(view);Community.activate();if(photoAnchor)requestAnimationFrame(()=>document.getElementById(photoAnchor==='communityGallery'?'communityMap':photoAnchor).scrollIntoView({behavior:'smooth'}));return;}
  // Seasonal tabs include every place; interests can still narrow the results explicitly.
  $('interestFilter').value='all';
  $('reportsPanel').hidden=view!=='fall';$('auroraPanel').hidden=view!=='aurora';
  $('mapModeLabel').textContent=view==='fall'?'Fall color reports · tap a dot':view==='aurora'?'Destinations + short-term aurora grid':'Destination map';
  renderContext();renderResults();renderReports();renderKp();renderDestination();
  if(view==='weather')selectDestination({...origin,id:'local',region:'LOCAL',tags:[],summary:'Your starting area. Use its forecast to plan an outing nearby.',access:'Weather at this point does not establish road, trail, or park conditions.'});
  else if(!selected||selected.id==='local'||!visible.some(p=>p.id===selected.id)){if(visible[0])selectDestination(visible[0]);else{selected=null;selectedVersion++;renderDestination();}}
  else selectDestination(selected);
  if(typeof Nearby!=='undefined')Nearby.route(view);
  if(map)requestAnimationFrame(()=>{map.invalidateSize();if(view==='fall')fitRegion();else if(origin.source!=='default')centerOnOrigin();});
}
function filters() {return {region:$('regionFilter').value,interest:$('interestFilter').value,query:$('placeSearch').value,
  radius:$('radiusFilter').value==='all'?Infinity:Number($('radiusFilter').value),origin,saved:view==='saved'?saved:null};}
function renderResults() {
  if(view==='photos')return;
  const candidates=Nature.filterPlaces(DESTINATIONS,filters()).filter(p=>!['winter','aurora','fall'].includes(view)||p.tags.includes(view));
  visible=Experience.rank(candidates,view,reportSnapshot,forecastCache,selectedDate(),kpRows);
  const sort=$('resultSort').value;
  if(sort==='distance')visible.sort((a,b)=>a.distance-b.distance);
  if(['rain','snow'].includes(sort))visible.sort((a,b)=>{const metric=p=>forecastCache.peek(forecastKey(p))?.days.find(d=>d.date===selectedDate())?.[sort==='rain'?'rainChance':'snow'];const av=metric(a),bv=metric(b);return av==null?bv==null?a.distance-b.distance:1:bv==null?-1:(sort==='snow'?bv-av:av-bv)||a.distance-b.distance;});
  const picker=$('activePlace'),pickerKey=visible.map(p=>p.id).join(',');if(picker.dataset.places!==pickerKey){picker.replaceChildren();visible.forEach(p=>{const option=el('option',p.name);option.value=p.id;picker.append(option);});picker.dataset.places=pickerKey;}picker.value=selected?.id||visible[0]?.id||'';
  renderLocation();
  $('resultsStatus').textContent=`${visible.length} place${visible.length===1?'':'s'} · ${({distance:'closest first',rain:'lowest rain first',snow:'most snow first'})[sort]||{fall:'recent color first',aurora:'northern-sky places first',winter:'forecast snow first'}[view]||'closest first'} · ${dayLabel(selectedDate())}`;
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
    if(report&&view==='fall')content.append(el('p',`${Nature.colorLabel(report)} reported color${report.status==='recent'?'':' · older / unverified report'}`,'color-note'));
    const forecast=forecastCache.peek(forecastKey(p)),day=forecast?.days.find(d=>d.date===selectedDate());
    content.append(el('p',day?`${Nature.weather(day.code)[0]} ${fmt(day.high,'°F')} · ${fmt(day.rainChance,'%')} precip.`:forecastErrors.has(forecastKey(p))?'Forecast unavailable · try Refresh data':'Loading destination forecast…','card-weather'));
    if(day)content.append(el('p',SeasonalViews.cardNote(view,p,forecast,reportSnapshot,kpRows,selectedDate()),'card-season-note'),el('small',`Loaded ${timeLabel(forecast.retrievedAt)}`,'fineprint'));
    const actions=el('div',null,'card-actions');actions.append(button('Explore conditions ↗',()=>{selectDestination(p);openSheet();},'primary-link'));
    const save=button(saved.has(p.id)?'★ Saved':'☆ Save',()=>toggleSave(p.id));save.setAttribute('aria-pressed',String(saved.has(p.id)));save.setAttribute('aria-label',`${saved.has(p.id)?'Unsave':'Save'} ${p.name}`);actions.append(save);content.append(actions);card.append(content);grid.append(card);
  });
  renderBrief();
  renderLocalAurora();
  if(typeof Nearby!=='undefined')Nearby.sync();
  renderMap();
  ensureVisibleForecasts();
}
async function ensureVisibleForecasts() {
  if(autoForecastRunning||['photos','weather'].includes(view))return;
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
    fall:['Reported color, not a guessed percentage.','Wisconsin reporter observations and Minnesota DNR park stages appear with their dates. Michigan and UP map colors are modeled estimates for the selected date, supplied by Explore Fall via Pure Michigan. Each type is labeled.'],
    aurora:['A place to look north is only part of the story.','Markers include destinations across Wisconsin, Minnesota and both Michigan peninsulas; night access and sky darkness need checking. Combine NOAA guidance with each place’s nighttime cloud forecast. The short-term aurora oval does not predict an entire evening.'],
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
  SeasonalViews.render($('seasonDashboard'),{view,place:selected,forecast:selectedForecast,reports:reportSnapshot,region:$('regionFilter').value,kp:kpRows,date:selectedDate(),onDate:date=>{if(date<$('tripDate').min||date>$('tripDate').max)return;$('tripDate').value=date;renderDestination();renderResults();}});
  if(!selected){panel.append(el('h3','Choose your next stop'),el('p','Select a place from the map or destination list.'));return;}
  $('activePlace').value=selected.id;
  const p=selected,forecast=selectedForecast;
  panel.append(el('p',p.region==='LOCAL'?'YOUR AREA':regionNames[p.region],'eyebrow'),el('h2',p.name),el('p',p.summary,'destination-summary'));
  if(p.id!=='local'&&!p.reportOnly){const save=button(saved.has(p.id)?'★ Saved to your shortlist':'☆ Save this place',()=>toggleSave(p.id));save.setAttribute('aria-pressed',String(saved.has(p.id)));panel.append(save);}
  if(p.visit)panel.append(el('p',p.visit));
  if(p.id!=='local'){
    panel.append(button('Close place details',()=>closeSheet(),'quiet sheet-close'));
    const guideDetails=el('details',null,'visit-guide');guideDetails.append(el('summary','Trail, admission & access details'));Experience.renderGuide(guideDetails,p);panel.append(guideDetails);
    const directions=link('Get directions ↗',`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}`);directions.className='primary-link';panel.append(directions);
    const drive=el('div',null,'drive-planner');drive.append(button('Estimate the drive',()=>estimateDrive(p,drive)),el('p','Road estimate from your starting area. Approximate park point. No live traffic; routes may include ferries.','fineprint'));panel.append(drive);
    const photos=el('a','See community photos ↗','quiet');photos.href='#photos';photos.addEventListener('click',()=>{ $('photoSearch').value=p.name; });panel.append(photos);
  }
  const report=Nature.nearestReport(p,reportSnapshot);
  if(view==='fall'){
    const color=el('div',null,'detail-block');color.append(el('h3','Nearby fall color report'));
    if(report){color.append(el('strong',`${Nature.colorLabel(report)} reported color`),el('p',`${report.name} · ${report.county?report.county+' County':regionNames[report.region||report.state]} · ${Math.round(report.distance)} mi from this map point`),
      el('p',`Reporter updated ${reportTimeLabel(report)}${report.status==='recent'?'':' · Older or unverified; check the report date.'}`,'fineprint'),el('p',report.peak?`Reporter’s estimated peak: ${report.peak}`:'Peak timing unavailable'));
    }else color.append(el('p','No park-specific field observation is loaded here. For Michigan / UP, the dated map estimate shows the regional color outlook.'));
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
  if(p.id==='local'){if(focused){const replacement=[...panel.querySelectorAll('button,a')].find(n=>n.textContent===focused);replacement?.focus({preventScroll:true});}return;}
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
  const wi=(async()=>{try{return await fetchJson(`https://raw.githubusercontent.com/bsborden96/Stormvector/main/data/fall-reports.json?t=${Math.floor(Date.now()/600000)}`);}catch{return fetchJson('data/fall-reports.json');}})();
  const [wisconsin,minnesota]=await Promise.allSettled([wi,fetchJson('data/regional-foliage.json')]);
  const snapshots=[wisconsin,minnesota].filter(r=>r.status==='fulfilled'&&Array.isArray(r.value.reports)&&r.value.retrievedAt).map(r=>r.value);
  if(snapshots.length){reportSnapshot={retrievedAt:new Date().toISOString(),reports:snapshots.flatMap(s=>s.reports.map(r=>({...r,region:r.region||r.state||'WI',retrievedAt:r.retrievedAt||s.retrievedAt,source:r.source||s.source,sourceUrl:r.sourceUrl||s.sourceUrl}))),source:'Travel Wisconsin / Minnesota DNR'};}
  else reportSnapshot=null;
  $('stripFoliage').textContent=reportSnapshot?`${reportSnapshot.reports.length} regional color observations`:'Color reports unavailable';
  renderResults();renderReports();renderDestination();
}
function renderReports() {
  const list=$('reportRows');list.replaceChildren();
  if(!reportSnapshot){$('reportStatus').textContent='Foliage reports are unavailable. No sample percentages are shown.';return;}
  $('reportStatus').textContent='Travel Wisconsin and Minnesota DNR observations. Minnesota ranges and past-peak stages are preserved as published. Michigan / UP map colors are estimates for the selected date, not field reports. Older observations remain dated.';
  const q=$('reportSearch').value.trim().toLowerCase();
  const reports=reportSnapshot.reports.filter(r=>($('regionFilter').value==='all'||r.region===$('regionFilter').value)&&`${r.name} ${r.county||''}`.toLowerCase().includes(q));
  reports.forEach(r=>{const status=Nature.reportStatus(r,reportSnapshot.retrievedAt),row=el('tr');row.append(el('th',`${r.name}\n${r.county?r.county+' County':regionNames[r.region]} · ${r.source||'Report'}`),el('td',`${Nature.colorLabel(r)}${r.locationUnverified?' · location unverified':''}`),el('td',r.peak||'Unavailable'),el('td',`${reportTimeLabel(r)}${status==='recent'?'':' · Older / unverified'}`));row.children[0].scope='row';
    const td=el('td');td.append(button('Locate',()=>{closeSheet(false);setMapDisplay('map');if(map)map.setView([r.lat,r.lon],10);$('mapLayout').scrollIntoView({behavior:'smooth',block:'start'});}));row.append(td);list.append(row);});
  if(!reports.length){const row=el('tr'),cell=el('td','No field reports match this selection. For Michigan and the UP, use the dated color-estimate layer on the map.');cell.colSpan=5;row.append(cell);list.append(row);}
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
  renderAuroraImage();renderLocalAurora();if(view==='aurora')loadOriginForecast();
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
  const key=JSON.stringify([view,visible.map(p=>p.id),selected?.id,origin.lat,origin.lon,origin.accuracy,reportSnapshot?.retrievedAt,aurora?.validAt,$('showFallReports').checked,$('showParkPins').checked,$('showOldReports').checked,$('showRegionalEstimates').checked,selectedDate(),$('regionFilter').value]);if(key===mapRenderKey)return;mapRenderKey=key;
  markers.clearLayers();overlay.clearLayers();
  (view==='fall'&&!$('showParkPins').checked?[]:visible).forEach(p=>{const icon=L.divIcon({className:`nature-marker ${selected?.id===p.id?'is-selected':''}`,html:'<span></span>',iconSize:[24,24],iconAnchor:[12,12]});const m=L.marker([p.lat,p.lon],{icon,title:p.name,alt:p.name,keyboard:true}).addTo(markers);
    m.bindTooltip(el('span',p.name));m.on('click',()=>{selectDestination(p);openSheet();});});
  if(origin.source==='gps'&&Number.isFinite(origin.accuracy))L.circle([origin.lat,origin.lon],{radius:origin.accuracy,color:'#59bded',weight:1,fillOpacity:.1,interactive:false}).addTo(markers);
  L.circleMarker([origin.lat,origin.lon],{radius:8,color:'#ffffff',fillColor:'#168ed1',fillOpacity:1}).addTo(markers).bindTooltip(el('span',`Starting area: ${origin.name}`));
  renderFallMap();
  if(view==='aurora'&&aurora&&!aurora.stale){aurora.points.filter(p=>p.strength>0).forEach(p=>L.rectangle([[p.lat-.5,p.lon-.5],[p.lat+.5,p.lon+.5]],{color:'#67efa2',weight:0,fillOpacity:Math.min(.55,.06+p.strength/180)}).addTo(overlay).bindTooltip(el('span',`NOAA overhead model: ${p.strength}% · not visibility probability`)));}
  $('mapLegend').textContent=view==='fall'?'Tap a color dot for its report, date and nearby weather':view==='aurora'?'● Places · green cells: NOAA overhead aurora model':'● Destinations · tap a marker to explore';
}
function fitMap() {if(view==='fall'){fitRegion();return;}if(map&&visible.length)map.fitBounds(L.latLngBounds(visible.map(p=>[p.lat,p.lon])).pad(.15),{maxZoom:10});}
async function refreshData() {
  forecastCache.clear();forecastErrors.clear();originForecastKey=null;originForecast=null;if(view==='aurora')loadOriginForecast();$('refreshData').disabled=true;
  try{await Promise.allSettled([loadReports(),loadSpaceWeather(),selected?selectDestination(selected):Promise.resolve()]);}
  finally{$('refreshData').disabled=false;}
}
function changeOrigin(next) {
  origin=next;locationEditing=false;writeStorage('origin',origin);driveRequest++;
  originForecast=null;originForecastKey=null;loadOriginForecast();
  if(driveRoute&&map)map.removeLayer(driveRoute);driveRoute=null;
  renderResults();centerOnOrigin();
  $('originStatus').textContent=origin.source==='gps'?'Location set. Nearby places and forecasts updated.':'Location set. City results use a city-center point.';
  if(view==='weather')selectDestination({...origin,id:'local',region:'LOCAL',tags:[],summary:'Forecast at your selected coordinates.',access:'Weather does not establish road or trail conditions.'});
  else if(visible.length){const closest=[...visible].sort((a,b)=>a.distance-b.distance)[0];selectDestination(closest);}
}
function centerOnOrigin() {
  if(map){setMapDisplay('map');map.setView([origin.lat,origin.lon],10);}
}
function renderLocation() {
  const located=origin.source!=='default',compact=located&&!locationEditing;
  $('originLabel').textContent=origin.source==='gps'?`Near ${origin.name}`:`${origin.source==='default'?'Choose your location · default:':'Near'} ${origin.name}`;
  $('originForm').hidden=compact;$('changeLocation').hidden=!compact;
  $('nearMe').hidden=view==='photos'||compact;
  $('centerOnMe').textContent='Show my area on map';
  $('locationAccuracy').textContent=origin.source==='gps'?`${origin.accuracy<=100?'Precise location':'Approximate device location'}${Number.isFinite(origin.accuracy)?` · ±${Math.round(origin.accuracy)} m`:''}${origin.accuracy>100?' · Enable Precise Location in your device’s location settings for a closer fix.':''}`:origin.source==='default'?'Use your location to see nearby nature and your local sky.':'City center · use GPS for your precise position.';
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
  const version=++originVersion;
  $('originStatus').textContent='Requesting your location…';$('nearMe').disabled=true;
  Locator.request(pos=>{
    if(version!==originVersion)return;
    $('setOrigin').disabled=false;$('nearMe').disabled=false;
    const {latitude:lat,longitude:lon,accuracy}=pos.coords;
    changeOrigin({name:`${lat.toFixed(3)}, ${lon.toFixed(3)}`,lat,lon,accuracy:Number.isFinite(accuracy)?accuracy:null,locatedAt:pos.timestamp||Date.now(),source:'gps'});
    resolveTown(lat,lon,version);
  },message=>{if(version===originVersion){$('originStatus').textContent=message;$('setOrigin').disabled=false;$('nearMe').disabled=false;}},message=>{if(version===originVersion)$('originStatus').textContent=message;});
}
document.addEventListener('DOMContentLoaded',init);

function setupExperience() {
  $('workspaceTools').append($('refreshData'));
  $('heroAction').addEventListener('click',()=>{if(view!=='photos')setMapDisplay('map');});
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
  if(map)requestAnimationFrame(()=>map.invalidateSize());
}
function closeSheet(restore=true) {
  const panel=$('destinationPanel');if(panel)delete panel.dataset.sheet;
  if(restore&&sheetReturnFocus?.isConnected)sheetReturnFocus.focus({preventScroll:true});
  sheetReturnFocus=null;
}
function renderBrief() {$('pageBrief').hidden=true;}
async function estimateDrive(p,container) {
  const version=++driveRequest,from={...origin},key=`${from.lat},${from.lon}:${p.lat},${p.lon}`;
  const b=container.querySelector('button');b.disabled=true;b.textContent='Estimating…';
  try{
    const data=await requestDrive(from,p);
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
  const snapshot=reportSnapshot||{reports:[],retrievedAt:null};
  const region=$('regionFilter').value;
  const regional=snapshot.reports.filter(r=>region==='all'||r.region===region);
  const recent=regional.filter(r=>Nature.reportStatus(r,snapshot.retrievedAt)==='recent');
  const reports=$('showOldReports').checked?regional:recent;
  $('fallMapStatus').textContent=`${reports.length} observed report points · Wisconsin: Travel Wisconsin. Minnesota: MN DNR report ranges and published color map. Michigan / UP: Explore Fall modeled color for ${dayLabel(selectedDate())} when the estimate layer is on.`;
  if(!map||!overlay)return;
  if($('showRegionalEstimates').checked){
    const layer=L.imageOverlay(`https://www.explorefall.com/maps/Michigan-maps/${selectedDate().replaceAll('-','')}.png`,[[23.04,-126.07],[51.98,-64.97]],{opacity:.45,attribution:'Modeled foliage: <a href="https://www.explorefall.com/dev/michigan.html">Explore Fall</a> / <a href="https://www.michigan.org/fallcolormap">Pure Michigan</a>'}).addTo(overlay);
    layer.on('error',()=>{$('fallMapStatus').textContent+=' Color estimate unavailable for this date.';});
    key.append(el('span','Estimate colors: green 0–20 · yellow 20–40 · orange 40–60 · red 60–100 · brown past peak','fineprint'));
  }
  if($('showFallReports').checked&&['all','MN'].includes(region)){
    const mn=L.imageOverlay('https://maps.dnr.state.mn.us/cgi-bin/wms/fall_colors?VERSION=1.1.1&REQUEST=GetMap&SRS=EPSG:4326&WIDTH=1750&HEIGHT=1500&bbox=-98.1,43.0,-89.1,49.6&LAYERS=dummy&TRANSPARENT=TRUE&FORMAT=image/png',[[43,-98.1],[49.6,-89.1]],{opacity:.6,attribution:'Fall color map: MN DNR'}).addTo(overlay);
    mn.on('error',()=>{$('fallMapStatus').textContent+=' MN DNR layer unavailable; dated park observations remain below.';});
  }
  if(!$('showFallReports').checked)return;
  reports.forEach(r=>{
    const status=Nature.reportStatus(r,snapshot.retrievedAt),color=status!=='recent'?'#7f8b97':r.pastPeak?'#855749':(r.percent??r.percentLow)>=75?'#e57555':(r.percent??r.percentLow)>=50?'#eaa454':(r.percent??r.percentLow)>=25?'#d4c45d':'#65aa80';
    const marker=L.circleMarker([r.lat,r.lon],{radius:10,color:'#fff1d4',fillColor:color,fillOpacity:.95,weight:1.5}).addTo(overlay);
    marker.bindTooltip(el('span',`${r.name} · ${Nature.colorLabel(r)} color${status==='recent'?'':' · older'}`));
    const popup=el('div',null,'fall-report-popup');popup.append(el('p','FALL COLOR REPORT','eyebrow'),el('h3',r.name),el('strong',`${Nature.colorLabel(r)} reported color`),el('p',r.county?`${r.county} County`:regionNames[r.region]),el('p',`Updated ${reportTimeLabel(r)}${status==='recent'?'':' · Older / unverified observation'}`),el('p',`Reporter’s estimated peak: ${r.peak||'Unavailable'}`),el('p',`${r.source||'Reporter'} · A report point describes the surrounding area, not an exact foliage boundary.`,'fineprint'));
    popup.append(button('Report & weather here',()=>{selectDestination({id:`report:${r.id||r.name}`,reportOnly:true,name:r.name,lat:r.lat,lon:r.lon,region:r.region||'WI',county:r.county,tags:['fall'],summary:'Weather at this foliage report point. The color observation describes the reporter’s surrounding area.',source:r.sourceUrl,access:'This is a report location, not a verified public trailhead. Choose a destination for visit and access notes.'});closeSheet(false);openSheet();},'primary-link'));
    const nearby=Nature.filterPlaces(DESTINATIONS,{origin:r,radius:60}).slice(0,2);
    if(nearby.length){popup.append(el('p','Places nearby','eyebrow'));nearby.forEach(p=>popup.append(button(`${p.name} · ${Math.round(p.distance)} mi`,()=>{selectDestination(p);openSheet();},'quiet')));}
    marker.bindPopup(popup,{maxWidth:310});
  });
}

async function requestDrive(from,to) {
  const key=`${from.lat},${from.lon}:${to.lat},${to.lon}`,cached=driveCache.get(key);
  if(cached&&Date.now()-cached.checkedAt<30*60000)return cached;
  if(drivePending.has(key))return drivePending.get(key);
  const work=routeQueue.catch(()=>{}).then(async()=>{
    const wait=1000-(Date.now()-lastRouteRequest);if(wait>0)await new Promise(resolve=>setTimeout(resolve,wait));
    lastRouteRequest=Date.now();
    const data=await fetchJson(`https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=simplified&geometries=geojson&alternatives=false&steps=false`);
    const r=data.routes?.[0];if(data.code!=='Ok'||!r||!Number.isFinite(r.duration)||r.duration<0||!Number.isFinite(r.distance)||r.distance<0)throw Error('Road route unavailable.');
    const result={...r,checkedAt:Date.now()};driveCache.set(key,result);return result;
  });
  routeQueue=work.catch(()=>{});drivePending.set(key,work);work.finally(()=>{if(drivePending.get(key)===work)drivePending.delete(key);}).catch(()=>{});return work;
}

function arrangePage(nextView) {
  const orders={
    explore:['nearbyPanel','pageBrief','guideHeading','filterDrawer','seasonDashboard','mapSwitch','mapLayout','resultsHeading','destinationGrid','comparisonPanel','coverageNote','reportsPanel','auroraPanel'],
    fall:['guideHeading','filterDrawer','mapSwitch','mapLayout','seasonDashboard','reportsPanel','nearbyPanel','pageBrief','resultsHeading','destinationGrid','comparisonPanel','coverageNote','auroraPanel'],
    aurora:['workspaceTools','seasonDashboard','auroraPanel','pageBrief','guideHeading','filterDrawer','nearbyPanel','mapSwitch','mapLayout','resultsHeading','destinationGrid','comparisonPanel','coverageNote','reportsPanel'],
    winter:['workspaceTools','seasonDashboard','pageBrief','guideHeading','filterDrawer','mapSwitch','mapLayout','nearbyPanel','resultsHeading','destinationGrid','comparisonPanel','coverageNote','reportsPanel','auroraPanel'],
    weather:['mapLayout','seasonDashboard','guideHeading','filterDrawer','nearbyPanel','pageBrief','mapSwitch','resultsHeading','destinationGrid','comparisonPanel','coverageNote','reportsPanel','auroraPanel'],
    saved:['guideHeading','filterDrawer','resultsHeading','destinationGrid','mapLayout','pageBrief','seasonDashboard','mapSwitch','nearbyPanel','comparisonPanel','coverageNote','reportsPanel','auroraPanel']
  };
  if(orders[nextView])orders[nextView].forEach(id=>{const n=$(id);if(n)$('guide').append(n);});
  $('auroraPanel').open=false;
  $('auroraLocal').hidden=nextView!=='aurora';
  if(nextView==='aurora')$('guide').prepend?.($('auroraLocal'));
  if(!['winter','aurora'].includes(nextView))$('guide').prepend?.($('workspaceTools'));
  if(nextView==='aurora')loadOriginForecast();
}

const REGION_BOUNDS={all:[[41.6,-97.3],[49.4,-82.1]],WI:[[42.45,-92.95],[47.15,-86.75]],MN:[[43.45,-97.25],[49.4,-89.4]],MI:[[41.65,-87.1],[45.9,-82.1]],UP:[[45.05,-90.5],[48.35,-83.4]]};
function fitRegion(){if(map)map.fitBounds(REGION_BOUNDS[$('regionFilter').value]||REGION_BOUNDS.all);}
function setRegion(region){
  if(!REGION_BOUNDS[region])return;
  $('regionFilter').value=region;$('radiusFilter').value='all';$('showRegionalEstimates').checked=['MI','UP'].includes(region);
  document.querySelectorAll('[data-region]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.region===region)));
  if(typeof Community!=='undefined'&&Community.setRegion)Community.setRegion(region);
  $('mapHeading').textContent=view==='fall'?`${regionNames[region]||'GREAT LAKES'} FALL COLORS`:'EXPLORE THE REGION';
  mapRenderKey='';renderResults();renderReports();
  if(!['photos','weather'].includes(view)&&visible.length&&!visible.some(p=>p.id===selected?.id))selectDestination(visible[0]);else renderDestination();
  fitRegion();
}
async function resolveTown(lat,lon,version){
  try{
    const data=await fetchJson(`https://nominatim.openstreetmap.org/reverse?${new URLSearchParams({lat:lat.toFixed(3),lon:lon.toFixed(3),format:'jsonv2',zoom:'10',addressdetails:'1'})}`);
    if(version!==originVersion||origin.source!=='gps'||origin.lat!==lat||origin.lon!==lon)return;
    const name=Locator.townName(data);if(!name)return;
    origin={...origin,name};writeStorage('origin',origin);renderLocation();
    if(typeof Nearby!=='undefined')Nearby.sync();
    renderLocalAurora();if(view==='weather')selectDestination({...origin,id:'local',region:'LOCAL',tags:[],summary:'Forecast at your precise device coordinates.',access:'Weather does not establish road or trail conditions.'});
  }catch{/* Coordinates remain the source of truth when the town-name service is unavailable. */}
}
async function loadOriginForecast(){
  const key=forecastKey(origin);if(originForecastKey===key&&(originForecast===null||(originForecast&&Date.now()-originForecast.retrievedAt<30*60000)))return;originForecastKey=key;
  const from={...origin};
  try{const f=await getForecast(from);if(forecastKey(origin)!==key)return;originForecast=f;renderLocalAurora();}
  catch{if(forecastKey(origin)===key){originForecast=false;renderLocalAurora();}}
}
function renderLocalAurora(){
  const panel=$('auroraLocal');panel.hidden=view!=='aurora';if(panel.hidden)return;
  panel.replaceChildren();panel.append(el('p','NORTHERN LIGHTS / NEAR YOU','eyebrow'),el('h2',`The sky near ${origin.name}`));
  const chance=Nature.auroraAt(origin,aurora),metrics=el('div',null,'local-sky-metrics');
  const stat=(label,value)=>{const d=el('div');d.append(el('small',label),el('strong',value));return d;};
  const current=originForecast?.hours?.filter(h=>Math.abs(h.timestamp-Date.now())<=3600000).sort((a,b)=>Math.abs(a.timestamp-Date.now())-Math.abs(b.timestamp-Date.now()))[0];
  const sun=typeof SunCalc!=='undefined'?SunCalc.getPosition(new Date(),origin.lat,origin.lon).altitude*180/Math.PI:null;
  metrics.append(stat('Aurora overhead chance',chance==null?'Unavailable':`${Math.round(chance)}%`),stat('Local clouds',current?.cloud==null?'Unavailable':`${Math.round(current.cloud)}%`),stat('Your sky now',sun==null?'Unavailable':sun<=-18?'Dark':sun<0?'Twilight':'Daylight'));panel.append(metrics);
  panel.append(el('p',chance==null?'Waiting for a current NOAA forecast. No percentage is guessed.':`NOAA short-term estimate · valid ${timeLabel(aurora.validAt)} · approximately the next 30–90 minutes.`,'fineprint'));
  const details=el('details');details.append(el('summary','What does this percentage mean?'),el('p','NOAA’s model estimates aurora directly overhead, before local clouds, light pollution and your horizon. It is not a measured personal chance or an all-night forecast. Aurora can sometimes be visible low on the northern horizon even when the overhead percentage is low.','fineprint'));panel.append(details);
}
