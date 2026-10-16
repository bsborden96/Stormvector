/* Distinct seasonal dashboards and destination card summaries. */
const SeasonalViews = (() => {
  const N=typeof Nature!=='undefined'?Nature:require('./nature.js');
  const P=typeof Planning!=='undefined'?Planning:require('./planning.js');
  const fmt=(v,s='',d=0)=>v==null?'Unavailable':`${v.toFixed(d)}${s}`;
  const label=date=>new Date(`${date}T12:00:00Z`).toLocaleDateString([],{timeZone:'UTC',weekday:'short',month:'short',day:'numeric'});
  function element(tag,text,cls) {const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;}
  function stat(label,value,detail) {const s=element('div',null,'season-stat');s.append(element('small',label),element('strong',value));if(detail)s.append(element('span',detail));return s;}
  function choose(text,date,onDate) {const b=element('button',text,'quiet');b.type='button';b.addEventListener('click',()=>onDate(date));return b;}
  function render(panel,{view,place,forecast,reports,kp,date,onDate,now=Date.now()}) {
    panel.replaceChildren();panel.hidden=!['aurora','winter','fall','weather'].includes(view);if(panel.hidden)return;
    const head=element('div',null,'mission-head');head.append(element('p',{aurora:'NIGHT SKY / THREE NIGHTS',winter:'WINTER / SEVEN-DAY SNOW GUIDANCE',fall:'FALL / THE COLOR DESK',weather:'WEATHER / YOUR WEEK AHEAD'}[view],'eyebrow'),element('h2',{aurora:'Follow the night.',winter:'Watch the snow line.',fall:'Find the color while it lasts.',weather:'Your forecast, at a glance.'}[view]));panel.append(head);
    if(view==='fall') {
      if(!reports){panel.append(element('p','Loading dated Wisconsin foliage observations…'));return;}
      const recent=reports.reports.filter(r=>N.reportStatus(r,reports.retrievedAt,now)==='recent');
      const stats=element('div',null,'season-stats');stats.append(stat('Report locations',String(reports.reports.length),'Wisconsin coverage'),stat('Updated recently',String(recent.length),'Reporter and snapshot freshness checked'),stat('85–100% reported color',String(recent.filter(r=>r.percent>=85).length),'Reported color, not leaf retention'));panel.append(stats);
      const report=place&&N.nearestReport(place,reports,now),callout=element('div',null,'foliage-callout');
      callout.append(element('h3',place?place.name:'Choose a destination'));
      if(report){callout.append(element('strong',`${fmt(report.percent,'%')} reported color near ${report.name}`),element('p',`Estimated peak: ${report.peak||'unavailable'} · ${report.status==='recent'?'Recent observation':'Older / unverified observation'}`));const bar=element('div',null,'color-track'),fill=element('span');fill.style.width=`${report.percent}%`;bar.append(fill);callout.append(bar);}
      else callout.append(element('p','No current foliage feed is connected for this destination. Wisconsin report markers and the county table remain available below.'));
      callout.append(element('p','Color observations describe the reporter’s area today. Your trip date selects destination weather, not a future color percentage.','fineprint'));panel.append(callout);return;
    }
    panel.append(element('p',place?`${place.name} · ${forecast?.timezone||'destination time'}`:'Select a place to see its seasonal forecast.','mission-location'));
    if(!forecast){panel.append(element('p',forecast===false?'Destination forecast unavailable. Try Refresh data.':'Loading destination conditions…','loading'));return;}
    if(view==='aurora'){
      const nights=element('div',null,'night-grid');
      for(let i=0;i<3;i++){
        const d=P.addDays(date,i),night=P.nightSummary(forecast,d,kp,now),card=element('article',null,'night-card');
        card.append(element('p',label(d),'eyebrow'),element('h3',i===0?'Your selected night':i===1?'The following night':'Two nights ahead'));
        const m=element('div',null,'night-metrics');m.append(stat('Sustained dark cloud window',(()=>{const window=P.clearWindow(P.skyHours(forecast,d,place,kp,now));return window.length?`${N.daylightLabel(window[0].timestamp,forecast.timezone)}–${N.daylightLabel(window[window.length-1].timestamp,forecast.timezone)}`:'None in guidance';})(),'At least two samples ≤25% clouds; full darkness'),stat('NOAA peak nighttime Kp',fmt(night.peakKp,'',1),night.peakKp==null?'Beyond or missing NOAA guidance':'Three-hour forecast / estimate'));
        const plan=choose('Plan this night',d,onDate);plan.disabled=!forecast.days.some(day=>day.date===d);
        card.append(m,element('p',night.best?night.best.cloud<=25?'A lower-cloud window. Geomagnetic activity and the northern horizon still matter.':night.best.cloud>=75?'Clouds may obstruct the sky during this window.':'Variable clouds. Check the hourly sky window.':'Forecast data is incomplete for this night.','night-note'),plan);nights.append(card);
      }
      panel.append(nights,element('p',`Cloud timing is from Open-Meteo, loaded ${new Date(forecast.retrievedAt).toLocaleString()}. Kp describes global activity; it is not a local visibility probability. NOAA guidance ends sooner than the seven-day weather forecast. Current OVATION activity remains a separate short-term map.`,'fineprint'));return;
    }
    const days=forecast.days.filter(d=>d.date>=date);
    if(view==='winter'){
      const stats=element('div',null,'season-stats');const selectedDay=days[0];
      const depth=forecast.hours.filter(h=>h.timestamp<=now&&now-h.timestamp<2*3600000&&h.snowDepth!=null).slice(-1)[0];
      panel.append(element('p',`Snow on the ground now: ${fmt(depth?.snowDepth,' in',1)} · model depth, not a field measurement.`,'snow-depth-note'));
      stats.append(stat('Forecast snow',fmt(P.snowTotal(days),' in',1),`Total over ${days.length} loaded calendar days`),stat('Lowest air temperature',days.length&&days.every(d=>d.low!=null)?fmt(Math.min(...days.map(d=>d.low)),'°F'):'Unavailable','Across these forecast days'),stat('Selected-day feels like low',fmt(selectedDay?.feels,'°F'),'Model apparent temperature'));panel.append(stats);
      const week=element('div',null,'snow-week');const max=Math.max(1,...days.map(d=>d.snow||0));
      days.forEach(d=>{const card=element('button',null,'snow-day');card.type='button';card.setAttribute('aria-pressed',String(d.date===date));const track=element('div',null,'snow-track'),bar=element('div',null,'snow-bar');bar.style.height=d.snow==null?'0px':`${Math.max(d.snow>0?4:0,d.snow/max*70)}px`;track.append(bar);card.append(element('small',label(d.date)),track,element('strong',fmt(d.snow,' in',1)),element('span',`${fmt(d.high,'°')} / ${fmt(d.low,'°')}`));card.addEventListener('click',()=>onDate(d.date));week.append(card);});panel.append(week,element('p',`Daily snow covers the entire calendar day. It is not measured snow depth, trail access, frozen waterfalls, or lake ice. Forecast loaded ${new Date(forecast.retrievedAt).toLocaleString()}.`,'fineprint'));return;
    }
    const week=element('div',null,'weather-week');forecast.days.forEach(d=>{const card=element('button',null,'forecast-day');card.type='button';card.setAttribute('aria-pressed',String(d.date===date));card.append(element('small',label(d.date)),element('span',N.weather(d.code)[0],'day-icon'),element('strong',`${fmt(d.high,'°')} / ${fmt(d.low,'°')}`),element('span',`${fmt(d.rainChance,'%')} precip.`),element('small',`${fmt(d.gust,' mph')} gusts`));card.addEventListener('click',()=>onDate(d.date));week.append(card);});panel.append(week,element('p',`Open-Meteo daily model guidance · Loaded ${new Date(forecast.retrievedAt).toLocaleString()}. Select a day for details and daylight.`,'fineprint'));
  }
  function cardNote(view,place,forecast,reports,kp,date,now=Date.now()) {
    if(!forecast)return '';
    const day=forecast.days.find(d=>d.date===date);if(!day)return 'Selected date is outside this forecast.';
    if(view==='aurora'){
      const night=P.nightSummary(forecast,date,kp,now);
      return `Night clouds: ${night.best?fmt(night.best.cloud,'%')+' lowest':'unavailable'} · Nighttime Kp: ${fmt(night.peakKp,'',1)}`;
    }
    if(view==='winter')return `New snow ${fmt(day.snow,' in',1)} · Model depth now ${fmt(forecast.hours.filter(h=>h.timestamp<=now&&now-h.timestamp<2*3600000&&h.snowDepth!=null).slice(-1)[0]?.snowDepth,' in',1)} · Feels like low ${fmt(day.feels,'°F')}`;
    if(view==='fall')return `Fall outing: ${N.outingNote(day)} · Sunset ${N.daylightLabel(day.sunset,forecast.timezone)}`;
    return N.outingNote(day);
  }
  return {render,cardNote};
})();
if(typeof module!=='undefined')module.exports=SeasonalViews;
