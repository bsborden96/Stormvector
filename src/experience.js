/* Presentation helpers and transparent destination ordering. No invented trip scores. */
const Experience = (() => {
  const N=typeof Nature!=='undefined'?Nature:require('./nature.js');
  const P=typeof Planning!=='undefined'?Planning:require('./planning.js');
  const number=(v,s='',d=0)=>v==null?'Unavailable':`${v.toFixed(d)}${s}`;
  function node(tag,text,cls){const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;}
  function rank(places,view,reports,cache,date,kp,now=Date.now()) {
    const result=[...places];
    if(view==='fall')return result.sort((a,b)=>{
      const ar=N.nearestReport(a,reports,now),br=N.nearestReport(b,reports,now);
      const priority=r=>r?.status==='recent'?(r.percent??r.percentLow??-1):-1;
      return priority(br)-priority(ar)||a.distance-b.distance;
    });
    if(view==='aurora')return result.sort((a,b)=>Number(b.tags.includes('aurora'))-Number(a.tags.includes('aurora'))||a.distance-b.distance);
    if(view==='winter')return result.sort((a,b)=>{
      const snow=p=>cache.peek(`${p.lat},${p.lon}`)?.days.find(d=>d.date===date)?.snow??-1;
      return snow(b)-snow(a)||Number(b.tags.includes('winter'))-Number(a.tags.includes('winter'))||a.distance-b.distance;
    });
    return result;
  }
  function renderHero(view){
    if(typeof GUIDE_SCENES==='undefined')return;
    const photo=GUIDE_SCENES[view]||GUIDE_SCENES.explore;if(!photo)return;
    const image=document.getElementById('heroImage');if(image.getAttribute('src')!==photo.src)image.src=photo.src;
    image.alt=photo.caption;document.getElementById('sceneLabel').textContent=photo.caption;
    const credit=document.getElementById('heroCredit');credit.textContent=photo.credit;credit.href=photo.source;
  }
  function guide(place){return typeof FIELD_GUIDE!=='undefined'?FIELD_GUIDE[place.id]:null;}
  function renderGuide(panel,place){
    const detail=guide(place);if(!detail)return;
    const block=node('section',null,'field-guide detail-block');block.append(node('p','THE FIELD GUIDE','eyebrow'),node('h3',detail.stop));
    const dl=node('dl',null,'guide-facts');
    for(const [label,text] of [['The walk',detail.walk],['Terrain',detail.effort],['Plan ahead',detail.practical],['Admission',detail.fees]])if(text){dl.append(node('dt',label),node('dd',text));}
    block.append(dl);
    if(detail.source){const a=node('a','Park guide & access details ↗');a.href=detail.source;a.target='_blank';a.rel='noopener noreferrer';block.append(a);}
    block.append(node('p',`Guide checked ${detail.checkedAt}. Access can change; this is not a live closure feed.`,'fineprint'));panel.append(block);
  }
  function renderHourly(panel,forecast,date,place,kp,view,now=Date.now()) {
    if(!forecast)return;
    const section=node('section',null,'hourly-panel detail-block');
    section.append(node('p',view==='aurora'?'CLOUDS / DARKNESS / ACTIVITY':'HOUR BY HOUR','eyebrow'),node('h3',view==='aurora'?'Your night, hour by hour':'Find your outdoor window'));
    const hours=view==='aurora'?P.skyHours(forecast,date,place,kp,now):(forecast.hours||[]).filter(h=>h.date===date&&h.timestamp>=now).slice(0,18);
    const window=view==='aurora'?P.clearWindow(hours):P.outingWindow(forecast,date,now);
    if(window.length){section.append(node('p',`${view==='aurora'?'A sustained dark-sky cloud window':'A promising daylight window'}: ${N.daylightLabel(window[0].timestamp,forecast.timezone)}–${N.daylightLabel(window[window.length-1].timestamp,forecast.timezone)}.`,'window-summary'));}
    else section.append(node('p',view==='aurora'?'No sustained window with ≤25% clouds during full darkness appears in the loaded hours.':'No sustained window meets the mild, low-rain and lower-wind criteria in the loaded hours.','window-summary'));
    if(view==='aurora')section.append(node('p','A clear window describes sky conditions, not aurora visibility. Kp is global activity; local visibility also depends on latitude and the northern horizon.','fineprint'));
    const strip=node('div',null,'hour-timeline');strip.setAttribute('tabindex','0');strip.setAttribute('aria-label',view==='aurora'?'Hourly nighttime cloud, darkness, moon and Kp guidance':'Hourly temperature, rain and wind guidance');
    hours.forEach(h=>{
      const column=node('div',null,`hour-cell ${h.dark?'full-dark':''}`);column.append(node('small',N.daylightLabel(h.timestamp,forecast.timezone)));
      if(view==='aurora'){
        const meter=node('div',null,'cloud-meter'),bar=node('span');bar.style.height=h.cloud==null?'0%':`${h.cloud}%`;meter.append(bar);column.append(meter,node('strong',number(h.cloud,'%')),node('small','clouds'),node('span',h.dark===null?'Darkness unknown':h.dark?'Full darkness':'Twilight'),node('span',`Kp ${number(h.kp,'',1)}`),node('small',h.moonUp===null?'Moon unavailable':h.moonUp?`Moon up · ${number(h.moonLight==null?null:h.moonLight*100,'%')}`:'Moon below horizon'));
      }else column.append(node('strong',number(h.temp,'°')),node('span',`${number(h.rainChance,'%')} rain`),node('span',`${number(h.gust,' mph')} gusts`));
      strip.append(column);
    });
    if(!hours.length)section.append(node('p','Hourly guidance is unavailable for the selected date.'));
    else section.append(strip);
    section.append(node('p',view==='aurora'?`Times at destination · ${forecast.timezone}. Full darkness: sun below −18°. Moon position and illumination: SunCalc calculations. Clouds: Open-Meteo; Kp: NOAA. No local light-pollution survey.`:`${forecast.timezone} · Promising window: at least two consecutive daylight samples, 35–85°F, rain chance ≤25%, gusts <25 mph, without snow, freezing rain or thunder codes. Model guidance, not a guarantee.`,'fineprint'));panel.append(section);
  }
  function currentSnow(forecast,now=Date.now()) {
    const hours=(forecast?.hours||[]).filter(h=>h.timestamp<=now&&now-h.timestamp<2*3600000&&h.snowDepth!=null);
    return hours.length?hours[hours.length-1]:null;
  }
  function renderCurrent(panel,forecast,now=Date.now()){
    const c=forecast?.current;if(!c||now-c.timestamp>2*3600000||c.timestamp>now+3600000)return;
    const block=node('div',null,'current-conditions');block.append(node('p','CURRENT MODEL CONDITIONS','eyebrow'),node('strong',number(c.temp,'°F')),node('span',N.weather(c.code)[1]),node('p',`Feels like ${number(c.feels,'°')} · Wind ${number(c.wind,' mph')} · Gusts ${number(c.gust,' mph')}`),node('small',`Open-Meteo · ${N.daylightLabel(c.timestamp,forecast.timezone)} destination time`));panel.append(block);
  }
  return {rank,renderHero,guide,renderGuide,renderHourly,currentSnow,renderCurrent};
})();
if(typeof module!=='undefined')module.exports=Experience;
