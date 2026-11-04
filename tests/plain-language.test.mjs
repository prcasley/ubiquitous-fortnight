// How brokers, executives and non-technical users actually type. Every case here came from a live test
// where the chat either misread the request or answered a different question with confidence.
import {test} from 'node:test';import assert from 'node:assert/strict';
import P from '../assets/radar-plain-language.js';
const n=(q,ctx={})=>P.normalize(q,ctx);
const after=(q)=>n(q,{hasResults:true});

test('acreage the way people say it: "10 acre" means at least, "or so" means about, explicit comparisons stay as typed',()=>{
 assert.match(n('show me industrial land edison new jersey 10 acre').text,/at least 10 acres/);
 assert.match(n('industrial 10 acre in Monmouth NJ').text,/at least 10 acres/);
 assert.equal(n('find me a 6 acre parcel which is up for renewal').text,'find me a 6 acre parcel which is up for renewal','"a 6 acre parcel" keeps its existing exact meaning');
 assert.match(n('warehouse near Edison, maybe 5 acres or so').text,/about 5 acres/);
 assert.match(n('industrial 7 acres-ish near Edison NJ').text,/about 7 acres/);
 assert.match(n('industrial near Edison NJ 12 ac give or take').text,/about 12 acres/);
 for(const q of ['Industrial over 5 acres in Edison NJ','Industrial between 4 and 10 acres in Perth Amboy NJ','industrial 5+ acres near Edison NJ','exactly 6 acres industrial in Edison NJ','Industrial about 6 acres near Edison NJ','industrial at least 3 acres in Newark NJ','industrial under 2 acres in Camden NJ','industrial 4 to 8 acres in Edison NJ'])
  assert.equal(n(q).text.replace(/^Find /,''),q,'must not rewrite an explicit comparison: '+q);
 assert.ok(n('show me industrial land edison new jersey 10 acre').notes.some(x=>/about 10 acres/.test(x)&&/exactly 10 acres/.test(x)),'tells the user how to narrow it');
 assert.equal(n('industrial with 5 acres near Edison NJ').text,'Find industrial with 5 acres near Edison NJ','"with N acres" is already a minimum');
});

test('building square footage is never silently dropped',()=>{
 for(const q of ["Hi there, I'm looking for a warehouse around 50,000 square feet near Edison, maybe 5 acres or so. Thanks!",'50k sf building Secaucus','industrial 120,000 SF near Newark NJ','25000 sq ft warehouse in Edison NJ','a 1 million square foot box near Exit 8A on the turnpike']){
  const r=n(q);assert.ok(r.notes.some(x=>/building size/.test(x)),q);assert.ok(!/square|\bsf\b|sq ft/i.test(r.text),'SF phrase removed so it cannot be misread: '+r.text);
 }
 assert.equal(n('50k sf building Secaucus').text,'Find industrial in Secaucus');
 assert.match(n("warehouse around 50,000 square feet near Edison").text,/warehouse near Edison/,'no dangling "around near"');
});

test('industry words map to a property type instead of a generic reply',()=>{
 for(const q of ['truck terminal near Newark NJ','IOS sites near Port Newark','cold storage in Secaucus NJ','laydown yard in Carteret NJ','flex space near Edison NJ','last-mile site near Elizabeth NJ','contractor yard in Kearny NJ'])assert.match(n(q).text,/\bindustrial\b/i,q);
 assert.match(n('any dirt over 20 acres in Monmouth').text,/\bvacant\b/);
 assert.ok(n('any dirt over 20 acres in Monmouth').notes.some(x=>/vacant land/.test(x)));
});

test('county names without the word County stay in the right state',()=>{
 assert.match(n('any dirt over 20 acres in Monmouth').text,/in Monmouth County, NJ/);
 for(const q of ['industrial parcels 4+ acres in North Bergen NJ','Lehigh Valley industrial over 50 acres','industrial in Atlantic City NJ','Monmouth Junction NJ industrial','industrial near Essex Fells NJ'])assert.ok(!/ County/.test(n(q).text),'town or region kept: '+q);
 assert.match(n('industrial in Bergen NJ').text,/Bergen County, NJ/);
 assert.match(n('warehouses in Broward').text,/Broward County, FL/);
 assert.match(n('industrial over 5 acres in Hudson').text,/Hudson County, NJ/);
 assert.equal(n('Bergen county industrial').text.includes('County County'),false);
 for(const town of ['Camden','Union','Passaic','Middlesex','Ocean','Morris','Burlington'])assert.ok(!/County/.test(n('industrial in '+town+' NJ').text),town+' is also a town and must not be turned into a county');
});

test('highway exits, zip codes, coordinates, map links and parcel IDs become lookups',()=>{
 assert.match(n('truck terminal near NJ Turnpike exit 8A').text,/near New Jersey Turnpike Exit 8A, NJ/);
 assert.match(n('warehouses near exit 13A of the turnpike').text,/New Jersey Turnpike Exit 13A, NJ/);
 assert.match(n('industrial off GSP exit 129').text,/Garden State Parkway Exit 129, NJ/);
 assert.deepEqual(n('industrial in 08817').needs,{zip:'08817'});
 assert.deepEqual(n('26.6797, -80.1733').needs,{coords:[26.6797,-80.1733]});
 assert.match(n('https://www.google.com/maps/place/7777+Southern+Blvd,+West+Palm+Beach,+FL+33411').text,/^Show me 7777 Southern Blvd, West Palm Beach, FL 33411$/);
 assert.deepEqual(n('https://www.google.com/maps/@40.5268,-74.3640,17z').needs,{coords:[40.5268,-74.364]});
 assert.match(n('https://maps.app.goo.gl/AbCdEf123').answer,/Paste the street address/);
 assert.deepEqual(n('PCN 00-42-43-27-05-006-4201').needs,{pcn:'00424327050064201'});
 assert.deepEqual(n('Block 122 Lot 8.01 Edison NJ').needs,{blockLot:{block:'122',lot:'8.01',town:'Edison'}});
 assert.match(n('Block 12 Lot 3').answer,/Which town/);
 assert.equal(n('Industrial over 5 acres near 7777 Southern Blvd, West Palm Beach FL 33411').needs.zip,undefined,'a ZIP inside a street address is not a ZIP search');
});

test('pasted broker email: the address is pulled out and the unverifiable claims are named',()=>{
 const r=n('I hope all is well, I know this property owner VERY well, I have transacted with him in the past. He has 6.05 AC at 7777 Southern Blvd West Palm Beach, he would sell for ~$14M. Zoning has been changed from Agriculture to Industrial. What do you think?');
 assert.equal(r.text,'Show me 7777 Southern Blvd, West Palm Beach');
 assert.match(r.notes[0],/6\.05 acres/);assert.match(r.notes[0],/\$14M/);assert.match(r.notes[0],/cannot be confirmed from public records/);
});

test('statewide and out-of-coverage requests are explained, not guessed',()=>{
 assert.match(n('cold storage over 100000 sf in New Jersey').answer,/Statewide searches are not available/);
 assert.match(n('industrial anywhere in Florida').answer,/Statewide/);
 assert.ok(n('Edison NY industrial').notes.some(x=>/not connected/.test(x)));
 assert.ok(!n('industrial near 100 New York Ave Newark NJ').notes.some(x=>/not connected/.test(x)),'New York Avenue is a street, not a state');
});

test('follow-ups get honest answers, never a list that answers a different question',()=>{
 for(const q of ['whats the owners phone number','can I get the owner email','who do I call about this','how do I contact them'])assert.match(after(q).answer,/doesn't have owner phone numbers or emails/,q);
 for(const q of ['how much is it worth','what is it worth','assessed value?','what did it sell for'])assert.ok(after(q).intent==='value'||/sell/.test(q),q);
 for(const q of ['QOZ?','opp zone?','oz 2.0 status','is this in one of those new tax break zones','which ones get the tax benefit','opportunity zone map','any opportunity zones here'])assert.equal(after(q).text,'Which of these are in an opportunity zone?',q);
 assert.ok(['Which of these are in OZ 1?','are any of these OZ 1'].includes(after('are any of these OZ 1').text),'explicit OZ 1 questions reach the OZ 1 check');
 for(const q of ['explain that in plain english',"I don't understand",'what does that mean?','can you say that simpler'])assert.equal(after(q).text,'what does that mean',q);
 for(const q of ['start over','reset','clear everything','new search'])assert.equal(after(q).intent,'reset',q);
 assert.equal(after('what about bigger ones').text,'Show the largest properties in this scan');
 assert.match(after('smaller ones?').answer,/under 5 acres/);
 for(const q of ['only the ones near the highway','close to the turnpike only','near rail?','next to I-95'])assert.match(after(q).answer,/isn't a search filter yet/,q);
 assert.equal(after('who owns it').intent,'owner-referent');assert.equal(after('who owns that one').intent,'owner-referent');
});

test('requests the existing chat already handles pass through unchanged',()=>{
 for(const q of ['sort by acreage','the big one','Show only the ones over 20 acres','only over 8 acres','help','what can you do','go back','Summarize this for the board','export these','who owns the largest one','show me the biggest one','is it for sale','which ones are vacant','industrial over 10 acres','Industrial within 2 miles of 40 Hilton St Easton PA'])
  assert.equal(after(q).text.replace(/^Find /,''),q.replace(/^Find /,''),q);
 assert.equal(n('').text,'');assert.equal(n('   ').text,'');
});

// Resolver: a fake ArcGIS that answers like the real services.
function fakeFetch(routes){return async url=>{for(const [match,body] of routes)if(match.test(decodeURIComponent(url)))return {ok:true,json:async()=>typeof body==='function'?body(url):body};throw Error('unrouted '+url);};}
const feature=a=>({attributes:a});
test('resolver: PCN, block/lot, ZIP and coordinates use exact matches and refuse to guess',async()=>{
 const pbc=/Parcels_and_Property_Details/,nj=/Parcels_Composite_NJ_WM/,geo=/findAddressCandidates/;
 let r=await P.resolve(n('PCN 00-42-43-27-05-006-4201'),{fetcher:fakeFetch([[pbc,{features:[feature({SITE_ADDR_STR:'7777 SOUTHERN BLVD',MUNICIPALITY:'WEST PALM BEACH'})]}]])});
 assert.equal(r.text,'Show me 7777 Southern Blvd, West Palm Beach, FL');
 r=await P.resolve(n('PCN 00-42-43-27-05-006-4201'),{fetcher:fakeFetch([[pbc,{features:[]}]])});assert.match(r.answer,/did not return exactly one parcel/);
 r=await P.resolve(n('Block 122 Lot 8.01 Edison NJ'),{fetcher:fakeFetch([[nj,{features:[feature({PROP_LOC:'2005 LINCOLN HWY RT 27',MUN_NAME:'EDISON TWP',PAMS_PIN:'1205_122_8.01'})]}]])});
 assert.equal(r.text,'Show me 2005 Lincoln Hwy Rt 27, Edison, NJ');
 r=await P.resolve(n('Block 1 Lot 1 Monroe NJ'),{fetcher:fakeFetch([[nj,{features:[feature({PROP_LOC:'A',MUN_NAME:'MONROE TWP'}),feature({PROP_LOC:'B',MUN_NAME:'MONROE TWP'})]}]])});
 assert.match(r.answer,/matched 2 parcels/);
 r=await P.resolve(n('industrial in 08817'),{fetcher:fakeFetch([[geo,{candidates:[{score:100,attributes:{Addr_type:'Postal',City:'Edison',RegionAbbr:'NJ'}}]}]])});
 assert.equal(r.text,'Find industrial in Edison, NJ');
 r=await P.resolve(n('industrial in 10001'),{fetcher:fakeFetch([[geo,{candidates:[{score:100,attributes:{Addr_type:'Postal',City:'New York',RegionAbbr:'NY'}}]}]])});
 assert.match(r.answer,/ZIP 10001 is in NY/);
 r=await P.resolve(n('26.68012, -80.17173'),{fetcher:fakeFetch([[pbc,{features:[feature({SITE_ADDR_STR:'7777 SOUTHERN BLVD',MUNICIPALITY:'WEST PALM BEACH'})]}]])});
 assert.equal(r.text,'Show me 7777 Southern Blvd, West Palm Beach, FL');
 let calls=0;r=await P.resolve(n('26.6797, -80.1733'),{fetcher:fakeFetch([[pbc,()=>calls++?{features:[feature({SITE_ADDR_STR:'21 ATWELL DR',MUNICIPALITY:'WEST PALM BEACH'}),feature({SITE_ADDR_STR:'7777 SOUTHERN BLVD',MUNICIPALITY:'WEST PALM BEACH'})]}:{features:[]}]])});
 assert.match(r.answer,/on a road or between parcels, so I did not pick one/);assert.match(r.answer,/7777 Southern Blvd/);
 r=await P.resolve(n('-80.17173, 26.68012'),{fetcher:fakeFetch([[pbc,{features:[feature({SITE_ADDR_STR:'7777 SOUTHERN BLVD',MUNICIPALITY:'WEST PALM BEACH'})]}]])});
 assert.equal(r.text,'Show me 7777 Southern Blvd, West Palm Beach, FL','longitude-first coordinates are swapped back');
 r=await P.resolve(n('34.05, -118.25'),{fetcher:fakeFetch([])});assert.match(r.answer,/outside the parcel sources/);
 r=await P.resolve(n('PCN 00-42-43-27-05-006-4201'),{fetcher:async()=>{throw Error('network down');}});assert.match(r.answer,/Nothing was searched at a guessed location/);
});

test('resolver: value and owner follow-ups use the parcel the user is looking at',async()=>{
 const rows=[{key:'a',id:'A',address:'1 SMALL ST',acres:2,assessedValue:900000},{key:'b',id:'B',address:'100 OLYMPIC DR',acres:609.42,assessedValue:2323000,landValue:2133000,recordedSalePrice:5500000,recordedSaleDate:'2022-09-27T00:00:00Z'}];
 const bridge={getResults:()=>rows,getRecord:k=>rows.find(r=>r.key===k)};
 let r=await P.resolve(after('how much is it worth'),{bridge,selectedKey:'b'});
 assert.match(r.answer,/100 OLYMPIC DR: assessed \$2,323,000 · land \$2,133,000 · last recorded sale \$5,500,000 \(2022-09-27\)/);assert.match(r.answer,/not market value/);
 r=await P.resolve(after('how much is it worth'),{bridge,lastAction:'largest'});assert.match(r.answer,/100 OLYMPIC DR/);assert.ok(!/1 SMALL ST/.test(r.answer));
 const ownership={lookup:async row=>({status:'published',publishedName:'SYNTHETIC HOLDINGS LLC',row})};
 r=await P.resolve(after('who owns it'),{bridge,ownership,selectedKey:'b'});assert.match(r.answer,/100 OLYMPIC DR \(parcel B\): published assessment name SYNTHETIC HOLDINGS LLC/);
 r=await P.resolve(after('who owns it'),{bridge,ownership});assert.match(r.answer,/Which property do you mean/);
});
