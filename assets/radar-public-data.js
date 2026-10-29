/* Official, account-free sources only. Owner queries are separate from bulk parcel scans. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadarPublicData=api;})(globalThis,()=>{
  'use strict';
  const sources={
    pbc:{name:'Palm Beach public property GIS',url:'https://services1.arcgis.com/ZWOoUZbtaYePLlPw/arcgis/rest/services/Parcels_and_Property_Details_WebMercator/FeatureServer/0',id:'PARID',owner:'OWNER_NAME1',status:'Owner field and one record verified October 26, 2026'},
    broward:{name:'Broward public property GIS',url:'https://services.arcgis.com/JMAJrTsHNLrSsWf5/ArcGIS/rest/services/PARCEL_POLY_BCPA_TAXROLL/FeatureServer/0',id:'FOLIO_NUMBER',owner:'NAME_LINE_1',status:'Adapter present; current network verification pending'},
    miamidade:{name:'Miami-Dade public property GIS',url:'https://services.arcgis.com/8Pc9XBTAsYuxx9Ny/arcgis/rest/services/PaParcelView_gdb/FeatureServer/0',id:'FOLIO',owner:'TRUE_OWNER1',status:'Adapter present; current network verification pending'},
    fdor:{name:'Florida DOR assessment centroids',url:'https://services9.arcgis.com/Gh9awoU677aKree0/ArcGIS/rest/services/Florida_Statewide_Parcel_Centroid_Version/FeatureServer/0',id:'PARCEL_ID',owner:'OWN_NAME',status:'Source varies by county; individual query verification required'},
    njgin:{name:'NJ statewide parcel composite',url:'https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/ArcGIS/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0',id:'PAMS_PIN',owner:'OWNER_NAME',status:'Published owner availability varies; blank and protected records are not inferred',researchURL:'https://www.nj.gov/transparency/property/'}
  };
  const entity=name=>/\b(?:LLC|L\.?L\.?C\.?|INC\.?|CORP(?:ORATION)?\.?|LTD\.?|LLP|LP|AUTHORITY|COUNTY|CITY OF|STATE OF)\b/i.test(name)&&!/\b(?:FAMILY|REVOCABLE|LIVING|PERSONAL)\s+TRUST\b/i.test(name);
  const entityKey=(state,name)=>state+':'+String(name).toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
  async function lookupOwner(record,{fetcher=globalThis.fetch,signal}={}){
    const source=sources[record.provider],retrievedAt=new Date().toISOString();
    if(!source)return {status:'unsupported',message:'No verified ownership adapter is available for this source.',retrievedAt};
    if(!source.owner)return {status:'not-published',message:source.status,sourceURL:source.researchURL,retrievedAt};
    const id=String(record.id||'').trim();if(!id||id.length>200)throw Error('A valid parcel ID is required');
    const county=record.provider==='fdor'?Number(record.jurisdiction):null;
    if(record.provider==='fdor'&&![6,13,53,60,66].includes(county))throw Error('County identity is required for the statewide owner lookup');
    const where=source.id+" = '"+id.replace(/'/g,"''")+"'"+(county!=null?' AND CO_NO = '+county:'');
    const fields=[source.id,source.owner,...(county!=null?['CO_NO','ASMNT_YR']:[])];
    const url=source.url+'/query?'+new URLSearchParams({f:'json',where,outFields:fields.join(','),returnGeometry:'false',resultRecordCount:'2'});
    const controller=new AbortController(),cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
    const timeout=setTimeout(cancel,20000);
    try{
      const response=await fetcher(url,{credentials:'omit',mode:'cors',signal:controller.signal,cache:'no-store'});
      if(!response.ok)throw Error('Official source returned HTTP '+response.status);
      const data=await response.json();if(data.error)throw Error('Official source could not complete the ownership lookup');
      if(data.exceededTransferLimit)throw Error('Official source truncated the ownership response; no owner selected');
      const rows=(data.features||[]).filter(f=>String(f.attributes?.[source.id]??'')===id&&(county==null||Number(f.attributes?.CO_NO)===county));
      if(rows.length!==1)throw Error(rows.length?'The source returned conflicting records; no owner selected':'The source did not return an exact parcel match');
      const attributes=rows[0].attributes,rawName=String(attributes[source.owner]||'').trim().slice(0,400),name=/^(?:(?:REDACTED|WITHHELD|PROTECTED)(?:\b|$)|(?:PRIVATE|NOT AVAILABLE|N\/?A|UNKNOWN|NULL)$)/i.test(rawName)?'':rawName;
      return {status:name?'published':'not-published',message:name?null:'No owner name is published in this exact source record. County tax/deed records may have additional published information; use the official records links. No owner was inferred.',publishedName:name,entityName:name&&entity(name)?name:null,
        classification:name&&entity(name)?'organization-style':'unclassified',sourceName:source.name,sourceURL:source.url,
        retrievedAt,assessmentYear:attributes.ASMNT_YR??record.assessment??null,parcelId:id,
        caveat:'Published assessment observation; not independently verified title or beneficial ownership.'};
    }finally{clearTimeout(timeout);signal?.removeEventListener('abort',cancel);}
  }
  return {sources,lookupOwner,entity,entityKey};
});
