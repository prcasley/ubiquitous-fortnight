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
test('Northampton ASMT acreage and commercial year apply on server; financial placeholders excluded',()=>{
 const m=meta();m.fields=m.fields.filter(f=>!['PIN','ACREAGE','YEAR_BUILT'].includes(f.name));m.fields.push({name:'PARCEL_ID',type:'esriFieldTypeString'},{name:'ASMT_ACREAGE',type:'esriFieldTypeDouble'},{name:'COM_YEAR_BUILT',type:'esriFieldTypeInteger'},...['LAND_VALUE','BLDG_VALUE','SALE_PRICE','SALE_DATE','SALE_VALIDITY_CODE','FLAG_10_KOZ'].map(name=>({name,type:'esriFieldTypeDouble'})));
 const source=PA.schema(PA.sources.Northampton,m);
 assert.match(PA.where(source,'all',{value:5,op:'>='}),/ASMT_ACREAGE >= 5/);assert.equal(PA.attributes({ASMT_ACREAGE:14.4,COM_YEAR_BUILT:1987},source).yearBuilt,1987);
 const a={SALE_PRICE:1660000,SALE_DATE:Date.UTC(2020,1,1),LAND_VALUE:100,BLDG_VALUE:200,FLAG_10_KOZ:1};const r=PA.financial(a,source);assert.equal(r.assessedValue,300);assert.equal(r.recordedSalePrice,1660000);assert.equal(r.kozFlag,'1');
 assert.equal(PA.financial({...a,SALE_PRICE:1},source).recordedSalePrice,null);assert.equal(PA.financial({...a,SALE_DATE:Date.UTC(1979,0,1)},source).recordedSalePrice,null);assert.equal(PA.financial({...a,SALE_DATE:null},source).recordedSalePrice,null);assert.doesNotMatch(source.fields,/OWNER|MAIL/);
});
