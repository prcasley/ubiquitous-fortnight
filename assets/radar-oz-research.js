/* Parcel-specific reference checks. An intersection is never tax qualification or final OZ2 designation. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadarOZResearch=api;})(globalThis,()=>{
 'use strict';
 const sources={oz1:{name:'Federal OZ 1 tract reference',url:'https://geo.dot.gov/server/rest/services/Hosted/OZ_Opportunity_Zones/FeatureServer/0',fields:'geoid10,stusps'},oz2:{name:'Third-party OZ 2 eligibility reference',url:'https://services6.arcgis.com/BAJNi3EgCdtQ1BCG/ArcGIS/rest/services/Opportunity_Zone_2_Eligible_Tracts/FeatureServer/0',fields:'GEOID,STUSPS,OZ_2_0_Eli'}};
 async function check(rows,{kind='oz2',fetcher=globalThis.fetch,geo=globalThis.turf,signal}={}){
   const source=sources[kind];if(!source||!rows.length||rows.length>1100)throw Error('Select 1–1,100 retrieved parcels for a reference check');
   const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();const timer=setTimeout(abort,25000);
   try{
     const features=rows.map(r=>geo.feature(r.geometry.geometry||r.geometry));const bounds=geo.bbox(geo.featureCollection(features));
     const base={where:'1=1',geometry:JSON.stringify({xmin:bounds[0],ymin:bounds[1],xmax:bounds[2],ymax:bounds[3],spatialReference:{wkid:4326}}),geometryType:'esriGeometryEnvelope',inSR:'4326',spatialRel:'esriSpatialRelIntersects'};
     async function read(extra){const response=await fetcher(source.url+'/query?'+new URLSearchParams({...base,...extra}),{signal:controller.signal,credentials:'omit',mode:'cors'});if(!response.ok)throw Error('Reference service HTTP '+response.status);const data=await response.json();if(data.error)throw Error('Reference service could not verify this search area');return data;}
     const count=await read({f:'json',returnCountOnly:'true',returnGeometry:'false'});
     if(!Number.isInteger(count.count)||count.count<0||count.count>280)throw Error('Reference coverage exceeds the checked layer limit or returned an invalid count; narrow the parcel search');
     const data=await read({f:'geojson',outFields:source.fields,returnGeometry:'true',outSR:'4326',resultRecordCount:'280'});
     if(!Array.isArray(data.features)||data.exceededTransferLimit||data.features.length!==count.count)throw Error('Reference response was incomplete; no parcel classification was made');
     const positive=[];
     for(const f of data.features){
       if(!['Polygon','MultiPolygon'].includes(f.geometry?.type))throw Error('Reference polygon schema could not be verified');
       if(kind==='oz2'){
         const flag=String(f.properties?.OZ_2_0_Eli??'').trim().toLowerCase();
         if(/^(no|false|0|not eligible|ineligible)$/.test(flag))continue;
         if(!/^(yes|true|1|eligible)$/.test(flag))throw Error('The OZ 2 reference eligibility indicator was not recognized; no parcel status inferred');
       }
       positive.push({feature:f,bbox:geo.bbox(f)});
     }
     const checkedAt=new Date().toISOString(),result=[];
     for(let i=0;i<rows.length;i++){
       if(controller.signal.aborted)throw Error('Reference check cancelled or timed out');
       const subject=features[i],box=geo.bbox(subject),hits=positive.filter(t=>!(t.bbox[0]>box[2]||t.bbox[2]<box[0]||t.bbox[1]>box[3]||t.bbox[3]<box[1])&&geo.booleanIntersects(subject,t.feature));
       result.push({key:rows[i].key,kind,status:hits.length?(subject.geometry.type==='Point'?'reference-point-intersection':'reference-intersection'):'no-reference-intersection',tracts:[...new Set(hits.map(t=>String(t.feature.properties?.GEOID||t.feature.properties?.geoid10||'GEOID unavailable')))].slice(0,10),sourceName:source.name,sourceURL:source.url,checkedAt,caveat:'Reference intersection only. Final designation, full parcel inclusion and tax qualification are not established. A missing intersection is not an ineligibility determination.'});
       if(i%25===0)await new Promise(resolve=>setTimeout(resolve,0));
     }
     return {observations:result,sourceName:source.name,sourceURL:source.url,checkedAt};
   }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
 }
 return {sources,check};
});
