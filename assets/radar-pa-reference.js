/* Optional official municipal-boundary lookup. Never infer a town from a numeric code. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadarPAReference=api;})(globalThis,root=>{
 'use strict';
 const boundaryURL='https://gis.northamptoncounty.org/arcgisweb/rest/services/Administration/OperationalLayers/MapServer/0';
 function create({fetcher=root.fetch,timeoutMs=6000}={}){
  let sourcePromise=null;
  async function read(url,signal){const r=await fetcher(url,{credentials:'omit',signal});if(!r.ok)throw Error('Municipal reference HTTP '+r.status);const d=await r.json();if(d.error)throw Error('Municipal reference query unavailable');return d;}
  async function discover(signal){
   const meta=await read(boundaryURL+'?f=json',signal),field=(meta.fields||[]).find(f=>f.name.toUpperCase()==='FULLNAME'&&f.type==='esriFieldTypeString');
   if(meta.geometryType!=='esriGeometryPolygon'||!field)throw Error('County municipal polygon/name schema could not be verified');
   return {url:boundaryURL,name:'Northampton County official municipal boundaries',field:field.name};
  }
  async function fetchForExtent(envelope,{signal}={}){
   const ctrl=new AbortController(),cancel=()=>ctrl.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();const timer=setTimeout(cancel,timeoutMs);
   try{
    if(!sourcePromise)sourcePromise=discover(ctrl.signal).catch(e=>{sourcePromise=null;throw e;});
    const source=await sourcePromise,base={f:'json',where:'1=1',geometry:JSON.stringify(envelope),geometryType:'esriGeometryEnvelope',inSR:'4326',spatialRel:'esriSpatialRelIntersects'};
    const query=extra=>source.url+'/query?'+new URLSearchParams({...base,...extra});
    const count=await read(query({returnCountOnly:'true',returnGeometry:'false'}),ctrl.signal);if(!Number.isInteger(count.count)||count.count<0||count.count>200)throw Error('County municipal reference count could not be bounded');
    const d=await read(query({f:'geojson',outFields:source.field,outSR:'4326',returnGeometry:'true',resultRecordCount:'200'}),ctrl.signal);
    if(!Array.isArray(d.features)||d.features.length!==count.count||d.exceededTransferLimit||d.features.some(f=>!['Polygon','MultiPolygon'].includes(f.geometry?.type)||typeof f.properties?.[source.field]!=='string'))throw Error('Municipal reference response was incomplete');
    return {status:'complete',features:d.features,source,checkedAt:new Date().toISOString()};
   }catch(e){return {status:'unavailable',reason:signal?.aborted?'Municipal lookup cancelled':'Municipal names not verified; published numeric codes were retained. '+e.message};}
   finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
  }
  return {fetchForExtent};
 }
 function apply(records,reference,geo=root.turf){
  if(reference?.status!=='complete')return records;
  for(const r of records){
   if(r.state!=='PA')continue;
   const hits=reference.features.filter(f=>geo.booleanPointInPolygon([r.lon,r.lat],f));
   const names=[...new Set(hits.map(f=>f.properties[reference.source.field].trim()).filter(Boolean))];
   if(names.length!==1)continue;
   const source=r.source,value=kind=>source.mappings?.[kind]?.map(f=>r.original?.[f.name]).find(v=>v!=null&&String(v).trim()!=='');
   const street=value('address')||[value('number'),...(source.mappings?.street||[]).map(f=>r.original?.[f.name])].filter(Boolean).join(' ');
   r.address=[String(street||'').trim().replace(/[,\s]+$/,''),names[0],'PA'].filter(Boolean).join(', ');
   r.municipalityObservation={name:names[0],sourceURL:reference.source.url,sourceName:reference.source.name,checkedAt:reference.checkedAt,caveat:'Municipality at the parcel map reference point; boundaries may cross a parcel. Not a zoning determination.'};
  }
  return records;
 }
 return {create,apply,...create()};
});
