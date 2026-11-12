import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const d=JSON.parse(await readFile(new URL('../assets/data/oz2-designations.json',import.meta.url)));
await import('../assets/radar-oz2-designations.js');const D=globalThis.RadarOZ2Designations;D.load(d);
const C=(await import('../assets/radar-executive-card-core.js')).default;
const P=await import('../assets/radar-property.js').then(()=>globalThis.RadarProperty).catch(()=>null);

test('Treasury SB0682 list: 130 NJ tracts, exactly the NJ nomination set, 13 rural, 342 FL',async()=>{
 assert.equal(d.source.release,'SB0682');assert.equal(d.totals.national,6576);assert.equal(d.totals.NJ,130);assert.equal(d.totals.NJRural,13);assert.equal(d.totals.FL,342);
 const g=JSON.parse(await readFile(new URL('../assets/data/nj-nomination-downloads/NJ_OZ2_2026_Nominations.geojson',import.meta.url)));
 const nominated=new Set(g.features.map(f=>f.properties.Geography)),designated=new Set(Object.keys(d.tracts).filter(k=>d.tracts[k].state==='NJ'));
 assert.deepEqual([...nominated].sort(),[...designated].sort());
 const ruralNominated=new Set(g.features.filter(f=>f.properties.Rural==='Yes').map(f=>f.properties.Geography));
 assert.deepEqual([...ruralNominated].sort(),Object.keys(d.tracts).filter(k=>d.tracts[k].state==='NJ'&&d.tracts[k].rural).sort());
 assert.deepEqual(d.totals.NJCohort2018,{retained:66,new:36,partial:27,unknown:1});
});

const nj=geoid=>({state:'NJ',ozObservations:{ozNJ:{kind:'ozNJ',status:'reference-intersection',nominationVerified:true,coverageBasis:'parcel-area',overlapPercent:99,tractDetails:[{geoid}]}}});
test('NJ card shows Treasury label with cohort and rural badges',()=>{
 const rural=Object.keys(d.tracts).find(k=>d.tracts[k].state==='NJ'&&d.tracts[k].rural);const fresh=Object.keys(d.tracts).find(k=>d.tracts[k].cohort2018==='new');
 assert.match(C.oz(nj(rural)),/Certified by U\.S\. Treasury/);
 assert.ok(C.ozBadges(nj(rural)).some(b=>b.text==='Rural OZ 2.0 (50% Improvement Threshold · 30% Step-Up)'));
 assert.deepEqual(C.ozBadges(nj(fresh)).map(b=>b.text).slice(0,1),['Brand-new 2026 designation']);
 const partial=nj(fresh);partial.ozObservations.ozNJ.overlapPercent=40;assert.deepEqual(C.ozBadges(partial),[]);
});

const fl=(geoid,met='met')=>({state:'FL',ozObservations:{ozFL:{kind:'ozFL',status:'reference-intersection',eligibilityStatus:met,tractDetails:[{geoid,poverty:.3}]}}});
test('FL card says Designated only for tracts on the Treasury list',()=>{
 const yes=Object.keys(d.tracts).find(k=>d.tracts[k].state==='FL');
 assert.match(C.oz(fl(yes)),/^Designated OZ 2\.0 \(Effective Jan 1, 2027\)/);
 assert.match(C.oz(fl('12099999999')),/^OZ 2\.0 eligible · not designated by Treasury/);
 assert.match(C.oz(fl('12099999999','not-met')),/^Not an OZ 2\.0 tract/);
});

test('EPA on-site facility leads only after owner and carrier, and never names an owner',()=>{
 const epa=[{role:'on-site-facility-not-owner',name:'DAVY COLD STORAGE CORP',sourceURL:'https://frs-public.epa.gov/ords/frs_public2/fii_query_detail.disp_program_facility?p_registry_id=110030803496',industry:'4222: Refrigerated Warehousing',active:true}];
 const base={state:'NJ',id:'0614_1005_13'};
 const o=C.getPrimaryDisplayOwner(base,{epa});assert.equal(o.role,'ON-SITE FACILITY (EPA)');assert.equal(o.name,'DAVY COLD STORAGE CORP');assert.match(o.note,/^Not confirmed owner — operator recorded by EPA · Refrigerated Warehousing/);
 const carrier={carrierName:'M J D TRUCKING INC',sourceURL:'https://ai.fmcsa.dot.gov/x',businessPhone:'8562059490',email:'ops@example.com'};
 const c=C.getPrimaryDisplayOwner(base,{epa,usdot:carrier});assert.equal(c.tier,'carrier');assert.equal(c.email,'ops@example.com');
 const owned=C.getPrimaryDisplayOwner({...base,publishedOwner:{status:'published',publishedName:'REAL OWNER LLC',sourceURL:'https://county.example/x'}},{epa});assert.equal(owned.tier,'owner');
 const prot=C.getPrimaryDisplayOwner({...base,publishedOwner:{protectedName:true}},{epa});assert.equal(prot.tier,'facility');
});
