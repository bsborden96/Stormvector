const {test}=require('node:test');
const assert=require('node:assert/strict');
const Planning=require('../src/planning.js');
const Community=require('../src/community.js');
const SeasonalViews=require('../src/views.js');

test('night forecasts use dark hours, correctly overlap three-hour NOAA guidance, and stop beyond coverage',()=>{
  const t=Date.parse('2026-10-15T01:00:00Z');
  const forecast={timezone:'America/Chicago',hours:[{timestamp:t,date:'2026-10-14',cloud:80,night:true},{timestamp:t+3600000,date:'2026-10-14',cloud:10,night:true},{timestamp:t+12*3600000,date:'2026-10-15',cloud:0,night:false}],days:[{date:'2026-10-14',snow:0,high:60,low:40,code:0}]};
  const kp=[{time:t-3600000,kp:4,kind:'predicted'},{time:t+10*3600000,kp:9,kind:'predicted'}];
  const summary=Planning.nightSummary(forecast,'2026-10-14',kp,t-3600000);
  assert.equal(summary.best.cloud,10);assert.equal(summary.peakKp,4);assert.equal(summary.hours.length,2);
  assert.equal(Planning.nightSummary(forecast,'2026-10-16',kp,t-3600000).peakKp,null);
  assert.equal(Planning.snowTotal([{snow:1},{snow:null}]),null);
  assert.equal(Planning.snowTotal([{snow:1},{snow:2}]),3);
  assert.match(SeasonalViews.cardNote('aurora',{},{...forecast},null,kp,'2026-10-14',t-3600000),/Night clouds: 10% lowest/);
});

test('photo timestamps preserve selected time zone and reject nonexistent DST times',()=>{
  assert.equal(Community.captureTimestamp('2026-10-13T20:30','America/Chicago'),'2026-10-14T01:30:00.000Z');
  assert.equal(Community.captureTimestamp('2026-10-13T20:30','America/Detroit'),'2026-10-14T00:30:00.000Z');
  assert.throws(()=>Community.captureTimestamp('2026-03-08T02:30','America/Chicago'),/does not exist/);
  assert.throws(()=>Community.captureTimestamp('2026-02-30T13:00','America/Chicago'),/does not exist/);
});

test('photo map groups nearby coordinates while retaining every photo and its timestamp',()=>{
  const data=[{id:'a',lat:43.63,lon:-88.72,takenAt:'2026-10-13T20:00:00Z'},{id:'b',lat:43.631,lon:-88.721,takenAt:'2026-10-13T21:00:00Z'},{id:'c',lat:45,lon:-89,takenAt:'2026-10-13T22:00:00Z'}];
  const groups=Community.groupPhotos(data);
  assert.equal(groups.length,2);assert.equal(groups[0].photos.length,2);
  assert.equal(groups[0].photos[1].takenAt,data[1].takenAt);
  assert.ok(groups[0].lat>=43.63&&groups[0].lat<=43.631);
});
