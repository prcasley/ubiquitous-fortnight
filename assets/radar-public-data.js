/* Official, account-free sources only. Owner queries are separate from bulk parcel scans. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadarPublicData=api;})(globalThis,()=>{
  'use strict';
  const sources={
    northampton:{name:'Northampton County public assessment GIS',url:'https://gis.northamptoncounty.org/arcgisweb/rest/services/Assessment_Services/Land_Records_LGM/MapServer/0',id:'CAMA_ID',owner:'OWNERS_NAME_1',status:'Exact parcel lookup; published fields only'},
    pbc:{name:'Palm Beach public property GIS',url:'https://services1.arcgis.com/ZWOoUZbtaYePLlPw/arcgis/rest/services/Parcels_and_Property_Details_WebMercator/FeatureServer/0',id:'PARID',owner:'OWNER_NAME1',status:'Owner and mailing fields verified November 6, 2026'},
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
    const fields=[source.id,source.owner,...(record.provider==='pbc'?['CONFID_FLG']:[]),...(record.provider==='northampton'?['OWNERS_NAME_2','MAIL_ADDRESS','MAIL_ADDRESS_1','MAIL_ADDRESS_2','MAIL_ADDRESS_3']:[]),...(county!=null?['CO_NO','ASMNT_YR']:[])];
    const url=source.url+'/query?'+new URLSearchParams({f:'json',where,outFields:record.provider==='northampton'?'*':fields.join(','),returnGeometry:'false',resultRecordCount:record.provider==='northampton'?'100':'2'});
    const controller=new AbortController(),cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
    const timeout=setTimeout(cancel,20000);
    try{
      const response=await fetcher(url,{credentials:'omit',mode:'cors',signal:controller.signal,cache:'no-store'});
      if(!response.ok)throw Error('Official source returned HTTP '+response.status);
      const data=await response.json();if(data.error)throw Error('Official source could not complete the ownership lookup');
      if(data.exceededTransferLimit)throw Error('Official source truncated the ownership response; no owner selected');
      let rows=(data.features||[]).filter(f=>String(f.attributes?.[source.id]??'')===id&&(county==null||Number(f.attributes?.CO_NO)===county));
      if(['northampton','pbc'].includes(record.provider)&&rows.length>1){
        const fields=record.provider==='pbc'?[source.id,source.owner,'CONFID_FLG']:['CAMA_ID','OWNERS_NAME_1','OWNERS_NAME_2','MAIL_ADDRESS','MAIL_ADDRESS_1','MAIL_ADDRESS_2','MAIL_ADDRESS_3','ASMNT_YR'];
        const signature=r=>JSON.stringify(fields.map(k=>r.attributes?.[k]??null));
        if(rows.every(r=>signature(r)===signature(rows[0])))rows=rows.slice(0,1);
      }
      if(rows.length!==1)throw Error(rows.length?'The source returned conflicting records; no owner selected':'The source did not return an exact parcel match');
      const attributes=rows[0].attributes,rawName=(record.provider==='northampton'?[attributes.OWNERS_NAME_1,attributes.OWNERS_NAME_2].filter(Boolean).join(' / '):String(attributes[source.owner]||'')).trim().slice(0,400),protectedRecord=/^(?:Y|YES|TRUE|1)$/i.test(String(attributes.CONFID_FLG||'')),name=protectedRecord||/^(?:(?:REDACTED|WITHHELD|PROTECTED|CONFIDENTIAL)(?:\b|$)|(?:PRIVATE|NOT AVAILABLE|N\/?A|UNKNOWN|NULL)$)/i.test(rawName)?'':rawName;
      return {status:name?'published':'not-published',message:name?null:protectedRecord?'This assessment record is protected; names and mailing recipients are not displayed.':'No owner name is published in this exact source record. County tax/deed records may have additional published information; use the official records links. No owner was inferred.',publishedName:name,entityName:name&&entity(name)?name:null,
        mailingAddress:record.provider==='northampton'?[attributes.MAIL_ADDRESS,attributes.MAIL_ADDRESS_1,attributes.MAIL_ADDRESS_2,attributes.MAIL_ADDRESS_3].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(', ').slice(0,1000):null,classification:name&&entity(name)?'organization-style':'unclassified',sourceName:source.name,sourceURL:source.url,
        retrievedAt,assessmentYear:attributes.ASMNT_YR??record.assessment??null,parcelId:id,
        caveat:'Published assessment observation; not independently verified title or beneficial ownership.'};
    }finally{clearTimeout(timeout);signal?.removeEventListener('abort',cancel);}
  }
  const researchMetadata=new Map();
  async function lookupResearch(record,{fetcher=globalThis.fetch,signal,core=globalThis.RadarOwnershipResearchCore}={}){
    if(!core?.businessParcel(record))return {status:'restricted',message:'Extra mailing/operator research is limited to commercial, industrial and vacant target records; tax class is not zoning.'};
    const source=sources[record.provider];if(!source)throw Error('No verified assessment source is connected');
    if(!researchMetadata.has(source.url))researchMetadata.set(source.url,fetcher(source.url+'?f=json',{credentials:'omit',signal,cache:'no-store'}).then(async r=>{if(!r.ok)throw Error('Assessment metadata unavailable');const d=await r.json();if(d.error||!Array.isArray(d.fields))throw Error('Assessment schema unavailable');return new Set(d.fields.map(f=>f.name));}).catch(e=>{researchMetadata.delete(source.url);throw e;}));
    const fields=await researchMetadata.get(source.url);if(!fields.has(source.id))throw Error('The source parcel identifier could not be verified');
    const extras={njgin:['ST_ADDRESS','CITY_STATE','ZIP_CODE','PCL_MUN','PCLBLOCK','PCLLOT','PCLQCODE','MUN_NAME','COUNTY','PROP_CLASS','DEED_BOOK','DEED_PAGE'],fdor:['OWN_ADDR1','OWN_ADDR2','OWN_CITY','OWN_STATE','OWN_ZIPCD','DOR_UC','CO_NO','ASMNT_YR'],pbc:['PADDR1','PADDR2','PADDR3','CITYNAME','STATE','ZIP1','ZIP2','CONFID_FLG','OWNER_ADDR1','OWNER_ADDR2','OWNER_CITY','OWNER_STATE','OWNER_ZIP','PROPERTY_USE'],broward:['MAIL_STREET','MAIL_CITY','MAIL_STATE','MAIL_ZIP','USE_CODE'],miamidade:['TRUE_MAILING_ADDR1','TRUE_MAILING_CITY','TRUE_MAILING_STATE','TRUE_MAILING_ZIP','DOR_CODE_CUR'],northampton:['OWNERS_NAME_2','MAIL_ADDRESS','MAIL_ADDRESS_1','MAIL_ADDRESS_2','MAIL_ADDRESS_3','LUC']}[record.provider]||[];
    const projected=[source.id,source.owner,...extras].filter(f=>fields.has(f)),id=String(record.id||'').trim();if(!id||id.length>200)throw Error('Exact parcel identity required');
    const numeric=record.provider==='northampton'&&/Integer|SmallInteger|Double|Single|OID/.test(record.sourceIdType||record.source?.idType||'');if(numeric&&!/^\d+$/.test(id))throw Error('Invalid numeric parcel identifier');
    const county=record.provider==='fdor'?Number(record.jurisdiction):null;if(county!=null&&![6,13,53,60,66].includes(county))throw Error('Verified FDOR county required');
    const where=source.id+' = '+(numeric?id:"'"+id.replace(/'/g,"''")+"'")+(county==null?'':' AND CO_NO = '+county);
    const r=await fetcher(source.url+'/query?'+new URLSearchParams({f:'json',where,outFields:[...new Set(projected)].join(','),returnGeometry:'false',resultRecordCount:'100'}),{credentials:'omit',signal,cache:'no-store'});
    if(!r.ok)throw Error('Assessment research service HTTP '+r.status);const d=await r.json();if(d.error||d.exceededTransferLimit||!Array.isArray(d.features))throw Error('Assessment research response unavailable or truncated');
    const rows=d.features.filter(f=>String(f.attributes?.[source.id]??'')===id&&(county==null||Number(f.attributes.CO_NO)===county));
    if(!rows.length)throw Error('No exact assessment record returned');const signatures=new Set(rows.map(f=>JSON.stringify(projected.map(k=>f.attributes[k]??null))));if(signatures.size!==1)throw Error('Conflicting assessment records; no mailing address selected');
    const a=rows[0].attributes;if(a.PROP_CLASS&&!['4A','4B','1'].includes(String(a.PROP_CLASS)))return {status:'restricted',message:'The live source class is outside the commercial/industrial/vacant research scope.'};
    const raw=String(a[source.owner]||'').trim(),protectedName=/^(REDACTED|WITHHELD|PROTECTED|CONFIDENTIAL)\b/i.test(raw)||/^(Y|YES|TRUE|1)$/i.test(String(a.CONFID_FLG||'')),name=protectedName||core.missing(raw)?'':raw.slice(0,400),v=k=>core.missing(a[k])?'':String(a[k]).trim().slice(0,400);
    let mailing=null;
    if(!protectedName){if(record.provider==='njgin')mailing={street:v('ST_ADDRESS'),cityState:v('CITY_STATE'),zip:v('ZIP_CODE')};
     if(record.provider==='fdor')mailing={street:[v('OWN_ADDR1'),v('OWN_ADDR2')].filter(Boolean).join(', '),cityState:[v('OWN_CITY'),v('OWN_STATE')].filter(Boolean).join(', '),zip:v('OWN_ZIPCD')};
     if(record.provider==='pbc')mailing={street:(fields.has('PADDR1')?[v('PADDR1'),v('PADDR2'),v('PADDR3')]:[v('OWNER_ADDR1'),v('OWNER_ADDR2')]).filter(Boolean).join(', '),cityState:[v('CITYNAME')||v('OWNER_CITY'),v('STATE')||v('OWNER_STATE')].filter(Boolean).join(', '),zip:v('ZIP1')||v('OWNER_ZIP')};
     if(record.provider==='broward')mailing={street:v('MAIL_STREET'),cityState:[v('MAIL_CITY'),v('MAIL_STATE')].filter(Boolean).join(', '),zip:v('MAIL_ZIP')};
     if(record.provider==='miamidade')mailing={street:v('TRUE_MAILING_ADDR1'),cityState:[v('TRUE_MAILING_CITY'),v('TRUE_MAILING_STATE')].filter(Boolean).join(', '),zip:v('TRUE_MAILING_ZIP')};
     if(record.provider==='northampton')mailing={street:[...new Set(['MAIL_ADDRESS','MAIL_ADDRESS_1','MAIL_ADDRESS_2','MAIL_ADDRESS_3'].map(v).filter(Boolean))].join(', '),cityState:'',zip:''};}
    return {status:'observed',parcelId:id,state:record.state,publishedName:name||null,entityName:name&&entity(name)?name:null,mailing:mailing?.street?mailing:null,reference:core.identity({...record,original:{...(record.original||{}),...a}}),sourceName:source.name,sourceURL:source.url,retrievedAt:new Date().toISOString(),assessmentYear:a.ASMNT_YR??record.assessment??null,caveat:'Tax-bill recipient address is not proof of headquarters, owner identity or common control. Protected names are not reconstructed.'};
  }
  async function lookupFacilities(record,{fetcher=globalThis.fetch,signal,geo=globalThis.turf,core=globalThis.RadarOwnershipResearchCore}={}){
    if(!core?.businessParcel(record))return {status:'restricted',facilities:[],message:'Facility research requires a commercial/industrial target record.'};
    if(!Number.isFinite(record.lat)||!Number.isFinite(record.lon))throw Error('Published parcel coordinates required');
    const root='https://echodata.epa.gov/echo/echo_rest_services.',params={output:'JSON',p_lat:record.lat,p_long:record.lon,p_radius:.15};
    async function read(endpoint,q){const r=await fetcher(root+endpoint+'?'+new URLSearchParams(q),{credentials:'omit',signal});if(!r.ok)throw Error('EPA facility service unavailable (HTTP '+r.status+')');return r.json();}
    let data=await read('get_facilities',params);if(data.Results?.QueryID&&!data.Results?.Facilities&&Number(data.Results?.QueryRows)!==0){const id=String(data.Results.QueryID);if(!/^\d+$/.test(id)||Number(data.Results.QueryRows)>100)throw Error('EPA result requires a narrower checked query');data=await read('get_qid',{output:'JSON',qid:id});}
    const facilities=core.facilityRows(data).map(f=>({...f,insideParcel:geo&&['Polygon','MultiPolygon'].includes((record.geometry?.geometry||record.geometry)?.type)?geo.booleanPointInPolygon([f.lon,f.lat],record.geometry?.geometry||record.geometry):null}));
    if(geo?.distance&&facilities.some(f=>f.insideParcel!==true&&geo.distance([record.lon,record.lat],[f.lon,f.lat],{units:'miles'})>.25))throw Error('EPA returned a facility outside the checked neighborhood; location requires review');
    return {status:'observed',facilities,sourceURL:'https://echo.epa.gov/',retrievedAt:new Date().toISOString(),caveat:'Facility registrations are possible site/operator references, not property owners, active permits, parent control or verified acquisition decision-makers.'};
  }

  async function lookupLehighOwner(record,{ownerLayerURL,fetcher=globalThis.fetch,signal}={}){
    if(record.provider!=='lehigh'||record.state!=='PA')throw Error('The PIN join is specific to Lehigh records');
    let url;try{url=new URL(ownerLayerURL);}catch{throw Error('A verified owner-layer URL is required; no layer was guessed');}
    const base=new URL(record.source?.url||record.sourceURL);if(url.protocol!=='https:'||url.username||url.password||url.origin!==base.origin||url.pathname.replace(/\/\d+$/,'')!==base.pathname.replace(/\/\d+$/,'')||!/^\/.*\/(?:FeatureServer|MapServer)\/\d+$/.test(url.pathname))throw Error('Owner layer must belong to the verified parcel service origin');
    const read=async u=>{const r=await fetcher(u,{credentials:'omit',signal});if(!r.ok)throw Error('Lehigh owner service unavailable');const d=await r.json();if(d.error)throw Error('Lehigh owner query failed');return d;};
    const meta=await read(url.href+'?f=json'),fields=new Map((meta.fields||[]).map(f=>[f.name,f]));if(!['PIN','PARNUM','OWNER_NAME'].every(f=>fields.has(f)))throw Error('Lehigh owner join schema could not be verified');
    const id=String(record.id||'').trim();if(!id||id.length>200)throw Error('Exact Lehigh PIN required');const numeric=/Integer|Double|SmallInteger/.test(fields.get('PIN').type||'');if(numeric&&!/^\d+$/.test(id))throw Error('Numeric PIN required');
    const where='PIN = '+(numeric?id:"'"+id.replace(/'/g,"''")+"'")+' AND PARNUM = '+(/Integer|Double|SmallInteger/.test(fields.get('PARNUM').type||'')?'1':"'1'");
    const projection=['PIN','PARNUM','OWNER_NAME','MAILING_ADDRESS','MAIL_ADDR1','MAIL_CITY','MAIL_STATE','MAIL_ZIP','ZONING'].filter(f=>fields.has(f));
    const d=await read(url.href+'/query?'+new URLSearchParams({f:'json',where,outFields:projection.join(','),returnGeometry:'false',resultRecordCount:'100'}));
    if(d.exceededTransferLimit||!Array.isArray(d.features))throw Error('Lehigh owner join response incomplete');const rows=d.features.map(f=>f.attributes).filter(a=>String(a?.PIN)===id&&String(a.PARNUM)==='1');
    if(!rows.length||new Set(rows.map(a=>JSON.stringify(projection.map(k=>a[k]??null)))).size!==1)throw Error('No unique exact PIN/primary owner row; no owner inferred');
    const a=rows[0],name=String(a.OWNER_NAME||'').trim();return {status:name?'published':'not-published',publishedName:name,entityName:entity(name)?name:null,sourceURL:url.href,retrievedAt:new Date().toISOString(),mailingAddress:[a.MAILING_ADDRESS,a.MAIL_ADDR1,a.MAIL_CITY,a.MAIL_STATE,a.MAIL_ZIP].filter(Boolean).join(', '),zoning:a.ZONING??null,caveat:'Published owner-layer assessment observation, not title or zoning approval. Direct browser access must be verified before enabling this adapter.'};
  }
  return {sources,lookupOwner,lookupResearch,lookupFacilities,lookupLehighOwner,entity,entityKey};
});
