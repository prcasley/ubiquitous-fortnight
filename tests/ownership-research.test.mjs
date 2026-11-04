import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import * as turf from '@turf/turf';
import C from '../assets/radar-ownership-research-core.js';import S from '../assets/radar-public-data.js';
const record={state:'NJ',provider:'njgin',id:'0909_21_2.03_C0001',original:{PROP_CLASS:'4B',PCL_MUN:'0909',PCLBLOCK:'21',PCLLOT:'2.03',PCLQCODE:'C0001',COUNTY:'Hudson',MUN_NAME:'Secaucus'},lat:40.79,lon:-74.07,geometry:turf.bboxPolygon([-74.071,40.789,-74.069,40.791])};
test('commercial class does not establish an organization owner and residential/unknown classes are excluded from extra research',()=>{
 assert.ok(C.businessParcel(record));for(const cls of ['2','4C','3A','15A',''])assert.equal(C.businessParcel({...record,original:{PROP_CLASS:cls}}),false);
 assert.equal(C.businessParcel({state:'FL',original:{DOR_UC:'000'}}),false);assert.equal(C.businessParcel({state:'FL',original:{DOR_UC:'048'}}),true);assert.equal(C.businessParcel({state:'PA',type:'Other'}),false);
});
test('parcel references preserve municipality, decimals and condo qualifiers; portal references are not labelled exact cards',()=>{
 const r=C.officialLinks(record);assert.equal(r.identity.qualifier,'C0001');assert.match(r.copyText,/0909.*21.*2\.03.*C0001/);assert.ok(r.links.some(l=>l.label.includes('Hudson')));assert.ok(r.links.every(l=>!/^Open.*exact/i.test(l.label)));assert.ok(!r.links.some(l=>l.url.includes('ctb12')));
});
test('mailing associations preserve street types and suites and never generate an owner',()=>{
 const a={street:'123 Main Street Suite 100',cityState:'Secaucus NJ',zip:'07094'},b={...a,street:'123 Main St STE 100'};
 assert.equal(C.mailingKey(a),C.mailingKey(b));assert.notEqual(C.mailingKey(a),C.mailingKey({...a,street:'123 Main St STE 200'}));assert.notEqual(C.mailingKey(a),C.mailingKey({...a,street:'123 Main Ave STE 100'}));assert.equal(C.mailingKey({...a,street:''}),null);
 const groups=C.sharedMailings([{parcelId:'a',mailing:a,entityName:'OWNER A LLC'},{parcelId:'b',mailing:b}]);assert.deepEqual([...groups.values()],[['a','b']]);
});
test('nomination counts come from dated evidence and never fall back to 130/60/13 or infer zero eligibility',()=>{
 const bundle=JSON.parse(readFileSync(new URL('../assets/data/oz-designation-evidence.json',import.meta.url))),now=Date.parse('2026-11-04T12:00:00Z'),stats=C.nominationStats(bundle,now);
 assert.deepEqual([stats.tractCount,stats.countyCount,stats.municipalityCount,stats.ruralCount],[130,20,60,13]);assert.ok(!stats.counties.includes('Hunterdon'));assert.equal(C.nominationStats({},now).status,'unavailable');assert.equal(C.nominationStats(bundle,Date.parse('2027-02-01')).status,'expired');
 const noRural=structuredClone(bundle);for(const r of noRural.records)delete r.sourceRuralFlag;assert.equal(C.nominationStats(noRural,now).ruralCount,null);assert.ok(!C.statsText(stats).includes('0 eligible'));assert.ok(!C.statsText(stats).includes('2026-11-27'));
});
function fakeResearch({owner='TEST HOLDINGS LLC',classCode='4B',conflict=false}={}){const calls=[];return {calls,fetcher:async url=>{calls.push(String(url));const u=new URL(url);if(!u.pathname.endsWith('/query'))return {ok:true,json:async()=>({fields:['PAMS_PIN','OWNER_NAME','ST_ADDRESS','CITY_STATE','ZIP_CODE','PCL_MUN','PCLBLOCK','PCLLOT','PCLQCODE','PROP_CLASS','COUNTY'].map(name=>({name}))})};const a={PAMS_PIN:record.id,OWNER_NAME:owner,ST_ADDRESS:'123 Main St STE 100',CITY_STATE:'Secaucus NJ',ZIP_CODE:'07094',PROP_CLASS:classCode};return {ok:true,json:async()=>({features:[{attributes:a},...(conflict?[{attributes:{...a,ST_ADDRESS:'Different'}}]:[])]})};}};}
test('selected NJ research requests only metadata-verified fields with exact qualified identity',async()=>{
 const f=fakeResearch(),r=await S.lookupResearch(record,{fetcher:f.fetcher,core:C});assert.equal(r.entityName,'TEST HOLDINGS LLC');assert.equal(r.mailing.street,'123 Main St STE 100');assert.equal(r.reference.qualifier,'C0001');
 const q=new URL(f.calls.at(-1)).searchParams;assert.equal(q.get('where'),"PAMS_PIN = '0909_21_2.03_C0001'");assert.ok(!q.get('outFields').includes('MUN_CODE'));assert.ok(!q.get('outFields').includes('*'));
});
test('protected names suppress extra mailing, changed residential classes are refused and conflicts fail closed',async()=>{
 let f=fakeResearch({owner:'PROTECTED'});assert.equal((await S.lookupResearch(record,{fetcher:f.fetcher,core:C})).mailing,null);
 f=fakeResearch({classCode:'2'});assert.equal((await S.lookupResearch(record,{fetcher:f.fetcher,core:C})).status,'restricted');
 f=fakeResearch({conflict:true});await assert.rejects(S.lookupResearch(record,{fetcher:f.fetcher,core:C}),/Conflicting/);
});
test('facility references cannot populate ownership; missing coordinates and malformed/unknown empties are refused',async()=>{
 const f={RegistryID:'110000123456',FacName:'POSSIBLE SITE OPERATOR LLC',FacLat:40.79,FacLong:-74.07};
 const r=await S.lookupFacilities(record,{core:C,geo:turf,fetcher:async()=>({ok:true,json:async()=>({Results:{Facilities:[f]}})})});assert.equal(r.facilities[0].role,'facility-reference-not-owner');assert.equal(r.facilities[0].insideParcel,true);assert.equal(r.ownerName,undefined);assert.equal(r.entityName,undefined);
 assert.throws(()=>C.facilityRows({Results:{Facilities:[{...f,FacLat:null}]}}));assert.throws(()=>C.facilityRows({Results:{QueryRows:null}}));assert.deepEqual(C.facilityRows({Results:{QueryRows:'0'}}),[]);
});
test('Lehigh PIN join requires verified schema, exact PIN and primary row; conflicts never select the first owner',async()=>{
 const r={state:'PA',provider:'lehigh',id:'P1',source:{url:'https://gis.lehighcounty.org/arcgis/rest/services/Verified/FeatureServer/1'}};const calls=[];
 const result=await S.lookupLehighOwner(r,{ownerLayerURL:'https://gis.lehighcounty.org/arcgis/rest/services/Verified/FeatureServer/0',fetcher:async url=>{calls.push(String(url));return {ok:true,json:async()=>String(url).includes('/query?')?{features:[{attributes:{PIN:'P1',PARNUM:1,OWNER_NAME:'VERIFIED LAYER LLC'}}]}:{fields:[{name:'PIN',type:'esriFieldTypeString'},{name:'PARNUM',type:'esriFieldTypeInteger'},{name:'OWNER_NAME',type:'esriFieldTypeString'}]}};}});
 assert.equal(result.entityName,'VERIFIED LAYER LLC');assert.equal(new URL(calls.at(-1)).searchParams.get('where'),"PIN = 'P1' AND PARNUM = 1");assert.ok(!new URL(calls.at(-1)).searchParams.get('outFields').includes('*'));
 await assert.rejects(S.lookupLehighOwner(r,{ownerLayerURL:'https://evil.example/FeatureServer/0'}),/verified parcel service origin/);
});
test('Florida recipient projection uses declared fields and preserves the statewide county guard',async()=>{
 const r={state:'FL',provider:'fdor',id:'FDOR-1',jurisdiction:'60',original:{DOR_UC:'048'}},calls=[],attributes={PARCEL_ID:'FDOR-1',CO_NO:60,OWN_NAME:'FL OBSERVED LLC',OWN_ADDR1:'1 Published St',OWN_CITY:'West Palm Beach',OWN_STATE:'FL',OWN_ZIPCD:'33401'};
 const result=await S.lookupResearch(r,{core:C,fetcher:async url=>{calls.push(String(url));return {ok:true,json:async()=>String(url).includes('/query?')?{features:[{attributes}]}:{fields:Object.keys(attributes).map(name=>({name}))}};}});
 assert.equal(result.entityName,'FL OBSERVED LLC');assert.equal(result.mailing.cityState,'West Palm Beach, FL');const q=new URL(calls.at(-1)).searchParams;assert.match(q.get('where'),/CO_NO = 60/);assert.ok(q.get('outFields').includes('OWN_ADDR1'));assert.ok(!q.get('outFields').includes('OWN_ADDR2'));assert.ok(!q.get('outFields').includes('*'));
 await assert.rejects(S.lookupResearch({...r,jurisdiction:'999'},{core:C}),/county required/);
});
test('published imported owners preserve names and provenance without promoting or loosely joining them',()=>{
 const archive=JSON.parse(readFileSync(new URL('../assets/data/recovered-reference.json',import.meta.url))),file=JSON.parse(readFileSync(new URL('../assets/data/imported-owner-records.json',import.meta.url)));
 assert.equal(file.records.length,1490);assert.equal(file.records.filter(r=>r.state==='FL').length,439);assert.equal(file.records.filter(r=>r.state==='PA').length,1051);assert.equal(file.records.filter(r=>r.state==='NJ').length,0);
 for(const row of file.records){const original=archive.records.find(r=>r.archiveKey===row.archiveKey);assert.ok(original);assert.equal(row.owner,original.owner);assert.equal(row.ownerMailing,original.ownerMailing??null);assert.equal(row.currentOwnershipVerified,false);assert.equal(row.recordedInFileDate,archive.fileGeneratedAt);assert.ok(!Object.keys(row).some(k=>/rank|strategy|contact|notes|terms/i.test(k)));}
 const synthetic={...file,records:[{state:'NJ',pcn:'0909_21_2.03_C0001',owner:'HISTORICAL LLC'},{state:'PA',pcn:'A 12',owner:'ROW LLC'}]};assert.equal(C.importedMatches(synthetic,record).length,1);assert.equal(C.importedMatches(synthetic,{...record,id:'0909_21_2.03'}).length,0);assert.equal(C.importedMatches(synthetic,{state:'PA',id:'A1 2'}).length,0);assert.deepEqual(C.importedMatches(synthetic,null),[]);
});
