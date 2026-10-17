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

test('profiles, private messages, opt-in and likes authorize the signed-in member',async()=>{
  const env={BUCKET:new Bucket()};
  const cookies={};
  for(const user of ['alice','bob','eve']){const r=await worker.fetch(new Request('https://test/api/auth/signup',{method:'POST',headers:{Origin:'https://test'},body:JSON.stringify({email:user+'@example.com',password:'Long test password 123!'})}),env);assert.equal(r.status,200);cookies[user]=r.headers.get('Set-Cookie').split(';')[0];}
  const req=(path,user,method='GET',data)=>worker.fetch(new Request('https://test'+path,{method,headers:{Origin:'https://test',...(user?{Cookie:cookies[user]}:{}),'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})}),env);
  assert.equal((await req('/api/profiles',null,'POST',{name:'Imposter'})).status,401);
  const alice=(await (await req('/api/profiles','alice','POST',{name:'Alice',bio:'North woods',messagesEnabled:true})).json()).profile;
  const bob=(await (await req('/api/profiles','bob','POST',{name:'Bob',messagesEnabled:false})).json()).profile;
  assert.equal((await req('/api/messages','alice','POST',{to:bob.id,text:'Hello'})).status,403);
  await req('/api/profiles','bob','POST',{name:'Bob',messagesEnabled:true});
  assert.equal((await req('/api/messages','alice','POST',{to:bob.id,text:'Hello Bob'})).status,201);
  for(const user of ['alice','bob']){const inbox=await (await req('/api/messages',user)).json();assert.equal(inbox.messages.length,1);assert.equal(inbox.messages[0].text,'Hello Bob');}
  const outsider=await (await req('/api/messages?user='+bob.id,'eve')).json();assert.equal(outsider.messages.length,0);
  assert.equal((await req('/api/messages',null)).status,401);
  const cross=new Request('https://test/api/profiles',{method:'POST',headers:{Origin:'https://evil.test','oai-authenticated-user-id':'alice'},body:JSON.stringify({name:'Hijacked'})});assert.equal((await worker.fetch(cross,env)).status,403);
  const owned=upload();owned.headers.set('Origin','https://test');owned.headers.set('Cookie',cookies.alice);
  const result=await (await worker.fetch(owned,env)).json();assert.equal(result.photo.ownerId,alice.id);
  for(let i=0;i<2;i++){const liked=await (await req('/api/likes','bob','POST',{photo:result.photo.id,liked:true})).json();assert.equal(liked.count,1);assert.equal(liked.liked,true);}
  const publicLikes=await (await req('/api/likes?photo='+encodeURIComponent(result.photo.id))).json();assert.equal(publicLikes.count,1);assert.equal(publicLikes.liked,false);
  assert.equal((await req('/api/photos','bob','DELETE',{id:result.photo.id})).status,403);
  assert.equal((await req('/api/photos','alice','DELETE',{id:result.photo.id})).status,200);
  assert.equal((await req('/api/likes?photo='+encodeURIComponent(result.photo.id))).status,404);
  const publicProfiles=await (await req('/api/profiles')).json();assert.equal(JSON.stringify(publicProfiles).includes('alice'),false);assert.equal(publicProfiles.profiles.length,2);
});

test('account HTML is served without caching and its embedded script parses',async()=>{
  const response=await worker.fetch(new Request('https://test/account'),{BUCKET:new Bucket()});
  assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');
  const html=await response.text(),source=html.match(/<script>([\s\S]+)<\/script>/)[1];new Function(source);
  assert.match(html,/Email sign-in/);assert.doesNotMatch(html,/signin-with-chatgpt/);
});

test('email sign-up, password login, recovery and logout keep sessions private and revoke old access',async()=>{
  const env={BUCKET:new Bucket()};
  const auth=(path,data,cookie)=>worker.fetch(new Request('https://test/api/auth/'+path,{method:'POST',headers:{Origin:'https://test',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(data)}),env);
  const me=cookie=>worker.fetch(new Request('https://test/api/me',{headers:{Cookie:cookie}}),env);
  assert.equal((await auth('signup',{email:'test@example.com',password:'short'})).status,400);
  const signup=await auth('signup',{email:'TEST@example.com',password:'Long secure password 123!'});assert.equal(signup.status,200);
  const firstCookie=signup.headers.get('Set-Cookie').split(';')[0],data=await signup.json();assert.match(signup.headers.get('Set-Cookie'),/HttpOnly; Secure; SameSite=Lax/);assert.equal(data.recoveryCode.length,64);
  const identity=await (await me(firstCookie)).json();assert.ok(identity.id);assert.equal(JSON.stringify(identity).includes('password'),false);
  const spoof=await worker.fetch(new Request('https://test/api/me',{headers:{'oai-authenticated-user-id':'TEST@example.com'}}),env);assert.equal((await spoof.json()).id,null);
  assert.equal((await auth('signup',{email:'test@example.com',password:'Long secure password 123!'})).status,409);
  assert.equal((await auth('login',{email:'test@example.com',password:'wrong'})).status,401);
  const login=await auth('login',{email:'test@example.com',password:'Long secure password 123!'});assert.equal(login.status,200);const secondCookie=login.headers.get('Set-Cookie').split(';')[0];assert.notEqual(secondCookie,firstCookie);
  const recovered=await auth('recover',{email:'test@example.com',password:'New secure password 456!',recoveryCode:data.recoveryCode});assert.equal(recovered.status,200);const resetData=await recovered.json();assert.notEqual(resetData.recoveryCode,data.recoveryCode);
  assert.equal((await (await me(firstCookie)).json()).id,null);assert.equal((await (await me(secondCookie)).json()).id,null);
  const newCookie=recovered.headers.get('Set-Cookie').split(';')[0];assert.equal((await (await me(newCookie)).json()).id,identity.id);
  assert.equal((await auth('recover',{email:'test@example.com',password:'Another new password 789!',recoveryCode:data.recoveryCode})).status,401);
  assert.equal((await auth('logout',{},newCookie)).status,200);assert.equal((await (await me(newCookie)).json()).id,null);
  const objects=JSON.stringify([...env.BUCKET.objects.values()]);assert.equal(objects.includes('Long secure password 123!'),false);assert.equal(objects.includes(firstCookie.split('=')[1]),false);
});
