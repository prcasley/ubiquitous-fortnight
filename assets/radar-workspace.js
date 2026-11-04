/* Three research modes share one persistent map. Moving existing nodes preserves records and listeners. */
(() => {
 'use strict';const $=id=>document.getElementById(id);let current='scan',panels={},tabs={},scrollOffsets={};
 function activate(mode,{focus=false}={}){if(!panels[mode])return;const drawer=$('workspaceDrawer');if(drawer&&panels[current]&&!panels[current].hidden)scrollOffsets[current]=drawer.scrollTop;current=mode;for(const key of Object.keys(panels)){panels[key].hidden=key!==mode;tabs[key].setAttribute('aria-selected',String(key===mode));tabs[key].tabIndex=key===mode?0:-1;}if(drawer)drawer.scrollTop=scrollOffsets[mode]||0;if(focus)tabs[mode].focus();requestAnimationFrame(()=>window.PublicRadarBridge?.getMap()?.invalidateSize({pan:false}));}
 function init(){const scanner=$('scanner'),mapColumn=scanner?.querySelector('.map-column');if(!scanner||!mapColumn)return;
  const root=document.createElement('section');root.id='radarWorkspace';root.className='radar-split';root.setAttribute('aria-label','Property research workspace');
  const nav=document.createElement('div');nav.className='workspace-mode-tabs';nav.setAttribute('role','tablist');nav.setAttribute('aria-label','Research mode');
  const drawer=document.createElement('div');drawer.className='workspace-drawer';drawer.id='workspaceDrawer';
  for(const [key,label] of [['scan','1. Scan & Layers'],['deal','2. Deal Nav & Assembly'],['owners','3. Ownership & Field Pack']]){const b=document.createElement('button');b.type='button';b.id='workspace-tab-'+key;b.dataset.mode=key;b.setAttribute('role','tab');b.setAttribute('aria-controls','workspace-mode-'+key);b.textContent=label;b.addEventListener('click',()=>activate(key));nav.append(b);tabs[key]=b;const panel=document.createElement('section');panel.id='workspace-mode-'+key;panel.dataset.workspaceMode=key;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',b.id);panel.tabIndex=0;drawer.append(panel);panels[key]=panel;}
  const mapSlot=document.createElement('div');mapSlot.className='workspace-map-slot';mapSlot.append(mapColumn);root.append(nav,drawer,mapSlot);scanner.before(root);
  const put=(mode,id)=>{const el=$(id);if(el)panels[mode].append(el);};
  put('scan','scanner');put('scan','executiveScan');for(const id of ['ozInventory','localMapOverlays','recoveredReference','sources'])put('scan',id);
  for(const id of ['dealNav','acquisitionWorkbench','researchTools'])put('deal',id);for(const id of ['ownershipWorkbench','fieldTripPanel'])put('owners',id);
  const layers=document.createElement('details');layers.id='workspaceLayers';const summary=document.createElement('summary');summary.textContent='Map layers · Opportunity Zones';layers.append(summary);const toggles=$('ozNJToggle')?.closest('.oz-toggles');if(toggles)layers.append(toggles);panels.scan.prepend(layers);
  const layersButton=document.createElement('button');layersButton.type='button';layersButton.className='secondary';layersButton.textContent='Map layers';layersButton.addEventListener('click',()=>{if(document.body.classList.contains('map-expanded'))$('expandMap')?.click();activate('scan');layers.open=true;layers.scrollIntoView({block:'nearest'});});mapColumn.querySelector('.map-actions')?.append(layersButton);
  put('deal','assemblyTray');
  for(const el of [...mapColumn.querySelectorAll('.map-caption,.map-research-note,.map-banner')])panels.scan.append(el);
  document.body.classList.add('split-workspace');
  nav.addEventListener('keydown',e=>{const order=Object.keys(tabs),index=order.indexOf(current);let next;if(e.key==='ArrowRight')next=order[(index+1)%3];if(e.key==='ArrowLeft')next=order[(index+2)%3];if(e.key==='Home')next=order[0];if(e.key==='End')next=order[2];if(next){e.preventDefault();activate(next,{focus:true});}});
  document.addEventListener('click',e=>{const a=e.target.closest('a[href^="#"]');if(!a)return;const target=$(a.getAttribute('href').slice(1)),panel=target?.closest('[data-workspace-mode]');if(panel)activate(panel.dataset.workspaceMode);});
  window.RadarWorkspace={activate,getMode:()=>current,reveal:id=>{const el=$(id),panel=el?.closest('[data-workspace-mode]');if(panel)activate(panel.dataset.workspaceMode);el?.scrollIntoView({block:'nearest'});}};
  activate('scan');if(location.hash){const p=$(location.hash.slice(1))?.closest('[data-workspace-mode]');if(p)activate(p.dataset.workspaceMode);}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
