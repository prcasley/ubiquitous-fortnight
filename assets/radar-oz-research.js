/* Parcel-specific reference checks. An intersection is never tax qualification or final OZ2 designation. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadarOZResearch=api;})(globalThis,()=>{
 'use strict';
 const MIN_NJ_COVERAGE=95;
 function parcelCoverage(subject,hits,geo){
  if(!['Polygon','MultiPolygon'].includes(subject.geometry.type))return {coverageBasis:'point-only',overlapPercent:null,tractShares:new Map()};
  const total=geo.area(subject);if(!(total>0))throw Error('Parcel area could not be verified');
  const cuts=hits.map(t=>geo.intersect(geo.featureCollection([subject,t.feature])));
  const shares=new Map(hits.map((h,i)=>[h,Math.min(100,(cuts[i]?geo.area(cuts[i]):0)/total*100)]));
  const positive=cuts.filter(Boolean),merged=positive.length>1?geo.union(geo.featureCollection(positive)):positive[0];
  return {coverageBasis:'parcel-area',overlapPercent:Math.min(100,(merged?geo.area(merged):0)/total*100),tractShares:shares};
 }
 const sources={ozNJ:{name:'NJ DCA state-nomination boundary reference',url:'https://services.arcgis.com/Aur8tCo478N3VovT/arcgis/rest/services/2026_Opportunity_Zone_2_0_Nominations/FeatureServer/0',fields:'Geography,County,Municipality',geoidField:'Geography'},ozFL:{name:'FloridaCommerce OZ 2.0 eligibility: tracts meeting criteria (not a nomination list)',url:'https://services1.arcgis.com/HpJC1O7FLVQlHgaG/arcgis/rest/services/oppzones_ustreasury_met/FeatureServer/0',fields:'GEOID,designatio,tract_pove,Median_Fam,MetroArea_',geoidField:'GEOID',designation:'Meets Criteria',page:'https://www.floridajobs.org/rural/opportunity-zones-program'},ozFLNot:{name:'FloridaCommerce OZ 2.0 eligibility: tracts not meeting criteria',url:'https://services1.arcgis.com/HpJC1O7FLVQlHgaG/arcgis/rest/services/oppzones_ustreasury_NotMet/FeatureServer/0',fields:'GEOID,designatio,tract_pove,Median_Fam,MetroArea_',geoidField:'GEOID',designation:'Does not Meets Criteria',page:'https://www.floridajobs.org/rural/opportunity-zones-program'},oz1:{name:'Federal OZ 1 tract reference',url:'https://geo.dot.gov/server/rest/services/Hosted/OZ_Opportunity_Zones/FeatureServer/0',fields:'geoid10,stusps'},oz2:{name:'Third-party OZ 2 eligibility reference',url:'https://services6.arcgis.com/BAJNi3EgCdtQ1BCG/ArcGIS/rest/services/Opportunity_Zone_2_Eligible_Tracts/FeatureServer/0',fields:'GEOID,STUSPS,OZ_2_0_Eli'}};
 async function check(rows,{kind='oz2',fetcher=globalThis.fetch,geo=globalThis.turf,signal}={}){
   const source=sources[kind];if(!source||!rows.length||rows.length>1600)throw Error('Select 1–1,600 retrieved parcels for a reference check');
   const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();const timer=setTimeout(abort,25000);
   try{
     const features=rows.map(r=>geo.feature(r.geometry.geometry||r.geometry));const bounds=geo.bbox(geo.featureCollection(features));
     const base={where:'1=1',geometry:JSON.stringify({xmin:bounds[0],ymin:bounds[1],xmax:bounds[2],ymax:bounds[3],spatialReference:{wkid:4326}}),geometryType:'esriGeometryEnvelope',inSR:'4326',spatialRel:'esriSpatialRelIntersects'};
     async function read(extra){const response=await fetcher(source.url+'/query?'+new URLSearchParams({...base,...extra}),{signal:controller.signal,credentials:'omit',mode:'cors'});if(!response.ok)throw Error('Reference service HTTP '+response.status);const data=await response.json();if(data.error)throw Error('Reference service could not verify this search area');return data;}
     const count=await read({f:'json',returnCountOnly:'true',returnGeometry:'false'});
     if(!Number.isInteger(count.count)||count.count<0||count.count>280)throw Error('Reference coverage exceeds the checked layer limit or returned an invalid count; narrow the parcel search');
     const data=await read({f:'geojson',outFields:source.fields,returnGeometry:'true',outSR:'4326',resultRecordCount:'280'});
     if(!Array.isArray(data.features)||data.exceededTransferLimit||data.properties?.exceededTransferLimit||data.features.length!==count.count)throw Error('Reference response was incomplete; no parcel classification was made');
     if(kind==='ozNJ'&&new Set(data.features.map(f=>f.properties?.Geography)).size!==data.features.length)throw Error('NJ nomination tract identities were repeated');
     if(source.designation&&new Set(data.features.map(f=>f.properties?.GEOID)).size!==data.features.length)throw Error('FloridaCommerce tract identities were repeated');
     const positive=[];
     for(const f of data.features){
       if(!['Polygon','MultiPolygon'].includes(f.geometry?.type))throw Error('Reference polygon schema could not be verified');
       if(kind==='oz2'){
         const flag=String(f.properties?.OZ_2_0_Eli??'').trim().toLowerCase();
         if(/^(no|false|0|not eligible|ineligible)$/.test(flag))continue;
         if(!/^(yes|true|1|eligible)$/.test(flag))throw Error('The OZ 2 reference eligibility indicator was not recognized; no parcel status inferred');
       }
       if(kind==='oz1'&&!/^\d{11}$/.test(String(f.properties?.geoid10||f.properties?.GEOID)))throw Error('OZ 1 reference tract identity was not verified');
       if(kind==='ozNJ'&&!/^34\d{9}$/.test(String(f.properties?.Geography)))throw Error('NJ nomination tract identity was not verified');
       if(source.designation){if(!/^12\d{9}$/.test(String(f.properties?.GEOID)))throw Error('FloridaCommerce tract identity was not verified');if(String(f.properties?.designatio||'').trim()!==source.designation)throw Error('FloridaCommerce eligibility designation was not recognized; no parcel status inferred');}
       positive.push({feature:f,bbox:geo.bbox(f)});
     }
     const checkedAt=new Date().toISOString(),result=[];
     for(let i=0;i<rows.length;i++){
       if(controller.signal.aborted)throw Error('Reference check cancelled or timed out');
       const subject=features[i],box=geo.bbox(subject),hits=positive.filter(t=>!(t.bbox[0]>box[2]||t.bbox[2]<box[0]||t.bbox[1]>box[3]||t.bbox[3]<box[1])&&geo.booleanIntersects(subject,t.feature));
       const coverage=kind==='ozNJ'?parcelCoverage(subject,hits,geo):null;
       const status=kind==='ozNJ'&&hits.length&&coverage.coverageBasis==='parcel-area'?(coverage.overlapPercent<1e-8?'boundary-contact':coverage.overlapPercent<MIN_NJ_COVERAGE?'partial-overlap':'reference-intersection'):hits.length?(subject.geometry.type==='Point'?'reference-point-intersection':'reference-intersection'):'no-reference-intersection';
       result.push({...(coverage?{coverageBasis:coverage.coverageBasis,overlapPercent:coverage.overlapPercent,minimumOverlapPercent:MIN_NJ_COVERAGE}:{}),key:rows[i].key,kind,status,tractDetails:hits.map(t=>({... (coverage?{overlapPercent:coverage.tractShares.get(t)??null}:{}),geoid:String(t.feature.properties?.[source.geoidField||'GEOID']||t.feature.properties?.geoid10||''),municipality:String(t.feature.properties?.Municipality||'').slice(0,200),county:String(t.feature.properties?.County||'').slice(0,100),...(source.designation?{designation:source.designation,poverty:typeof t.feature.properties?.tract_pove==='number'&&Number.isFinite(t.feature.properties.tract_pove)?t.feature.properties.tract_pove:null,familyIncome:String(t.feature.properties?.Median_Fam||'').slice(0,20),areaIncome:String(t.feature.properties?.MetroArea_||'').slice(0,20)}:{})})),tracts:[...new Set(hits.map(t=>String(t.feature.properties?.[source.geoidField||'GEOID']||t.feature.properties?.geoid10||'GEOID unavailable')))].slice(0,kind==='ozNJ'?130:10),sourceName:source.name,sourceURL:source.url,checkedAt,caveat:'Reference intersection only. Final designation, full parcel inclusion and tax qualification are not established. A missing intersection is not an ineligibility determination.'});
       if(i%25===0)await new Promise(resolve=>setTimeout(resolve,0));
     }
     return {observations:result,sourceName:source.name,sourceURL:source.url,checkedAt};
   }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
 }
 return {sources,check,parcelCoverage,MIN_NJ_COVERAGE};
});
