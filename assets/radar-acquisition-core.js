/* Public parcel triage, not valuation, zoning approval or a purchase recommendation. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./radar-domain.js'):root.RadarDomain);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadarAcquisitionCore=api;})(globalThis,D=>{
 'use strict';
 const profiles={
  warehouse:{name:'Warehouse / distribution',checks:['Municipal permission for warehouse/distribution use','Truck access, turning movements and road restrictions','Net buildable area, setbacks and stormwater','Electricity, water/sewer and service capacity']},
  ios:{name:'Industrial outdoor storage',checks:['Express permission for outdoor storage and the materials/activity proposed','Screening, setbacks, paving and operating restrictions','Truck access, drainage and environmental permits','Usable storage area, buffers and flood exposure']}
 };
 const time=value=>{const t=Date.parse(value);return Number.isFinite(t)?t:null;};
 const https=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u:null;}catch{return null;}};
 // Only a configured adapter can supply current parcel-specific public evidence. A pasted
 // URL, owner name, tax class or user note never upgrades availability or permitted use.
 function observation(record,kind,profile,{evidence=[],sources={},now=Date.now()}={}){
  const matches=evidence.filter(e=>{
   if(!e||typeof e!=='object')return false;
   const src=sources[e.sourceId],u=https(e.sourceURL),checked=time(e.checkedAt),published=time(e.publishedAt),until=time(e.validUntil);
   return e.parcelKey===record.key&&e.kind===kind&&(kind==='public-offer'||e.profile===profile)&&(kind!=='public-offer'||(['sale','lease','auction'].includes(e.offerType)&&(e.answer==='yes'?e.offerStatus==='open':['closed','withdrawn','sold','open'].includes(e.offerStatus))&&e.governmentDisposition===true&&typeof e.agencyName==='string'&&e.agencyName.length>0))&&e.origin==='official-source-adapter'&&src?.enabled===true&&src.kinds?.includes(kind)&&u&&u.origin===src.origin&&u.pathname.startsWith(src.pathPrefix||'/')&&checked!=null&&published!=null&&until!=null&&published<=checked&&checked<=now&&until>now&&now-checked<=30*86400000&&until>=checked&&typeof e.recordId==='string'&&e.recordId.length>0&&['yes','no'].includes(e.answer);
  }).sort((a,b)=>time(b.checkedAt)-time(a.checkedAt));
  if(!matches.length)return null;
  if(matches.some(e=>e.answer!==matches[0].answer))return {answer:'conflict',message:'Conflicting public records; reconcile before proceeding.'};
  return matches[0];
 }
 function build(rows,meta,options={}){
  const {profile='warehouse',minAcres=0,maxAcres=null,limit=5,officialOffersOnly=false,evidence=[],sources={},screenings={},siteSignals={},searchCriteria=null,now=Date.now()}=options;
  if(!profiles[profile])throw Error('Choose warehouse/distribution or outdoor storage');
  const min=Number(minAcres),max=maxAcres==null||maxAcres===''?null:Number(maxAcres);
  if(!Number.isFinite(min)||min<0||max!=null&&(!Number.isFinite(max)||max<min))throw Error('Enter a valid acreage range, with the smaller number first');
  if(!['complete','partial'].includes(meta?.status)||!meta.time)return {profile,rows:[],excluded:[],status:'no-retrieval',message:'Run a public parcel search first. Failed, cancelled and map-only inspections are not acquisition shortlists.'};
  const ranked=[],excluded=[],seen=new Set();
  for(const r of rows){
   if(seen.has(r.key))continue;seen.add(r.key);
   const exclude=reason=>excluded.push({key:r.key,reason});
   if(!r.key||!['Industrial','Vacant'].includes(r.type)){exclude('No industrial or vacant assessment indicator; not a zoning determination.');continue;}
   if(r.acreageQuality==='suspect'||!Number.isFinite(r.acres)||r.acres<min||max!=null&&r.acres>max){exclude('Missing, conflicting or outside requested reported acreage.');continue;}
   const ctx={evidence,sources,now},permit=observation(r,'permitted-use',profile,ctx),offer=observation(r,'public-offer',profile,ctx),infrastructure=observation(r,'infrastructure',profile,ctx);
   if(permit?.answer==='no'){exclude('A current parcel-specific public record reports this use is not permitted.');continue;}
   if(officialOffersOnly&&offer?.answer!=='yes'){exclude('No current official parcel-specific sale/lease/auction offer has been connected.');continue;}
   const flags=[],unknowns=[];let completedChecks=0,constraintCount=0,constraintExtent=0;
   if(permit?.answer!=='yes')unknowns.push(profiles[profile].checks[0]);
   if(!offer||offer.answer!=='yes')unknowns.push('Current sale, lease or auction availability');
   if(infrastructure?.answer!=='yes')unknowns.push('Parcel-specific infrastructure/service capacity');
   if(permit?.answer==='conflict'||offer?.answer==='conflict'||infrastructure?.answer==='conflict')flags.push('Conflicting official records');
   if(offer?.answer==='no')flags.push('Official record reports no current public offer');
   if(infrastructure?.answer==='no')flags.push('Public infrastructure record reports a constraint');
   const checks=(screenings[r.key]||[]).filter(c=>c.parcelKey===r.key&&['flood','wetlands'].includes(c.kind));
   for(const kind of ['flood','wetlands']){const c=checks.filter(c=>c.kind===kind&&time(c.retrievedAt)!=null&&time(c.retrievedAt)<=now&&now-time(c.retrievedAt)<=30*86400000).sort((a,b)=>time(b.retrievedAt)-time(a.retrievedAt))[0];if(!c||kind==='flood'&&c.classificationVersion!=='fema-sfha-av-v1'||!['mapped-intersection','no-mapped-intersection'].includes(c.status)){unknowns.push(kind+' mapping check not completed');continue;}completedChecks++;const affected=c.status==='mapped-intersection'&&(c.overlapPercent==null||Number(c.overlapPercent)>0);if(affected){constraintCount++;constraintExtent=Math.max(constraintExtent,Number(c.overlapPercent)||0);}if(affected)flags.push(kind+': mapped reference intersection'+(c.labels?.length?' ('+c.labels.join(', ')+')':''));unknowns.push(kind+' jurisdiction/coverage clearance');}
   const ownership=r.ownership?.entityName?'Published assessment entity: '+r.ownership.entityName+' · observed '+r.ownership.retrievedAt+'. Title/control unverified.':'Published assessment name not checked; title and seller authority unverified.';
   unknowns.push('Deed/title, seller authority and beneficial ownership','Net usable acreage, legal access and project-specific approvals');
   const midpoint=max==null?null:(min+max)/2;
   const signals=siteSignals[r.key]||{},building=signals.buildings?.status==='complete'?signals.buildings:null,roads=signals.roads?.status==='complete'?signals.roads:null;
   const landShare=Number.isFinite(r.landValue)&&r.landValue>0&&Number.isFinite(r.improvementValue)&&r.improvementValue>=0?r.landValue/(r.landValue+r.improvementValue):null;
   const metrics={footprintSqft:building?.footprintSqft??null,coveragePercent:building?.coveragePercent??null,yearBuilt:r.yearBuilt??null,landShare,roadMiles:roads?.nearestMiles??null};
   const profileSort=profile==='warehouse'?[metrics.footprintSqft==null?1:0,-(metrics.footprintSqft??0),-(metrics.yearBuilt??0)]:[metrics.coveragePercent==null?1:0,metrics.coveragePercent??0,metrics.landShare==null?1:0,-(metrics.landShare??0),metrics.roadMiles??Infinity];
   if(!building)unknowns.push('Mapped building footprint/coverage not yet measured');
   if(profile==='ios'){unknowns.push('Pavement and usable storage yard not established by low roof coverage');if(!roads)unknowns.push('Named highway proximity not checked');}
   const format=n=>Number(n).toLocaleString('en-US',{maximumFractionDigits:2});
   const sourceFilter=searchCriteria?('Original search: '+(searchCriteria.op==='between'?format(searchCriteria.value)+'–'+format(searchCriteria.max):({'>' :'over','>=':'at least','<':'under','<=':'at most','=':'exactly'}[searchCriteria.op]||'at least')+' '+format(searchCriteria.value))+' acres'):'Original scanner acreage filters retained';
   ranked.push({key:r.key,record:r,profile,status:permit?.answer==='yes'&&offer?.answer==='yes'?'public-evidence-candidate':'research-candidate',metrics,signals,environmentalPriority:constraintCount?'mapped-constraint':completedChecks===2?'reference-checks-complete':'not-fully-checked',why:[format(r.acres)+' reported acres · '+sourceFilter+(max!=null?' · profile range '+format(min)+'–'+format(max):min>0?' · profile minimum '+format(min):' · no additional profile acreage restriction'),r.type+' assessment indicator; not a zoning approval',Number.isFinite(r.distance)?r.distance.toFixed(2)+' miles to the search map point':'Distance not published'],ownership,governmentOwnership:'Not inferred from names or assessment class.',permit,offer,infrastructure,unknowns,flags,nextChecks:profiles[profile].checks,sort:{environment:constraintCount?2:completedChecks===2?0:1,constraintExtent,profileSort,permit:permit?.answer==='yes'?1:0,offer:offer?.answer==='yes'?1:0,fit:midpoint==null?0:Math.abs(r.acres-midpoint),distance:Number.isFinite(r.distance)?r.distance:Infinity}});
  }
  const compareProfile=(a,b)=>{for(let i=0;i<a.length;i++){if(a[i]!==b[i])return a[i]<b[i]?-1:1;}return 0;};
  ranked.sort((a,b)=>a.sort.environment-b.sort.environment||a.sort.constraintExtent-b.sort.constraintExtent||b.sort.permit-a.sort.permit||b.sort.offer-a.sort.offer||compareProfile(a.sort.profileSort,b.sort.profileSort)||a.sort.fit-b.sort.fit||a.sort.distance-b.sort.distance||a.key.localeCompare(b.key));
  return {profile,name:profiles[profile].name,rows:ranked.slice(0,Math.max(1,Math.min(25,Number(limit)||5))),eligibleCount:ranked.length,excluded,status:meta.status,source:meta.source,retrievedAt:meta.time,ranking:'Environmental reference checks first: both checks completed without a mapped constraint, then unchecked/failed checks, then known mapped SFHA/wetlands constraints (larger overlap lower). Unchecked is not cleared. Then current use permission and official offer; '+(profile==='warehouse'?'warehouse: mapped building footprint area, then published construction year':'outdoor storage: low mapped building coverage, land share of assessed values, then straight-line NJ corridor proximity')+'. Unknown metrics are not invented or treated as zero. These are screening proxies, not zoning, pavement, access or investment determinations. Acreage fit and location break remaining ties.',caveat:'Research candidates only. Public ownership is not a sale offer; assessment class is not zoning. Gross acreage is not net buildable acreage. Mapped hazards, absent features and OZ references do not establish clearance or tax qualification.'};
 }
 return {profiles,observation,build};
});
