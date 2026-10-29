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
      id: "PARCEL_ID",orderField:"OBJECTID"
    },
    PBC: {
      name: "Palm Beach County · public parcel and property details",
      url: "https://services1.arcgis.com/ZWOoUZbtaYePLlPw/arcgis/rest/services/Parcels_and_Property_Details_WebMercator/FeatureServer/0",
      attribution: "Palm Beach County public GIS / property appraiser",
      date: "Live county property layer; property attributes have individual update vintages",
      geometry: "polygon", bounds: [-80.95,26.30,-79.95,27.10],
      fields: "PARID,SITE_ADDR_STR,MUNICIPALITY,ACRES,PROPERTY_USE,YRBLT,LAND_MARKET,IMPRV_MRKT,PRICE,SALE_DATE,TOTAL_MARKET",
      id: "PARID",orderField:"OBJECTID_1"
    },
    BRO: {
      name:"Broward County public taxroll",url:"https://services.arcgis.com/JMAJrTsHNLrSsWf5/ArcGIS/rest/services/PARCEL_POLY_BCPA_TAXROLL/FeatureServer/0",
      attribution:"Broward County Property Appraiser",date:"Live county source; verify per record",geometry:"polygon",bounds:[-80.92,25.94,-79.98,26.35],
      fields:"FOLIO_NUMBER,USE_CODE,SITUS_STREET_NUMBER,SITUS_STREET_NAME,SITUS_STREET_TYPE",id:"FOLIO_NUMBER",orderField:"OBJECTID",ownerField:"NAME_LINE_1"
    },
    MDC: {
      name:"Miami-Dade public parcel GIS",url:"https://services.arcgis.com/8Pc9XBTAsYuxx9Ny/arcgis/rest/services/PaParcelView_gdb/FeatureServer/0",
      attribution:"Miami-Dade County",date:"Live county source; verify per record",geometry:"polygon",bounds:[-80.88,25.13,-80.11,25.98],
      fields:"FOLIO,TRUE_SITE_ADDR,LOT_SIZE,DOR_CODE_CUR",id:"FOLIO",orderField:"OBJECTID",ownerField:"TRUE_OWNER1"
    },
    PA:{name:"Pennsylvania · selected county sources",bounds:[-80.53,39.71,-74.68,42.28],date:"County metadata checked on request",attribution:"County GIS",geometry:"polygon"},
    NJ: {
      name: "NJGIN · statewide parcels and MOD-IV (2026)",
      url: "https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/ArcGIS/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0",
      attribution: "New Jersey Office of GIS / county assessors",
      date: "2026 statewide update; parcel vintages vary",
      geometry: "polygon", bounds: [-75.6, 38.8, -73.8, 41.4],
      fields: "PAMS_PIN,PROP_LOC,MUN_NAME,PROP_CLASS,CALC_ACRE,PCLLASTUPD,YR_CONSTR,BLDG_DESC,COUNTY,DWELL,LAND_VAL,IMPRVT_VAL,DEED_BOOK,DEED_PAGE,SALE_PRICE,DEED_DATE,NET_VALUE",
      id: "PAMS_PIN",orderField:"OBJECTID"
    }
  };
  const domain=window.RadarDomain;
  const AREAS = {
    njcentral: {name:"Central New Jersey",state:"NJ",lat:40.527,lon:-74.363,zoom:12},
    njnorth: {name:"North New Jersey",state:"NJ",lat:40.823,lon:-74.153,zoom:12},
    njshore: {name:"Monmouth County",state:"NJ",lat:40.302,lon:-74.035,zoom:11},
    palm: {name:"West Palm Beach",state:"FL",lat:26.715,lon:-80.057,zoom:12},
    treasure: {name:"Treasure Coast / Stuart",state:"FL",lat:27.196,lon:-80.252,zoom:12},
    lehigh: {name:"Lehigh County / Allentown",state:"PA",lat:40.602,lon:-75.49,zoom:12},
    northampton: {name:"Northampton County / Easton",state:"PA",lat:40.69,lon:-75.22,zoom:12},
    stlucie: {name:"Port St. Lucie",state:"FL",lat:27.273,lon:-80.358,zoom:12},
    broward: {name:"Broward County",state:"FL",lat:26.122,lon:-80.143,zoom:12},
    miami: {name:"Miami-Dade",state:"FL",lat:25.775,lon:-80.195,zoom:12}
  };
  const MAX_FEATURES = 1100;
  let map, street, satellite, layers, circle;
  let records = [], filtered = [], sourceState = "NJ", sourceCenter = {lat:40.527,lon:-74.363};
  let yearUnknown=new Map(),yearFilter=null;
  let quarantined=new Map(),inspected=null,searchAnchor={lat:40.527,lon:-74.363},centerMode=false,clickTimer=null;
  let countResult = null, sourceTime = null, selectedId = null, scanAbort = null, scannerBusy = false;
  let scanComplete=false, scanState="idle", scanId=0, activeSource=null, searchSnapshot=null;
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
    if(p.ACRES!=null&&Number(p.ACRES)>0)return Number(p.ACRES);
    if(p.LOT_SIZE!=null&&Number(p.LOT_SIZE)>0)return Number(p.LOT_SIZE)/43560;
    if(p.LND_SQFOOT!=null&&Number(p.LND_SQFOOT)>0)return Number(p.LND_SQFOOT)/43560;
    const a=Number(p.CALC_ACRE);
    return Number.isFinite(a)&&a>0 ? a : null;
  };
  const useLabel = (p,state) => {
    if(state==="NJ") return {"1":"Vacant land","4B":"Industrial","4A":"Commercial","4C":"Apartment","2":"Residential"}[String(p.PROP_CLASS||"")]||"Other / unclassified";
    if(p.PROPERTY_USE!=null)return String(p.PROPERTY_USE).trim()||"Use class unavailable";
    const s=String(p.DOR_UC??p.DOR_CODE_CUR??p.USE_CODE??"").trim(), raw=parseInt(s,10);
    const code = raw>=4000 ? Math.floor(raw/100) : raw;
    if(code===3)return "Multifamily 10+ units (assessment)";if(code===8)return "Multifamily under 10 units (assessment)";if(code===10)return "Vacant commercial (assessment)";if(code===40)return "Vacant industrial (assessment)";if(code>=40&&code<=49) return code===48?"Warehousing / distribution":"Industrial assessment use code "+code;
    return s?"Florida use code "+s:"Unclassified";
  };
  const category = (p,state) => {
    if(state==="NJ") return String(p.PROP_CLASS)==="4B"?"Industrial":String(p.PROP_CLASS)==="4C"?"Multifamily":String(p.PROP_CLASS)==="1"?"Vacant":"Other";
    if(p.PROPERTY_USE!=null){
      return domain.pbcCategory(p.PROPERTY_USE);
    }
    const code=parseInt(String(p.DOR_UC??p.DOR_CODE_CUR??p.USE_CODE??""),10);
    const c=code>=4000?Math.floor(code/100):code;
    return c===3||c===8?"Multifamily":c===10||c===40?"Vacant":c>=40&&c<=49?"Industrial":"Other";
  };
  const normalize = (feature, state, center, publishedSource=SOURCES[state]) => {
    const a=feature.properties || {}, type=feature.geometry&&feature.geometry.type;
    let lat=null, lon=null;
    if(type==="Point"&&feature.geometry.coordinates){
      [lon,lat]=feature.geometry.coordinates;
    } else if(type==="Polygon"||type==="MultiPolygon") {
      // The observed point is deliberately derived from the geometry bounds, not a surveyed centroid.
      const point=window.turf.pointOnFeature(feature).geometry.coordinates;[lon,lat]=point;
    }
    if(!Number.isFinite(lat)||!Number.isFinite(lon)) return null;
    const rawId=String(a[publishedSource.id] || (state==="FL"?a.PARCEL_ID:a.PAMS_PIN)||"").trim();
    if(!rawId) return null;
    let address=state==="FL"?[a.SITE_ADDR_STR||a.TRUE_SITE_ADDR||[a.SITUS_STREET_NUMBER,a.SITUS_STREET_NAME,a.SITUS_STREET_TYPE].filter(Boolean).join(" ")||a.PHY_ADDR1,a.MUNICIPALITY||a.PHY_CITY,"FL"].filter(Boolean).join(", "):
       [a.PROP_LOC,a.MUN_NAME,"NJ"].filter(Boolean).join(", ");
    const owner=null;
    let acres=numberAcres(a), cls=category(a,state);
    const officialYear=v=>{const y=Number(v);return Number.isInteger(y)&&y>=1800&&y<=2035?y:null;};
    let yearBuilt=officialYear(state==="FL"?(a.YRBLT||a.ACT_YR_BLT):a.YR_CONSTR);
    const effectiveYear=state==="FL"?officialYear(a.EFF_YR_BLT):null;
    const buildingArea=state==="FL"&&Number(a.TOT_LVG_AR)>0?Number(a.TOT_LVG_AR):null;
    const residentialUnits=state==="FL"&&Number(a.NO_RES_UNT)>0?Number(a.NO_RES_UNT):(state==="NJ"&&Number(a.DWELL)>0?Number(a.DWELL):null);
    let use=useLabel(a,state);
    if(state==="PA"){const pa=window.RadarPA.attributes(a,publishedSource);address=pa.address;acres=pa.acres;cls=pa.type;yearBuilt=pa.yearBuilt;use=pa.use;}
    const acreage=domain.acreageObservation(acres,feature.geometry);acres=acreage.acres;
    const countyProvider=state==="PA"?{code:publishedSource.jurisdiction,id:publishedSource.provider}:publishedSource===SOURCES.PBC?{code:"12099",id:"pbc"}:publishedSource===SOURCES.BRO?{code:"12011",id:"broward"}:publishedSource===SOURCES.MDC?{code:"12086",id:"miamidade"}:null;
    const jurisdiction=countyProvider?.code||(state==="FL"?String(a.CO_NO||""):String(a.COUNTY||"NJGIN"));
    if(!jurisdiction)return null;
    const provider=countyProvider?.id||(state==="FL"?"fdor":"njgin");
    return {key:domain.parcelKey(provider,state,jurisdiction,rawId), id:rawId, jurisdiction, provider, state, address, owner, ...acreage, acres, type:cls,
      landValue:Number.isFinite(Number(state==='NJ'?a.LAND_VAL:a.LAND_MARKET))&&Number(state==='NJ'?a.LAND_VAL:a.LAND_MARKET)>0?Number(state==='NJ'?a.LAND_VAL:a.LAND_MARKET):null,improvementValue:(state==='NJ'?a.IMPRVT_VAL:a.IMPRV_MRKT)!=null&&Number.isFinite(Number(state==='NJ'?a.IMPRVT_VAL:a.IMPRV_MRKT))&&Number(state==='NJ'?a.IMPRVT_VAL:a.IMPRV_MRKT)>=0?Number(state==='NJ'?a.IMPRVT_VAL:a.IMPRV_MRKT):null,recordedSalePrice:Number(state==='NJ'?a.SALE_PRICE:a.PRICE)>0?Number(state==='NJ'?a.SALE_PRICE:a.PRICE):null,recordedSaleDate:(state==='NJ'?a.DEED_DATE:a.SALE_DATE)||null,assessedValue:Number(state==='NJ'?a.NET_VALUE:a.TOTAL_MARKET)>0?Number(state==='NJ'?a.NET_VALUE:a.TOTAL_MARKET):null,
      ...(state==='PA'?window.RadarPA.financial(a,publishedSource):{}),
      deedBook:state==='NJ'?String(a.DEED_BOOK||''):null,deedPage:state==='NJ'?String(a.DEED_PAGE||''):null,
      use, lat, lon, distance:mi(center.lat,center.lon,lat,lon),
      geometry:feature, assessment:state==="FL"?a.ASMNT_YR:null, yearBuilt,effectiveYear,buildingArea,residentialUnits,remodelYear:null,leaseTerm:null, source:publishedSource,
      locationPrecision:type==="Point"?"Published parcel centroid":"Point on published parcel geometry (map reference)",
      original:a};
  };
  function stateInBounds(lat,lon,state) {
    const b=SOURCES[state].bounds;
    return lat>=b[1]&&lat<=b[3]&&lon>=b[0]&&lon<=b[2];
  }
  function accept(item,matchesMode,acreFilter,center,radius){
    if(!matchesMode(item)||!domain.intersectsRadius(item.geometry.geometry,center,radius))return false;
    if(item.acreageQuality==='suspect'){quarantined.set(item.key,item);return false;}
    if(!domain.matchesAcres(item.acres,acreFilter))return false;
    if(yearFilter){if(item.yearBuilt==null){yearUnknown.set(item.key,item);return false;}return yearFilter.op==='<'?item.yearBuilt<yearFilter.value:item.yearBuilt>yearFilter.value;}
    return true;
  }
  function renderQuality(){
    const host=$('dataQualityNotice');if(!host)return;host.textContent='';host.hidden=!quarantined.size;
    if(!quarantined.size)return;
    const heading=document.createElement('strong');heading.textContent=quarantined.size+' records excluded from size matching and ranking because reported acreage conflicts with geometry.';host.append(heading);
    for(const row of [...quarantined.values()].slice(0,10)){const p=document.createElement('p');p.textContent=(row.address||row.id)+' · source reports '+fmt(row.reportedAcres)+' ac; mapped polygon ≈ '+fmt(row.geometryAcres)+' ac. Neither is a surveyed verification. ';
      const inspect=document.createElement('button');inspect.type='button';inspect.className='secondary';inspect.textContent='Inspect flagged source record';inspect.addEventListener('click',()=>{inspected=row;choose(row.key,{inspection:true});});p.append(inspect);host.append(p);}
  }
  function scanEnvelope(center,radius) {
    const dy=radius/69.0, dx=radius/(69.172*Math.max(.2,Math.cos(center.lat*Math.PI/180)));
    return {xmin:center.lon-dx,ymin:center.lat-dy,xmax:center.lon+dx,ymax:center.lat+dy,spatialReference:{wkid:4326}};
  }
  function readAcreageFilter(){return domain.acreageFilter($("minAcres").value,$("acreageComparison").value,$("maxAcres").value);}
  function providerFor(state,lat,lon){
    if(state==="PA")return window.RadarPA.sources[window.PublicRadarCounty]||SOURCES.PA;
    const countySource={PalmBeach:"PBC",Broward:"BRO",MiamiDade:"MDC"}[window.PublicRadarCounty];
    return state==="FL"&&countySource&&stateInBounds(lat,lon,countySource)?SOURCES[countySource]:SOURCES[state];
  }
  function serverWhere(state,mode,min,provider=SOURCES[state]) {
    const terms=[],county=window.PublicRadarCounty||"";
    const op=readAcreageFilter().op;
    if(state==="PA")return "1=1";
    if(provider===SOURCES.BRO||provider===SOURCES.MDC){
      // County schemas differ. Apply exact assessment/acreage filters after normalization.
    } else if(provider===SOURCES.PBC) {
      // The county assessor class is descriptive text (not Florida DOR's numbered codes).
      if(mode==="industrial")terms.push("(PROPERTY_USE LIKE '%WAREH%' OR PROPERTY_USE LIKE '%DISTRIBUTION%' OR PROPERTY_USE LIKE '%MFG%' OR PROPERTY_USE LIKE '%MANUF%' OR PROPERTY_USE LIKE '%INDUSTR%' OR PROPERTY_USE LIKE '%LUMBER YARD%' OR PROPERTY_USE LIKE '%OPEN STORAGE%') AND PROPERTY_USE NOT LIKE '%MANUFACTURED HOME%' AND PROPERTY_USE NOT LIKE '%MOBILE HOME%'");
      if(mode==="multifamily")terms.push("(PROPERTY_USE LIKE '%APART%' OR PROPERTY_USE LIKE '%MULTI%FAM%')");
      if(mode==="vacant")terms.push("(PROPERTY_USE LIKE '%VACANT%' OR PROPERTY_USE LIKE '%UNDEVELOPED%')");
      if(min>0||op!==">=")terms.push(domain.acreageSQL("ACRES",readAcreageFilter()));
    } else if(state==="NJ") {
      if(/^[A-Za-z ]{3,12}$/.test(county))terms.push("UPPER(COUNTY) = '"+county.toUpperCase()+"'");
      if(mode==="industrial")terms.push("PROP_CLASS = '4B'");
      if(mode==="multifamily")terms.push("PROP_CLASS = '4C'");
      if(mode==="vacant")terms.push("PROP_CLASS = '1'");
      if(min>0||op!==">=")terms.push(domain.acreageSQL("CALC_ACRE",readAcreageFilter()));
    } else {
      const codes={PalmBeach:60,Martin:53,StLucie:66,Broward:6,MiamiDade:13};
      terms.push(codes[county]?"CO_NO = "+codes[county]:"CO_NO IN (60,53,66)");
      if(mode==="industrial")terms.push("DOR_UC IN ('040','0040','041','0041','042','0042','043','0043','044','0044','045','0045','046','0046','047','0047','048','0048','049','0049')");
      if(mode==="multifamily")terms.push("DOR_UC IN ('003','0003','008','0008')");
      if(mode==="vacant")terms.push("DOR_UC IN ('010','0010','040','0040')");
      if(min>0||op!==">=")terms.push(domain.acreageSQL("LND_SQFOOT",readAcreageFilter(),43560));
    }
    return terms.join(" AND ")||"1=1";
  }
  async function arcgisQuery(src,base,extra,signal) {
    // Every request owns its own timeout. Aborts from another scan do not masquerade as zero parcels.
    const params=new URLSearchParams(Object.assign({f:"json"},base,extra));
    const uri=src.url+"/query?"+params.toString();
    const timer=new AbortController();
    const onAbort=()=>timer.abort();
    if(signal?.aborted)timer.abort();
    else signal?.addEventListener("abort",onAbort,{once:true});
    const timeout=setTimeout(()=>timer.abort(new Error("GIS request exceeded 40 seconds; try a smaller scan area or county source")),40000);
    try {
      const response=await fetch(uri,{signal:timer.signal,credentials:"omit",mode:"cors"});
      if(!response.ok) throw Error("Public GIS service returned HTTP "+response.status);
      const data=await response.json();
      if(data.error)throw Error("GIS service: "+(data.error.message||"unspecified server error"));
      return data;
    } finally {clearTimeout(timeout);signal?.removeEventListener("abort",onAbort);}
  }
  async function scan(request={}) {
    if(scannerBusy) { clearResults();scanState="cancelled";status("Search cancelled.","warning");return; }
    if(!map||!domain||!window.turf){status("Map or spatial library unavailable. Reload after dependencies are available.","danger");return;}
    const state=$("stateSelect").value;
    const center={...searchAnchor};
    const radius=Number($("radiusSelect").value);
    let acreFilter;try{acreFilter=readAcreageFilter();}catch(e){status(e.message,"warning");return;}
    const min=acreFilter.value;
    const matchesMode=item=>mode==="all"||({industrial:"Industrial",multifamily:"Multifamily",vacant:"Vacant"}[mode]===item.type);
    const mode=$("typeSelect").value;
    
    if(!stateInBounds(center.lat,center.lon,state)){
      status("Selected center is outside "+state+" coverage. Choose a matching market or click the map inside the selected state.","warning");return;
    }
    if(providerFor(state,center.lat,center.lon)===SOURCES.BRO&&(min!==0||acreFilter.op!==">=")){
      status("This county source does not publish acreage. Choose At least 0 acres to inspect records with unknown acreage, or use another source.","warning");return;
    }
    clearResults();
    const currentScan=scanId, controller=new AbortController();
    const checkCurrent=()=>{if(currentScan!==scanId||controller.signal.aborted)throw new DOMException("Cancelled","AbortError");};
    scannerBusy=true;scanState="loading"; scanAbort=controller;
    $("scanButton").disabled=false;
    $("scanButton").textContent="Cancel scan";
    let source=providerFor(state,center.lat,center.lon);const env=scanEnvelope(center,radius);
    activeSource=source;sourceState=state;sourceCenter=center;
    yearFilter=request.year?{...request.year}:null;
    searchSnapshot={year:yearFilter,state,county:window.PublicRadarCounty||"",center,radius,type:mode,acreage:acreFilter,unverified:Array.isArray(request.unverified)?request.unverified.slice(0,20):[]};
    const base={geometry:JSON.stringify(env),geometryType:"esriGeometryEnvelope",
      spatialRel:"esriSpatialRelIntersects",inSR:"4326",where:serverWhere(state,mode,min,source)};
    status("Querying the public "+state+" parcel service. No saved internal database is being read.","info");
    try {
      if(state==="PA"){
        if(!source.url)throw Error("Pennsylvania searches require Lehigh or Northampton County; other PA counties are not connected");
        source=await window.RadarPA.prepare(source,{signal:controller.signal});checkCurrent();activeSource=source;
        base.where=window.RadarPA.where(source,mode,acreFilter);
        if(!source.mappings.acres.length&&(min!==0||acreFilter.op!==">="))throw Error(source.name+" does not publish a recognized acreage field. Choose At least 0 acres to inspect records, or verify the county schema");
        if(mode!=="all"&&!source.supportsUse)throw Error(source.name+" does not publish a verified descriptive assessment classification. Choose All assessment types; industrial zoning cannot be inferred");
      }
      if([SOURCES.PBC,SOURCES.BRO,SOURCES.MDC].includes(source)){
        // County layer is demonstrably fast. Page directly instead of asking FDOR for an
        // expensive 10.8-million-parcel statewide count before drawing any result.
        const batchSize=150,pages=6,seen=new Set();let finished=false;
        for(let page=0;page<pages;page++){
          status(source.name+": requesting page "+(page+1)+" · "+seen.size+" source features received…","info");
          const response=await arcgisQuery(source,base,{f:"geojson",outFields:source.fields,
             returnGeometry:"true",outSR:"4326",geometryPrecision:"5",
             maxAllowableOffset:"0.00009",resultOffset:String(page*batchSize),
             resultRecordCount:String(batchSize),orderByFields:source.orderField+" ASC"},controller.signal);
          checkCurrent();
          if(!Array.isArray(response.features))throw Error("County GIS did not return parcel geometries");
          for(const feature of response.features){
            const item=normalize(feature,state,center,source);
            if(!item)throw Error("Source returned a parcel without stable identity or geometry");
            if(accept(item,matchesMode,acreFilter,center,radius)&&!seen.has(item.key)){
              seen.add(item.key);records.push(item);
            }
          }
          scanState="partial";sourceState=state;sourceCenter=center;sourceTime=new Date();
          records.sort((a,b)=>a.distance-b.distance);
          selectedId=null;renderResults();renderMap();renderOwners();renderSource();
          $("lastUpdated").textContent=sourceTime.toLocaleString();
          if(response.features.length<batchSize&&!response.exceededTransferLimit){finished=true;break;}
          if(response.features.length===0&&response.exceededTransferLimit)throw Error("Source reported truncation with no features");
        }
        countResult=finished?records.length:null;scanComplete=finished;scanState=finished?"complete":"partial";
        status(finished?
          source.name+" scan completed: "+records.length+" mapped parcels touching the "+radius+"-mile search area. Distances use a map reference point and may exceed the radius for edge parcels. Assessor use is not zoning.":
          "Showing "+records.length+" real county parcels, but the "+(batchSize*pages)+
          "-feature cap was reached. Results are PARTIAL; narrow radius or minimum acres.",
          finished?"success":"warning");
        document.dispatchEvent(new CustomEvent("radar:scan-complete",{
          detail:{count:records.length,state,source:source.name,complete:finished}}));
        return finished;
      }
      const count=await arcgisQuery(source,base,{returnCountOnly:"true",returnGeometry:"false"},controller.signal);
      checkCurrent();
      const total=count.count;
      if(!Number.isInteger(total)||total<0) throw Error("The public source did not return a reliable record count. Search was not accepted as complete.");
      countResult=total;
      // Verify each ordered page against the source count. Never treat a short or
      // repeated page as proof that a capped service exhausted its results.
      const batchSize=150,objectIds=new Set();let received=0,finished=total===0;
      // MapServer GeoJSON paging can repeat rows despite orderByFields. Freeze IDs,
      // sort numerically, then fetch explicit batches; never advance by a guessed offset.
      let snapshotIds=null;
      if(state==='PA'){
        const ids=await arcgisQuery(source,base,{returnIdsOnly:'true',returnGeometry:'false'},controller.signal);checkCurrent();
        if(!Array.isArray(ids.objectIds)||ids.objectIds.length!==total||new Set(ids.objectIds).size!==total||ids.objectIds.some(x=>!Number.isSafeInteger(x)))throw Error('County parcel ID snapshot did not reconcile with the source count');
        snapshotIds=ids.objectIds.sort((a,b)=>a-b);
      }
      while(received<MAX_FEATURES&&received<total){
        status(source.name+": received "+received+" of "+total+" source features…","info");
        const data=await arcgisQuery(source,base,{f:"geojson",outFields:source.fields+","+source.orderField,
          returnGeometry:"true",outSR:"4326",geometryPrecision:"5",
          maxAllowableOffset:state==="NJ"?"0.00002":"0",
          resultOffset:String(received),resultRecordCount:String(Math.min(batchSize,MAX_FEATURES-received)),
          orderByFields:source.orderField+" ASC",...(snapshotIds?{objectIds:snapshotIds.slice(received,received+Math.min(batchSize,MAX_FEATURES-received)).join(","),resultOffset:"0"}:{})},controller.signal);
        checkCurrent();
        if(!Array.isArray(data.features))throw Error("Unexpected GIS response. No results will be claimed.");
        if(!data.features.length){finished=received===total&&!data.exceededTransferLimit;break;}
        for(const feature of data.features){
          const objectId=feature.properties?.[source.orderField]??feature.id;
          if(objectId==null||objectIds.has(String(objectId)))throw Error("Source paging repeated or omitted record identities; results remain incomplete");
          if(snapshotIds&&!snapshotIds.slice(received,received+batchSize).includes(Number(objectId)))throw Error("County returned an identity outside the requested ID batch");
          objectIds.add(String(objectId));
          const item=normalize(feature,state,center,source);
          if(!item)throw Error("Source returned parcels without stable identity or geometry");
          if(accept(item,matchesMode,acreFilter,center,radius))records.push(item);
        }
        received+=data.features.length;
        scanState="partial";sourceTime=new Date();records.sort((a,b)=>a.distance-b.distance);
        renderResults();renderMap();renderOwners();renderSource();
        if(received>total)break;
        if(received===total&&!data.exceededTransferLimit){finished=true;break;}
      }
      if(!finished){
        scanState="partial";
        status(total>MAX_FEATURES?"Retrieved "+received+" of "+total+" source features before the "+MAX_FEATURES+"-record safety cap. These are PARTIAL candidates, sorted within the retrieved subset; narrow the radius to retrieve more completely.":"Source paging did not reconcile with its count ("+received+" received; "+total+" expected). Results are PARTIAL; more parcels may exist. Narrow or retry the search.","warning");
        return;
      }
      sourceState=state;sourceCenter=center;sourceTime=new Date();
      scanComplete=true;scanState="complete";
      selectedId=null; renderResults();renderMap();renderOwners();renderSource();
      const msg=records.length ? (fmt(records.length)+" parcel geometries intersect the "+radius+"-mile search. Distances use a map reference point and may exceed the radius for edge parcels.") :
        "The source responded successfully but no accepted parcel geometries intersect the selected radius.";
      status(msg,"success");$("lastUpdated").textContent=sourceTime.toLocaleString();document.dispatchEvent(new CustomEvent("radar:scan-complete",{detail:{count:records.length,state:sourceState,source:source.name}}));
    } catch(e) {
      if(currentScan!==scanId)return;
      scanComplete=false;scanState=controller.signal.aborted?"cancelled":records.length?"partial":"failed";
      if(controller.signal.aborted) status("Search cancelled.","warning");
      else status("Public GIS lookup failed: "+errText(e)+". This is NOT a report of zero properties.","danger");
    } finally {if(currentScan===scanId){scannerBusy=false;if(records.length)renderResults();$("scanButton").disabled=false;$("scanButton").textContent="Scan public parcels";scanAbort=null;document.dispatchEvent(new CustomEvent("radar:scan-state",{detail:{state:scanState,scanId}}));}}
  }
  function currentFilters(){
    const q=$("textFilter").value.trim().toLowerCase();
    return records.filter(p=> !q || [p.id,p.address,p.owner||"",p.use].join(" ").toLowerCase().includes(q));
  }
  let listLimit=300;
  function renderResults(){
    renderQuality();
    filtered=currentFilters();$("resultInfo").textContent=records.length?
      fmt(filtered.length)+" of "+fmt(records.length)+" scanned records · "+(activeSource||SOURCES[sourceState]).name+" · "+scanState+(searchSnapshot?.unverified?.length?" · Candidates only: "+searchSnapshot.unverified.join(", ")+" unverified":""):
      "No completed parcel results loaded";
    const node=$("results");
    if(!filtered.length) {node.innerHTML='<div class="empty">No records to show. Choose a market and run a public parcel scan.</div>';return;}
    node.innerHTML=filtered.slice(0,listLimit).map(p=>'<button type="button" class="parcel '+(selectedId===p.key?"chosen":"")+
       '" data-pid="'+safe(p.key)+'"><span class="parcel-top"><strong>'+safe(p.address||"Parcel "+p.id)+
       '</strong><span class="pill">'+safe(p.type)+'</span></span><span class="parcel-meta">Parcel '+safe(p.id)+' · '+(p.acres==null?"Acreage not reported":fmt(p.acres)+" ac")+
       ' · '+p.distance.toFixed(2)+' mi to map point</span><span class="parcel-owner">'+safe(p.owner||(p.state==="FL"?"Open parcel details for official owner lookup":p.state==="NJ"?"NJ statewide owner name redacted":"PA owner enrichment not connected"))+'</span></button>').join("");
    if(filtered.length>listLimit){
      const more=document.createElement('button');more.type='button';more.className='secondary';
      more.textContent='Show more parcels ('+listLimit+' of '+filtered.length+' displayed)';
      more.addEventListener('click',()=>{listLimit+=300;renderResults();});node.append(more);
    }
    node.querySelectorAll("[data-pid]").forEach(btn=>btn.addEventListener("click",()=>choose(btn.dataset.pid)));
  }
  function renderMap(){
    if(!map||!layers)return;
    layers.clearLayers();
    for(const p of [...filtered.map(p=>inspected?.key===p.key?inspected:p),...(inspected&&!filtered.some(r=>r.key===inspected.key)?[inspected]:[])]) {
      const feature=p.geometry;
      let l;
      if(feature.geometry.type==="Point"){
        l=L.circleMarker([p.lat,p.lon],{radius:6,color:"#065d60",weight:2,fillColor:"#32baa9",fillOpacity:.8});
      } else {
        l=L.geoJSON(feature,{style:{weight:selectedId===p.key?3:1,color:selectedId===p.key?"#ffd334":"#147c91",fillColor:p.type==="Industrial"?"#00aa93":"#54a9c3",fillOpacity:.16}});
      }
      l.addTo(layers);l.on("click",e=>{if(centerMode||$("identifyParcel")?.getAttribute("aria-pressed")==="true")return;clearTimeout(clickTimer);if(e.originalEvent?.detail>1)return;clickTimer=setTimeout(()=>choose(p.key),450);});
    }
    if(circle) map.removeLayer(circle);
    circle=L.circle([sourceCenter.lat,sourceCenter.lon],{radius:(searchSnapshot?.radius||Number($("radiusSelect").value))*1609.344,color:"#058b87",fillOpacity:.035,weight:1,dashArray:"6 5"}).addTo(map);
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
      "NJGIN redacts owner names under Daniel’s Law. No county owner-name harvesting is performed.":sourceState==="PA"?"Bulk PA ownership enrichment is not connected. In Deal Nav, Northampton parcels support an on-demand published owner and mailing-address lookup.":"Florida assessment names are available on each parcel detail card using the official one-record lookup.")+'</div>';
    $("ownerInfo").textContent="Organization-name research loads only on request from official sources. Individual lookups and the company research workspace retain source dates; NJ names remain redacted in this layer.";
  }
  function formatAsOf(raw){
    if(raw==null||raw==="")return "Not provided";
    if(typeof raw==="number" && raw>1000000000) return new Date(raw).toLocaleDateString();
    return String(raw);
  }
  function choose(id,{inspection=false}={}){
    const p=inspection&&inspected?.key===id?inspected:records.find(x=>x.key===id)||yearUnknown.get(id)||(inspected?.key===id?inspected:null);if(!p)return;
    if(!inspection&&records.includes(p))inspected=null;
    selectedId=id;renderResults();renderMap();$("details").hidden=false;$("details").dataset.parcelKey=id;
    const owner=p.owner||"Use the public-source lookup below";
    $("details").innerHTML='<div class="detail-heading"><span class="eyebrow">SOURCE-OBSERVED PARCEL</span><button type="button" id="closeDetail" class="round" aria-label="Close">×</button></div>'+
      (p.acreageWarning?'<p class="acreage-warning">'+safe(p.acreageWarning)+' Source reports '+safe(fmt(p.reportedAcres))+' ac; mapped polygon approximately '+safe(fmt(p.geometryAcres))+' ac.</p>':'')+
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
    if(p.geometry.geometry.type==='Polygon'||p.geometry.geometry.type==='MultiPolygon')map.fitBounds(L.geoJSON(p.geometry).getBounds(),{padding:[35,35],maxZoom:19});
    else map.setView([p.lat,p.lon],17);
    setTimeout(()=>map.invalidateSize(),0);
    document.dispatchEvent(new CustomEvent("radar:parcel-selected",{detail:{id:p.id,key:p.key}}));if(window.innerWidth<800)$("details").scrollIntoView({behavior:"smooth",block:"start"});
  }
  function renderSource(){
    const s=activeSource||(records[0]?.source)||SOURCES[sourceState];
    $("sourceName").textContent=s.name;$("sourceDate").textContent=s.date;
    $("sourceLink").href=s.url;$("sourceAttribution").textContent=s.attribution;
    $("sourceCount").textContent=fmt(records.length);
  }
  function setMarket(key){
    clearResults();
    const v=AREAS[key];if(!v||!map)return;
    $("market").value=key;$("stateSelect").value=v.state;
    map.setView([v.lat,v.lon],v.zoom,{animate:false});
    $("placeInput").value=v.name+", "+v.state;
    searchAnchor={lat:v.lat,lon:v.lon};sourceCenter={...searchAnchor};
    status("Centered on "+v.name+". Set a radius and press Scan public parcels.","info");
  }
  async function findPlace(){
    clearResults();lastGeocodeCounty=null;
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
      if(!["FL","NJ","PA"].includes(state))throw Error("Address located in "+(state||"an unsupported state")+". Connected sources: FL, NJ and selected PA counties (Lehigh/Northampton).");
      const {x,y}=cand.location;
      if(!stateInBounds(y,x,state))throw Error("Address located outside verified layer extent.");
      clearResults();$("stateSelect").value=state; searchAnchor={lat:y,lon:x};map.setView([y,x],13);
      lastGeocodeCounty=String(cand.attributes?.Subregion||"").replace(/\s+County$/i,"").trim()||null;
      document.dispatchEvent(new CustomEvent("radar:location",{detail:{state,county:lastGeocodeCounty}}));
      status("Located "+cand.address+" in "+state+". Scan when ready; an address match is NOT a parcel verification.","success");
      return true;
    }catch(e){status("Location lookup unavailable: "+errText(e),"warning");return false;}
  }
  function locateGPS(){
    return new Promise(resolve=>{
      if(!navigator.geolocation){status("This browser does not support GPS.","warning");resolve(null);return;}
      status("Requesting device location. Location is used for public-source geographic screening only.","info");
      navigator.geolocation.getCurrentPosition(pos=>{
        const lat=pos.coords.latitude,lon=pos.coords.longitude;
        const state=["FL","NJ"].find(k=>stateInBounds(lat,lon,k));
        if(!state){status("Your location is outside the FL/NJ GPS coverage. For Pennsylvania, select Lehigh or Northampton or type a city/address. No location was guessed.","warning");resolve(null);return;}
        clearResults();$("stateSelect").value=state;searchAnchor={lat,lon};map.setView([lat,lon],14);
        document.dispatchEvent(new CustomEvent("radar:location",{detail:{state,county:null}}));
        L.circleMarker([lat,lon],{radius:8,color:"#fff",weight:3,fillColor:"#1479f5",fillOpacity:1}).addTo(map);
        status("Device located in "+state+". County identity is not verified from GPS alone; countywide source filtering is disabled until selected.","warning");
        resolve({lat,lon,state});
      },e=>{status("GPS unavailable: "+e.message,"warning");resolve(null);},{timeout:10000,enableHighAccuracy:true});
    });
  }
  function useGPS(){void locateGPS();}
  function askQuestion(question){
    const intent=window.PublicRadarAgent.parseIntent(question);
    if(intent.forSale||intent.pricePsf||intent.comps)return "Active sale listings, asking prices and comparable sales are not connected. A public parcel scan cannot confirm those conditions. Asking price per building square foot is different from a closed-sale comp.";
    if(intent.questionLease)return "Lease renewal and expiration dates require a lease schedule or other dated evidence. They are not connected to this public parcel scan.";
    if(!scanComplete)return "The latest scan is "+scanState+". Complete a public-source scan before requesting a result summary.";
    if(!records.length)return "I don't have loaded parcel records yet. Choose NJ or FL, set a search center and tap Scan public parcels.";
    const txt=question.toLowerCase();
    const type={industrial:"Industrial",vacant:"Vacant",multifamily:"Multifamily"}[intent.type]||null;
    const rr=records.filter(p=>(intent.acres==null||domain.matchesAcres(p.acres,{value:intent.acres,op:intent.comparison==="under"?"<":intent.comparison||">=",max:intent.maxAcres}))&&(!type||p.type===type));
    if(/all|anywhere|nationwide|every parcel/.test(txt))return "This app only queries selected public GIS areas in Florida and New Jersey. Its current scan contains "+records.length+" returned parcels. It cannot claim nationwide coverage.";
    if(/who owns|owner/.test(txt)){
      const withOwner=rr.filter(p=>p.owner);
      return withOwner.length ? withOwner.slice(0,5).map(p=>p.id+": "+p.owner+" (assessment name, not verified title)").join("\n")+
        "\nShowing up to five results from your last public scan only.":
        "No owner names are available in the current filtered scan. NJ publishes its statewide layer with names redacted.";
    }
    if(/how many|count|number/.test(txt))return rr.length+" matching parcels in the last COMPLETED public scan (not the whole state).";
    if(/source|verified|accuracy/.test(txt))return "Data source: "+activeSource.name+". "+activeSource.date+
      ". These are public assessor/GIS records, not deeds or surveys. The app refuses truncated searches.";
    return rr.length+" parcels match the filters within the last completed "+searchSnapshot.radius+"-mile public scan."+
      (rr.length?" First five: "+rr.slice(0,5).map(p=>p.id+" ("+(p.acres==null?"acres unknown":fmt(p.acres)+" ac")+")").join(", ")+".":"")+
      " This is a local rule-based summary, not a cloud AI answer.";
  }
  function clearResults(){
    scanId++;if(scanAbort)scanAbort.abort();
    scanAbort=null;scannerBusy=false;scanComplete=false;scanState="idle";activeSource=null;searchSnapshot=null;
    $("scanButton").disabled=!map;$("scanButton").textContent="Scan public parcels";
    quarantined.clear();yearUnknown.clear();yearFilter=null;inspected=null;clearTimeout(clickTimer);listLimit=300;records=[];filtered=[];sourceTime=null;countResult=null;selectedId=null;
    $("details").hidden=true;
    if(layers)layers.clearLayers();
    if(circle&&map){map.removeLayer(circle);circle=null;}
    $("owners").textContent="";$("answers").textContent="";
    document.dispatchEvent(new CustomEvent("radar:scan-state",{detail:{state:"idle",scanId}}));
    $("resultInfo").textContent="No completed parcel results loaded for this selection";
    $("lastUpdated").textContent="No live scan yet";
    $("sourceCount").textContent="0";
    $("sourceName").textContent="No active scan";$("sourceDate").textContent="No active scan";$("sourceLink").removeAttribute("href");
    renderResults();
  }
  function ingestOne(feature,state,center,explicitSource){
    const props=feature?.properties||{};
    const provider=explicitSource||(state==="PA"?activeSource:state==="FL"?(props.PARID?SOURCES.PBC:props.FOLIO_NUMBER?SOURCES.BRO:props.FOLIO?SOURCES.MDC:SOURCES.FL):SOURCES[state]);
    const item=normalize(feature,state,center,provider);if(!item)return null;
    item.retrievedAt=new Date().toISOString();item.scanStatus='identified';
    inspected=item;choose(item.key,{inspection:true});
    return item;
  }
  window.PublicRadarBridge={scan,
    mergeNearby:(rows,reports,primary)=>{records=[...new Map(rows.map(r=>[r.key,r])).values()].sort((a,b)=>a.distance-b.distance);sourceState=primary.state;sourceCenter=primary.center;searchSnapshot=primary;sourceTime=new Date();countResult=records.length;scanComplete=reports.every(r=>r.complete);scanState=scanComplete?'complete':'partial';activeSource={name:reports.map(r=>r.name).join(' + '),url:reports[0]?.url||SOURCES[primary.state].url,date:'Combined live retrieval; see each parcel for source vintage',attribution:'Public county GIS / NJ Office of GIS; source provenance retained on every parcel'};selectedId=null;renderResults();renderMap();renderOwners();renderSource();status(reports.map(r=>r.name+': '+(r.complete?'complete':'PARTIAL / unavailable')+' ('+r.count+' accepted)'+(r.complete?'':': '+r.message)).join(' · '),scanComplete?'success':'warning');document.dispatchEvent(new CustomEvent('radar:scan-complete',{detail:{count:records.length,state:sourceState,complete:scanComplete}}));},normalizeRecord:(feature,state,center,provider)=>normalize(feature,state,center,provider),
    restoreOwnerObservations:observations=>{for(const r of records){const o=observations[r.key];if(r.state==='FL'&&o&&o.property.provider===r.provider&&window.RadarPublicData.entity(o.entityName)){r.owner=o.entityName;r.ownership={...o,classification:'organization-style'};}}renderResults();renderOwners();},
    setOwnerObservation:(key,observation)=>{const record=(inspected?.key===key?inspected:null)||records.find(r=>r.key===key);if(record){record.owner=observation.entityName||null;record.ownership=observation.entityName?observation:null;renderResults();renderOwners();}},
    getStatus:()=>({message:$("statusText").textContent,kind:$("statusText").dataset.kind}),
    focusParcel:(key,{satellite=false}={})=>{$("textFilter").value="";choose(key);if(satellite){$("basemap").value="satellite";$("basemap").dispatchEvent(new Event("change"));}},findPlace,setMarket,choose,clearResults,ingestOne,locateGPS,getYearUnknown:()=>[...yearUnknown.values()],getRecord:key=>(inspected?.key===key?inspected:null)||records.find(r=>r.key===key)||yearUnknown.get(key),getResults:()=>records.slice(),getVisible:()=>filtered.slice(),
    getMeta:()=>({state:sourceState,time:sourceTime?.toISOString()||null,source:(activeSource||SOURCES[sourceState]).name,sourceURL:(activeSource||SOURCES[sourceState]).url,count:countResult,complete:scanComplete,status:scanState,scanId,ready:!!sourceTime&&scanComplete,yearUnknownCount:yearUnknown.size,quarantinedCount:quarantined.size,unverified:searchSnapshot?.unverified||[]}),
    setRadius:value=>{
      const radius=Number(value);if(!Number.isFinite(radius)||radius<.5||radius>100)throw Error("Radius must be between 0.5 and 100 miles");
      const select=$("radiusSelect");if(![...select.options].some(o=>Number(o.value)===radius))select.add(new Option(radius+" miles",String(radius)));
      select.value=String(radius);
    },
    getSearch:()=>searchSnapshot?JSON.parse(JSON.stringify(searchSnapshot)):null,
    setAcreageFilter:(value,op,upper)=>{const f=domain.acreageFilter(value,op,upper);$("minAcres").value=f.value;$("acreageComparison").value=f.op;$("maxAcres").value=f.max??"";$("maxAcresField").hidden=f.op!=="between";},
    sortResults:sort=>{records.sort(sort==="largest"?(a,b)=>(b.acres??-1)-(a.acres??-1):(a,b)=>a.distance-b.distance);renderResults();},
    getSource:(state,lat,lon)=>state==="PA"&&activeSource?.mappings?activeSource:providerFor(state,lat,lon),
    getCenter:()=>map?{lat:map.getCenter().lat,lon:map.getCenter().lng}:null,
    getSearchCenter:()=>({...searchAnchor}),cancelCenterSelection:()=>{centerMode=false;$("setSearchCenter").setAttribute("aria-pressed","false");$("setSearchCenter").textContent="Set search center";},setCenter:(lat,lon,zoom=13)=>{searchAnchor={lat,lon};if(map)map.setView([lat,lon],zoom);},getMap:()=>map,getLayers:()=>layers,
    setStatus:status,getLastGeocodeCounty:()=>lastGeocodeCounty,getSources:()=>({FL:providerFor("FL",map?.getCenter().lat,map?.getCenter().lng).url,NJ:SOURCES.NJ.url,PA:providerFor("PA")?.url})};
  function initMap(){
    if(!window.L||!window.turf||!domain){
      for(const id of ["scanButton","gps","mobileShowMap","fitResults","placeInput"])$(id).disabled=true;
      status("Map library unavailable. Run the build or reload after dependencies are available. Parcel scans are disabled.","danger");return;
    }
    map=L.map("map",{zoomControl:true,preferCanvas:true}).setView([40.527,-74.363],12);
    street=L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:18,attribution:"© OpenStreetMap contributors"});
    satellite=L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",{maxZoom:18,attribution:"Esri imagery; source providers"});
    // Keep exactly one basemap. Dark uses styled public street tiles, without an account/key.
    const basemaps={street,satellite,
      dark:L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:18,className:"radar-dark-tiles",attribution:"© OpenStreetMap contributors · dark styling"}),
      topo:L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",{maxZoom:17,attribution:"© OpenStreetMap contributors · SRTM | © OpenTopoMap (CC-BY-SA)"})};
    function setBasemap(){
      Object.values(basemaps).forEach(layer=>{if(map.hasLayer(layer))map.removeLayer(layer);});
      (basemaps[$("basemap").value]||satellite).addTo(map);
    }
    setBasemap();layers=L.layerGroup().addTo(map);
    map.on("dblclick",()=>clearTimeout(clickTimer));
    map.on("click",e=>{if(!centerMode||e.originalEvent?.detail>1)return;clearTimeout(clickTimer);clickTimer=setTimeout(()=>{if(!centerMode)return;searchAnchor={lat:e.latlng.lat,lon:e.latlng.lng};map.panTo(e.latlng);window.PublicRadarBridge.cancelCenterSelection();document.dispatchEvent(new CustomEvent("radar:center-selected"));status("Search center set explicitly. Existing results retain their original search area until you scan again.","info");},450);});
    $("setSearchCenter").addEventListener('click',()=>{centerMode=!centerMode;if(centerMode&&$("identifyParcel").getAttribute('aria-pressed')==='true')$("identifyParcel").click();$("setSearchCenter").setAttribute('aria-pressed',String(centerMode));$("setSearchCenter").textContent=centerMode?'Tap map to set center · ON':'Set search center';});
    $("basemap").addEventListener("change",setBasemap);
    $("fitResults").addEventListener("click",()=>{
      if(!records.length)return;
      const bb=L.latLngBounds(records.map(p=>[p.lat,p.lon]));if(bb.isValid())map.fitBounds(bb.pad(.12),{maxZoom:15});
    });
    setMarket("njcentral");
  }
  function init(){
    $("acreageComparison").addEventListener("change",()=>{$("maxAcresField").hidden=$("acreageComparison").value!=="between";});
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
    if(map)status("Ready. Choose a market, then scan public Florida or New Jersey parcel records.","info");
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
