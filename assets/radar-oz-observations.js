/* Official NJ nominations are primary. No owner/contact facts enter these requests. */
(() => {
 'use strict';const B=()=>window.PublicRadarBridge,P=window.RadarProperty,pending=new Map();let evidence=null,snapshot=null,timer;
 function bundle(){if(!snapshot)snapshot=fetch('assets/data/oz-designation-evidence.json',{credentials:'omit',cache:'no-cache'}).then(async r=>{if(!r.ok)throw Error('NJ nomination evidence unavailable');const d=await r.json();if(d.version!==1||d.records?.filter(x=>x.sourceId==='nj-dca-oz2-nominations').length!==130)throw Error('NJ nomination evidence count changed; review required');evidence=d;return d;}).catch(e=>{snapshot=null;throw e;});return snapshot;}
 function decorate(node,row){node.classList.add('oz-observation');node.dataset.ozKey=row.key;node.dataset.ozScan=String(B().getMeta().scanId);node.textContent=P.ozLabel(row);return node;}
 function publish(rows){const scanId=B().getMeta().scanId,byKey=new Map(rows.map(r=>[r.key,r]));for(const node of document.querySelectorAll('.oz-observation[data-oz-key]')){const row=byKey.get(node.dataset.ozKey);if(row&&B().getRecord(row.key)===row&&node.dataset.ozScan===String(scanId))node.textContent=P.ozLabel(row);}document.dispatchEvent(new CustomEvent('radar:oz-updated',{detail:{scanId,keys:rows.map(r=>r.key),observations:rows.map(r=>({key:r.key,observation:r.ozObservations?.ozNJ}))}}));}
 function attach(row,o){row.ozObservations={...(row.ozObservations||{}),ozNJ:o};row.ozObservation=o;}
 async function check(rows,{force=false}={}){
  const nj=rows.filter(r=>r.state==='NJ');if(!nj.length)return {observations:[],checkedAt:new Date().toISOString()};const scanId=B().getMeta().scanId;
  const active=[...new Set(nj.map(r=>{const p=pending.get(r.key);return p?.scanId===scanId?p.task:null;}).filter(Boolean))];if(active.length){await Promise.all(active);return check(rows,{force:false});}
  if(!force&&nj.every(r=>{const o=r.ozObservations?.ozNJ;return o&&!['checking','unavailable'].includes(o.status)&&Date.now()-Date.parse(o.checkedAt)<300000&&Date.parse(o.validUntil)>Date.now();}))return {observations:nj.map(r=>r.ozObservations.ozNJ),sourceName:window.RadarOZResearch.sources.ozNJ.name,checkedAt:nj[0].ozObservations.ozNJ.checkedAt};
  for(const r of nj)attach(r,{kind:'ozNJ',status:'checking',tracts:[]});publish(nj);
  const task=(async()=>{
   try{const d=await bundle(),result=await window.RadarOZResearch.check(nj,{kind:'ozNJ'});if(B().getMeta().scanId!==scanId)throw Error('Search changed during nomination retrieval');
    for(const o of result.observations){for(const id of o.tracts){if(!['state-nominated','certified'].includes(window.RadarOZStatusCore.resolve(id,d).stage))throw Error('Official boundary and connected 130-tract evidence did not reconcile');}
     o.validUntil=new Date(Math.min(...d.records.filter(r=>r.sourceId==='nj-dca-oz2-nominations').map(r=>Date.parse(r.validUntil)))).toISOString();o.nominationVerified=o.tracts.length>0;o.tractDetails=o.tracts.map(id=>{const r=d.records.find(r=>r.geoid===id&&r.sourceId==='nj-dca-oz2-nominations');return {geoid:id,municipality:r?.municipality||'',county:r?.county||''};});
    }
    const byKey=new Map(result.observations.map(o=>[o.key,o]));for(const r of nj)attach(r,byKey.get(r.key));publish(nj);return result;
   }catch(e){if(B().getMeta().scanId===scanId){for(const r of nj)attach(r,{kind:'ozNJ',status:'unavailable',tracts:[],checkedAt:new Date().toISOString()});publish(nj);}throw e;}
   finally{for(const r of nj)if(pending.get(r.key)?.task===task)pending.delete(r.key);}
  })();for(const r of nj)pending.set(r.key,{scanId,task});return task;
 }
 function scan(){clearTimeout(timer);timer=setTimeout(()=>{const rows=B().getResults();if(rows.some(r=>r.state==='NJ'))check(rows).catch(()=>{});},0);}
 function init(){document.addEventListener('radar:scan-complete',scan);document.addEventListener('radar:scan-state',e=>{if(e.detail.state==='partial')scan();if(e.detail.state==='idle')clearTimeout(timer);});document.addEventListener('radar:parcel-selected',e=>{const r=B().getRecord(e.detail.key);if(r?.state==='NJ')check([r]).catch(()=>{});});}
 window.RadarOZObservations={check,decorate};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
