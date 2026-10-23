(() => {
  "use strict";
  // Public-data-only implementation. No application-private records, keys, comps, or contact dossiers.
  const SOURCES = {
    FL: {
      name: "Florida DOR · statewide parcel centroids (2026)",
      url: "https://services9.arcgis.com/Gh9awoU677aKree0/ArcGIS/rest/services/Florida_Statewide_Parcel_Centroid_Version/FeatureServer/0",
      attribution: "Florida Geographic Information Office / Florida Department of Revenue",
      date: "Assessment year shown per record; verify current source metadata",
      geometry: "point", bounds: [-87.75, 24.35, -79.78, 31.1],
      fields: "PARCEL_ID,CO_NO,PHY_ADDR1,PHY_CITY,LND_SQFOOT,DOR_UC,ASMNT_YR,TOT_LVG_AR,ACT_YR_BLT,EFF_YR_BLT,NO_RES_UNT",
      id: "PARCEL_ID"
    },
    NJ: {
      name: "NJGIN · statewide parcels and MOD-IV (2026)",
      url: "https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/ArcGIS/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0",
      attribution: "New Jersey Office of GIS / county assessors",
      date: "2026 statewide update; parcel vintages vary",
      geometry: "polygon", bounds: [-75.6, 38.8, -73.8, 41.4],
      fields: "PAMS_PIN,PROP_LOC,MUN_NAME,PROP_CLASS,CALC_ACRE,PCLLASTUPD,YR_CONSTR,BLDG_DESC,COUNTY,DWELL",
      id: "PAMS_PIN"
    }
  };
  const AREAS = {
    njcentral: {name:"Central New Jersey",state:"NJ",lat:40.527,lon:-74.363,zoom:12},
    njnorth: {name:"North New Jersey",state:"NJ",lat:40.823,lon:-74.153,zoom:12},
    njshore: {name:"Monmouth County",state:"NJ",lat:40.302,lon:-74.035,zoom:11},
    palm: {name:"West Palm Beach",state:"FL",lat:26.715,lon:-80.057,zoom:12},
    treasure: {name:"Treasure Coast / Stuart",state:"FL",lat:27.196,lon:-80.252,zoom:12},
    stlucie: {name:"Port St. Lucie",state:"FL",lat:27.273,lon:-80.358,zoom:12},
    broward: {name:"Broward County",state:"FL",lat:26.122,lon:-80.143,zoom:12},
    miami: {name:"Miami-Dade",state:"FL",lat:25.775,lon:-80.195,zoom:12}
  };
  const MAX_FEATURES = 1100;
  let map, street, satellite, layers, circle;
  let records = [], filtered = [], sourceState = "NJ", sourceCenter = {lat:40.527,lon:-74.363};
  let countResult = null, sourceTime = null, selectedId = null, scanAbort = null, scannerBusy = false;
  let lastGeocodeCounty=null;
  const $ = id => document.getElementById(id);
  const n = v => Number.isFinite(+v) ? +v : null;
  const safe = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const fmt = v => v == null ? "Not published" : Number(v).toLocaleString("en-US",{maximumFractionDigits:2});
  const mi = (a,b,c,d) => {
    const rad = Math.PI / 180, dy=(c-a)*rad, dx=(d-b)*rad;
    const h=Math.sin(dy/2)**2+Math.cos(a*rad)*Math.cos(c*rad)*Math.sin(dx/2)**2;
    return 3958.76*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
  };
  const errText = e => String(e && e.message ? e.message : e);
  const status = (message, kind="info") => {
    const el=$("statusText"); el.textContent=message; el.dataset.kind=kind;
    $("scanStatus").className="scan-status "+kind;
  };
  const numberAcres = p => {
    if(sourceState==="FL") {
      const sf=Number(p.LND_SQFOOT);
      return sf > 0 ? sf/43560 : null;
    }
    const a=Number(p.CALC_ACRE);
    return Number.isFinite(a)&&a>0 ? a : null;
  };
  const useLabel = (p,state) => {
    if(state==="NJ") return {"1":"Vacant land","4B":"Industrial","4A":"Commercial","4C":"Apartment","2":"Residential"}[String(p.PROP_CLASS||"")]||"Other / unclassified";
    const s=String(p.DOR_UC??"").trim(), raw=parseInt(s,10);
    const code = raw>=4000 ? Math.floor(raw/100) : raw;
    if(code===3)return "Multifamily 10+ units (assessment)";if(code===8)return "Multifamily under 10 units (assessment)";if(code===10)return "Vacant commercial (assessment)";if(code===40)return "Vacant industrial (assessment)";if(code>=40&&code<=49) return code===48?"Warehousing / distribution":"Industrial assessment use code "+code;
    return s?"Florida use code "+s:"Unclassified";
  };
  const category = (p,state) => {
    if(state==="NJ") return String(p.PROP_CLASS)==="4B"?"Industrial":String(p.PROP_CLASS)==="4C"?"Multifamily":String(p.PROP_CLASS)==="1"?"Vacant":"Other";
    const code=parseInt(String(p.DOR_UC??""),10);
    const c=code>=4000?Math.floor(code/100):code;
    return c===3||c===8?"Multifamily":c===10||c===40?"Vacant":c>=40&&c<=49?"Industrial":"Other";
  };
  const normalize = (feature, state, center) => {
    const a=feature.properties || {}, type=feature.geometry&&feature.geometry.type;
    let lat=null, lon=null;
    if(type==="Point"&&feature.geometry.coordinates){
      [lon,lat]=feature.geometry.coordinates;
    } else if(type==="Polygon"||type==="MultiPolygon") {
      // The observed point is deliberately derived from the geometry bounds, not a surveyed centroid.
      const g=L.geoJSON(feature), b=g.getBounds(); if(b.isValid()){lat=b.getCenter().lat;lon=b.getCenter().lng;}
    }
    if(!Number.isFinite(lat)||!Number.isFinite(lon)) return null;
    const rawId=String(a[SOURCES[state].id] || (state==="FL"?a.PARCEL_ID:a.PAMS_PIN)||"").trim();
    if(!rawId) return null;
    const address=state==="FL"?[a.PHY_ADDR1,a.PHY_CITY,"FL"].filter(Boolean).join(", "):
       [a.PROP_LOC,a.MUN_NAME,"NJ"].filter(Boolean).join(", ");
    const owner=null;
    const acres=numberAcres(a), cls=category(a,state);
    const officialYear=v=>{const y=Number(v);return Number.isInteger(y)&&y>=1800&&y<=2035?y:null;};
    const yearBuilt=officialYear(state==="FL"?a.ACT_YR_BLT:a.YR_CONSTR);
    const effectiveYear=state==="FL"?officialYear(a.EFF_YR_BLT):null;
    const buildingArea=state==="FL"&&Number(a.TOT_LVG_AR)>0?Number(a.TOT_LVG_AR):null;
    const residentialUnits=state==="FL"&&Number(a.NO_RES_UNT)>0?Number(a.NO_RES_UNT):(state==="NJ"&&Number(a.DWELL)>0?Number(a.DWELL):null);
    return {key:state+":"+rawId, id:rawId, state, address, owner, acres, type:cls,
      use:useLabel(a,state), lat, lon, distance:mi(center.lat,center.lon,lat,lon),
      geometry:feature, assessment:state==="FL"?a.ASMNT_YR:null, yearBuilt,effectiveYear,buildingArea,residentialUnits,remodelYear:null,leaseTerm:null, source:SOURCES[state],
      locationPrecision:type==="Point"?"Published parcel centroid":"Polygon bounds midpoint (map display)",
      original:a};
  };
  function stateInBounds(lat,lon,state) {
    const b=SOURCES[state].bounds;
    return lat>=b[1]&&lat<=b[3]&&lon>=b[0]&&lon<=b[2];
  }
  function scanEnvelope(center,radius) {
    const dy=radius/69.0, dx=radius/(69.172*Math.max(.2,Math.cos(center.lat*Math.PI/180)));
    return {xmin:center.lon-dx,ymin:center.lat-dy,xmax:center.lon+dx,ymax:center.lat+dy,spatialReference:{wkid:4326}};
  }
  function serverWhere(state,mode,min) {
    const terms=[];
    const activeCounty=window.PublicRadarCounty||"";
    const op=window.PublicRadarStrictMin?">":">=";
    if(state==="FL"){const allowed={PalmBeach:60,Martin:53,StLucie:66};if(allowed[activeCounty])terms.push("CO_NO = "+allowed[activeCounty]);else terms.push("CO_NO IN (60,53,66)");}
    if(state==="NJ"&&/^[A-Za-z ]{3,12}$/.test(activeCounty))terms.push("UPPER(COUNTY) = '"+activeCounty.toUpperCase()+"'");
    if(state==="NJ") {
      if(mode==="industrial") terms.push("PROP_CLASS = '4B'");
      if(mode==="vacant") terms.push("PROP_CLASS = '1'");if(mode==="multifamily")terms.push("PROP_CLASS = '4C'");
      if(min>0) terms.push("CALC_ACRE "+op+" "+Number(min));
    } else {
      if(mode==="industrial") terms.push("DOR_UC IN ('040','0040','041','0041','042','0042','043','0043','044','0044','045','0045','046','0046','047','0047','048','0048','049','0049')");
      if(mode==="vacant") terms.push("DOR_UC IN ('010','0010','040','0040')");if(mode==="multifamily")terms.push("DOR_UC IN ('003','0003','008','0008')");
      if(min>0) terms.push("LND_SQFOOT "+op+" "+Number((min*43560).toFixed(2)));
    }
    return terms.join(" AND ")||"1=1";
  }
  async function arcgisQuery(src,base,extra,signal) {
    const params = new URLSearchParams(Object.assign({f:"json"},base,extra));
    const uri=src.url+"/query?"+params.toString();
    const timer=new AbortController();
    if(signal) signal.addEventListener("abort",()=>timer.abort(),{once:true});
    const timeout=setTimeout(()=>timer.abort(),20000);
    try {
      const response=await fetch(uri,{signal:timer.signal,credentials:"omit",mode:"cors"});
      if(!response.ok) throw Error("Public GIS service returned HTTP "+response.status);
      const data=await response.json();
      if(data.error) throw Error("Public GIS: "+(data.error.message||"service error"));
      return data;
    } finally {clearTimeout(timeout);}
  }
  async function scan() {
    if(scannerBusy) { if(scanAbort) scanAbort.abort(); return; }
    const state=$("stateSelect").value;
    const center={lat:map.getCenter().lat,lon:map.getCenter().lng};
    const radius=Number($("radiusSelect").value), min=Number($("minAcres").value)||0;
    const mode=$("typeSelect").value;
    
    if(!stateInBounds(center.lat,center.lon,state)){
      status("Selected center is outside "+state+" coverage. Choose a matching market or click the map inside the selected state.","warning");return;
    }
    scannerBusy=true; scanAbort=new AbortController(); $("scanButton").disabled=true;
    $("scanButton").textContent="Scanning…";
    const source=SOURCES[state], env=scanEnvelope(center,radius);
    const base={geometry:JSON.stringify(env),geometryType:"esriGeometryEnvelope",
      spatialRel:"esriSpatialRelIntersects",inSR:"4326",where:serverWhere(state,mode,min)};
    status("Querying the public "+state+" parcel service. No saved internal database is being read.","info");
    try {
      const count=await arcgisQuery(source,base,{returnCountOnly:"true",returnGeometry:"false"},scanAbort.signal);
      const total=Number(count.count);
      if(!Number.isFinite(total)) throw Error("The public source did not return a reliable record count. Search was not accepted as complete.");
      countResult=total;
      if(total>MAX_FEATURES){
        status("The source reports "+fmt(total)+" parcels intersecting this search. That exceeds the "+fmt(MAX_FEATURES)+"-record safety cap. Narrow the radius or increase minimum acreage. This is NOT zero properties.","warning");
        $("resultInfo").textContent=fmt(total)+" matching public-source parcels · refine search";
        return;
      }
      const data=await arcgisQuery(source,base,{f:"geojson",outFields:source.fields,
        returnGeometry:"true",outSR:"4326",geometryPrecision:"5",
        maxAllowableOffset:state==="NJ"?"0.00002":"0",
        resultRecordCount:String(MAX_FEATURES)},scanAbort.signal);
      if(!Array.isArray(data.features)) throw Error("Unexpected GIS response. No results will be claimed.");
      if(data.exceededTransferLimit||data.features.length<total){
        status("The public service returned fewer features than its count. Results are incomplete; narrow this search. This is NOT a report of zero properties.","warning");
        return;
      }
      sourceState=state;sourceCenter=center;sourceTime=new Date();
      records=data.features.map(f=>normalize(f,state,center)).filter(Boolean)
        .filter(p=>p.distance<=radius+.025).sort((a,b)=>a.distance-b.distance);
      selectedId=null; renderResults();renderMap();renderOwners();renderSource();
      const missing=total-data.features.length;
      const msg=records.length ? (fmt(records.length)+" parcels within "+radius+" miles with source-backed geometry/attributes. "+(missing?"Some intersecting parcels lie outside the circle.":"")) :
        "The source responded successfully but no eligible parcel centroids are inside the selected radius.";
      status(msg,"success");$("lastUpdated").textContent=sourceTime.toLocaleString();document.dispatchEvent(new CustomEvent("radar:scan-complete",{detail:{count:records.length,state:sourceState,source:source.name}}));
    } catch(e) {
      if(scanAbort.signal.aborted) status("Search cancelled.","warning");
      else status("Public GIS lookup failed: "+errText(e)+". This is NOT a report of zero properties.","danger");
    } finally {scannerBusy=false;$("scanButton").disabled=false;$("scanButton").textContent="Scan public parcels";scanAbort=null;}
  }
  function currentFilters(){
    const q=$("textFilter").value.trim().toLowerCase();
    return records.filter(p=> !q || [p.id,p.address,p.owner||"",p.use].join(" ").toLowerCase().includes(q));
  }
  function renderResults(){
    filtered=currentFilters();$("resultInfo").textContent=records.length?
      fmt(filtered.length)+" of "+fmt(records.length)+" scanned records · "+SOURCES[sourceState].name:
      "No completed parcel results loaded";
    const node=$("results");
    if(!filtered.length) {node.innerHTML='<div class="empty">No records to show. Choose a market and run a public parcel scan.</div>';return;}
    node.innerHTML=filtered.slice(0,300).map(p=>'<button type="button" class="parcel '+(selectedId===p.key?"chosen":"")+
       '" data-pid="'+safe(p.key)+'"><span class="parcel-top"><strong>'+safe(p.address||"Parcel "+p.id)+
       '</strong><span class="pill">'+safe(p.type)+'</span></span><span class="parcel-meta">Parcel '+safe(p.id)+' · '+(p.acres==null?"Acreage not reported":fmt(p.acres)+" ac")+
       ' · '+p.distance.toFixed(2)+' mi</span><span class="parcel-owner">'+safe(p.owner||"Owner not published / redacted")+'</span></button>').join("");
    if(filtered.length>300) node.innerHTML+='<div class="empty">Showing the nearest 300 records in this list. Narrow the text filter to find others.</div>';
    node.querySelectorAll("[data-pid]").forEach(btn=>btn.addEventListener("click",()=>choose(btn.dataset.pid)));
  }
  function renderMap(){
    if(!map||!layers)return;
    layers.clearLayers();
    for(const p of filtered) {
      const feature=p.geometry;
      let l;
      if(feature.geometry.type==="Point"){
        l=L.circleMarker([p.lat,p.lon],{radius:6,color:"#065d60",weight:2,fillColor:"#32baa9",fillOpacity:.8});
      } else {
        l=L.geoJSON(feature,{style:{weight:1,color:"#147c91",fillColor:p.type==="Industrial"?"#00aa93":"#54a9c3",fillOpacity:.16}});
      }
      l.addTo(layers);l.on("click",()=>choose(p.key));
    }
    if(circle) map.removeLayer(circle);
    circle=L.circle([sourceCenter.lat,sourceCenter.lon],{radius:Number($("radiusSelect").value)*1609.344,color:"#058b87",fillOpacity:.035,weight:1,dashArray:"6 5"}).addTo(map);
  }
  function renderOwners(){
    const ownerGroups=new Map();
    records.forEach(p=>{
      if(!p.owner) return;
      const k=p.owner.toUpperCase().replace(/\s+/g," ").trim();
      const group=ownerGroups.get(k)||{owner:p.owner,count:0,acres:0,acresCount:0};
      group.count++;if(p.acres!=null){group.acres+=p.acres;group.acresCount++;}
      ownerGroups.set(k,group);
    });
    const groups=Array.from(ownerGroups.values()).sort((a,b)=>b.count-a.count).slice(0,25);
    const node=$("owners");
    node.innerHTML=groups.length?groups.map(g=>'<div class="owner"><strong>'+safe(g.owner)+'</strong><span>'+g.count+
      ' matching parcel'+(g.count===1?"":"s")+' in current scan'+(g.acresCount?' · '+fmt(g.acres)+' reported ac':'')+
      '</span></div>').join(""):'<div class="empty">'+(sourceState==="NJ"?
      "NJGIN redacts owner names under Daniel’s Law. No county owner-name harvesting is performed.":"Run a Florida search to inspect published assessment owner names.")+'</div>';
    $("ownerInfo").textContent="Current scan only · assessment roll names, not verified LLC beneficiaries or deed/title findings.";
  }
  function formatAsOf(raw){
    if(raw==null||raw==="")return "Not provided";
    if(typeof raw==="number" && raw>1000000000) return new Date(raw).toLocaleDateString();
    return String(raw);
  }
  function choose(id){
    const p=records.find(x=>x.key===id);if(!p)return;
    selectedId=id;renderResults();$("details").hidden=false;
    const owner="Not displayed in the public research app";
    $("details").innerHTML='<div class="detail-heading"><span class="eyebrow">SOURCE-OBSERVED PARCEL</span><button type="button" id="closeDetail" class="round" aria-label="Close">×</button></div>'+
      '<h2>'+safe(p.address||"Parcel "+p.id)+'</h2><p class="soft">Parcel ID '+safe(p.id)+'</p>'+
      '<div class="detail-grid"><div><span>Reported site acreage</span><strong>'+(p.acres!=null?fmt(p.acres)+" ac":"Not published")+'</strong></div>'+
      '<div><span>Assessment use</span><strong>'+safe(p.use)+'</strong></div></div>'+
      '<div class="detail-label">Assessment owner name</div><div class="detail-value">'+safe(owner)+'</div>'+
      '<p class="muted">Public assessment observation; a matching owner name does not prove legal title, LLC control, or a development affiliation.</p>'+
      '<div class="detail-label">Year built</div><div class="detail-value">'+(p.yearBuilt??"Not published")+'</div>'+
      '<div class="detail-label">Effective year built (not a confirmed renovation date)</div><div class="detail-value">'+(p.effectiveYear??"Not published")+'</div>'+
      '<div class="detail-label">Year remodeled</div><div class="detail-value">Not published by connected parcel source</div>'+
      '<div class="detail-label">Lease expiration / term</div><div class="detail-value">Not published by connected parcel source</div>'+
      '<div class="detail-label">Reported improvement area</div><div class="detail-value">'+(p.buildingArea!=null?fmt(p.buildingArea)+" SF (assessment field)":"Not published")+'</div>'+
      '<div class="detail-label">Residential units</div><div class="detail-value">'+(p.residentialUnits??"Not published")+'</div>'+
      '<div class="detail-label">Map location</div><div class="detail-value">'+safe(p.locationPrecision)+'</div>'+
      '<div class="detail-label">Assessment vintage</div><div class="detail-value">'+safe(formatAsOf(p.assessment||p.original.PCLLASTUPD||p.source.date))+'</div>'+
      '<div class="detail-label">Source</div><div class="detail-value">'+safe(p.source.name)+'</div>'+
      '<div class="detail-actions"><a target="_blank" rel="noopener" href="'+safe(p.source.url)+'">Official source ↗</a>'+
      '<a target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(p.lat+","+p.lon)+'">Open location in Maps ↗</a></div>'+
      '<p class="footnote">Parcel geometries are planning approximations, not boundary surveys. No comps or sale-price records are loaded.</p>';
    $("closeDetail").addEventListener("click",()=>{$("details").hidden=true; selectedId=null;renderResults();});
    map.panTo([p.lat,p.lon],{animate:true});
    document.dispatchEvent(new CustomEvent("radar:parcel-selected",{detail:{id:p.id,key:p.key}}));if(window.innerWidth<800)$("details").scrollIntoView({behavior:"smooth",block:"start"});
  }
  function renderSource(){
    const s=SOURCES[sourceState];
    $("sourceName").textContent=s.name;$("sourceDate").textContent=s.date;
    $("sourceLink").href=s.url;$("sourceAttribution").textContent=s.attribution;
    $("sourceCount").textContent=fmt(records.length);
  }
  function setMarket(key){
    const v=AREAS[key];if(!v||!map)return;
    $("stateSelect").value=v.state;
    map.setView([v.lat,v.lon],v.zoom,{animate:false});
    $("placeInput").value=v.name+", "+v.state;
    sourceCenter={lat:v.lat,lon:v.lon};
    status("Centered on "+v.name+". Set a radius and press Scan public parcels.","info");
  }
  async function findPlace(){
    lastGeocodeCounty=null;
    const q=$("placeInput").value.trim();if(q.length<3){status("Enter a US city or street address.","warning");return false;}
    status("Locating "+q+" with the public geocoding service…","info");
    try{
      const u="https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?"+
        new URLSearchParams({f:"json",SingleLine:q,countryCode:"USA",sourceCountry:"USA",outSR:"4326",
         maxLocations:"3",outFields:"RegionAbbr,City,Match_addr,Subregion",forStorage:"false"}).toString();
      const r=await fetch(u,{credentials:"omit"});if(!r.ok)throw Error("Geocoder HTTP "+r.status);
      const data=await r.json();if(data.error)throw Error(data.error.message||"Geocoder error");
      const cand=(data.candidates||[]).find(c=>c.location&&Number(c.score)>=75);
      if(!cand)throw Error("No confident US location returned. Click directly on the map instead.");
      const state=String(cand.attributes?.RegionAbbr||"").toUpperCase();
      if(!["FL","NJ"].includes(state))throw Error("Address located in "+(state||"an unsupported state")+". Current supported public sources: FL and NJ.");
      const {x,y}=cand.location;
      if(!stateInBounds(y,x,state))throw Error("Address located outside verified layer extent.");
      $("stateSelect").value=state; map.setView([y,x],13);
      lastGeocodeCounty=String(cand.attributes?.Subregion||"").replace(/\s+County$/i,"").trim()||null;
      status("Located "+cand.address+" in "+state+". Scan when ready; an address match is NOT a parcel verification.","success");
      return true;
    }catch(e){status("Location lookup unavailable: "+errText(e),"warning");return false;}
  }
  function useGPS(){
    if(!navigator.geolocation){status("This browser does not support GPS.","warning");return;}
    status("Requesting device location. It stays on your phone until a public parcel scan is requested.","info");
    navigator.geolocation.getCurrentPosition(pos=>{
      const lat=pos.coords.latitude,lon=pos.coords.longitude;
      const s=Object.keys(SOURCES).find(k=>stateInBounds(lat,lon,k));
      if(!s){status("Your location is outside currently connected FL/NJ parcel services. No nationwide scan was performed.","warning");return;}
      $("stateSelect").value=s;map.setView([lat,lon],14);
      L.circleMarker([lat,lon],{radius:8,color:"#fff",weight:3,fillColor:"#1479f5",fillOpacity:1}).addTo(map);
      status("Device position located in "+s+". Choose radius and run a public scan.","success");
    },e=>status("GPS unavailable: "+e.message,"warning"),{timeout:10000,enableHighAccuracy:true});
  }
  function askQuestion(question){
    if(!records.length)return "I don't have loaded parcel records yet. Choose NJ or FL, set a search center and tap Scan public parcels.";
    const txt=question.toLowerCase();
    const acresMatch=txt.match(/(?:over|above|at least|more than)\s*(\d+(?:\.\d+)?)\s*acr/);
    const min=acresMatch?Number(acresMatch[1]):null;
    const type=/industrial|warehouse|manufactur/.test(txt)?"Industrial":/vacant|land/.test(txt)?"Vacant":null;
    const rr=records.filter(p=>(min==null||p.acres!=null&&p.acres>=min)&&(!type||p.type===type));
    if(/all|anywhere|nationwide|every parcel/.test(txt))return "This app only queries selected public GIS areas in Florida and New Jersey. Its current scan contains "+records.length+" returned parcels. It cannot claim nationwide coverage.";
    if(/who owns|owner/.test(txt)){
      const withOwner=rr.filter(p=>p.owner);
      return withOwner.length ? withOwner.slice(0,5).map(p=>p.id+": "+p.owner+" (assessment name, not verified title)").join("\n")+
        "\nShowing up to five results from your last public scan only.":
        "No owner names are available in the current filtered scan. NJ publishes its statewide layer with names redacted.";
    }
    if(/how many|count|number/.test(txt))return rr.length+" matching parcels in the last COMPLETED public scan (not the whole state).";
    if(/source|verified|accuracy/.test(txt))return "Data source: "+SOURCES[sourceState].name+". "+SOURCES[sourceState].date+
      ". These are public assessor/GIS records, not deeds or surveys. The app refuses truncated searches.";
    return rr.length+" parcels match the filters within the last completed "+$("radiusSelect").value+"-mile public scan."+
      (rr.length?" First five: "+rr.slice(0,5).map(p=>p.id+" ("+(p.acres==null?"acres unknown":fmt(p.acres)+" ac")+")").join(", ")+".":"")+
      " This is a local rule-based summary, not a cloud AI answer.";
  }
  function clearResults(){
    if(scanAbort)scanAbort.abort();
    records=[];filtered=[];sourceTime=null;countResult=null;selectedId=null;
    $("details").hidden=true;
    if(layers)layers.clearLayers();
    $("resultInfo").textContent="No completed parcel results loaded for this selection";
    $("lastUpdated").textContent="No live scan yet";
    $("sourceCount").textContent="0";
    renderResults();
  }
  function ingestOne(feature,state,center){
    const item=normalize(feature,state,center);if(!item)return null;
    records=[item];filtered=[item];sourceState=state;sourceCenter=center;sourceTime=new Date();countResult=1;
    selectedId=item.key;renderResults();renderMap();renderSource();choose(item.key);
    $("lastUpdated").textContent=sourceTime.toLocaleString();
    return item;
  }
  window.PublicRadarBridge={scan,findPlace,setMarket,choose,clearResults,ingestOne,getResults:()=>records.slice(),getVisible:()=>filtered.slice(),
    getMeta:()=>({state:sourceState,time:sourceTime?.toISOString()||null,source:SOURCES[sourceState]?.name||null,count:countResult,ready:!!sourceTime}),
    getCenter:()=>map?{lat:map.getCenter().lat,lon:map.getCenter().lng}:null,
    setCenter:(lat,lon,zoom=13)=>{if(map)map.setView([lat,lon],zoom);},getMap:()=>map,getLayers:()=>layers,
    setStatus:status,getLastGeocodeCounty:()=>lastGeocodeCounty,getSources:()=>({FL:SOURCES.FL.url,NJ:SOURCES.NJ.url})};
  function initMap(){
    if(!window.L){status("Map library unavailable on this network. Browser cannot run parcel scans without it.","danger");return;}
    map=L.map("map",{zoomControl:true,preferCanvas:true}).setView([40.527,-74.363],12);
    street=L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:18,attribution:"© OpenStreetMap contributors"});
    satellite=L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",{maxZoom:18,attribution:"Esri imagery; source providers"});
    street.addTo(map);layers=L.layerGroup().addTo(map);
    map.on("click",e=>{map.panTo(e.latlng);status("Center selected by map tap: "+e.latlng.lat.toFixed(5)+", "+e.latlng.lng.toFixed(5)+". Click Scan public parcels.","info");});
    $("basemap").addEventListener("change",()=>{if($("basemap").value==="satellite"){map.removeLayer(street);satellite.addTo(map);}else{map.removeLayer(satellite);street.addTo(map);}});
    $("fitResults").addEventListener("click",()=>{
      if(!records.length)return;
      const bb=L.latLngBounds(records.map(p=>[p.lat,p.lon]));if(bb.isValid())map.fitBounds(bb.pad(.12),{maxZoom:15});
    });
    setMarket("njcentral");
  }
  function init(){
    initMap();$("market").addEventListener("change",e=>setMarket(e.target.value));
    $("stateSelect").addEventListener("change",e=>{status("Source changed to "+e.target.value+". Move to that state before scanning.","info");});
    $("placeForm").addEventListener("submit",e=>{e.preventDefault();findPlace();});
    $("scanButton").addEventListener("click",scan);
    $("textFilter").addEventListener("input",()=>{renderResults();renderMap();});
    $("gps").addEventListener("click",useGPS);
    $("mobileShowMap").addEventListener("click",()=>{$("mapPanel").scrollIntoView({behavior:"smooth"});setTimeout(()=>map.invalidateSize(),150);});
    $("askForm").addEventListener("submit",e=>{
      e.preventDefault();const input=$("askInput"),q=input.value.trim();if(!q)return;
      const view=$("answers");const answer=askQuestion(q);
      const el=document.createElement("article");el.className="answer";
      const label=document.createElement("strong");label.textContent="You: "+q;const p=document.createElement("p");p.textContent=answer;
      el.append(label,p);view.prepend(el);input.value="";
    });
    $("sourceName").textContent="Choose a market and scan";
    $("lastUpdated").textContent="No live scan yet";
    $("resultInfo").textContent="No live parcel records loaded";
    $("details").hidden=true;renderSource();
    status("Ready. Choose a market, then scan public Florida or New Jersey parcel records.","info");
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();