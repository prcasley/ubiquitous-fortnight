import {test} from 'node:test';
import assert from 'node:assert/strict';
import P from '../assets/radar-property.js';
import C from '../assets/radar-fieldpack-core.js';
const shape={type:'Polygon',coordinates:[[[0,0],[.01,0],[.01,.01],[0,.01],[0,0]],[[.002,.002],[.002,.004],[.004,.004],[.004,.002],[.002,.002]]]};
const record=()=>({key:'test:1',id:'TEST-1',state:'NJ',address:'Synthetic sample',type:'Industrial',acres:6,yearBuilt:1998,
  lat:.005,lon:.005,geometry:{type:'Feature',geometry:shape,properties:{owner:'Must not copy'}},
  source:{name:'Synthetic GIS',url:'https://example.com/layer',date:'Test source vintage'},owner:'Must not copy',note:'Private app note',original:{secret:'Must not copy'}});
const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5gAAAABJRU5ErkJggg==';
test('public property snapshots preserve provenance and exclude raw/owner/private attributes',()=>{
  const snapshot=P.snapshot(record(),{time:'2026-10-26T14:00:00Z',status:'partial',unverified:['current sale availability']});
  assert.equal(snapshot.retrievedAt,'2026-10-26T14:00:00Z');assert.equal(snapshot.scanStatus,'partial');
  assert.deepEqual(snapshot.unverifiedCriteria,['current sale availability']);assert.equal(snapshot.geometry.coordinates.length,2);
  for(const name of ['owner','note','original'])assert.equal(name in snapshot,false);
  assert.doesNotMatch(JSON.stringify(snapshot),/Must not copy|Private app note/);
});
test('satellite viewport preserves holes/multipart geometry and labels centroid-only references',()=>{
  const snapshot=P.snapshot(record()),view=P.view(snapshot);
  assert.equal(view.hasBoundary,true);assert.equal((view.paths[0].match(/M/g)||[]).length,2);
  assert.ok(view.bounds.every(Number.isFinite));assert.match(P.svg(snapshot),/fill-rule="evenodd"/);
  const params=new URL(view.imageURL).searchParams;assert.equal(params.get('bboxSR'),'3857');assert.equal(params.get('size'),'640,360');
  const multi=P.snapshot({...record(),geometry:{type:'MultiPolygon',coordinates:[shape.coordinates,shape.coordinates]}});assert.equal(P.view(multi).paths.length,2);
  const point=P.snapshot({...record(),geometry:{type:'Point',coordinates:[.005,.005]}});
  assert.equal(P.view(point).hasBoundary,false);assert.match(P.svg(point),/circle/);assert.match(point.precision,/boundary unavailable/);
  assert.throws(()=>P.snapshot({...record(),geometry:{type:'Point',coordinates:[999,999]}}));
  assert.throws(()=>P.snapshot({...record(),geometry:{type:'MultiPolygon',coordinates:[]}}));
});
test('Google links use validated mapped coordinates and explicit satellite/street/directions actions',()=>{
  const links=P.links(P.snapshot(record()));
  assert.equal(new URL(links.maps).searchParams.get('query'),'Synthetic sample');
  assert.equal(new URL(links.satellite).searchParams.get('basemap'),'satellite');
  assert.equal(new URL(links.street).searchParams.get('map_action'),'pano');
  assert.equal(new URL(links.directions).searchParams.get('destination'),'0.005,0.005');
  assert.throws(()=>P.links({lat:NaN,lon:0}));
});
test('printable packs embed imagery and user photos while escaping user content',()=>{
  const property=P.snapshot({...record(),address:'<script>untrusted()</script>'},{time:'2026-10-26T14:00:00Z',status:'complete'});
  const html=C.packetHTML([{property,notes:'</p><script>private()</script>',nextAction:'Check source & access',screenings:[]}],{imagery:{[property.key]:pixel},photos:{[property.key]:[{dataURL:pixel,addedAt:'2026-10-26'}]},generatedAt:'2026-10-26T14:00:00Z'});
  assert.match(html,/Satellite imagery: Esri/);assert.match(html,/User photo added/);assert.match(html,/Print \/ Save as PDF/);
  assert.ok(html.includes(pixel));assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);
  assert.match(html,/America\/New_York/);assert.match(html,/2026-10-26T14:00:00Z/);assert.match(html,/Check source &amp; access/);
});
test('packs expose missing imagery, unverified criteria and unchecked screening instead of implying clearance',()=>{
  const property=P.snapshot(record(),{status:'partial',unverified:['lease renewal dates']});
  const html=C.packetHTML([{property,notes:'',nextAction:'',screenings:[]}]);
  assert.match(html,/SATELLITE IMAGERY UNAVAILABLE/);assert.match(html,/geometry reference only/);assert.match(html,/lease renewal dates/);assert.match(html,/not checked/);assert.match(html,/Scan status: partial/);
  assert.throws(()=>C.packetHTML([]));assert.throws(()=>C.packetHTML(Array(26).fill({property})));
  assert.equal(C.image('data:image/svg+xml;base64,PHN2Zz4='),'');
});
