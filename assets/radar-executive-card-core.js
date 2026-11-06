/* Evidence roles remain distinct even when a single research name leads the card. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadarExecutiveCardCore=api;})(globalThis,()=>{
 'use strict';
 const https=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}};
 function getPrimaryDisplayOwner(record,{historical=[],research=null,regulatory=null}={}){
  const o=record.publishedOwner||record.ownership;
  // A protected current record never falls through to older names or mailing recipients.
  if(o?.protectedName||research?.protectedName||/protected|confidential/i.test(o?.message||''))return {name:'Open official property record',role:'Property research',url:null,note:'Protected record'};
  if(o?.status==='published'&&(o.publishedName||o.entityName))return {name:o.publishedName||o.entityName,role:'Assessment name',url:https(o.sourceURL),note:'Assessment record — title unverified'};
  const old=historical.find(r=>r.owner&&https(r.sourceURL));
  if(old)return {name:old.owner,role:'Historical assessment name',url:https(old.sourceURL),note:'Older record — current ownership unverified'};
  const site=regulatory?.sites?.find(s=>s.siteName&&https(s.sourceURL));
  if(site)return {name:site.siteName,role:'Regulatory site reference',url:https(site.sourceURL),note:'Site reference — owner and operator unverified'};
  return {name:'Open official property record',role:'Find the recorded owner',url:null,note:''};
 }
 const value=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0?n:null;
 function numbers(r){const land=value(r.landValue),improvements=value(r.improvementValue);return {land,improvements,total:value(r.assessedValue),landShare:land!==null&&improvements!==null&&land+improvements>0?land/(land+improvements)*100:null,acres:value(r.acres)};}
 function oz(r){const o=r.ozObservations?.[r.state==='NJ'?'ozNJ':r.state==='FL'?'ozFL':'oz2']||r.ozObservation;
  if(!o)return 'Check Opportunity Zone status';
  if(o.status==='expired'||o.validUntil&&Date.parse(o.validUntil)<=Date.now())return 'OZ data expired · refresh needed';
  if(o.status==='checking')return 'Checking Opportunity Zone status…';
  if(o.status==='unavailable')return 'OZ check needs retry';
  if(r.state==='NJ')return o.kind==='ozNJ'&&o.nominationVerified===true&&o.status==='reference-intersection'&&o.coverageBasis==='parcel-area'&&o.overlapPercent>=95?'NJ-nominated OZ 2.0 · certification unverified':o.status==='no-reference-intersection'?'No NJ nomination match in this check':'NJ nomination boundary/evidence review needed';
  if(r.state==='FL'&&o.kind==='ozFL')return 'FloridaCommerce OZ 2.0 eligibility '+(o.eligibilityStatus==='met'?'met':o.eligibilityStatus==='not-met'?'not met':'needs review')+' · not a nomination';
  return 'OZ reference only · certification unverified';
 }
 return {https,getPrimaryDisplayOwner,numbers,oz};
});
