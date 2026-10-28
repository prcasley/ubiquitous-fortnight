/* Read-only public screening. Absence of a mapped feature is never a feasibility clearance. */
(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.RadarScreening=api;
})(globalThis,root=>{
  'use strict';
  const sources={
    flood:{name:'FEMA National Flood Hazard Layer',url:'https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28',
      fields:['FLD_ZONE','ZONE_SUBTY','SFHA_TF','DFIRM_ID','EFF_DATE'],required:['FLD_ZONE'],
      caveat:'High-risk FEMA Special Flood Hazard Areas (A/V zones) only; Zone X is not counted as high-risk overlap. Zone D is undetermined, and unshaded/shaded X still require source review. Mapped coverage only. Effective coverage has not been established by this query; not a flood-risk clearance or insurance determination.'},
    wetlands:{name:'USFWS National Wetlands Inventory',url:'https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/rest/services/Wetlands/MapServer/0',
      fields:['ATTRIBUTE','WETLAND_TYPE'],required:['ATTRIBUTE'],
      caveat:'Mapped inventory only. Survey coverage and imagery vintage vary; not a jurisdictional wetland delineation or buildability determination.'}
  };
  const classificationVersion='fema-sfha-av-v1';
  function floodClass(properties={}){
    const zone=String(properties.FLD_ZONE??'').trim().toUpperCase().replace(/\s+/g,''),sfha=String(properties.SFHA_TF??'').trim().toUpperCase();
    const high=/^(?:A|AE|AH|AO|A99|AR(?:\/(?:A|AE|AH|AO|A[1-9]\d?))?|A(?:[1-9]|[12]\d|30)|V|VE|V(?:[1-9]|[12]\d|30))$/.test(zone);
    const low=['X','B','C'].includes(zone);
    if((high&&['F','N'].includes(sfha))||(low&&['T','Y'].includes(sfha)))return 'unknown';
    return high?'high-risk':low?'not-sfha':'unknown';
  }
  async function read(url,fetcher,signal){
    const response=await fetcher(url,{signal,credentials:'omit',mode:'cors'});
    if(!response.ok)throw Error('Screening service HTTP '+response.status);
    const data=await response.json();
    if(data.error)throw Error(data.error.message||'Screening service error');
    return data;
  }
  async function screenOnce(record,kind,{fetcher=root.fetch,geo=root.turf,domain=root.RadarDomain,signal}={}){
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
      let selected=data.features,classification={};
      if(kind==='flood'){
        const intersecting=data.features.filter(f=>f.geometry&&geo.booleanIntersects(feature,f));
        if(intersecting.some(f=>floodClass(f.properties)==='unknown'))return {...base,status:'incomplete',classificationVersion,reason:'FEMA returned an undetermined, unknown or conflicting zone at this parcel. High-risk overlap could not be fully classified.'};
        selected=data.features.filter(f=>floodClass(f.properties)==='high-risk');
        classification={classificationVersion,allZoneLabels:[...new Set(intersecting.map(f=>String(f.properties.FLD_ZONE)))],overlapMeaning:'FEMA high-risk SFHA (A/V zones) only',zoneXSubtypes:[...new Set(intersecting.filter(f=>String(f.properties.FLD_ZONE).toUpperCase()==='X').map(f=>String(f.properties.ZONE_SUBTY||'Subtype not published')))]};
      }
      const result=domain.summarizeScreen(feature.geometry,selected,geo);
      return {...base,...result,...classification,featureCount:count.count,sourceUpdatedAt:meta.editingInfo?.lastEditDate||null,
        sourceVersion:meta.currentVersion||null};
    }catch(error){const cancelled=signal?.aborted===true;return {...base,status:'error',retryable:!cancelled&&(controller.signal.aborted||/fetch|network|HTTP (?:408|429|5\d\d)/i.test(String(error.message||error))),reason:cancelled?'Screening cancelled':controller.signal.aborted?'Screening timed out':String(error.message||error)};}
    finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  }
  async function screen(record,kind,options={}){let result;for(let attempt=1;attempt<=2;attempt++){result=await screenOnce(record,kind,options);result.attempts=attempt;if(!result.retryable||options.signal?.aborted)break;}return result;}
  function review(check){return check.kind==='flood'&&check.classificationVersion!==classificationVersion?{...check,status:'outdated',overlapPercent:null,reason:'This older flood check counted all mapped zones. Rerun the corrected high-risk A/V-zone check.',caveat:'Previous overlap percentages must not be used as high-risk flood exposure.'}:check;}
  return {sources,screen,floodClass,classificationVersion,review};
});
