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
