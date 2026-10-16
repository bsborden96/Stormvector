const {test}=require('node:test');
const assert=require('node:assert/strict');
const T=require('../src/trip-engine.js');
const now=Date.parse('2026-10-16T15:00Z'),place={id:'test',name:'Test park',region:'WI',county:'Dodge',lat:43.6,lon:-88.7,tags:['fall']};
const date='2026-10-16';
const forecast={retrievedAt:now,timezone:'America/Chicago',days:[{date,code:0,high:65,rainChance:5,gust:10,snow:0,sunrise:now-3*3600000,sunset:now+8*3600000}],hours:[0,1,2].map(i=>({timestamp:now+i*3600000,date,night:false,temp:60,rainChance:5,gust:10,code:0}))};

test('worth-trip assessment explains weather and never treats missing data as favorable',()=>{
  assert.equal(T.assess(place,forecast,date,null,[],'nature',now).status,'Promising weather');
  assert.equal(T.assess(place,null,date,null,[],'nature',now).status,'Weather unknown');
  const f=structuredClone(forecast);f.days[0].gust=null;assert.equal(T.assess(place,f,date,null,[],'nature',now).status,'Weather unknown');
  const storm=structuredClone(forecast);storm.days[0].code=95;assert.equal(T.assess(place,storm,date,null,[],'nature',now).status,'Weather trade-offs');
  assert.ok(T.assess(place,forecast,date,null,[],'fall',now).cautions.some(c=>c.includes('foliage')));
});
test('two-hour budget counts both road directions, visit and buffer and checks daylight',()=>{
  const plan=T.budget({outbound:{duration:20*60,distance:20000},inbound:{duration:35*60,distance:25000},budgetMinutes:120,stayMinutes:45,departure:now,day:forecast.days[0]});
  assert.equal(plan.totalMinutes,115);assert.equal(plan.fitsBudget,true);assert.equal(plan.daylight,true);assert.equal(plan.home,now+115*60000);
  const late=T.budget({outbound:{duration:20*60,distance:1},inbound:{duration:35*60,distance:1},budgetMinutes:90,stayMinutes:45,departure:now+8*3600000,day:forecast.days[0]});
  assert.equal(late.fitsBudget,false);assert.equal(late.daylight,false);
  assert.equal(T.budget({outbound:{duration:1,distance:1},inbound:null,budgetMinutes:120,stayMinutes:45,departure:now}).available,false);
  assert.equal(T.budget({outbound:{duration:1,distance:1},inbound:{duration:1,distance:1},budgetMinutes:120,stayMinutes:45,departure:now}).daylight,null);
});
test('photo evidence requires recent capture and nearby coordinates, separate from submission time',()=>{
  const items=[{id:'recent',lat:place.lat,lon:place.lon,takenAt:new Date(now-1000).toISOString(),submittedAt:new Date(now-500).toISOString()},{id:'old',lat:place.lat,lon:place.lon,takenAt:'2026-01-01',submittedAt:new Date(now-500).toISOString()},{id:'far',lat:48,lon:-95,takenAt:new Date(now-1000).toISOString(),submittedAt:new Date(now-500).toISOString()}];
  assert.deepEqual(T.recentPhotos(items,place,now).map(p=>p.id),['recent']);
  assert.deepEqual(T.freshSubmissions(items,now-2000,{origin:place,radius:100,now}).map(p=>p.id),['recent','old']);
});
test('sky ranking compares the same dark hours locally and rejects gaps and missing clouds',()=>{
  const t=Date.parse('2026-10-17T03:00Z'),times=[t,t+3600000,t+7200000];
  const f={timezone:'America/Chicago',hours:times.map(timestamp=>({timestamp,date:require('../src/nature.js').dateInZone(timestamp,'America/Chicago'),night:true,cloud:10}))};
  const local={...f,hours:f.hours.map(h=>({...h,cloud:80}))};
  const sky=T.sky(place,f,date,[{time:t,kp:4,kind:'predicted'}],local,now);
  assert.equal(sky.available,true);assert.equal(sky.average,10);assert.equal(sky.improvement,70);assert.equal(sky.kp,4);assert.equal(sky.hours.length,3);
  const missing={...f,hours:f.hours.map((h,i)=>({...h,cloud:i===1?null:10}))};assert.equal(T.sky(place,missing,date,[],local,now).available,false);
  const unknown=T.sky(place,f,date,[],null,now);assert.equal(unknown.localClouds,null);assert.equal(unknown.kp,null);
});
test('foliage changes match real reports across snapshots and exclude stale reports',()=>{
  const priorAt='2026-10-15T15:00Z',r={...place,id:'report',percent:50,reportedAt:'2026-10-16T14:00Z'};
  const history={snapshots:[{retrievedAt:priorAt,reports:[{...r,percent:25}]}]},current={retrievedAt:new Date(now).toISOString(),reports:[r]};
  const c=T.foliageChanges(history,current,{origin:place,now});assert.equal(c[0].delta,25);assert.equal(c[0].before,25);
  current.reports[0].reportedAt='2026-09-01';assert.equal(T.foliageChanges(history,current,{origin:place,now}).length,0);
  assert.deepEqual(T.foliageChanges(null,current,{now}),[]);
});
test('snow revisions compare the same forecast date and preserve unknown instead of zero',()=>{
  const old={retrievedAt:now-86400000,days:[{date,snow:1}]},next={retrievedAt:now,days:[{date,snow:2}]};
  assert.equal(T.snowChanges(old,next,date).delta,1);
  next.days[0].snow=null;assert.equal(T.snowChanges(old,next,date),null);
  assert.equal(T.snowChanges(old,next,'2026-10-17'),null);assert.equal(T.snowChanges(null,next,date),null);
});
