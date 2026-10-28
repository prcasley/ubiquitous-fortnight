import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as turf from '@turf/turf';
import S from '../assets/radar-screening.js';
import D from '../assets/radar-domain.js';
const parcel=turf.polygon([[[0,0],[1,0],[1,1],[0,1],[0,0]]]);
function fetcher(features){return async url=>({ok:true,json:async()=>url.includes('/query?')?url.includes('returnCountOnly')?{count:features.length}:{features}:{geometryType:'esriGeometryPolygon',fields:[{name:'FLD_ZONE'},{name:'ZONE_SUBTY'},{name:'SFHA_TF'}]}});}
for(const zone of ['X','B','C'])test(zone+' full parcel coverage is not high-risk flood overlap',async()=>{const r=await S.screen({key:'p',geometry:parcel},'flood',{fetcher:fetcher([{...parcel,properties:{FLD_ZONE:zone}}]),geo:turf,domain:D});assert.equal(r.overlapPercent,0);assert.equal(r.status,'no-mapped-intersection');assert.equal(r.classificationVersion,'fema-sfha-av-v1');assert.deepEqual(r.allZoneLabels,[zone]);});
for(const zone of ['A','AE','AH','AO','A99','AR','AR/AE','AR/A1','A1','A30','V','VE','V30'])test(zone+' counts as SFHA high-risk',()=>assert.equal(S.floodClass({FLD_ZONE:zone}),'high-risk'));
for(const zone of ['D','','UNKNOWN','A31'])test(zone+' remains undetermined',()=>assert.equal(S.floodClass({FLD_ZONE:zone}),'unknown'));
test('shaded X remains outside SFHA without being called zero flood risk',async()=>{const r=await S.screen({key:'p',geometry:parcel},'flood',{fetcher:fetcher([{...parcel,properties:{FLD_ZONE:'X',ZONE_SUBTY:'0.2 PCT ANNUAL CHANCE FLOOD HAZARD'}}]),geo:turf,domain:D});assert.equal(r.overlapPercent,0);assert.deepEqual(r.zoneXSubtypes,['0.2 PCT ANNUAL CHANCE FLOOD HAZARD']);assert.match(r.caveat,/source review/);});
test('mixed AE and X measures only the AE portion, not their combined area',async()=>{const half=turf.polygon([[[0,0],[.5,0],[.5,1],[0,1],[0,0]]]);const r=await S.screen({key:'p',geometry:parcel},'flood',{fetcher:fetcher([{...parcel,properties:{FLD_ZONE:'X'}},{...half,properties:{FLD_ZONE:'AE'}}]),geo:turf,domain:D});assert.ok(Math.abs(r.overlapPercent-50)<.1);});
test('undetermined or contradictory FEMA classification never becomes clear or high-risk',async()=>{for(const properties of [{FLD_ZONE:'D'},{FLD_ZONE:'X',SFHA_TF:'Y'}]){const r=await S.screen({key:'p',geometry:parcel},'flood',{fetcher:fetcher([{...parcel,properties}]),geo:turf,domain:D});assert.equal(r.status,'incomplete');assert.equal(r.overlapPercent,undefined);}});
