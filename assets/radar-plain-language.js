/* Plain-language front door for the Radar chat.
   Brokers, executives and non-technical users type the way they talk: "10 acre", "50k sf",
   zip codes, highway exits, parcel IDs, pasted emails and vague follow-ups. This layer turns
   that into a request the existing parser understands, or answers honestly when Radar cannot
   do what was asked. It never invents data: every rewrite is shown back to the user, and
   unknown questions get "I can't answer that" instead of an unrelated list. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadarPlainLanguage=api;})(globalThis,root=>{
 'use strict';
 const STREET=/(?<![\d.])\b(\d{1,6}(?:-\d{1,6})?[A-Za-z]?\s+(?:(?!(?:at|ac|acres?|in|near|for|of|and|the|on|by|around|sf|sq)\b)[A-Za-z0-9][A-Za-z0-9.'’-]*\s+){0,6}?(?:st|street|ave|avenue|rd|road|blvd|boulevard|hwy|highway|dr|drive|ln|lane|ct|court|way|pkwy|parkway|plaza|plz|place|pl|loop|trail|trl|terrace|ter|circle|cir|tpke|turnpike)\b\.?)/i;
 const STATE='(?:NJ|FL|PA|N\\.J\\.|New Jersey|Florida|Pennsylvania)';
 const STATE_CODE={'nj':'NJ','n.j.':'NJ','new jersey':'NJ','fl':'FL','florida':'FL','pa':'PA','pennsylvania':'PA'};
 // County names that are NOT also a commonly searched municipality, so "Monmouth" alone means the county.
 const COUNTIES={monmouth:'NJ',bergen:'NJ',hudson:'NJ',essex:'NJ',hunterdon:'NJ',mercer:'NJ',atlantic:'NJ',cumberland:'NJ',broward:'FL','miami-dade':'FL',lehigh:'PA'};
 const COMPARATOR=/(?:\b(?:with|of|over|above|more than|greater than|at least|minimum(?: of)?|min|no less than|under|less than|below|at most|no more than|up to|max(?:imum)?(?: of)?|exactly|about|around|approx(?:imately)?\.?|roughly|between|and|to)|[-–~+]|\d)\s*$/i;
 const COMMAND=/\b(find|show|scan|search|look(?:ing)? for|locate|need|want|get me)\b/i;
 const TYPE_WORD=/\b(industrial|warehouses?|warehousing|distribution|manufacturing|factor(?:y|ies)|multifamily|multi.family|apartments?|vacant|undeveloped|all types|any types)\b/i;
 const money=v=>Number.isFinite(Number(v))&&Number(v)>0?'$'+Math.round(Number(v)).toLocaleString('en-US'):null;
 const tidy=s=>s.replace(/\s+/g,' ').replace(/\s+([,.;!?])/g,'$1').replace(/^[,\s]+|[,\s]+$/g,'').trim();

 function extractAddress(text){
  const m=text.match(new RegExp(STREET.source+'(?:[,\\s]+([A-Za-z][A-Za-z .\'’-]{1,40}))?(?:[,\\s]+('+STATE+'))?(?:[,\\s]+(\\d{5}))?','i'));
  if(!m)return null;
  let city=(m[2]||'').trim(),stateText=m[3]||null;
  // Stop the city at sentence words ("West Palm Beach he would sell" -> "West Palm Beach").
  city=city.split(/\s+(?:he|she|they|we|i|it|and|is|was|has|have|would|will|for|at|with|which|that|the|near|in)\b/i)[0].trim();
  const tail=city.match(new RegExp('^(.*?)[,\\s]+('+STATE+')$','i'));if(tail){city=tail[1].trim();stateText=stateText||tail[2];}
  if(new RegExp('^'+STATE+'$','i').test(city)){stateText=stateText||city;city='';}
  const state=stateText?STATE_CODE[stateText.toLowerCase()]||stateText.toUpperCase():null;
  return {street:m[1].replace(/\.$/,'').trim(),city:city||null,state,zip:m[4]||null,text:[m[1].replace(/\.$/,'').trim(),city,[state,m[4]].filter(Boolean).join(' ')].filter(Boolean).join(', ')};
 }

 /* Pure rewrite. Returns {text, notes, needs, answer, intent}.
    needs: async lookups that resolve() performs (zip, coords, pcn, blockLot). */
 function normalize(raw,context={}){
  let text=tidy(String(raw??'').replace(/[‘’]/g,"'").replace(/[“”]/g,'"'));
  const notes=[],needs={},out={text,notes,needs,answer:null,changed:false};
  if(!text)return out;
  const hasResults=!!context.hasResults;

  // 1. Pasted broker email or long message: pull out the property address.
  const sentences=text.split(/[.!?]\s+/).filter(s=>s.trim().length>3).length;
  if(text.length>160&&sentences>=2){
   const a=extractAddress(text);
   if(a){
    const acres=text.match(/(\d+(?:\.\d+)?)\s*(?:ac\b|acres?)/i),price=text.match(/\$\s?(\d+(?:\.\d+)?)\s*(m|mm|million|k|thousand)?\b/i);
    out.text='Show me '+a.text;out.changed=true;
    notes.push('I pulled the property address out of your message: '+a.text+'.'+(acres?' The message mentions '+acres[1]+' acres':'')+(price?(acres?' and a price of ':' The message mentions a price of ')+price[0].replace(/\s+/g,''):'')+(acres||price?'; I show the published parcel facts so you can compare.':'')+' Zoning changes, seller intent and approval timelines in the message cannot be confirmed from public records; ask the seller for the recorded documents.');
    return out;
   }
  }

  // 2. Google Maps links.
  const maps=text.match(/https?:\/\/(?:www\.)?(?:google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|goo\.gl\/maps|maps\.app\.goo\.gl)\S*/i);
  if(maps){
   const url=maps[0];let place=null,coords=null;
   const p=url.match(/\/maps\/(?:place|search)\/([^/@?]+)/i);if(p)place=decodeURIComponent(p[1].replace(/\+/g,' '));
   const q=url.match(/[?&](?:q|query)=([^&]+)/i);if(!place&&q)place=decodeURIComponent(q[1].replace(/\+/g,' '));
   const at=url.match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/)||(place||'').match(/^\s*(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*$/);
   if(place&&!/^\s*-?\d{1,2}\.\d+\s*,/.test(place)){out.text=tidy(text.replace(url,'').trim()?text.replace(url,'near '+place):'Show me '+place);out.changed=true;notes.push('I read the Google Maps link as '+place+'.');return out;}
   if(at)coords=[Number(at[1]),Number(at[2])];
   if(coords){needs.coords=coords;out.rest=tidy(text.replace(url,''));return out;}
   out.answer='I could not read a place from that Google Maps link (short share links hide the address). Paste the street address instead, for example "7777 Southern Blvd, West Palm Beach FL".';return out;
  }

  // 3. Coordinates.
  const ll=text.match(/(?:^|\s)(-?\d{1,3}\.\d{2,})\s*,\s*(-?\d{1,3}\.\d{2,})(?=\s|$)/);
  if(ll){needs.coords=[Number(ll[1]),Number(ll[2])];out.rest=tidy(text.replace(ll[0],' '));return out;}

  // 4. Parcel identifiers.
  const pcn=text.match(/\b(?:PCN|parcel(?: control)?(?: number| no\.?| #)?)?\s*(\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-\d{3}-\d{4})\b/i)||text.match(/\bPCN\s*#?\s*(\d{17})\b/i);
  if(pcn){needs.pcn=pcn[1].replace(/-/g,'');return out;}
  const bl=text.match(/\bblock\s*#?\s*([\w.]+)\s*,?\s*(?:and\s+)?lot\s*#?\s*([\w.]+)\b(?:\s*,?\s*(?:in|of)?\s*([A-Za-z][A-Za-z .'-]*?))?(?:\s*,?\s*(?:NJ|N\.J\.|New Jersey))?\s*$/i);
  if(bl){needs.blockLot={block:bl[1],lot:bl[2],town:tidy(bl[3]||'').replace(/\b(?:twp|township|boro|borough|city|town)\b\.?/ig,'').trim()||null};if(!needs.blockLot.town){delete needs.blockLot;out.answer='Which town is Block '+bl[1]+' Lot '+bl[2]+' in? Block and lot numbers repeat in every New Jersey municipality, for example "Block 12 Lot 3 Edison NJ".';}return out;}

  // 5. Follow-up questions about the current results (only when results exist and no new search is described).
  const looksLikeNewSearch=TYPE_WORD.test(text)||/\b(in|near|around)\s+[A-Z]/.test(text)||STREET.test(text)||/\b\d{5}\b/.test(text);
  if(hasResults&&!looksLikeNewSearch){
   const l=text.toLowerCase();
   if(/^(start over|start again|begin again|reset|clear(?: (?:it|this|everything|all|results|the results|the map))?|new search)[.!]?$/i.test(text)){out.intent='reset';out.answer='Cleared. What would you like to find? For example: industrial over 5 acres in Edison NJ, or a street address.';return out;}
   if(/\b(phone|number|cell|email|e-mail|contact|call|reach|get (?:a )?hold of|broker|agent)\b/.test(l)&&!/\bparcel number\b/.test(l)){out.intent='contact';out.answer="Radar doesn't have owner phone numbers or emails; public parcel records don't include them. Open a property and choose Look up published owner to get the assessment name, then use the county tax/deed records or the state business registry to research a contact. Nothing is looked up or guessed automatically.";return out;}
   if(/\b(worth|value|valued|appraise[sd]?|assess(?:ed|ment)?|what(?:'s| is) it (?:going )?for|price|cost|how much)\b/.test(l)&&!/\bper\s*(?:sf|square)/.test(l)&&!/\bcomps?\b/.test(l)){out.intent='value';return out;}
   if(/\b(q\.?\s?o\.?\s?z\.?|opp(?:ortunity)?\.?\s*zones?|tax[- ]?(?:break|benefit|incentive|credit|advantage|zone)s?|oz(?:\s*2(?:\.0)?)?(?:\s*status)?|oz2)\b/.test(l)&&!/\b(close|closing|before|deadline|when|timeline|qualif(?:y|ies|ication)|designat|certif|lease|own)/.test(l)&&!/\b(first|second|third|last|this one|that one|the one|it|#\d)\b/.test(l)&&!(/\b(opportunity zones?|oz\s?[12](?:\.0)?)\b/.test(l)&&/\b(which|are|is|show)\b/.test(l)&&!/\bmap\b/.test(l))){out.text=/\boz\s*1\b|\b2018\b/.test(l)?'Which of these are in OZ 1?':'Which of these are in an opportunity zone?';out.changed=true;out.followUp=true;return out;}
   if(/\b(plain english|explain|what does (?:that|this|it) mean|i don'?t (?:understand|get it|follow)|confus|simpler|in english|layman)\b/.test(l)){out.text='what does that mean';out.changed=true;out.followUp=true;return out;}
   if(/\b(bigger|larger)\b/.test(l)&&!/\d/.test(l)){out.text='Show the largest properties in this scan';out.changed=true;out.followUp=true;notes.push('Showing the largest first. To require a minimum size, say for example "over 20 acres".');return out;}
   if(/\b(smaller)\b/.test(l)&&!/\d/.test(l)){out.answer='Tell me the size limit you want, for example "under 5 acres", and I will narrow these results.';return out;}
   if(/\b(highway|hwy|turnpike|parkway|interstate|i-?\s?\d{2,3}|route|rt\.?\s?\d+|exit|ramp|rail|port|airport)\b/.test(l)&&/\b(near|close|by|next to|access|off|only|within)\b/.test(l)){out.answer="Distance to highways, rail or ports isn't a search filter yet. Open a property and choose Check site facts to see the nearest named highway and road notes for that parcel. Your current results are unchanged.";return out;}
   if(/\b(it|that one|this one|that|this|the first one|first one|the one)\b/.test(l)&&/\b(own|owner|owns|owned)\b/.test(l)){out.intent='owner-referent';return out;}
  }

  // Places outside the connected states: say so instead of quietly switching states.
  if(/\b(NY|N\.Y\.|New York|CT|Connecticut|DE|Delaware|MD|Maryland)\b/.test(text)&&!/\bnew york (?:ave|avenue)\b/i.test(text))notes.push('Radar covers New Jersey, Florida and two Pennsylvania counties. If you meant a place in another state, it is not connected; check that the results below are where you intended.');

  // 6. Statewide-only requests.
  if(/\b(?:in|across|throughout|anywhere in|all of)\s+(?:the state of\s+)?(new jersey|n\.?j\.?|florida|fl|pennsylvania|pa)[.!?]?\s*$/i.test(text)&&(TYPE_WORD.test(text)||/\b(acres?|sf|sq|square|storage|land|dirt|sites?|parcels?|properties|warehouse|terminal|ios|flex)\b/i.test(text))&&!/\b(who|own|owner|lease|sale|sold|comps?|price)\b/i.test(text)&&!/\b(county|[A-Z][a-z]+,\s*(?:NJ|FL|PA))\b/.test(text)&&!STREET.test(text)){
   out.answer='Statewide searches are not available; they would return tens of thousands of parcels. Name a town, county or address, for example "industrial over 10 acres in Middlesex County NJ" or "industrial near Exit 8A on the NJ Turnpike".';return out;
  }

  // 7. Building size (not in public parcel data).
  const sf=/(?:\b(?:around|about|approx(?:imately)?\.?|roughly|over|under|at least|minimum of|a|an|of)\s+)*(?:\d[\d,]*(?:\.\d+)?\s*(?:k|K|thousand|m|mm|million)?)\s*(?:sf|s\.f\.|sq\.?\s*ft\.?|sqft|square\s*f(?:ee|oo)t|feet)\b(?:\s+(?:building|warehouse|box|facility))?/i;
  if(sf.test(text)){
   const phrase=text.match(sf)[0].trim();text=tidy(text.replace(sf,' '));out.changed=true;
   if(!TYPE_WORD.test(text)&&!/\b(truck|ios|storage|flex|logistics|distribution|land|dirt|lot)\b/i.test(text))text='industrial '+(/\b(in|near|around|at|within)\b/i.test(text)?text:'in '+text);
   notes.push('Public parcel records do not include building size, so I cannot filter by square footage ("'+phrase+'"). I searched by land and property type instead; open a property to see published building details where available.');
  }

  // 8. Property-type synonyms used in the field.
  if(!TYPE_WORD.test(text)){
   if(/\b(truck (?:terminal|parking|yard)s?|trucking|ios|outdoor storage|laydown(?: yard)?|contractor(?:'s)? yards?|storage yards?|cold storage|freezer|refrigerated|flex(?: space)?|logistics|distribution center|fulfillment|industrial park|last.mile)\b/i.test(text)){text='industrial '+text;out.changed=true;}
   else if(/\b(dirt|raw land|land sites?|buildable land|development land)\b/i.test(text)){text='vacant '+text;out.changed=true;notes.push('I read "'+text.match(/\b(dirt|raw land|land sites?|buildable land|development land)\b/i)[0]+'" as vacant land. Say "industrial" or "all types" to change that.');}
  }

  // 9. Highway exits.
  const exit=text.match(/\b(?:(?:new jersey|nj|n\.j\.)\s*)?(turnpike|tpke?\.?|njtp|garden state(?: parkway)?|gsp|parkway|g\.s\.p\.?)\s*(?:exit|ex\.?|interchange)\s*#?\s*(\d{1,3}[a-z]?)\b/i)||text.match(/\b(?:exit|interchange)\s*#?\s*(\d{1,3}[a-z]?)\s+(?:of|on|off)\s+(?:the\s+)?((?:nj\s+)?turnpike|tpke?|garden state(?: parkway)?|gsp|parkway)\b/i);
  if(exit){
   const road=/park|gsp|garden/i.test(exit[0])?'Garden State Parkway':'New Jersey Turnpike',num=(exit[2]&&/^\d/.test(exit[2])?exit[2]:exit[1]).toUpperCase();
   text=tidy(text.replace(exit[0],'').replace(/\b(?:near|by|off|at|around)\s*$/i,'')+' near '+road+' Exit '+num+', NJ');out.changed=true;
   notes.push('Centering on '+road+' Exit '+num+'.');
  }

  // 10. ZIP codes (not part of a street address).
  const zip=!STREET.test(text)&&text.match(/\b(\d{5})(?:-\d{4})?\b/);
  if(zip){needs.zip=zip[1];}

  // 11. County names without the word "County".
  for(const [name,state] of Object.entries(COUNTIES)){
   const rx=new RegExp('(?<!\\b(?:north|south|east|west|upper|lower|little|new|port|old|mount|mt\\.?|lake|fort)\\s)\\b('+name.replace('-','[- ]')+')\\b(?!\\s+(?:county|city|highlands|beach|junction|fells|park|heights|falls|lakes?|shores?|hills|township|twp|borough|boro|village|manor|gardens|terrace|ave|avenue|st|street|rd|road|blvd|valley|river|gap))(?:[,\\s]+('+STATE+'))?','i');
   const m=text.match(rx);
   if(m&&!/\bcounty\b/i.test(text)){text=tidy(text.replace(m[0],m[1].replace(/\b\w/g,c=>c.toUpperCase())+' County, '+state));if(!/\b(in|near|around)\s+\S+\s+County/i.test(text))text=text.replace(new RegExp('\\b('+name.replace('-','[- ]')+' County)','i'),'in $1').replace(/\bin in\b/i,'in');out.changed=true;break;}
  }

  // 12. Acreage as brokers say it: "10 acre" means at least 10 (matching "industrial land 10 acres"); "or so" means about.
  text=text.replace(/\b(?:maybe|about|around|roughly|approximately|approx\.?|~)?\s*(\d+(?:\.\d+)?)\s*(?:-?ish)?\s*(acres?|ac)\b\.?\s*(?:or so|-?ish|give or take|more or less|plus or minus|\+\/-|±)/ig,(m,n)=>{out.changed=true;notes.push('I read "'+tidy(m)+'" as about '+n+' acres (within 10%).');return ' about '+n+' acres ';});
  text=tidy(text);
  text=text.replace(/\bmaybe\s+(\d+(?:\.\d+)?)\s*(acres?|ac)\b/ig,(m,n)=>{out.changed=true;notes.push('I read "'+m+'" as about '+n+' acres (within 10%).');return 'about '+n+' acres';});
  text=text.replace(/(\d+(?:\.\d+)?)(\s*)(acres?|ac|acrs)\b(?!\s*\+)/ig,(m,n,sp,unit,offset,all)=>{
   const before=all.slice(Math.max(0,offset-22),offset);
   if(COMPARATOR.test(before)||/\+$/.test(m))return m;
   // Existing contract: "a 6 acre parcel" is an exact request; leave it to the parser.
   if(/\b(?:a|an|one)\s*$/i.test(before)&&/^\s*(?:parcel|site|lot|property|piece|tract)\b/i.test(all.slice(offset+m.length)))return m;
   out.changed=true;notes.push('I read "'+n+' '+(unit.toLowerCase().startsWith('ac')&&unit.length<=2?'ac':unit)+'" as at least '+n+' acres. Say "about '+n+' acres" or "exactly '+n+' acres" to narrow it.');return 'at least '+n+' acres';
  });

  // 13. Make sure a described search is treated as a search.
  if(!COMMAND.test(text)&&(TYPE_WORD.test(text)||/\bacres?\b/i.test(text))&&/\b(in|near|around|at)\s+\S/i.test(text)){text='Find '+text;out.changed=true;}
  out.text=tidy(text);return out;
 }

 async function geocode(query,fetcher){
  const u='https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?'+new URLSearchParams({f:'json',SingleLine:query,countryCode:'USA',maxLocations:'3',outFields:'City,RegionAbbr,Subregion,Addr_type,Match_addr',outSR:'4326',forStorage:'false'});
  const r=await fetcher(u,{credentials:'omit'});if(!r.ok)throw Error('Geocoder HTTP '+r.status);const d=await r.json();if(d.error)throw Error('Geocoder error');return d.candidates||[];
 }
 async function arcgis(url,params,fetcher){
  const r=await fetcher(url+'/query?'+new URLSearchParams({f:'json',...params}),{credentials:'omit'});if(!r.ok)throw Error('Parcel source HTTP '+r.status);const d=await r.json();if(d.error)throw Error('Parcel source error');return d.features||[];
 }
 const NJGIN='https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/ArcGIS/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0';
 const PBC='https://services1.arcgis.com/ZWOoUZbtaYePLlPw/arcgis/rest/services/Parcels_and_Property_Details_WebMercator/FeatureServer/0';
 const inBox=(lat,lon,[w,s,e,n])=>lon>=w&&lon<=e&&lat>=s&&lat<=n;
 const sql=v=>String(v).replace(/'/g,"''");
 const titled=s=>String(s||'').toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());

 // Returns {address} for exactly one parcel at the point, {nearby:[...]} when the point falls on a road or
 // between parcels, or null outside the point-searchable sources.
 async function parcelAtPoint(lat,lon,fetcher){
  const geometry=JSON.stringify({x:lon,y:lat,spatialReference:{wkid:4326}}),base={geometry,geometryType:'esriGeometryPoint',inSR:'4326',spatialRel:'esriSpatialRelIntersects',returnGeometry:'false'};
  const sources=[[[-75.6,38.9,-73.88,41.4],NJGIN,'PROP_LOC','MUN_NAME','NJ'],[[-80.89,26.32,-80.03,26.98],PBC,'SITE_ADDR_STR','MUNICIPALITY','FL']];
  for(const [box,url,addr,muni,st] of sources){
   if(!inBox(lat,lon,box))continue;
   const label=a=>titled(a[addr])+', '+titled(String(a[muni]||'').replace(/\s+(?:TWP|TOWNSHIP|BORO|BOROUGH|CITY|TOWN)$/i,''))+', '+st;
   const hit=(await arcgis(url,{...base,outFields:addr+','+muni},fetcher)).filter(f=>f.attributes?.[addr]);
   if(hit.length===1)return {address:label(hit[0].attributes)};
   const near=[...new Set((await arcgis(url,{...base,distance:'40',units:'esriSRUnit_Meter',outFields:addr+','+muni,resultRecordCount:'12'},fetcher)).filter(f=>f.attributes?.[addr]).map(f=>label(f.attributes)))];
   return {nearby:near.slice(0,4)};
  }
  return null;
 }

 /* Resolve lookups. Never guesses: if a lookup is ambiguous or fails, it says so. */
 async function resolve(norm,{fetcher=root.fetch,bridge=root.PublicRadarBridge,ownership=root.RadarOwnership,selectedKey=null,lastAction=null}={}){
  const out={text:norm.text,notes:[...norm.notes],answer:norm.answer,intent:norm.intent||null,followUp:!!norm.followUp};
  const n=norm.needs||{};
  try{
   if(n.coords){
    let [lat,lon]=n.coords;if(Math.abs(lat)>90||(lat<0&&lon>0)){[lat,lon]=[lon,lat];}
    const found=await parcelAtPoint(lat,lon,fetcher),address=found?.address;
    if(address){out.text=norm.rest&&/\w/.test(norm.rest)?'Find '+norm.rest.replace(/^find\s+/i,'')+' near '+address:'Show me '+address;out.notes.push('Those coordinates fall on the parcel at '+address+'.');}
    else if(found?.nearby?.length)out.answer='Those coordinates ('+lat.toFixed(5)+', '+lon.toFixed(5)+') are on a road or between parcels, so I did not pick one. Nearby parcels: '+found.nearby.join('; ')+'. Type the address you mean.';
    else if(found)out.answer='No parcel was found at '+lat.toFixed(5)+', '+lon.toFixed(5)+'. Check the coordinates or type a street address.';
    else out.answer='Those coordinates ('+lat.toFixed(5)+', '+lon.toFixed(5)+') are outside the parcel sources Radar can look up by point (New Jersey statewide and Palm Beach County). Paste a street address or click the spot on the map.';
   }
   if(n.pcn){
    const f=await arcgis(PBC,{where:"PARCEL_NUMBER='"+sql(n.pcn)+"'",outFields:'SITE_ADDR_STR,MUNICIPALITY,PARCEL_NUMBER',returnGeometry:'false'},fetcher);
    if(f.length===1&&f[0].attributes?.SITE_ADDR_STR){const a=titled(f[0].attributes.SITE_ADDR_STR)+', '+titled(f[0].attributes.MUNICIPALITY)+', FL';out.text='Show me '+a;out.notes.push('Palm Beach County parcel '+n.pcn+' is published at '+a+'.');}
    else out.answer='Palm Beach County did not return exactly one parcel for '+n.pcn+'. Check the number on the Property Appraiser site; Radar can only look up PCNs for Palm Beach County.';
   }
   if(n.blockLot){
    const {block,lot,town}=n.blockLot;
    const f=await arcgis(NJGIN,{where:"PCLBLOCK='"+sql(block)+"' AND PCLLOT='"+sql(lot)+"' AND UPPER(MUN_NAME) LIKE '"+sql(town.toUpperCase())+"%'",outFields:'PROP_LOC,MUN_NAME,PCLBLOCK,PCLLOT,PAMS_PIN',returnGeometry:'false',resultRecordCount:'6'},fetcher);
    if(f.length===1&&f[0].attributes?.PROP_LOC){const a=titled(f[0].attributes.PROP_LOC)+', '+titled(String(f[0].attributes.MUN_NAME).replace(/\s+(?:TWP|TOWNSHIP|BORO|BOROUGH|CITY|TOWN)$/i,''))+', NJ';out.text='Show me '+a;out.notes.push('Block '+block+' Lot '+lot+' in '+titled(f[0].attributes.MUN_NAME)+' is published at '+a+' (parcel '+f[0].attributes.PAMS_PIN+').');}
    else if(f.length>1)out.answer='Block '+block+' Lot '+lot+' matched '+f.length+' parcels in towns starting with "'+titled(town)+'": '+f.slice(0,5).map(x=>titled(x.attributes.MUN_NAME)+' ('+titled(x.attributes.PROP_LOC||'no address')+')').join('; ')+'. Add the full town name, for example "Block '+block+' Lot '+lot+' '+titled(f[0].attributes.MUN_NAME)+'".';
    else out.answer='New Jersey\'s statewide parcel layer has no Block '+block+' Lot '+lot+' in '+titled(town)+'. Check the tax map; qualifier lots (like '+lot+'.01) are listed separately.';
   }
   if(n.zip){
    const c=(await geocode(n.zip,fetcher)).find(c=>c.attributes?.Addr_type==='Postal'&&Number(c.score)>=90);
    if(c&&['NJ','FL','PA'].includes(c.attributes.RegionAbbr)){const place=c.attributes.City+', '+c.attributes.RegionAbbr;out.text=out.text.replace(new RegExp('\\b(?:in|near|around|at|zip(?: code)?)?\\s*'+n.zip+'(?:-\\d{4})?\\b'),' in '+place).replace(/\s+/g,' ').trim();if(!COMMAND.test(out.text))out.text='Find '+out.text;out.notes.push('ZIP '+n.zip+' is '+place+'; searching around '+c.attributes.City+'.');}
    else if(c)out.answer='ZIP '+n.zip+' is in '+c.attributes.RegionAbbr+'. Radar\'s parcel sources cover New Jersey, Florida (Palm Beach, Broward, Miami-Dade, Martin/St. Lucie) and Lehigh/Northampton counties in Pennsylvania.';
    else out.answer='I could not match ZIP '+n.zip+'. Try the town name instead.';
   }
   if(out.intent==='value'){
    const rows=bridge?.getResults?.()||[];const pick=selectedKey&&bridge.getRecord(selectedKey)?[bridge.getRecord(selectedKey)]:lastAction==='largest'?[...rows].sort((a,b)=>(b.acres??-1)-(a.acres??-1)).slice(0,1):rows.slice(0,5);
    const lines=pick.map(r=>'• '+(r.address||r.id)+': '+[money(r.assessedValue)?'assessed '+money(r.assessedValue):'assessed value not published',money(r.landValue)?'land '+money(r.landValue):null,money(r.recordedSalePrice)?'last recorded sale '+money(r.recordedSalePrice)+(r.recordedSaleDate?' ('+String(r.recordedSaleDate).slice(0,10)+')':''):null].filter(Boolean).join(' · '));
    out.answer=(pick.length?'Published tax-record values'+(pick.length>1?' for the first '+pick.length+' results':'')+':\n'+lines.join('\n')+'\n':'')+'These are public assessment figures, not market value, an appraisal or an asking price. Listings and comparable sales are not connected.';
   }
   if(out.intent==='owner-referent'){
    const rows=bridge?.getResults?.()||[];const target=selectedKey&&bridge.getRecord(selectedKey)||(lastAction==='largest'?[...rows].sort((a,b)=>(b.acres??-1)-(a.acres??-1))[0]:null);
    if(!target)out.answer='Which property do you mean? Click it in the results (or say "who owns the largest one") and ask again.';
    else{
     const r=await ownership.lookup(target);
     out.answer=(target.address||target.id)+' (parcel '+target.id+'): '+(r?.entityName?'published assessment entity '+r.entityName+'.':r?.status==='published'?'published assessment name '+r.publishedName+'.':(r?.message||'no owner name is published in this record.'))+' Assessment names are not verified title, and no phone or email is available from these records.';
    }
   }
  }catch(e){out.answer='I could not complete that lookup ('+String(e.message||e).slice(0,80)+'). Nothing was searched at a guessed location; try a street address or town name.';}
  return out;
 }
 return {normalize,resolve,extractAddress,parcelAtPoint};
});
