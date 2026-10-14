import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker,{validateMetadata,imageType} from '../worker/index.js';
const origin='https://bsborden96.github.io';
const metadata={lat:'43.6',lon:'-88.7',eventType:'aurora',location:'Waupun, WI',takenWith:'iPhone 14',takenAt:'2026-10-12T02:00:00Z',timezone:'America/Chicago',consent:'true'};
class Bucket {
  objects=new Map();
  async put(key,data,options={}){this.objects.set(key,{key,data,...options});}
  async get(key){const o=this.objects.get(key);if(!o)return null;return {...o,json:async()=>JSON.parse(o.data),body:o.data,httpEtag:'"test"',writeHttpMetadata:h=>h.set('Content-Type',o.httpMetadata?.contentType||'application/json')};}
  async head(key){return this.get(key);}
  async delete(key){this.objects.delete(key);}
  async list({prefix}){return {objects:[...this.objects.values()].filter(o=>o.key.startsWith(prefix)),truncated:false};}
}
function upload(){const f=new FormData();Object.entries(metadata).forEach(([k,v])=>f.set(k,v));f.set('photo',new Blob([new Uint8Array([255,216,255,224,0,16,255,217])],{type:'image/jpeg'}),'test.jpg');return new Request('https://test/api/photos',{method:'POST',headers:{Origin:origin},body:f});}
test('metadata validates actual capture timestamp, location and ownership',()=>{
  assert.equal(validateMetadata(metadata).takenWith,'iPhone 14');
  for(const change of [{lat:''},{eventType:'hurricane'},{takenAt:'2100-01-01T00:00:00Z'},{consent:'false'},{timezone:'bad/zone'}])assert.throws(()=>validateMetadata({...metadata,...change}));
  assert.equal(imageType(new TextEncoder().encode('<svg></svg>')),null);
});
test('shared photo persists, lists without removal secret, serves, and deletes only with receipt',async()=>{
  const env={BUCKET:new Bucket()};
  const response=await worker.fetch(upload(),env);assert.equal(response.status,201);
  const receipt=await response.json();
  const list=await (await worker.fetch(new Request('https://test/api/photos'),env)).json();
  assert.equal(list.photos.length,1);assert.equal(list.photos[0].eventType,'aurora');assert.ok(list.photos[0].submittedAt);
  assert.equal(JSON.stringify(list).includes(receipt.deleteToken),false);assert.equal(JSON.stringify(list).includes('deleteHash'),false);
  const media=await worker.fetch(new Request('https://test'+receipt.photo.imageUrl),env);assert.equal(media.status,200);assert.equal(media.headers.get('Content-Type'),'image/jpeg');
  const remove=token=>worker.fetch(new Request('https://test/api/photos',{method:'DELETE',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({id:receipt.photo.id,deleteToken:token})}),env);
  assert.equal((await remove('wrong')).status,403);assert.equal((await remove(receipt.deleteToken)).status,200);
  assert.equal((await (await worker.fetch(new Request('https://test/api/photos'),env)).json()).photos.length,0);
});
test('uploads reject another origin and limit repeat submissions',async()=>{
  const env={BUCKET:new Bucket()};
  const wrong=upload();wrong.headers.set('Origin','https://other.test');assert.equal((await worker.fetch(wrong,env)).status,403);
  for(let i=0;i<6;i++)assert.equal((await worker.fetch(upload(),env)).status,201);
  assert.equal((await worker.fetch(upload(),env)).status,429);
});
