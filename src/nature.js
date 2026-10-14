/* Pure data helpers shared by the nature guide and focused Node tests. */
const Nature = (() => {
  const value = x => typeof x === 'number' && Number.isFinite(x) ? x : null;
  const dateInZone = (time, zone) => {
    const parts = new Intl.DateTimeFormat('en-US', {timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(time));
    return ['year','month','day'].map(type=>parts.find(p=>p.type===type).value).join('-');
  };
  function miles(a,b) {
    const radians = d => d*Math.PI/180;
    const p1=radians(a.lat),p2=radians(b.lat),dp=p2-p1,dl=radians(b.lon-a.lon);
    const h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
    return 3958.7613*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
  }
  function filterPlaces(places,{region='all',interest='all',query='',radius=Infinity,origin,saved=null}) {
    const q=query.trim().toLowerCase();
    return places.filter(p => (region==='all'||p.region===region) && (interest==='all'||p.tags.includes(interest)) &&
      (!saved || saved.has(p.id)) && (!q || `${p.name} ${p.summary} ${p.tags.join(' ')}`.toLowerCase().includes(q)))
      .map(p=>({...p,distance:miles(origin,p)})).filter(p=>p.distance<=radius).sort((a,b)=>a.distance-b.distance);
  }
  function forecastUrl(place) {
    return `https://api.open-meteo.com/v1/forecast?${new URLSearchParams({latitude:place.lat,longitude:place.lon,
      daily:'weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_min,precipitation_probability_max,precipitation_sum,snowfall_sum,wind_gusts_10m_max,sunrise,sunset,daylight_duration',
      hourly:'cloud_cover,is_day,temperature_2m,precipitation_probability',temperature_unit:'fahrenheit',wind_speed_unit:'mph',
      precipitation_unit:'inch',timezone:'auto',timeformat:'unixtime',forecast_days:7})}`;
  }
  function parseForecast(data, now=Date.now()) {
    const u=data.daily_units||{},d=data.daily||{},h=data.hourly||{},hu=data.hourly_units||{};
    if (!Array.isArray(d.time)||!d.time.length) throw Error('Daily forecast missing');
    if (!['cm','inch'].includes(u.snowfall_sum)||u.temperature_2m_max!=='°F'||u.temperature_2m_min!=='°F'||
        u.apparent_temperature_min!=='°F'||u.wind_gusts_10m_max!=='mp/h'||u.precipitation_sum!=='inch'||u.time!=='unixtime') throw Error('Unexpected forecast units');
    const zone=data.timezone;
    // Reject invalid timezones; daily labels must belong to the destination, not the browser.
    dateInZone(now,zone);
    const get=(key,i)=>value(d[key]?.[i]);
    const days=d.time.slice(0,7).map((time,i)=>{
      if(value(time)==null) throw Error('Invalid forecast timestamp');
      const snow=get('snowfall_sum',i);
      return {date:dateInZone(time*1000,zone),timestamp:time*1000,code:get('weather_code',i),high:get('temperature_2m_max',i),low:get('temperature_2m_min',i),
        feels:get('apparent_temperature_min',i),rainChance:get('precipitation_probability_max',i),precip:get('precipitation_sum',i),
        snow:snow==null?null:snow/(u.snowfall_sum==='cm'?2.54:1),gust:get('wind_gusts_10m_max',i),
        sunrise:get('sunrise',i)==null?null:get('sunrise',i)*1000,sunset:get('sunset',i)==null?null:get('sunset',i)*1000,
        daylight:get('daylight_duration',i)==null?null:get('daylight_duration',i)/3600};
    });
    const hours=hu.time==='unixtime'&&hu.cloud_cover==='%' ? (h.time||[]).filter(t=>value(t)!=null).map((t,i)=>({
      timestamp:t*1000,date:dateInZone(t*1000,zone),cloud:value(h.cloud_cover?.[i]),night:h.is_day?.[i]===0,
      temp:hu.temperature_2m==='°F'?value(h.temperature_2m?.[i]):null,rainChance:value(h.precipitation_probability?.[i]),
    })) : [];
    return {days,hours,timezone:zone,retrievedAt:now};
  }
  function weather(code) {
    if(code===0)return ['☀','Clear'];
    if([1,2].includes(code))return ['◐','Partly cloudy'];
    if(code===3)return ['☁','Overcast'];
    if([45,48].includes(code))return ['≋','Fog'];
    if([56,57,66,67].includes(code))return ['◇','Freezing precipitation'];
    if([71,73,75,77,85,86].includes(code))return ['❄','Snow'];
    if([95,96,97,99].includes(code))return ['ϟ','Thunderstorms'];
    if([51,53,55,61,63,65,80,81,82].includes(code))return ['☂','Rain / showers'];
    return ['—','Unavailable'];
  }
  function outingNote(day) {
    if(!day||[day.high,day.rainChance,day.gust,day.code].some(x=>x==null)||weather(day.code)[1]==='Unavailable')return 'Weather guidance incomplete';
    if([95,96,97,99].includes(day.code))return 'Thunderstorm potential · check alerts';
    if([56,57,66,67].includes(day.code))return 'Freezing precipitation signal';
    if(day.snow>=0.1||[71,73,75,77,85,86].includes(day.code))return 'Snow in the forecast · check access';
    if(day.gust>=30)return 'Windy · exposed areas may be uncomfortable';
    if(day.rainChance>=60)return 'Bring a rain plan';
    if(day.high<40)return 'A cold outing · dress in layers';
    if(day.high>90)return 'Hot conditions · plan breaks';
    if(day.rainChance<=25&&day.gust<20&&day.high>=50&&day.high<=80)return 'A promising day outside';
    return 'Check the hourly timing';
  }
  function reportStatus(report, retrievedAt, now=Date.now()) {
    const reported=new Date(report?.reportedAt).getTime(),retrieved=new Date(retrievedAt).getTime();
    if(!report||!Number.isFinite(reported)||!Number.isFinite(retrieved)||reported>now+3600000||retrieved>now+3600000)return 'unavailable';
    if(now-reported>7*86400000||now-retrieved>36*3600000)return 'older';
    return 'recent';
  }
  function nearestReport(place,snapshot,now=Date.now()) {
    if(place.region!=='WI'||!snapshot?.reports)return null;
    const reports=snapshot.reports.filter(r=>r.county===place.county&&value(r.percent)!=null);
    if(!reports.length)return null;
    const report=reports.sort((a,b)=>miles(place,a)-miles(place,b))[0];
    return {...report,status:reportStatus(report,snapshot.retrievedAt,now),distance:miles(place,report)};
  }
  function parseAurora(data,now=Date.now()) {
    const parse=t=>new Date(/Z$|[+-]\d\d:\d\d$/.test(t||'')?t:`${t}Z`).getTime();
    const validAt=parse(data['Forecast Time']),observedAt=parse(data['Observation Time']);
    if(!Array.isArray(data.coordinates)||!Number.isFinite(validAt)||!Number.isFinite(observedAt))throw Error('Invalid NOAA aurora grid');
    const stale=now-observedAt>2*3600000||validAt<now-90*60000||observedAt>now+3600000;
    const points=data.coordinates.filter(p=>Array.isArray(p)&&p.length>=3&&p.every(Number.isFinite)&&p[1]>=40&&p[1]<=52)
      .map(([lon,lat,strength])=>({lon:lon>180?lon-360:lon,lat,strength}))
      .filter(p=>p.lon>=-98&&p.lon<=-80&&p.strength>=0&&p.strength<=100);
    return {validAt,observedAt,stale,points};
  }
  function auroraAt(place,grid) {
    if(!grid||grid.stale||!grid.points.length)return null;
    const point=grid.points.reduce((best,p)=>miles(place,p)<miles(place,best)?p:best);
    return miles(place,point)<100?point.strength:null;
  }
  function parseKp(rows,now=Date.now()) {
    if(!Array.isArray(rows)||!rows.length)throw Error('Invalid NOAA Kp feed');
    const headers=Array.isArray(rows[0])?rows[0]:null;
    if(headers&&!['time_tag','kp','observed'].every(key=>headers.includes(key)))throw Error('Unknown NOAA Kp schema');
    const get=(row,key)=>headers?row[headers.indexOf(key)]:row?.[key];
    return (headers?rows.slice(1):rows).map(row=>({time:new Date(String(get(row,'time_tag')).replace(' ','T').replace(/Z?$/,'Z')).getTime(),
      kp:get(row,'kp')===null||get(row,'kp')===''?null:Number(get(row,'kp')),kind:get(row,'observed')}))
      .filter(r=>Number.isFinite(r.time)&&value(r.kp)!=null&&r.kp>=0&&r.kp<=9&&r.time+3*3600000>=now&&r.time<now+72*3600000);
  }
  function nightHours(forecast,date,now=Date.now()) {
    if(!forecast)return [];
    // Evening of the selected date through 08:00 the next morning, in destination time.
    const next=new Date(`${date}T12:00:00Z`);next.setUTCDate(next.getUTCDate()+1);
    const nextDate=next.toISOString().slice(0,10);
    return forecast.hours.filter(h=>{
      const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:forecast.timezone,hour:'numeric',hourCycle:'h23'}).format(new Date(h.timestamp)));
      return h.night&&h.timestamp>=now&&((h.date===date&&hour>=16)||(h.date===nextDate&&hour<8));
    });
  }
  function daylightLabel(time,zone) {
    return time==null?'Unavailable':new Date(time).toLocaleTimeString([],{timeZone:zone,hour:'numeric',minute:'2-digit'});
  }
  function makeCache(ttl=30*60000) {
    const cache=new Map(),pending=new Map();
    return {async get(key,loader,now=Date.now()) {
      const old=cache.get(key);if(old&&now-old.savedAt<ttl)return old.data;
      if(pending.has(key))return pending.get(key);
      const work=Promise.resolve().then(loader).then(data=>{cache.set(key,{data,savedAt:Date.now()});return data}).finally(()=>pending.delete(key));
      pending.set(key,work);return work;
    },clear(){cache.clear();},peek(key){const old=cache.get(key);return old&&Date.now()-old.savedAt<ttl?old.data:null;}};
  }
  return {value,miles,filterPlaces,forecastUrl,parseForecast,weather,outingNote,reportStatus,nearestReport,parseAurora,auroraAt,parseKp,nightHours,dateInZone,daylightLabel,makeCache};
})();
if(typeof module!=='undefined')module.exports=Nature;
