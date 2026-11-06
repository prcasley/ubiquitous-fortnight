/* On-demand public parcel inventory. No owner/contact fields in bulk requests. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadarOZInventoryCore=api;})(globalThis,()=>{
 'use strict';
 const nominationURL='https://services.arcgis.com/Aur8tCo478N3VovT/arcgis/rest/services/2026_Opportunity_Zone_2_0_Nominations/FeatureServer/0';
 const parcelURL='https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/ArcGIS/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0';
 const fields=['PAMS_PIN','PROP_LOC','MUN_NAME','PROP_CLASS','CALC_ACRE','COUNTY','YR_CONSTR','PCLBLOCK','PCLLOT','PCL_MUN','DEED_BOOK','DEED_PAGE','DEED_DATE','SALE_PRICE','PCLQCODE','BLDG_DESC','LAND_VAL','IMPRVT_VAL','NET_VALUE'];
 function esriPolygon(geometry){
  if(!['Polygon','MultiPolygon'].includes(geometry?.type))throw Error('Published tract boundary is not a polygon');
  const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
  let coordinates=0;
  const rings=polygons.flatMap(poly=>poly.map((ring,i)=>{
   if(!Array.isArray(ring)||ring.length<4||ring.some(p=>!Array.isArray(p)||p.length<2||!Number.isFinite(p[0])||!Number.isFinite(p[1])||p[0]<-180||p[0]>180||p[1]<-90||p[1]>90)||ring[0][0]!==ring.at(-1)[0]||ring[0][1]!==ring.at(-1)[1])throw Error('Published tract boundary has invalid coordinates');
   coordinates+=ring.length;if(coordinates>100000)throw Error('Tract boundary exceeds the checked geometry limit');
   const area=ring.slice(1).reduce((sum,p,j)=>sum+ring[j][0]*p[1]-p[0]*ring[j][1],0);
   if(!area)throw Error('Published tract boundary has no area');
   const copy=ring.map(p=>p.slice(0,2));return (i===0?area>0:area<0)?copy.reverse():copy;
  }));
  if(!rings.length)throw Error('Published tract boundary is empty');
  return {rings,spatialReference:{wkid:4326}};
 }
 async function json(url,params,{fetcher=globalThis.fetch,signal}={}){
  const controller=new AbortController(),stop=()=>controller.abort();signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)stop();const timer=setTimeout(stop,30000);
  try{const response=await fetcher(url+(params?'/query':'?f=json'),{method:params?'POST':'GET',...(params?{headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(params).toString()}:{}),signal:controller.signal,credentials:'omit',mode:'cors'});
   if(!response.ok)throw Error('Public GIS returned HTTP '+response.status);const data=await response.json();if(data.error)throw Error('Public GIS could not complete this inventory query');return data;
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',stop);}
 }
 async function collectTract(tract,{fetcher=globalThis.fetch,signal,geo=globalThis.turf,limit=5000,pageSize=250,onProgress=()=>{},classes=[],minAcres=0,boundaryFeature=null}={}){
  if(!/^34\d{9}$/.test(tract))throw Error('An exact 11-digit NJ tract is required');
  if(!Number.isInteger(limit)||limit<1||limit>5000)throw Error('Parcel retrieval limit must be 1–5,000');
  if(!Array.isArray(classes)||classes.some(c=>!['1','2','4A','4B','4C'].includes(c))||!Number.isFinite(minAcres)||minAcres<0||minAcres>99999)throw Error('Invalid published assessment class/acreage filter');
  const report={tract,boundarySource:boundaryFeature?'uploaded dated nomination boundary snapshot':'live NJ DCA boundary service',criteria:{classes,minAcres},status:'unavailable',expected:null,received:0,features:[],rejected:0,sourceURL:parcelURL,nominationURL,checkedAt:new Date().toISOString(),message:''};
  const options={fetcher,signal};
  try{
   const boundary=boundaryFeature?{features:[boundaryFeature]}:await json(nominationURL,{f:'geojson',where:"Geography = '"+tract+"'",outFields:'Geography',returnGeometry:'true',outSR:'4326',resultRecordCount:'2'},options);
   if(boundary.exceededTransferLimit||boundary.features?.length!==1||String(boundary.features[0].properties?.Geography)!==tract)throw Error('Nomination boundary did not return one exact tract');
   const geometry=boundary.features[0].geometry,polygon=esriPolygon(geometry);report.boundarySource=boundaryFeature?'uploaded dated nomination boundary snapshot':'live NJ DCA boundary service';
   const meta=await json(parcelURL,null,options),available=new Set((meta.fields||[]).map(f=>f.name));
   const oid=meta.objectIdField||meta.fields?.find(f=>f.type==='esriFieldTypeOID')?.name;
   if(!oid||!available.has(oid)||!fields.every(f=>available.has(f))||meta.geometryType!=='esriGeometryPolygon')throw Error('NJ parcel schema could not be verified');
   const predicates=[];if(classes.length)predicates.push("PROP_CLASS IN ("+classes.map(c=>"'"+c+"'").join(',')+")");if(minAcres>0)predicates.push('CALC_ACRE >= '+minAcres);
   const base={where:predicates.join(' AND ')||'1=1',geometry:JSON.stringify(polygon),geometryType:'esriGeometryPolygon',inSR:'4326',spatialRel:'esriSpatialRelIntersects'};
   const counted=await json(parcelURL,{...base,f:'json',returnCountOnly:'true',returnGeometry:'false'},options);
   if(!Number.isSafeInteger(counted.count)||counted.count<0)throw Error('Parcel count was not verified');report.expected=counted.count;
   const listed=await json(parcelURL,{...base,f:'json',returnIdsOnly:'true',returnGeometry:'false'},options),ids=listed.objectIds;
   if(!Array.isArray(ids)||ids.length!==report.expected||new Set(ids).size!==ids.length||ids.some(id=>!Number.isSafeInteger(id)||id<0))throw Error('Parcel ID list did not reconcile with the source count');ids.sort((a,b)=>a-b);
   const seen=new Set(),size=Math.max(1,Math.min(250,pageSize));
   for(let offset=0;offset<Math.min(report.expected,limit);){
    if(signal?.aborted)throw Error('Inventory stopped');
    const take=Math.min(size,limit-offset,report.expected-offset);
    const wanted=ids.slice(offset,offset+take);
    const data=await json(parcelURL,{...base,objectIds:wanted.join(','),f:'geojson',outFields:[oid,...fields].join(','),returnGeometry:'true',outSR:'4326',orderByFields:oid+' ASC',resultOffset:'0',resultRecordCount:String(take)},options);
    if(!Array.isArray(data.features)||!data.features.length||data.features.length>take)throw Error('Parcel paging returned an empty or oversized page');
    for(const feature of data.features){
     const id=feature.properties?.[oid];if(!Number.isSafeInteger(id)||!wanted.includes(id)||seen.has(String(id)))throw Error('Parcel paging repeated or omitted source record identities');seen.add(String(id));report.received++;
     const pin=String(feature.properties?.PAMS_PIN||'').trim();
     try{if(!pin||pin.length>200)throw Error();esriPolygon(feature.geometry);if(!geo.booleanIntersects(feature,{type:'Feature',geometry,properties:{}}))throw Error();report.features.push({type:'Feature',geometry:feature.geometry,properties:{...Object.fromEntries([oid,...fields].map(key=>[key,feature.properties[key]])),PAMS_PIN:pin}});}catch{report.rejected++;}
    }
    offset+=data.features.length;if(data.exceededTransferLimit)throw Error('Source truncated an explicit ID batch');onProgress({tract,received:report.received,expected:report.expected});
    if(data.features.length<take)throw Error('Parcel response ended before the reported count');
   }
   const after=await json(parcelURL,{...base,f:'json',returnCountOnly:'true',returnGeometry:'false'},options);
   if(after.count!==report.expected)throw Error('Parcel count changed during retrieval');
   report.status=report.received===report.expected&&!report.rejected?'complete':'partial';
   report.message=report.status==='complete'?'Count reconciled for this tract’s requested assessment/acreage scope; boundary intersections include parcels crossing tract edges.':report.rejected?'Some source rows failed identity or boundary checks.':'Retrieval cap reached; more parcels exist. Narrow the run to this tract or export the accepted records.';
  }catch(error){report.status=report.received?'partial':'unavailable';report.message=signal?.aborted?'Inventory stopped; completed records retained.':String(error.message||error);}
  return report;
 }
 function mergeReports(reports){
  const parcels=new Map();
  for(const report of reports)for(const feature of report.features){const id=String(feature.properties.PAMS_PIN),existing=parcels.get(id);
   if(existing){existing.tracts.add(report.tract);if(JSON.stringify(fields.map(k=>existing.feature.properties[k]))!==JSON.stringify(fields.map(k=>feature.properties[k])))existing.conflict=true;
    const parts=g=>g.type==='Polygon'?[g.coordinates]:g.coordinates;const before=parts(existing.feature.geometry),extra=parts(feature.geometry).filter(p=>!before.some(b=>JSON.stringify(b)===JSON.stringify(p)));if(extra.length)existing.feature.geometry={type:'MultiPolygon',coordinates:[...before,...extra]};
   }else parcels.set(id,{id,feature:structuredClone(feature),tracts:new Set([report.tract]),conflict:false});
  }
  return [...parcels.values()].map(r=>({...r,tracts:[...r.tracts].sort()}));
 }
 function assessmentAllocation(attrs){const number=value=>{if(typeof value==='boolean'||value==null||String(value).trim()==='')return null;const n=Number(value);return Number.isFinite(n)&&n>=0?n:null;},land=number(attrs?.LAND_VAL),improvements=number(attrs?.IMPRVT_VAL),total=land===null||improvements===null?null:land+improvements;return {land,improvements,total,landShare:total>0&&Number.isFinite(total)?land/total:null};}
 function geometryMetrics(feature,geo=globalThis.turf){esriPolygon(feature?.geometry);if(!geo)throw Error('Geometry library unavailable');const squareMeters=geo.area(feature);if(!(squareMeters>0)||!Number.isFinite(squareMeters))throw Error('Mapped tract area invalid');const reference=geo.pointOnFeature(feature).geometry.coordinates,bounds=geo.bbox(feature);return {mappedAcres:squareMeters/4046.8564224,mappedSquareFeet:squareMeters/0.09290304,bounds,referenceLon:reference[0],referenceLat:reference[1],caveat:'Entire mapped tract geometry, including holes and all polygon parts; any mapped water remains included. Not industrial land supply, available sites, usable acreage or developable area. Reference point is on the tract, not a parcel address or centroid.'};}
 function tractMetricsCSV(features,geo=globalThis.turf){const columns=['GEOID','COUNTY','MUNICIPALITY','RURAL_SOURCE_FLAG','MAPPED_TRACT_ACRES','MAPPED_TRACT_SQUARE_FEET','WEST','SOUTH','EAST','NORTH','REFERENCE_LONGITUDE','REFERENCE_LATITUDE','CAVEAT'],cell=v=>{let s=String(v??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};return [columns.map(cell).join(','),...features.map(f=>({f,m:geometryMetrics(f,geo)})).sort((a,b)=>b.m.mappedAcres-a.m.mappedAcres).map(({f,m})=>[f.properties.Geography,f.properties.County,f.properties.Municipality,f.properties.Rural,m.mappedAcres.toFixed(2),Math.round(m.mappedSquareFeet),...m.bounds,m.referenceLon,m.referenceLat,m.caveat].map(cell).join(','))].join('\n')+'\n';}
 function researchCSV(rows){const columns=['PAMS_PIN','ADDRESS','COUNTY','MUNICIPALITY','BLOCK','LOT','QUALIFIER','PROPERTY_CLASS','ACRES','SQUARE_FEET','ASSESSED_LAND_VALUE','ASSESSED_IMPROVEMENTS','ASSESSED_ALLOCATION_LAND_SHARE_PCT','TRACT_REFERENCES','PUBLISHED_ASSESSMENT_NAME','ASSESSMENT_NAME_STATUS','OWNER_OBSERVATION_CHECKED_AT','OWNER_SOURCE_URL','MUNICIPAL_ASSESSMENT_PORTAL_REFERENCE','TAX_MAILING_RECIPIENT','MAILING_STATUS','MAILING_CHECKED_AT','MAILING_SOURCE_URL','NJDEP_REGULATORY_SITE_NAMES','NJDEP_ON_PARCEL_SITE_NAMES','NJDEP_NEARBY_OR_UNVERIFIED_SITE_NAMES','NJDEP_PROGRAM_INTEREST_NAMES','REGULATORY_STATUS','REGULATORY_PROGRAM_STATUS','REGULATORY_CHECKED_AT','NJDEP_SITE_SOURCE_URLS','NJDEP_PROGRAM_SOURCE_URLS','GIS_SOURCE_URL','PARCEL_RETRIEVED_AT','SOURCE_SCOPE_STATUS','CAVEAT'],cell=v=>{let s=String(v??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};return [columns.map(cell).join(','),...rows.map(r=>{const a=r.facts||{},allocation=assessmentAllocation(a),acres=typeof r.acres==='number'&&Number.isFinite(r.acres)?r.acres:null,o=r.ownership;return [r.id,r.address,a.COUNTY,a.MUN_NAME,a.PCLBLOCK,a.PCLLOT,a.PCLQCODE,a.PROP_CLASS,acres===null?'':acres.toFixed(2),acres===null?'':Math.round(acres*43560),allocation.land,allocation.improvements,allocation.landShare===null?'':(allocation.landShare*100).toFixed(2),(r.tracts||[]).join(';'),o?.status==='published'?o.publishedName:'not checked or not published',o?.status==='published'?'published-assessment-observation':r.mailing?.parcelId===r.id?(r.mailing.status==='observed'?'not-published-in-checked-record':r.mailing.status):o?.status||'not-checked',o?.retrievedAt||(r.mailing?.parcelId===r.id?r.mailing.retrievedAt:''),o?.sourceURL||(r.mailing?.parcelId===r.id?r.mailing.sourceURL:''),r.assessmentPortalURL,r.mailing?.parcelId===r.id&&r.mailing.status==='observed'&&r.mailing.mailing?[r.mailing.mailing.street,r.mailing.mailing.cityState,r.mailing.mailing.zip].filter(Boolean).join(', '):'not checked or not published',r.mailing?.parcelId===r.id?(r.mailing.status==='observed'?(r.mailing.mailing?'published-recipient':'not-published-in-checked-record'):r.mailing.status):'not-checked',r.mailing?.parcelId===r.id?r.mailing.retrievedAt:'',r.mailing?.parcelId===r.id?r.mailing.sourceURL:'',r.regulatory?.parcelId===r.id&&['observed','partial'].includes(r.regulatory.status)?r.regulatory.sites.filter(s=>s.role==='regulatory-site').map(s=>s.siteName).filter(Boolean).join('; '):'not checked or unavailable',r.regulatory?.parcelId===r.id&&['observed','partial'].includes(r.regulatory.status)?r.regulatory.sites.filter(s=>s.role==='regulatory-site'&&s.insideParcel===true).map(s=>s.siteName).filter(Boolean).join('; '):'',r.regulatory?.parcelId===r.id&&['observed','partial'].includes(r.regulatory.status)?r.regulatory.sites.filter(s=>s.role==='regulatory-site'&&s.insideParcel!==true).map(s=>s.siteName).filter(Boolean).join('; '):'',r.regulatory?.parcelId===r.id&&['observed','partial'].includes(r.regulatory.status)?r.regulatory.interests.filter(s=>s.role==='program-interest').map(s=>s.name).filter(Boolean).join('; '):'not checked or unavailable',r.regulatory?.parcelId===r.id?(r.regulatory.status==='observed'&&!r.regulatory.sites.length?'checked-no-sites-in-scope':r.regulatory.status):'not-checked',r.regulatory?.parcelId===r.id?r.regulatory.interestStatus||r.regulatory.status:'not-checked',r.regulatory?.parcelId===r.id?r.regulatory.checkedAt:'',r.regulatory?.parcelId===r.id&&['observed','partial'].includes(r.regulatory.status)?r.regulatory.sites.filter(s=>s.role==='regulatory-site').map(s=>s.sourceURL).filter(Boolean).join('; '):'',r.regulatory?.parcelId===r.id&&['observed','partial'].includes(r.regulatory.status)?r.regulatory.interests.filter(s=>s.role==='program-interest').map(s=>s.sourceURL).filter(Boolean).join('; '):'',parcelURL,r.retrievedAt,r.scopeStatus,'Retrieved public research only; incomplete coverage may remain. Assessed allocations are not market value and are not tax basis. Assessment names are not verified title or acquisition contacts. Municipal links are portal references, not checked tax cards. Regulatory names and mailing recipients are separate roles, not owner/operator matches. Tract intersection is not whole-parcel inclusion or certification.'].map(cell).join(',');})].join('\n')+'\n';}
 return {collectTract,mergeReports,esriPolygon,parcelURL,nominationURL,fields,assessmentAllocation,geometryMetrics,tractMetricsCSV,researchCSV};
});
