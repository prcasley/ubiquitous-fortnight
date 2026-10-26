/* Read-only public screening. Absence of a mapped feature is never a feasibility clearance. */
(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.RadarScreening=api;
})(globalThis,root=>{
  'use strict';
  const sources={
    flood:{name:'FEMA National Flood Hazard Layer',url:'https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28',
      fields:['FLD_ZONE','ZONE_SUBTY','DFIRM_ID','EFF_DATE'],required:['FLD_ZONE'],
      caveat:'Mapped flood zones only. Effective coverage has not been established by this query; not a flood-risk clearance or insurance determination.'},
    wetlands:{name:'USFWS National Wetlands Inventory',url:'https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/rest/services/Wetlands/MapServer/0',
      fields:['ATTRIBUTE','WETLAND_TYPE'],required:['ATTRIBUTE'],
      caveat:'Mapped inventory only. Survey coverage and imagery vintage vary; not a jurisdictional wetland delineation or buildability determination.'}
  };
  async function read(url,fetcher,signal){
    const response=await fetcher(url,{signal,credentials:'omit',mode:'cors'});
    if(!response.ok)throw Error('Screening service HTTP '+response.status);
    const data=await response.json();
    if(data.error)throw Error(data.error.message||'Screening service error');
    return data;
  }
  async function screen(record,kind,{fetcher=root.fetch,geo=root.turf,domain=root.RadarDomain,signal}={}){
    const source=sources[kind];if(!source)throw Error('Unknown screening layer');
    const base={kind,source:source.name,sourceURL:source.url,retrievedAt:new Date().toISOString(),
      coverage:'not-established',caveat:source.caveat,parcelKey:record.key};
    const controller=new AbortController(),abort=()=>controller.abort();
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
    const timer=setTimeout(abort,25000);
    try{
      const feature=record.geometry;
      if(!feature?.geometry)throw Error('Parcel geometry unavailable');
      const meta=await read(source.url+'?f=json',fetcher,controller.signal);
      if(meta.geometryType!=='esriGeometryPolygon')throw Error('Screening source is not a polygon layer');
      const available=new Set((meta.fields||[]).map(f=>f.name));
      if(source.required.some(name=>!available.has(name)))throw Error('Screening source schema changed');
      const bounds=geo.bbox(feature);
      if(bounds.some(n=>!Number.isFinite(n)))throw Error('Invalid parcel bounds');
      const geometry={xmin:bounds[0],ymin:bounds[1],xmax:bounds[2],ymax:bounds[3],spatialReference:{wkid:4326}};
      const params={where:'1=1',geometry:JSON.stringify(geometry),geometryType:'esriGeometryEnvelope',
        inSR:'4326',spatialRel:'esriSpatialRelIntersects'};
      const url=extras=>source.url+'/query?'+new URLSearchParams({...params,...extras});
      const count=await read(url({f:'json',returnCountOnly:'true',returnGeometry:'false'}),fetcher,controller.signal);
      if(!Number.isInteger(count.count)||count.count<0)throw Error('Invalid source count');
      const limit=Math.min(1500,Number(meta.maxRecordCount)||1000);
      if(count.count>limit)return {...base,status:'incomplete',reason:'Source count exceeds screening limit; no conclusion produced'};
      const data=await read(url({f:'geojson',outFields:source.fields.filter(f=>available.has(f)).join(','),
        returnGeometry:'true',outSR:'4326',resultRecordCount:String(limit)}),fetcher,controller.signal);
      if(!Array.isArray(data.features)||data.exceededTransferLimit||data.features.length!==count.count)
        return {...base,status:'incomplete',reason:'Source response was truncated or changed during retrieval'};
      const result=domain.summarizeScreen(feature.geometry,data.features,geo);
      return {...base,...result,featureCount:count.count,sourceUpdatedAt:meta.editingInfo?.lastEditDate||null,
        sourceVersion:meta.currentVersion||null};
    }catch(error){return {...base,status:'error',reason:controller.signal.aborted?'Screening cancelled or timed out':String(error.message||error)};}
    finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  }
  return {sources,screen};
});
