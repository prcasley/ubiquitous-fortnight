/* Evidence roles remain distinct even when a single research name leads the card. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadarExecutiveCardCore=api;})(globalThis,()=>{
 'use strict';
 const https=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}};
 // Plain-language role badges. Each role stays explicit so a tenant, permit holder or tax-bill
 // recipient is never presented as the landowner.
 const ROLES={owner:'OWNER · county tax record',carrier:'ON-SITE CARRIER (USDOT)',historical:'OLDER OWNER RECORD',site:'ON-SITE PERMIT HOLDER',mailing:'TAX-BILL MAILING ADDRESS',research:'OWNER NOT PUBLISHED'};
 function mailingText(m){if(!m?.street)return null;const street=String(m.street).trim(),parts=[street];
  // Some sources already fold city/state/ZIP into the street line; do not repeat them.
  const up=street.toUpperCase();if(m.cityState&&!up.includes(String(m.cityState).split(',')[0].trim().toUpperCase()))parts.push(m.cityState);
  const zip=String(m.zip||'').slice(0,5);if(zip&&!up.includes(zip))parts.push(zip);return parts.join(', ');}
 function getPrimaryDisplayOwner(record,{historical=[],research=null,regulatory=null,sharedCount=0,usdot=null}={}){
  const o=record.publishedOwner||record.ownership;
  const isProtected=!!(o?.protectedName||research?.protectedName||/protected|confidential/i.test(o?.message||''));
  // On-site businesses (federal carrier, environmental permit) can lead when no owner name is published.
  const carrier=usdot?.carrierName&&https(usdot.sourceURL)?{name:usdot.carrierName+(usdot.officers?.length?' — '+usdot.officers.join(', '):''),role:ROLES.carrier,url:https(usdot.sourceURL),note:'Not confirmed owner — on-site business'+(usdot.status?' · '+usdot.status:'')+(usdot.filingDate?' · filed '+String(usdot.filingDate).replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3'):''),tier:'carrier',phone:usdot.businessPhone||null}:null;
  const site=regulatory?.sites?.find(s=>s.siteName&&https(s.sourceURL));
  const permit=site?{name:site.siteName,role:ROLES.site,url:https(site.sourceURL),note:'Not confirmed owner — may be a tenant',tier:'site'}:null;
  // A protected record never falls through to older names or mailing addresses.
  if(isProtected)return carrier||permit||{name:'Open official property record',role:'Property research',url:null,note:'Protected record',tier:'protected'};
  if(o?.status==='published'&&(o.publishedName||o.entityName))return {name:o.publishedName||o.entityName,role:ROLES.owner,url:https(o.sourceURL),note:'Assessment record — title unverified',tier:'owner'};
  const old=historical.find(r=>r.owner&&https(r.sourceURL));
  if(old)return {name:old.owner,role:ROLES.historical,url:https(old.sourceURL),note:'Older file — current ownership unverified',tier:'historical'};
  if(carrier)return carrier;
  if(permit)return permit;
  const mail=mailingText(research?.mailing);
  if(mail&&https(research?.sourceURL))return {name:mail,role:ROLES.mailing,url:https(research.sourceURL),note:'Lead only — verify the deed'+(sharedCount>0?' · same address on '+sharedCount+' other researched parcel'+(sharedCount===1?'':'s'):''),tier:'mailing'};
  return {name:'Open official property record',role:'Find the recorded owner',url:null,note:'',tier:'none'};
 }
 const value=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0?n:null;
 function numbers(r){const land=value(r.landValue),improvements=value(r.improvementValue);return {land,improvements,total:value(r.assessedValue),landShare:land!==null&&improvements!==null&&land+improvements>0?land/(land+improvements)*100:null,acres:value(r.acres)};}
 function oz(r){const o=r.ozObservations?.[r.state==='NJ'?'ozNJ':r.state==='FL'?'ozFL':'oz2']||r.ozObservation;
  if(!o)return 'Check Opportunity Zone status';
  if(o.status==='expired'||o.validUntil&&Date.parse(o.validUntil)<=Date.now())return 'OZ data expired · refresh needed';
  if(o.status==='checking')return 'Checking Opportunity Zone status…';
  if(o.status==='unavailable')return 'OZ check needs retry';
  if(r.state==='NJ')return o.kind==='ozNJ'&&o.nominationVerified===true&&o.status==='reference-intersection'&&o.coverageBasis==='parcel-area'&&o.overlapPercent>=95?'NJ-nominated OZ 2.0 · certification unverified':o.status==='no-reference-intersection'?'No NJ nomination match in this check':'NJ nomination boundary/evidence review needed';
  if(r.state==='FL'&&o.kind==='ozFL'){const t=(o.tractDetails||[])[0],pct=v=>Number.isFinite(v)?v:null,pov=pct(t?.poverty),fi=Number(t?.familyIncome),ai=Number(t?.areaIncome);
   const facts=[pov!=null?'poverty '+(pov*100).toFixed(1)+'%':null,fi>0&&ai>0?'income '+Math.round(fi/ai*100)+'% of area':null].filter(Boolean).join(' · ');
   return 'FloridaCommerce OZ 2.0 eligibility '+(o.eligibilityStatus==='met'?'met':o.eligibilityStatus==='not-met'?'not met':'needs review')+(facts?' ('+facts+')':'')+' · not a nomination';}
 return 'OZ reference only · certification unverified';
 }
 return {https,getPrimaryDisplayOwner,numbers,oz,mailingText,ROLES};
});
