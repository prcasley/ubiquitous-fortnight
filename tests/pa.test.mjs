import {test} from 'node:test';
import assert from 'node:assert/strict';
import PA from '../assets/radar-pa.js';
const meta=()=>({geometryType:'esriGeometryPolygon',advancedQueryCapabilities:{supportsPagination:true,supportsOrderBy:true},fields:[{name:'OBJECTID',type:'esriFieldTypeOID'},{name:'PIN',type:'esriFieldTypeString'},{name:'ACREAGE',type:'esriFieldTypeDouble'},{name:'YEAR_BUILT',type:'esriFieldTypeSmallInteger'},{name:'USE_DESC',type:'esriFieldTypeString'},{name:'SITE_ADDRESS',type:'esriFieldTypeString'},{name:'OWNER_NAME',type:'esriFieldTypeString'}]});
test('PA schemas verify polygon identity, ordered paging and narrow public projections',()=>{
 const source=PA.schema(PA.sources.Lehigh,meta());
 assert.equal(source.orderField,'OBJECTID');assert.equal(source.supportsUse,true);
 assert.doesNotMatch(source.fields,/OWNER|MAIL|CONTACT/);
 assert.throws(()=>PA.schema(PA.sources.Lehigh,{...meta(),geometryType:'esriGeometryPoint'}),/polygon/);
 assert.throws(()=>PA.schema(PA.sources.Lehigh,{...meta(),advancedQueryCapabilities:{}}),/pagination/);
 assert.throws(()=>PA.schema(PA.sources.Northampton,meta()),/ID\/order/);
});
test('PA acres and classification use verified fields and source domain meanings',()=>{
 const source=PA.schema(PA.sources.Lehigh,meta());
 assert.deepEqual(PA.attributes({ACREAGE:6,YEAR_BUILT:1984,USE_DESC:'Industrial warehouse',SITE_ADDRESS:'Synthetic property'},source),{address:'Synthetic property, PA',acres:6,yearBuilt:1984,type:'Industrial',use:'Industrial warehouse'});
 assert.match(PA.where(source,'industrial',{value:5,op:'>='}),/ACREAGE >= 5/);
 const coded=meta();coded.fields=coded.fields.filter(f=>f.name!=='USE_DESC');coded.fields.push({name:'LAND_USE',type:'esriFieldTypeString',domain:{codedValues:[{code:'I',name:'Industrial'},{code:'R',name:'Residential'}]}});
 const verified=PA.schema(PA.sources.Lehigh,coded);
 assert.equal(PA.where(verified,'industrial',{value:0,op:'>='}),"LAND_USE IN ('I')");
 assert.equal(PA.attributes({LAND_USE:'I'},verified).type,'Industrial');
 delete coded.fields.at(-1).domain;
 const unknown=PA.schema(PA.sources.Lehigh,coded);
 assert.equal(unknown.supportsUse,false);assert.equal(PA.attributes({LAND_USE:'I'},unknown).type,'Other');
 assert.equal(PA.attributes({ACREAGE:0,YEAR_BUILT:0},unknown).acres,null);
});
test('PA source preparation omits credentials and rejects unavailable metadata',async()=>{
 let seen;
 const source=await PA.prepare(PA.sources.Lehigh,{fetcher:async(url,options)=>{seen={url,options};return {ok:true,json:async()=>meta()};}});
 assert.ok(source.verifiedAt);assert.equal(seen.options.credentials,'omit');assert.equal(seen.options.headers,undefined);
 assert.equal(new URL(seen.url).hostname,'gis.lehighcounty.org');
 await assert.rejects(PA.prepare(PA.sources.Lehigh,{fetcher:async()=>({ok:false,status:503})}),/Pennsylvania coverage could not be verified/);
});
