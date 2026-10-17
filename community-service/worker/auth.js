/* Email/password accounts. Only hashed passwords and session tokens are stored. */
const ITERATIONS=100000;
const encode=s=>new TextEncoder().encode(s);
const hex=bytes=>[...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
const random=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
const sha=async s=>hex(await crypto.subtle.digest('SHA-256',encode(s)));
async function read(env,key){const o=await env.BUCKET.get(key);return o?o.json():null;}
async function put(env,key,value,options={}){return env.BUCKET.put(key,JSON.stringify(value),{httpMetadata:{contentType:'application/json'},...options});}
async function passwordHash(password,salt){const key=await crypto.subtle.importKey('raw',encode(password),'PBKDF2',false,['deriveBits']);return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:encode(salt),iterations:ITERATIONS,hash:'SHA-256'},key,256));}
function equal(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
function token(request){return request.headers.get('Cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith('sv_session='))?.slice(11);}
export async function memberId(request,env){
  const t=token(request);if(!t||!/^[a-f0-9]{64}$/.test(t))return null;
  const session=await read(env,'sessions/'+await sha(t));if(!session||session.expiresAt<Date.now())return null;
  const account=await read(env,session.accountKey);return account&&account.version===session.version?account.id:null;
}
function cookie(value,maxAge=2592000){return 'sv_session='+value+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age='+maxAge;}
async function signedIn(request,env,json,account,accountKey,extra={}){
  const t=random();await put(env,'sessions/'+await sha(t),{accountKey,version:account.version,expiresAt:Date.now()+2592000000});
  const response=json(request,{signedIn:true,...extra});response.headers.set('Set-Cookie',cookie(t));return response;
}
export async function auth(request,env,json){
  const path=new URL(request.url).pathname;if(!['/api/auth/signup','/api/auth/login','/api/auth/logout','/api/auth/recover'].includes(path))return null;
  if(request.method!=='POST')return json(request,{error:'Method not allowed.'},405);
  if(request.headers.get('Origin')!==new URL(request.url).origin)return json(request,{error:'Use the StormVector community website.'},403);
  if(path==='/api/auth/logout'){const t=token(request);if(t)await env.BUCKET.delete('sessions/'+await sha(t));const r=json(request,{signedOut:true});r.headers.set('Set-Cookie',cookie('',0));return r;}
  // Cap streamed input before parsing.
  const reader=request.body?.getReader();if(!reader)return json(request,{error:'Enter your email and password.'},400);
  let raw='',size=0;const decoder=new TextDecoder();while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();return json(request,{error:'Account request is too large.'},413);}raw+=decoder.decode(value,{stream:true});}
  let b;try{b=JSON.parse(raw);}catch{return json(request,{error:'Invalid account request.'},400);}
  const email=typeof b.email==='string'?b.email.trim().toLowerCase():'',password=b.password;
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||typeof password!=='string'||password.length>128)return json(request,{error:'Enter a valid email and a password up to 128 characters.'},400);
  // Rate limits are keyed by both source IP and account, without storing the IP or email in keys.
  const hour=Math.floor(Date.now()/3600000),ip=request.headers.get('CF-Connecting-IP')||'unknown';
  const keys=['auth-limits/ip/'+await sha(ip),'auth-limits/account/'+await sha(email)];
  for(const key of keys){const prior=await read(env,key);if(prior?.hour===hour&&prior.count>=30)return json(request,{error:'Too many sign-in attempts. Try again next hour.'},429);await put(env,key,{hour,count:prior?.hour===hour?prior.count+1:1});}
  const accountKey='accounts/'+await sha(email),account=await read(env,accountKey);
  if(path==='/api/auth/signup'){
    if(password.length<12)return json(request,{error:'Use a password with at least 12 characters.'},400);
    if(account)return json(request,{error:'This email already has an account. Sign in or use your recovery code.'},409);
    const salt=random(),recoveryCode=random(),created={id:random(),salt,passwordHash:await passwordHash(password,salt),recoveryHash:await sha(recoveryCode),version:random(),createdAt:new Date().toISOString()};
    const written=await put(env,accountKey,created,{onlyIf:{etagDoesNotMatch:'*'}});if(written===null)return json(request,{error:'This email already has an account. Sign in instead.'},409);
    return signedIn(request,env,json,created,accountKey,{recoveryCode});
  }
  if(path==='/api/auth/recover'){
    if(password.length<12)return json(request,{error:'Use a new password with at least 12 characters.'},400);
    if(!account||typeof b.recoveryCode!=='string'||!equal(await sha(b.recoveryCode.trim()),account.recoveryHash))return json(request,{error:'Email or recovery code is incorrect.'},401);
    const recoveryCode=random(),salt=random(),updated={...account,salt,passwordHash:await passwordHash(password,salt),recoveryHash:await sha(recoveryCode),version:random()};await put(env,accountKey,updated);return signedIn(request,env,json,updated,accountKey,{recoveryCode});
  }
  // Do password work for unknown accounts too.
  const computed=await passwordHash(password,account?.salt||'00000000000000000000000000000000');
  if(!account||!equal(computed,account.passwordHash))return json(request,{error:'Email or password is incorrect.'},401);
  return signedIn(request,env,json,account,accountKey);
}
