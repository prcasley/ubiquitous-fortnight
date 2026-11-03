(() => {
 'use strict';const B=()=>window.PublicRadarBridge,C=window.RadarFLEligibilityCore,pending=new Map();let snapshot;
 function bundle(){if(!snapshot)snapshot=fetch('assets/data/fl-oz-eligibility.json',{credentials:'omit',cache:'no-cache'}).then(async r=>{if(!r.ok)throw Error('FloridaCommerce eligibility evidence unavailable');const data=await r.json();return {data,index:C.validate(data)};}).catch(e=>{snapshot=null;throw e;});return snapshot;}
 function publish(rows){window.RadarOZObservations.publish(rows);}
 function attach(r,o){r.ozObservations={...(r.ozObservations||{}),ozFL:o};r.ozObservation=o;}
 async function check(rows,{force=false}={}){
  const fl=rows.filter(r=>r.state==='FL'),scanId=B().getMeta().scanId;if(!fl.length)return {observations:[]};
  const active=[...new Set(fl.map(r=>{const p=pending.get(r.key);return p?.scanId===scanId?p.task:null;}).filter(Boolean))];if(active.length){await Promise.all(active);return check(rows,{force:false});}
  if(!force&&fl.every(r=>{const o=r.ozObservations?.ozFL;return o&&!['checking','unavailable'].includes(o.status)&&Date.now()-Date.parse(o.checkedAt)<300000&&Date.parse(o.validUntil)>Date.now();}))return {observations:fl.map(r=>r.ozObservations.ozFL),checkedAt:fl[0].ozObservations.ozFL.checkedAt,sourceName:'FloridaCommerce eligibility (not a nomination list)'};
  for(const r of fl)attach(r,{kind:'ozFL',status:'checking',tracts:[]});publish(fl);
  const task=(async()=>{
   const oz1=window.RadarOZResearch.check(fl,{kind:'oz1'});oz1.catch(()=>{});
   try{const {data,index}=await bundle();C.validate(data);const results=await Promise.allSettled([Promise.all([window.RadarOZResearch.check(fl,{kind:'ozFL'}),window.RadarOZResearch.check(fl,{kind:'ozFLNot'})]),oz1]);
    if(B().getMeta().scanId!==scanId)throw Error('Search changed during Florida eligibility check');
    if(results[1].status==='fulfilled'){const map=new Map(results[1].value.observations.map(o=>[o.key,o]));for(const r of fl)r.ozObservations.oz1=map.get(r.key);}else for(const r of fl)r.ozObservations.oz1={kind:'oz1',status:'unavailable',tracts:[],checkedAt:new Date().toISOString()};
    if(results[0].status!=='fulfilled')throw results[0].reason;
    const [met,notMet]=results[0].value,m=new Map(met.observations.map(o=>[o.key,o])),n=new Map(notMet.observations.map(o=>[o.key,o]));const observations=fl.map(r=>C.combine(r.key,m.get(r.key),n.get(r.key),data,index));
    for(let i=0;i<fl.length;i++)attach(fl[i],observations[i]);publish(fl);return {observations,checkedAt:observations[0].checkedAt,sourceName:data.label};
   }catch(e){if(B().getMeta().scanId===scanId){for(const r of fl)attach(r,{kind:'ozFL',status:'unavailable',tracts:[],checkedAt:new Date().toISOString()});publish(fl);}throw e;}
   finally{for(const r of fl)if(pending.get(r.key)?.task===task)pending.delete(r.key);}
  })();for(const r of fl)pending.set(r.key,{scanId,task});return task;
 }
 window.RadarFLOZ={check};
})();
