/* Hosted footprint reader. Same-origin tiles; bounded requests/cache; no missing-data = zero inference. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else{root.RadarLocalFootprints=api;root.loadLocalFootprints=api.load;}})(globalThis,root=>{
 'use strict';
 const tileXY=(lon,lat,z)=>{const n=2**z,r=lat*Math.PI/180;return [Math.floor((lon+180)/360*n),Math.floor((1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*n)];};
 const distance=(x,y,a,b)=>{const rad=Math.PI/180,p=Math.sin((b-y)*rad/2)**2+Math.cos(y*rad)*Math.cos(b*rad)*Math.sin((a-x)*rad/2)**2;return 3958.8*2*Math.asin(Math.sqrt(Math.min(1,p)));};
 const abort=()=>{throw new DOMException('Footprint request cancelled','AbortError');};
 function createLoader({fetcher=root.fetch,base='assets/footprints/',timeoutMs=10000,cacheSize=16}={}){
  let manifestPromise=null,active=0;const cache=new Map(),pending=new Map(),queue=[];
  async function json(path,signal){
   if(signal?.aborted)abort();
   await new Promise(resolve=>{queue.push(resolve);pump();});
   const ctrl=new AbortController(),cancel=()=>ctrl.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();const timer=setTimeout(cancel,timeoutMs);
   try{const r=await fetcher(base+path,{credentials:'same-origin',signal:ctrl.signal});if(!r.ok)throw Error('Hosted footprint HTTP '+r.status);return await r.json();}
   finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);active--;pump();}
  }
  function pump(){while(active<4&&queue.length){active++;queue.shift()();}}
  async function manifest(signal){
   if(!manifestPromise)manifestPromise=json('manifest.json',signal).then(m=>{
    if(m.zoom!==14||!Array.isArray(m.tiles)||m.tiles.length>2000||m.tiles.some(t=>!/^\d{1,5}\/\d{1,5}$/.test(t))||!m.markets||typeof m.source!=='string'||m.license!=='ODbL 1.0')throw Error('Hosted footprint manifest invalid');
    const markets=Object.values(m.markets);if(!markets.length||markets.some(v=>!Array.isArray(v.center)||v.center.length!==2||v.center.some(n=>!Number.isFinite(n))||!Number.isFinite(v.radiusMiles)||v.radiusMiles<=.75||v.radiusMiles>20))throw Error('Hosted footprint coverage invalid');
    return {...m,tileSet:new Set(m.tiles)};
   }).catch(e=>{manifestPromise=null;throw e;});
   return manifestPromise;
  }
  async function tile(k,m,signal){
   if(cache.has(k)){const value=cache.get(k);cache.delete(k);cache.set(k,value);return value;}
   if(!pending.has(k))pending.set(k,json('z'+m.zoom+'/'+k+'.json',signal).then(d=>{
    if(d.type!=='FeatureCollection'||!Array.isArray(d.features)||d.features.length>15000)throw Error('Hosted footprint tile invalid');
    const entries=d.features.map(f=>{if(f.type!=='Feature'||f.geometry?.type!=='Polygon'||!Array.isArray(f.geometry.coordinates)||!f.geometry.coordinates.length)throw Error('Hosted footprint geometry invalid');const b=[Infinity,Infinity,-Infinity,-Infinity];let count=0;
     for(const ring of f.geometry.coordinates){if(!Array.isArray(ring)||ring.length<4||ring[0]?.[0]!==ring.at(-1)?.[0]||ring[0]?.[1]!==ring.at(-1)?.[1])throw Error('Hosted footprint ring invalid');for(const p of ring){if(++count>10000||!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n))||Math.abs(p[0])>180||Math.abs(p[1])>85)throw Error('Hosted footprint coordinates invalid');b[0]=Math.min(b[0],p[0]);b[1]=Math.min(b[1],p[1]);b[2]=Math.max(b[2],p[0]);b[3]=Math.max(b[3],p[1]);}}
     return {f,b};});
    cache.set(k,entries);while(cache.size>cacheSize)cache.delete(cache.keys().next().value);return entries;
   }).finally(()=>pending.delete(k)));
   return pending.get(k);
  }
  async function load(bbox,{signal}={}){
   if(signal?.aborted)abort();
   if(!Array.isArray(bbox)||bbox.length!==4||bbox.some(v=>!Number.isFinite(v))||bbox[0]>=bbox[2]||bbox[1]>=bbox[3]||Math.abs(bbox[0])>180||Math.abs(bbox[2])>180||Math.abs(bbox[1])>85||Math.abs(bbox[3])>85)throw Error('Footprint bounds invalid');
   const m=await manifest(signal),corners=[[bbox[0],bbox[1]],[bbox[0],bbox[3]],[bbox[2],bbox[1]],[bbox[2],bbox[3]]];
   // Source selection used building centers. Stay 0.75 miles inside the extraction
   // boundary (more than the largest supplied building span), not just inside a tile.
   if(!Object.values(m.markets).some(v=>corners.every(p=>distance(...p,...v.center)<=v.radiusMiles-.75)))return null;
   const [x0,y0]=tileXY(bbox[0],bbox[3],m.zoom),[x1,y1]=tileXY(bbox[2],bbox[1],m.zoom),keys=[];
   if((x1-x0+3)*(y1-y0+3)>32)throw Error('Hosted footprint tile limit exceeded');
   for(let x=x0-1;x<=x1+1;x++)for(let y=y0-1;y<=y1+1;y++){const k=x+'/'+y;if(m.tileSet.has(k))keys.push(k);}
   if(!keys.length)throw Error('Hosted footprint coverage has no tiles');
   const parts=await Promise.all(keys.map(k=>tile(k,m,signal)));if(signal?.aborted)abort();
   const features=parts.flat().filter(({b})=>b[0]<=bbox[2]&&b[2]>=bbox[0]&&b[1]<=bbox[3]&&b[3]>=bbox[1]).map(({f})=>f);
   if(features.length>2000)throw Error('Hosted footprint candidate limit exceeded');
   return {type:'FeatureCollection',features,source:m.source,sourceURL:m.sourceURL,licenseURL:m.licenseURL,attribution:'Building footprints © Microsoft, ODbL',builtAt:m.builtAt,coverage:'Bounded market extract; 0.75-mile inset from center-selected extraction boundary. Imagery mapping may omit or merge buildings.'};
  }
  return {load};
 }
 return {createLoader,tileXY,...createLoader()};
});
