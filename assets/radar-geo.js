/* Public map enhancements: source-visible opportunity zone reference maps and parcel identification.
   No confidential datasets, transaction records, contacts or owners are downloaded by this module. */
(() => {
 "use strict";
 const $=id=>document.getElementById(id);
 const OZ = {
  oz1:{label:"OZ 1 · 2018 designated tracts (reference)",
    url:"https://geo.dot.gov/server/rest/services/Hosted/OZ_Opportunity_Zones/FeatureServer/0",
    source:"https://www.irs.gov/credits-deductions/businesses/opportunity-zones",color:"#297cc7",limit:280},
  oz2:{label:"OZ 2 · third-party eligibility reference, NOT certified designation",
    url:"https://services6.arcgis.com/BAJNi3EgCdtQ1BCG/ArcGIS/rest/services/Opportunity_Zone_2_Eligible_Tracts/FeatureServer/0",
    source:"https://www.irs.gov/newsroom/treasury-irs-provide-guidance-to-states-for-nominating-census-tracts-as-qualified-opportunity-zones-under-the-one-big-beautiful-bill",
    color:"#b4752e",limit:280}
 };
 const source=()=>window.PublicRadarBridge;
 let layers={},activeIdentify=false,themeLayer=null,loading=false;
 const map=()=>source()?.getMap();
 const safe=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const note=(message,type="info")=>{
   let n=$("mapResearchNote");
   if(!n){n=document.createElement("div");n.id="mapResearchNote";n.className="map-research-note";
     $("mapPanel")?.append(n);}
   n.dataset.type=type;n.textContent=message;
 };
 function queryParams(m){
   const b=m.getBounds();
   const env={xmin:b.getWest(),ymin:b.getSouth(),xmax:b.getEast(),ymax:b.getNorth(),spatialReference:{wkid:4326}};
   return {geometry:JSON.stringify(env),geometryType:"esriGeometryEnvelope",inSR:"4326",
     spatialRel:"esriSpatialRelIntersects",where:"1=1",outSR:"4326"};
 }
 async function queryLayer(uri,params,signal){
   const url=uri+"/query?"+new URLSearchParams({...params,f:params.f||"json"}).toString();
   const response=await fetch(url,{signal,credentials:"omit",mode:"cors"});
   if(!response.ok)throw Error("The public map layer responded with HTTP "+response.status);
   const data=await response.json();
   if(data.error)throw Error(data.error.message||"Map source error");
   return data;
 }
 async function loadOpportunityZone(kind){
   const m=map(),d=OZ[kind];
   if(!m||!d)return;
   if(loading){note("A GIS layer request is already in progress.","warning");return;}
   const group=layers[kind]||window.L.layerGroup().addTo(m);layers[kind]=group;group.clearLayers();
   if(m.getZoom()<10){
      note("Zoom closer before loading tract boundaries. The current map covers too large an area for a complete layer.","warning");
      $(kind+"Toggle").checked=false;return;
   }
   const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),20000);
   loading=true;note("Loading "+d.label+" from its public reference GIS layer…");
   try {
     const base=queryParams(m);
     const c=await queryLayer(d.url,{...base,returnCountOnly:"true",returnGeometry:"false"},ctrl.signal);
     const count=Number(c.count);
     if(!Number.isInteger(count)||count<0)throw Error("The layer returned an invalid feature count");
     if(count>d.limit){
       throw Error("Layer reports "+count+" tracts in view. Zoom in to retrieve at most "+d.limit+" completely.");
     }
     // The returned count is compared with the actual feature count; truncated outputs are rejected.
     const raw=await queryLayer(d.url,{...base,f:"geojson",outFields:kind==="oz2"?"GEOID,STUSPS,OZ_2_0_Eli":"geoid10,stusps,stname",
       returnGeometry:"true",maxAllowableOffset:"0.00003",geometryPrecision:"5",resultRecordCount:String(d.limit)},ctrl.signal);
     if(!Array.isArray(raw.features)||raw.exceededTransferLimit||raw.features.length!==count)
       throw Error("The public service returned an incomplete set of tract geometries");
     const selected=kind==="oz2" ? raw.features.filter(f=>{
       const value=String(f.properties?.OZ_2_0_Eli??"").trim().toLowerCase();
       return /^(yes|true|1|eligible)$/.test(value) ||
         (/\beligible\b/.test(value) && !/not|ineligible|estimated not|unlikely/.test(value));
     }) : raw.features;
     if(kind==="oz2" && raw.features.length && selected.length===0){
       throw Error("The research layer did not return a verified positive eligibility indicator in its published schema; refusing to classify tracts.");
     }
     const polygon=selected.filter(f=>f.geometry&&/polygon/i.test(f.geometry.type));
     if(polygon.length!==selected.length)throw Error("One or more tract geometries were missing");
     for(const feat of polygon){
       const attributes=feat.properties||{},geoid=attributes.GEOID||attributes.geoid10||attributes.GEOID10||attributes.GEOID20||"GEOID unavailable";
       const info=kind==="oz1"?"2018/older-round designated reference; check official IRS lists":
           "Third-party 2027-round eligibility estimate only; validate GEOID against Treasury official eligibility files, and nominations/designations separately";
       const layer=window.L.geoJSON(feat,{style:{color:d.color,weight:1.7,opacity:.9,fillColor:d.color,fillOpacity:.13}});
       const popup=document.createElement("div");
       const label=document.createElement("strong");label.textContent=d.label;
       const detail=document.createElement("p");detail.textContent="Tract "+geoid+" · "+info;
       const anchor=document.createElement("a");anchor.href=d.source;anchor.textContent="Verify against official IRS guidance ↗";anchor.target="_blank";anchor.rel="noopener noreferrer";
       popup.append(label,detail,anchor);
       layer.bindPopup(popup);layer.addTo(group);
     }
     note(kind==="oz2"?polygon.length+" third-party eligibility-reference tracts displayed. This is NOT Treasury certification or a designated OZ 2 list.":
        polygon.length+" OZ 1 reference tracts displayed. Verify effective status using the official IRS tract list.","success");
     // No absence inference: the checked source/viewport, not a parcel-level tract membership determination.
   }catch(e){
     group.clearLayers();$(kind+"Toggle").checked=false;
     note("OZ layer could not be verified: "+String(e?.message||e)+". No tract-status conclusion was made.","warning");
   }finally{loading=false;clearTimeout(timer);}
 }
 function changeTheme(value){
   const m=map();if(!m)return;
   if(themeLayer){m.removeLayer(themeLayer);themeLayer=null;}
   if(!["dark","topo"].includes(value))return;
   m.eachLayer(layer=>{if(layer instanceof window.L.TileLayer)m.removeLayer(layer);});
   const url=value==="dark"?"https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png":
     "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png";
   const attr=value==="dark"?"© OpenStreetMap contributors · © CARTO":
     "© OpenStreetMap contributors · SRTM | © OpenTopoMap (CC-BY-SA)";
   themeLayer=window.L.tileLayer(url,{maxZoom:value==="topo"?17:19,attribution:attr}).addTo(m);
 }
 function pointInRing(ring,lon,lat){
    let inside=false;
    for(let i=0,j=ring.length-1;i<ring.length;j=i++){
      const a=ring[i],b=ring[j];if(!a||!b)continue;
      if(((a[1]>lat)!==(b[1]>lat))&&(lon<(b[0]-a[0])*(lat-a[1])/(b[1]-a[1])+a[0]))inside=!inside;
    }
    return inside;
  }
  function polygonContains(geometry,lon,lat){
    const polygons=geometry?.type==="Polygon"?[geometry.coordinates]:
      geometry?.type==="MultiPolygon"?geometry.coordinates:[];
    return polygons.some(rings=>Array.isArray(rings)&&rings.length>0&&pointInRing(rings[0],lon,lat)&&
      !rings.slice(1).some(hole=>pointInRing(hole,lon,lat)));
  }
  async function identifyAt(lat,lng){
   const b=source(),state=$("stateSelect")?.value,m=map();if(!b||!m||!state)return;
   const uri=b.getSource(state,lat,lng)?.url;if(!uri){note("No public parcel service is available for this state.");return;}
   const countyFL=state==="FL"&&uri.includes("Parcels_and_Property_Details_WebMercator");
   const field=countyFL?"PARID,SITE_ADDR_STR,MUNICIPALITY,ACRES,PROPERTY_USE,YRBLT":state==="FL"?"PARCEL_ID,CO_NO,PHY_ADDR1,PHY_CITY,LND_SQFOOT,DOR_UC,ASMNT_YR,ACT_YR_BLT,EFF_YR_BLT,TOT_LVG_AR,NO_RES_UNT":
     "PAMS_PIN,PROP_LOC,MUN_NAME,PROP_CLASS,CALC_ACRE,PCLLASTUPD,YR_CONSTR,BLDG_DESC,COUNTY,DWELL";
   const span=countyFL?.0001:state==="FL"?.0007:.00002;
   const env={xmin:lng-span,ymin:lat-span,xmax:lng+span,ymax:lat+span,spatialReference:{wkid:4326}};
   const params={where:"1=1",geometry:JSON.stringify(env),geometryType:"esriGeometryEnvelope",inSR:"4326",
     spatialRel:"esriSpatialRelIntersects",outSR:"4326",outFields:field,returnGeometry:"true",
     f:"geojson",resultRecordCount:"7"};
   const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),18000);
   note(state==="FL"?"Finding published centroids near the map tap…":"Identifying the public NJ parcel polygon at this map location…");
   try{
     const res=await queryLayer(uri,params,ctrl.signal);
     if(!Array.isArray(res.features)||res.exceededTransferLimit||!res.features.length)
       throw Error("No uniquely identifiable public parcel was returned at this location");
     const features=res.features.filter(f=>f.geometry);
     if(state==="NJ"&&(features.length!==1||!polygonContains(features[0].geometry,lng,lat)))throw Error("Multiple parcel shapes intersect the tap. Zoom further in.");
     if(countyFL){
       const matched=features.filter(f=>polygonContains(f.geometry,lng,lat));
       if(matched.length!==1)throw Error("No unique Palm Beach parcel polygon contains the map tap. Zoom closer and try again.");
     }
     const picked=countyFL?features.find(f=>polygonContains(f.geometry,lng,lat)):state==="FL"?features.map(f=>{
       const p=f.geometry?.coordinates||[];
       const d=Math.abs(Number(p[0])-lng)+Math.abs(Number(p[1])-lat);
       return {f,d};
     }).sort((a,b)=>a.d-b.d)[0]?.f:features[0];
     if(!picked)throw Error("The source did not publish a valid nearby geometry");
     const rec=b.ingestOne(picked,state,{lat,lon:lng});
     if(!rec)throw Error("The returned feature lacks a stable parcel ID or coordinates");
     note(state==="FL"?
       (countyFL?"Clicked Palm Beach parcel polygon identified by spatial hit test. Not a title survey.":"Nearest published Florida centroid displayed, not a verified clicked lot."):
       "One NJ source polygon identified. This is a planning boundary, not a title survey.","success");
   }catch(e){
     note("Parcel identification unavailable: "+String(e?.message||e)+". No parcel identity was guessed.","warning");
   }finally{clearTimeout(timer);}
 }
 function init(){
   const m=map();if(!m||!window.L)return;
   for(const kind of Object.keys(OZ)){
     $(kind+"Toggle")?.addEventListener("change",e=>{
       if(e.target.checked)loadOpportunityZone(kind);
       else{layers[kind]?.clearLayers();note(kind.toUpperCase()+" reference layer hidden.");}
     });
   }
   $("basemap")?.addEventListener("change",e=>changeTheme(e.target.value));
   $("identifyParcel")?.addEventListener("click",()=>{
     activeIdentify=!activeIdentify;
     $("identifyParcel").setAttribute("aria-pressed",String(activeIdentify));
     $("identifyParcel").textContent=activeIdentify?"Tap map to identify · ON":"Identify parcel";
     note(activeIdentify?"Tap a map point. FL finds the nearest assessment centroid, while NJ checks mapped parcel polygons.":"Parcel identification turned off.");
   });
   m.on("click",e=>{if(activeIdentify)identifyAt(e.latlng.lat,e.latlng.lng);});
   m.on("moveend",()=>{for(const k of Object.keys(OZ)){
     if($(k+"Toggle")?.checked){$(k+"Toggle").checked=false;layers[k]?.clearLayers();}
   }});
   window.PublicRadarGeo={sources:OZ,loadOpportunityZone,identifyAt};
 }
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();