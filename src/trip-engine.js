/* Pure, explainable trip decisions. Missing fields never count as favorable conditions. */
const TripEngine = (() => {
  const N=typeof Nature!=='undefined'?Nature:require('./nature.js');
  const P=typeof Planning!=='undefined'?Planning:require('./planning.js');
  const finite=v=>typeof v==='number'&&Number.isFinite(v);
  function routeValid(route){return !!route&&finite(route.duration)&&route.duration>=0&&finite(route.distance)&&route.distance>=0;}
  function recentPhotos(items,place,now=Date.now(),radius=15){return (items||[]).filter(p=>finite(p.lat)&&finite(p.lon)&&N.miles(place,p)<=radius&&Number.isFinite(Date.parse(p.takenAt))&&Date.parse(p.takenAt)<=now&&Date.parse(p.takenAt)>=now-7*86400000).sort((a,b)=>Date.parse(b.takenAt)-Date.parse(a.takenAt));}
  function assess(place,forecast,date,reports,photos=[],intent='nature',now=Date.now()){
    const day=forecast?.days?.find(d=>d.date===date),reasons=[],cautions=[];
    const report=N.nearestReport(place,reports,now),window=P.outingWindow(forecast,date,now),recent=recentPhotos(photos,place,now);
    const known=!!day&&[day.code,day.high,day.rainChance,day.gust].every(finite)&&N.weather(day.code)[1]!=='Unavailable';
    if(known){
      if(window.length)reasons.push('A sustained mild, lower-rain daylight window is forecast');
      if(day.rainChance<=25)reasons.push(`${Math.round(day.rainChance)}% daily rain chance`);else cautions.push(`${Math.round(day.rainChance)}% daily precipitation chance; inspect hourly timing`);
      if(day.gust>=25)cautions.push(`Gusts up to ${Math.round(day.gust)} mph`);
      if(day.high<40)cautions.push('Cold daytime temperatures');if(day.high>90)cautions.push('Hot daytime temperatures');
      if([95,96,97,99].includes(day.code))cautions.push('Thunderstorm signal; check official alerts');
      if([56,57,66,67].includes(day.code))cautions.push('Freezing precipitation signal');
      if(day.snow>=.1||[71,73,75,77,85,86].includes(day.code))cautions.push('Snow forecast; verify roads and access');
    }else cautions.push('Weather guidance is incomplete or unavailable');
    if(intent==='fall'){if(report?.status==='recent')reasons.push(`${report.percent}% reported color in ${report.name}`);else cautions.push('No recent connected foliage observation for this place');}
    if(intent==='winter'){if(day&&finite(day.snow)&&day.snow>=.1)reasons.push(`${day.snow.toFixed(1)} in of new snow forecast`);else cautions.push('No fresh-snow signal in loaded guidance');}
    if(intent==='aurora')cautions.push('Use the clearer-sky comparison for nighttime conditions');
    if(recent.length)reasons.push(`${recent.length} loaded photo${recent.length===1?'':'s'} taken within 7 days and 15 miles`);
    const favorable=known&&window.length>=2&&cautions.length===0;
    const status=!known?'Weather unknown':favorable?'Promising weather':'Weather trade-offs';
    return {place,day,report,window,recent,reasons,cautions,status,priority:!known?2:favorable?0:1};
  }
  function budget({outbound,inbound,budgetMinutes,stayMinutes,bufferMinutes=15,departure,day}){
    if(![budgetMinutes,stayMinutes,bufferMinutes,departure].every(finite)||budgetMinutes<=0||stayMinutes<=0||bufferMinutes<0||!routeValid(outbound)||!routeValid(inbound))return {available:false};
    const outMinutes=Math.ceil(outbound.duration/60),backMinutes=Math.ceil(inbound.duration/60),totalMinutes=outMinutes+backMinutes+stayMinutes+bufferMinutes;
    const arrival=departure+outMinutes*60000,leave=arrival+stayMinutes*60000,home=departure+totalMinutes*60000;
    const daylight=finite(day?.sunrise)&&finite(day?.sunset)?arrival>=day.sunrise&&leave<=day.sunset:null;
    return {available:true,outMinutes,backMinutes,totalMinutes,stayMinutes,bufferMinutes,arrival,leave,home,departure,fitsBudget:totalMinutes<=budgetMinutes,daylight};
  }
  function sky(place,forecast,date,kp=[],localForecast=null,now=Date.now()){
    const hours=P.skyHours(forecast,date,place,kp,now);let best=null;
    for(let i=0;i<hours.length;i++){
      const group=hours.slice(i,i+3);if(group.length<2||group.some((h,j)=>h.dark!==true||!finite(h.cloud)||(j&&h.timestamp-group[j-1].timestamp!==3600000)))continue;
      const average=group.reduce((s,h)=>s+h.cloud,0)/group.length;
      if(!best||average<best.average||(average===best.average&&group.length>best.hours.length))best={hours:group,average,start:group[0].timestamp,end:group.at(-1).timestamp};
    }
    if(!best)return {place,available:false,hours};
    const matching=(localForecast?.hours||[]).filter(h=>best.hours.some(x=>x.timestamp===h.timestamp));
    const localClouds=matching.length===best.hours.length&&matching.every(h=>finite(h.cloud))?matching.reduce((s,h)=>s+h.cloud,0)/matching.length:null;
    const kpKnown=best.hours.filter(h=>finite(h.kp));
    return {place,available:true,...best,timezone:forecast.timezone,localClouds,improvement:localClouds==null?null:localClouds-best.average,kp:kpKnown.length===best.hours.length?Math.max(...kpKnown.map(h=>h.kp)):null,moonUp:best.hours.some(h=>h.moonUp),moonLight:best.hours[0].moonLight,partialNoaa:kpKnown.length<best.hours.length};
  }
  function foliageChanges(history,current,{origin,radius=150,now=Date.now()}={}){
    if(!current?.reports||!history?.snapshots)return [];
    const currentTime=Date.parse(current.retrievedAt);
    const prior=[...history.snapshots].filter(s=>Date.parse(s.retrievedAt)<currentTime).sort((a,b)=>Date.parse(b.retrievedAt)-Date.parse(a.retrievedAt))[0];
    if(!prior)return [];
    const before=new Map(prior.reports.map(r=>[r.id||r.name,r]));
    return current.reports.filter(r=>N.reportStatus(r,current.retrievedAt,now)==='recent'&&(!origin||N.miles(origin,r)<=radius)).flatMap(r=>{
      const old=before.get(r.id||r.name);if(!old||!finite(old.percent)||!finite(r.percent)||old.percent===r.percent)return [];
      return [{kind:'foliage',id:r.id||r.name,name:r.name,lat:r.lat,lon:r.lon,before:old.percent,after:r.percent,delta:r.percent-old.percent,priorAt:prior.retrievedAt,currentAt:current.retrievedAt,reportedAt:r.reportedAt}];
    }).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
  }
  function snowChanges(previous,current,date){
    if(!previous||!current||!finite(previous.retrievedAt)||!finite(current.retrievedAt)||current.retrievedAt<=previous.retrievedAt)return null;
    const before=previous.days?.find(d=>d.date===date)?.snow,after=current.days?.find(d=>d.date===date)?.snow;
    return finite(before)&&finite(after)&&Math.abs(after-before)>=.1?{before,after,delta:after-before,priorAt:previous.retrievedAt,currentAt:current.retrievedAt,date}:null;
  }
  function freshSubmissions(items,lastVisit,{origin,radius=150,now=Date.now()}={}){
    const since=finite(lastVisit)&&lastVisit<=now?lastVisit:now-86400000;
    return (items||[]).filter(p=>finite(p.lat)&&finite(p.lon)&&Date.parse(p.submittedAt)>since&&Date.parse(p.submittedAt)<=now&&(!origin||N.miles(origin,p)<=radius)).sort((a,b)=>Date.parse(b.submittedAt)-Date.parse(a.submittedAt));
  }
  return {routeValid,recentPhotos,assess,budget,sky,foliageChanges,snowChanges,freshSubmissions};
})();
if(typeof module!=='undefined')module.exports=TripEngine;
