import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as turf from '@turf/turf';
import domain from '../assets/radar-domain.js';
import screening from '../assets/radar-screening.js';
import {ResearchStore} from '../server/research-store.mjs';
import {createWorkspace} from '../server/workspace.mjs';
import {randomBytes} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const rectangle=(x1,y1,x2,y2)=>turf.polygon([[[x1,y1],[x2,y1],[x2,y2],[x1,y2],[x1,y1]]]);
test('acreage comparisons preserve strict, upper and lower bounds and reject invalid inputs',()=>{
  const cases=[['<',4,[3]],['<=',4,[3,4]],['>',4,[5]],['>=',4,[4,5]]];
  for(const [op,value,expected] of cases)assert.deepEqual([3,4,5].filter(n=>domain.matchesAcres(n,domain.acreageFilter(value,op))),expected);
  assert.equal(domain.matchesAcres(null,{value:4,op:'<'}),false);
  assert.throws(()=>domain.acreageFilter(-1));assert.throws(()=>domain.acreageFilter(4,'OR 1=1'));
});
test('parcel identity includes provider and county; distribution class matches while districts does not',()=>{
  assert.notEqual(domain.parcelKey('fdor','FL','53','123'),domain.parcelKey('fdor','FL','66','123'));
  assert.notEqual(domain.parcelKey('fdor','FL','53','123'),domain.parcelKey('regrid','FL','53','123'));
  assert.equal(domain.pbcCategory('DISTRIBUTION'),'Industrial');assert.equal(domain.pbcCategory('SPECIAL DISTRICTS'),'Other');
  assert.equal(domain.pbcCategory('VACANT INDUSTRIAL'),'Vacant');
});
test('exact and approximate acreage filters generate matching county/state query predicates',()=>{
  const exact=domain.acreageFilter(6,'=');assert.equal(domain.acreageSQL('CALC_ACRE',exact),'CALC_ACRE = 6');
  assert.equal(domain.matchesAcres(6,exact),true);assert.equal(domain.matchesAcres(6.01,exact),false);
  const range=domain.acreageFilter(5.4,'between',6.6);
  assert.equal(domain.acreageSQL('ACRES',range),'ACRES >= 5.4 AND ACRES <= 6.6');
  assert.equal(domain.acreageSQL('LND_SQFOOT',range,43560),'LND_SQFOOT >= 235224 AND LND_SQFOOT <= 287496');
  assert.deepEqual([5,5.4,6,6.6,7].filter(n=>domain.matchesAcres(n,range)),[5.4,6,6.6]);
  assert.equal(domain.matchesAcres(null,range),false);assert.throws(()=>domain.acreageFilter(10,'between',5));
});
test('radius selection includes parcels crossing circle even when midpoint is outside',()=>{
  const parcel=rectangle(0.01,-0.01,0.1,0.01);
  assert.equal(domain.intersectsRadius(parcel.geometry,{lon:0,lat:0},1,turf),true);
  assert.equal(domain.intersectsRadius(parcel.geometry,{lon:0,lat:1},1,turf),false);
});
test('screening unions overlapping hazards, respects polygon holes and never gives centroid overlap percent',()=>{
  const parcel=rectangle(0,0,1,1);
  const half=rectangle(0,0,0.5,1);half.properties.FLD_ZONE='AE';
  const result=domain.summarizeScreen(parcel.geometry,[half,half],turf);
  assert.ok(Math.abs(result.overlapPercent-50)<0.1);assert.deepEqual(result.labels,['AE']);
  const point=domain.summarizeScreen(turf.point([0.1,0.1]).geometry,[half],turf);
  assert.equal(point.overlapPercent,null);assert.equal(point.precision,'point-only');
  const hole=turf.polygon([[[0,0],[2,0],[2,2],[0,2],[0,0]],[[0.5,0.5],[0.5,1.5],[1.5,1.5],[1.5,0.5],[0.5,0.5]]]);
  assert.equal(domain.summarizeScreen(turf.point([1,1]).geometry,[hole],turf).status,'no-mapped-intersection');
});
function service({count=1,features=[rectangle(0,0,0.5,1)],truncated=false,schema=true,http=200}={}){
  return async url=>({ok:http===200,status:http,json:async()=>{
    if(!url.includes('/query?'))return {geometryType:'esriGeometryPolygon',fields:schema?[{name:'FLD_ZONE'}]:[],maxRecordCount:1000};
    if(url.includes('returnCountOnly'))return {count};
    return {features,exceededTransferLimit:truncated};
  }});
}
test('screen adapter distinguishes complete, no intersection, truncation, schema changes and network errors',async()=>{
  const record={key:'test',geometry:rectangle(0,0,1,1)};
  const options=fetcher=>({fetcher,geo:turf,domain});
  const ok=await screening.screen(record,'flood',options(service()));
  assert.equal(ok.status,'mapped-intersection');assert.equal(ok.coverage,'not-established');assert.match(ok.sourceURL,/fema/);
  const empty=await screening.screen(record,'flood',options(service({count:0,features:[]})));
  assert.equal(empty.status,'no-mapped-intersection');assert.equal(empty.coverage,'not-established');
  assert.equal((await screening.screen(record,'flood',options(service({truncated:true})))).status,'incomplete');
  assert.equal((await screening.screen(record,'flood',options(service({schema:false})))).status,'error');
  assert.equal((await screening.screen(record,'flood',options(service({http:403})))).status,'error');
});
const feed=()=>({version:1,provider:'regrid',license:{reference:'Synthetic test fixture; no licensed data',localStorage:true,search:true,export:false},records:[
  {state:'NJ',countyFips:'34023',parcelId:'TEST-1',address:'Synthetic sample',type:'Industrial',acres:3,ownerName:'Example LLC',observedAt:'2026-01-01T00:00:00Z',sourceURL:'https://example.com/fixture',
    sales:[{date:'2025-01-01',amount:100,sourceURL:'https://example.com/deed',observedAt:'2026-01-01T00:00:00Z'}]}
]});
test('licensed imports require rights, preserve provenance, support history and update atomically',()=>{
  const store=new ResearchStore(':memory:');
  try{
    const invalid=feed();invalid.license.localStorage=false;assert.throws(()=>store.importFeed(invalid));
    store.importFeed(feed());
    const found=store.search({state:'NJ',maxAcres:'4',q:'Example'});assert.equal(found.total,1);assert.equal(found.records[0].sales[0].amount,100);
    assert.equal(found.records[0].license.export,false);assert.equal(store.search({minAcres:4}).total,0);
    const batch=feed();batch.records.push({...batch.records[0],parcelId:'TEST-2',acres:-1});assert.throws(()=>store.importFeed(batch));assert.equal(store.search().total,1);
    assert.equal(store.search({q:"' OR 1=1 --"}).total,0);
    const relationship=feed();relationship.records[0].relationships=[{name:'Unsubstantiated'}];assert.throws(()=>store.importFeed(relationship));
    store.saveList({name:'Track industrial',parcelKeys:[],filters:{state:'NJ',maxAcres:'4'}});
    const refreshed=feed();refreshed.records[0].acres=5;store.importFeed(refreshed);assert.equal(store.search().total,1);assert.equal(store.search().records[0].acres,5);
    assert.equal(store.alerts().length,1);assert.deepEqual(store.alerts()[0].payload.changedFields,['acres']);
    store.importFeed(refreshed);assert.equal(store.alerts().length,1,'Unchanged records must not emit duplicate alerts');
    assert.equal(store.providers().find(p=>p.provider==='reportall').status,'not-configured');
  }finally{store.close();}
});
test('saved server research persists across database reopen',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'radar-store-')),file=path.join(dir,'research.sqlite');
  try{
    let store=new ResearchStore(file);const list=store.saveList({name:'Industrial',parcelKeys:['test'],filters:{state:'NJ'},note:'Check source'});store.close();
    store=new ResearchStore(file);assert.equal(store.lists()[0].id,list.id);assert.equal(store.lists()[0].payload.filters.state,'NJ');assert.equal(store.deleteList(list.id),true);store.close();
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('private API authenticates, rejects cross-origin writes and hides files outside static assets',async()=>{
  const store=new ResearchStore(':memory:'),password=randomBytes(24).toString('hex');
  const server=createWorkspace({store,password});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const authorization='Basic '+Buffer.from('radar:'+password).toString('base64');
  try{
    const health=await fetch(base+'/healthz');assert.equal(health.status,200);assert.deepEqual(await health.json(),{status:'ok'});
    assert.equal((await fetch(base+'/api/providers')).status,401);
    const providers=await fetch(base+'/api/providers',{headers:{authorization}});assert.equal(providers.status,200);assert.equal((await providers.json()).every(p=>p.records===0),true);
    assert.equal((await fetch(base+'/api/lists',{method:'POST',headers:{authorization,origin:'https://other.example','content-type':'application/json'},body:'{}'})).status,403);
    const saved=await fetch(base+'/api/lists',{method:'POST',headers:{authorization,'content-type':'application/json'},body:JSON.stringify({name:'Saved',parcelKeys:[],filters:{state:'NJ'}})});assert.equal(saved.status,201);
    assert.equal((await (await fetch(base+'/api/lists',{headers:{authorization}})).json()).length,1);
    for(const path of ['/.git/config','/server/workspace.mjs','/.radar/research.sqlite'])assert.equal((await fetch(base+path,{headers:{authorization}})).status,404);
    assert.equal((await fetch(base+'/workspace.html',{headers:{authorization}})).status,200);
  }finally{await new Promise(resolve=>server.close(resolve));store.close();}
});
