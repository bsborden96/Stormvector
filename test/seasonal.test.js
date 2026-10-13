const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Seasonal = require('../src/seasonal.js');

function fixture() {
  return {timezone:'America/Chicago', daily_units: {snowfall_sum:'cm', temperature_2m_max:'°F', temperature_2m_min:'°F', apparent_temperature_min:'°F',wind_gusts_10m_max:'mp/h',precipitation_sum:'inch'},daily: {
    time:['2026-10-13','2026-10-14','2026-10-15'],weather_code:[0,66,73],
    temperature_2m_max:[65,33,30],temperature_2m_min:[45,25,18],apparent_temperature_min:[40,20,10],
    precipitation_probability_max:[10,80,70],precipitation_sum:[0,0.2,0.3],snowfall_sum:[0,null,2.54],wind_gusts_10m_max:[10,20,35],
  }};
}
test('forecast uses location timezone and explicitly requests imperial units', async () => {
  let requested;
  const data = await Seasonal.load({lat:43.6,lon:-88.7}, async url => {requested=new URL(url);return fixture()});
  assert.equal(requested.searchParams.get('timezone'),'auto');
  assert.equal(requested.searchParams.get('forecast_days'),'7');
  assert.equal(data.days[2].snow,1);
  assert.equal(data.days[1].snow,null);
  assert.equal(data.timezone,'America/Chicago');
  const inches=fixture();inches.daily_units.snowfall_sum='inch';inches.daily.snowfall_sum[2]=2;
  assert.equal(Seasonal.parseForecast(inches).days[2].snow,2);
});
test('missing values and unknown units never become zero snow or an all-clear', () => {
  const input=fixture();delete input.daily.wind_gusts_10m_max;
  const day=Seasonal.parseForecast(input).days[0];
  assert.equal(day.gust,null);assert.equal(Seasonal.outdoor(day),'Incomplete guidance');
  assert.equal(Seasonal.winterNote({...day,snow:null}),'Incomplete winter guidance');
  input.daily_units.snowfall_sum='mm';assert.throws(()=>Seasonal.parseForecast(input),/units/);
  assert.throws(()=>Seasonal.parseForecast({}),/Missing/);
});
test('freezing rain, snow, and thunderstorm signals override pleasant-weather labels', () => {
  const days=Seasonal.parseForecast(fixture()).days;
  assert.equal(Seasonal.outdoor(days[0]),'Promising outdoor day');
  assert.match(Seasonal.winterNote(days[1]),/Freezing precipitation/);
  assert.match(Seasonal.winterNote(days[2]),/Snow.*Freezing.*Strong gusts/);
  assert.equal(Seasonal.outdoor({...days[0],code:97}),'Thunderstorm potential');
  assert.equal(Seasonal.outdoor({...days[0],code:66}),'Winter weather potential');
});
test('fall date guidance is seasonal context, never a fabricated current color percentage', () => {
  assert.match(Seasonal.fallContext('2026-10-13'),/usual fall color season/);
  assert.match(Seasonal.fallContext('2026-08-13'),/Ahead/);
  assert.match(Seasonal.fallContext('2026-12-13'),/Beyond/);
  assert.match(Seasonal.fallContext(''),/Choose/);
  assert.equal(Seasonal.winterAlert({properties:{event:'Ice Storm Warning'}}),true);
  assert.equal(Seasonal.winterAlert({properties:{event:'Extreme Cold Warning'}}),true);
  assert.equal(Seasonal.winterAlert({properties:{event:'Tornado Warning'}}),false);
});

function harness() {
  const elements = new Map();
  const node = () => ({textContent:'',children:[],dataset:{},classList:{add(){},remove(){}},
    append(...c){this.children.push(...c)},replaceChildren(){this.children=[]},setAttribute(){},addEventListener(){}});
  const document={getElementById(id){if(!elements.has(id)) elements.set(id,node());return elements.get(id)},
    createElement:node,querySelectorAll(){return []},addEventListener(){}};
  const context=vm.createContext({document,URLSearchParams,AbortSignal,Date,console,
    localStorage:{setItem(){},getItem(){return null}},clearInterval(){},setInterval(){return 1},setTimeout(){},
    fetch:async()=>{throw Error('Unexpected network in tests')}});
  vm.runInContext(fs.readFileSync('src/seasonal.js','utf8'),context);
  vm.runInContext(fs.readFileSync('src/app.js','utf8'),context);
  return {elements, run:s=>vm.runInContext(s,context)};
}
test('winter render retains partial-data labels and displays official alerts safely', () => {
  const {run,elements}=harness();
  run(`Seasonal.render(Seasonal.parseForecast(${JSON.stringify(fixture())}),{name:'Waupun, WI'})`);
  assert.equal(elements.get('forecastDays').children.length,3);
  assert.equal(elements.get('winterRows').children.length,3);
  const snowMetric=elements.get('winterMetrics').children[0];
  assert.equal(snowMetric.children[1].textContent,'Unavailable');
  run('Seasonal.renderAlerts([{properties:{event:"Ice Storm Warning",headline:"<script>bad()</script>"}}],"current",new Date().toISOString())');
  assert.equal(elements.get('winterAlerts').children[0].children[1].textContent,'<script>bad()</script>');
  run('Seasonal.render(null,{name:"Next city"},"loading")');
  assert.equal(elements.get('winterRows').children.length,0);
  assert.match(elements.get('winterStatus').textContent,/Loading/);
});
test('a late seasonal or NWS response cannot overwrite a newer location', async () => {
  const {run,elements}=harness();
  run(`globalThis.fixture=${JSON.stringify(fixture())}; globalThis.pending=[];
    Seasonal.load=()=>new Promise(resolve=>pending.push(resolve));
    fetchJson=async()=>{throw Error('offline')};
    locationVersion=1; globalThis.first=refreshSeasonal({name:'Old city',lat:40,lon:-90},1);
    locationVersion=2; globalThis.second=refreshSeasonal({name:'New city',lat:43,lon:-88},2)`);
  run('pending[1](Seasonal.parseForecast(fixture))');await run('second');
  assert.match(elements.get('forecastStatus').textContent,/New city/);
  run('pending[0](Seasonal.parseForecast(fixture))');await run('first');
  assert.match(elements.get('forecastStatus').textContent,/New city/);
  assert.equal(elements.get('refreshForecast').disabled,false);
});
test('location switching clears old warning IDs even when initial feeds fail', async () => {
  const {run}=harness();
  run('seenWarningIds=new Set(["old-warning"]); refreshSeasonal=async()=>{}; loadConditions=async()=>{throw Error("offline")};loadSevereParams=loadConditions;loadOutlook=loadConditions;loadAlerts=loadConditions');
  await run('updateLocation({name:"New city",lat:44,lon:-89})');
  assert.equal(run('seenWarningIds.size'),0);
  assert.equal(run('activeAlerts.length'),0);
  assert.equal(run('alertsStatus'),'unavailable');
});
test('all local scripts, navigation targets, and unique element IDs resolve', () => {
  const html=fs.readFileSync('index.html','utf8');
  const ids=[...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(new Set(ids).size,ids.length);
  for(const [,path] of html.matchAll(/<script src="([^"]+)"/g))assert.ok(fs.existsSync(path));
  for(const [,id] of html.matchAll(/href="#([^"]+)"/g))assert.ok(ids.includes(id),`Missing ${id}`);
  assert.ok(html.indexOf('src/seasonal.js')<html.indexOf('src/app.js'));
});
