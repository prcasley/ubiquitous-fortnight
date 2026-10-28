/* Evidence stages, never a forecast of certification or tax qualification. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadarOZStatusCore=api;})(globalThis,()=>{
 'use strict';
 function resolve(geoid,{records=[],sources={},now=Date.now(),round='2027'}={}){
  if(!/^\d{11}$/.test(String(geoid)))throw Error('Use an exact 11-digit census tract GEOID');
  const state={34:'NJ',12:'FL',42:'PA'}[String(geoid).slice(0,2)];
  const federalHosts=['www.irs.gov','irs.gov','www.cdfifund.gov','cdfifund.gov','home.treasury.gov','www.treasury.gov','treasury.gov'];
  const valid=records.filter(r=>{if(!r||r.geoid!==geoid||r.round!==round)return false;const s=sources[r.sourceId];let u;try{u=new URL(r.sourceURL);}catch{return false;}const published=Date.parse(r.publishedAt),checked=Date.parse(r.checkedAt),until=Date.parse(r.validUntil);return s?.enabled===true&&u.protocol==='https:'&&!u.username&&!u.password&&u.origin===s.origin&&u.pathname.startsWith(s.pathPrefix||'/')&&r.recordId&&Number.isFinite(published)&&Number.isFinite(checked)&&Number.isFinite(until)&&published<=checked&&checked<=now&&until>now&&now-checked<=90*86400000&&(r.stage==='certified'?s.authority==='federal-certifier'&&federalHosts.includes(u.hostname):r.stage==='state-nominated'?s.authority==='state-government'&&s.state===state:r.stage==='official-eligible'?['federal-program','state-government'].includes(s.authority):false);});
  if(!valid.length)return {geoid,stage:'not-verified',certificationVerified:false,message:'No connected official eligibility, nomination or certification record has been verified for this tract. This does not establish that no official record exists.'};
  if(valid.some(r=>r.withdrawn===true))return {geoid,stage:'review-conflict',certificationVerified:false,message:'A withdrawal/conflicting status is recorded; review the original official records.'};
  const order={'official-eligible':1,'state-nominated':2,certified:3};valid.sort((a,b)=>order[b.stage]-order[a.stage]||Date.parse(b.checkedAt)-Date.parse(a.checkedAt));const evidence=valid[0];return {geoid,stage:evidence.stage,evidence,certificationVerified:evidence.stage==='certified',message:evidence.stage==='certified'?'A current official federal certification record is connected. Effective dates and project-level tax qualification still require separate review.':evidence.stage==='state-nominated'?'An official state nomination is connected. Nomination is not Treasury certification and does not predict approval.':'Official eligibility evidence is connected. Eligibility does not establish nomination or certification.'};
 }
 return {resolve};
});
