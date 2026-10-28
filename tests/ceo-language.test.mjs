import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as turf from '@turf/turf';
import D from '../assets/radar-domain.js';
import O from '../assets/radar-oz-research.js';
const source=readFileSync(new URL('../assets/radar-agent.js',import.meta.url),'utf8');
function parse(q){const window={};vm.runInNewContext(source,{window,document:{readyState:'loading',addEventListener(){}}});return window.PublicRadarAgent.parseIntent(q);}
const examples=[
 ['industrial parcels over 5 acres in Edison NJ','NJ','Edison NJ','>',5],
 ['Edison NJ industrial 5 acres','NJ','Edison NJ','>=',5],
 ['warehouses near Edison, NJ','NJ','Edison, NJ',null,null],
 ['industrial land over 10 acres in West Palm Beach, FL','FL','West Palm Beach, FL','>',10],
 ['Find warehouses in Edison, NJ','NJ','Edison, NJ',null,null],
 ['industrial 5 acres near Edison NJ?','NJ','Edison NJ','>=',5],
 ['NJ Edison industrial 5 acres','NJ','Edison NJ','>=',5],
 ['West Palm Beach FL industrial 10 acres','FL','West Palm Beach FL','>=',10],
 ['Show me warehouses in Secaucus NJ','NJ','Secaucus NJ',null,null],
 ['industrial at least 5 acres in Edison, NJ.','NJ','Edison, NJ','>=',5],
];
for(const [q,state,location,comparison,acres] of examples)test('reported CEO wording: '+q,()=>{const i=parse(q);assert.equal(i.search,true);assert.equal(i.state,state);assert.equal(i.location,location);assert.equal(i.type,'industrial');assert.equal(i.comparison,comparison);assert.equal(i.acres,acres);});
test('largest-owner question remains an ownership question, not a sort request',()=>{const i=parse('Who owns the largest one?');assert.equal(i.search,false);assert.equal(i.questionOwnership,true);assert.equal(i.sort,'largest');});
test('OZ question remains a specific reference inquiry',()=>{const i=parse('Which of these qualify for OZ 2?');assert.equal(i.search,false);assert.equal(i.questionOZ,true);});
test('OZ-only follow-up never treats OZ 2 as a city',()=>{const i=parse('Show only parcels in OZ 2');assert.equal(i.location,'');assert.equal(i.questionOZ,true);});
test('an ownership question does not invent a place from question words',()=>{assert.equal(parse('Who owns the largest one in NJ?').location,'');});
test('narrowing language has no invented location or new property type',()=>{const i=parse('Show only parcels over 20 acres');assert.equal(i.search,true);assert.equal(i.location,'');assert.equal(i.type,null);assert.equal(i.refine,true);});
test('all property types is an explicit broadening request',()=>{assert.equal(parse('Show all property types over 20 acres').type,'all');});
const shape=acres=>turf.circle([0,0],Math.sqrt(acres*4046.8564224/Math.PI)/1000,{units:'kilometers',steps:128}).geometry;
test('44900-acre source value with a one-acre polygon is quarantined, never silently converted',()=>{const o=D.acreageObservation(44900,shape(1.031),turf);assert.equal(o.acres,null);assert.equal(o.reportedAcres,44900);assert.ok(Math.abs(o.geometryAcres-1.031)<.01);assert.equal(o.acreageQuality,'suspect');});
test('legitimate large polygons are not discarded by an arbitrary maximum',()=>{const o=D.acreageObservation(44900,shape(44900),turf);assert.equal(o.acres,44900);assert.equal(o.acreageQuality,'reported');});
test('normal geometry differences, unknown acres and centroid-only data are distinct',()=>{assert.equal(D.acreageObservation(6,shape(5.8),turf).acres,6);assert.equal(D.acreageObservation(null,shape(5),turf).acres,null);assert.equal(D.acreageObservation(6,{type:'Point',coordinates:[0,0]},turf).acreageQuality,'point-only');});
const parcels=[{key:'p:1',geometry:shape(6)},{key:'p:2',geometry:turf.circle([2,2],.1).geometry}];
function referenceFetcher({flag='eligible',count=1,truncated=false}={}){return async url=>{const p=new URL(url).searchParams;return {ok:true,json:async()=>p.get('returnCountOnly')==='true'?{count}:{type:'FeatureCollection',features:[{type:'Feature',geometry:shape(20),properties:{GEOID:'12099000100',OZ_2_0_Eli:flag}}],exceededTransferLimit:truncated}};};}
test('parcel reference answers distinguish actual intersections and retain qualification caveat',async()=>{const r=await O.check(parcels,{fetcher:referenceFetcher(),geo:turf});assert.equal(r.observations[0].status,'reference-intersection');assert.equal(r.observations[1].status,'no-reference-intersection');assert.deepEqual(r.observations[0].tracts,['12099000100']);assert.match(r.observations[0].caveat,/tax qualification are not established/);});
for(const options of [{flag:'unknown'},{count:281},{truncated:true}])test('unverified OZ evidence cannot classify parcels: '+JSON.stringify(options),async()=>{await assert.rejects(O.check(parcels,{fetcher:referenceFetcher(options),geo:turf}));});
