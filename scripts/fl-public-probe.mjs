// Public Palm Beach County primary source smoke test; no names, sale prices or mailing addresses.
const url="https://services1.arcgis.com/ZWOoUZbtaYePLlPw/arcgis/rest/services/Parcels_and_Property_Details_WebMercator/FeatureServer/0";
const tests=[
 {name:"county-metadata",params:null},
 {name:"county-production-five-mile",params:{f:"geojson",
   where:"(PROPERTY_USE LIKE '%WAREH%' OR PROPERTY_USE LIKE '%DIST%' OR PROPERTY_USE LIKE '%MFG%' OR PROPERTY_USE LIKE '%MANUF%' OR PROPERTY_USE LIKE '%INDUSTR%' OR PROPERTY_USE LIKE '%LUMBER YARD%' OR PROPERTY_USE LIKE '%OPEN STORAGE%') AND ACRES >= 5",
   geometry:JSON.stringify({xmin:-80.141,ymin:26.642,xmax:-79.973,ymax:26.788,spatialReference:{wkid:4326}}),
   geometryType:"esriGeometryEnvelope",spatialRel:"esriSpatialRelIntersects",inSR:"4326",
   outSR:"4326",returnGeometry:"true",outFields:"PARID,SITE_ADDR_STR,MUNICIPALITY,ACRES,PROPERTY_USE,YRBLT",
   geometryPrecision:"5",maxAllowableOffset:"0.00009",resultRecordCount:"150",resultOffset:"0",orderByFields:"OBJECTID_1 ASC"}},
 {name:"county-industrial-small-bbox",params:{f:"geojson",where:"(PROPERTY_USE LIKE '%WAREH%' OR PROPERTY_USE LIKE '%MFG%') AND ACRES >= 5",
 geometry:JSON.stringify({xmin:-80.16,ymin:26.67,xmax:-80.06,ymax:26.74,spatialReference:{wkid:4326}}),
 geometryType:"esriGeometryEnvelope",spatialRel:"esriSpatialRelIntersects",inSR:"4326",
 returnGeometry:"true",outSR:"4326",outFields:"PARID,SITE_ADDR_STR,ACRES,PROPERTY_USE,YRBLT",resultRecordCount:"10"}}
];
let failed=0;
for(const t of tests){
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort("county-service-timeout"),40000);
 const start=Date.now();
 try{
  const r=await fetch(url+(t.params?"/query?"+new URLSearchParams(t.params):"?f=json"),{signal:ctrl.signal,headers:{Origin:"https://prcasley.github.io"}});
  const data=await r.json();
  console.log(JSON.stringify({test:t.name,seconds:Math.round((Date.now()-start)/1000),http:r.status,name:data.name||null,
     features:data.features?.length??null,code:data.features?.[0]?.properties?.PROPERTY_USE??null,
     fieldCount:data.fields?.length??null,geometryType:data.geometryType||null,error:data.error?.message??null,cors:r.headers.get("access-control-allow-origin")??"not sent"}));
  if(!r.ok||data.error||t.params&&!Array.isArray(data.features))failed++;
 }catch(e){failed++;console.log(JSON.stringify({test:t.name,seconds:Math.round((Date.now()-start)/1000),error:String(e)}))}
 finally{clearTimeout(timer)}
}
if(failed)process.exitCode=1;
