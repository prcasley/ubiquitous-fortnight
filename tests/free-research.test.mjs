import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as turf from '@turf/turf';
import D from '../assets/radar-public-data.js';
import C from '../assets/radar-research-tools-core.js';
import P from '../assets/radar-property.js';
import F from '../assets/radar-fieldpack-core.js';

test('public owner lookup uses exact official IDs, omits credentials and escapes SQL',async()=>{
  let request;
  const result=await D.lookupOwner({provider:'pbc',id:"A'1",state:'FL'}, {fetcher:async(url,options)=>{
    request={url:new URL(url),options};
    return {ok:true,json:async()=>({features:[{attributes:{PARID:"A'1",OWNER_NAME1:'SYNTHETIC HOLDINGS LLC'}}]})};
  }});
  assert.equal(request.url.hostname,'services1.arcgis.com');
  assert.equal(request.url.searchParams.get('where'),"PARID = 'A''1'");
  assert.equal(request.url.searchParams.get('outFields'),'PARID,OWNER_NAME1');
  assert.equal(request.options.credentials,'omit');assert.equal(request.options.headers,undefined);
  assert.equal(result.entityName,'SYNTHETIC HOLDINGS LLC');assert.ok(result.retrievedAt);
  assert.match(result.caveat,/not independently verified/);
});
test('statewide Florida IDs require county identity',async()=>{
  const fetcher=()=>{throw Error('unexpected network');};
  await assert.rejects(D.lookupOwner({provider:'fdor',id:'SAME-ID'},{fetcher}),/County identity/);
  let where;
  const result=await D.lookupOwner({provider:'fdor',jurisdiction:'60',id:'SAME-ID'},{fetcher:async url=>{
    where=new URL(url).searchParams.get('where');
    return {ok:true,json:async()=>({features:[{attributes:{PARCEL_ID:'SAME-ID',CO_NO:53,OWN_NAME:'WRONG LLC'}},{attributes:{PARCEL_ID:'SAME-ID',CO_NO:60,OWN_NAME:'CORRECT LLC',ASMNT_YR:2026}}]})};
  }});
  assert.match(where,/AND CO_NO = 60/);assert.equal(result.entityName,'CORRECT LLC');assert.equal(result.assessmentYear,2026);
});
test('ambiguous or failed ownership sources never select an owner',async()=>{
  const record={provider:'pbc',id:'A'};
  for(const features of [[],[1,2].map(()=>({attributes:{PARID:'A',OWNER_NAME1:'TEST LLC'}}))])
    await assert.rejects(D.lookupOwner(record,{fetcher:async()=>({ok:true,json:async()=>({features})})}),/match|conflicting/);
  await assert.rejects(D.lookupOwner(record,{fetcher:async()=>({ok:true,json:async()=>({error:{message:'outage'}})})}),/could not complete/);
  await assert.rejects(D.lookupOwner(record,{fetcher:async()=>({ok:true,json:async()=>({exceededTransferLimit:true,features:[{attributes:{PARID:'A',OWNER_NAME1:'TEST LLC'}}]})})}),/truncated/);
  assert.equal(D.entity('Jane Smith'),false);assert.equal(D.entity('SMITH FAMILY TRUST LLC'),false);
  assert.equal(D.entity('TEST INDUSTRIAL LLC'),true);
});
test('local comparable imports distinguish sale, asking and lease units',()=>{
  const rows=C.importComps('comp_id,address,transaction_type,sale_price,building_sqft,latitude,longitude\r\n1,"123 Main, Unit ""A""",closed sale,"$2,000,000",10000,40,-74\r\n2,Other,asking,2000000,10000,,\r\n3,Other,lease,20,10000,,');
  assert.equal(rows[0].address,'123 Main, Unit "A"');assert.equal(rows[0].pricePerBuildingSF,200);
  assert.equal(rows[1].pricePerBuildingSF,null);assert.equal(rows[2].pricePerBuildingSF,null);
  assert.equal(rows[1].lat,null);assert.equal(rows[2].lon,null);
  assert.throws(()=>C.importComps('id,address,type\n1,A,sale\n1,B,sale'),/duplicate/);
  assert.throws(()=>C.parseCSV('id,address\n1,"bad'),/Unclosed/);
  assert.throws(()=>C.parseCSV('id\n'+Array(5002).fill('1').join('\n')),/5,000/);
  assert.match(C.csv([{id:'=HYPERLINK("bad")',price:200}],['id','price']),/'=HYPERLINK/);
});
test('assemblies preserve holes and report overlap, disconnected and point records',()=>{
  const poly=x=>({type:'Polygon',coordinates:[[[x,0],[x+2,0],[x+2,2],[x,2],[x,0]]]});
  const geometry=poly(0);geometry.coordinates.push([[.2,.2],[.2,.4],[.4,.4],[.4,.2],[.2,.2]]);
  const items=[{id:'1',geometry,acres:2},{id:'2',geometry:poly(1),acres:3},{id:'3',geometry:poly(10),acres:null},{id:'4',geometry:{type:'Point',coordinates:[0,0]},acres:1}];
  assert.deepEqual(C.assemblySummary(items,turf),{count:4,knownAcreage:6,unknownAcreage:1,pointOnly:1,polygonComponents:2,overlappingPairs:1});
  assert.equal(C.geoJSON(items).features[0].geometry.coordinates.length,2);
});
test('public snapshots retain dated organization observations but exclude contacts and personal names',()=>{
  const base={key:'pbc:1',id:'1',provider:'pbc',state:'FL',lat:26,lon:-80,geometry:{type:'Point',coordinates:[-80,26]},ownership:{entityName:'TEST LLC',classification:'organization-style',sourceURL:'https://example.org',retrievedAt:'2026-10-26',contacts:['private'],publishedName:'TEST LLC'}};
  const snapshot=P.snapshot(base);assert.equal(snapshot.ownership.entityName,'TEST LLC');assert.equal(snapshot.provider,'pbc');
  assert.equal(P.snapshot(snapshot).ownership.entityName,'TEST LLC');
  assert.doesNotMatch(JSON.stringify(snapshot),/contacts|publishedName|private/);
  assert.equal(P.snapshot({...base,ownership:{publishedName:'Jane Smith',classification:'unclassified'}}).ownership,null);
  const pack=F.packetHTML([{property:snapshot,screenings:[{kind:'manual-flood',status:'source-observation',retrievedAt:'2026-10-26',sourceURL:'https://example.org/evidence',caveat:'Verify the flood observation'},{kind:'manual-power',sourceURL:'javascript:alert(1)',caveat:'Not checked'}]}]);
  assert.match(pack,/TEST LLC/);assert.match(pack,/https:\/\/example.org\/evidence/);assert.doesNotMatch(pack,/javascript:|contacts|private/);
});
