/* Official, account-free sources only. Owner queries are separate from bulk parcel scans. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadarPublicData=api;})(globalThis,()=>{
  'use strict';
  const sources={
    northampton:{name:'Northampton County public assessment GIS',url:'https://gis.northamptoncounty.org/arcgisweb/rest/services/Assessment_Services/Land_Records_LGM/MapServer/0',id:'CAMA_ID',owner:'OWNERS_NAME_1',status:'Exact parcel lookup; published fields only'},
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
    const numericId=record.provider==='northampton'&&/Integer|SmallInteger|Double|Single|OID/.test(record.sourceIdType||record.source?.idType||'');
    if(numericId&&(!/^\d+$/.test(id)||!Number.isSafeInteger(Number(id))))throw Error('A valid numeric assessment key is required');
    const where=source.id+" = "+(numericId?id:"'"+id.replace(/'/g,"''")+"'")+(county!=null?' AND CO_NO = '+county:'');
    const fields=[source.id,source.owner,...(record.provider==='northampton'?['OWNERS_NAME_2','MAIL_ADDRESS','MAIL_ADDRESS_1','MAIL_ADDRESS_2','MAIL_ADDRESS_3']:[]),...(county!=null?['CO_NO','ASMNT_YR']:[])];
    const url=source.url+'/query?'+new URLSearchParams({f:'json',where,outFields:record.provider==='northampton'?'*':fields.join(','),returnGeometry:'false',resultRecordCount:record.provider==='northampton'?'100':'2'});
    const controller=new AbortController(),cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
    const timeout=setTimeout(cancel,20000);
    try{
      const response=await fetcher(url,{credentials:'omit',mode:'cors',signal:controller.signal,cache:'no-store'});
      if(!response.ok)throw Error('Official source returned HTTP '+response.status);
      const data=await response.json();if(data.error)throw Error('Official source could not complete the ownership lookup');
      if(data.exceededTransferLimit)throw Error('Official source truncated the ownership response; no owner selected');
      let rows=(data.features||[]).filter(f=>String(f.attributes?.[source.id]??'')===id&&(county==null||Number(f.attributes?.CO_NO)===county));
      if(record.provider==='northampton'&&rows.length>1){
        const fields=['CAMA_ID','OWNERS_NAME_1','OWNERS_NAME_2','MAIL_ADDRESS','MAIL_ADDRESS_1','MAIL_ADDRESS_2','MAIL_ADDRESS_3','ASMNT_YR'];
        const signature=r=>JSON.stringify(fields.map(k=>r.attributes?.[k]??null));
        if(rows.every(r=>signature(r)===signature(rows[0])))rows=rows.slice(0,1);
      }
      if(rows.length!==1)throw Error(rows.length?'The source returned conflicting records; no owner selected':'The source did not return an exact parcel match');
      const attributes=rows[0].attributes,rawName=(record.provider==='northampton'?[attributes.OWNERS_NAME_1,attributes.OWNERS_NAME_2].filter(Boolean).join(' / '):String(attributes[source.owner]||'')).trim().slice(0,400),name=/^(?:(?:REDACTED|WITHHELD|PROTECTED)(?:\b|$)|(?:PRIVATE|NOT AVAILABLE|N\/?A|UNKNOWN|NULL)$)/i.test(rawName)?'':rawName;
      return {status:name?'published':'not-published',message:name?null:'No owner name is published in this exact source record. County tax/deed records may have additional published information; use the official records links. No owner was inferred.',publishedName:name,entityName:name&&entity(name)?name:null,
        mailingAddress:record.provider==='northampton'?[attributes.MAIL_ADDRESS,attributes.MAIL_ADDRESS_1,attributes.MAIL_ADDRESS_2,attributes.MAIL_ADDRESS_3].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(', ').slice(0,1000):null,classification:name&&entity(name)?'organization-style':'unclassified',sourceName:source.name,sourceURL:source.url,
        retrievedAt,assessmentYear:attributes.ASMNT_YR??record.assessment??null,parcelId:id,
        caveat:'Published assessment observation; not independently verified title or beneficial ownership.'};
    }finally{clearTimeout(timeout);signal?.removeEventListener('abort',cancel);}
  }
  // Batch version for automatic display: one request per 100 parcels per county source, owner name only
  // (no mailing or contact fields). Blank, redacted or protected names stay blank; nothing is inferred.
  async function lookupOwners(records,{fetcher=globalThis.fetch,signal,chunk=100,timeoutMs=20000}={}){
    const out=new Map(),retrievedAt=new Date().toISOString(),byProvider=new Map();
    for(const r of records){const source=sources[r.provider];if(!source?.owner||r.provider==='northampton'||!r.id)continue;const k=r.provider+(r.provider==='fdor'?':'+r.jurisdiction:'');if(!byProvider.has(k))byProvider.set(k,[]);byProvider.get(k).push(r);}
    for(const [k,rows] of byProvider){
      const provider=k.split(':')[0],source=sources[provider],county=provider==='fdor'?Number(rows[0].jurisdiction):null;
      if(provider==='fdor'&&![6,13,53,60,66].includes(county))continue;
      for(let i=0;i<rows.length;i+=chunk){
        if(signal?.aborted)return out;
        const part=rows.slice(i,i+chunk),ids=[...new Set(part.map(r=>String(r.id).trim()).filter(id=>id&&id.length<=200))];
        const where=source.id+' IN ('+ids.map(id=>"'"+id.replace(/'/g,"''")+"'").join(',')+')'+(county!=null?' AND CO_NO = '+county:'');
        const body=new URLSearchParams({f:'json',where,outFields:[source.id,source.owner].join(','),returnGeometry:'false',resultRecordCount:String(ids.length*3)});
        const controller=new AbortController(),cancel=()=>controller.abort(),timer=setTimeout(cancel,timeoutMs);signal?.addEventListener('abort',cancel,{once:true});
        try{
          const response=await fetcher(source.url+'/query',{method:'POST',body,credentials:'omit',mode:'cors',signal:controller.signal,cache:'no-store'});
          if(!response.ok)throw Error('HTTP '+response.status);const data=await response.json();if(data.error)throw Error('source error');
          const seen=new Map();for(const f of data.features||[]){const id=String(f.attributes?.[source.id]??'');const name=String(f.attributes?.[source.owner]||'').trim().slice(0,400);if(!seen.has(id))seen.set(id,new Set());seen.get(id).add(name);}
          for(const r of part){const names=seen.get(String(r.id).trim());let status='not-published',name='';
            if(names&&names.size===1){const raw=[...names][0];name=/^(?:(?:REDACTED|WITHHELD|PROTECTED)(?:\b|$)|(?:PRIVATE|NOT AVAILABLE|N\/?A|UNKNOWN|NULL)$)/i.test(raw)?'':raw;status=name?'published':'not-published';}
            else if(names&&names.size>1)status='conflicting';else if(!names)status='no-match';
            out.set(r.key,{status,publishedName:name,classification:name&&entity(name)?'organization-style':name?'unclassified':null,sourceName:source.name,sourceURL:source.url,retrievedAt});}
        }catch(e){for(const r of part)out.set(r.key,{status:'unavailable',message:String(e.message||e).slice(0,120),sourceName:source.name,retrievedAt});}
        finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
      }
    }
    return out;
  }
  return {sources,lookupOwner,lookupOwners,entity,entityKey};
});
