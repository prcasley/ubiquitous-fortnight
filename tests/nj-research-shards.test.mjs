import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import vm from 'node:vm';
import {split,shardKey} from '../scripts/publish-nj-research-shards.mjs';

const rec=(id,town,carrier)=>({parcelId:id,state:'NJ',facts:{PROP_CLASS:'4B',PROP_LOC:'1 MAIN ST',MUN_NAME:town,COUNTY:'MIDDLESEX'},tractReferences:['34023000100'],assessmentOwnerObservation:null,njdepContext:{sites:[{}],interests:[]},usdotContext:carrier?{carrierName:carrier,status:'ACTIVE'}:{role:'on-site-carrier-not-owner'}});
const full={format:'RadarNJParcelResearch',version:1,checkedAt:'2026-11-12T00:00:00Z',coverage:{sourceSelectedTracts:130,partial:false},records:[rec('1201_1_1','CARTERET BORO','ACME'),rec('1201_2_1','CARTERET BORO'),rec('1219_3_1','SAYREVILLE BORO','BETA')],caveat:'c'};

test('shard key is the four-digit NJ municipal code',()=>{assert.equal(shardKey('1201_304_5'),'1201');assert.equal(shardKey('bad'),null);});

test('split writes one file per town with counts, totals and carrier quick picks',()=>{
 const {manifest,files}=split(full);
 assert.equal(manifest.version,2);assert.deepEqual(Object.keys(files),['1201','1219']);
 assert.equal(manifest.shards['1201'].records,2);assert.equal(manifest.shards['1201'].file,'nj-research/1201.json');
 assert.equal(manifest.totals.records,3);assert.equal(manifest.totals.onSiteCarriers,2);assert.equal(manifest.coverage.tractsWithParcels,1);
 assert.deepEqual(manifest.quickPicks.map(p=>p.carrierName).sort(),['ACME','BETA']);
 assert.ok(files['1201'].records.every(r=>r.parcelId.startsWith('1201_')));
});

test('split refuses repeated parcels and non-NJ identities',()=>{
 assert.throws(()=>split({...full,records:[...full.records,full.records[0]]}),/Repeated/);
 assert.throws(()=>split({...full,records:[{...full.records[0],parcelId:'X'}]}),/identity/);
});

test('site loader fetches only the selected town and refreshes its card',async()=>{
 const src=await readFile(new URL('../assets/radar-nj-public-research.js',import.meta.url),'utf8');
 const {manifest,files}=split(full),fetched=[],refreshed=[];
 const fetch=async url=>{fetched.push(url);const body=url.endsWith('nj-parcel-research.json')?manifest:files[url.match(/(\d{4})\.json$/)[1]];return {ok:true,json:async()=>body};};
 const record={key:'k1',id:'1201_1_1',state:'NJ'};
 const w={RadarOwnershipResearchCore:{businessParcel:()=>true},RadarExecutiveCards:{refresh:r=>refreshed.push(r.key)},PublicRadarBridge:{getResults:()=>[record],getSelected:()=>null,getRecord:()=>null},RadarNJDEP:{sources:{}}};
 const ctx={window:w,fetch,document:{getElementById:()=>null,dispatchEvent(){}},Event:class{},CustomEvent:class{},Map,Set,Promise,Date,Number,Array,Object,String};
 vm.runInNewContext(src,ctx);
 await w.RadarNJPublicResearch.ready;
 assert.equal(w.RadarNJPublicResearch.find(record),null);
 const got=await w.RadarNJPublicResearch.ensure(record);
 assert.equal(got.parcelId,'1201_1_1');assert.equal(w.RadarNJPublicResearch.find(record).parcelId,'1201_1_1');
 assert.ok(fetched.some(u=>u.endsWith('nj-research/1201.json')));assert.ok(!fetched.some(u=>u.endsWith('1219.json')));
 assert.deepEqual(refreshed,['k1']);
 assert.equal((await w.RadarNJPublicResearch.quickPicks()).length,2);
});
