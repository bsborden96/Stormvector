/* Four planning tools share the existing forecasts, location and destination details. */
const TripDesk = (() => {
  const $=id=>document.getElementById(id),T=TripEngine;
  const state={ready:false,view:null,mode:'worth',version:0,pending:false,key:null,rows:[],photos:[],photoError:null,photoFeed:null,history:null,historyError:null,local:null,previous:new Map(),latest:new Map(),lastVisit:null};
  let renderQueued=false;
  const n=(tag,text,cls)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;};
  const num=(x,s='',d=0)=>typeof x==='number'&&Number.isFinite(x)?x.toFixed(d)+s:'Unavailable';
  const time=(t,zone)=>Nature.daylightLabel(t,zone);
  function action(text,callback,cls='quiet'){const b=n('button',text,cls);b.type='button';b.addEventListener('click',callback);return b;}
  function current(){return {from:{...origin},date:selectedDate(),intent:$('deskIntent').value,radius:Number($('deskRadius').value),budget:Number($('deskBudget').value),stay:Number($('deskStay').value),depart:$('deskDepart').value};}
  function keyOf(o){return JSON.stringify([o.from.lat,o.from.lon,o.date,o.intent,o.radius,o.budget,o.stay,o.depart,state.mode]);}
  function init(){
    if(state.ready)return;state.ready=true;
    const old=readStorage('trip-journal',{});if(old&&typeof old==='object')Object.entries(old).forEach(([key,value])=>{if(value&&typeof value.retrievedAt==='number'&&Array.isArray(value.days))state.previous.set(key,value);});
    state.lastVisit=readStorage('desk-last-visit',null);writeStorage('desk-last-visit',Date.now());
    document.querySelectorAll('[data-desk]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.desk,true)));
    ['deskIntent','deskRadius','deskBudget','deskStay','deskDepart'].forEach(id=>$(id).addEventListener('change',()=>{invalidate();state.key=keyOf(current());$('deskStatus').textContent='Settings updated. Run the search to check these choices.';render();}));
    $('deskDate').addEventListener('change',()=>{const date=$('deskDate').value;if(date<$('tripDate').min||date>$('tripDate').max){$('deskStatus').textContent='Choose a date in the loaded seven-day forecast.';return;}$('tripDate').value=date;renderResults();renderDestination();});
    $('deskRun').addEventListener('click',run);$('deskCancel').addEventListener('click',()=>{invalidate();$('deskStatus').textContent='Search canceled. No more places will be queued.';});
    setDeparture();loadHistory();loadPhotos();
  }
  function observe(place,forecast){
    if(!state.ready||!forecast)return;
    const key=`${place.lat},${place.lon}`;
    const latest={name:place.name,lat:place.lat,lon:place.lon,retrievedAt:forecast.retrievedAt,timezone:forecast.timezone,days:forecast.days.map(d=>({date:d.date,snow:d.snow}))};
    if(!state.latest.has(key)||state.latest.get(key).retrievedAt<=latest.retrievedAt)state.latest.set(key,latest);
    const combined=new Map([...state.previous,...state.latest]);
    const stored=Object.fromEntries([...combined].sort((a,b)=>b[1].retrievedAt-a[1].retrievedAt).slice(0,40));writeStorage('trip-journal',stored);
    scheduleRender();
  }
  function scheduleRender(){if(!state.ready||renderQueued)return;renderQueued=true;requestAnimationFrame(()=>{renderQueued=false;if(state.view&&state.view!=='photos'&&state.view!=='saved')render();});}
  function invalidate(){state.version++;state.pending=false;state.rows=[];state.key=null;busy(false);}
  function busy(value){state.pending=value;$('deskRun').disabled=value;$('deskCancel').hidden=!value;}
  function setDeparture(){
    const date=selectedDate(),zone=state.local?.timezone||'America/Chicago',now=new Date(Date.now()+15*60000);
    $('deskDepart').value=date===Nature.dateInZone(now,zone)?new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now):'09:00';
  }
  function route(nextView){
    if(!state.ready)return;
    const changed=state.view!==nextView;state.view=nextView;const desk=$('tripDesk');desk.hidden=['photos','saved'].includes(nextView);if(desk.hidden){invalidate();return;}
    if(nextView==='fall'||nextView==='weather')$('mapLayout').after(desk);else if(nextView==='winter')$('seasonDashboard').after(desk);else $('pageBrief').before(desk);
    if(changed){$('deskIntent').value={fall:'fall',winter:'winter',aurora:'aurora'}[nextView]||'nature';setMode(nextView==='aurora'?'sky':'worth',false);}
    sync();
  }
  function setMode(mode,execute){
    invalidate();state.mode=mode;
    document.querySelectorAll('[data-desk]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.desk===mode)));
    ['deskBudgetLabel','deskStayLabel','deskDepartLabel'].forEach(id=>$(id).hidden=mode!=='budget');
    $('deskIntentLabel').hidden=mode==='sky'||mode==='changes';$('deskDateLabel').hidden=false;
    $('deskIntro').textContent={worth:'Compare scenery, forecast conditions, daylight, drive estimates and recent nearby photos. Each card explains its trade-offs.',budget:'Choose your total time and departure. We check both road directions, time at the destination, a 15-minute buffer, and daylight.',sky:'Compare dark-hour cloud windows at nearby places with clouds at your area during the same hours. Clear skies do not guarantee aurora.',changes:'Dated color observations, snowfall forecast revisions since your previous visit, and newly shared photos near your starting area.'}[mode];
    $('deskRun').textContent={worth:'Compare nearby places',budget:'Find outings that fit',sky:'Find clearer skies',changes:'Refresh changes'}[mode];
    $('deskNotes').textContent='';$('deskStatus').textContent='';
    render();if(execute)run();
  }
  function sync(){
    if(!state.ready||!state.view||['photos','saved'].includes(state.view))return;
    $('deskDate').min=$('tripDate').min;$('deskDate').max=$('tripDate').max;$('deskDate').value=selectedDate();
    $('deskOrigin').textContent=origin.source==='gps'?'From your GPS fix':`From ${origin.name}`;
    const next=keyOf(current());
    if(state.key!==null&&state.key!==next){invalidate();setDeparture();}
    if(state.key===null){state.key=keyOf(current());render();if(state.mode==='worth')run();}
    else render();
  }
  function candidates(o){return Nature.filterPlaces(DESTINATIONS,{origin:o.from,radius:o.radius,interest:state.mode==='sky'?'all':o.intent==='nature'?'all':o.intent});}
  async function loadPhotos(force=false){
    try{state.photoFeed=await Community.getFeed(force);state.photos=state.photoFeed.items;state.photoError=null;}catch{state.photoError='Community photos unavailable; no photo activity is inferred.';}scheduleRender();
  }
  async function loadHistory(){
    try{try{state.history=await fetchJson(`https://raw.githubusercontent.com/bsborden96/Stormvector/main/data/fall-history.json?t=${Math.floor(Date.now()/600000)}`);}catch{state.history=await fetchJson('data/fall-history.json');}if(!Array.isArray(state.history.snapshots))throw Error('Invalid history');state.historyError=null;}catch{state.history=null;state.historyError='Foliage history unavailable.';}scheduleRender();
  }
  async function run(){
    if(!state.ready||state.pending)return;
    const o=current(),date=o.date;if(date<$('tripDate').min||date>$('tripDate').max){$('deskStatus').textContent='Choose a date within the seven-day forecast.';return;}
    const version=++state.version;state.key=keyOf(o);state.rows=[];busy(true);$('deskStatus').textContent='Loading destination guidance…';
    const active=()=>version===state.version;
    try{
      if(state.mode==='changes'){await Promise.allSettled([loadPhotos(true),loadHistory(),loadReports(),loadForecasts(candidates(o).slice(0,6),active)]);if(active()){$('deskStatus').textContent='Changes refreshed from the available sources.';render();}return;}
      const limit=state.mode==='sky'?18:6,places=candidates(o).slice(0,limit);
      if(!places.length){$('deskStatus').textContent='No curated places match this distance and experience. Widen the search.';render();return;}
      let local;try{local=await getForecast(o.from);}catch{local=null;}
      if(!active())return;state.local=local;
      const forecasts=await loadForecasts(places,active);if(!active())return;
      if(state.mode==='budget'){
        let departure;try{departure=Date.parse(Community.captureTimestamp(`${o.date}T${o.depart}`,state.local?.timezone||'America/Chicago'));}catch{$('deskStatus').textContent='Choose a valid departure time.';return;}
        if(departure<Date.now()-60000){$('deskStatus').textContent='Departure is in the past. Choose a later time or another date.';return;}
        if(!state.local?.timezone){$('deskStatus').textContent='Local time-zone guidance is unavailable. Refresh before building a timed outing.';return;}
        for(let i=0;i<places.length;i++){
          if(!active())break;const p=places[i];$('deskStatus').textContent=`Checking round-trip roads ${i+1}/${places.length} · ${p.name}…`;
          let out=null,back=null;try{out=await requestDrive(o.from,p);if(!active())break;back=await requestDrive(p,o.from);}catch{}
          if(!active())break;
          const f=forecasts.get(p.id),day=f?.days.find(d=>d.date===o.date),plan=T.budget({outbound:out,inbound:back,budgetMinutes:o.budget,stayMinutes:o.stay,departure,day});
          state.rows.push({place:p,plan,out,back,assessment:T.assess(p,f,o.date,reportSnapshot,state.photos,o.intent),timezone:state.local.timezone});render();
        }
      }else if(state.mode==='sky'){
        state.rows=places.map(p=>T.sky(p,forecasts.get(p.id),date,kpRows,state.local)).sort((a,b)=>Number(b.available)-Number(a.available)||(a.average??101)-(b.average??101)||Number(b.place.tags.includes('aurora'))-Number(a.place.tags.includes('aurora'))||a.place.distance-b.place.distance);
      }else state.rows=places.map(p=>T.assess(p,forecasts.get(p.id),date,reportSnapshot,state.photos,o.intent)).sort((a,b)=>a.priority-b.priority||a.place.distance-b.place.distance);
      if(active()){$('deskStatus').textContent=`Checked ${state.rows.length} curated places within ${o.radius} straight-line miles.`;render();}
    }catch(e){if(active())$('deskStatus').textContent='Planning data is unavailable. Try again; no substitute estimates are shown.';}
    finally{if(active())busy(false);}
  }
  async function loadForecasts(places,active){
    const result=new Map();let cursor=0;
    await Promise.allSettled(Array.from({length:Math.min(3,places.length)},async()=>{while(cursor<places.length&&active()){const p=places[cursor++];try{result.set(p.id,await getForecast(p));}catch{result.set(p.id,null);}}}));return result;
  }
  function openPlace(p){selectDestination(p);openSheet();}
  function baseCard(place,label){const card=n('article',null,'desk-card');card.append(n('p',label,'eyebrow'),n('h3',place.name),n('p',`${Math.round(place.distance??Nature.miles(origin,place))} straight-line miles from your area`,'fineprint'));return card;}
  function buttons(card,p,includeDrive=true){const row=n('div',null,'desk-card-actions');row.append(action('Open place & alerts ↗',()=>openPlace(p),'primary-link'));
    const save=action(saved.has(p.id)?'★ Saved':'☆ Save',()=>{toggleSave(p.id);render();});save.setAttribute('aria-label',`${saved.has(p.id)?'Unsave':'Save'} ${p.name}`);save.setAttribute('aria-pressed',String(saved.has(p.id)));row.append(save);
    if(includeDrive){const cached=driveCache.get(`${origin.lat},${origin.lon}:${p.lat},${p.lon}`),checked=cached&&Date.now()-cached.checkedAt<30*60000?cached:null,b=action(checked?`Drive: ${Math.ceil(checked.duration/60)} min · ${Math.round(checked.distance/1609.344)} mi`:'Check one-way drive',async()=>{const startKey=keyOf(current()),from={...origin};b.disabled=true;b.textContent='Checking roads…';try{const route=await requestDrive(from,p);if(startKey!==keyOf(current()))return;b.textContent=`${Math.ceil(route.duration/60)} min one way · ${Math.round(route.distance/1609.344)} road mi`;if(state.mode==='sky'){const window=state.rows.find(r=>r.place.id===p.id);if(window?.available&&Date.now()+route.duration*1000>=window.end)card.append(n('p','This cloud window may end before you arrive.','desk-warning'));}}catch{b.textContent='Road estimate unavailable · retry';}finally{b.disabled=false;}});row.append(b);}
    card.append(row);
  }
  function photos(card,items){if(!items.length){card.append(n('p',state.photoError||'No loaded photos taken nearby within the last 7 days.','fineprint'));return;}
    const group=n('div',null,'desk-photo-row');items.slice(0,2).forEach(p=>{const figure=n('figure'),a=n('a'),img=n('img');a.href=Community.mediaUrl(p);a.target='_blank';a.rel='noopener noreferrer';img.src=a.href;img.alt=p.title||`${p.eventType} at ${p.location}`;img.loading='lazy';img.width=240;img.height=160;a.append(img);figure.append(a,n('figcaption',`${p.location} · taken ${new Date(p.takenAt).toLocaleDateString([],{timeZone:p.timezone})}`));group.append(figure);});card.append(group);}
  function render(){
    if(!state.ready)return;
    const root=$('deskResults');root.dataset.mode=state.mode;root.replaceChildren();if(state.mode==='changes'){renderChanges(root);return;}
    const o=current();let rows=state.rows;
    if(state.mode==='worth')rows=candidates(o).slice(0,6).map(p=>T.assess(p,forecastCache.peek(forecastKey(p)),o.date,reportSnapshot,state.photos,o.intent)).sort((a,b)=>a.priority-b.priority||a.place.distance-b.place.distance);
    if(state.mode==='sky'&&rows.length)rows=rows.map(r=>TripEngine.sky(r.place,forecastCache.peek(forecastKey(r.place)),o.date,kpRows,state.local)).sort((a,b)=>Number(b.available)-Number(a.available)||(a.average??101)-(b.average??101)||Number(b.place.tags.includes('aurora'))-Number(a.place.tags.includes('aurora'))||a.place.distance-b.place.distance);
    if(!rows.length){root.append(n('p',state.mode==='budget'?'Choose your time budget and press Find outings that fit.':state.mode==='sky'?'Press Find clearer skies to compare the selected night.':'No nearby places match these controls.','desk-empty'));return;}
    if(state.mode==='budget')rows=[...rows].sort((a,b)=>Number(b.plan.available&&b.plan.fitsBudget&&b.plan.daylight===true)-Number(a.plan.available&&a.plan.fitsBudget&&a.plan.daylight===true)||(a.plan.totalMinutes??Infinity)-(b.plan.totalMinutes??Infinity));
    rows.slice(0,6).forEach(row=>{
      const p=row.place;
      if(state.mode==='sky'){
        const card=baseCard(p,row.available?'DARK-HOUR CLOUD COMPARISON':'GUIDANCE UNAVAILABLE');
        if(row.available){card.append(n('strong',`${num(row.average,'%')} average clouds`,'desk-big'),n('p',`${time(row.start,row.timezone)}–${time(row.end,row.timezone)} · ${row.hours.length} hourly samples · ${row.timezone}`),n('p',row.improvement==null?'Cloud comparison at your area unavailable.':Math.abs(row.improvement)<1?'Similar cloud cover to your area at these hours.':`${num(Math.abs(row.improvement),' percentage points')} ${row.improvement>0?'less':'more'} cloud than your area at the same hours.`),n('p',`Window Kp: ${num(row.kp,'',1)} · ${row.moonUp?'Moon above horizon during part of window':'Moon below horizon'} · ${num(row.moonLight==null?null:row.moonLight*100,'%')} illuminated`,'fineprint'));
          if(row.average>25)card.append(n('p','The least-cloudy loaded window is still cloud-affected.','desk-warning'));
          if(row.partialNoaa)card.append(n('p','NOAA Kp does not cover this entire cloud window.','fineprint'));
        }else card.append(n('p','No consecutive fully dark hours with known clouds are loaded for this night.'));
        card.append(n('p','Night access, light pollution and an unobstructed northern horizon are not verified. Drive time is not included until checked.','fineprint'));buttons(card,p);root.append(card);return;
      }
      if(state.mode==='budget'){
        const plan=row.plan,label=!plan.available?'ROAD ESTIMATE UNAVAILABLE':!plan.fitsBudget?'OVER YOUR TIME BUDGET':plan.daylight===false?'FITS TIME / NOT DAYLIGHT':plan.daylight===null?'FITS TIME / DAYLIGHT UNKNOWN':'FITS YOUR TIME & DAYLIGHT';
        const card=baseCard(p,label);
        if(plan.available){card.append(n('strong',`${plan.totalMinutes} min total`,'desk-big'),n('p',`${plan.outMinutes} min out + ${plan.stayMinutes} min at the park + ${plan.backMinutes} min back + ${plan.bufferMinutes} min buffer`));
          const itinerary=n('ol',null,'desk-itinerary');[['Leave',plan.departure],['Arrive',plan.arrival],['Leave the destination',plan.leave],['Back, including buffer',plan.home]].forEach(([label,t])=>itinerary.append(n('li',`${label} · ${time(t,row.timezone)}`)));card.append(itinerary,n('p',`Times: ${row.timezone}. The visit allowance is not a claim that you can complete the full named trail.`,'fineprint'));
          if(!plan.fitsBudget)card.append(n('p',`Exceeds your budget by ${plan.totalMinutes-o.budget} minutes.`,'desk-warning'));
          if(plan.daylight!==true)card.append(n('p',plan.daylight===false?'The destination visit extends outside forecast daylight.':'Daylight data is unavailable; do not assume a daytime fit.','desk-warning'));
        }else card.append(n('p','Both road directions are needed to confirm a fit. No time is guessed from straight-line distance.'));
        card.append(n('p',row.assessment.status,'desk-verdict'));row.assessment.cautions.forEach(c=>card.append(n('p',c,'desk-warning')));buttons(card,p,false);root.append(card);return;
      }
      const card=baseCard(p,row.status.toUpperCase()),guide=Experience.guide(p);card.append(n('p',guide?.stop||p.summary));
      const list=n('ul',null,'desk-reasons');row.reasons.forEach(reason=>list.append(n('li',reason)));card.append(list);
      row.cautions.forEach(c=>card.append(n('p',c,'desk-warning')));
      if(row.window.length)card.append(n('p',`Daylight weather window: ${time(row.window[0].timestamp,forecastCache.peek(forecastKey(p))?.timezone)}–${time(row.window.at(-1).timestamp,forecastCache.peek(forecastKey(p))?.timezone)}`));
      if(row.day)card.append(n('p',`${num(row.day.high,'°')} / ${num(row.day.low,'°')} · Sunset ${time(row.day.sunset,forecastCache.peek(forecastKey(p))?.timezone)}`,'fineprint'));
      photos(card,row.recent);card.append(n('p','Official alerts are checked when you open this place. Access and trail conditions require review.','fineprint'));buttons(card,p);root.append(card);
    });
    $('deskNotes').textContent=state.mode==='budget'?'Checks the six closest matching curated destinations, not every possible outing. OSRM road estimates omit traffic and weather delays and can include ferries. Travel-time fit does not confirm opening hours or safe access.':state.mode==='sky'?'Sorted by average clouds in the best consecutive fully dark window, then northern-sky interest and distance. Clouds: Open-Meteo; darkness/moon: SunCalc; Kp: NOAA. This is not an aurora visibility probability.':'Compares up to six closest matching curated places. Promising weather uses the displayed mild-weather window criteria; it is not a safety clearance. Photos are within 15 miles and 7 days, and may show a different nearby spot.';
  }
  function renderChanges(root){
    const o=current(),colors=T.foliageChanges(state.history,reportSnapshot,{origin:o.from,radius:o.radius});
    const colorBox=n('section',null,'desk-card');colorBox.append(n('p','FOLIAGE / DATED OBSERVATIONS','eyebrow'),n('h3','Color reports that changed'));
    if(!colors.length)colorBox.append(n('p',state.historyError||(!state.history?'Loading published report history…':'No changed recent color percentages within this radius in the two latest published snapshots.')));
    colors.slice(0,8).forEach(change=>{const row=n('div',null,'change-row');row.append(n('strong',change.name),n('p',`${change.before}% → ${change.after}% reported color`),n('p',`Snapshots ${timeLabel(change.priorAt)} → ${timeLabel(change.currentAt)} · Reporter updated ${timeLabel(change.reportedAt)}`,'fineprint'),action('Locate report',()=>{location.hash='#fall';requestAnimationFrame(()=>{setMapDisplay('map');if(map)map.setView([change.lat,change.lon],10);$('mapLayout').scrollIntoView({behavior:'smooth'});});}));colorBox.append(row);});root.append(colorBox);
    const snowBox=n('section',null,'desk-card');snowBox.append(n('p','SNOW / MODEL REVISIONS','eyebrow'),n('h3','Snow forecasts since your last visit'));
    let comparisons=0,changes=0;
    for(const [key,forecast] of state.latest){if(Nature.miles(o.from,forecast)>o.radius)continue;const old=state.previous.get(key);if(old)comparisons++;
      const change=T.snowChanges(old,forecast,o.date);if(!change)continue;changes++;const row=n('div',null,'change-row');row.append(n('strong',forecast.name),n('p',`${dayLabel(o.date)} · ${num(change.before,' in',1)} → ${num(change.after,' in',1)} forecast snowfall`),n('p',`${timeLabel(change.priorAt)} → ${timeLabel(change.currentAt)}. A forecast revision, not measured snow.`,'fineprint'));snowBox.append(row);
    }
    if(!changes)snowBox.append(n('p',comparisons?'No snowfall revisions of at least 0.1 in for the selected date in the loaded comparisons.':'No matching previous-visit forecast baseline yet. This browser is saving the loaded forecasts for your next visit.'));
    snowBox.append(n('p',`Forecast date: ${dayLabel(o.date)}. Baselines stay in this browser; missing days and unavailable data are not treated as zero snow.`,'fineprint'));root.append(snowBox);
    const photoBox=n('section',null,'desk-card');photoBox.append(n('p','COMMUNITY / NEW SUBMISSIONS','eyebrow'),n('h3','Newly shared near your area'));
    const submissions=T.freshSubmissions(state.photos,state.lastVisit,{origin:o.from,radius:o.radius});
    if(!submissions.length)photoBox.append(n('p',state.photoError||(state.photoFeed?'No new loaded submissions within this radius.':'Loading community submissions…')));
    submissions.slice(0,6).forEach(p=>{const row=n('div',null,'change-row');row.append(n('strong',p.title||p.location),n('p',`${p.eventType} · ${p.location}`),n('p',`Taken ${new Date(p.takenAt).toLocaleString([],{timeZone:p.timezone,dateStyle:'medium',timeStyle:'short'})} · Submitted ${timeLabel(p.submittedAt)}`,'fineprint'));const a=n('a','View photo ↗','quiet');a.href=Community.mediaUrl(p);a.target='_blank';a.rel='noopener noreferrer';row.append(a);photoBox.append(row);});
    photoBox.append(n('p',`${typeof state.lastVisit==='number'?`Submitted since this browser’s previous visit (${timeLabel(state.lastVisit)})`:'First visit: submissions in the past 24 hours'}. Capture time is shown separately; an older photo can be newly submitted.${state.photoFeed?.hasMore?' Only the latest 100 submissions are loaded.':''}`,'fineprint'));root.append(photoBox);
    $('deskNotes').textContent='Foliage compares published source snapshots. Snow compares the same location and forecast date with this browser’s prior loaded forecast. Newly submitted photos are not treated as current conditions.';
  }
  return {init,route,sync,observe,run};
})();
