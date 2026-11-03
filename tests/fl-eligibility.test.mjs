import {test} from 'node:test';import assert from 'node:assert/strict';import * as turf from '@turf/turf';
import P from '../assets/radar-property.js';import O from '../assets/radar-oz-research.js';
const row={key:'pbc:FL:00424327050064201',id:'00424327050064201',provider:'pbc',state:'FL',geometry:turf.bboxPolygon([-80.175,26.678,-80.172,26.681]).geometry,lat:26.6797,lon:-80.1733,address:'7777 SOUTHERN BLVD',type:'Vacant industrial',acres:6.05};
const tract=(geoid,designatio,extra={})=>({type:'Feature',properties:{GEOID:geoid,designatio,tract_pove:0.12292531,Median_Fam:'$81,309',MetroArea_:'89212',...extra},geometry:turf.bboxPolygon([-80.2,26.6,-80.1,26.7]).geometry});
const fetcherFor=features=>{let n=0;return async()=>({ok:true,json:async()=>n++?{features}:{count:features.length}})};
test('FloridaCommerce sources point at the official state layers and are labeled as eligibility, not nominations',()=>{
 assert.match(O.sources.ozFL.url,/services1\.arcgis\.com\/HpJC1O7FLVQlHgaG\/arcgis\/rest\/services\/oppzones_ustreasury_met\//);
 assert.match(O.sources.ozFLNot.url,/oppzones_ustreasury_NotMet\//);assert.match(O.sources.ozFL.name,/not a nomination list/);
 assert.ok(!/OWNER|Organization|Contact/i.test(O.sources.ozFL.fields+O.sources.ozFLNot.fields),'no contact or owner fields requested');});
test('7777 Southern Blvd pattern: NotMet tract carries its published poverty and income facts',async()=>{
 const r=await O.check([row],{kind:'ozFLNot',geo:turf,fetcher:fetcherFor([tract('12099007833','Does not Meets Criteria')])});
 assert.equal(r.observations[0].status,'reference-intersection');assert.deepEqual(r.observations[0].tracts,['12099007833']);
 const d=r.observations[0].tractDetails[0];assert.equal(d.designation,'Does not Meets Criteria');assert.equal(d.familyIncome,'$81,309');assert.equal(d.areaIncome,'89212');});
for(const [name,features,kind] of [['unrecognized designation',[tract('12099000222','Meets Criteria (draft)')],'ozFL'],['designation from the other layer',[tract('12099000222','Does not Meets Criteria')],'ozFL'],['non-Florida GEOID',[tract('34013001000','Meets Criteria')],'ozFL'],['repeated tract',[tract('12099000222','Meets Criteria'),tract('12099000222','Meets Criteria')],'ozFL']])
 test('FloridaCommerce '+name+' is refused before any parcel is classified',async()=>{await assert.rejects(O.check([row],{kind,geo:turf,fetcher:fetcherFor(features)}));});
const obs=(details,status='reference-intersection')=>({kind:'ozFL',status,tracts:details.map(t=>t.geoid),tractDetails:details,checkedAt:'2026-11-03T18:00:00Z'});
const met={geoid:'12099000222',designation:'Meets Criteria',poverty:0.25811688,familyIncome:'$49,911',areaIncome:'89212'},notMet={geoid:'12099007833',designation:'Does not Meets Criteria',poverty:0.12292531,familyIncome:'$81,309',areaIncome:'89212'};
test('labels: meets, does not meet, both, none and unavailable never claim nomination or certification',()=>{
 const label=o=>P.ozLabel({...row,ozObservation:o,ozObservations:{ozFL:o}});
 assert.match(label(obs([met])),/tract 12099000222 \(poverty 25\.8%, family income \$49,911 vs area \$89,212\) meets the criteria/);
 assert.match(label(obs([notMet])),/tract 12099007833 \(poverty 12\.3%, family income \$81,309 vs area \$89,212\) does not meet the criteria/);
 assert.match(label(obs([met,notMet])),/touches tracts that meet .* and do not meet/);
 assert.match(label(obs([],'no-reference-intersection')),/not an eligibility finding/);
 assert.match(label(obs([],'unavailable')),/no eligibility or ineligibility was inferred/);
 for(const o of [obs([met]),obs([notMet]),obs([],'unavailable')]){const l=label(o);assert.ok(l.includes('No official state nomination list connected for FL'));assert.ok(!/NJ-nominated|is nominated|certified tract/i.test(l));}});
test('OZ 1.0 reference overlap is separate and has no invented sunset',()=>{const o=obs([notMet]);const l=P.ozLabel({...row,ozObservation:o,ozObservations:{ozFL:o,oz1:{kind:'oz1',status:'reference-intersection',tracts:['12099007833']}}});assert.match(l,/Also intersects 2018 OZ 1\.0 tract 12099007833/);assert.ok(!l.includes('2028'));});
test('snapshots keep only the two official designations and bounded facts',()=>{
 const o=obs([{...met,poverty:7,OWNER:'x'},{...notMet,designation:'Approved Nomination'}]);const s=P.snapshot({...row,ozObservation:o,ozObservations:{ozFL:o}}).ozObservation;
 assert.equal(s.kind,'ozFL');assert.equal(s.tractDetails[0].designation,'Meets Criteria');assert.equal(s.tractDetails[0].poverty,null);assert.equal(s.tractDetails[0].OWNER,undefined);assert.equal(s.tractDetails[1].designation,undefined);});

test('dated Florida snapshot expires and never establishes nomination or certification',async()=>{
 const {readFile}=await import('node:fs/promises'),C=(await import('../assets/radar-fl-eligibility-core.js')).default;
 const bundle=JSON.parse(await readFile(new URL('../assets/data/fl-oz-eligibility.json',import.meta.url))),now=Date.parse(bundle.checkedAt)+1000,index=C.validate(bundle,now);
 assert.equal(index.size,5076);assert.equal(index.get('12099007833').criteria,'not-met');assert.equal(index.get('12099007833').medianFamilyIncome,81309);
 assert.throws(()=>C.validate(bundle,Date.parse(bundle.validUntil)+1),/expired/);
 assert.throws(()=>C.validate({...bundle,certificationVerified:true},now),/invalid/);
 const r={...row,ozObservation:obs([notMet]),ozObservations:{ozFL:obs([notMet]),oz1:{kind:'oz1',status:'reference-intersection',tracts:['12099007833'],checkedAt:bundle.checkedAt}}};
 const saved=P.snapshot(r);assert.equal(saved.ozObservations.oz1.tracts[0],'12099007833');
 const F=(await import('../assets/radar-fieldpack-core.js')).default,html=F.packetHTML([{property:saved}]);assert.match(html,/does not meet the criteria/);assert.match(html,/Also intersects 2018 OZ 1\.0 tract 12099007833/);assert.ok(!html.includes('2028'));
});
