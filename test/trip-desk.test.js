const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const Nature=require('../src/nature.js'),Planning=require('../src/planning.js'),TripEngine=require('../src/trip-engine.js');
class Element{
 constructor(){this.children=[];this.value='';this.dataset={};this.attrs={};this.events={};this.hidden=false;}
 append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;this.text='';}
 set textContent(v){this.text=String(v);this.children=[];}get textContent(){return (this.text||'')+this.children.map(c=>c.textContent||'').join(' ');}
 setAttribute(k,v){this.attrs[k]=v;}addEventListener(k,f){this.events[k]=f;}click(){this.events.click?.();}after(){}before(){}
}
test('a location change cancels an in-flight budget search before its old road result is applied',async()=>{
 const elements={};for(const [,id] of fs.readFileSync('index.html','utf8').matchAll(/id="([^"]+)"/g))elements[id]=new Element();
 const date=Nature.dateInZone(Date.now(),'America/Chicago');elements.tripDate.value=date;elements.tripDate.min=date;elements.tripDate.max=Planning.addDays(date,6);
 elements.deskIntent.value='nature';elements.deskRadius.value='150';elements.deskBudget.value='120';elements.deskStay.value='45';
 const modeButtons=['worth','budget','sky','changes'].map(mode=>{const b=new Element();b.dataset.desk=mode;return b;});
 const origin={name:'Starting area',source:'city',lat:43.6,lon:-88.7},p={id:'p',name:'Park',lat:43.7,lon:-88.7,tags:['trails'],region:'WI',county:'Dodge',summary:'Park'};
 const f={retrievedAt:Date.now(),timezone:'America/Chicago',hours:[],days:[{date,snow:0,high:60,low:40,gust:10,code:0,rainChance:10,sunrise:Date.now()-3600000,sunset:Date.now()+86400000}]};
 let release,calls=0;
 const context=vm.createContext({document:{getElementById:id=>elements[id],createElement:()=>new Element(),querySelectorAll:()=>modeButtons},Nature,Planning,TripEngine,DESTINATIONS:[p],origin,selectedDate:()=>elements.tripDate.value,Date,Intl,Promise,Map,Set,requestAnimationFrame:f=>f(),readStorage:()=>null,writeStorage(){},forecastKey:p=>`${p.lat},${p.lon}`,forecastCache:{peek:()=>f},driveCache:new Map(),saved:new Set(),reportSnapshot:null,kpRows:[],Experience:{guide:()=>null},Community:{getFeed:async()=>({items:[],hasMore:false}),captureTimestamp:require('../src/community.js').captureTimestamp},getForecast:async()=>f,fetchJson:async()=>({snapshots:[]}),loadReports:async()=>{},requestDrive:()=>{calls++;return new Promise(resolve=>{release=resolve;});},renderResults(){},renderDestination(){},timeLabel:t=>String(t),dayLabel:d=>d});
 vm.runInContext(fs.readFileSync('src/trip-desk.js','utf8'),context);
 vm.runInContext("TripDesk.init();TripDesk.route('explore');",context);await new Promise(r=>setImmediate(r));
 modeButtons.find(b=>b.dataset.desk==='budget').click();await new Promise(r=>setImmediate(r));assert.equal(calls,1);assert.equal(elements.deskCancel.hidden,false);
 context.origin={...origin,lat:45};vm.runInContext('TripDesk.sync()',context);release({duration:600,distance:1000});await new Promise(r=>setImmediate(r));
 assert.equal(calls,1);assert.doesNotMatch(elements.deskResults.textContent,/min total/);assert.equal(elements.deskRun.disabled,false);
});
