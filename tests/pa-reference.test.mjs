import {test} from 'node:test';import assert from 'node:assert/strict';import * as turf from '@turf/turf';import R from '../assets/radar-pa-reference.js';
const envelope={xmin:0,ymin:0,xmax:1,ymax:1,spatialReference:{wkid:4326}},feature=turf.polygon([[[0,0],[1,0],[1,1],[0,1],[0,0]]],{FULLNAME:'Synthetic Township'});
const fetcher=async u=>({ok:true,json:async()=>!u.includes('/query?')?{geometryType:'esriGeometryPolygon',fields:[{name:'FULLNAME',type:'esriFieldTypeString'}]}:u.includes('returnCountOnly')?{count:1}:{features:[feature],exceededTransferLimit:false}});
test('county municipal reference verifies metadata/count, locates the map point and preserves source date',async()=>{
 const ref=await R.create({fetcher}).fetchForExtent(envelope);assert.equal(ref.status,'complete');const rows=[{state:'PA',lat:.5,lon:.5,address:'880 Example Rd, Municipality code 36, PA',original:{LOCATION:'880 Example Rd'},source:{mappings:{address:[{name:'LOCATION'}]}}}];
 R.apply(rows,ref,turf);assert.equal(rows[0].address,'880 Example Rd, Synthetic Township, PA');assert.match(rows[0].municipalityObservation.sourceURL,/Administration\/OperationalLayers/);assert.ok(rows[0].municipalityObservation.checkedAt);assert.match(rows[0].municipalityObservation.caveat,/Not a zoning/);
});
test('ambiguous or unavailable boundaries never pick a town arbitrarily',async()=>{
 const ref=await R.create({fetcher}).fetchForExtent(envelope),copy=turf.feature(feature.geometry,{FULLNAME:'Other Township'});const rows=[{state:'PA',lat:.5,lon:.5,address:'Published code'}];R.apply(rows,{...ref,features:[feature,copy]},turf);assert.equal(rows[0].address,'Published code');
 const fail=await R.create({fetcher:async()=>({ok:false,status:503})}).fetchForExtent(envelope);assert.equal(fail.status,'unavailable');R.apply(rows,fail,turf);assert.equal(rows[0].address,'Published code');
});
test('truncated municipal shapes are not accepted as complete coverage',async()=>{
 const ref=await R.create({fetcher:async u=>{const r=await fetcher(u);return {ok:true,json:async()=>({...await r.json(),...(u.includes('f=geojson')?{exceededTransferLimit:true}:{})})};}}).fetchForExtent(envelope);assert.equal(ref.status,'unavailable');
});
