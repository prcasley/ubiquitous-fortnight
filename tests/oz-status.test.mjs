import {test} from 'node:test';import assert from 'node:assert/strict';import C from '../assets/radar-oz-status-core.js';
const now=Date.parse('2026-10-28T16:00:00Z'),geoid='34023000100';
const sources={state:{enabled:true,authority:'state-government',state:'NJ',origin:'https://www.nj.gov'},treasury:{enabled:true,authority:'federal-certifier',origin:'https://home.treasury.gov'},tracker:{enabled:true,authority:'third-party',origin:'https://example.com'}};
const record=(r={})=>({geoid,round:'2027',stage:'state-nominated',sourceId:'state',sourceURL:'https://www.nj.gov/nomination.pdf',recordId:'synthetic-test-only',publishedAt:'2026-10-01',checkedAt:'2026-10-28T12:00:00Z',validUntil:'2027-01-01',...r});
test('no evidence is unknown, not a claim that certification is absent',()=>{const r=C.resolve(geoid);assert.equal(r.stage,'not-verified');assert.match(r.message,/does not establish/);});
test('a real nomination is stronger evidence but never certification probability',()=>{const r=C.resolve(geoid,{now,sources,records:[record()]});assert.equal(r.stage,'state-nominated');assert.equal(r.certificationVerified,false);assert.match(r.message,/does not predict approval/);});
test('only official federal certifier with exact tract and round can produce certified stage',()=>{const r=C.resolve(geoid,{now,sources,records:[record({sourceId:'treasury',stage:'certified',sourceURL:'https://home.treasury.gov/masterlist.csv'})]});assert.equal(r.certificationVerified,true);assert.match(r.message,/project-level/);});
for(const [name,override] of Object.entries({oldRound:{round:'2018'},wrongTract:{geoid:'34023000200'},expired:{validUntil:'2026-01-01'},future:{checkedAt:'2027-01-01'},thirdParty:{sourceId:'tracker',sourceURL:'https://example.com/report'},wrongState:{geoid:'12023000100'}}))test('does not promote '+name,()=>{assert.equal(C.resolve(geoid,{now,sources,records:[record(override)]}).certificationVerified,false);});
test('even a configured third-party host cannot claim federal certification',()=>{const configured={...sources,tracker:{...sources.tracker,authority:'federal-certifier'}};assert.equal(C.resolve(geoid,{now,sources:configured,records:[record({sourceId:'tracker',sourceURL:'https://example.com/report',stage:'certified'})]}).certificationVerified,false);});
test('a withdrawal conflicts with earlier records and removes a positive conclusion',()=>{assert.equal(C.resolve(geoid,{now,sources,records:[record(),record({withdrawn:true})]}).stage,'review-conflict');});
test('short or nonnumeric tract IDs cannot be joined',()=>assert.throws(()=>C.resolve('123'),/11-digit/));
test('published NJ nomination bundle resolves nominated tracts as state-nominated, never certified',async()=>{
 const {readFile}=await import('node:fs/promises');const b=JSON.parse(await readFile(new URL('../assets/data/oz-designation-evidence.json',import.meta.url)));
 assert.equal(b.records.length,130);assert.equal(new Set(b.records.map(r=>r.geoid)).size,130);assert.equal(new Set(b.records.map(r=>r.recordId)).size,130);assert.ok(b.records.every(r=>/^34\d{9}$/.test(r.geoid)&&r.stage==='state-nominated'));
 const S=(await import('../assets/radar-oz-status-core.js')).default;const r=b.records[0],now=Date.parse(r.checkedAt)+1000;
 const res=S.resolve(r.geoid,{...b,now});assert.equal(res.stage,'state-nominated');assert.equal(res.certificationVerified,false);assert.match(res.message,/not Treasury certification/);
 assert.equal(S.resolve('34023000100',{...b,now}).stage,'not-verified');
 assert.equal(S.resolve(r.geoid,{...b,now:Date.parse(r.checkedAt)+91*86400000}).stage,'not-verified','stale evidence expires');
});
