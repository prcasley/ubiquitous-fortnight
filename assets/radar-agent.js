/* Capital Radar public research assistant. No API keys, internal datasets, or remote model calls. */
(() => {
 "use strict";
 const $ = id => document.getElementById(id);
 const bridge=()=>window.PublicRadarBridge;
 const FL=[
   ["Palm Beach","PalmBeach",26.72,-80.13,true],
   ["Martin","Martin",27.16,-80.25,true],
   ["Broward","Broward",26.12,-80.14,true],
   ["Miami-Dade","MiamiDade",25.77,-80.19,true],
   ["St. Lucie","StLucie",27.32,-80.36,true],
   ...["Alachua","Baker","Bay","Bradford","Brevard","Calhoun","Charlotte","Citrus","Clay","Collier","Columbia","DeSoto","Dixie","Duval","Escambia","Flagler","Franklin","Gadsden","Gilchrist","Glades","Gulf","Hamilton","Hardee","Hendry","Hernando","Highlands","Hillsborough","Holmes","Indian River","Jackson","Jefferson","Lafayette","Lake","Lee","Leon","Levy","Liberty","Madison","Manatee","Marion","Monroe","Nassau","Okaloosa","Okeechobee","Orange","Osceola","Pasco","Pinellas","Polk","Putnam","Santa Rosa","Sarasota","Seminole","Sumter","Suwannee","Taylor","Union","Volusia","Wakulla","Walton","Washington"].map(n=>[n,"",0,0,false])
 ];
 const PA=[["Lehigh",40.602,-75.49],["Northampton",40.69,-75.22]];
 const NJ=[
  ["Atlantic",39.45,-74.65],["Bergen",40.94,-74.07],["Burlington",39.92,-74.75],
  ["Camden",39.81,-75.00],["Cape May",39.11,-74.83],["Cumberland",39.36,-75.06],
  ["Essex",40.78,-74.23],["Gloucester",39.70,-75.14],["Hudson",40.74,-74.05],
  ["Hunterdon",40.57,-74.93],["Mercer",40.30,-74.67],["Middlesex",40.52,-74.37],
  ["Monmouth",40.28,-74.20],["Morris",40.86,-74.50],["Ocean",39.90,-74.23],
  ["Passaic",40.94,-74.30],["Salem",39.57,-75.43],["Somerset",40.56,-74.60],
  ["Sussex",41.13,-74.70],["Union",40.67,-74.30],["Warren",40.84,-75.02]
 ];
 let activeCounty="", speaking=false, busy=false, pendingSearch=null, locationKnown=false;
 const assembly=new Map();
 const clean=s=>String(s??"").trim();
 const lower=s=>clean(s).toLowerCase();
 const stateFrom=q=>/\b(NJ|new jersey)\b/i.test(q)?"NJ":/\b(FL|florida)\b/i.test(q)?"FL":/\b(PA|pennsylvania)\b/i.test(q)?"PA":null;
 function parseIntent(raw){
   const q=clean(raw).replace(/[?!.]+$/,'');
   const words={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20};
   const l=lower(q).replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)(?=[\s-]+(?:acres?|ac\b|miles?))/g,w=>words[w]);
   const unit='(?:acres?|ac\\b|acrs)';
   const range=l.match(new RegExp('\\b(?:between\\s+)?(\\d+(?:\\.\\d+)?)\\s*(?:and|to|[-–])\\s*(\\d+(?:\\.\\d+)?)\\s*'+unit+'\\b'));
   const explicit=l.match(new RegExp('\\b(over|above|greater than|more than|at least|minimum|no less than|under|less than|below|at most|no more than|up to|exactly|about|around|approx(?:imately)?\\.?|roughly)\\s+(\\d+(?:\\.\\d+)?)[\\s-]*'+unit+'\\b'));
   const bare=l.match(new RegExp('\\b(\\d+(?:\\.\\d+)?)\\s*(\\+)?[\\s-]*'+unit+'\\b'));
   let acres=null,maxAcres=null,comparison=null,acreageMeaning=null;
   if(range){acres=Number(range[1]);maxAcres=Number(range[2]);comparison='between';acreageMeaning='range';}
   else if(explicit){
     acres=Number(explicit[2]);const op=explicit[1];
     comparison=/^(under|less than|below)$/.test(op)?'under':/^(at most|no more than|up to)$/.test(op)?'<=':/^(over|above|greater than|more than)$/.test(op)?'>':op==='exactly'?'=':'>=';
     if(/^(about|around|approx|approximately|roughly)/.test(op)){
       maxAcres=Number((acres*1.1).toFixed(3));acres=Number((acres*.9).toFixed(3));comparison='between';acreageMeaning='approximate-10-percent';
     }
   }else if(bare){
     acres=Number(bare[1]);const prefix=l.slice(0,bare.index);
     comparison=bare[2]||/\b(?:with|minimum(?: of)?|at least)\s*$/.test(prefix)?'>=':'=';
     acreageMeaning=comparison==='>='?'minimum':'exact';
   }
   const radius=l.match(/\b(?:within|radius(?: of)?|in a)\s+(\d+(?:\.\d+)?)\s*(?:miles?|mi\b)/);
   const type=/\b(?:all (?:property|assessment) types|any (?:property|assessment) type)\b/.test(l)?'all':/\b(multifamily|multi.family|apartment|apartments)\b/.test(l)?'multifamily':
     /\b(vacant|undeveloped|empty lots?)\b/.test(l)?'vacant':
     /\b(industrial|warehouses?|warehousing|distribution|manufacturing|factories)\b/.test(l)?'industrial':null;
   const countyLabel=[...NJ.map(x=>x[0]),...FL.map(x=>x[0]),...PA.map(x=>x[0])].find(x=>l.includes(x.toLowerCase()+' county'));
   let location=(q.match(/\b(?:in|near|around)\s+([A-Za-z].*)$/i)||[])[1]||'';
   location=location.split(/\s+(?:with|that|which|within|over|above|under|at least|at most|up for|for sale|priced|asking|before (?:jan(?:uary)?|dec(?:ember)?)|by (?:jan(?:uary)?|dec(?:ember)?)|about|around|approximately|approx\.?|and (?:has|have|for))\b|\s*\$/i)[0].replace(/[,\s]+$/,'').trim();
   location=location.replace(/\s+(?:in|within|inside)\s+(?:an?\s+)?(?:OZ\s*[12]|opportunity zone).*$/i,'');
   if(/^(?:OZ\s*[12]|(?:an?\s+)?opportunity zone)/i.test(location))location='';
   if(/^(?:(?:(?:the|this|these|those|my|current|last|existing|loaded)\s+){1,2}(?:results|scan|parcels|area|shortlist|properties|sites)|florida|new jersey|nj|fl|me|my location)$/i.test(location))location='';
   const commanded=/\b(find|show|scan|search|look(?:ing)? for|locate|need|want|get me)\b/i.test(q);
   const search=commanded&&
     (type||acres!=null||location||radius||/\b(parcels?|properties|property|land|near me)\b/i.test(q));
   const stateToken=q.match(/\b(NJ|FL|PA|new jersey|florida|pennsylvania)\b/i);
   if(!location&&stateToken){
     let candidate=q.slice(0,stateToken.index).replace(/\b(?:\d+(?:\.\d+)?)[\s-]*(?:acres?|ac\b)\b/gi,' ').replace(/\b(?:find|show|me|the|any|nearest|largest|industrial|warehouses?|parcels?|properties|property|land|vacant|multifamily|apartments?|over|under|at|least|most|exactly|about|with|in|near|only)\b/gi,' ').replace(/[,\s]+/g,' ').trim();
     if(!candidate)candidate=q.slice(stateToken.index+stateToken[0].length).replace(/\b\d+(?:\.\d+)?\s*\+?\s*(?:acres?|ac\b)\b/gi,' ').replace(/\b(?:industrial|warehouses?|parcels?|properties|land|vacant|multifamily|apartments?|over|under|at|least|most|exactly|with|only)\b/gi,' ').trim();
     if(candidate&&!/\b(?:who|which|what|why|when|how|owns?|owners?|source|coverage|OZ|qualify)\b/i.test(candidate)&&/^[A-Za-z][A-Za-z .'-]*$/.test(candidate))location=candidate+' '+stateToken[0];
   }
   const informationQuestion=/^(?:who|which|what|why|when|how|does|do|is|are|will|can)\b/i.test(q);
   const shorthand=!informationQuestion&&!/\b(?:comps?|comparables?|leases?|owners?|source|coverage|OZ\s*2)\b/i.test(q)&&(!!type||acres!=null);
   if(shorthand&&!commanded&&comparison==='='&&acreageMeaning==='exact'){comparison='>=';acreageMeaning='minimum-shorthand';}
   const forSale=/\b(for sale|up for sale|on the market|listings?|listed for sale|available to buy)\b/.test(l);
   const comps=/\b(comps?|comparables?|closed sales?|recent sales?)\b/.test(l);
   const price=l.match(/\$?\s*(\d[\d,]*(?:\.\d+)?)\s*(?:\/|per\s+)(?:sq\.?\s*(?:ft\.?|foot|feet)|sqft|square\s*(?:foot|feet)|sf)\b/);
   const pricePsf=price?{amount:Number(price[1].replace(/,/g,'')),basis:comps?'closed-sale':forSale?'asking-sale':/\b(rent|rental)\b/.test(l)?'asking-rent':'unspecified',unit:'building-square-foot',approximate:/\b(about|approx|approximately|around|roughly)\b/.test(l)}:null;
   const budgetMatch=!price&&l.match(/\$\s*(\d[\d,]*(?:\.\d+)?)\s*(million|m\b|thousand|k\b)?/i);
   const budget=budgetMatch?{amount:Number(budgetMatch[1].replace(/,/g,''))*(/^(million|m)$/i.test(budgetMatch[2])?1000000:/^(thousand|k)$/i.test(budgetMatch[2])?1000:1)}:null;
   return {q,budget,invalidReason:range&&Number(range[1])>Number(range[2])?"Enter a size range with the smaller acreage first.":!range&&/(?:^|[\s(])-\s*\d+(?:\.\d+)?\s*(?:acres?|ac\b|miles?)/i.test(q)?"Acreage and radius cannot be negative.":null,search:!!(search||shorthand||location&&type),refine:/^(?:show\s+(?:me\s+)?only|only|just|actually|make (?:it|that)|how about|what about|instead|change (?:it|that) to)\b/i.test(q),nearMe:/\b(near me|around me|my location)\b/.test(l),type,acres,maxAcres,comparison,acreageMeaning,
     radius:radius?Number(radius[1]):null,state:stateFrom(q),countyLabel:countyLabel||null,location,
     sort:/\b(biggest|largest|most acreage)\b/.test(l)?'largest':/\b(nearest|closest)\b/.test(l)?'nearest':null,
     questionOwnership:/\b(owners?|ownership|who owns|owned by|title holder)\b/.test(l),
     questionLease:/\b(leases?|tenants?|rent|expiration|expiring|expires|renewal|renewals|renewing|renew)\b/.test(l),
     forSale,comps,pricePsf,
     questionOZ:/\b(opportunity zone|oz ?1|oz ?2|oz ?2027)\b/.test(l),
     questionDeadline:/\b(?:before|by|close|closing|acquir|deadline)\b.*\b(?:jan(?:uary)?|dec(?:ember)?|year.end|1st|31st)\b/i.test(q),
     questionSource:/\b(source|accuracy|verified|reliable|coverage|provenance)\b/.test(l)};
 }
 function missingCriteria(intent){
   const missing=[];
   if(intent.budget)missing.push('purchase budget matching');
   if(intent.questionDeadline)missing.push('acquisition deadline feasibility');
   if(intent.questionOZ)missing.push('OZ 2 designation and tax eligibility');
   if(intent.questionLease)missing.push('lease renewal dates');
   if(intent.forSale)missing.push('current sale availability');
   if(intent.pricePsf||intent.comps)missing.push(intent.comps?'closed-sale comparables':'asking price per building square foot');
   if(intent.questionOwnership)missing.push('verified owner names');
   return missing;
 }
 function acreageDescription(intent){
   if(intent.acres==null)return 'any acreage';
   if(intent.comparison==='between')return `${intent.acres}–${intent.maxAcres} acres${intent.acreageMeaning==='approximate-10-percent'?' (about the requested size, ±10%)':''}`;
   return `${{'>=':'at least','>':'more than','under':'under','<=':'at most','=':'exactly'}[intent.comparison]||'at least'} ${intent.acres} acres`;
 }
 window.PublicRadarAgent={parseIntent,getCounty:()=>activeCounty};
 function putMessage(message,role="bot",sourceURL){
   const host=$("agentLog");if(!host)return;
   const box=document.createElement("div");box.className="agent-message "+role;box.textContent=message;
   if(sourceURL&&/^https:\/\/(?:services\d*\.arcgis\.com|gis\.lehighcounty\.org|gis\.northamptoncounty\.org|www\.nj\.gov|nj\.gov|www\.irs\.gov|irs\.gov)\//.test(sourceURL)){
     const details=document.createElement("details"),label=document.createElement("summary"),a=document.createElement("a");label.textContent="Data source";a.href=sourceURL;a.target="_blank";a.rel="noopener noreferrer";a.textContent="Official data layer (technical source)";details.append(label,a);box.append(details);
   }
   host.append(box);host.scrollTop=host.scrollHeight;
   while(host.children.length>16)host.firstChild.remove();
   return box;
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
   if(state==="PA")return PA.map(x=>({label:x[0],key:x[0],lat:x[1],lon:x[2],connected:true}));
   return state==="NJ"?NJ.map(x=>({label:x[0],key:x[0],lat:x[1],lon:x[2],connected:true})):
     FL.map(x=>({label:x[0],key:x[1],lat:x[2],lon:x[3],connected:x[4]}));
 }
 function applyCounty(state,preferred,{center=true}={}){
   const select=$("countySelect");if(!select)return;
   const rows=countyEntries(state);
   select.textContent="";
   const active=rows.filter(x=>x.connected),planned=rows.filter(x=>!x.connected);
   const group=document.createElement("optgroup");group.label=state==="PA"?"County adapters · live validation required":"Connected counties";
   for(const c of active){const op=new Option(c.label,c.key);group.append(op);}
   const allOption=new Option(state==="PA"?"Choose a supported county (no statewide PA source)":state==="NJ"?"Statewide source (GPS; county unverified)":"Supported statewide subset (GPS; county unverified)","");
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
   const market=state==="PA"?{Lehigh:'lehigh',Northampton:'northampton'}[found?.key]:state==="FL"?{PalmBeach:'palm',Martin:'treasure',StLucie:'stlucie',Broward:'broward',MiamiDade:'miami'}[found?.key]:{Middlesex:'njcentral',Monmouth:'njshore',Passaic:'njnorth'}[found?.key];
   if(market)$("market").value=market;else $("market").value='custom';
   return found;
 }
 function clearOldResults(){
   // A new location choice must not silently re-label an older completed scan.
   if(bridge()?.clearResults)bridge().clearResults();
 }
 function applyNewLocation(){
   locationKnown=false;pendingSearch=null;
   const state=$("stateSelect").value;
   applyCounty(state,state==="PA"?"Lehigh":state==="FL"?"PalmBeach":"Middlesex");
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
       (meta.quarantinedCount?" "+meta.quarantinedCount+" records excluded for source/geometry acreage conflicts; check the data-quality notice.":"")+
       (acres.length?" Largest by reported acreage: "+(acres[0].address||acres[0].id)+" ("+acres[0].acres.toFixed(2)+" ac).":""),
     meta
   };
 }
 function explainFollowUp(intent){
   const rows=bridge()?.getResults()||[],meta=bridge()?.getMeta()||{};
   if(intent.forSale||intent.pricePsf||intent.comps||intent.budget)return "Current listings, purchase prices, budget matching and comparable sales are not connected to this public scan. Asking sale price per building square foot differs from closed-sale price per building square foot; both require source records, dates and building area. I cannot mark a parcel for sale or say it meets a price target without those records.";
   if(intent.questionLease)return "Lease renewal and expiration dates are not connected to this public scan. They need a lease schedule or other dated evidence; no parcel is being labeled up for renewal.";
   if(intent.questionDeadline)return "A January 1 closing target needs a dated acquisition plan: seller agreement, title and survey review, financing and closing conditions. Public GIS cannot establish closing readiness. Treat that date as a planning target; verify any OZ publication schedule, designation and tax eligibility against dated Treasury/IRS guidance. An eligibility-reference map does not confirm qualification.";
   if(intent.questionSource&&meta.time)return "Records come from "+meta.source+". Retrieved "+meta.time+". Scan status: "+meta.status+". "+(!meta.complete?"Partial retrieval: more parcels may exist; counts and rankings cover only the retrieved records. ":"")+"Assessment class is not zoning or legal title. Verify county records, source vintage and coverage before acquisition decisions.";
   if(!meta.complete&&!(meta.status==='partial'&&rows.length))return "No retrieved parcel results are loaded. Search for a county or property type first.";
   if(intent.questionOwnership)return "For a Florida parcel, open its detail card and choose Look up published assessment name. This queries the official record for that parcel when requested, without mailing addresses. New Jersey statewide GIS redacts owner names; open the official county tax-record lookup for independent research. Assessment names are NOT deed or beneficial-ownership verification.";
   if(intent.questionLease)return "Connected parcel/assessment sources do not provide verified lease start, tenant, rental terms or expiration. Those fields are unavailable here, not zero or unleased.";
   if(intent.questionOZ)return "OZ 1 means tracts designated in the older round. OZ 2 map data currently concerns eligibility or nominations for a later designation round. Turn on the appropriate reference layers; eligibility is NOT designation. Check the IRS source notice before relying on status.";
   if(intent.questionSource)return "Records come from "+meta.source+". Retrieved "+(meta.time||"time unavailable")+
     ". The GIS source is not a title report, a boundary survey, or a leasing database. Geographic coverage varies by state and county. Incomplete source results are never interpreted as zero properties.";
   if(!rows.length)return "The last completed search returned no accepted records under its available-source filters; it is not proof that no property exists.";
   let matches=rows.filter(r=>intent.type==null||r.type===({multifamily:"Multifamily",industrial:"Industrial",vacant:"Vacant"}[intent.type]));
   if(intent.acres!=null)matches=matches.filter(r=>r.acres!=null&&(window.RadarDomain.matchesAcres(r.acres,{value:intent.acres,op:intent.comparison==="under"?"<":intent.comparison||">=",max:intent.maxAcres})));
   if(intent.sort==="largest")matches.sort((a,b)=>(b.acres??-1)-(a.acres??-1));
   if(intent.sort==="nearest")matches.sort((a,b)=>a.distance-b.distance);
   const list=matches.slice(0,5).map(r=>"• "+(r.address||r.id)+" · "+(r.acres==null?"acreage unavailable":r.acres.toFixed(2)+" acres")+" · parcel "+r.id).join("\n");
   return matches.length+" of "+rows.length+" records in the retrieved source results match this question.\n"+list+
     (matches.length>5?"\nShowing five; use the results panel for more.":"")+"\nSource: "+meta.source+". Status: "+meta.status+(!meta.complete?" — partial retrieval; more properties may exist.":" — public research only.");
 }
 async function ownerAnswer(intent){
   const all=bridge().getResults(),ordered=intent.sort==='largest'?[...all].sort((a,b)=>(b.acres??-1)-(a.acres??-1)):all;
   const targets=intent.sort||/\b(?:largest|nearest|selected|this one)\b/i.test(intent.q)?ordered.slice(0,1):ordered.slice(0,25);
   let singleResult=null;const scan=bridge().getMeta().scanId;putMessage('Checking published assessment names for '+targets.length+' of '+all.length+' retrieved parcels. Names do not establish legal title or beneficial ownership.');
   for(const row of targets){
     if(scan!==bridge().getMeta().scanId)return;
     try{const result=await window.RadarOwnership.lookup(row);singleResult=result;if(scan!==bridge().getMeta().scanId)return;
       putMessage((row.address||row.id)+' · parcel '+row.id+': '+(result.entityName?'Published assessment entity: '+result.entityName+'. Retrieved '+result.retrievedAt+'.':result.status==='published'?(targets.length===1?'Published assessment name: '+result.publishedName+'. Organization status unverified; this name is not indexed into the company directory. Retrieved '+result.retrievedAt+'.':'The source returned an individual or unclassified assessment name; it is not indexed into the company directory. Open the selected property to review the official observation.'):result.message||'The source did not publish an owner name.')+' Assessment names are not independently verified title or control.');
     }catch{putMessage((row.address||row.id)+': the public owner lookup was unavailable. No owner was inferred.');}
   }
   if(targets.length===1){bridge().choose(targets[0].key);if(singleResult)window.RadarOwnership.present(targets[0],singleResult);}
   window.RadarChatProperties?.render(targets,bridge().getMeta());
 }
 async function ozAnswer(intent={}){
   const rows=bridge().getResults(),meta=bridge().getMeta(),kind=/\bOZ\s*1\b/i.test(intent.q||'')?'oz1':'oz2';
   putMessage('Checking '+rows.length+' retrieved parcels against the '+kind.toUpperCase()+' reference polygons. This checks reference intersections; final designation and tax qualification remain unverified.');
   try{
     const result=await window.RadarOZResearch.check(rows,{kind});if(meta.scanId!==bridge().getMeta().scanId)return;
     const byKey=new Map(result.observations.map(o=>[o.key,o]));for(const row of rows)row.ozObservation=byKey.get(row.key);
     const hits=rows.filter(r=>r.ozObservation.status!=='no-reference-intersection');
     putMessage(hits.length+' of '+rows.length+' checked parcels intersect '+result.sourceName+'. '+(rows.length-hits.length)+' had no matching polygon returned in this reference check; that is not a finding of ineligibility. '+(!meta.complete?'The parcel search itself is partial; more parcels may exist. ':'')+'Checked '+result.checkedAt+'. Final designation, full parcel inclusion and tax qualification remain unverified. '+(hits.length?'Showing the intersecting candidates below; your full search remains in the sidebar.':''));
     window.RadarChatProperties?.render(hits.length?hits:rows.slice(0,6),meta);
   }catch(error){putMessage('Parcel OZ reference check unavailable: '+error.message+'. No properties were labeled qualified or ineligible; your shortlist was retained.');}
 }
 async function ask(raw){
   let intent=parseIntent(raw);if(!intent.q)return;
   let preserved=null;
   const previousSearch=bridge()?.getSearch();
   if(previousSearch&&(intent.questionOwnership||intent.questionOZ)&&!intent.location&&!intent.nearMe&&intent.acres==null&&intent.type==null&&intent.radius==null)intent.search=false;
   if(previousSearch&&!intent.location&&!intent.nearMe&&(!intent.state||intent.state===previousSearch.state)&&(intent.acres!=null||intent.type||intent.radius!=null)){
     preserved={...previousSearch,unverified:bridge().getMeta().unverified||[]};
     intent={...intent,search:true,state:previousSearch.state,type:intent.type||previousSearch.type,acres:intent.acres??previousSearch.acreage.value,
       comparison:intent.comparison||previousSearch.acreage.op,maxAcres:intent.acres==null?previousSearch.acreage.max:intent.maxAcres,radius:intent.radius??previousSearch.radius};
   }
   if(pendingSearch&&!intent.search){
     if(/^(cancel|never mind|nevermind|start over)[.!]?$/i.test(intent.q)){pendingSearch=null;putMessage("Search cancelled. Tell me what you want to find.");return;}
     if(!intent.questionLease&&!intent.questionOwnership&&!intent.questionSource&&!intent.pricePsf&&!intent.comps){
       const place=intent.q;
       intent={...pendingSearch,q:pendingSearch.q,location:/^(near me|my location)$/i.test(place)?'':place,nearMe:/^(near me|my location)$/i.test(place),state:stateFrom(place)||pendingSearch.state};
       pendingSearch=null;
     }
   }
   if(busy){putMessage("A public-source search is already in progress. Finish it before submitting another request.");return;}
   putMessage(clean(raw),"user");
   if(intent.invalidReason){putMessage(intent.invalidReason+" Your current results were retained.");return;}
   if(intent.sort&&!intent.questionOwnership&&!intent.questionOZ&&!intent.location&&!intent.state&&!intent.countyLabel&&!intent.nearMe&&intent.acres==null&&intent.type==null){
     const meta=bridge().getMeta(),rows=bridge().getResults();
     if(!rows.length){putMessage("Search for properties first, then I can sort the retrieved records by acreage or distance.");return;}
     bridge().sortResults(intent.sort);
     const unverified=missingCriteria(intent);
     putMessage((intent.sort==='largest'?"Largest reported acreage first":"Nearest map reference point first")+" in your existing results. Location and filters are unchanged. "+(!meta.complete?"Partial retrieval: more properties may exist; this is not a market-wide ranking.":"This ranks the retrieved scan only.")+(unverified.length?" Requested conditions remain unverified: "+unverified.join(", ")+".":""));
     window.RadarChatProperties?.render(bridge().getVisible(),meta);return;
   }

   if(!intent.search&&(intent.questionOwnership||intent.questionOZ)){
     if(intent.state&&bridge().getResults().length&&intent.state!==bridge().getMeta().state){putMessage("Your current shortlist is in "+bridge().getMeta().state+". Search for properties in "+intent.state+" first; no ownership or OZ answer was inferred for a different state.");return;}
     if(!bridge().getResults().length){putMessage("Search for properties first so I can check specific parcel records.");return;}
     const actionButton=$("agentForm").querySelector('button[type=submit]');busy=true;actionButton.disabled=true;try{if(intent.questionOwnership)await ownerAnswer(intent);else await ozAnswer(intent);if(intent.questionDeadline)putMessage(explainFollowUp({questionDeadline:true}));}finally{busy=false;actionButton.disabled=false;}return;
   }
   if(!intent.search){
     if(!intent.questionOwnership&&!intent.questionLease&&!intent.questionOZ&&!intent.forSale&&!intent.pricePsf&&!intent.comps&&!intent.budget&&window.PublicRadarAssistant?.isAvailable()&&bridge()?.getMeta()?.complete)
       await window.PublicRadarAssistant.explain(intent.q);
     else putMessage(explainFollowUp(intent),"bot",bridge()?.getMeta()?.sourceURL);
     return;
   }
   pendingSearch=null;
   clearOldResults();
   const missing=[...new Set([...(preserved?.unverified||[]),...missingCriteria(intent)])];
   if(!intent.location&&!intent.countyLabel&&!intent.nearMe&&(!locationKnown||intent.state&&intent.state!==$("stateSelect").value)){
     clearOldResults();pendingSearch=intent;
     putMessage(`I have ${intent.type||'all property types'}, ${acreageDescription(intent)}${intent.sort==='nearest'?', nearest first':''}. Which city or address${intent.state?' in '+intent.state:''} should I search near? You can also reply “near me.”`+
       (missing.length?' '+missing.join(', ')+' are not connected; I can show candidates using the available public-record filters only.':''));return;
   }
   busy=true;const btn=$("agentForm")?.querySelector('button[type="submit"]');if(btn)btn.disabled=true;
   try{
     let state=intent.state||$ ("stateSelect").value;
     if(!["FL","NJ","PA"].includes(state)){putMessage("Currently connected public parcel sources are Florida (connected counties), New Jersey, and Lehigh/Northampton in Pennsylvania (live schema check required). Other counties/states are not connected.");return;}
     const previousState=$("stateSelect").value;$("stateSelect").value=state;
     let county=null;
     if(intent.countyLabel){
       const row=countyEntries(state).find(x=>x.label.toLowerCase()===intent.countyLabel.toLowerCase());
       if(row&&!row.connected){putMessage("The county was recognized but is not connected to a verified parcel service yet. No search was fabricated.");return;}
       county=row?.key;
     }
     if(preserved){applyCounty(state,preserved.county,{center:false});bridge().setCenter(preserved.center.lat,preserved.center.lon);locationKnown=true;}
     else if(county||state!==previousState)applyCounty(state,county,{center:!!county});
     if(county)locationKnown=true;
     if(intent.nearMe){
       const location=await bridge().locateGPS();
       if(!location){putMessage("Device location could not be verified. No nearby parcel scan was run.");return;}
       state=location.state;locationKnown=true;$("stateSelect").value=state;
       applyCounty(state,null,{center:false});
       $("countySelect").value="";activeCounty="";window.PublicRadarCounty="";
       putMessage("GPS centered in "+state+". County has not been independently identified, so this request searches the supported public source within your radius.");
     }
     if(intent.location){
       $("placeInput").value=intent.location+(intent.state&&!new RegExp("\\b"+intent.state+"\\b","i").test(intent.location)?", "+intent.state:"");
       const located=await bridge().findPlace();
       if(located!==true){
         putMessage((bridge().getStatus()?.message||"Location lookup failed")+" No parcel scan was run at a guessed location.");return;
       }
       state=$("stateSelect").value;locationKnown=true;
       const matchCounty=String(bridge().getLastGeocodeCounty?.()||"").trim();
       const recognized=countyEntries(state).find(c=>c.label.toLowerCase()===matchCounty.toLowerCase());
       if(!recognized){
         if(state==="PA"&&matchCounty){putMessage("Pennsylvania county "+matchCounty+" is not connected. Only Lehigh and Northampton parcel adapters are configured. No parcel scan was run.");return;}
         putMessage("The geocoder located the address but did not provide a matching county. Choose the county explicitly to prevent searching the wrong assessment source. No source search was run.");
         return;
       }
       if(!recognized.connected){
         putMessage("The geocoder identified "+recognized.label+" County, but a vetted public source for that county is not yet connected.");
         return;
       }
       applyCounty(state,recognized.key,{center:false});
     }
     $("typeSelect").value=intent.type||"all";
     bridge().setAcreageFilter(intent.acres??0,intent.comparison==="under"?"<":intent.comparison||">=",intent.maxAcres);
     if(intent.radius!=null)bridge().setRadius(intent.radius);
     const previous=bridge().getMeta().time;
     const priceExplanation=intent.pricePsf?` I read $${intent.pricePsf.amount}/SF as ${intent.pricePsf.basis==='closed-sale'?'closed-sale price':intent.pricePsf.basis==='asking-sale'?'asking sale price':intent.pricePsf.basis==='asking-rent'?'asking rent':'an unspecified price or rent'} per building square foot. Asking prices and closed-sale comps are different; neither is verified by this scan.`:'';
     putMessage(`Searching ${intent.type||'all property types'} with ${acreageDescription(intent)}, touching the ${$("radiusSelect").value}-mile search area around ${intent.location||intent.countyLabel||'the selected map location'}. ${intent.sort==='largest'?'Largest first.':'Nearest first.'}`+
       (missing.length?' '+missing.join(', ')+' cannot be verified here. Results are candidates for further research, not confirmed matches to those conditions.':'')+priceExplanation);
     await bridge().scan({unverified:missing});
     if(intent.sort)bridge().sortResults(intent.sort);
     const meta=bridge().getMeta(),rows=bridge().getResults();
     if(!meta.ready||!meta.complete||meta.time===previous){
       const warning=bridge().getStatus?.()?.message||"The parcel service did not finish this search.";
       const failure=putMessage(warning+(rows.length?" These are partial results; more properties may exist.":" Try a smaller radius or retry the search. No zero-property conclusion was made."));
       if(failure){const retry=document.createElement('button');retry.type='button';retry.className='secondary';retry.textContent='Retry this search';retry.addEventListener('click',()=>ask(intent.q));failure.append(document.createElement('br'),retry);}
       if(rows.length)window.RadarChatProperties?.render(rows,meta);
       return;
     }
     putMessage(sourceSummary(rows).sentence+(missing.length?"\nCandidates only: "+missing.join(", ")+" remain unverified.":"")+"\nRetrieved: "+meta.time+
       ". This does not indicate availability, title ownership or an investment recommendation.","bot",bridge().getSources()[meta.state]);
     if(!rows.length&&intent.comparison==='=')putMessage(`No accepted records matched exactly ${intent.acres} acres. Try “about ${intent.acres} acres” for a clearly labeled ±10% size range.`);
     if(intent.questionOwnership)putMessage("For a Florida candidate, open its parcel card and choose Look up published assessment name. New Jersey's connected statewide layer does not supply owner names; its official property-record link is available on the parcel card. Assessment names do not establish legal or beneficial ownership.");
     window.RadarChatProperties?.render(rows,meta);
     if(intent.questionOwnership)await ownerAnswer(intent);
     if(intent.questionOZ)await ozAnswer(intent);

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
   const key=e?.detail?.key,prop=bridge()?.getRecord(key);if(!prop)return;
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
     try{r.start();}catch{speaking=false;button.textContent="🎙 Speak";putMessage("Voice input could not start. Type your property request instead; your existing results were retained.");}
   });
 }
 function init(){
   if(!bridge()||!$("agentForm"))return;
   $("agentForm").addEventListener("submit",e=>{e.preventDefault();ask($("agentPrompt").value);});
   document.querySelectorAll("[data-agent-example]").forEach(b=>b.addEventListener("click",()=>{$("agentPrompt").value=b.dataset.agentExample;ask(b.dataset.agentExample);}));
   $("stateSelect").addEventListener("change",applyNewLocation);
   $("countySelect").addEventListener("change",()=>{
      locationKnown=true;pendingSearch=null;
      const state=$("stateSelect").value;
      if(!$("countySelect").value){activeCounty="";window.PublicRadarCounty="";clearOldResults();return;}
      const row=countyEntries(state).find(c=>c.key===$("countySelect").value);
      if(!row){activeCounty="";window.PublicRadarCounty="";clearOldResults();return;}
      if(!row.connected)return;
      applyCounty(state,row.key,{center:false});activeCounty=row.key;window.PublicRadarCounty=activeCounty;
      bridge().setCenter(row.lat,row.lon,12);clearOldResults();
      bridge().setStatus("Centered on "+row.label+" County. Searches are public-source, bounded by radius and selected county.","info");
   });
   $("market").addEventListener("change",()=>{
     locationKnown=true;pendingSearch=null;
     const id=$("market").value;
     const m={njcentral:["NJ","Middlesex"],njnorth:["NJ","Passaic"],njshore:["NJ","Monmouth"],
       lehigh:["PA","Lehigh"],northampton:["PA","Northampton"],broward:["FL","Broward"],miami:["FL","MiamiDade"],palm:["FL","PalmBeach"],treasure:["FL","Martin"],stlucie:["FL","StLucie"]}[id];
     if(m){applyCounty(m[0],m[1],{center:false});clearOldResults();}
   });
   applyCounty($("stateSelect").value,"Middlesex",{center:false});
   document.addEventListener("radar:center-selected",()=>{locationKnown=true;});
   document.addEventListener("radar:scan-state",e=>{if(e.detail.state==='complete')locationKnown=true;});
   document.addEventListener("radar:location",e=>{
     locationKnown=true;
     const {state,county}=e.detail;
     const row=countyEntries(state).find(c=>c.connected&&c.label.toLowerCase()===String(county||"").toLowerCase());
     applyCounty(state,row?.key,{center:false});
     if(!row){$("countySelect").value="";activeCounty="";window.PublicRadarCounty="";$("market").value="custom";}
   });
   bindVoice();showAssembly();document.addEventListener("radar:parcel-selected",parcelAction);
   document.addEventListener("radar:scan-complete",()=>{assembly.clear();showAssembly();});
 }
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
