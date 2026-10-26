/* Local field trips: ordered stops, notes, photos and self-contained printable packs. */
(() => {
  'use strict';
  const P=window.RadarProperty,C=window.RadarFieldPackCore,$=id=>document.getElementById(id),key='capital-radar-field-trip-v1';
  let stops=[],selected=null,dbPromise,working=false,photoURLs=[];
  function tell(message){$('fieldPackStatus').textContent=message;}
  function persist(){try{localStorage.setItem(key,JSON.stringify({version:1,stops}));return true;}catch{tell('Trip storage is full or unavailable. Export a backup before closing this tab.');return false;}}
  const button=(label,fn)=>{const b=document.createElement('button');b.type='button';b.className='secondary';b.disabled=working;b.textContent=label;b.addEventListener('click',fn);return b;};
  const database=()=>dbPromise||(dbPromise=new Promise((resolve,reject)=>{if(!window.indexedDB){reject(Error('Photo storage is unavailable in this browser'));return;}const r=indexedDB.open('capital-radar-field-photos',1);r.onupgradeneeded=()=>r.result.createObjectStore('photos',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('Photo storage is unavailable'));}));
  async function photo(id){const db=await database();return new Promise((resolve,reject)=>{const r=db.transaction('photos').objectStore('photos').get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('Photo could not be read'));});}
  async function writePhoto(value,remove=false){const db=await database();return new Promise((resolve,reject)=>{const t=db.transaction('photos','readwrite');if(remove)t.objectStore('photos').delete(value);else t.objectStore('photos').put(value);t.oncomplete=resolve;t.onerror=()=>reject(Error('Photo could not be saved'));});}
  const dataURL=blob=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('Image could not be read'));r.readAsDataURL(blob);});
  async function resized(file){
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>20000000)throw Error('Choose a JPEG, PNG or WebP photo under 20 MB');
    let image;
    if(window.createImageBitmap)image=await createImageBitmap(file);
    else{const url=URL.createObjectURL(file);try{image=new Image();image.src=url;await image.decode();}finally{URL.revokeObjectURL(url);}}
    try{if(image.width*image.height>40000000)throw Error('Choose a photo under 40 megapixels');
      const ratio=Math.min(1,1600/Math.max(image.width,image.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*ratio));canvas.height=Math.max(1,Math.round(image.height*ratio));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
      return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Photo could not be resized')),'image/jpeg',.82));
    }finally{image.close?.();}
  }
  function download(name,content,type){const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
  function add(record){
    try{if(working)throw Error('Finish preparing the pack before adding another stop');const property=P.snapshot(record,window.PublicRadarBridge.getMeta());
      if(stops.some(s=>s.property.key===property.key)){tell('That property is already in the field trip.');return true;}
      if(stops.length>=100)throw Error('The trip has 100 stops. Remove a stop before adding another.');
      stops.push({property,notes:'',nextAction:'',photos:[],include:stops.filter(s=>s.include).length<25,screenings:window.PublicRadarResearch?.getScreenings(property.key)||[]});persist();render();tell('Property added to the field trip. Reorder stops and add notes below.');return true;
    }catch(error){tell(error.message);return false;}
  }
  function render(){
    for(const url of photoURLs)URL.revokeObjectURL(url);photoURLs=[];
    const host=$('fieldTripStops');host.textContent='';
    $('fieldTripCount').textContent=`${stops.length} stops · ${stops.filter(s=>s.include).length} selected for the field pack`;
    $('generateFieldPack').disabled=working||!stops.some(s=>s.include);$('exportFieldTrip').disabled=working||!stops.length;
    for(const [index,stop] of stops.entries()){
      const row=document.createElement('article');row.className='field-trip-stop';row.dataset.parcelKey=stop.property.key;
      const title=document.createElement('h3');title.textContent=`${index+1}. ${stop.property.address||stop.property.id}`;
      const include=document.createElement('input');include.type='checkbox';include.checked=stop.include;include.setAttribute('aria-label','Include '+stop.property.id+' in field pack');
      include.addEventListener('change',()=>{if(include.checked&&stops.filter(s=>s.include).length>=25){include.checked=false;tell('Select at most 25 properties per field pack. Uncheck another stop first.');return;}stop.include=include.checked;persist();render();});
      const label=document.createElement('label');label.append(include,document.createTextNode(' Include in field pack'));
      const up=button('Move up',()=>{[stops[index-1],stops[index]]=[stops[index],stops[index-1]];persist();render();});up.disabled=working||index===0;
      const down=button('Move down',()=>{[stops[index+1],stops[index]]=[stops[index],stops[index+1]];persist();render();});down.disabled=working||index===stops.length-1;
      const directions=document.createElement('a');directions.href=P.links(stop.property).directions;directions.target='_blank';directions.rel='noopener noreferrer';directions.textContent='Directions to mapped location';
      const notes=document.createElement('textarea');notes.value=stop.notes;notes.maxLength=4000;notes.placeholder='Visit notes';notes.setAttribute('aria-label','Visit notes for '+stop.property.id);notes.addEventListener('change',()=>{stop.notes=notes.value;persist();});
      const next=document.createElement('input');next.value=stop.nextAction;next.maxLength=1000;next.placeholder='Next action';next.setAttribute('aria-label','Next action for '+stop.property.id);next.addEventListener('change',()=>{stop.nextAction=next.value;persist();});
      const upload=document.createElement('input');upload.type='file';upload.accept='image/jpeg,image/png,image/webp';upload.multiple=true;upload.setAttribute('aria-label','Add photos for '+stop.property.id);
      upload.addEventListener('change',async()=>{const files=[...upload.files];if(working)return;working=true;render();tell('Saving field photos…');try{for(const file of files){
        if(stop.photos.length>=3||stops.reduce((n,s)=>n+s.photos.length,0)>=100)throw Error('Photo limit reached: 3 per property, 100 per trip');
        const blob=await resized(file),id=crypto.randomUUID();await writePhoto({id,blob,addedAt:new Date().toISOString()});stop.photos.push(id);persist();
      }tell('Photos saved in this browser. Export a trip backup to keep a transferable copy.');}catch(error){tell(error.message);}finally{working=false;render();}});
      const images=document.createElement('div');images.className='field-photo-grid';
      for(const id of stop.photos){const holder=document.createElement('div');images.append(holder);const remove=()=>{stop.photos=stop.photos.filter(p=>p!==id);persist();render();};photo(id).then(p=>{if(!holder.isConnected)return;if(!p){holder.append(document.createTextNode('Stored photo is missing.'),button('Remove missing photo',remove));return;}const img=document.createElement('img'),url=URL.createObjectURL(p.blob);photoURLs.push(url);img.src=url;img.alt='User-added field photo';holder.append(img,button('Remove photo',async()=>{try{await writePhoto(id,true);remove();}catch(error){tell(error.message);}}));}).catch(()=>{holder.append(document.createTextNode('Photo unavailable in this browser; import its backup to restore it.'),button('Remove missing photo',remove));});}
      row.append(title,label,up,down,directions,notes,next,upload,images,button('Remove stop',async()=>{stops=stops.filter(s=>s!==stop);persist();render();for(const id of stop.photos)try{await writePhoto(id,true);}catch{}}));
      if(working)for(const control of row.querySelectorAll('input,textarea,button'))control.disabled=true;
      host.append(row);
    }
    if(!stops.length)host.textContent='Add properties from chat results or the selected parcel to build your visit list.';
  }
  async function readPhotos(stop){const output=[];for(const id of stop.photos){const p=await photo(id);if(!p)throw Error('A stored photo is missing; restore its backup or remove the missing photo before exporting');output.push({dataURL:await dataURL(p.blob),addedAt:p.addedAt});}return output;}
  async function generate(){
    if(working)return;const chosen=stops.filter(s=>s.include);if(!chosen.length||chosen.length>25){tell('Choose 1–25 properties for the field pack.');return;}
    working=true;render();tell('Preparing field pack with parcel outlines, available imagery and stored photos…');
    try{
      const imagery={},photos={};let missing=0;
      for(let i=0;i<chosen.length;i+=3)await Promise.all(chosen.slice(i,i+3).map(async stop=>{
        photos[stop.property.key]=await readPhotos(stop);
        try{const r=await fetch(P.view(stop.property).imageURL,{credentials:'omit',signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('image unavailable');const blob=await r.blob();if(!/^image\/(jpeg|png|webp)$/.test(blob.type)||blob.size>3000000)throw Error('image unavailable');imagery[stop.property.key]=await dataURL(blob);}catch{missing++;}
      }));
      download('capital-radar-field-pack.html',C.packetHTML(chosen,{imagery,photos}),'text/html');
      tell(`Field pack downloaded: ${chosen.length} properties${missing?'; '+missing+' satellite image(s) unavailable and clearly labeled':''}. Open the HTML file and choose Print / Save as PDF.`);
    }catch(error){tell('Field pack could not be completed: '+error.message);}finally{working=false;render();}
  }
  async function exportBackup(){
    if(working)return;working=true;render();try{const backup={version:1,exportedAt:new Date().toISOString(),stops:[]};for(const stop of stops)backup.stops.push({...stop,photos:await readPhotos(stop)});download('capital-radar-field-trip.json',JSON.stringify(backup,null,2),'application/json');tell('Trip backup downloaded with notes, order, photos and source observations.');}catch(error){tell(error.message);}finally{working=false;render();}
  }
  async function importBackup(file){
    if(!file||working)return;working=true;render();
    const written=[];let before=stops.slice();
    try{
      if(file.size>100000000)throw Error('Choose a trip backup under 100 MB');
      const input=JSON.parse(await file.text());if(input.version!==1||!Array.isArray(input.stops)||input.stops.length>100)throw Error('This is not a supported field-trip backup');
      const fresh=[],seen=new Set(stops.map(s=>s.property.key));let photoCount=stops.reduce((n,s)=>n+s.photos.length,0);
      for(const item of input.stops){const property=P.snapshot(item.property);if(seen.has(property.key))continue;seen.add(property.key);
        const entries=item.photos||[];if(!Array.isArray(entries)||entries.length>3)throw Error('Invalid photo count in backup');
        for(const p of entries)if(!C.image(p.dataURL))throw Error('Unsupported photo data in backup');
        photoCount+=entries.length;if(photoCount>100)throw Error('The merged trip would exceed 100 photos');
        fresh.push({property,notes:String(item.notes||'').slice(0,4000),nextAction:String(item.nextAction||'').slice(0,1000),photos:[],pendingPhotos:entries,include:false,screenings:Array.isArray(item.screenings)?item.screenings.slice(0,10):[]});
      }
      if(stops.length+fresh.length>100)throw Error('The merged trip would exceed 100 stops');
      for(const stop of fresh){for(const p of stop.pendingPhotos){const id=crypto.randomUUID(),blob=await resized(new Blob([Uint8Array.from(atob(p.dataURL.split(',')[1]),c=>c.charCodeAt(0))],{type:p.dataURL.slice(5,p.dataURL.indexOf(';'))}));await writePhoto({id,blob,addedAt:String(p.addedAt||'').slice(0,80)});written.push(id);stop.photos.push(id);}delete stop.pendingPhotos;stop.include=stops.filter(s=>s.include).length<25;stops.push(stop);}
      if(!persist())throw Error('The merged trip could not be saved');tell(`${fresh.length} stops imported. Existing stops and notes were preserved.`);
    }catch(error){stops=before;for(const id of written)try{await writePhoto(id,true);}catch{}tell('Trip import failed: '+error.message);}finally{working=false;render();}
  }
  function init(){
    if(!$('fieldTripStops'))return;
    try{const value=JSON.parse(localStorage.getItem(key));if(value?.version===1&&Array.isArray(value.stops)&&value.stops.length<=100)stops=value.stops.map(s=>({property:P.snapshot(s.property),notes:String(s.notes||'').slice(0,4000),nextAction:String(s.nextAction||'').slice(0,1000),photos:(s.photos||[]).filter(x=>typeof x==='string'&&/^[\w-]+$/.test(x)).slice(0,3),include:s.include===true,screenings:Array.isArray(s.screenings)?s.screenings.slice(0,10):[]}));}catch{tell('Stored trip could not be read. Existing storage was left intact; restore a trip backup if available.');}
    $('generateFieldPack').addEventListener('click',generate);$('exportFieldTrip').addEventListener('click',exportBackup);$('importFieldTrip').addEventListener('change',async e=>{await importBackup(e.target.files[0]);e.target.value='';});
    $('addSelectedTrip').addEventListener('click',()=>{const r=window.PublicRadarBridge.getResults().find(r=>r.key===selected);if(r)add(r);});
    document.addEventListener('radar:parcel-selected',e=>{selected=e.detail.key;$('addSelectedTrip').disabled=false;});
    document.addEventListener('radar:scan-state',e=>{if(e.detail.state==='idle'){selected=null;$('addSelectedTrip').disabled=true;}});
    render();
  }
  window.RadarFieldPack={add};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
