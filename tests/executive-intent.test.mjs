import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../assets/radar-agent.js',import.meta.url),'utf8');
function parse(q){const window={};vm.runInNewContext(source,{window,document:{readyState:'loading',addEventListener(){}}});return window.PublicRadarAgent.parseIntent(q);}
const cases=[
 ['Find industrial with 5 acres near Edison NJ',{state:'NJ',type:'industrial',acres:5,comparison:'>='}],
 ['Find warehouses over 5 acres near West Palm Beach FL',{state:'FL',type:'industrial',acres:5,comparison:'>'}],
 ['Find vacant at most 10 acres in Monmouth County NJ',{state:'NJ',type:'vacant',acres:10,comparison:'<='}],
 ['Find industrial between 5 and 20 acres in Broward County FL',{state:'FL',acres:5,maxAcres:20,comparison:'between'}],
 ['Find industrial about 6 acres near Edison NJ',{acres:5.4,maxAcres:6.6,comparison:'between'}],
 ['Find multifamily exactly 6 acres near West Palm Beach FL',{type:'multifamily',acres:6,comparison:'='}],
 ['Find five acre industrial sites within 10 miles near Edison NJ',{acres:5,radius:10}],
 ['Find industrial 5+ acres near West Palm Beach FL',{acres:5,comparison:'>='}],
 ['Find industrial at least 0 acres in Broward County FL',{acres:0,comparison:'>='}],
 ['Show the largest properties in this scan',{sort:'largest',location:'',acres:null,type:null}],
 ['Show the nearest parcels in these results',{sort:'nearest',location:'',acres:null}],
 ['Find industrial over 5 acres near Edison NJ before January 1',{location:'Edison NJ',questionDeadline:true}],
 ['Find industrial over 5 acres near West Palm Beach FL by December 31',{location:'West Palm Beach FL',questionDeadline:true}],
 ['Will this qualify for OZ2 if we close before January 1?',{questionOZ:true,questionDeadline:true,search:false}],
 ['When does OZ2 become designated?',{questionOZ:true,search:false}],
 ['Verify source and coverage',{questionSource:true,search:false}],
 ['Who owns these properties?',{questionOwnership:true,search:false}],
 ['Which lease expires before January 1?',{questionLease:true,questionDeadline:true,search:false}],
 ['Find 6 acres industrial near Edison NJ with the owner name',{acres:6,questionOwnership:true}],
 ['Find NJ industrial for sale around $200 per square foot',{state:'NJ',forSale:true,acres:null}],
 ['Show closed sale comps near Edison NJ around $200/SF',{comps:true,pricePsf:{amount:200,basis:'closed-sale',unit:'building-square-foot',approximate:true}}],
 ['Find industrial over -5 acres near Edison NJ',{invalidReason:'Acreage and radius cannot be negative.'}],
 ['Find industrial within -5 miles near Edison NJ',{invalidReason:'Acreage and radius cannot be negative.'}],
 ['Find industrial over 5 acres near Edison NJ under $5 million before January 1',{budget:{amount:5000000},acres:5,location:'Edison NJ',questionDeadline:true}],
 ['Can we buy these within $750k?',{budget:{amount:750000},search:false}],
 ['Find industrial between 20 and 5 acres in Palm Beach County FL',{invalidReason:'Enter a size range with the smaller acreage first.'}],
 ['Find industrial over 5 acres near Allentown Pennsylvania',{state:'PA',type:'industrial'}],
 ['Find industrial over 5 acres in Northampton County PA',{state:'PA',countyLabel:'Northampton'}],
];
for(const [question,expected] of cases)test('executive intent: '+question,()=>{const value=parse(question);for(const [key,want] of Object.entries(expected))assert.equal(JSON.stringify(value[key]),JSON.stringify(want),key);});
