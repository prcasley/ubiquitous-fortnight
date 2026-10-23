/* Capital Radar public research assistant. No API keys, internal datasets, or remote model calls. */
(() => {
 "use strict";
 const $ = id => document.getElementById(id);
 const bridge=()=>window.PublicRadarBridge;
 const FL=[
   ["Palm Beach","PalmBeach",26.72,-80.13,true],
   ["Martin","Martin",27.16,-80.25,true],
   ["St. Lucie","StLucie",27.32,-80.36,true],
   ...["Alachua","Baker","Bay","Bradford","Brevard","Broward","Calhoun","Charlotte","Citrus","Clay","Collier","Columbia","DeSoto","Dixie","Duval","Escambia","Flagler","Franklin","Gadsden","Gilchrist","Glades","Gulf","Hamilton","Hardee","Hendry","Hernando","Highlands","Hillsborough","Holmes","Indian River","Jackson","Jefferson","Lafayette","Lake","Lee","Leon","Levy","Liberty","Madison","Manatee","Marion","Miami-Dade","Monroe","Nassau","Okaloosa","Okeechobee","Orange","Osceola","Pasco","Pinellas","Polk","Putnam","Santa Rosa","Sarasota","Seminole","Sumter","Suwannee","Taylor","Union","Volusia","Wakulla","Walton","Washington"].map(n=>[n,"",0,0,false])
 ];
 const NJ=[
  ["Atlantic",39.45,-74.65],["Bergen",40.94,-74.07],["Burlington",39.92,-74.75],
  ["Camden",39.81,-75.00],["Cape May",39.11,-74.83],["Cumberland",39.36,-75.06],
  ["Essex",40.78,-74.23],["Gloucester",39.70,-75.14],["Hudson",40.74,-74.05],
  ["Hunterdon",40.57,-74.93],["Mercer",40.30,-74.67],["Middlesex",40.52,-74.37],
  ["Monmouth",40.28,-74.20],["Morris",40.86,-74.50],["Ocean",39.90,-74.23],
  ["Passaic",40.94,-74.30],["Salem",39.57,-75.43],["Somerset",40.56,-74.60],
  ["Sussex",41.13,-74.70],["Union",40.67,-74.30],["Warren",40.84,-75.02]
 ];
 let activeCounty="", speaking=false, busy=false;
 const assembly=new Map();
 const clean=s=>String(s??"").trim();
 const lower=s=>clean(s).toLowerCase();
 const stateFrom=q=>/\b(NJ|new jersey)\b/i.test(q)?"NJ":/\b(FL|florida)\b/i.test(q)?"FL":null;
 function parseIntent(raw){
   const q=clean(raw), l=lower(q);
   const area=l.match(/\b(over|above|greater than|more than|at least|minimum|under)\s+(\d+(?:\.\d+)?)\s*(?:acres?|ac\b)/);
   const radius=l.match(/\b(?:within|radius(?: of)?|in a)\s+(\d+(?:\.\d+)?)\s*(?:miles?|mi\b)/);
   const type=/\b(multifamily|multi.family|apartment|apartments)\b/.test(l)?"multifamily":
     /\b(vacant|undeveloped|empty lots?)\b/.test(l)?"vacant":
     /\b(industrial|warehouse|warehousing|distribution|manufacturing)\b/.test(l)?"industrial":null;
   const countyLabel=[...NJ.map(x=>x[0]),...FL.map(x=>x[0])]
     .find(x=>l.includes(x.toLowerCase()+" county"));
   let location=(q.match(/\b(?:in|near|around)\s+([A-Za-z][^?.!]*?)(?:\s+(?:over|above|with|within|at least)\s+|$)/i)||[])[1]||"";
   location=location.replace(/\s+(?:under|with)\s+\d+(?:\.\d+)?\s*acres?.*$/i,"").trim();
   if(/^(the|this|these|my) (?:results|scan|parcels|area)$/i.test(location))location="";
   if(/^(florida|new jersey|nj|fl|me|my location)$/i.test(location))location="";
   const search=/\b(find|show|scan|search|look for|locate)\b/i.test(q)&&
      (type||area||location||radius||/\b(parcel|properties|near me)\b/i.test(q));
   return {q,search:!!search,nearMe:/\b(near me|around me|my location)\b/.test(l),type,acres:area?Number(area[2]):null,comparison:area?(area[1]==="under"?"under":/^(over|above|greater than|more than)$/.test(area[1])?">":">="):null,
      radius:radius?Math.min(100,Math.max(.5,Number(radius[1]))):null,
      state:stateFrom(q),countyLabel:countyLabel||null,location,
      sort:/\b(biggest|largest|most acreage)\b/.test(l)?"largest":/\b(nearest|closest)\b/.test(l)?"nearest":null,
      questionOwnership:/\b(owner|who owns|title holder)\b/.test(l),
      questionLease:/\b(lease|tenant|rent|expiration)\b/.test(l),
      questionOZ:/\b(opportunity zone|oz ?1|oz ?2|oz ?2027)\b/.test(l),
      questionSource:/\b(source|accuracy|verified|reliable|coverage|provenance)\b/.test(l)
   };
 }
 window.PublicRadarAgent={parseIntent,getCounty:()=>activeCounty};
 function putMessage(message,role="bot",sourceURL){
   const host=$("agentLog");if(!host)return;
   const box=document.createElement("div");box.className="agent-message "+role;box.textContent=message;
   if(sourceURL&&/^https:\/\/(?:services\d*\.arcgis\.com|www\.nj\.gov|nj\.gov|www\.irs\.gov|irs\.gov)\//.test(sourceURL)){
     const a=document.createElement("a");a.href=sourceURL;a.target="_blank";a.rel="noopener noreferrer";a.textContent="Source record layer ↗";
     box.append(document.createTextNode("\n"),a);
   }
   host.append(box);host.scrollTop=host.scrollHeight;
   while(host.children.length>16)host.firstChild.remove();
 }
 function chooseNearestCounty(state,coords){
   if(state==="FL"){
     if(!coords)return "PalmBeach";
     return [...FL].filter(x=>x[4]).map(x=>({key:x[1],d:Math.abs(coords.lat-x[2])+Math.abs(coords.lon-x[3])})).sort((a,b)=>a.d-b.d)[0]?.key||"PalmBeach";
   }
   if(!coords)return "Middlesex";
   return NJ.map(x=>({key:x[0],d:Math.abs(coords.lat-x[1])+Math.abs(coords.lon-x[2])}))
     .sort((a,b)=>a.d-b.d)[0]?.key||"Middlesex";
 }
 function countyEntries(state){
   return state==="NJ"?NJ.map(x=>({label:x[0],key:x[0],lat:x[1],lon:x[2],connected:true})):
     FL.map(x=>({label:x[0],key:x[1],lat:x[2],lon:x[3],connected:x[4]}));
 }
 function applyCounty(state,preferred,{center=true}={}){
   const select=$("countySelect");if(!select)return;
   const rows=countyEntries(state);
   select.textContent="";
   const active=rows.filter(x=>x.connected),planned=rows.filter(x=>!x.connected);
   const group=document.createElement("optgroup");group.label="Connected counties";
   for(const c of active){const op=new Option(c.label,c.key);group.append(op);}
   const allOption=new Option(state==="NJ"?"Statewide source (GPS; county unverified)":"Three connected counties (GPS; county unverified)","");
   select.append(allOption);select.append(group);
   if(planned.length){
      const pending=document.createElement("optgroup");pending.label="Source research queued (not connected)";
      for(const c of planned){const op=new Option(c.label+" · planned","");op.disabled=true;pending.append(op);}
      select.append(pending);
   }
   const found=active.find(x=>x.key===preferred)||active[0];
   if(found){
     select.value=found.key;activeCounty=found.key;window.PublicRadarCounty=activeCounty;
     if(center)bridge()?.setCenter(found.lat,found.lon,state==="NJ"?12:12);
   }
   return found;
 }
 function clearOldResults(){
   // A new location choice must not silently re-label an older completed scan.
   if(bridge()?.clearResults)bridge().clearResults();
 }
 function applyNewLocation(){
   const state=$("stateSelect").value;
   applyCounty(state,state==="FL"?"PalmBeach":"Middlesex");
   clearOldResults();
   bridge()?.setStatus("County and state selected. Press Scan public parcels, or ask Radar for a nearby search.","info");
 }
 function sourceSummary(rows){
   const meta=bridge()?.getMeta()||{};
   const y=rows.filter(r=>r.yearBuilt!=null).length;
   const absent=rows.filter(r=>r.acres==null).length;
   const acres=rows.filter(r=>r.acres!=null).sort((a,b)=>b.acres-a.acres);
   return {
     sentence:rows.length+" returned source parcels from "+(meta.source||"a public GIS service")+
       ". "+y+" have a published construction year; "+absent+" have no published acreage."+
       (acres.length?" Largest by reported acreage: "+(acres[0].address||acres[0].id)+" ("+acres[0].acres.toFixed(2)+" ac).":""),
     meta
   };
 }
 function explainFollowUp(intent){
   const rows=bridge()?.getResults()||[],meta=bridge()?.getMeta()||{};
   if(!meta.ready)return "No completed public scan is loaded. Search for a county or property type first.";
   if(intent.questionOwnership)return "For a Florida parcel, open its detail card and choose Look up published assessment name. This queries the official record for that parcel when requested, without mailing addresses. New Jersey statewide GIS redacts owner names; open the official county tax-record lookup for independent research. Assessment names are NOT deed or beneficial-ownership verification.";
   if(intent.questionLease)return "Connected parcel/assessment sources do not provide verified lease start, tenant, rental terms or expiration. Those fields are unavailable here, not zero or unleased.";
   if(intent.questionOZ)return "OZ 1 means tracts designated in the older round. OZ 2 map data currently concerns eligibility or nominations for a later designation round. Turn on the appropriate reference layers; eligibility is NOT designation. Check the IRS source notice before relying on status.";
   if(intent.questionSource)return "Records come from "+meta.source+". Retrieved "+(meta.time||"time unavailable")+
     ". The GIS source is not a title report, a boundary survey, or a leasing database. Geographic coverage varies by state and county. Incomplete source results are never interpreted as zero properties.";
   if(!rows.length)return "The last completed search returned no accepted records under its available-source filters; it is not proof that no property exists.";
   let matches=rows.filter(r=>intent.type==null||r.type===({multifamily:"Multifamily",industrial:"Industrial",vacant:"Vacant"}[intent.type]));
   if(intent.acres!=null)matches=matches.filter(r=>r.acres!=null&&(intent.comparison===">"?r.acres>intent.acres:intent.comparison==="under"?r.acres<intent.acres:r.acres>=intent.acres));
   if(intent.sort==="largest")matches.sort((a,b)=>(b.acres??-1)-(a.acres??-1));
   if(intent.sort==="nearest")matches.sort((a,b)=>a.distance-b.distance);
   const list=matches.slice(0,5).map(r=>"• "+(r.address||r.id)+" · "+(r.acres==null?"acreage unavailable":r.acres.toFixed(2)+" acres")+" · parcel "+r.id).join("\n");
   return matches.length+" of "+rows.length+" records in the last completed source scan match this question.\n"+list+
     (matches.length>5?"\nShowing five; use the results panel for more.":"")+"\nSource: "+meta.source+". Status: public research only.";
 }
 async function ask(raw){
   const intent=parseIntent(raw);if(!intent.q)return;
   if(busy){putMessage("A public-source search is already in progress. Finish it before submitting another request.");return;}
   putMessage(intent.q,"user");
   if(!intent.search){putMessage(explainFollowUp(intent),"bot",bridge()?.getSources()?.[bridge()?.getMeta()?.state]);return;}
   busy=true;const btn=$("agentForm")?.querySelector('button[type="submit"]');if(btn)btn.disabled=true;
   try{
     let state=intent.state||$ ("stateSelect").value;
     if(!["FL","NJ"].includes(state)){putMessage("Currently connected public parcel sources are Florida (three counties) and New Jersey. Other states require a verified new source adapter.");return;}
     $("stateSelect").value=state;
     let county=null;
     if(intent.countyLabel){
       const row=countyEntries(state).find(x=>x.label.toLowerCase()===intent.countyLabel.toLowerCase());
       if(row&&!row.connected){putMessage("The county was recognized but is not connected to a verified parcel service yet. No search was fabricated.");return;}
       county=row?.key;
     }
     applyCounty(state,county,{center:!!county || (!intent.location&&!intent.nearMe)});
     if(intent.nearMe){
       const location=await bridge().locateGPS();
       if(!location){putMessage("Device location could not be verified. No nearby parcel scan was run.");return;}
       state=location.state;$("stateSelect").value=state;
       applyCounty(state,null,{center:false});
       $("countySelect").value="";activeCounty="";window.PublicRadarCounty="";
       putMessage("GPS centered in "+state+". County has not been independently identified, so this request searches the supported public statewide/three-county source within your radius.");
     }
     if(intent.location){
       $("placeInput").value=intent.location+(intent.state&&!new RegExp("\\b"+intent.state+"\\b","i").test(intent.location)?", "+intent.state:"");
       const located=await bridge().findPlace();
       if(located!==true){
         putMessage("Couldn't verify the requested location from the public geocoder. No parcel scan was run at a guessed location.");return;
       }
       const matchCounty=String(bridge().getLastGeocodeCounty?.()||"").trim();
       const recognized=countyEntries(state).find(c=>c.label.toLowerCase()===matchCounty.toLowerCase());
       if(!recognized){
         putMessage("The geocoder located the address but did not provide a matching county. Choose the county explicitly to prevent searching the wrong assessment source. No source search was run.");
         return;
       }
       if(!recognized.connected){
         putMessage("The geocoder identified "+recognized.label+" County, but a vetted public source for that county is not yet connected.");
         return;
       }
       applyCounty(state,recognized.key,{center:false});
     }
     if(intent.type)$("typeSelect").value=intent.type;
     if(intent.acres!=null){$("minAcres").value=String(intent.acres);window.PublicRadarStrictMin=intent.comparison===">";}
     else window.PublicRadarStrictMin=false;
     if(intent.radius!=null){
       const r=$("radiusSelect");
       const options=[...r.options].map(o=>Number(o.value)).filter(x=>Number.isFinite(x));
       r.value=String(options.find(x=>x>=intent.radius)||options[options.length-1]||5);
     }
     const previous=bridge().getMeta().time;
     putMessage("Searching the selected public source now. I will not replace failed or truncated results with invented answers.");
     await bridge().scan();
     const meta=bridge().getMeta(),rows=bridge().getResults();
     if(!meta.ready||meta.time===previous){
       putMessage("The scanner did not complete a fresh verified retrieval. Read the source warning above; no result count is claimed.");return;
     }
     putMessage(sourceSummary(rows).sentence+"\nRetrieved: "+meta.time+
       ". This does not indicate availability, title ownership or an investment recommendation.","bot",bridge().getSources()[meta.state]);
   }catch(e){putMessage("The public search could not complete: "+String(e?.message||e)+". No zero-result conclusion was made.");}
   finally{busy=false;if(btn)btn.disabled=false;}
 }
 function showAssembly(){
   let panel=$("assemblyTray");
   if(!panel){
     panel=document.createElement("section");panel.id="assemblyTray";panel.className="assembly-tray";
     const mapPanel=$("mapPanel");mapPanel?.after(panel);
   }
   panel.textContent="";
   const title=document.createElement("strong");title.textContent="Parcel group · "+assembly.size+" selected";
   const rows=[...assembly.values()],known=rows.filter(r=>r.acres!=null);
   const total=known.reduce((n,r)=>n+r.acres,0);
   const note=document.createElement("p");
   note.textContent=(known.length?total.toFixed(2)+" published acres across "+known.length+" records. ":"Acreage not yet published. ") +
      "Selection does NOT establish adjacency, common ownership, seller intent or assemblage feasibility. No data is uploaded.";
   panel.append(title,note);
   if(rows.length){
     const names=document.createElement("small");names.textContent=rows.map(r=>r.id).join(" · ");panel.append(names);
     const button=document.createElement("button");button.type="button";button.className="secondary";button.textContent="Clear selection";
     button.addEventListener("click",()=>{assembly.clear();showAssembly();});
     panel.append(button);
   }
 }
 function parcelAction(e){
   const key=e?.detail?.key,prop=bridge()?.getResults()?.find(x=>x.key===key);if(!prop)return;
   const host=$("details");if(!host)return;
   let btn=$("assembleSelect");if(btn)btn.remove();btn=document.createElement("button");
   btn.type="button";btn.className="secondary";btn.id="assembleSelect";
   btn.textContent=assembly.has(key)?"Remove from parcel group":"Add to parcel group";
   btn.addEventListener("click",()=>{
     if(assembly.has(key))assembly.delete(key);else assembly.set(key,{id:prop.id,acres:prop.acres,source:prop.source?.name});
     btn.textContent=assembly.has(key)?"Remove from parcel group":"Add to parcel group";showAssembly();
   });
   host.append(btn);
 }
 function bindVoice(){
   const button=$("agentMic");if(!button)return;
   const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
   if(!Recognition){button.disabled=true;button.title="Speech recognition not available in this browser";return;}
   button.addEventListener("click",()=>{
     if(speaking)return;
     if(!window.confirm("Speech recognition is provided by your browser or device and may use its voice processing service. Continue?"))return;
     const r=new Recognition();r.lang="en-US";r.interimResults=false;r.maxAlternatives=1;speaking=true;button.textContent="Listening…";
     r.onresult=e=>{$("agentPrompt").value=e.results?.[0]?.[0]?.transcript||"";};
     r.onerror=()=>putMessage("Microphone transcription failed. You can type your request instead.");
     r.onend=()=>{speaking=false;button.textContent="🎙 Speak";};
     r.start();
   });
 }
 async function modelExplain(){
   const rows=bridge()?.getResults()||[],meta=bridge()?.getMeta()||{};
   if(!rows.length||!meta.ready){putMessage("A completed public parcel scan is needed before requesting an AI explanation.");return;}
   if(!window.RADAR_NIM_GATEWAY_ACTIVE||location.hostname.endsWith(".github.io")){
     putMessage("NVIDIA Nemotron is not deployed on this public static site. Use the grounded search agent here; GPU inference requires an approved authenticated host.");return;
   }
   const payload={
     question:$("agentPrompt")?.value.trim()||"Summarize these public assessor records with uncertainties.",
     sourceURL:bridge()?.getSources()?.[meta.state],
     records:rows.slice(0,25).map(p=>({id:p.id,address:p.address,state:p.state,acres:p.acres,type:p.type,yearBuilt:p.yearBuilt}))
   };
   const btn=$("nemotronExplain");btn.disabled=true;
   try{
     const r=await fetch("/api/radar-agent",{method:"POST",credentials:"same-origin",
       headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
     if(!r.ok)throw Error("Authenticated NVIDIA gateway unavailable (HTTP "+r.status+")");
     const json=await r.json();
     if(!json.modelGenerated||typeof json.answer!=="string")throw Error("Unverified model response envelope");
     putMessage("NVIDIA AI interpretation (NOT an independently verified finding):\n"+json.answer+
       "\nSource: "+json.sourceURL+"\nPlease verify underlying records before decisions.");
   }catch(e){putMessage("NVIDIA inference not available: "+String(e.message||e)+". The verified-rule agent remains usable.");}
   finally{btn.disabled=false;}
 }
 function init(){
   if(!bridge()||!$("agentForm"))return;
   $("agentForm").addEventListener("submit",e=>{e.preventDefault();ask($("agentPrompt").value);});
   document.querySelectorAll("[data-agent-example]").forEach(b=>b.addEventListener("click",()=>{$("agentPrompt").value=b.dataset.agentExample;ask(b.dataset.agentExample);}));
   $("stateSelect").addEventListener("change",applyNewLocation);
   $("countySelect").addEventListener("change",()=>{
      const state=$("stateSelect").value;
      const row=countyEntries(state).find(c=>c.key===$("countySelect").value);
      if(!row||!row.connected)return;
      activeCounty=row.key;window.PublicRadarCounty=activeCounty;
      bridge().setCenter(row.lat,row.lon,12);clearOldResults();
      bridge().setStatus("Centered on "+row.label+" County. Searches are public-source, bounded by radius and selected county.","info");
   });
   $("market").addEventListener("change",()=>{
     const id=$("market").value;
     const m={njcentral:["NJ","Middlesex"],njnorth:["NJ","Passaic"],njshore:["NJ","Monmouth"],
       palm:["FL","PalmBeach"],treasure:["FL","Martin"],stlucie:["FL","StLucie"]}[id];
     if(m){applyCounty(m[0],m[1],{center:false});clearOldResults();}
   });
   applyCounty($("stateSelect").value,"Middlesex",{center:false});
   const nim=$("nemotronExplain");
   if(nim){const enabled=window.RADAR_NIM_GATEWAY_ACTIVE===true&&!location.hostname.endsWith(".github.io");
     nim.disabled=!enabled;
     nim.title=enabled?"Explain the current public scan through an authenticated NVIDIA host":
       "Available only after secure NVIDIA inference deployment (never directly on GitHub Pages)";
     nim.addEventListener("click",modelExplain);}
   bindVoice();showAssembly();document.addEventListener("radar:parcel-selected",parcelAction);
   document.addEventListener("radar:scan-complete",()=>assembly.clear());
 }
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();