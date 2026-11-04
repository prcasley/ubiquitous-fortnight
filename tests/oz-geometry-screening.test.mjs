import {test} from 'node:test';import assert from 'node:assert/strict';import * as turf from '@turf/turf';
import O from '../assets/radar-oz-research.js';import P from '../assets/radar-property.js';import A from '../assets/radar-county-acreage.js';
const parcel=turf.bboxPolygon([0,0,1,1]);const geometry=b=>turf.bboxPolygon(b).geometry;
const feature=(box,id='34013001000')=>({type:'Feature',geometry:geometry(box),properties:{Geography:id,Municipality:'Test city',County:'Test'}});
const row={key:'test',geometry:parcel};
const fetcher=features=>async u=>({ok:true,json:async()=>String(u).includes('returnCountOnly')?{count:features.length}:{features}});
for(const [label,boxes,status,pct] of [['inside',[[-1,-1,2,2]],'reference-intersection',100],['half',[[0,0,.5,1]],'partial-overlap',50],['0.08 percent',[[.9992,0,2,1]],'partial-overlap',.08],['shared line',[[1,0,2,1]],'boundary-contact',0],['shared corner',[[1,1,2,2]],'boundary-contact',0],['outside',[[2,2,3,3]],'no-reference-intersection',0],['overlapping nominated shapes',[[0,0,.6,1],[.4,0,1,1]],'reference-intersection',100]])test('NJ area screening: '+label,async()=>{
 const f=boxes.map((b,i)=>feature(b,'3401300'+String(1000+i).padStart(4,'0'))),result=await O.check([row],{kind:'ozNJ',fetcher:fetcher(f),geo:turf}),o=result.observations[0];
 assert.equal(o.status,status);assert.ok(Math.abs(o.overlapPercent-pct)<.00001);assert.equal(o.coverageBasis,'parcel-area');
 const saved=P.ozSnapshot({...o,nominationVerified:true});assert.equal(saved.nominationVerified,status==='reference-intersection'&&pct>=95);
 if(status==='boundary-contact'||status==='partial-overlap')assert.match(P.ozLabel({state:'NJ',ozObservation:saved}),/Not counted as a positive parcel match/);
});
test('point references and legacy unchecked intersections cannot become parcel nominations',async()=>{
 const result=await O.check([{key:'p',geometry:turf.point([.5,.5])}],{kind:'ozNJ',fetcher:fetcher([feature([0,0,1,1])]),geo:turf});
 assert.equal(result.observations[0].coverageBasis,'point-only');assert.equal(P.ozSnapshot({...result.observations[0],nominationVerified:true}).nominationVerified,false);
 assert.equal(P.ozSnapshot({kind:'ozNJ',status:'reference-intersection',nominationVerified:true,tracts:['34013001000']}).nominationVerified,false);
});
test('Broward prefilter requires published size units or verified projected shape-area units',()=>{
 const area={name:'Shape__Area',type:'esriFieldTypeDouble'};
 assert.equal(A.discover({fields:[area]}),null);assert.equal(A.discover({fields:[area],extent:{spatialReference:{wkid:4326}}}),null);
 const def=A.discover({fields:[area],extent:{spatialReference:{wkid:3857}}});assert.equal(A.predicate(def,{op:'>',value:10}),'Shape__Area >= 40468.564224');
 assert.equal(A.predicate(def,{op:'<',value:10}),null);
 assert.equal(A.discover({fields:[{name:'LOT_SIZE',type:'esriFieldTypeDouble'}]}),null);
 const published=A.discover({fields:[{name:'LOT_SQ_FT',type:'esriFieldTypeDouble'}]});assert.match(A.predicate(published,{op:'>',value:10}),/LOT_SQ_FT > 435600/);assert.match(A.predicate(published,{op:'>',value:10}),/IS NULL/);
});
