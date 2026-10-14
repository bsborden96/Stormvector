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
  function snowTotal(days) {return days.length&&days.every(d=>d.snow!=null)?days.reduce((sum,d)=>sum+d.snow,0):null;}
  return {addDays,nightSummary,snowTotal};
})();
if(typeof module!=='undefined')module.exports=Planning;
