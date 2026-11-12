/* U.S. Treasury 2027 QOZ designations (SB0682, Nov 5, 2026) for NJ and FL tracts. Tract-level fact; parcel coverage is checked separately. */
(function(root){
 'use strict';
 let data=null;
 const valid=d=>d&&d.format==='RadarOZ2Designations'&&d.version===1&&d.source?.release==='SB0682'&&d.tracts&&typeof d.tracts==='object'&&Object.keys(d.tracts).every(k=>/^\d{11}$/.test(k));
 const get=id=>data&&data.tracts[String(id||'')]||null;
 const load=d=>{if(!valid(d))throw Error('OZ 2.0 designation file invalid');data=d;return d;};
 const ready=typeof fetch==='function'&&root.document?fetch('assets/data/oz2-designations.json',{credentials:'omit',cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('OZ 2.0 designation file unavailable');return r.json();}).then(d=>{load(d);
  root.document.dispatchEvent(new Event('radar:oz2-designations-ready'));const B=root.PublicRadarBridge;for(const r of B?.getResults?.()||[])root.RadarExecutiveCards?.refresh?.(r);return true;}).catch(()=>false):Promise.resolve(false);
 const COHORT={retained:'Retained 2018 zone',partial:'Partly a 2018 zone',new:'Brand-new 2026 designation',unknown:'2018 overlap not measured'};
 const RURAL='Rural OZ 2.0 (50% Improvement Threshold · 30% Step-Up)';
 function badges(id){const t=get(id);if(!t)return [];const out=[];if(t.state==='NJ'&&t.cohort2018)out.push({kind:'cohort-'+t.cohort2018,text:COHORT[t.cohort2018]});if(t.rural)out.push({kind:'rural',text:RURAL});return out;}
 root.RadarOZ2Designations={ready,get,load,badges,isLoaded:()=>!!data,meta:()=>data&&{source:data.source,effective:data.effective,expires:data.expires,totals:data.totals},COHORT,RURAL,
  LABEL_NJ:'Designated OZ 2.0 · Certified by U.S. Treasury (Effective Jan 1, 2027 – Dec 31, 2036)',LABEL_FL:'Designated OZ 2.0 (Effective Jan 1, 2027)'};
})(typeof window!=='undefined'?window:globalThis);
