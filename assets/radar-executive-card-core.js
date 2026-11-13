/* Evidence roles remain distinct even when a single research name leads the card. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadarExecutiveCardCore=api;})(globalThis,()=>{
 'use strict';
 const https=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}};
 // Plain-language role badges. Each role stays explicit so a tenant, permit holder or tax-bill
 // recipient is never presented as the landowner.
 const ROLES={owner:'OWNER · county tax record',carrier:'ON-SITE CARRIER (USDOT)',historical:'OLDER OWNER RECORD',site:'ON-SITE PERMIT HOLDER',facility:'ON-SITE FACILITY (EPA)',mailing:'TAX-BILL MAILING ADDRESS',research:'OWNER NOT PUBLISHED'};
 function mailingText(m){if(!m?.street)return null;const street=String(m.street).trim(),parts=[street];
  // Some sources already fold city/state/ZIP into the street line; do not repeat them.
  const up=street.toUpperCase();if(m.cityState&&!up.includes(String(m.cityState).split(',')[0].trim().toUpperCase()))parts.push(m.cityState);
  const zip=String(m.zip||'').slice(0,5);if(zip&&!up.includes(zip))parts.push(zip);return parts.join(', ');}
 function getPrimaryDisplayOwner(record,{historical=[],research=null,regulatory=null,sharedCount=0,usdot=null,epa=[]}={}){
  const o=record.publishedOwner||record.ownership;
  const isProtected=!!(o?.protectedName||research?.protectedName||/protected|confidential/i.test(o?.message||''));
  // On-site businesses (federal carrier, environmental permit) can lead when no owner name is published.
  const carrier=usdot?.carrierName&&https(usdot.sourceURL)?{name:usdot.carrierName+(usdot.officers?.length?' — '+usdot.officers.join(', '):''),role:ROLES.carrier,url:https(usdot.sourceURL),note:'Not confirmed owner — on-site business'+(usdot.status?' · '+usdot.status:'')+(usdot.filingDate?' · filed '+String(usdot.filingDate).replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3'):''),tier:'carrier',phone:usdot.businessPhone||null,email:/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(usdot.email||'')?usdot.email:null,company:usdot.carrierName}:null;
  const fac=(epa||[]).find(f=>f.name&&https(f.sourceURL));
  const facility=fac?{name:fac.name,role:ROLES.facility,url:https(fac.sourceURL),note:'Not confirmed owner — operator recorded by EPA'+(fac.industry?' · '+fac.industry.replace(/^\d+:\s*/,''):'')+(fac.active===false?' · inactive':''),tier:'facility',company:fac.name}:null;
  const site=regulatory?.sites?.find(s=>s.siteName&&https(s.sourceURL));
  const permit=site?{name:site.siteName,role:ROLES.site,url:https(site.sourceURL),note:'Not confirmed owner — may be a tenant',tier:'site'}:null;
  // A protected record never falls through to older names or mailing addresses.
  if(isProtected)return carrier||facility||permit||{name:'Open official property record',role:'Property research',url:null,note:'Protected record',tier:'protected'};
  if(o?.status==='published'&&(o.publishedName||o.entityName))return {name:o.publishedName||o.entityName,role:ROLES.owner,url:https(o.sourceURL),note:'Assessment record — title unverified',tier:'owner'};
  const old=historical.find(r=>r.owner&&https(r.sourceURL));
  if(old)return {name:old.owner,role:ROLES.historical,url:https(old.sourceURL),note:'Older file — current ownership unverified',tier:'historical'};
  if(carrier)return carrier;
  if(facility)return facility;
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
  const D=(typeof window!=='undefined'?window:globalThis).RadarOZ2Designations;
  if(r.state==='NJ')return o.kind==='ozNJ'&&o.nominationVerified===true&&o.status==='reference-intersection'&&o.coverageBasis==='parcel-area'&&o.overlapPercent>=95?'Designated OZ 2.0 · Certified by U.S. Treasury (Effective Jan 1, 2027 – Dec 31, 2036)':o.status==='no-reference-intersection'?'Not in a designated NJ OZ 2.0 tract':'Designated-tract boundary review needed';
  if(r.state==='FL'&&o.kind==='ozFL'){const t=(o.tractDetails||[])[0],pct=v=>Number.isFinite(v)?v:null,pov=pct(t?.poverty),fi=Number(t?.familyIncome),ai=Number(t?.areaIncome);
   const facts=[pov!=null?'poverty '+(pov*100).toFixed(1)+'%':null,fi>0&&ai>0?'income '+Math.round(fi/ai*100)+'% of area':null].filter(Boolean).join(' · ');
   const designated=D?.isLoaded?.()?(o.tractDetails||[]).some(x=>D.get(x.geoid)?.state==='FL'):null;
   if(designated===true)return 'Designated OZ 2.0 (Effective Jan 1, 2027)'+(facts?' · '+facts:'');
   if(o.eligibilityStatus==='met')return (designated===false?'OZ 2.0 eligible · not designated by Treasury':'OZ 2.0 eligible · designation check loading')+(facts?' ('+facts+')':'');
   return o.eligibilityStatus==='not-met'?'Not an OZ 2.0 tract'+(facts?' ('+facts+')':''):'OZ 2.0 status needs review';}
 return 'OZ reference only · not a Treasury designation check';
 }
 function ozBadges(r){const D=(typeof window!=='undefined'?window:globalThis).RadarOZ2Designations;if(!D?.isLoaded?.())return [];const o=r.ozObservations?.[r.state==='NJ'?'ozNJ':r.state==='FL'?'ozFL':'oz2']||r.ozObservation;if(!o||!['reference-intersection','reference-point-intersection'].includes(o.status))return [];if(r.state==='NJ'&&!(o.coverageBasis==='parcel-area'&&o.overlapPercent>=95))return [];const seen=new Set(),out=[];for(const t of o.tractDetails||[])for(const b of D.badges(t.geoid))if(!seen.has(b.text)){seen.add(b.text);out.push(b);}return out;}
 return {https,getPrimaryDisplayOwner,numbers,oz,ozBadges,mailingText,ROLES};
});
