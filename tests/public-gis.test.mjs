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
const gateway=await import(pathToFileURL(path.join(ROOT,"server/nemotron-gateway.mjs")).href);
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
 assert.doesNotMatch(core,/SALE_PRC|COMP_ID|OWN_NAME|OWN_ADDR|OWN_MAIL/i);
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
});
test("a question about ownership or leasing is an evidence-limited followup",()=>{
 const p=parse("Who owns these parcels?");
 assert.equal(p.questionOwnership,true);assert.equal(p.search,false);
 const l=parse("When is the lease term up?");
 assert.equal(l.questionLease,true);assert.equal(l.search,false);
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
test("NVIDIA remains disabled on Pages; public data is allowlisted",()=>{
 assert.match(agent,/hostname\.endsWith\("\.github\.io"\)/);
 assert.match(agent,/RADAR_NIM_GATEWAY_ACTIVE===true/);
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
