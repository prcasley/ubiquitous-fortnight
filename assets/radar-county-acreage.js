/* Verified size units only. Projection area is a conservative candidate prefilter, never land acreage. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadarCountyAcreage=api;})(globalThis,()=>{
 'use strict';
 function discover(meta){const fields=meta.fields||[],numeric=f=>/Integer|Double|Single/.test(f.type||'');
  for(const f of fields.filter(numeric)){const name=f.name.toUpperCase();if(['ACRES','ACREAGE','LAND_ACRES'].includes(name))return {kind:'published',field:f.name,scale:1};if(['LOT_SQFT','LOT_SQ_FT','LAND_SQFT','LAND_SQ_FT','LND_SQFOOT'].includes(name))return {kind:'published',field:f.name,scale:43560};}
  const spatial=meta.sourceSpatialReference||meta.extent?.spatialReference||{},wkid=spatial.latestWkid||spatial.wkid;
  const field=fields.find(f=>numeric(f)&&[meta.geometryProperties?.shapeAreaFieldName,'Shape__Area','SHAPE__AREA'].includes(f.name));
  return field&&[3857,102100,102113].includes(wkid)?{kind:'projected-prefilter',field:field.name,scale:4046.8564224}:null;
 }
 function predicate(def,filter){if(filter.op==='>='&&filter.value===0)return '1=1';if(!def||!/^[A-Za-z_][A-Za-z0-9_]*$/.test(def.field))return null;
  const field=def.field,n=v=>Number((v*def.scale).toFixed(6));
  if(def.kind==='projected-prefilter'){if(['<','<='].includes(filter.op)||filter.op==='under')return null;return field+' >= '+n(filter.value);}
  const term=filter.op==='between'?field+' >= '+n(filter.value)+' AND '+field+' <= '+n(filter.max):field+' '+filter.op+' '+n(filter.value);
  return '(('+term+') OR '+field+' IS NULL OR '+field+' <= 0)';
 }
 return {discover,predicate};
});
