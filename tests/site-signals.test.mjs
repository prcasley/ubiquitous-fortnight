import {test} from 'node:test';import assert from 'node:assert/strict';import * as turf from '@turf/turf';import convert from 'osmtogeojson';import S from '../assets/radar-site-signals.js';
const shape=turf.polygon([[[0,0],[.001,0],[.001,.001],[0,.001],[0,0]]]),record={key:'p',state:'NJ',lon:.0002,lat:.0002,geometry:shape};
const way={type:'way',id:1,tags:{building:'warehouse'},geometry:[{lon:0,lat:0},{lon:.0005,lat:0},{lon:.0005,lat:.001},{lon:0,lat:.001},{lon:0,lat:0}],nodes:[1,2,3,4,1]};
const fetcher=(elements,extra={})=>async(url,options)=>{assert.equal(url,S.sources.buildings.url);assert.equal(options.credentials,'omit');assert.equal(options.method,'POST');assert.match(options.body.get('data'),/relation\["building"\]/);return {ok:true,json:async()=>({elements,...extra})};};
test('OSM coverage clips and unions overlapping roof geometries with attribution',async()=>{const r=await S.check(record,'buildings',{geo:turf,convert,fetcher:fetcher([way,{...way,id:2}])});assert.equal(r.status,'complete');assert.ok(Math.abs(r.coveragePercent-50)<.1);assert.match(r.caveat,/Not total floor area, pavement/);assert.match(r.source,/OpenStreetMap/);assert.match(r.licenseURL,/copyright/);});
test('no mapped OSM buildings never implies vacant or zero coverage',async()=>{const r=await S.check(record,'buildings',{geo:turf,convert,fetcher:fetcher([])});assert.equal(r.status,'unavailable');assert.equal(r.coveragePercent,undefined);});
test('Overpass runtime remarks invalidate partial geometry',async()=>{assert.equal((await S.check(record,'buildings',{geo:turf,convert,fetcher:fetcher([way],{remark:'runtime error: timed out'})})).status,'unavailable');});
test('centroid-only parcel cannot acquire fabricated coverage',async()=>{assert.equal((await S.check({...record,geometry:turf.point([0,0])},'buildings',{geo:turf,convert,fetcher:fetcher([way])})).status,'unavailable');});
test('broken unclosed OSM buildings do not get a coverage score',async()=>{const r=await S.check(record,'buildings',{geo:turf,convert,fetcher:fetcher([{...way,nodes:[1,2,3],geometry:way.geometry.slice(0,3)}])});assert.equal(r.status,'unavailable');});
test('only named actual highway centerlines qualify, never Turnpike access ramps',()=>{assert.equal(S.corridor({PRIMENAME:'FR NJ TURNPIKE TO RAMP A'}),null);assert.equal(S.corridor({PRIMENAME:'New Jersey Turnpike'}),'NJ Turnpike');assert.equal(S.corridor({SHLD_NUM:'1',SHLD_TYPE:'ST'}),null);assert.equal(S.corridor({SHLD_NUM:'1',SHLD_TYPE:'US'}),'US Route 1');assert.equal(S.corridor({SHLD_NUM:'287',SHLD_TYPE:'INT'}),'I-287');});
test('NJ road metric is unavailable rather than invented in PA/FL',async()=>{assert.equal((await S.check({...record,state:'PA'},'roads')).status,'unavailable');});
test('OSM multipolygon courtyard holes are excluded from mapped roof area',async()=>{
 const ring=(x0,y0,x1,y1)=>[{lon:x0,lat:y0},{lon:x1,lat:y0},{lon:x1,lat:y1},{lon:x0,lat:y1},{lon:x0,lat:y0}];
 const relation={type:'relation',id:9,tags:{type:'multipolygon',building:'industrial'},members:[{type:'way',ref:90,role:'outer',geometry:ring(0,0,.001,.001)},{type:'way',ref:91,role:'inner',geometry:ring(.00025,.00025,.00075,.00075)}]};
 const r=await S.check(record,'buildings',{geo:turf,convert,fetcher:fetcher([relation])});assert.equal(r.status,'complete');assert.ok(Math.abs(r.coveragePercent-75)<.1);
});
test('parallel parcel checks limit public Overpass traffic to two in-flight requests',async()=>{
 let active=0,peak=0;
 const fetch=async()=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,10));active--;return {ok:true,json:async()=>({elements:[way]})};};
 const rows=await Promise.all(Array.from({length:5},(_,i)=>S.check({...record,key:'parallel'+i},'buildings',{geo:turf,convert,fetcher:fetch})));
 assert.ok(rows.every(r=>r.status==='complete'));assert.equal(peak,2);
});
