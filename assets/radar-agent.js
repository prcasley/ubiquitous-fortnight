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
 // Explicit supported-place vocabulary; unknown places still need a confident geocoder result.
 const towns=[['West Palm Beach','FL'],['Palm Beach County','FL'],['Palm Beach','FL'],['Mangonia Park','FL'],['Edison','NJ'],['Secaucus','NJ'],['Woodbridge','NJ'],['North Bergen','NJ'],['Perth Amboy','NJ'],['Port Newark','NJ'],['Newark','NJ'],['South Plainfield','NJ'],['Piscataway','NJ'],['Parsippany','NJ'],['Riviera Beach','FL'],['Allentown','PA'],['Easton','PA'],['Lehigh Valley','PA'],['Northern New Jersey','NJ'],['Fort Lauderdale','FL'],['Miami','FL'],['Stuart','FL'],['Port St. Lucie','FL']];
 const rx=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 function distance(a,b){const row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let prev=row[0];row[0]=i;for(let j=1;j<=b.length;j++){const old=row[j];row[j]=Math.min(row[j]+1,row[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));prev=old;}}return row[b.length];}
 function language(intent){
   const l=intent.q.toLowerCase(),hits=towns.filter(([name])=>new RegExp('\\b'+rx(name)+'\\b','i').test(l));
   const places=hits.filter(([name])=>!hits.some(([other])=>other!==name&&other.toLowerCase().includes(name.toLowerCase())));
   intent.places=places.map(([name,state])=>({name,state}));
   intent.compare=/\bcompare\b/.test(l)&&places.length>1;
   const radiusOf=intent.q.match(/\bwithin\s+(\d+(?:\.\d+)?)\s+miles?\s+of\s+(.+)$/i);
   if(radiusOf){intent.radius=Number(radiusOf[1]);intent.location=radiusOf[2].trim();}
   if(places.length===1){
     const [name,state]=places[0];intent.state=state;intent.recognizedPlace=name;
     const validLocation=new RegExp('^'+rx(name)+'(?:[,\\s]+(?:NJ|FL|PA|new jersey|florida|pennsylvania))?$','i');
     if(!validLocation.test(intent.location))intent.location=name+', '+state;
     intent.search=true;
     if(name==='Lehigh Valley'){intent.location='Allentown, PA';intent.region='full Lehigh Valley coverage (using an Allentown radius)';}
     if(name==='Northern New Jersey'){intent.location='Parsippany, NJ';intent.region='all of Northern New Jersey (using a Parsippany radius)';}
   }
   intent.address=/^(?:where is|locate|find|show me)\s+(\d+\s+.+)/i.test(intent.q);
   if(intent.address){intent.location=intent.q.replace(/^(?:where is|locate|find|show me)\s+/i,'');intent.search=true;}
   if(/\b(all types|any types)\b/.test(l)){intent.type='all';intent.search=true;}
   if(/\bios\b/.test(l)){intent.type='industrial';intent.ios=true;intent.search=true;}
   const year=l.match(/\b(?:built\s+)?(before|after|newer than|older than)\s+(\d{4})\b/);
   intent.year=year?{op:/before|older/.test(year[1])?'<':'>',value:Number(year[2])}:null;
   if(intent.year)intent.search=true;
   intent.top=Number((l.match(/\btop\s+(\d+)\b/)||[])[1])||null;if(intent.top)intent.sort='largest';
   if(/\b(biggest|largest|sort by acreage|the big one)\b/.test(l))intent.sort='largest';
   intent.forSale=intent.forSale||/\b(?:available|availability|for sale)\b/.test(l);
   intent.unsupported=[];
   if(/\bturnpike\b/.test(l))intent.unsupported.push('Turnpike proximity (no road-distance filter connected)');
   if(/\bbig\b/.test(l)&&!intent.sort&&intent.acres==null)intent.unsupported.push('“big” (give an acreage threshold)');
   if(intent.ios)intent.unsupported.push('industrial outdoor storage suitability (assessment class is not zoning)');
   if(intent.region)intent.unsupported.push(intent.region);
   for(const [pattern,label] of [[/\b(?:zoned|zoning)\b/,'zoning approval'],[/\b(?:power|megawatts?|rail access|fiber|broadband)\b/,'utility or infrastructure capacity/access'],[/\b(?:flood.free|wetlands.free|no wetlands)\b/,'environmental clearance']])if(pattern.test(l))intent.unsupported.push(label);
   let corrected=l,changed=false;
   const types=['industrial','warehouse','warehouses','multifamily','vacant'];
   corrected=corrected.replace(/\b[a-z]{5,}\b/g,word=>{const match=types.find(t=>distance(word,t)===1);if(match&&!types.includes(word)){changed=true;return match;}return word;});
   if(!places.length){const candidates=towns.filter(([,state])=>!intent.state||state===intent.state);corrected=corrected.replace(/\b[a-z]{5,}\b/g,word=>{const match=candidates.find(([name])=>!name.includes(' ')&&distance(word,name.toLowerCase())===1);if(match&&!candidates.some(([name])=>name.toLowerCase()===word)){changed=true;return match[0].toLowerCase();}return word;});}
   if(!places.length){
     const words=[...corrected.matchAll(/[a-z]+/g)],suggestions=[];
     for(const [name,state] of towns.filter(([name,state])=>name.includes(' ')&&(!intent.state||state===intent.state))){const count=name.split(' ').length;for(let n=0;n+count<=words.length;n++){const part=words.slice(n,n+count).map(x=>x[0]).join(' ');if(distance(part,name.toLowerCase())===1)suggestions.push({name,start:words[n].index,end:words[n+count-1].index+words[n+count-1][0].length,count});}}
     suggestions.sort((a,b)=>b.count-a.count);if(suggestions.length&&(!suggestions[1]||suggestions[0].count>suggestions[1].count||suggestions[0].name===suggestions[1].name)){const s=suggestions[0];corrected=corrected.slice(0,s.start)+s.name.toLowerCase()+corrected.slice(s.end);changed=true;}
   }
   if(changed)intent.suggestion=corrected;
   if(intent.compare)intent.search=false;
   return intent;
 }

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
     let candidate=q.slice(0,stateToken.index).replace(/\b(?:\d+(?:\.\d+)?)[\s-]*(?:acres?|ac\b)\b/gi,' ').replace(/\b(?:a|an|some|find|show|me|the|any|nearest|largest|industrial|warehouses?|parcels?|properties|property|land|vacant|multifamily|apartments?|over|under|at|least|most|exactly|about|with|in|near|only)\b/gi,' ').replace(/[,\s]+/g,' ').trim();
     if(!candidate)candidate=q.slice(stateToken.index+stateToken[0].length).replace(/\b\d+(?:\.\d+)?\s*\+?\s*(?:acres?|ac\b)\b/gi,' ').replace(/\b(?:a|an|some|industrial|warehouses?|parcels?|properties|land|vacant|multifamily|apartments?|over|under|at|least|most|exactly|with|only)\b/gi,' ').trim();
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
   return language({q,budget,invalidReason:range&&Number(range[1])>Number(range[2])?"Enter a size range with the smaller acreage first.":!range&&/(?:^|[\s(])-\s*\d+(?:\.\d+)?\s*(?:acres?|ac\b|miles?)/i.test(q)?"Acreage and radius cannot be negative.":null,search:!!(search||shorthand||location&&type),refine:/^(?:show\s+(?:me\s+)?only|only|just|actually|make (?:it|that)|how about|what about|instead|change (?:it|that) to)\b/i.test(q),nearMe:/\b(near me|around me|my location)\b/.test(l),type,acres,maxAcres,comparison,acreageMeaning,
     radius:radius?Number(radius[1]):null,state:stateFrom(q),countyLabel:countyLabel||null,location,
     sort:/\b(biggest|largest|most acreage)\b/.test(l)?'largest':/\b(nearest|closest)\b/.test(l)?'nearest':null,
     questionOwnership:/\b(owners?|ownership|who owns|owned by|title holder)\b/.test(l),
     questionLease:/\b(leases?|tenants?|rent|expiration|expiring|expires|renewal|renewals|renewing|renew)\b/.test(l),
     forSale,comps,pricePsf,
     questionOZ:/\b(opportunity zone|oz ?1|oz ?2|oz ?2027)\b/.test(l),
     questionDeadline:/\b(?:before|by|close|closing|acquir|deadline)\b.*\b(?:jan(?:uary)?|dec(?:ember)?|year.end|1st|31st)\b/i.test(q),
     questionSource:/\b(source|accuracy|verified|reliable|coverage|provenance)\b/.test(l)});
 }
 function missingCriteria(intent){
   const missing=[...(intent.unsupported||[])];
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
 window.PublicRadarAgent={parseIntent,getCounty:()=>activeCounty,ask:(...args)=>ask(...args),getHistory:()=>history.map(x=>x.search)};
 function putMessage(message,role="bot",sourceURL){
   const host=$("agentLog");if(!host)return;
   const box=document.createElement("div");box.className="agent-message "+role;box.textContent=message;if(role==="bot")lastReply=String(message);
   if(sourceURL&&/^https:\/\/(?:services\d*\.arcgis\.com|gis\.lehighcounty\.org|gis\.northamptoncounty\.org|www\.nj\.gov|nj\.gov|www\.irs\.gov|irs\.gov)\//.test(sourceURL)){
     const details=document.createElement("details"),label=document.createElement("summary"),a=document.createElement("a");label.textContent="Data source";a.href=sourceURL;a.target="_blank";a.rel="noopener noreferrer";a.textContent="Official data layer (technical source)";details.append(label,a);box.append(details);
   }
   host.dataset.scrollAnchor='';host.append(box);host.scrollTop=host.scrollHeight;
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
   if(!meta.complete&&!(meta.status==='partial'&&rows.length))return "Tell me a town and the acreage you need, such as industrial over 5 acres in Edison, NJ. Type help for examples.";
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
     const byKey=new Map(result.observations.map(o=>[o.key,o]));for(const row of rows){row.ozObservation=byKey.get(row.key);row.ozObservations={...(row.ozObservations||{}),[kind]:row.ozObservation};}
     const hits=rows.filter(r=>r.ozObservation.status!=='no-reference-intersection');
     putMessage(hits.length+' of '+rows.length+' checked parcels intersect '+result.sourceName+'. '+(rows.length-hits.length)+' had no matching polygon returned in this reference check; that is not a finding of ineligibility. '+(!meta.complete?'The parcel search itself is partial; more parcels may exist. ':'')+'Checked '+result.checkedAt+'. Final designation, full parcel inclusion and tax qualification remain unverified. '+(hits.length?'Showing the intersecting candidates below; your full search remains in the sidebar.':''));
     window.RadarChatProperties?.render(hits.length?hits:rows.slice(0,6),meta);
   }catch(error){putMessage('Parcel OZ reference check unavailable: '+error.message+'. No properties were labeled qualified or ineligible; your shortlist was retained.');}
 }
 const history=[];let lastReply='',voiceTimer=null;
 const examples=['Industrial over 5 acres in Edison NJ','Industrial over 10 acres in West Palm Beach FL','Industrial between 4 and 10 acres in Perth Amboy NJ','Multifamily over 3 acres in Edison NJ'];
 function chips(message,choices){const row=putMessage(message);for(const [label,query] of choices){const b=document.createElement('button');b.type='button';b.className='secondary chat-chip';b.textContent=label;b.addEventListener('click',()=>{b.disabled=true;ask(query);});row.append(b);}return row;}
 function clarify(){
   const reply=lastReply,query=bridge().getSearch(),count=bridge().getResults().length;
   if(reply.includes('OZ')||reply.includes('reference intersection'))return 'In plain English: a colored OZ reference match is a research lead. It does not confirm final designation or that a property qualifies for a tax benefit. '+(count?count+' accepted parcels remain in your current search.':'Search for a property first to check a specific parcel.');
   if(/published assessment (?:name|entity)/i.test(reply))return 'In plain English: that is the name printed in an assessor record, not proof of the current legal owner or who controls an LLC. Verify the deed and official records before acting.';
   if(reply.startsWith('Exported'))return 'In plain English: the downloaded CSV contains your accepted public parcel records, published construction years, source links and retrieval dates. It excludes private notes, contacts and owner inferences. Missing-year records are not year-filter matches.';
   if(reply.startsWith("I couldn't apply:"))return 'In plain English: '+reply.slice("I couldn't apply:".length).trim()+' did not filter the results. The visible parcels are candidates under the other filters, so check that condition separately.';
   if(reply.startsWith('Text enlarged'))return 'In plain English: I made the on-screen text larger. A− makes it smaller and A+ makes it larger again.';
   if(query){const size={acres:query.acreage.value,comparison:query.acreage.op,maxAcres:query.acreage.max};return 'In plain English: '+count+' accepted '+query.type+' assessor parcels match '+acreageDescription(size)+' in the '+query.radius+'-mile search area in '+query.state+(query.year?', using published construction years '+(query.year.op==='<'?'before ':'after ')+query.year.value:'')+'. '+(/Largest|largest/.test(reply)?'The largest card uses reported acreage within these retrieved results. ':'')+'They may not be for sale. '+(bridge().getMeta().complete?'The source retrieval finished; missing facts still need official verification.':'The scan did not retrieve everything, so more parcels may exist.');}
   return 'In plain English: tell me a town and the acreage you need. Radar searches public assessor records; it cannot confirm that a property is for sale or infer facts missing from those records.';
 }

 function exportPublicResults(){
   const meta=bridge().getMeta(),rows=bridge().getResults().map(r=>({parcel_id:r.id,state:r.state,address:r.address,assessment_class:r.type,reported_acres:r.acres,published_year_built:r.yearBuilt,source_url:r.source.url,retrieved_at:meta.time,scan_status:meta.status,caveat:'Public assessment research only; availability, title and zoning unverified'}));
   const csv=window.RadarResearchToolsCore.csv(rows,Object.keys(rows[0])),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='capital-radar-public-results.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 function boardSummary(){
   const rows=bridge().getResults(),meta=bridge().getMeta();if(!rows.length){chips('Search a town first, then I can prepare a board summary from its public records.',examples.map(x=>[x,x]));return;}
   const sized=rows.filter(r=>r.acres!=null).sort((a,b)=>b.acres-a.acres),largest=sized[0];
   const shares=['oz1','oz2'].map(kind=>{const observation=r=>r.ozObservations?.[kind]||(r.ozObservation?.kind===kind?r.ozObservation:null),checked=rows.filter(r=>observation(r)),hits=checked.filter(r=>observation(r).status!=='no-reference-intersection');return kind.toUpperCase()+': '+(checked.length?hits.length+'/'+checked.length+' checked reference intersections':'not checked');}).join(' · ');
   const card=putMessage(rows.length+' accepted parcels'+(meta.complete?'':' (partial search)')+' · Acreage range: '+(sized.length?sized.at(-1).acres.toFixed(2)+'–'+largest.acres.toFixed(2)+' ac':'not published')+'.\nLargest site: '+(largest?(largest.address||largest.id)+' · '+largest.acres.toFixed(2)+' ac':'acreage not published')+'.\n'+shares+'.\nSource: '+meta.source+' · Retrieved '+meta.time+'.\nCaveat: '+(!meta.complete?'More parcels may exist; ':'')+'assessment class is not zoning, reference intersections are not OZ qualification; availability and title are unverified.');card.classList.add('board-summary');const host=$('agentLog');host.dataset.scrollAnchor='board';host.scrollTop=card.offsetTop-host.offsetTop;
 }
 function unknownYears(meta){const unknown=bridge().getYearUnknown?.()||[];if(!unknown.length)return;putMessage("I couldn't apply: year-built filter to "+unknown.length+' parcels (year not published).');const row=putMessage(unknown.length+' parcels: year not published — excluded from year-filter matches; listed separately below.');row.classList.add('year-not-published');window.RadarChatProperties?.render(unknown,{...meta,yearUnknown:true});}

 async function ask(raw,options={}){
   let intent=options.intent?{...options.intent}:parseIntent(raw);if(!intent.q)return;
   if(busy){putMessage("A public-source search is already in progress. Finish it before submitting another request.");return;}
   if(voiceTimer){clearTimeout(voiceTimer);voiceTimer=null;document.getElementById('voicePreview')?.remove();}
   if(/^(help|what can you do|how do I find land)[?!.]*$/i.test(intent.q)){putMessage(raw,'user');chips('Try one of these public-data searches. You can change the town, acreage or property type.',examples.map(x=>[x,x]));return;}
   if(/(?:print|text|font).*(?:bigger|larger)|make.*(?:print|text).*big/i.test(intent.q)){window.RadarReadability?.change(1);putMessage('Text enlarged. Use A− / A+ at the top to adjust it again.');return;}
   if(/^go back[.!]?$/i.test(intent.q)){if(history.length<2){putMessage('There is no earlier search in this tab yet. Your current criteria are unchanged.');return;}history.pop();const prior=history.at(-1);return ask(prior.intent.q,{intent:prior.intent,restore:prior.search,replay:true});}
   if(/^what does that mean[?!.]?$/i.test(intent.q)){putMessage(clarify());return;}
   if(/summariz[e].*(?:board)|board summary/i.test(intent.q)){boardSummary();return;}
   if(/^export (?:these|results|this)[.!]?$/i.test(intent.q)){if(!bridge().getResults().length){putMessage('Search a town first, then export its accepted public parcel records.');return;}exportPublicResults();putMessage('Exported the accepted public parcel records with source and retrieval dates. Year-not-published records are separate from year-filter matches.');return;}
   if(intent.suggestion){const candidate=parseIntent(intent.suggestion),label=(candidate.type||'industrial')+' in '+(candidate.recognizedPlace?candidate.recognizedPlace+', '+candidate.state:candidate.location);chips('Did you mean '+label+'?', [['Yes — '+label,intent.suggestion]]);return;}
   if(intent.compare){chips("I couldn't apply: a simultaneous comparison of two markets. Choose a town to run a separate, source-dated search; cross-market ranking would require comparable coverage.",intent.places.map(p=>[p.name,'industrial in '+p.name+', '+p.state]));return;}
   if(/\b(?:the big one|biggest|largest)\b/i.test(intent.q)&&!intent.location&&!intent.state&&!intent.acres&&!intent.type&&!intent.questionOwnership&&!intent.questionOZ){const rows=bridge().getResults().filter(r=>r.acres!=null).sort((a,b)=>b.acres-a.acres);if(!rows.length){putMessage('Search a town first so I can open the largest accepted parcel.');return;}bridge().sortResults('largest');bridge().choose(rows[0].key);putMessage('Largest accepted parcel: '+(rows[0].address||rows[0].id)+' · '+rows[0].acres+' acres. This ranks retrieved records only.'+(bridge().getMeta().complete?'':' Partial retrieval: more parcels may exist; this is not a market-wide ranking.'));window.RadarChatProperties?.render([rows[0]],bridge().getMeta());return;}
   if(pendingSearch&&intent.recognizedPlace&&!intent.type&&intent.acres==null&&intent.radius==null&&!intent.year&&!intent.questionOwnership&&!intent.questionOZ){intent={...pendingSearch,location:intent.location,state:intent.state,recognizedPlace:intent.recognizedPlace};pendingSearch=null;}
   let preserved=options.restore||null;
   const previousSearch=bridge()?.getSearch();
   if(previousSearch&&(intent.questionOwnership||intent.questionOZ)&&!intent.location&&!intent.nearMe&&intent.acres==null&&intent.type==null&&intent.radius==null)intent.search=false;
   if(!options.restore&&previousSearch&&!intent.location&&!intent.nearMe&&(!intent.state||intent.state===previousSearch.state)&&(intent.acres!=null||intent.type||intent.radius!=null||intent.year)){
     preserved={...previousSearch,unverified:bridge().getMeta().unverified||[]};
     intent={...intent,year:intent.year||previousSearch.year,search:true,state:previousSearch.state,type:intent.type||previousSearch.type,acres:intent.acres??previousSearch.acreage.value,
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
   const defaultType=!intent.type;
   if(defaultType){intent.type='industrial';putMessage("Showing industrial — say 'all types' to widen.");}
   if(options.restore){intent.location='';intent.state=options.restore.state;}
   clearOldResults();
   const missing=[...new Set([...(preserved?.unverified||[]),...missingCriteria(intent)])];
   if(missing.length)putMessage("I couldn't apply: "+missing.join('; ')+'.');
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
       $("placeInput").value=intent.location+(!stateFrom(intent.location)&&intent.state?", "+intent.state:"");
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
     if(intent.address){
       const point=bridge().getSearchCenter();const record=await window.PublicRadarGeo.identifyAt(point.lat,point.lon);
       if(record){putMessage('Address geocoded; a public parcel was identified at that map point. Verify the parcel address and geometry below; geocoding is not title verification.');window.RadarChatProperties?.render([record],{...bridge().getMeta(),time:record.retrievedAt,source:record.source.name,sourceURL:record.source.url,complete:true});}
       else putMessage('The address was geocoded, but no unique public parcel could be verified at that point. No parcel identity was guessed.');return;
     }
     $("typeSelect").value=intent.type||"industrial";
     bridge().setAcreageFilter(intent.acres??0,intent.comparison==="under"?"<":intent.comparison||">=",intent.maxAcres);
     bridge().setRadius(intent.radius??preserved?.radius??5);
     const previous=bridge().getMeta().time;
     const priceExplanation=intent.pricePsf?` I read $${intent.pricePsf.amount}/SF as ${intent.pricePsf.basis==='closed-sale'?'closed-sale price':intent.pricePsf.basis==='asking-sale'?'asking sale price':intent.pricePsf.basis==='asking-rent'?'asking rent':'an unspecified price or rent'} per building square foot. Asking prices and closed-sale comps are different; neither is verified by this scan.`:'';
     putMessage(`Searching ${intent.type||'all property types'} with ${acreageDescription(intent)}, touching the ${$("radiusSelect").value}-mile search area around ${intent.location||intent.countyLabel||'the selected map location'}. ${intent.sort==='largest'?'Largest first.':'Nearest first.'}`+
       (missing.length?' '+missing.join(', ')+' cannot be verified here. Results are candidates for further research, not confirmed matches to those conditions.':'')+priceExplanation);
     await bridge().scan({unverified:missing,year:intent.year});
     if(intent.sort)bridge().sortResults(intent.sort);
     const meta=bridge().getMeta(),rows=bridge().getResults();
     if(meta.time&&!options.replay){history.push({intent:{...intent},search:bridge().getSearch()});if(history.length>20)history.shift();}
     if(intent.year)putMessage('Applied published year built '+(intent.year.op==='<'?'before ':'after ')+intent.year.value+'. Missing years are listed separately and do not count as matches.');
     if(!meta.ready||!meta.complete||meta.time===previous){
       const warning=bridge().getStatus?.()?.message||"The parcel service did not finish this search.";
       const failure=putMessage(warning+(rows.length?" These are partial results; more properties may exist.":" Try a smaller radius or retry the search. No zero-property conclusion was made."));
       if(failure){const retry=document.createElement('button');retry.type='button';retry.className='secondary';retry.textContent='Retry this search';retry.addEventListener('click',()=>ask(intent.q));failure.append(document.createElement('br'),retry);}
       if(rows.length)window.RadarChatProperties?.render(intent.top?rows.slice(0,intent.top):rows,meta);unknownYears(meta);
       return;
     }
     putMessage(sourceSummary(rows).sentence+"\nRetrieved: "+meta.time+
       ".","bot",bridge().getSources()[meta.state]);
     if(!rows.length&&intent.comparison==='=')putMessage(`No accepted records matched exactly ${intent.acres} acres. Try “about ${intent.acres} acres” for a clearly labeled ±10% size range.`);
     if(intent.questionOwnership)putMessage("For a Florida candidate, open its parcel card and choose Look up published assessment name. New Jersey's connected statewide layer does not supply owner names; its official property-record link is available on the parcel card. Assessment names do not establish legal or beneficial ownership.");
     window.RadarChatProperties?.render(intent.top?rows.slice(0,intent.top):rows,meta);unknownYears(meta);
     putMessage("Research only: these records do not establish availability, title ownership, zoning approval, surveyed boundaries or an investment recommendation."+(missing.length?" Requested conditions remain unverified: "+missing.join(", ")+".":""));
     if(intent.top)putMessage("Showing the first "+Math.min(intent.top,rows.length)+" accepted records; "+rows.length+" retrieved in this search. "+(intent.sort?"Ranked by acreage within retrieved records only.":"Nearest first."));
     if(intent.questionOwnership)await ownerAnswer(intent);
     if(intent.questionOZ)await ozAnswer(intent);
     if(!intent.questionOwnership&&!intent.questionOZ){const host=$('agentLog'),cards=[...host.querySelectorAll('.chat-properties')].find(n=>n.dataset.scan===String(meta.scanId));if(cards)host.scrollTop=cards.offsetTop-host.offsetTop;}

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
   const key='capital-radar-voice-consent-v1';let consent=null;
   try{consent=localStorage.getItem(key);}catch{/* Storage is optional; consent lasts in this tab. */}
   const remember=value=>{consent=value;try{localStorage.setItem(key,value);}catch{}};
   function cancelPreview(){if(voiceTimer){clearTimeout(voiceTimer);voiceTimer=null;}document.getElementById('voicePreview')?.remove();}
   $('agentPrompt').addEventListener('input',cancelPreview);
   function start(){
     if(speaking||busy)return;cancelPreview();
     const r=new Recognition();r.lang='en-US';r.interimResults=false;r.maxAlternatives=1;speaking=true;button.textContent='Listening…';
     r.onresult=e=>{
       const result=e.results?.[e.resultIndex||0];if(!result||result.isFinal===false)return;
       const transcript=clean(result[0]?.transcript);if(!transcript)return;
       $('agentPrompt').value=transcript;cancelPreview();
       const preview=document.createElement('button');preview.id='voicePreview';preview.className='secondary';preview.type='button';preview.textContent='Searching for: '+transcript+' (tap to edit)';
       preview.addEventListener('click',()=>{cancelPreview();$('agentPrompt').focus();});$('agentForm').after(preview);
       voiceTimer=setTimeout(()=>{voiceTimer=null;preview.remove();ask(transcript);},2000);
     };
     r.onerror=()=>{cancelPreview();putMessage('Microphone transcription failed. You can type your request instead.');};
     r.onend=()=>{speaking=false;button.textContent='🎙 Speak';};
     try{r.start();}catch{speaking=false;button.textContent='🎙 Speak';putMessage('Voice input could not start. Type your property request instead; your existing results were retained.');}
   }
   button.addEventListener('click',()=>{
     if(speaking||busy)return;if(consent==='allow'){start();return;}
     if($('voiceConsent'))return;
     const note=document.createElement('div');note.id='voiceConsent';note.className='assistant-status';note.setAttribute('role','note');
     note.textContent='Voice uses your browser or device speech service, which may process audio remotely. Allow voice input on this device? ';
     for(const [label,value] of [['Allow voice','allow'],['Use typing','decline']]){const b=document.createElement('button');b.type='button';b.className='secondary';b.textContent=label;b.addEventListener('click',()=>{remember(value);note.remove();if(value==='allow')start();else $('agentPrompt').focus();});note.append(b);}
     $('agentForm').after(note);
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
