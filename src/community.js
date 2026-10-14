/* Shared photos live in hosted object storage, never just in browser localStorage. */
const Community = (() => {
  const API='https://stormvector-community-borden.robustapple32.chatgpt.site';
  const TYPES={aurora:'Aurora',snow:'Snow',nature:'Nature',fall:'Fall colors'};
  let photos=[],cursor=null,activeGroup=null,galleryMap=null,pinMap=null,photoMarkers=null,pin=null,previewUrl=null,initialized=false,loadVersion=0;
  let receipts={};
  const $=id=>document.getElementById(id);
  function node(tag,text,cls){const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;}
  function captureTimestamp(value,zone) {
    if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value))throw Error('Choose the date and time the photo was taken.');
    const parts=value.split(/[-T:]/).map(Number),[year,month,day,hour,minute]=parts;
    const wall=Date.UTC(year,month-1,day,hour,minute);
    const formatter=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
    const wallAt=time=>{const p=Object.fromEntries(formatter.formatToParts(new Date(time)).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));return Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute);};
    let guess=wall;for(let i=0;i<4;i++)guess+=wall-wallAt(guess);
    const check=Object.fromEntries(formatter.formatToParts(new Date(guess)).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
    if([check.year,check.month,check.day,check.hour,check.minute].some((v,i)=>v!==parts[i]))throw Error('This time does not exist in that time zone. Choose another time.');
    return new Date(guess).toISOString();
  }
  function groupPhotos(items) {
    const groups=new Map();items.forEach(p=>{const key=`${Math.round(p.lat*20)},${Math.round(p.lon*20)}`;if(!groups.has(key))groups.set(key,{key,photos:[],lat:0,lon:0});const group=groups.get(key);group.photos.push(p);group.lat+=p.lat;group.lon+=p.lon;});
    return [...groups.values()].map(g=>({...g,lat:g.lat/g.photos.length,lon:g.lon/g.photos.length}));
  }
  function localInput(now,zone) {
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(now)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  }
  async function api(path,options={}) {
    const r=await fetch(API+path,{...options,signal:AbortSignal.timeout(options.method==='POST'?60000:20000)});
    let data;try{data=await r.json();}catch{throw Error('The photo service did not return a valid response.');}
    if(!r.ok)throw Error(data.error||'The photo service is unavailable.');return data;
  }
  function setup() {
    if(initialized)return;initialized=true;
    try{receipts=JSON.parse(localStorage.getItem('stormvector:photo-receipts'))||{};}catch{receipts={};}
    DESTINATIONS.forEach(p=>{const o=node('option',p.name);o.value=p.id;$('photoLocation').append(o);});
    const zone=Intl.DateTimeFormat().resolvedOptions().timeZone;
    if(![...$('photoTimezone').options].some(o=>o.value===zone)){const option=node('option',zone);option.value=zone;$('photoTimezone').append(option);}
    $('photoTimezone').value=zone;$('photoTakenAt').value=localInput(Date.now(),zone);
    ['photoTakenAt','photoTimezone'].forEach(id=>$(id).addEventListener('change',timestampPreview));timestampPreview();
    ['photoEventFilter','photoAgeFilter'].forEach(id=>$(id).addEventListener('change',()=>{activeGroup=null;renderGallery();}));
    $('photoSearch').addEventListener('input',()=>{activeGroup=null;renderGallery();});
    $('refreshPhotos').addEventListener('click',()=>loadPhotos());$('morePhotos').addEventListener('click',()=>loadPhotos(true));
    $('allPhotoLocations').addEventListener('click',()=>{activeGroup=null;renderGallery();fitPhotos();});
    $('photoLocation').addEventListener('change',()=>{const p=DESTINATIONS.find(p=>p.id===$('photoLocation').value);if(p){$('photoLocationName').value=p.name;setPin(p.lat,p.lon,false);}else if($('photoLocation').value==='custom'){$('photoLocationName').value='';$('photoPinStatus').textContent='Tap the map to choose where this photo was taken.';}});
    $('photoUseLocation').addEventListener('click',useLocation);
    $('photoFile').addEventListener('change',()=>{if(previewUrl)URL.revokeObjectURL(previewUrl);const f=$('photoFile').files[0];$('photoPreview').hidden=!f;if(f){previewUrl=URL.createObjectURL(f);$('photoPreview').src=previewUrl;}});
    $('photoForm').addEventListener('submit',submit);
  }
  function timestampPreview() {
    try{$('photoTimestampPreview').textContent=`Photo timestamp: ${captureTimestamp($('photoTakenAt').value,$('photoTimezone').value)}. Submission time is added automatically.`;}
    catch(e){$('photoTimestampPreview').textContent=e.message;}
  }
  function maps() {
    if(typeof L==='undefined'){$('communityMap').hidden=true;$('communityMapFallback').hidden=false;$('photoPinMap').hidden=true;$('photoPinStatus').textContent='Map unavailable. Select a listed destination or use your location instead.';return;}
    if(!galleryMap){try{
      galleryMap=L.map('communityMap',{scrollWheelZoom:false}).setView([46,-89.5],6);
      const tiles=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:17,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'}).addTo(galleryMap);tiles.on('tileerror',()=>{$('communityMapFallback').hidden=false;});
      photoMarkers=L.layerGroup().addTo(galleryMap);
      pinMap=L.map('photoPinMap',{scrollWheelZoom:false}).setView([44.5,-88.7],6);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:17,attribution:'© OpenStreetMap contributors'}).addTo(pinMap);
      pinMap.on('click',e=>{if($('photoLocation').value!=='custom')$('photoLocationName').value='';$('photoLocation').value='custom';setPin(e.latlng.lat,e.latlng.lng,true);});
    }catch{$('communityMapFallback').hidden=false;$('photoPinStatus').textContent='Map could not load. Select a listed place or use your location.';}}
    requestAnimationFrame(()=>{galleryMap?.invalidateSize();pinMap?.invalidateSize();});
  }
  function setPin(lat,lon,custom) {
    $('photoLat').value=lat.toFixed(5);$('photoLon').value=lon.toFixed(5);
    if(pinMap){if(pin)pin.setLatLng([lat,lon]);else pin=L.marker([lat,lon],{draggable:true}).addTo(pinMap).on('dragend',()=>{const p=pin.getLatLng();if($('photoLocation').value!=='custom')$('photoLocationName').value='';$('photoLocation').value='custom';setPin(p.lat,p.lng,true);});pinMap.setView([lat,lon],custom?pinMap.getZoom():10);}
    $('photoPinStatus').textContent=`Photo location: ${lat.toFixed(5)}, ${lon.toFixed(5)}. ${custom?'Add a location name above.':'Drag the pin to refine it.'}`;
  }
  function useLocation() {
    if(!navigator.geolocation){$('photoPinStatus').textContent='Your browser cannot provide a location. Choose a destination or use the map.';return;}
    $('photoPinStatus').textContent='Requesting your current location…';
    navigator.geolocation.getCurrentPosition(p=>{$('photoLocation').value='custom';$('photoLocationName').value='';setPin(p.coords.latitude,p.coords.longitude,true);},()=>{$('photoPinStatus').textContent='Location unavailable. Choose a destination or place a map pin.';},{timeout:10000,maximumAge:60000});
  }
  async function loadPhotos(append=false) {
    const version=++loadVersion;$('refreshPhotos').disabled=true;$('morePhotos').disabled=true;
    $('photoGalleryStatus').textContent=append?'Loading more photos…':'Loading shared photos…';
    try{const data=await api('/api/photos'+(append&&cursor?'?cursor='+encodeURIComponent(cursor):''));if(version!==loadVersion)return;
      if(!Array.isArray(data.photos))throw Error('Photo list is unavailable.');
      const safe=data.photos.filter(p=>TYPES[p.eventType]&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&typeof p.id==='string'&&p.imageUrl?.startsWith('/api/media/'));
      photos=append?[...new Map([...photos,...safe].map(p=>[p.id,p])).values()]:safe;cursor=data.cursor||null;
      renderGallery();fitPhotos();
    }catch(e){if(version===loadVersion){$('photoGalleryStatus').textContent=e.message;renderGallery(false);}}
    finally{if(version===loadVersion){$('refreshPhotos').disabled=false;$('morePhotos').disabled=false;}}
  }
  function filtered() {
    const type=$('photoEventFilter').value,q=$('photoSearch').value.trim().toLowerCase(),age=$('photoAgeFilter').value;
    return photos.filter(p=>(type==='all'||p.eventType===type)&&(!q||`${p.location} ${p.title} ${p.caption}`.toLowerCase().includes(q))&&(age==='all'||Date.parse(p.takenAt)>=Date.now()-Number(age)*86400000));
  }
  function fitPhotos() {if(galleryMap&&photos.length)galleryMap.fitBounds(L.latLngBounds(photos.map(p=>[p.lat,p.lon])).pad(.15),{maxZoom:11});}
  function renderGallery(updateStatus=true) {
    const all=filtered(),groups=groupPhotos(all),shown=activeGroup?groups.find(g=>g.key===activeGroup)?.photos||[]:all;
    if(updateStatus)$('photoGalleryStatus').textContent=`${shown.length} photo${shown.length===1?'':'s'} ${activeGroup?'at the selected map group':'shown'} · ${groups.length} map group${groups.length===1?'':'s'} · Grouped by nearby selected coordinates.`;
    $('morePhotos').hidden=!cursor;$('photoGrid').replaceChildren();
    if(photoMarkers){photoMarkers.clearLayers();groups.forEach(group=>{const icon=L.divIcon({className:'photo-group-marker',html:`<span>${group.photos.length}</span>`,iconSize:[38,38],iconAnchor:[19,19]});const marker=L.marker([group.lat,group.lon],{icon,title:`${group.photos.length} photos near ${group.photos[0].location}`,keyboard:true}).addTo(photoMarkers);marker.bindTooltip(node('span',`${group.photos.length} photos near ${group.photos[0].location}`));marker.on('click',()=>{activeGroup=group.key;renderGallery();$('photoGrid').scrollIntoView({behavior:'smooth',block:'nearest'});});});}
    if(!shown.length)$('photoGrid').append(node('p',photos.length?'No photos match these filters. Try another event or date.':'The map is waiting for its first shared moment. Add your photo below.','empty-state'));
    shown.forEach(photo=>{
      const card=node('article',null,'photo-card'),image=node('img');image.src=API+photo.imageUrl;image.alt=photo.title||`${TYPES[photo.eventType]} at ${photo.location}`;image.loading='lazy';
      const open=node('a');open.href=API+photo.imageUrl;open.target='_blank';open.rel='noopener noreferrer';open.setAttribute('aria-label','Open full photo');open.append(image);card.append(open);
      const detail=node('div',null,'photo-card-detail');detail.append(node('p',TYPES[photo.eventType],'eyebrow'),node('h3',photo.title||photo.location),node('p',photo.location),node('p',`Taken with ${photo.takenWith}`,'fineprint'));
      const captured=new Date(photo.takenAt).toLocaleString([],{timeZone:photo.timezone,dateStyle:'medium',timeStyle:'short'});
      detail.append(node('p',`Taken ${captured} · ${photo.timezone}`,'fineprint'),node('p',`Submitted ${new Date(photo.submittedAt).toLocaleString()}`,'fineprint'));
      if(photo.photographer)detail.append(node('p',`Shared by ${photo.photographer}`,'fineprint'));if(photo.caption)detail.append(node('p',photo.caption));
      const locate=node('button','Locate on map ↗','quiet');locate.type='button';locate.addEventListener('click',()=>{galleryMap?.setView([photo.lat,photo.lon],12);$('communityMap').scrollIntoView({behavior:'smooth'});});detail.append(locate);
      if(receipts[photo.id]){const remove=node('button','Remove my photo','quiet');remove.type='button';remove.addEventListener('click',async()=>{remove.disabled=true;try{await api('/api/photos',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:photo.id,deleteToken:receipts[photo.id]})});delete receipts[photo.id];saveReceipts();photos=photos.filter(p=>p.id!==photo.id);activeGroup=null;renderGallery();}catch(e){detail.append(node('p',e.message,'feed-error'));remove.disabled=false;}});detail.append(remove);}
      card.append(detail);$('photoGrid').append(card);
    });
  }
  function saveReceipts(){try{localStorage.setItem('stormvector:photo-receipts',JSON.stringify(receipts));return true;}catch{return false;}}
  async function prepareImage(file) {
    if(!file||file.size>20*1024*1024)throw Error('Choose a photo under 20 MB.');
    const url=URL.createObjectURL(file),image=new Image();image.src=url;
    try{await image.decode();const scale=Math.min(1,2200/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);const context=canvas.getContext('2d');if(!context||!canvas.width||!canvas.height)throw Error('Could not prepare this photo.');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
      for(const quality of [.86,.72,.58]){const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));if(blob&&blob.size<=4*1024*1024)return blob;}
      throw Error('This photo is too large after preparation. Try a smaller image.');
    }catch(e){throw Error(e.message==='Could not prepare this photo.'?e.message:'Could not prepare this image. Choose a JPEG, PNG, or WebP photo.');}
    finally{URL.revokeObjectURL(url);}
  }
  async function submit(event) {
    event.preventDefault();if(!$('photoForm').reportValidity())return;
    $('submitPhoto').disabled=true;$('photoSubmitStatus').textContent='Preparing your photo…';
    try{
      if(!$('photoLat').value||!$('photoLon').value)throw Error('Select a destination or place a map pin before sharing.');
      const takenAt=captureTimestamp($('photoTakenAt').value,$('photoTimezone').value);if(Date.parse(takenAt)>Date.now()+5*60000)throw Error('The time taken cannot be in the future.');
      const blob=await prepareImage($('photoFile').files[0]),body=new FormData();body.set('photo',blob,'photo.jpg');
      const fields={lat:$('photoLat').value,lon:$('photoLon').value,location:$('photoLocationName').value,eventType:$('photoEvent').value,takenWith:$('photoCamera').value,takenAt,timezone:$('photoTimezone').value,title:$('photoTitle').value,photographer:$('photoPhotographer').value,caption:$('photoCaption').value,consent:String($('photoConsent').checked)};
      Object.entries(fields).forEach(([key,value])=>body.set(key,value));$('photoSubmitStatus').textContent='Sharing your photo and placing its map pin…';
      const data=await api('/api/photos',{method:'POST',body});receipts[data.photo.id]=data.deleteToken;const stored=saveReceipts();
      photos=[data.photo,...photos];activeGroup=null;$('photoEventFilter').value='all';$('photoAgeFilter').value='all';$('photoSearch').value='';renderGallery();galleryMap?.setView([data.photo.lat,data.photo.lon],11);
      $('photoSubmitStatus').textContent=stored?'Photo shared. Your map pin and timestamps are saved.':'Photo shared. Receipt storage is unavailable; keep this page open to remove this photo.';
      $('photoFile').value='';$('photoPreview').hidden=true;if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null;}$('photoConsent').checked=false;
    }catch(e){$('photoSubmitStatus').textContent=e.message;}
    finally{$('submitPhoto').disabled=false;}
  }
  function activate(){setup();maps();loadPhotos();}
  return {activate,captureTimestamp,groupPhotos};
})();
if(typeof module!=='undefined')module.exports=Community;
