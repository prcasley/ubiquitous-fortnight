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

  if(/^(?:ok(?:ay)?|k|thanks?(?: you)?(?: so much| very much)?|thank you|ty|thx|great|perfect|cool|got it|awesome|nice|good|sounds good|appreciate it|ok(?:ay)? thanks?(?: you)?|that'?s (?:great|helpful|perfect))[.!]*$/i.test(text)){out.intent='smalltalk';out.answer="You're welcome. Ask about another town, county or address, or about a property in your results.";return out;}
  // 0. Clean up how people actually type: emoji, greetings, sign-offs, filler words, spelled-out
  //    numbers and common misspellings. Corrections are reported, never silent.
  text=tidy(text.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu,' '));
  const courtesy=/^(?:(?:hi|hello|hey|hiya|good (?:morning|afternoon|evening|day)|greetings|dear radar)(?: there)?[,!.\s]*)+/i;
  text=text.replace(courtesy,'');
  text=text.replace(/[,.!\s]*(?:(?:many |thank you |thanks |kind |best )?(?:thanks|thank you|regards|cheers|best)[,!.]?)(?:\s+(?:so much|very much|in advance))?[,!.]?(?:\s+[A-Z][a-z]+\.?)?\s*$/i,'');
  text=text.replace(/\b(?:could|can|would|will) you (?:please |kindly )?(?:help me )?(?:find|show(?: me)?|look for|pull up|get(?: me)?|search(?: for)?)\b/ig,'find').replace(/\b(?:i'?m|i am|we'?re|we are) (?:looking|searching|hunting) for\b|\bi(?:'d| would) like(?: to (?:see|find))?\b|\bi (?:need|want)\b/ig,'find');
  text=text.replace(/\b(?:please|kindly|pls|plz)\b/ig,' ').replace(/(?:^|\s)(?:uh+|um+|umm+|er+|hmm+|yeah|you know|i guess|kind of|sort of|basically|like)(?=[\s,.]|$)/ig,' ').replace(/\bsomething (with|like|around|about|over|near)\b/ig,'$1');
  text=tidy(text.replace(/\bfind\s+find\b/ig,'find'));
  const NUM={zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90,hundred:100};
  const unitWord='(acres?|ac\\b|acre lots?|miles?|mi\\b|minutes?|mins?|million|mil\\b|k\\b)';
  text=text.replace(/\b(?:a\s+)?half(?:\s+an?)?\s+acre\b|\bhalf-acre\b|\b1\/2\s*(?:an?\s+)?acre\b/ig,'0.5 acres').replace(/\b(?:a\s+)?quarter(?:\s+of\s+an?)?\s+acre\b|\b1\/4\s*acre\b/ig,'0.25 acres').replace(/\b(?:an|one)\s+acre\b/ig,'1 acre')
   .replace(new RegExp('\\ba\\s+dozen\\s+'+unitWord,'ig'),'12 $1').replace(new RegExp('\\ba\\s+couple(?:\\s+of)?\\s+'+unitWord,'ig'),'2 $1').replace(new RegExp('\\ba\\s+few\\s+'+unitWord,'ig'),'3 $1')
   .replace(new RegExp('\\b('+Object.keys(NUM).join('|')+')(?:[\\s-]+('+Object.keys(NUM).join('|')+'))?(?=[\\s-]+'+unitWord+')','ig'),(m,a,b)=>String(NUM[a.toLowerCase()]+(b?NUM[b.toLowerCase()]:0)));
  const TYPOS={warehose:'warehouse',wharehouse:'warehouse',warehous:'warehouse',wearhouse:'warehouse',whareouse:'warehouse',warehoses:'warehouses',industral:'industrial',industiral:'industrial',industial:'industrial',indusrial:'industrial',indistrial:'industrial',industrail:'industrial',jersy:'Jersey',jersery:'Jersey',jersye:'Jersey',prop:'property',props:'properties',acers:'acres',acrs:'acres',acerage:'acreage',edisson:'Edison',edision:'Edison',eddison:'Edison',seacaucus:'Secaucus',secacus:'Secaucus',secaucas:'Secaucus',seacaucas:'Secaucus',secaucaus:'Secaucus',secucus:'Secaucus',newwark:'Newark',nework:'Newark',elizibeth:'Elizabeth',elizabth:'Elizabeth',elisabeth:'Elizabeth',woodbrige:'Woodbridge',woodbirdge:'Woodbridge',kearney:'Kearny',carterett:'Carteret',cartaret:'Carteret',lynden:'Linden',patterson:'Paterson',hobokin:'Hoboken',piscatway:'Piscataway',piscataway:'Piscataway',trenten:'Trenton',camdan:'Camden'};
  text=text.replace(/\b(almac[eé]n(?:es)?|bodegas?|naves? industrial(?:es)?|terrenos?)\b(\s+en\b)?/ig,(m,w,en)=>{out.changed=true;notes.push('I read "'+w+'" as '+(/terreno/i.test(w)?'land':'warehouse')+'.');return (/terreno/i.test(w)?'vacant land':'warehouse')+(en?' in':'');});
  const fixed=[];text=text.replace(/\b[A-Za-z]+\b/g,w=>{const t=TYPOS[w.toLowerCase()];if(t&&t.toLowerCase()!==w.toLowerCase()){if(/^[A-Z]/.test(t))fixed.push(w+' → '+t);return t;}return w;});
  if(fixed.length)notes.push('I read '+fixed.map(x=>'"'+x.split(' → ')[0]+'" as '+x.split(' → ')[1]).join(', ')+'.');
  if(text!==tidy(String(raw??'')))out.changed=true;
  if(!text){out.answer='Hello! Tell me a town, county, ZIP code or street address, and what kind of property you want, for example "industrial over 5 acres in Edison NJ".';return out;}

  // Small talk and acknowledgements get a short human answer, never "unrecognized filter".
  if(/^(?:ok(?:ay)?|k|thanks?(?: you)?(?: so much| very much)?|thank you|ty|thx|great|perfect|cool|got it|awesome|nice|good|sounds good|appreciate it|ok(?:ay)? thanks?(?: you)?|that'?s (?:great|helpful|perfect))[.!]*$/i.test(text)){out.intent='smalltalk';out.answer="You're welcome. Ask about another town, county or address, or about a property in these results.";return out;}
  if(/^(?:yes|yeah|yep|yup|sure|no|nope|nah|correct|right)[.!]*$/i.test(text)){out.intent='smalltalk';out.answer='If a question with buttons is showing above, tap your choice. Otherwise tell me a town, address or question about these results.';return out;}

  // How to use the app (print, email, save, find the map or list).
  {const l=text.toLowerCase();
   if(/\b(print|printout|print out|pdf|hard copy)\b/.test(l)&&!/\b(bigger|larger|smaller|size|font|text)\b/.test(l)){out.intent='help';out.answer='To print properties: open a property, choose "Add selected property to trip" (Field trip & field pack section), then "Generate field pack". It downloads a page you can print or save as PDF with Ctrl+P (Cmd+P on a Mac). To print the screen as it is, use your browser\'s Print.';return out;}
   if(/\b(e-?mail|send (?:this|it|these|them)|forward|share (?:this|it|these))\b/.test(l)&&!/\b(owner|seller|broker)'?s? e-?mail\b/.test(l)){out.intent='help';out.answer='Radar can\'t send email. Say "export these" to download the results as a file, or generate a field pack, then attach the file to your email.';return out;}
   if(/^(?:save|keep|bookmark)(?: (?:this|it|these|them|the results|my search))?[.!]*$/.test(l)){out.intent='help';out.answer='Field trips and notes stay in this browser automatically. To keep a copy you can share, say "export these" or use "Export trip backup".';return out;}
   if(/\b(where(?:'s| is)|show(?: me)?|can'?t (?:see|find)|open)\s+(?:the\s+)?map\b/.test(l)){out.intent='help';out.answer='The map is the "Live parcel map" panel next to the chat (on a phone, scroll down below the chat). "Expand map" makes it full screen.';return out;}
   if(/\b(?:go back to|back to|show(?: me)?|where(?:'s| is| are))\s+(?:the\s+)?(?:list|results|properties)\b/.test(l)){out.intent='help';out.answer=hasResults?'Your results are in the "Parcel results" panel and in the property cards below the chat. Say "go back" to return to your previous search.':'There are no results yet. Tell me a town and property type, for example "industrial over 5 acres in Edison NJ".';return out;}
   if(/^(?:how (?:do i|does this|to) (?:use|work)(?: this| it)?|i'?m lost|what (?:do i do|now)|instructions)[?.!]*$/.test(l)){out.text='help';out.changed=true;return out;}
  }

  // 1. Pasted broker email or long message: pull out the property address.
  const sentences=text.split(/[.!?]\s+/).filter(s=>s.trim().length>3).length;
  if((text.length>160&&sentences>=2)||(STREET.test(text)&&/\b(for sale|for lease|asking|listing|listed|zoned|offering|available now|\$\s?\d)/i.test(text))){
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
  const aboutThisOne=/\b(there|it|this one|that one|this property|that property|this site|that site)\b/i.test(text)&&!/\b(in|near|around)\s+[A-Z]/.test(text)&&!STREET.test(text);
  const looksLikeNewSearch=!aboutThisOne&&(TYPE_WORD.test(text)||/\b(in|near|around)\s+[A-Z]/.test(text)||STREET.test(text)||/\b\d{5}\b/.test(text));
  if(hasResults&&!looksLikeNewSearch){
   const l=text.toLowerCase();
   if(/^(start over|start again|begin again|reset|clear(?: (?:it|this|everything|all|results|the results|the map))?|new search)[.!]?$/i.test(text)){out.intent='reset';out.answer='Cleared. What would you like to find? For example: industrial over 5 acres in Edison NJ, or a street address.';return out;}
   const ord=l.match(/\b(?:the\s+)?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|1st|2nd|3rd|4th|5th|6th|7th|8th|9th|10th)(?:\s+(?:one|property|result|parcel|site))?\b|(?:#|number|no\.?)\s*(\d{1,3})\b/);
   const ordN=ord?({first:1,second:2,third:3,fourth:4,fifth:5,sixth:6,seventh:7,eighth:8,ninth:9,tenth:10}[ord[1]]||parseInt(ord[1]||ord[2],10)):null;
   const askOZ=/\b(q\.?\s?o\.?\s?z|opp(?:ortunity)?\.?\s*zones?|oz\b|oz2|tax[- ]?(?:break|zone))/.test(l);
   if(ordN&&!askOZ){out.ordinal=ordN;}
   if(/\bflood/.test(l)){out.intent='flood';return out;}
   if(/\b(zon(?:ing|ed)|permitted|allowed to build|can (?:i|we) build|build (?:a|an)\b|by[- ]right|variance|use group)\b/.test(l)){out.intent='zoning';return out;}
   if(/\b(trucks?|trailers?|docks?|loading|clear height|ceiling|parking|doors?|power|amps?|sprinkler)\b/.test(l)){out.intent='building-facts';return out;}
   if(/\b(cheap(?:est|er)?|expensive|priciest|lowest price|best (?:deal|price)|price per|asking)\b/.test(l)){out.answer='Prices and listings aren\'t connected to Radar, so I can\'t rank by price. I can show published tax-assessed values (ask "how much is it worth" about a property) or sort by size ("show the largest").';return out;}
   if(ordN&&!askOZ&&!/\b(own|owner|worth|value|flood|zon)/.test(l)){out.intent='open-ordinal';return out;}
   if(/\b(phone(?: number)?|contact number|cell(?: number)?|email|e-mail|contact info|contact them|call (?:them|him|her|the owner|the seller)|who (?:do|should|can) (?:i|we) (?:call|contact|talk to|reach)|reach (?:them|him|her|the owner)|get (?:a )?hold of|broker|listing agent|agent)\b/.test(l)&&!/\bparcel number\b/.test(l)){out.intent='contact';out.answer="Radar doesn't have owner phone numbers or emails; public parcel records don't include them. Open a property and choose Look up published owner to get the assessment name, then use the county tax/deed records or the state business registry to research a contact. Nothing is looked up or guessed automatically.";return out;}
   if(/\b(worth|value|valued|appraise[sd]?|assess(?:ed|ment)?|what(?:'s| is) it (?:going )?for|price|cost|how much)\b/.test(l)&&!/\bper\s*(?:sf|square)/.test(l)&&!/\bcomps?\b/.test(l)){out.intent='value';return out;}
   if(/\b(q\.?\s?o\.?\s?z\.?|opp(?:ortunity)?\.?\s*zones?|tax[- ]?(?:break|benefit|incentive|credit|advantage|zone)s?|oz(?:\s*2(?:\.0)?)?(?:\s*status)?|oz2)\b/.test(l)&&!/\b(close|closing|before|deadline|when|timeline|qualif(?:y|ies|ication)|designat|certif|lease|own)/.test(l)&&!/\b(first|second|third|last|this one|that one|the one|it|#\d)\b/.test(l)&&!(/\b(opportunity zones?|oz\s?[12](?:\.0)?)\b/.test(l)&&/\b(which|are|is|show)\b/.test(l)&&!/\bmap\b/.test(l))){out.text=/\boz\s*1\b|\b2018\b/.test(l)?'Which of these are in OZ 1?':'Which of these are in an opportunity zone?';out.changed=true;out.followUp=true;return out;}
   if(/\b(plain english|explain|what does (?:that|this|it) mean|i don'?t (?:understand|get it|follow)|confus|simpler|in english|layman)\b/.test(l)){out.text='what does that mean';out.changed=true;out.followUp=true;return out;}
   if(/\b(bigger|larger)\b/.test(l)&&!/\d/.test(l)){out.text='Show the largest properties in this scan';out.changed=true;out.followUp=true;notes.push('Showing the largest first. To require a minimum size, say for example "over 20 acres".');return out;}
   if(/\b(smaller)\b/.test(l)&&!/\d/.test(l)){out.answer='Tell me the size limit you want, for example "under 5 acres", and I will narrow these results.';return out;}
   if(/\b(highway|hwy|turnpike|parkway|interstate|i-?\s?\d{2,3}|route|rt\.?\s?\d+|exit|ramp|rail|port|airport)\b/.test(l)&&/\b(near|close|by|next to|access|off|only|within)\b/.test(l)){out.answer="Distance to highways, rail or ports isn't a search filter yet. Open a property and choose Check site facts to see the nearest named highway and road notes for that parcel. Your current results are unchanged.";return out;}
   if((ordN||/\b(it|that one|this one|that|this|the first one|first one|the one|there)\b/.test(l))&&/\b(own|owner|owns|owned)\b/.test(l)){out.intent='owner-referent';return out;}
  }

  // Places outside the connected states: say so instead of quietly switching states.
  checkState:{const other=text.match(/\b(NY|N\.Y\.|New York|CT|Connecticut|DE|Delaware|MD|Maryland|GA|Georgia|TX|Texas|CA|California|OH|Ohio|NC|SC)\b/i);
   if(other&&!/\bnew york (?:ave|avenue|st|street|rd|road)\b/i.test(text)&&!/\b(?:ga|ca|oh|de|sc|nc|md)\b/.test(other[0])&&!STREET.test(text)){
    let town=tidy(text.replace(other[0],'').replace(/\b(industrial|warehouses?|vacant|land|in|near|around|find|show me|property|properties)\b/ig,' ')).replace(/[,.]+$/,'');
    // Only intercept when the town also exists in NJ, so the one-tap fix is real; otherwise the chat's own
    // geocoder answer ("Address located in NY…") explains the coverage.
    if(!/^(edison|newark|princeton|camden|trenton|paterson|elizabeth|clinton|franklin|washington|salem|bloomfield|montclair|linden|woodbridge|kearny|bayonne|hoboken|union|dover|morristown|vineland|secaucus|carteret|rahway|hamilton|middletown|freehold|piscataway|lakewood|wayne|clifton|passaic|hackensack|jersey city|perth amboy|new brunswick|east orange|orange|plainfield|summit|westfield|cranford|fairfield|livingston|millburn|chatham|madison|lincoln park)$/i.test(town))town='';
    if(!town)break checkState;
    out.answer='Radar\'s parcel data covers New Jersey, Florida and Lehigh/Northampton counties in Pennsylvania, so I can\'t search '+other[0]+'.'+(town?' If you meant '+town.replace(/\b\w/g,c=>c.toUpperCase())+' in New Jersey, tap below.':'');
    const Town=town.replace(/\b\w/g,c=>c.toUpperCase());if(town)out.choices=[['Search '+Town+', NJ',tidy(text.replace(other[0],'NJ'))]];
    return out;
   }}

  // 6. Statewide-only requests.
  if(/\b(?:in|across|throughout|anywhere in|all of)\s+(?:the state of\s+)?(new jersey|n\.?j\.?|florida|fl|pennsylvania|pa)[.!?]?\s*$/i.test(text)&&(TYPE_WORD.test(text)||/\b(acres?|sf|sq|square|storage|land|dirt|sites?|parcels?|properties|warehouse|terminal|ios|flex)\b/i.test(text))&&!/\b(who|own|owner|lease|sale|sold|comps?|price)\b/i.test(text)&&!/\b(county|[A-Z][a-z]+,\s*(?:NJ|FL|PA))\b/.test(text)&&!STREET.test(text)){
   out.answer='Statewide searches are not available; they would return tens of thousands of parcels. Name a town, county or address, for example "industrial over 10 acres in Middlesex County NJ" or "industrial near Exit 8A on the NJ Turnpike".';return out;
  }

  // 6b. Several towns at once: ask which first instead of searching a nonsense place name.
  {const two=text.match(/\b(?:in|near|around|between)\s+([A-Z][A-Za-z.]*(?:\s+[A-Z][A-Za-z.]*){0,2})\s*(?:,\s*NJ\s*)?(?:and|&|or|plus|then)\s+([A-Z][A-Za-z.]*(?:\s+[A-Z][A-Za-z.]*){0,2})\b/i);
   if(two&&!/\b(acres?|miles?)\b/i.test(two[2])&&!/^(?:the|a|an)\b/i.test(two[1])&&!/\bbetween\s+\d/i.test(text)){
    const a=two[1].trim(),b=two[2].trim();
    out.answer='I search one area at a time. Which should I start with?';
    out.choices=[[a,tidy(text.replace(two[0],(two[0].match(/^\w+/)[0])+' '+a))],[b,tidy(text.replace(two[0],(two[0].match(/^\w+/)[0])+' '+b))]];
    return out;
   }}

  // 6c. Opportunity-zone slang together with a place: search the place, then run the official OZ check.
  {const oz=/\b(q\.?\s?o\.?\s?z\.?|opp(?:ortunity)?\.?\s*zones?|(?:trump|new|federal|biden)?\s*tax[- ]?(?:break|benefit|incentive|credit)?\s*zones?|tax breaks?|oz\s*2(?:\.0)?|oz2|oz)\b/i;
   if(oz.test(text)&&/\b(?:in|near|around)\s+[A-Za-z]/i.test(text)&&!/\b(?:which|are any|is (?:it|this|the))\b/i.test(text)){
    let search=tidy(text.replace(/\b(?:those|these|the|any)?\s*(?:new\s+)?(?:trump|federal|biden)?\s*(?:q\.?\s?o\.?\s?z\.?|opp(?:ortunity)?\.?\s*zones?|tax[- ]?(?:break|benefit|incentive|credit)?\s*zones?|tax breaks?|oz\s*2(?:\.0)?|oz2|oz)\b(?:\s+(?:properties|parcels|sites|land|areas?))?/ig,' '));
    if(/\b(?:in|near|around)\s*$/i.test(search)||/^\s*(?:show\s+(?:me\s+)?)?only\b|\bonly\s+(?:the\s+)?(?:ones|parcels|properties)\b/i.test(text)){}else{ // "show only parcels in OZ 2" is a filter on current results, left to the chat
    if(!TYPE_WORD.test(search))search='industrial '+search;
    out.text=search.match(COMMAND)?search:'Find '+search;out.then='Which of these are in an opportunity zone?';out.changed=true;
    notes.push('I\'ll search there first, then check the results against the official opportunity-zone list.');
    text=out.text;
   }}}

  // 6d. Casual "anything in X" / "what do you have in X".
  text=text.replace(/^(?:do you have|got|have you got|is there|are there|what do you have|what(?:'s| is) (?:out there|there))\s+(?:anything|any(?:thing)?\s+(?:property|properties|sites?|land))?\s*(?=\b(?:in|near|around)\b)/i,()=>{out.changed=true;notes.push('No property type was named, so I\'m showing industrial. Say "all types" to see everything.');return 'Find industrial ';});
  text=text.replace(/^anything\s+(?=\b(?:in|near|around)\b)/i,()=>{out.changed=true;return 'Find industrial ';});

  // 6e. Landmarks and businesses: center on something the map can find, and say so.
  {const LANDMARKS=[[/\b(?:newark (?:liberty )?(?:international )?airport|ewr|newark liberty)\b/i,'Newark Liberty International Airport, NJ','Newark Liberty Airport'],[/\b(?:the\s+)?meadowlands\b/i,'East Rutherford, NJ','the Meadowlands (East Rutherford)'],[/\bport (?:elizabeth|newark-elizabeth)\b/i,'Elizabeth, NJ','Port Elizabeth (Elizabeth)'],[/\bmetlife(?: stadium)?\b/i,'East Rutherford, NJ','MetLife Stadium (East Rutherford)'],[/\braritan center\b/i,'Raritan Center, Edison, NJ','Raritan Center (Edison)']];
   for(const [rx,place,label] of LANDMARKS){if(rx.test(text)){text=tidy(text.replace(new RegExp('\\b(?:near|by|around|close to|next to|at)?\\s*(?:the\\s+)?'+rx.source.replace(/^\\b/,''),'i'),' near '+place));out.changed=true;notes.push('Centering on '+label+'.');if(!TYPE_WORD.test(text))text='industrial '+text;break;}}
   const biz=text.match(/\b(?:near|by|next to|close to|around)\s+(?:the\s+)?(?:[A-Za-z0-9&'.-]+\s+){1,4}?(?:warehouse|building|store|plant|facility|distribution center|dc|campus|terminal|headquarters|hq|office|factory|mall)\s+in\s+([A-Z][A-Za-z .'-]+?)(?=$|[,.?!]|\s+(?:with|over|under|nj|new jersey)\b)/i);
   if(biz){text=tidy(text.replace(biz[0],'in '+biz[1]));out.changed=true;notes.push('Business names aren\'t searchable in public parcel records, so I centered on '+biz[1]+'.');if(!TYPE_WORD.test(text))text='industrial '+text;}
  }

  // 6f. Roads: road frontage is not a filter; keep the town and say so.
  text=text.replace(/\b(?:on|off|along|by|near|fronting|facing)\s+(?:of\s+)?(?:the\s+)?(?:(?:route|rt\.?|rte\.?|highway|hwy\.?|state highway|us|interstate|i-?)\s*\d{1,3}[a-z]?|(?:nj\s+)?turnpike|garden state parkway|parkway)\b(?!\s+exit)/ig,m=>{if(/^(?:near|by)\b/i.test(m)&&/turnpike|parkway/i.test(m))return m; // the chat reports Turnpike/Parkway proximity itself
   out.changed=true;notes.push('Road frontage ("'+tidy(m)+'") isn\'t a search filter, so I searched the whole area. Open a property and choose Check site facts to see its nearest named highway.');return ' ';});
  text=tidy(text);
  if(/^(?:in|near|around)\s+[A-Z]/i.test(text)&&!TYPE_WORD.test(text)){text='industrial '+text;out.changed=true;}

  // 6g. Drive times: Radar uses straight-line distance.
  text=text.replace(/\b(?:within\s+)?(?:an?\s+)?(\d{1,3})[\s-]*(?:min(?:ute)?s?)\s+(?:drive|away|ride|commute)\s+(?:of|from)\b|\b(\d{1,3})[\s-]*(?:min(?:ute)?s?)\s+(?:drive\s+)?(?:from|of)\b/ig,(m,a,b)=>{const mins=Number(a||b),miles=Math.max(1,Math.min(25,Math.round(mins/2)));out.changed=true;notes.push('Drive times aren\'t available, so I used a straight-line radius of about '+miles+' miles for "'+tidy(m)+'".');return 'within '+miles+' miles of';});
  text=text.replace(/(?<!within\s)\b(\d{1,2})\s+miles?\s+(?:from|of|away from|outside(?: of)?)\b/ig,(m,n)=>{out.changed=true;return 'within '+n+' miles of';});

  // 6h. Land measured in square feet is acreage, not building size.
  text=text.replace(/(\d[\d,]*(?:\.\d+)?)\s*(k|thousand)?\s*(?:sf|s\.f\.|sq\.?\s*ft\.?|sqft|square\s*f(?:ee|oo)t)\s+(?:of\s+)?(?:land|lot|dirt|ground|site|yard|acreage)\b|\b(?:land|lot)\s+(?:of\s+)?(\d[\d,]*(?:\.\d+)?)\s*(k|thousand)?\s*(?:sf|sq\.?\s*ft\.?|square\s*f(?:ee|oo)t)\b/ig,(m,n1,k1,n2,k2)=>{
   const n=Number(String(n1||n2).replace(/,/g,''))*((k1||k2)?1000:1),ac=n/43560;out.changed=true;
   notes.push(Math.round(n).toLocaleString('en-US')+' square feet of land is about '+ac.toFixed(2)+' acres, so I searched for about '+ac.toFixed(1)+' acres.');return 'about '+ac.toFixed(2)+' acres ';});
  text=tidy(text);

  // 6i. Conditions Radar cannot apply are named, never dropped silently.
  const cannot=[];
  // Price-per-SF, comps and for-sale questions keep their wording: the chat answers those itself.
  if(!/\bper\s+(?:sq|square)|\/\s*s\.?f\b|\bpsf\b|\bcomps?\b|\bfor sale\b|\bon the market\b/i.test(text))text=text.replace(/(?:\b(?:under|below|less than|up to|max(?:imum)?|no more than|around|about|for|budget(?: of)?|priced at|at)\s+)?\$\s?\d[\d,.]*\s*(?:m|mm|million|mil|k|thousand|b|billion)?\b|\b(?:under|below|less than|up to|budget of|around|about)\s+\d[\d,.]*\s*(?:m|mm|million|mil|k|thousand)\b|\b\d[\d,.]*\s*(?:million|mil|mm)\b(?!\s*(?:sf|square))/ig,m=>{const t=tidy(m);return ' '+(t.includes('$')?t:t.replace(/(\d)/,'$$$1'))+' ';}); // the chat marks budgets as "I couldn't apply" itself; just make sure it sees a $
  text=text.replace(/\b(newest|newer|brand new|modern|recently built|oldest|older)\b(?!\s+than\s+\d)/ig,m=>{cannot.push('"'+m+'": say "built after 2000" or "built before 1990" to filter by published build year');return ' ';});
  text=text.replace(/[,]?\s*\b(?:but\s+)?(?:not|no|except|excluding|other than|without|avoid(?:ing)?)\s+(?:near|by|in|on|close to|next to)?\s*(?:the\s+)?(?:[a-z]+\s+){0,3}?(airport|highway|river|residential|houses|homes|schools?|wetlands?|flood(?:\s*zones?)?|landfill|rail(?:road)?|port|downtown)\b/ig,m=>{cannot.push('exclusions ("'+tidy(m)+'"): results still include everything else that matched');return ' ';});
  text=tidy(text);
  if(cannot.length)notes.push('I couldn\'t apply: '+cannot.join('; ')+'.');

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

 // Every public lookup is bounded so a stalled source can never freeze the chat.
 async function bounded(fetcher,url,ms=15000){const c=typeof AbortController==='function'?new AbortController():null;let timer;try{return await Promise.race([fetcher(url,{credentials:'omit',...(c?{signal:c.signal}:{})}),new Promise((_,reject)=>{timer=setTimeout(()=>{c?.abort();reject(Error('the public source did not respond within '+Math.round(ms/1000)+' seconds'));},ms);})]);}finally{clearTimeout(timer);}}
 async function geocode(query,fetcher){
  const u='https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?'+new URLSearchParams({f:'json',SingleLine:query,countryCode:'USA',maxLocations:'3',outFields:'City,RegionAbbr,Subregion,Addr_type,Match_addr',outSR:'4326',forStorage:'false'});
  const r=await bounded(fetcher,u);if(!r.ok)throw Error('Geocoder HTTP '+r.status);const d=await r.json();if(d.error)throw Error('Geocoder error');return d.candidates||[];
 }
 async function arcgis(url,params,fetcher){
  const r=await bounded(fetcher,url+'/query?'+new URLSearchParams({f:'json',...params}));if(!r.ok)throw Error('Parcel source HTTP '+r.status);const d=await r.json();if(d.error)throw Error('Parcel source error');return d.features||[];
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
  /* Outcome rule: every message ends as an action that says how it was read, a question with choices, or an honest "can't do that". */
  const out={text:norm.text,notes:[...norm.notes],answer:norm.answer,intent:norm.intent||null,followUp:!!norm.followUp,choices:norm.choices||null,then:norm.then||null};
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
   const rows=bridge?.getResults?.()||[],visible=bridge?.getVisible?.()||rows;
   const nth=norm.ordinal?(visible.length?visible:rows)[norm.ordinal-1]:null;
   if(norm.ordinal&&!nth){out.answer='There are only '+(visible.length||rows.length)+' properties in these results.';return out;}
   if(nth){bridge?.choose?.(nth.key);selectedKey=nth.key;out.select=nth.key;lastAction=null;}
   const target=nth||(selectedKey&&bridge?.getRecord?.(selectedKey))||(lastAction==='largest'?[...rows].sort((a,b)=>(b.acres??-1)-(a.acres??-1))[0]:null);
   const where=r=>(r.address||'parcel '+r.id);
   if(out.intent==='open-ordinal'){out.answer='#'+norm.ordinal+': '+where(nth)+' · '+(nth.acres!=null?nth.acres.toFixed(2)+' acres':'acreage not published')+' · '+(nth.type||'type not published')+'. Ask "who owns it", "is it in a flood zone" or "how much is it worth".';out.render=[nth];}
   if(out.intent==='zoning'){out.answer=(target?where(target)+' is assessed as '+(target.type||'an unpublished class')+(target.use?' ('+target.use+')':'')+'. That is a tax class, not zoning. ':'')+'Zoning isn\'t in the public parcel records Radar reads, so I can\'t say what can be built. Check the town\'s zoning map or ask its zoning office.';}
   if(out.intent==='building-facts'){out.answer='Radar has no site-plan or building data (loading docks, clear height, truck or trailer parking, power).'+(target?' What the records show for '+where(target)+': '+(target.acres!=null?target.acres.toFixed(2)+' acres':'acreage not published')+(target.yearBuilt?', built '+target.yearBuilt:'')+'.':'')+' Ask the owner or broker for a site plan.';}
   if(out.intent==='flood'){
    if(!target)out.answer='Which property? Click one in the results or say "is the first one in a flood zone".';
    else{const S=root.RadarScreening;if(!S){out.answer='The flood screening tool isn\'t loaded on this page.';}else{const r=await Promise.race([S.screen(target,'flood'),new Promise(res=>setTimeout(()=>res({status:'error',reason:'FEMA did not respond in time'}),30000))]);
     out.answer=r.status==='mapped-intersection'?'FEMA maps '+(r.overlapPercent!=null?r.overlapPercent.toFixed(1)+'% of ':'part of ')+where(target)+' in a high-risk flood zone (A/V'+(r.allZoneLabels?.length?'; zones on the parcel: '+r.allZoneLabels.join(', '):'')+'). This is a map screening, not a flood determination; get a survey or flood certificate before relying on it.'
      :r.status==='no-mapped-intersection'?'FEMA\'s map shows no high-risk (A/V) flood zone on '+where(target)+(r.allZoneLabels?.length?' (zones present: '+r.allZoneLabels.join(', ')+')':'')+'. That is a map screening, not a guarantee; lower-risk zones and local flooding can still apply.'
      :'The FEMA flood check for '+where(target)+' couldn\'t be completed ('+(r.reason||r.status)+'). No flood conclusion was made; try again or use Screen selected parcel.';}}
   }
   if(out.intent==='value'){
    const pick=target?[target]:rows.slice(0,5);
    const lines=pick.map(r=>'• '+(r.address||r.id)+': '+[money(r.assessedValue)?'assessed '+money(r.assessedValue):'assessed value not published',money(r.landValue)?'land '+money(r.landValue):null,money(r.recordedSalePrice)?'last recorded sale '+money(r.recordedSalePrice)+(r.recordedSaleDate?' ('+String(r.recordedSaleDate).slice(0,10)+')':''):null].filter(Boolean).join(' · '));
    out.answer=(pick.length?'Published tax-record values'+(pick.length>1?' for the first '+pick.length+' results':'')+':\n'+lines.join('\n')+'\n':'')+'These are public assessment figures, not market value, an appraisal or an asking price. Listings and comparable sales are not connected.';
   }
   if(out.intent==='owner-referent'){
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
