import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath,pathToFileURL} from "node:url";
import path from "node:path";
import vm from "node:vm";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=name=>readFileSync(path.join(ROOT,name),"utf8");
const html=read("index.html"),core=read("assets/radar-live.js");
const agent=read("assets/radar-agent.js"),geo=read("assets/radar-geo.js");
const doc=read("docs/PUBLIC_DATA_COVERAGE.md");
const gateway=await import(pathToFileURL(path.join(ROOT,"server/hosted-assistant.mjs")).href);
function parse(input) {
 const w={};
 const ctx={window:w,document:{readyState:"loading",addEventListener(){},getElementById(){return null}}};
 vm.runInNewContext(agent,ctx,{filename:"radar-agent.js",timeout:3000});
 return w.PublicRadarAgent.parseIntent(input);
}
test("all client scripts parse cleanly",()=>{
 for(const [filename,s] of [["core",core],["agent",agent],["geographic overlays",geo]])
   assert.doesNotThrow(()=>new vm.Script(s,{filename}));
});
test("no duplicate IDs or private-company references in public page",()=>{
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
 assert.equal(ids.length,new Set(ids).size);
 for(const s of [html,core,agent,geo,doc])assert.doesNotMatch(s,/\bWoodmont\b/i);
 assert.match(html,/integrity="sha256-/);
 assert.match(html,/radar-agent\.js/);
 assert.match(html,/oz1Toggle/);
 assert.match(html,/oz2Toggle/);
 assert.doesNotMatch(html,/\bid="(?:comps|salesComps|saleCalculator|leaseComps)"/i);
 assert.doesNotMatch(core,/SALE_PRC|COMP_ID|OWN_ADDR|OWN_MAIL/i);
 const projections=[...core.matchAll(/fields:\s*"([^"]+)"/g)].map(x=>x[1]);
 assert.equal(projections.length>=3,true);
 assert.equal(projections.some(x=>/OWN_NAME|OWNER_NAME|OWN_ADDR/i.test(x)),false,
   "Bulk map data must not project owner or mailing fields");
 assert.match(core,/OWNER_NAME1/,"Owner name is available only through explicit detail lookup");
 assert.match(core,/SOURCES\.PBC/);
 assert.match(html,/id="explainResults"/);
 assert.match(html,/radar-assistant\.js/);
 assert.match(html,/radar-assistant\.css/);
});
test("strict and nonstrict natural language comparisons",()=>{
 const q=parse("Find industrial over 3 acres in Parsippany, NJ");
 assert.equal(q.type,"industrial");assert.equal(q.state,"NJ");
 assert.equal(q.acres,3);assert.equal(q.comparison,">");assert.equal(q.search,true);
 const m=parse("Find multifamily at least 2 acres in Edison NJ");
 assert.equal(m.type,"multifamily");assert.equal(m.acres,2);
 assert.equal(m.comparison,">=");assert.equal(m.search,true);
 const u=parse("Find vacant land under 4 acres in Palm Beach County FL");
 assert.equal(u.state,"FL");assert.equal(u.type,"vacant");
 assert.equal(u.acres,4);assert.equal(u.comparison,"under");
 const upper=parse("Find industrial at most 4 acres in Edison NJ");
 assert.equal(upper.comparison,"<=");assert.equal(upper.acres,4);
});
test("a question about ownership or leasing is an evidence-limited followup",()=>{
 const p=parse("Who owns these parcels?");
 assert.equal(p.questionOwnership,true);assert.equal(p.search,false);
 const l=parse("When is the lease term up?");
 assert.equal(l.questionLease,true);assert.equal(l.search,false);
});
test("executive shorthand preserves acreage, missing facts and pricing meaning",()=>{
 const nearest=parse('find me the nearest parcels with 5 acres and for industrial');
 assert.equal(nearest.search,true);assert.equal(nearest.acres,5);assert.equal(nearest.comparison,'>=');assert.equal(nearest.type,'industrial');assert.equal(nearest.sort,'nearest');assert.equal(nearest.location,'');
 const renewal=parse('find me a 6 acre parcel which is up for renewal and has the owner name');
 assert.equal(renewal.acres,6);assert.equal(renewal.comparison,'=');assert.equal(renewal.questionLease,true);assert.equal(renewal.questionOwnership,true);
 const sale=parse('find me a NJ property up for sale that has approx $200 per sq foot');
 assert.equal(sale.state,'NJ');assert.equal(sale.forSale,true);assert.equal(sale.pricePsf.amount,200);assert.equal(sale.pricePsf.basis,'asking-sale');assert.equal(sale.pricePsf.unit,'building-square-foot');assert.equal(sale.pricePsf.approximate,true);assert.equal(sale.acres,null);
 const comps=parse('Show recent industrial sale comps near Edison NJ around $200/SF');
 assert.equal(comps.pricePsf.basis,'closed-sale');assert.equal(comps.comps,true);assert.equal(comps.location,'Edison NJ');
 const approximate=parse('Find warehouses about 6 acres near Edison, NJ');
 assert.equal(approximate.type,'industrial');assert.equal(approximate.acres,5.4);assert.equal(approximate.maxAcres,6.6);assert.equal(approximate.comparison,'between');
 const range=parse('show industrial between 5 and 10 acres in Edison NJ');
 assert.equal(range.acres,5);assert.equal(range.maxAcres,10);assert.equal(range.comparison,'between');
 assert.equal(parse('Find a six-acre parcel in Palm Beach County FL').acres,6);
 assert.equal(parse('Find 5+ acre industrial sites near Edison NJ').comparison,'>=');
});
test("only supported county IDs are used for Florida public scans",()=>{
 assert.match(core,/CO_NO IN \(60,53,66\)/);
 assert.match(core,/ACT_YR_BLT/);assert.match(core,/EFF_YR_BLT/);
 assert.match(core,/YR_CONSTR/);
 assert.match(core,/DOR_UC IN \('040','0040'/);
 assert.match(core,/'048'/);assert.match(core,/'0048'/);
 assert.match(core,/'010'/);assert.match(core,/'0010'/);
 assert.match(core,/getLastGeocodeCounty/);
 assert.match(agent,/getLastGeocodeCounty/);
});
test("OZ 1 federal reference and nationwide OZ 2 research reference are distinguished",()=>{
 assert.match(geo,/geo\.dot\.gov\/server/);
 assert.match(geo,/Opportunity_Zone_2_Eligible_Tracts/);
 assert.doesNotMatch(geo,/Maryland_Official_Eligible/);
 assert.match(geo,/NOT Treasury certification/);
 assert.match(geo,/refusing to classify tracts/);
});
test("executive interface has no vendor branding or local model flow; public summary data is allowlisted",()=>{
 assert.doesNotMatch(html+agent+read("assets/radar-assistant.js"),/nvidia|nemotron|webgpu|huggingface|new Worker|navigator\.gpu/i);
 const rows=gateway.sanitizedRecords([
  {id:"p-1",address:"123 SAMPLE ROAD",state:"FL",type:"Industrial",acres:null,yearBuilt:null,
   owner:"PERSONAL NAME",phone:"555-0123",mailingAddress:"HOME",price:999999},
  {id:"p-2",address:"Other",state:"NJ",acres:4.3,yearBuilt:1998}
 ]);
 assert.equal(rows.length,2);
 assert.equal(rows[0].acres,null);assert.equal(rows[0].yearBuilt,null);
 assert.equal(rows[1].acres,4.3);
 for(const row of rows)for(const secret of ["owner","phone","mailingAddress","price"])assert.equal(secret in row,false);
 assert.equal(gateway.validSource("https://services6.arcgis.com/BAJNi3EgCdtQ1BCG"),true);
 assert.equal(gateway.validSource("https://example.com/private"),false);
 assert.equal(gateway.validSource("http://services6.arcgis.com"),false);
});
