import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../assets/radar-agent.js',import.meta.url),'utf8');
function parse(q){const window={};vm.runInNewContext(source,{window,document:{readyState:'loading',addEventListener(){}}});return window.PublicRadarAgent.parseIntent(q);}
const cases=[
 ['show me warehouses near me',{search:true,nearMe:true,type:'industrial'}],
 ['I want to see big industrial lots in edison new jersey',{state:'NJ',type:'industrial',recognizedPlace:'Edison'}],
 ["what's for sale in west palm beach",{state:'FL',forSale:true,recognizedPlace:'West Palm Beach'}],
 ['how do I find land',{type:null,state:null}],
 ['edison',{search:true,state:'NJ',recognizedPlace:'Edison'}],
 ['industrial land 10 acres woodbridge nj please',{state:'NJ',type:'industrial',acres:10,comparison:'>=',recognizedPlace:'Woodbridge'}],
 ['INDUSTIAL LOTS IN EDISSON NJ',{suggestion:'industrial lots in edison nj'}],
 ['Where is 5900 Australian Ave West Palm Beach',{address:true,state:'FL',location:'5900 Australian Ave West Palm Beach'}],
 ['can you make the print bigger',{search:false}],['help',{search:false}],
 ['Give me the top 5 industrial sites over 10 acres in Northern New Jersey',{state:'NJ',type:'industrial',acres:10,comparison:'>',top:5,sort:'largest',location:'Parsippany, NJ'}],
 ["What's available in Secaucus over 5 acres",{search:true,state:'NJ',acres:5,comparison:'>',recognizedPlace:'Secaucus',forSale:true}],
 ['Anything over 20 acres near the Turnpike in Edison?',{search:true,state:'NJ',acres:20,comparison:'>',recognizedPlace:'Edison'}],
 ['Compare Edison and Secaucus industrial',{compare:true,search:false}],
 ['Biggest industrial sites in Palm Beach County',{state:'FL',type:'industrial',sort:'largest',countyLabel:'Palm Beach'}],
 ['Summarize this for the board',{search:false}],
 ['industrial parcels 4+ acres in North Bergen NJ',{state:'NJ',type:'industrial',acres:4,comparison:'>='}],
 ['industrial between 4 and 10 acres in Perth Amboy NJ',{state:'NJ',type:'industrial',acres:4,maxAcres:10,comparison:'between'}],
 ['IOS sites 3-8 acres near Port Newark',{state:'NJ',type:'industrial',acres:3,maxAcres:8,comparison:'between',ios:true}],
 ['vacant land over 5 acres in Mangonia Park FL',{state:'FL',type:'vacant',acres:5,comparison:'>'}],
 ['industrial over 10 acres built before 1990 in Edison NJ',{state:'NJ',type:'industrial',year:{op:'<',value:1990}}],
 ['industrial newer than 2000 in Edison NJ',{year:{op:'>',value:2000}}],
 ['Lehigh Valley industrial over 50 acres',{state:'PA',type:'industrial',acres:50,comparison:'>',location:'Allentown, PA'}],
 ['industrial over 25 acres within 2 miles of Allentown PA',{state:'PA',type:'industrial',acres:25,comparison:'>',radius:2,location:'Allentown PA'}],
 ['multifamily over 3 acres in Edison NJ',{state:'NJ',type:'multifamily',acres:3,comparison:'>'}],
 ['the big one',{sort:'largest',search:false}],['go back',{search:false}],['what does that mean',{search:false}],
 ['Which of these qualify for OZ2?',{questionOZ:true,search:false}],['Who owns the largest one?',{questionOwnership:true,sort:'largest',search:false}],
 ['Show only the ones over 20 acres',{acres:20,comparison:'>',refine:true}],['only over 8 acres',{acres:8,comparison:'>',refine:true}],
 ['sort by acreage',{sort:'largest',search:false}],['export these',{search:false}],
];
for(const [q,want] of cases)test('Sprint 1 persona: '+q,()=>{const got=parse(q);for(const [key,value] of Object.entries(want))assert.equal(JSON.stringify(got[key]),JSON.stringify(value),key);});
test('unknown locations are never fuzzy substituted without a correction request',()=>{const i=parse('industrial in Completely Unknown Town NJ');assert.equal(i.suggestion,undefined);assert.equal(i.location,'Completely Unknown Town NJ');});
test('turnpike and IOS conditions stay explicit instead of becoming source filters',()=>{assert.ok(parse('IOS sites near the Turnpike in Edison NJ').unsupported.length===2);});
test('no hidden control characters can corrupt command regexes',()=>{assert.doesNotMatch(source,/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/);});

const D=(await import('../assets/radar-domain.js')).default;
test('manufactured homes are residential, not industrial manufacturing',()=>{for(const label of ['MOBILE HOME/MANUFACTURED HOME','MANUFACTURED HOMES','MOBILE HOME'])assert.equal(D.pbcCategory(label),'Other');assert.equal(D.pbcCategory('MANUFACTURING'),'Industrial');});
test('generic NJ price request does not geocode an article as a town',()=>{assert.equal(parse('find me a NJ property up for sale that has approx $200 per sq foot').location,'');});

test('multiword town spelling also requires confirmation',()=>{assert.equal(parse('industrial in Perth Ambboy NJ').suggestion,'industrial in perth amboy nj');assert.equal(parse('industrial in West Palm Beech FL').suggestion,'industrial in west palm beach fl');});

test('plain spoken street address is an address, an acreage search is not',()=>{assert.equal(parse('40 Hilton St Easton PA').address,true);assert.equal(parse('Find 6 acre industrial parcels in Edison NJ').address,false);});
