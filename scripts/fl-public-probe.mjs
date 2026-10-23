// A real-network smoke test of the published statewide Florida parcel service.
// No owner names, mailing addresses, private records, or sale/lease comparables are fetched.
const host="https://services9.arcgis.com/Gh9awoU677aKree0/ArcGIS/rest/services/Florida_Statewide_Parcel_Centroid_Version/FeatureServer/0";
const tests=[
 {name:"metadata",path:"",params:{f:"json"}},
 {name:"single-industrial-record",path:"/query",params:{f:"json",where:"CO_NO=60 AND DOR_UC IN ('048','0048')",outFields:"OBJECTID,PARCEL_ID,CO_NO,DOR_UC,LND_SQFOOT",returnGeometry:"true",outSR:"4326",resultRecordCount:"1"}},
 {name:"bbox-five-mile-industrial",path:"/query",params:{f:"json",where:"CO_NO=60 AND DOR_UC IN ('048','0048') AND LND_SQFOOT >= 217800",geometry:JSON.stringify({xmin:-80.2,ymin:26.64,xmax:-80.01,ymax:26.78,spatialReference:{wkid:4326}}),geometryType:"esriGeometryEnvelope",spatialRel:"esriSpatialRelIntersects",inSR:"4326",outSR:"4326",outFields:"OBJECTID,PARCEL_ID,CO_NO,DOR_UC,LND_SQFOOT",returnGeometry:"true",resultRecordCount:"10"}}
];
const out=[];
for(const t of tests){
 const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort("smoke-test-timeout"),40000);
 const url=host+t.path+"?"+new URLSearchParams(t.params);
 const start=Date.now();
 try{
   const resp=await fetch(url,{signal:ctrl.signal});
   const j=await resp.json();
   out.push({name:t.name,http:resp.status,seconds:Math.round((Date.now()-start)/1000),
     serviceName:j.name||null,sourceId:j.id??null,geometryType:j.geometryType||null,
     objectIdField:j.objectIdField||null,fieldCount:j.fields?.length??null,
     results:j.features?.length??null,code:j.features?.[0]?.attributes?.DOR_UC??null,
     count:j.count??null,exceededTransferLimit:!!j.exceededTransferLimit,
     error:j.error?.message??null,firstGeometry:j.features?.[0]?.geometry?
       Object.keys(j.features[0].geometry).slice(0,6):null});
 }catch(e){out.push({name:t.name,seconds:Math.round((Date.now()-start)/1000),error:String(e),aborted:ctrl.signal.aborted});}
 finally{clearTimeout(timer)}
}
console.log(JSON.stringify(out,null,2));
if(out.some(x=>x.error||x.http!==200))process.exitCode=1;
