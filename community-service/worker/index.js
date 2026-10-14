const ALLOWED_ORIGIN = 'https://bsborden96.github.io';
const EVENTS = ['snow','aurora','nature','fall'];
const MAX_IMAGE = 4 * 1024 * 1024;
const MAX_REQUEST = MAX_IMAGE + 65536;

function headers(request) {
  const origin=request.headers.get('Origin');
  return {'Access-Control-Allow-Origin':origin===ALLOWED_ORIGIN?origin:ALLOWED_ORIGIN,'Access-Control-Allow-Methods':'GET, POST, DELETE, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Vary':'Origin','X-Content-Type-Options':'nosniff'};
}
function json(request,data,status=200) {
  return new Response(JSON.stringify(data),{status,headers:{...headers(request),'Content-Type':'application/json','Cache-Control':'no-store'}});
}
function clean(value,max=120) {return typeof value==='string'?value.trim().slice(0,max):'';}
export function validateMetadata(fields,now=Date.now()) {
  const lat=Number(fields.lat),lon=Number(fields.lon),takenAt=Date.parse(fields.takenAt);
  if(!fields.lat||!fields.lon||!Number.isFinite(lat)||!Number.isFinite(lon)||lat<24||lat>50||lon< -125||lon> -66)throw Error('Choose a location on the US map.');
  if(!EVENTS.includes(fields.eventType))throw Error('Choose snow, aurora, nature, or fall colors.');
  if(!Number.isFinite(takenAt)||takenAt>now+5*60000||takenAt<Date.parse('1900-01-01T00:00:00Z'))throw Error('Enter the date and time this photo was taken, in the past.');
  if(!clean(fields.location)||!clean(fields.takenWith))throw Error('Add a location name and the camera or phone used.');
  try {new Intl.DateTimeFormat('en-US',{timeZone:fields.timezone}).format(now);}catch{throw Error('Choose a valid time zone.');}
  if(fields.consent!=='true')throw Error('Confirm this is your photo and you agree to share it publicly.');
  return {lat,lon,eventType:fields.eventType,location:clean(fields.location),takenWith:clean(fields.takenWith),takenAt:new Date(takenAt).toISOString(),timezone:fields.timezone,title:clean(fields.title,100),photographer:clean(fields.photographer,60),caption:clean(fields.caption,300)};
}
export function imageType(bytes) {
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
  if(bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71&&bytes[4]===13&&bytes[5]===10&&bytes[6]===26&&bytes[7]===10)return 'image/png';
  if(new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP')return 'image/webp';
  return null;
}
async function hash(text) {const data=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(data)].map(x=>x.toString(16).padStart(2,'0')).join('');}
function record(object) {
  try {
    const data=JSON.parse(object.customMetadata.record);
    return {id:object.key,...data,imageUrl:'/api/media/'+encodeURIComponent(object.key)};
  }catch{return null;}
}
async function upload(request,env) {
  if(request.headers.get('Origin')!==ALLOWED_ORIGIN)return json(request,{error:'Submit through the StormVector website.'},403);
  if(!request.headers.get('Content-Type')?.startsWith('multipart/form-data'))return json(request,{error:'Choose an image file.'},415);
  // Enforce a streaming limit, including when Content-Length is missing.
  const reader=request.body?.getReader();if(!reader)return json(request,{error:'Empty upload.'},400);
  let size=0;const chunks=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_REQUEST){await reader.cancel();return json(request,{error:'The prepared image is too large. Choose an image under 4 MB.'},413);}chunks.push(value);}
  const body=new Uint8Array(size);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}
  let form;try{form=await new Request(request.url,{method:'POST',headers:{'Content-Type':request.headers.get('Content-Type')},body}).formData();}catch{return json(request,{error:'Could not read the photo upload.'},400);}
  const file=form.get('photo');if(!file||typeof file.arrayBuffer!=='function'||file.size<4||file.size>MAX_IMAGE)return json(request,{error:'Choose a JPEG, PNG, or WebP image under 4 MB.'},400);
  let meta;try{meta=validateMetadata(Object.fromEntries(form));if(new TextEncoder().encode(JSON.stringify(meta)).length>1600)throw Error('Please shorten the location, title, or caption.');}catch(e){return json(request,{error:e.message},400);}
  const bytes=new Uint8Array(await file.arrayBuffer()),type=imageType(bytes);if(!type)return json(request,{error:'This file is not a supported photo. Choose JPEG, PNG, or WebP.'},415);
  const hour=Math.floor(Date.now()/3600000);
  const ip=request.headers.get('CF-Connecting-IP')||'unknown';
  const limitKey='limits/'+await hash(ip+'|'+env.PROJECT_ID);
  const prior=await env.BUCKET.get(limitKey);const limit=prior?await prior.json():{hour,count:0};
  const count=limit.hour===hour?limit.count:0;if(count>=6)return json(request,{error:'You have shared six photos this hour. Please try again next hour.'},429);
  const submittedAt=new Date().toISOString(),id='photos/'+String(9999999999999-Date.now()).padStart(13,'0')+'-'+crypto.randomUUID()+'.'+({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[type]);
  const deleteToken=crypto.randomUUID()+crypto.randomUUID();
  await env.BUCKET.put(id,bytes,{httpMetadata:{contentType:type,cacheControl:'public, max-age=3600'},customMetadata:{record:JSON.stringify({...meta,submittedAt}),deleteHash:await hash(deleteToken)}});
  await env.BUCKET.put(limitKey,JSON.stringify({hour,count:count+1}));
  return json(request,{photo:{id,...meta,submittedAt,imageUrl:'/api/media/'+encodeURIComponent(id)},deleteToken},201);
}
export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:headers(request)});
    try {
      if(url.pathname==='/api/health')return json(request,{status:env.BUCKET?'ready':'storage-unavailable',service:'StormVector community photos'},env.BUCKET?200:503);
      if(url.pathname==='/api/photos'&&request.method==='GET'){
        const cursor=url.searchParams.get('cursor')||undefined;
        const result=await env.BUCKET.list({prefix:'photos/',limit:100,cursor,include:['customMetadata']});
        return json(request,{photos:result.objects.map(record).filter(Boolean),cursor:result.truncated?result.cursor:null});
      }
      if(url.pathname==='/api/photos'&&request.method==='POST')return await upload(request,env);
      if(url.pathname.startsWith('/api/media/')&&request.method==='GET'){
        const key=decodeURIComponent(url.pathname.slice(11));if(!/^photos\/\d{13}-[a-f0-9-]{36}\.(jpg|png|webp)$/.test(key))return json(request,{error:'Photo not found.'},404);
        const object=await env.BUCKET.get(key);if(!object)return json(request,{error:'Photo not found.'},404);
        const h=new Headers(headers(request));object.writeHttpMetadata(h);h.set('ETag',object.httpEtag);h.set('Content-Security-Policy',"default-src 'none'");
        return new Response(object.body,{headers:h});
      }
      if(url.pathname==='/api/photos'&&request.method==='DELETE'){
        if(request.headers.get('Origin')!==ALLOWED_ORIGIN)return json(request,{error:'Use StormVector to remove your photo.'},403);
        if(Number(request.headers.get('Content-Length')||0)>1024)return json(request,{error:'Invalid removal request.'},400);
        const {id,deleteToken}=await request.json();if(typeof id!=='string'||!/^photos\/\d{13}-[a-f0-9-]{36}\.(jpg|png|webp)$/.test(id)||typeof deleteToken!=='string'||deleteToken.length>200)return json(request,{error:'Invalid photo receipt.'},400);
        const object=await env.BUCKET.head(id);if(!object)return json(request,{error:'Photo not found.'},404);
        if(await hash(deleteToken)!==object.customMetadata.deleteHash)return json(request,{error:'Use the browser that submitted this photo to remove it.'},403);
        await env.BUCKET.delete(id);return json(request,{removed:true});
      }
      if(url.pathname==='/')return new Response('StormVector community photo service. Visit https://bsborden96.github.io/Stormvector/',{headers:{'Content-Type':'text/plain'}});
      return json(request,{error:'Not found.'},404);
    }catch(e){console.error('Community service request failed:',e?.name);return json(request,{error:'Photo storage is temporarily unavailable. Please try again.'},503);}
  }
};
