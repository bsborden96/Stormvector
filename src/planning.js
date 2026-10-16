/* Seasonal summaries combine real model fields without inventing nature observations. */
const Planning = (() => {
  const N=typeof Nature!=='undefined'?Nature:require('./nature.js');
  function addDays(date,count) {const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+count);return d.toISOString().slice(0,10);}
  function nightSummary(forecast,date,kp=[],now=Date.now()) {
    const hours=N.nightHours(forecast,date,now);
    const known=hours.filter(h=>h.cloud!=null);
    const best=known.reduce((best,h)=>!best||h.cloud<best.cloud?h:best,null);
    // A NOAA three-hour interval must overlap a dark forecast hour at this destination.
    const intervals=kp.filter(row=>row.kind!=='observed'&&hours.some(h=>row.time<h.timestamp+3600000&&row.time+3*3600000>h.timestamp));
    return {hours,best,cloudCoverage:known.length,peakKp:intervals.length?Math.max(...intervals.map(r=>r.kp)):null,intervals};
  }
  const Sun=typeof SunCalc!=='undefined'?SunCalc:typeof require!=='undefined'?require('./vendor/suncalc.js'):null;
  function skyHours(forecast,date,place,kp=[],now=Date.now()) {
    return N.nightHours(forecast,date,now).map(h=>{
      const solar=Sun&&place?Sun.getPosition(new Date(h.timestamp),place.lat,place.lon).altitude*180/Math.PI:null;
      const moon=Sun&&place?Sun.getMoonPosition(new Date(h.timestamp),place.lat,place.lon):null;
      const illumination=Sun?Sun.getMoonIllumination(new Date(h.timestamp)).fraction:null;
      const interval=kp.find(r=>r.kind!=='observed'&&r.time<=h.timestamp&&r.time+3*3600000>h.timestamp);
      return {...h,dark:solar==null?null:solar<=-18,solar,moonUp:moon?moon.altitude>0:null,moonLight:illumination,kp:interval?.kp??null};
    });
  }
  function clearWindow(hours) {
    // At least two consecutive hourly samples; missing values and twilight break a window.
    let run=[],best=[];
    for(const h of hours){
      if(h.dark===true&&h.cloud!=null&&h.cloud<=25&&(!run.length||h.timestamp-run[run.length-1].timestamp===3600000))run.push(h);
      else{if(run.length>best.length)best=run;run=h.dark===true&&h.cloud!=null&&h.cloud<=25?[h]:[];}
    }
    if(run.length>best.length)best=run;
    return best.length>=2?best:[];
  }
  function outingWindow(forecast,date,now=Date.now()) {
    const hours=(forecast?.hours||[]).filter(h=>h.date===date&&h.timestamp>=now&&!h.night);
    let run=[],best=[];
    for(const h of hours){
      const good=h.temp!=null&&h.temp>=35&&h.temp<=85&&h.rainChance!=null&&h.rainChance<=25&&h.gust!=null&&h.gust<25&&h.code!=null&&![56,57,66,67,71,73,75,77,85,86,95,96,99].includes(h.code);
      if(good&&(!run.length||h.timestamp-run[run.length-1].timestamp===3600000))run.push(h);else{if(run.length>best.length)best=run;run=good?[h]:[];}
    }
    if(run.length>best.length)best=run;
    return best.length>=2?best:[];
  }
  function snowTotal(days) {return days.length&&days.every(d=>d.snow!=null)?days.reduce((sum,d)=>sum+d.snow,0):null;}
  return {addDays,nightSummary,skyHours,clearWindow,outingWindow,snowTotal};
})();
if(typeof module!=='undefined')module.exports=Planning;
