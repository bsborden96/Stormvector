const {test}=require('node:test');const assert=require('node:assert/strict');const Locator=require('../src/geolocation.js');
test('GPS timeout retries standard device location and returns its actual coordinates',()=>{
  const requests=[];let result,error,progress;
  const geo={getCurrentPosition(ok,fail,options){requests.push({ok,fail,options});}};
  Locator.request(p=>result=p,e=>error=e,p=>progress=p,geo);
  assert.equal(requests[0].options.enableHighAccuracy,true);requests[0].fail({code:3});
  assert.equal(requests.length,2);assert.equal(requests[1].options.enableHighAccuracy,false);assert.match(progress,/standard location/);
  requests[1].ok({coords:{latitude:43.6123456,longitude:-88.7123456,accuracy:160}});
  assert.equal(result.coords.latitude,43.6123456);assert.equal(error,undefined);
  requests[0].ok({coords:{latitude:1,longitude:2}});assert.equal(result.coords.latitude,43.6123456);
});
test('permission denial stops retry and explains how to enable location',()=>{
  let count=0,message;Locator.request(()=>assert.fail(),m=>message=m,()=>{},{getCurrentPosition(ok,fail){count++;fail({code:1});}});
  assert.equal(count,1);assert.match(message,/iPhone/);assert.match(message,/Android/);
});
test('missing geolocation returns actionable fallback',()=>{let message;Locator.request(()=>assert.fail(),m=>message=m,()=>{},null);assert.match(message,/Safari or Chrome/);});
test('reverse geocoding uses the town or village without replacing GPS coordinates',()=>{
 assert.equal(Locator.townName({address:{town:'Waupun',state:'Wisconsin',county:'Dodge County'}}),'Waupun, Wisconsin');
 assert.equal(Locator.townName({address:{village:'Copper Harbor',state:'Michigan'}}),'Copper Harbor, Michigan');
 assert.equal(Locator.townName({address:{county:'Dodge County'}}),null);
});
test('an approximate first fix refines to precise GPS and releases the watch',()=>{
 let update,result,cleared=[];const geo={getCurrentPosition(ok){ok({coords:{latitude:43.6,longitude:-88.7,accuracy:2500}});},watchPosition(ok,fail,options){update=ok;assert.equal(options.enableHighAccuracy,true);return 42;},clearWatch:id=>cleared.push(id)};
 Locator.request(p=>result=p,()=>assert.fail(),()=>{},geo);assert.equal(result,undefined);
 update({coords:{latitude:43.634123456,longitude:-88.727654321,accuracy:12}});
 assert.equal(result.coords.latitude,43.634123456);assert.deepEqual(cleared,[42]);
});
