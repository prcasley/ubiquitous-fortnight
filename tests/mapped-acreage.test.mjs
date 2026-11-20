import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,readdirSync} from 'node:fs';import * as turf from '@turf/turf';
import {acreage,correct,csvPrune,tractRow,mappedAcres} from '../scripts/apply-mapped-acreage.mjs';
const box=(w,h)=>turf.bboxPolygon([-74.4,40.5,-74.4+w,40.5+h]).geometry;
const rec=(id,published,geometry,extra={})=>({parcelId:id,facts:{PAMS_PIN:id,CALC_ACRE:published,PROP_CLASS:'4B',PROP_LOC:'1 MAIN ST',MUN_NAME:'TOWN'},geometry,tractReferences:['34000000001'],njdepContext:{sites:[],interests:[]},evidence:[],...extra});
const big=box(.003,.003),small=box(.0003,.0003);
test('square feet stored as acres are replaced by mapped area; a close published figure is kept',()=>{const sqft=acreage(rec('a',98922,small));assert.equal(sqft.basis,'mapped-geometry');assert.ok(sqft.effective<1);const m=mappedAcres(big),close=acreage(rec('b',m*1.1,big));assert.equal(close.basis,'published');assert.equal(close.effective,m*1.1);assert.equal(acreage(rec('c',m*1.3,big)).basis,'mapped-geometry');});
test('lots under the minimum are removed unless they carry a reviewed contact, and correction is idempotent',()=>{const rows=[rec('a',98922,small),rec('b',20,big),rec('keep',5,small)],first=correct(rows,{keep:new Set(['keep'])});assert.deepEqual(first.kept.map(r=>r.parcelId),['b','keep']);assert.deepEqual(first.dropped.map(d=>d.parcelId),['a']);assert.equal(first.kept[1].facts.BELOW_MINIMUM_ACRES,true);assert.equal(first.kept[0].facts.CALC_ACRE_PUBLISHED,20);const again=correct(first.kept,{keep:new Set(['keep'])});assert.deepEqual(again.kept.map(r=>[r.parcelId,r.facts.CALC_ACRE,r.facts.CALC_ACRE_PUBLISHED]),first.kept.map(r=>[r.parcelId,r.facts.CALC_ACRE,r.facts.CALC_ACRE_PUBLISHED]));});
test('tract rows count only qualifying parcels and separate active from inactive carrier filings',()=>{const {kept}=correct([rec('a',30,big,{usdotContext:{carrierName:'A',status:'ACTIVE',businessPhone:'9735550100',email:'dispatch@example.com'}}),rec('b',30,big,{usdotContext:{carrierName:'B',status:'INACTIVE',businessPhone:'9735550101',email:'inactive@example.com'}}),rec('k',5,small)],{keep:new Set(['k'])}),row=tractRow({tract:'34000000001'},kept);assert.equal(row.parcels2acPlus,2);assert.equal(row.onSiteCarriers,2);assert.equal(row.activeOnSiteCarriers,1);assert.equal(row.carrierPhone,1);assert.equal(row.carrierEmail,1);});
test('CSV keeps only surviving parcels and gains acreage columns once',()=>{const {kept}=correct([rec('b',20,big)]),byId=new Map(kept.map(r=>[r.parcelId,r])),out=csvPrune('PAMS_PIN,PROP_LOC\na,"1 MAIN, REAR"\nb,2 MAIN\n',byId),again=csvPrune(out,byId);assert.equal(out.split('\n')[0],'PAMS_PIN,PROP_LOC,ACRES,ACRES_PUBLISHED_FIELD,ACRES_MAPPED,ACREAGE_BASIS');assert.equal(out.trim().split('\n').length,2);assert.equal(again,out);});
test('the published inventory holds no lot under 2 effective acres and every record states its acreage basis',()=>{const dir=new URL('../assets/data/nj-research/',import.meta.url);let n=0,acres=0;for(const f of readdirSync(dir))for(const r of JSON.parse(readFileSync(new URL(f,dir))).records){n++;assert.ok(['published','mapped-geometry'].includes(r.facts.ACREAGE_BASIS),r.parcelId+' has no acreage basis: run node scripts/apply-mapped-acreage.mjs after publishing');assert.ok(r.facts.CALC_ACRE>=2||r.facts.BELOW_MINIMUM_ACRES===true,r.parcelId);assert.equal(acreage(r).effective,r.facts.CALC_ACRE);acres+=r.facts.CALC_ACRE;}const m=JSON.parse(readFileSync(new URL('../assets/data/nj-parcel-research.json',import.meta.url)));assert.equal(m.totals.records,n);assert.ok(acres<60000,'acreage total is implausible: '+acres);assert.ok(m.quickPicks.every(q=>q.status==='ACTIVE'));});

test('a formerly below-minimum parcel is counted once it meets the threshold',()=>{
 const prior=correct([rec('exception',5,small)],{keep:new Set(['exception'])}).kept[0];
 const {kept}=correct([{...prior,geometry:big}]);
 assert.equal(kept[0].facts.BELOW_MINIMUM_ACRES,undefined);
 assert.equal(tractRow({tract:'34000000001'},kept).parcels2acPlus,1);
});

test('published acreage near the cutoff cannot admit an undersized mapped parcel',()=>{
 const nearlyTwo=box(.0009,.0009);
 const size=mappedAcres(nearlyTwo);
 assert.ok(size<2&&size>1.6);
 const {kept,dropped}=correct([rec('under',2.01,nearlyTwo)]);
 assert.equal(kept.length,0);
 assert.equal(dropped.length,1);
});
