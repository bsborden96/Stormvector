const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Nature = require('../src/nature.js');
const places = require('../src/destinations.js');

const base = {
  timezone:'America/Chicago',
  daily_units:{time:'unixtime',snowfall_sum:'cm',temperature_2m_max:'°F',temperature_2m_min:'°F',apparent_temperature_min:'°F',precipitation_sum:'inch',wind_gusts_10m_max:'mp/h'},
  hourly_units:{time:'unixtime',cloud_cover:'%',temperature_2m:'°F'},
  daily:{time:[Date.parse('2026-10-14T05:00:00Z')/1000],weather_code:[71],temperature_2m_max:[34],temperature_2m_min:[22],apparent_temperature_min:[14],precipitation_sum:[.4],precipitation_probability_max:[70],snowfall_sum:[2.54],wind_gusts_10m_max:[35],sunrise:[Date.parse('2026-10-14T12:00:00Z')/1000],sunset:[Date.parse('2026-10-14T23:00:00Z')/1000],daylight_duration:[39600]},
  hourly:{time:[Date.parse('2026-10-15T01:00:00Z')/1000],cloud_cover:[20],is_day:[0],temperature_2m:[29],precipitation_probability:[10]},
};

test('destination regions, experiences, and search filter a real curated list',()=>{
  assert.equal(places.length,18);
  assert.deepEqual(new Set(places.map(p=>p.region)),new Set(['WI','MN','UP','MI']));
  const filtered=Nature.filterPlaces(places,{origin:{lat:43.6333,lon:-88.7296},region:'WI',interest:'winter',radius:100,query:'kettle'});
  assert.deepEqual(filtered.map(p=>p.id),['kettle']);
});

test('forecast validates returned units, local dates, snow conversion and missing weather',()=>{
  const f=Nature.parseForecast(structuredClone(base));
  assert.equal(f.days[0].date,'2026-10-14');
  assert.equal(f.days[0].snow,1);
  assert.match(Nature.outingNote(f.days[0]),/Snow/);
  assert.equal(f.hours[0].night,true);
  assert.equal(Nature.nightHours(f,'2026-10-14',Date.parse('2026-10-14T18:00:00Z')).length,1);
  const changed=structuredClone(base);changed.daily_units.snowfall_sum='mm';
  assert.throws(()=>Nature.parseForecast(changed),/Unexpected forecast units/);
  const incomplete=structuredClone(base);incomplete.daily.temperature_2m_max=[null];
  assert.equal(Nature.outingNote(Nature.parseForecast(incomplete).days[0]),'Weather guidance incomplete');
  assert.match(Nature.forecastUrl(places[0]),/forecast_days=7/);
});

test('dated Wisconsin observations never become invented forecasts elsewhere',()=>{
  const snapshot=JSON.parse(fs.readFileSync('data/fall-reports.json'));
  assert.ok(snapshot.reports.length>=50);
  assert.equal(snapshot.coverage.MI,'Current foliage feed not connected');
  const report=Nature.nearestReport(places.find(p=>p.id==='peninsula'),snapshot,Date.parse(snapshot.retrievedAt)+1000);
  assert.ok(report && report.percent>=0 && report.percent<=100);
  assert.equal(Nature.nearestReport(places.find(p=>p.id==='voyageurs'),snapshot),null);
  assert.equal(Nature.reportStatus(report,snapshot.retrievedAt,Date.parse(snapshot.retrievedAt)+8*86400000),'older');
});

test('NOAA oval is short-lived and Kp accepts actual NOAA object rows',()=>{
  const now=Date.parse('2026-10-14T01:30:00Z');
  const data={'Observation Time':'2026-10-14T01:04:00Z','Forecast Time':'2026-10-14T01:51:00Z',coordinates:[[270,47,42],[269,48,0],[5,50,91]]};
  const oval=Nature.parseAurora(data,now);
  assert.equal(oval.stale,false);
  assert.equal(oval.points[0].lon,-90);
  assert.equal(oval.points.length,2);
  assert.equal(Nature.parseAurora(data,now+4*3600000).stale,true);
  const kp=Nature.parseKp([{time_tag:'2026-10-14T03:00:00',kp:3.67,observed:'predicted'}],now);
  assert.equal(kp[0].kp,3.67);
  assert.deepEqual(Nature.parseKp([{time_tag:'2026-10-14T03:00:00',kp:null,observed:'predicted'}],now),[]);
});

test('local static page has its own brand, references the guide, and omits the spoken bot',()=>{
  const html=fs.readFileSync('index.html','utf8');
  assert.match(html,/id="natureMap"/);
  assert.match(html,/id="reportsPanel"/);
  assert.match(html,/id="auroraPanel"/);
  assert.match(html,/src\/nature\.js/);
  assert.doesNotMatch(html,/Wisconsin-Storm-Alerts|speechSynthesis|seasonal\.js|weather bot/i);
});

test('current model units and snow depth stay distinct from new snowfall; invalid hours do not shift arrays',()=>{
  const data=structuredClone(base),t=Date.parse('2026-10-15T01:00:00Z')/1000;
  data.hourly.time=[null,t];data.hourly.cloud_cover=[99,20];data.hourly.is_day=[1,0];data.hourly.snow_depth=[4,.1];data.hourly_units.snow_depth='m';
  data.current={time:t,temperature_2m:31,apparent_temperature:25,wind_speed_10m:10,wind_gusts_10m:18,weather_code:0};
  data.current_units={time:'unixtime',temperature_2m:'°F',apparent_temperature:'°F',wind_speed_10m:'mp/h',wind_gusts_10m:'mp/h'};
  const f=Nature.parseForecast(data);assert.equal(f.hours.length,1);assert.equal(f.hours[0].cloud,20);assert.ok(Math.abs(f.hours[0].snowDepth-3.937)<.001);assert.equal(f.days[0].snow,1);assert.equal(f.current.temp,31);
  data.hourly_units.snow_depth='cm';assert.equal(Nature.parseForecast(data).hours[0].snowDepth,null);
});

test('Minnesota park observations match their destination and retain source range labels',()=>{
  const snapshot=JSON.parse(fs.readFileSync('data/regional-foliage.json'));
  const place=places.find(p=>p.id==='itasca');const r=Nature.nearestReport(place,snapshot);
  assert.ok(r);assert.equal(r.percent,null);assert.equal(Nature.colorLabel(r),snapshot.reports.find(r=>r.destinationId==='itasca').percentLabel);assert.equal(r.source,'Minnesota DNR');
});
