/* One-tap OZ 2.0 cohort bar for the NJ designated-areas inventory.
   Counts come from the measured 2018-map overlap (assets/data/nj-oz-round-comparison.json via oz2-designations.json);
   each button only sets the existing 2018-comparison and rural filters, so the inventory logic stays in one place. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const PRESETS=[
  {key:'all',label:'All 130',legacy:'',rural:false},
  {key:'new',label:'★ Brand-new 2026',legacy:'no-mapped-overlap',rural:false,count:t=>t.cohort2018==='new'},
  {key:'new-rural',label:'★ Brand-new rural (50% hurdle)',legacy:'no-mapped-overlap',rural:true,count:t=>t.cohort2018==='new'&&t.rural},
  {key:'partial',label:'Partly a 2018 zone',legacy:'partial-legacy-overlap',rural:false,count:t=>t.cohort2018==='partial'},
  {key:'retained',label:'Retained 2018 zone',legacy:'substantial-legacy-overlap',rural:false,count:t=>t.cohort2018==='retained'}];
 let bar=null;
 function label(){const D=window.RadarOZ2Designations;if(!bar||!D?.isLoaded?.())return;const all=D.allNJ?.()||[];for(const b of bar.querySelectorAll('button')){const p=PRESETS.find(x=>x.key===b.dataset.cohort);const n=p.count?all.filter(p.count).length:all.length;b.textContent=p.key==='all'?'All '+n:p.label+' ('+n+')';}}
 function apply(p){const legacy=$('ozInventoryLegacy'),rural=$('ozInventoryRural');if(!legacy)return;legacy.value=p.legacy;legacy.dispatchEvent(new Event('change',{bubbles:true}));if(rural&&!rural.disabled&&rural.checked!==p.rural){rural.checked=p.rural;rural.dispatchEvent(new Event('change',{bubbles:true}));}
  for(const b of bar.querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.cohort===p.key));}
 function sync(){if(!bar)return;const legacy=$('ozInventoryLegacy')?.value||'',rural=!!$('ozInventoryRural')?.checked;const p=PRESETS.find(x=>x.legacy===legacy&&x.rural===rural);for(const b of bar.querySelectorAll('button'))b.setAttribute('aria-pressed',String(!!p&&b.dataset.cohort===p.key));
  const ready=!!$('ozInventoryLegacy')&&!$('ozInventoryLegacy').disabled;for(const b of bar.querySelectorAll('button'))if(b.disabled===ready)b.disabled=!ready;}
 function mount(){const host=$('ozInventory'),anchor=$('ozInventoryRural')?.closest('label');if(!host||!anchor||$('ozCohortBar'))return;
  bar=document.createElement('div');bar.id='ozCohortBar';bar.className='oz-cohort-bar';bar.setAttribute('role','group');bar.setAttribute('aria-label','OZ 2.0 cohort');
  for(const p of PRESETS){const b=document.createElement('button');b.type='button';b.className='secondary';b.dataset.cohort=p.key;b.textContent=p.label;b.setAttribute('aria-pressed','false');b.addEventListener('click',()=>apply(p));bar.append(b);}
  const note=document.createElement('p');note.className='oz-cohort-note';note.textContent='Cohorts compare each 2027 tract with the official 2018 NJ OZ map (retained = at least 95% overlap). Rural tracts use the 50% improvement threshold and 30% step-up.';
  anchor.before(bar,note);label();sync();
  document.addEventListener('change',e=>{if(e.target?.id==='ozInventoryLegacy'||e.target?.id==='ozInventoryRural')sync();});
  let tries=0;const wait=setInterval(()=>{sync();if((++tries>120)||($('ozInventoryLegacy')&&!$('ozInventoryLegacy').disabled)){clearInterval(wait);sync();}},500);}
 document.addEventListener('radar:oz2-designations-ready',label);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
 setTimeout(()=>{mount();label();sync();},1500);
})();
