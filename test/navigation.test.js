const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const Nature=require('../src/nature.js');
const Planning=require('../src/planning.js');
const destinations=require('../src/destinations.js');
class Element {
  constructor(){this.children=[];this.dataset={};this.style={};this.value='';this.hidden=false;this.attributes={};this.classList={toggle(){},remove(){},add(){}};}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=[...children];this._text='';}
  set textContent(value){this._text=String(value);this.children=[];}
  get textContent(){return (this._text||'')+this.children.map(c=>c.textContent||'').join(' ');}
  setAttribute(k,v){this.attributes[k]=v;}
  removeAttribute(k){delete this.attributes[k];}
  getAttribute(k){return this.attributes[k]??null;}
  addEventListener(){}
  scrollIntoView(){}
}
test('switching tabs refreshes the same destination and shows distinct dashboards; photos opens a separate map/form',()=>{
  const html=fs.readFileSync('index.html','utf8'),elements={};for(const [,id] of html.matchAll(/id="([^"]+)"/g))elements[id]=new Element();
  for(const id of ['regionFilter','interestFilter','radiusFilter'])elements[id].value='all';elements.tripDate.value='2026-10-14';elements.tripDate.min='2026-10-14';elements.tripDate.max='2026-10-20';
  let activated=0;
  const doc={getElementById:id=>elements[id],createElement:()=>new Element(),querySelectorAll:()=>[],addEventListener(){},body:{dataset:{}}};
  const context=vm.createContext({document:doc,Nature,Planning,DESTINATIONS:destinations,Community:{activate(){activated++;}},location:{hash:'#explore'},Date,Intl,URLSearchParams,AbortSignal,Promise,Set,Map,requestAnimationFrame:f=>f(),queueMicrotask(){},setInterval(){},localStorage:{getItem:()=>null,setItem(){}},window:{addEventListener(){}}});
  vm.runInContext(fs.readFileSync('src/field-guide.js','utf8'),context);vm.runInContext(fs.readFileSync('src/experience.js','utf8'),context);vm.runInContext(fs.readFileSync('src/views.js','utf8'),context);vm.runInContext(fs.readFileSync('src/geolocation.js','utf8'),context);vm.runInContext(fs.readFileSync('src/app.js','utf8'),context);
  // Keep the network separate from this navigation regression test.
  vm.runInContext('ensureVisibleForecasts=()=>{};selectDestination=p=>{selected=p;renderDestination();renderResults();};selected=DESTINATIONS[0];selectedForecast=null;',context);
  for(const [view,title] of [['aurora','Follow the night.'],['winter','Watch the snow line.'],['fall','Find the color while it lasts.'],['weather','Your forecast, at a glance.']]){
    context.location.hash='#'+view;vm.runInContext('route()',context);
    assert.equal(doc.body.dataset.view,view);assert.match(elements.seasonDashboard.textContent,new RegExp(title.replaceAll('.','\\.')));
    assert.equal(elements.auroraPanel.hidden,view!=='aurora');assert.equal(elements.reportsPanel.hidden,view!=='fall');assert.equal(elements.guide.hidden,false);
    if(view==='aurora')assert.match(elements.destinationPanel.textContent,/Your northern-sky window/);
    if(view==='fall')assert.match(elements.destinationPanel.textContent,/Nearby fall color report/);
  }
  context.location.hash='#photos';vm.runInContext('route()',context);assert.equal(activated,1);assert.equal(elements.guide.hidden,true);assert.equal(elements.communityPanel.hidden,false);assert.equal(elements.liveStrip.hidden,true);
  context.location.hash='#explore';vm.runInContext('route()',context);assert.equal(elements.communityPanel.hidden,true);assert.equal(elements.guide.hidden,false);assert.equal(elements.seasonDashboard.hidden,true);
  context.location.hash='#photoForm';vm.runInContext('route()',context);assert.equal(elements.communityPanel.hidden,false);assert.equal(doc.body.dataset.view,'photos');
});

test('GPS keeps full coordinates, requests a fresh high-accuracy fix and recenters; stale fixes are ignored',()=>{
  const html=fs.readFileSync('index.html','utf8'),elements={};for(const [,id] of html.matchAll(/id="([^"]+)"/g))elements[id]=new Element();
  for(const id of ['regionFilter','interestFilter','radiusFilter'])elements[id].value='all';elements.tripDate.value='2026-10-16';
  let success,options;const centers=[];
  const doc={getElementById:id=>elements[id],createElement:()=>new Element(),querySelectorAll:()=>[],addEventListener(){},body:{dataset:{}}};
  const context=vm.createContext({document:doc,Nature,Planning,DESTINATIONS:destinations,Community:{},location:{hash:'#explore'},navigator:{geolocation:{getCurrentPosition(ok,fail,opts){success=ok;options=opts;}}},Date,Intl,URLSearchParams,AbortSignal,Promise,Set,Map,requestAnimationFrame:f=>f(),queueMicrotask(){},localStorage:{getItem:()=>null,setItem(){}},window:{addEventListener(){}},testMap:{invalidateSize(){},setView:(point,zoom)=>centers.push({point:[...point],zoom})}});
  for(const file of ['field-guide','experience','views','geolocation','app'])vm.runInContext(fs.readFileSync(`src/${file}.js`,'utf8'),context);
  vm.runInContext('ensureVisibleForecasts=()=>{};renderMap=()=>{};selectDestination=p=>{selected=p;};map=testMap;useGps();',context);
  assert.equal(options.enableHighAccuracy,true);assert.equal(options.maximumAge,0);
  success({coords:{latitude:43.634123456,longitude:-88.727654321,accuracy:18},timestamp:Date.now()});
  assert.equal(vm.runInContext('origin.lat',context),43.634123456);assert.equal(vm.runInContext('origin.lon',context),-88.727654321);
  assert.equal(centers.at(-1).zoom,10);assert.deepEqual(centers.at(-1).point,[43.634123456,-88.727654321]);
  assert.match(elements.locationAccuracy.textContent,/±18 m/);assert.match(elements.originLabel.textContent,/GPS location/);
  vm.runInContext('useGps();originVersion++;',context);success({coords:{latitude:45,longitude:-90,accuracy:20},timestamp:Date.now()});
  assert.equal(vm.runInContext('origin.lat',context),43.634123456);
});
