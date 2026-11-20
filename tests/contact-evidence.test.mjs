import test from 'node:test';import assert from 'node:assert/strict';import V from '../assets/radar-contact-verifier.js';
const p={id:'1201_1_1',address:'100 N Main St',municipality:'Carteret',state:'NJ'};const c={parcelId:p.id,address:p.address,city:p.municipality,state:'NJ',company:'Example business',role:'Carrier, not owner',checkedAt:new Date().toISOString(),fields:[{type:'phone',value:'7324424630',evidenceValue:'7324424630',company:'Example business',sourceUrl:'https://data.transportation.gov/record',method:'source-observed'}]};
test('missing evidence cannot create call buttons',()=>{assert.equal(V.verify(p,{...c,fields:[]}).fields.length,0);assert.equal(V.verify(p,{...c,fields:[{...c.fields[0],evidenceValue:undefined}]}).fields.length,0)});
test('town, direction, street type and parcel mismatches block contacts',()=>{for(const patch of [{city:'Newark'},{address:'100 S Main St'},{address:'100 N Main Ave'},{parcelId:'1201_1_2'}])assert.equal(V.verify(p,{...c,...patch}).fields.length,0)});
test('stale and future observations are withheld',()=>{for(const checkedAt of ['2020-01-01','2099-01-01'])assert.equal(V.verify(p,{...c,checkedAt}).fields.length,0)});
test('exact source-supported business contact remains callable',()=>assert.equal(V.verify(p,c).fields.length,1));
test('unavailable carrier service is not zero matches',async()=>{await assert.rejects(V.lookup(p,async()=>({ok:false,status:503})),/unavailable/)});
test('actual parcel shape maps municipality',()=>assert.equal(V.parcel({id:'x',state:'NJ',original:{PROP_LOC:'100 Main St',MUN_NAME:'CARTERET BORO'}}).city,'CARTERET BORO'));

test('town aliases follow carrier filing names without merging different municipalities',()=>{assert.deepEqual(V.towns('ORANGE CITY TWP'),['ORANGE CITY','ORANGE']);assert.ok(V.sameTown('ORANGE CITY TWP','ORANGE'));assert.ok(V.sameTown('JERSEY CITY CITY','JERSEY CITY'));assert.ok(V.sameTown('GLOUCESTER CITY','GLOUCESTER CITY'));assert.ok(V.sameTown('Carteret','CARTERET BORO'));assert.equal(V.sameTown('UNION TWP','UNION CITY'),false);assert.equal(V.sameTown('UNION CITY CITY','UNION'),false);});
test('carrier lookup filters town and house number at the source instead of downloading the town',async()=>{const urls=[];const row={dot_number:'1',legal_name:'Example Carrier',phy_street:'60 GRANT AVE',phy_city:'ORANGE',phy_state:'NJ',phone:'7325550100',status_code:'A'};const r=await V.lookup({id:'x',address:'60 Grant Avenue',municipality:'ORANGE CITY TWP',state:'NJ'},async u=>{urls.push(new URL(u).searchParams);return {ok:true,json:async()=>[row,{...row,dot_number:'2',phy_street:'60 GRANT ST'}]};});assert.equal(urls.length,1);assert.match(urls[0].get('$where'),/upper\(phy_city\) in \('ORANGE CITY','ORANGE'\) AND upper\(phy_street\) like '60 %'/);assert.equal(r.contacts.length,1);assert.equal(r.complete,true);assert.equal(V.verify({id:'x',address:'60 Grant Avenue',municipality:'ORANGE CITY TWP',state:'NJ'},r.contacts[0]).fields.length,1);});
test('a town name absent from carrier filings is reported as unchecked, never as no carriers',async()=>{const r=await V.lookup({id:'x',address:'1 Main St',municipality:'UPPER TWP',state:'NJ'},async u=>({ok:true,json:async()=>new URL(u).searchParams.get('$select').startsWith('count')?[{n:'0'}]:[]}));assert.equal(r.complete,false);assert.equal(r.townListed,false);assert.match(r.status,/not a confirmed absence/);const listed=await V.lookup({id:'x',address:'1 Main St',municipality:'CARTERET BORO',state:'NJ'},async u=>({ok:true,json:async()=>new URL(u).searchParams.get('$select').startsWith('count')?[{n:'412'}]:[]}));assert.equal(listed.complete,true);assert.match(listed.status,/No active carrier match/);});
test('shared NJ town names are flagged on the contact role',()=>{assert.match(V.fromCarrier({id:'x',address:'1 Main St',municipality:'WASHINGTON TWP',state:'NJ'},{legal_name:'A',phy_street:'1 MAIN ST',phy_city:'WASHINGTON',phy_state:'NJ'},'https://data.transportation.gov/x',new Date().toISOString()).role,/more than one NJ municipality/);});

test('Florida and Pennsylvania carrier leads require exact state, city and street',async()=>{
 for(const [state,city] of [['PA','EASTON'],['FL','WEST PALM BEACH']]){
  const parcel={id:'source-key',state,municipality:city,address:'20 Market Street'};
  const row={dot_number:1,legal_name:'Example Carrier',phy_street:'20 MARKET ST',phy_city:city,phy_state:state,phone:'7325550100',status_code:'A'};
  const result=await V.lookup(parcel,async url=>{
   assert.match(new URL(url).searchParams.get('$where'),new RegExp("phy_state='"+state+"'"));
   return {ok:true,json:async()=>[row,{...row,phy_state:'NJ'},{...row,phy_city:city+' TOWNSHIP'}]};
  });
  assert.equal(result.contacts.length,1);
  assert.equal(V.verify(parcel,result.contacts[0]).fields.length,1);
 }
});

test('address ranges are bounded research leads without callable fields',async()=>{
 const parcel={id:'range',address:'50-78 Carter Dr',municipality:'Edison',state:'NJ'};
 const row={dot_number:11,legal_name:'Warehouse Carrier',phy_street:'55 CARTER DRIVE',phy_city:'EDISON',phy_state:'NJ',phone:'7325550100',status_code:'A'};
 const result=await V.lookup(parcel,async url=>{
  const where=new URL(url).searchParams.get('$where');
  assert.match(where,/like '55 %'/);
  assert.doesNotMatch(where,/like '79 %'/);
  return {ok:true,json:async()=>[row,{...row,dot_number:12,phy_street:'80 CARTER DRIVE'},{...row,dot_number:13,phy_street:'55 NORTH CARTER DRIVE'}]};
 });
 assert.equal(result.contacts.length,0);
 assert.deepEqual(result.leads.map(l=>l.reason),['Street number within reported range']);
 assert.equal(result.leads[0].fields,undefined);
 assert.equal(JSON.stringify(result).includes(row.phone),false);
});

test('spelling variants and inactive exact filings stay research leads',async()=>{
 const parcel={id:'exact',address:'20 Center Turnpike',municipality:'Edison',state:'NJ'};
 const row={dot_number:10,legal_name:'Example Carrier',phy_street:'20 CTR TPKE',phy_city:'EDISON',phy_state:'NJ',phone:'7325550100',status_code:'A'};
 const result=await V.lookup(parcel,async()=>({ok:true,json:async()=>[
  row,{...row,dot_number:11,phy_street:'20 CENTER TURNPIKE',status_code:'I'},
  {...row,dot_number:12,phy_street:'20 CENTER ROAD'},{...row,dot_number:13,phy_city:'NEWARK'}
 ]}));
 assert.equal(result.contacts.length,0);
 assert.deepEqual(result.leads.map(l=>l.reason),['Address spelling variant','Carrier status not active']);
 assert.equal(JSON.stringify(result).includes(row.phone),false);
});

test('missing street number skips the carrier query',async()=>{
 const result=await V.lookup({id:'road',address:'Washington Road',municipality:'Edison',state:'NJ'},async()=>{assert.fail('Unexpected carrier request');});
 assert.equal(result.contacts.length,0);
 assert.match(result.status,/street number/);
});
