const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const N=require('../src/nature.js');
const P=require('../src/planning.js');
const E=require('../src/experience.js');
const places=require('../src/destinations.js');
const {FIELD_GUIDE,GUIDE_SCENES}=require('../src/field-guide.js');
test('clear windows need full darkness, known clouds and consecutive samples',()=>{
  const t=Date.parse('2026-10-17T01:00Z'),h=(i,cloud,dark=true)=>({timestamp:t+i*3600000,cloud,dark});
  assert.deepEqual(P.clearWindow([h(0,0),h(2,0)]),[]);
  assert.deepEqual(P.clearWindow([h(0,0,false),h(1,0)]),[]);
  assert.deepEqual(P.clearWindow([h(0,null),h(1,0)]),[]);
  assert.equal(P.clearWindow([h(0,0),h(1,20),h(2,75),h(3,0)]).length,2);
});
test('sky timeline calculates darkness, moon and interval-specific Kp independently',()=>{
  const times=['2026-10-16T23:00Z','2026-10-17T03:00Z'].map(Date.parse);
  const f={timezone:'America/Chicago',hours:times.map(timestamp=>({timestamp,date:'2026-10-16',night:true,cloud:0}))};
  const rows=P.skyHours(f,'2026-10-16',{lat:43.6,lon:-88.7},[{time:times[0],kp:2,kind:'predicted'}],times[0]-1000);
  assert.equal(rows[0].dark,false);assert.equal(rows[1].dark,true);
  assert.equal(rows[0].kp,2);assert.equal(rows[1].kp,null);
  assert.equal(typeof rows[1].moonUp,'boolean');assert.ok(rows[1].moonLight>=0&&rows[1].moonLight<=1);
});
test('outdoor windows reject missing gust guidance and thunder',()=>{
  const t=Date.parse('2026-10-16T15:00Z'),base={date:'2026-10-16',night:false,temp:60,rainChance:10,gust:15,code:0};
  const f={hours:[0,1,2].map(i=>({...base,timestamp:t+i*3600000}))};
  assert.equal(P.outingWindow(f,'2026-10-16',t).length,3);
  f.hours[1].gust=null;assert.equal(P.outingWindow(f,'2026-10-16',t).length,0);
  f.hours[1].gust=15;f.hours[1].code=95;assert.equal(P.outingWindow(f,'2026-10-16',t).length,0);
});
test('foliage ordering favors current observations over stale percentages',()=>{
  const now=Date.parse('2026-10-16T15:00Z');
  const snapshot={retrievedAt:new Date(now).toISOString(),reports:[{name:'A',county:'Dodge',lat:43.5,lon:-88.6,percent:100,reportedAt:'2026-09-01T12:00Z'},{name:'B',county:'Sauk',lat:43.4,lon:-89.7,percent:50,reportedAt:new Date(now).toISOString()}]};
  const p=places.filter(p=>['horicon','devils'].includes(p.id)).map((p,i)=>({...p,distance:i}));
  assert.equal(E.rank(p,'fall',snapshot,{peek(){}},'2026-10-16',[],now)[0].id,'devils');
});
test('cache clear rejects repopulation from older pending requests',async()=>{
  const c=N.makeCache();let finish;const old=c.get('p',()=>new Promise(resolve=>{finish=resolve;}));
  await Promise.resolve();c.clear();await c.get('p',async()=>({id:'fresh'}));finish({id:'old'});await old;
  assert.equal(c.peek('p').id,'fresh');
});
test('all destination guides have sources and all local photographs exist',()=>{
  for(const p of places){const g=FIELD_GUIDE[p.id];assert.ok(g?.stop&&g.walk&&g.effort&&g.practical&&g.fees);assert.match(g.source,/^https:\/\/(dnr\.wisconsin\.gov|www\.dnr\.state\.mn\.us|files\.dnr\.state\.mn\.us|www\.michigan\.gov|www\.nps\.gov)\//);}
  for(const scene of Object.values(GUIDE_SCENES)){assert.ok(fs.existsSync(scene.src));assert.ok(scene.caption&&scene.credit&&scene.source);}
  const snapshot=JSON.parse(fs.readFileSync('data/fall-reports.json'));assert.equal(snapshot.reports.find(r=>r.name==='Delafield').county,'Waukesha');
});
