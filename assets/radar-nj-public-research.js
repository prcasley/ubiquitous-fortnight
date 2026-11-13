/* Published NJ context is separate from the imported owner index and is never promoted to title. */
(() => {
 'use strict';let data=null;const shards=new Map(),pending=new Map();
 const status=t=>{const host=document.getElementById('njPublishedResearchStatus');if(host)host.textContent=t;};
 const ready=fetch('assets/data/nj-parcel-research.json',{credentials:'omit',cache:'no-cache'}).then(async r=>{if(!r.ok)throw Error('NJ context snapshot unavailable');const d=await r.json();
  const legacy=d.format==='RadarNJParcelResearch'&&d.version===1&&Array.isArray(d.records)&&d.records.length<=500;
  const sharded=d.format==='RadarNJParcelResearch'&&d.version===2&&d.shards&&typeof d.shards==='object'&&Object.entries(d.shards).every(([k,v])=>/^\d{4}$/.test(k)&&v?.file==='nj-research/'+k+'.json');
  if(!legacy&&!sharded)throw Error('NJ context snapshot format invalid');data=d;
  const t=sharded?d.totals:{records:d.records.length,assessmentNames:d.records.filter(r=>r.assessmentOwnerObservation).length,regulatorySites:d.records.reduce((n,r)=>n+(r.njdepContext?.sites?.length||0),0)};
  status(t.records+' NJ business-target parcel records'+(sharded?' in '+Object.keys(d.shards).length+' towns across '+(d.coverage.tractsWithParcels||'?')+' of '+(d.coverage.sourceSelectedTracts||130)+' designated tracts':'')+' · '+t.assessmentNames+' published assessment-entity names · '+t.regulatorySites+' regulatory site references. '+(d.coverage.partial?'Some source checks were partial. ':'Complete for the requested source scope. ')+'Checked '+d.checkedAt+'. Regulatory names and mailing recipients are not verified owners or acquisition contacts.');
  document.dispatchEvent(new Event('radar:nj-public-research-ready'));return true;}).catch(()=>{status('Published NJ context snapshot unavailable. Selected-parcel live research remains available.');return false;});
 const keyOf=id=>{const m=/^(\d{4})_/.exec(String(id||''));return m?m[1]:null;};
 function refreshTown(key){const B=window.PublicRadarBridge;if(!B)return;const seen=new Set();const list=[...(B.getResults?.()||[])];const sel=B.getRecord?.(B.getSelected?.());if(sel)list.push(sel);for(const r of list)if(r?.state==='NJ'&&keyOf(r.id)===key&&!seen.has(r.key)){seen.add(r.key);window.RadarExecutiveCards?.refresh?.(r);}}
 function loadTown(key){if(pending.has(key))return pending.get(key);const meta=data?.shards?.[key];if(!meta)return Promise.resolve(null);
  const p=fetch('assets/data/'+meta.file,{credentials:'omit'}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(d=>{if(d.format!=='RadarNJParcelResearchShard'||d.version!==1||d.shard!==key||!Array.isArray(d.records)||d.records.some(r=>keyOf(r.parcelId)!==key))throw Error('NJ town research format invalid');const m=new Map(d.records.map(r=>[r.parcelId,r]));shards.set(key,m);document.dispatchEvent(new CustomEvent('radar:nj-public-research-ready',{detail:{town:key}}));refreshTown(key);return m;}).catch(()=>{pending.delete(key);return null;});
  pending.set(key,p);return p;}
 function find(record){if(record?.state!=='NJ'||!window.RadarOwnershipResearchCore.businessParcel(record))return null;if(!data)return null;
  if(data.version===1)return data.records.find(r=>r.state==='NJ'&&r.parcelId===record.id)||null;
  const key=keyOf(record.id);if(!key)return null;const town=shards.get(key);if(town)return town.get(record.id)||null;loadTown(key);return null;}
 async function ensure(record){await ready;const key=keyOf(record?.id);if(data?.version===2&&key)await loadTown(key);return find(record);}
 async function quickPicks(){await ready;if(!data)return [];if(data.version===2)return data.quickPicks||[];return data.records.filter(x=>x.usdotContext?.carrierName&&x.facts?.PROP_LOC).map(x=>({parcelId:x.parcelId,address:x.facts.PROP_LOC,municipality:x.facts.MUN_NAME,carrierName:x.usdotContext.carrierName,status:x.usdotContext.status||null}));}
 function regulatory(record){const d=find(record)?.njdepContext;if(!d||d.format!=='RadarNJDEPContext'||d.version!==1||d.parcelId!==record.id||!['observed','partial'].includes(d.status)||!Number.isFinite(Date.parse(d.checkedAt))||Date.parse(d.checkedAt)>Date.now()||Date.now()-Date.parse(d.checkedAt)>30*86400000||!Array.isArray(d.sites)||!Array.isArray(d.interests)||d.sites.some(s=>s.role!=='regulatory-site'||!s.sourceURL?.startsWith(window.RadarNJDEP.sources.sites+'/query?'))||d.interests.some(s=>s.role!=='program-interest'||!s.sourceURL?.startsWith(window.RadarNJDEP.sources.interests+'/query?')))return null;return d;}
 // Federal carrier filed at the parcel's street address: an on-site operator reference, never the owner.
 function epa(record){const e=find(record)?.epaContext;if(!e||e.status!=='observed'||!Array.isArray(e.facilities))return [];return e.facilities.filter(f=>f.role==='on-site-facility-not-owner'&&f.name&&/^https:\/\//.test(f.sourceURL||''));}
 function usdot(record){const u=find(record)?.usdotContext;if(!u||u.role!=='on-site-carrier-not-owner'||!u.carrierName||!/^https:\/\//.test(u.sourceURL||''))return null;return u;}
 window.RadarNJPublicResearch={ready,find,ensure,quickPicks,regulatory,usdot,epa};
})();
