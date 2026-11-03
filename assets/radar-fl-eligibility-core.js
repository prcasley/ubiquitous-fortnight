/* State-published criteria, not a nomination, certification or tax determination. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadarFLEligibilityCore=api;})(globalThis,()=>{
 'use strict';const base='https://services1.arcgis.com/HpJC1O7FLVQlHgaG/arcgis/rest/services/';
 const numeric=v=>{if(v==null||typeof v==='boolean')return null;const s=String(v).replace(/[$,\s]/g,'');return /^\d+(?:\.\d+)?$/.test(s)&&Number.isFinite(Number(s))?Number(s):null;};
 function validate(d,now=Date.now()){
  if(d?.version!==1||d.authority!=='state-government'||d.state!=='FL'||d.nominationVerified!==false||d.certificationVerified!==false||!Array.isArray(d.records)||d.records.length!==5076||!Number.isFinite(Date.parse(d.checkedAt))||Date.parse(d.checkedAt)>now||!Number.isFinite(Date.parse(d.validUntil))||Date.parse(d.validUntil)<=now||Date.parse(d.validUntil)-Date.parse(d.checkedAt)>90*86400000||now-Date.parse(d.checkedAt)>90*86400000)throw Error('FloridaCommerce eligibility evidence is invalid or expired');
  const expected={met:['oppzones_ustreasury_met',1367],'not-met':['oppzones_ustreasury_NotMet',3709]},ids=new Set();
  for(const [status,[name,count]] of Object.entries(expected)){const s=d.sources?.[status];if(s?.url!==base+name+'/FeatureServer/0'||s.authority!=='state-government'||s.state!=='FL'||s.expectedCount!==count||d.records.filter(r=>r.criteria===status).length!==count)throw Error('FloridaCommerce source scope changed');}
  for(const r of d.records){if(!/^12\d{9}$/.test(r.geoid)||ids.has(r.geoid)||!Object.hasOwn(expected,r.criteria)||r.povertyRate!=null&&(!Number.isFinite(r.povertyRate)||r.povertyRate<0||r.povertyRate>1))throw Error('Conflicting Florida eligibility tract evidence');ids.add(r.geoid);}
  return new Map(d.records.map(r=>[r.geoid,r]));
 }
 function combine(key,met,notMet,bundle,index){
  const details=[...(met?.tractDetails||[]),...(notMet?.tractDetails||[])].map(t=>{const row=index.get(t.geoid);if(!row||row.criteria!==(t.designation==='Meets Criteria'?'met':'not-met'))throw Error('FloridaCommerce boundaries did not reconcile with eligibility evidence');return {geoid:t.geoid,criteria:row.criteria,designation:t.designation,poverty:t.poverty,familyIncome:t.familyIncome,areaIncome:t.areaIncome};});
  const statuses=new Set(details.map(t=>t.criteria));return {key,kind:'ozFL',status:details.length?'reference-intersection':'no-reference-intersection',eligibilityStatus:statuses.size>1?'mixed':statuses.has('met')?'met':statuses.has('not-met')?'not-met':'unknown',tracts:[...new Set(details.map(t=>t.geoid))],tractDetails:details,checkedAt:met?.checkedAt||notMet?.checkedAt||new Date().toISOString(),validUntil:bundle.validUntil,sourceName:bundle.label,sourceURL:bundle.programURL,nominationVerified:false,certificationVerified:false};
 }
 return {validate,combine,numeric};
});
