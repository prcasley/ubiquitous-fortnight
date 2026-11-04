// Batch 2 (Nov 4, 2026): 42 live phrasings from older, non-technical brokers and executives.
// The outcome rule: every message becomes an action that says how it was read, a question with
// choices, or an honest "can't do that" — never silence and never a silently dropped condition.
import {test} from 'node:test';import assert from 'node:assert/strict';
import P from '../assets/radar-plain-language.js';
const n=(q,ctx={})=>P.normalize(q,ctx),after=q=>n(q,{hasResults:true});
const noted=(r,rx)=>r.notes.some(x=>rx.test(x));

test('speech, greetings, sign-offs and filler words are cleaned before reading the request',()=>{
 let r=n('uh yeah im looking for like a warehouse in um edison new jersey something with maybe ten acres or so thank you');
 assert.match(r.text,/warehouse in edison new jersey with about 10 acres/i);assert.ok(!/\b(uh|um|yeah|thank)\b/i.test(r.text));
 r=n('Good morning! Could you kindly help me find a five acre lot in Kearny? Many thanks, Bob');
 assert.match(r.text,/^find a 5 acre lot in Kearny\??$/i);assert.ok(!/Bob|thanks|morning/i.test(r.text));
 assert.equal(n('warehouse 🏭 Edison').text,'warehouse Edison');
});

test('misspellings and spelled-out sizes are corrected, and the correction is shown',()=>{
 let r=n('WAREHOUSE IN EDISSON NEW JERSY');assert.match(r.text,/Edison/);assert.ok(noted(r,/"EDISSON" as Edison/));
 r=n('industral prop in seacaucus');assert.match(r.text,/industrial property in Secaucus/);assert.ok(noted(r,/Secaucus/));
 assert.match(n('half an acre in Linden').text,/0\.5 acres/);
 assert.match(n('a dozen acres near Woodbridge').text,/12 acres/);
 assert.match(n('a quarter acre lot in Newark NJ').text,/0\.25 acre/);
 assert.match(n('a few miles from Secaucus').text,/within 3 miles of Secaucus/);
 assert.match(n('almacén en Newark').text,/warehouse in Newark/);
});

test('land in square feet becomes acreage; building square feet is named as unavailable',()=>{
 const r=n('200,000 square feet of land in Carteret');assert.match(r.text,/about 4\.59 acres in Carteret/);assert.ok(noted(r,/about 4\.59 acres/));
 assert.ok(noted(n('50k sf building Secaucus'),/building size/));
});

test('casual questions, landmarks, businesses and roads become searches that say what they did',()=>{
 assert.match(n('Do you have anything in Linden?').text,/^Find industrial in Linden/);
 let r=n('near Newark Airport');assert.match(r.text,/Newark Liberty International Airport, NJ/);assert.ok(noted(r,/Newark Liberty Airport/));
 assert.match(n('by the Meadowlands').text,/East Rutherford, NJ/);
 r=n('near the Amazon warehouse in Carteret');assert.match(r.text,/industrial in Carteret/);assert.ok(noted(r,/Business names aren't searchable/));
 for(const q of ['on Route 1 in Edison','off Route 46 in Totowa']){r=n(q);assert.match(r.text,/^Find industrial in (Edison|Totowa)$/,q);assert.ok(noted(r,/Road frontage/),q);}
 r=n('within a 10 minute drive of Edison');assert.equal(r.text,'within 5 miles of Edison');assert.ok(noted(r,/straight-line radius/));
});

test('conditions Radar cannot apply are named, never silently dropped',()=>{
 let r=n('industrial under 5 million in Newark');assert.equal(r.text,'Find industrial under $5 million in Newark','price is kept for the chat, which reports it as not applied');
 r=n('newest industrial buildings in Edison');assert.ok(noted(r,/"newest"/));assert.ok(!/newest/.test(r.text));
 r=n('industrial in Newark but not near the airport');assert.equal(r.text,'Find industrial in Newark');assert.ok(noted(r,/exclusions/));
 assert.equal(n('industrial built before 1990 in Edison NJ').notes.length,0,'supported year filters are left to the chat');
});

test('pasted listings are read for their address; unverifiable claims are flagged',()=>{
 const r=n('FOR SALE: 12.5 AC industrial land, 123 Main St, Linden NJ 07036, $8.5M, zoned I-2');
 assert.equal(r.text,'Show me 123 Main St, Linden, NJ');assert.ok(noted(r,/12\.5 acres/)&&noted(r,/\$8\.5M/)&&noted(r,/cannot be confirmed/));
});

test('opportunity-zone slang with a place searches first, then runs the official check',()=>{
 for(const q of ['those new Trump tax zones in Camden','opp zones in Camden','QOZ properties in Newark NJ']){const r=n(q);assert.match(r.text,/^Find industrial in (Camden|Newark NJ)$/,q);assert.equal(r.then,'Which of these are in an opportunity zone?',q);}
});

test('several towns at once ask which first; other states are refused with a one-tap fix',()=>{
 let r=n('industrial in Edison and Woodbridge');assert.match(r.answer,/one area at a time/);assert.deepEqual(r.choices,[['Edison','industrial in Edison'],['Woodbridge','industrial in Woodbridge']]);
 r=n('Edison NY industrial');assert.match(r.answer,/can't search NY/);assert.deepEqual(r.choices,[['Search Edison, NJ','Edison NJ industrial']]);
 assert.equal(n('industrial between 4 and 10 acres in Perth Amboy NJ').answer,null);
});

test('small talk and app questions get human answers',()=>{
 for(const q of ['thanks','ok thanks','Thank you!','great','perfect'])assert.match(n(q).answer,/You're welcome/,q);
 for(const q of ['yes','no','yep'])assert.match(n(q).answer,/tap your choice/,q);
 assert.match(n('how do I print this').answer,/Generate field pack/);
 assert.match(n('email this to my boss').answer,/can't send email/);
 assert.match(after('save this').answer,/Export trip backup/);
 assert.match(n('where is the map').answer,/Live parcel map/);
 assert.match(after('go back to the list').answer,/Parcel results/);
 assert.match(n('Hi there!').answer,/Tell me a town/);
});

test('follow-ups about one property: ordinal, flood, zoning, building facts, price, broker',()=>{
 let r=after('the second one');assert.equal(r.intent,'open-ordinal');assert.equal(r.ordinal,2);
 r=after('what about number 3');assert.equal(r.intent,'open-ordinal');assert.equal(r.ordinal,3);assert.equal(r.answer,null,'"number 3" is not a phone question');
 assert.equal(after('is it in a flood zone').intent,'flood');
 for(const q of ["what's the zoning",'can I build a warehouse there','is it zoned industrial'])assert.equal(after(q).intent,'zoning',q);
 for(const q of ['how many trucks can it hold','how many loading docks','what is the clear height'])assert.equal(after(q).intent,'building-facts',q);
 assert.match(after('cheapest one').answer,/Prices and listings aren't connected/);
 assert.match(after("who's the broker").answer,/doesn't have owner phone numbers/);
 assert.match(after('who do I call about this').answer,/doesn't have owner phone numbers/);
 r=after('who owns the second one');assert.equal(r.intent,'owner-referent');assert.equal(r.ordinal,2);
 r=after('how much is the third one worth');assert.equal(r.intent,'value');assert.equal(r.ordinal,3);
 assert.equal(after('is the first one in an OZ?').text,'is the first one in an OZ?','ordinal OZ questions stay with the chat');
});

function fakeBridge(){const rows=[{key:'a',id:'A',address:'1 FIRST ST',acres:6,type:'Industrial',geometry:{type:'Feature',geometry:{type:'Point',coordinates:[-74.3,40.5]}}},{key:'b',id:'B',address:'2 SECOND ST',acres:9,type:'Industrial',assessedValue:1200000},{key:'c',id:'C',address:'3 THIRD ST',acres:12,type:'Vacant',use:'Vacant land'}];let chosen=null;return {getResults:()=>rows,getVisible:()=>rows,getRecord:k=>rows.find(r=>r.key===k),choose:k=>{chosen=k;},chosen:()=>chosen};}
test('resolver: ordinal opens and selects the right property; follow-ups then use it',async()=>{
 const b=fakeBridge();let r=await P.resolve(after('the second one'),{bridge:b});
 assert.match(r.answer,/^#2: 2 SECOND ST · 9\.00 acres · Industrial/);assert.equal(b.chosen(),'b');assert.equal(r.select,'b');assert.equal(r.render[0].key,'b');
 r=await P.resolve(after('how much is the second one worth'),{bridge:b});assert.match(r.answer,/2 SECOND ST: assessed \$1,200,000/);
 r=await P.resolve(after('the ninth one'),{bridge:b});assert.match(r.answer,/only 3 properties/);
 r=await P.resolve(after("what's the zoning"),{bridge:b,selectedKey:'c'});assert.match(r.answer,/3 THIRD ST is assessed as Vacant \(Vacant land\)\. That is a tax class, not zoning/);
 r=await P.resolve(after('how many trucks can it hold'),{bridge:b,selectedKey:'c'});assert.match(r.answer,/no site-plan or building data/);assert.match(r.answer,/12\.00 acres/);
 r=await P.resolve(after('is it in a flood zone'),{bridge:b});assert.match(r.answer,/Which property\?/);
});
test('resolver: flood answers come from the FEMA screening and never claim a determination',async()=>{
 const b=fakeBridge();globalThis.RadarScreening={screen:async()=>({status:'mapped-intersection',overlapPercent:5.9,allZoneLabels:['AE','X']})};
 let r=await P.resolve(after('is it in a flood zone'),{bridge:b,selectedKey:'a'});assert.match(r.answer,/FEMA maps 5\.9% of 1 FIRST ST in a high-risk flood zone/);assert.match(r.answer,/not a flood determination/);
 globalThis.RadarScreening={screen:async()=>({status:'no-mapped-intersection',allZoneLabels:['X']})};
 r=await P.resolve(after('is it in a flood zone'),{bridge:b,selectedKey:'a'});assert.match(r.answer,/no high-risk \(A\/V\) flood zone/);assert.match(r.answer,/not a guarantee/);
 globalThis.RadarScreening={screen:async()=>({status:'error',reason:'FEMA timed out'})};
 r=await P.resolve(after('is it in a flood zone'),{bridge:b,selectedKey:'a'});assert.match(r.answer,/couldn't be completed \(FEMA timed out\)\. No flood conclusion/);
 delete globalThis.RadarScreening;
});
test('resolver: a stalled public source cannot freeze the chat',async()=>{
 const started=Date.now();const r=await P.resolve(n('PCN 00-42-43-27-05-006-4201'),{fetcher:()=>new Promise(()=>{})}).catch(e=>({answer:String(e)}));
 assert.match(r.answer,/did not respond|Nothing was searched/);assert.ok(Date.now()-started<20000);
});
