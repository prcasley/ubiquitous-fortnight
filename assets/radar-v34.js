/* V3.4 presentation (dark): top tabs, one search box, fixed detail column with the research dossier inside it.
   Reuses live controls and evidence; nothing is deleted, sections are folded closed with counts. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id), make=(tag,text,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;};
 const B=()=>window.PublicRadarBridge;
 const count=(el,sel)=>el?el.querySelectorAll(sel).length:0;

 // Fold one existing section into a closed drawer whose title carries a live count.
 function fold(id,label,counter){const el=$(id);if(!el||el.closest('.v34-fold'))return null;
  const d=make('details',null,'v34-fold');d.id='v34Fold-'+id;const s=make('summary',label);d.append(s);el.before(d);d.append(el);
  const head=el.querySelector(':scope > h2, :scope > .panel-head h2, :scope > div > h2');if(head)head.classList.add('v34-folded-title');
  const set=()=>{const n=counter?counter(el):null;const t=n===null||n===undefined?label:label+' ('+n+')';if(s.textContent!==t)s.textContent=t;};
  set();new MutationObserver(set).observe(el,{childList:true,subtree:true});return d;}

 function init(){
  document.body.classList.add('radar-v34');
  const top=document.querySelector('header.top'),brand=top.firstElementChild;
  brand.className='v34-brand';brand.replaceChildren(make('strong','Capital Radar'),make('small','Parcel research · V3.4'));
  const nav=document.querySelector('.workspace-mode-tabs');nav.classList.add('v34-nav');nav.setAttribute('aria-label','Radar navigation');top.insertBefore(nav,brand.nextSibling);
  const extra=make('section',null,'v34-list-view');extra.id='v34ListView';extra.hidden=true;$('workspaceDrawer').append(extra);
  const normal=[...$('workspaceDrawer').children].filter(e=>e!==extra);let view='scan';
  let stars=[];try{stars=JSON.parse(localStorage.getItem('radar-v34-stars')||'[]');if(!Array.isArray(stars))stars=[];}catch{}
  const save=()=>{try{localStorage.setItem('radar-v34-stars',JSON.stringify(stars));}catch{}renderStarsCount();};
  const renderStarsCount=()=>{const b=nav.querySelector('[data-view="stars"]');if(b)b.textContent='Starred ('+stars.length+')';};
  function show(mode){view=mode;extra.hidden=!['stars','data'].includes(mode);if(!extra.hidden){normal.forEach(p=>p.hidden=true);renderExtra();}else{window.RadarWorkspace.activate(mode);if(mode==='owners')renderOwnership();}for(const b of nav.querySelectorAll('[data-view]'))b.setAttribute('aria-current',b.dataset.view===mode?'page':'false');}
  for(const [mode,label] of [['scan','Find'],['deal','Deal Nav'],['owners','Ownership'],['stars','Starred'],['data','Data & Export']]){const b=$('workspace-tab-'+mode)||make('button');b.textContent=label;b.type='button';b.dataset.view=mode;b.addEventListener('click',()=>show(mode));nav.append(b);}
  document.querySelectorAll('.workspace-mode-tabs button[data-mode]').forEach(b=>b.addEventListener('click',()=>{extra.hidden=true;view=b.dataset.mode;}));
  function go(r){show('scan');if(B().getRecord(r.key))B().choose(r.key);else window.RadarMapActions?.retrieve(r.address);}
  function renderExtra(){extra.replaceChildren(make('h2',view==='stars'?'Starred properties':'Data & Export'));
   if(view==='stars'){extra.append(make('p','Saved on this device. Select a property to reopen current records.'));if(!stars.length)extra.append(make('p','Select a property, then choose ☆ Star property.'));for(const r of stars){const row=make('div',null,'v34-saved-row'),open=make('button',r.address),remove=make('button','Remove');open.onclick=()=>go(r);remove.onclick=()=>{stars=stars.filter(x=>x.key!==r.key);save();renderExtra();};row.append(open,remove);extra.append(row);}}
   else{extra.append(make('p','Public records and your local research tools. Imported private files stay in your browser.'));for(const [id,label,mode] of [['sources','Sources & provenance','scan'],['recoveredReference','Parcel Data','scan'],['localMapOverlays','Map overlays & imports','scan'],['researchTools','Local files & assemblies','deal'],['fieldTripPanel','Field packs & exports','owners']]){const b=make('button',label);b.onclick=()=>{window.RadarSimpleMode?.applyMode?.('advanced');show(mode);const el=$(id);if(el){el.style.setProperty('display','block','important');el.querySelector('details')?.setAttribute('open','');for(let p=el.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;window.RadarWorkspace.reveal(id);}};extra.append(b);}
    const links=make('p',null,'v34-downloads');for(const [href,label] of [['assets/data/nj-tract-coverage.csv','NJ 130-tract coverage report (CSV)'],['assets/data/nj-parcel-research.csv','NJ parcel research (CSV)'],['assets/data/oz2-designations.json','Treasury OZ 2.0 designations, NJ & FL (JSON)']]){const a=make('a',label);a.href=href;a.download='';links.append(a);}extra.append(links);extra.append(legal);}
  }
  const lock=$('lockRadar');if(lock){lock.classList.add('v34-vault-pill');top.append(lock);}
  const lockLabel=()=>{if(lock)lock.textContent=window.RadarExecutiveVault?.isVaultUnlocked?.()?'🔓 Contacts open · Lock':'Lock screen';};document.addEventListener('radar:vault-state',lockLabel);lockLabel();
  const agent=document.querySelector('.radar-agent');agent.classList.add('v34-ask');
  const chips=document.querySelector('.agent-suggestions');chips.replaceChildren();
  for(const [label,q] of [['351 Roosevelt Ave','351 Roosevelt Ave, Carteret NJ'],['650 Jernee Mill Rd','650 Jernee Mill Rd, Sayreville NJ'],['2055 Demarco Dr','2055 Demarco Dr, Vineland NJ'],['Lake Worth Beach','industrial properties over 5 acres in Lake Worth Beach FL']]){const b=make('button',label);b.type='button';b.onclick=()=>{$('agentPrompt').value=q;$('agentForm').requestSubmit();};chips.append(b);}
  const scan=$('workspace-mode-scan');const title=make('div',null,'v34-section-title');title.append(make('h2','Acquisition Radar'),make('p','Find properties and contacts from published records.'));scan.prepend(title);
  $('scanner').prepend(agent);const filter=$('filterDrawer');if(filter){filter.querySelector('summary').textContent='Search filters, market & OZ gates';filter.open=false;agent.after(filter);}
  const layers=$('workspaceLayers');if(layers)layers.open=false;
  // One search box: the older deterministic Ask panel stays in the page (and working) but is not shown.
  document.getElementById('askForm')?.closest('section.panel')?.classList.add('v34-legacy-ask');

  // Blocks that used to sit below the map move into the tab they belong to (nothing is deleted).
  const content=document.querySelector('.content');
  const researchPanel=content?.querySelector(':scope > .research-panel');
  if(researchPanel){researchPanel.id=researchPanel.id||'v34ResearchPanel';$('workspace-mode-deal')?.append(researchPanel);}
  const below=content?.querySelector(':scope > .below');
  if($('ownerSection'))$('workspace-mode-owners')?.append($('ownerSection'));
  const legal=make('details',null,'v34-fold v34-legal');legal.id='v34Legal';legal.append(make('summary','Legal & data provenance'));
  const limits=[...(below?.querySelectorAll('section,div')||[])].find(e=>/^Limits & definitions/.test(e.querySelector(':scope > h2, :scope > h3')?.textContent||''));
  if(limits)legal.append(limits);
  const foot=content?.querySelector(':scope > .bottom-note');if(foot)legal.append(foot);
  below?.classList.add('v34-below-moved');
  // Every optional section folds closed on its own, with a count.
  const links=el=>new Set([...el.querySelectorAll('a[href]')].map(a=>a.href)).size;
  const tractCount=()=>window.RadarOZ2Designations?.meta?.()?.totals?.NJ??130;
  fold('sources','Sources & provenance',links);
  fold('executiveScan','Industrial workstreams',el=>count(el,'button'));
  fold('ozInventory','Properties in NJ designated OZ 2.0 areas',()=>tractCount()+' tracts');
  fold('localMapOverlays','Map overlays',el=>count(el,'input[type=checkbox],input[type=file]'));
  fold('recoveredReference','Parcel Data',el=>count(el,'tr,li,.reference-row'));
  fold('dealNav','Deal Nav',el=>count(el,'button'));
  {const oz=$('ozDesignationResearch');if(oz)$('workspace-mode-deal')?.append(oz);}fold('ozDesignationResearch','OZ 2.0 designation evidence',links);
  fold('acquisitionWorkbench','Acquisition candidates',el=>count($('acquisitionResults')||el,'article,tr'));
  fold('researchTools','Property research tools',el=>count(el,'details'));
  fold('ownershipWorkbench','Companies & ownership research',()=>{const m=/^(\d+) organizations/.exec($('ownerResearchCount')?.textContent||'');return m?m[1]+' organizations':null;});
  fold('fieldTripPanel','Field trip & field pack',el=>count($('fieldTripStops')||el,'li,article,tr'));
  if(researchPanel)fold(researchPanel.id,'Saved research & screening',()=>count($('savedResearch'),'li,article,tr,.saved-item'));
  fold('ownerSection','Owner records for the selected parcel',()=>count($('owners'),'li,article,tr,.owner-row'));

  // Fixed detail column beside the map.
  const column=document.querySelector('.map-column');
  // One column holds the selected-parcel card, the empty state and the dossier. The card (#details) is rebuilt on
  // every selection, so the dossier sits beside it, never inside it, and is never detached while research renders.
  const col=make('div',null,'v34-detail-col');col.id='v34DetailCol';$('details').before(col);col.append($('details'));
  const empty=make('aside',null,'v34-detail-empty');empty.id='v34DetailEmpty';empty.append(make('h2','Property & contacts'),make('p','Select a property to see owner, contacts, OZ 2.0 status and acreage here.'));col.append(empty);
  // Research dossier lives inside the detail column; existing elements are moved in, keeping their buttons.
  const dossier=make('details',null,'v34-dossier');dossier.id='v34Dossier';const dsum=make('summary','Research dossier & ownership');dossier.append(dsum);
  const lookup=make('button','Look up owner & company records for this property','v34-dossier-lookup');lookup.type='button';lookup.onclick=()=>$('researchSelectedOwner')?.click();dossier.append(lookup);
  for(const id of ['selectedOwnershipResearch','ownerDossier']){const el=$(id);if(el)dossier.append(el);}
  const dossierCount=()=>{const n=['selectedOwnershipResearch','ownerDossier'].reduce((k,id)=>k+count($(id),'p,li,article,tr'),0);const t='Research dossier & ownership'+(n?' ('+n+')':'');if(dsum.textContent!==t)dsum.textContent=t;};
  new MutationObserver(()=>{dossierCount();if($('ownerDossier')?.children.length&&!dossier.open)dossier.open=true;}).observe(dossier,{childList:true,subtree:true});
  const place=()=>{if(col.lastElementChild!==dossier)col.append(dossier);col.classList.toggle('has-selection',!$('details').hidden);};
  const openDossier=()=>{show(view==='stars'||view==='data'?'scan':view);place();dossier.open=true;requestAnimationFrame(()=>dossier.scrollIntoView({block:'start',behavior:'smooth'}));};
  function selection(){empty.hidden=!!B()?.getSelected()&&!$('details').hidden;place();const card=$('details');if(!card||card.hidden)return;let star=card.querySelector('.v34-star');if(!star){star=make('button',null,'v34-star');star.type='button';card.querySelector('.executive-facts')?.after(star);}const r=B().getRecord(B().getSelected());if(!r)return;const has=stars.some(x=>x.key===r.key);star.textContent=has?'★ Starred · remove':'☆ Star property';star.onclick=()=>{stars=has?stars.filter(x=>x.key!==r.key):[...stars,{key:r.key,address:[r.address,r.municipality,r.state].filter(Boolean).join(', ')}];save();selection();};}
  document.addEventListener('radar:parcel-selected',selection);
  new MutationObserver(()=>{empty.hidden=!$('details').hidden;place();}).observe($('details'),{attributes:true,attributeFilter:['hidden'],childList:true});
  place();

  const ownership=make('section',null,'v34-ownership');ownership.id='v34Ownership';$('workspace-mode-owners').prepend(ownership);
  const query=make('input');query.type='search';query.placeholder='Search address, company or owner';query.setAttribute('aria-label','Search ownership records');query.oninput=renderOwnership;
  const table=make('div',null,'v34-table-wrap'),stats=make('div',null,'v34-kpis');ownership.append(make('h2','Ownership & Contact Vault'),make('p','Current search results. Select a property for sourced contact details beside the map.'),stats,query,table);
  function renderOwnership(){const records=B()?.getResults()||[];stats.replaceChildren();for(const [n,label] of [[records.length,'Loaded parcels'],[records.filter(r=>window.RadarOwnership?.reviewedContacts?.(r)?.length).length,'Reviewed contacts']]){const k=make('div');k.append(make('strong',String(n)),make('span',label));stats.append(k);}table.replaceChildren();const t=make('table'),head=make('thead'),tr=make('tr');for(const h of ['Property / Address','Company / Owner','Contact details'])tr.append(make('th',h));head.append(tr);t.append(head);const body=make('tbody');for(const r of records){const owner=window.RadarExecutiveCardCore.getPrimaryDisplayOwner(r,{});if(![r.address,owner.name,r.municipality].join(' ').toLowerCase().includes(query.value.toLowerCase()))continue;const row=make('tr'),cell=make('td'),b=make('button',r.address||r.id);b.onclick=()=>{B().choose(r.key);};cell.append(b);row.append(cell,make('td',owner.name),make('td','Open property for sourced contacts'));body.append(row);}t.append(body);table.append(t);if(!body.children.length)table.append(make('p','Search in Find to load properties. No contact coverage is implied for unsearched parcels.'));}
  for(const event of ['radar:scan-complete','radar:ownership-updated','radar:vault-state'])document.addEventListener(event,renderOwnership);
  renderOwnership();renderStarsCount();show('scan');
  const reveal=window.RadarWorkspace.reveal;window.RadarWorkspace.reveal=id=>{if(id==='selectedOwnershipResearch'||id==='ownerDossier'){openDossier();return;}extra.hidden=true;const el=$(id);for(let p=el?.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;reveal(id);};
  new ResizeObserver(()=>{const h=top.getBoundingClientRect().height;document.documentElement.style.setProperty('--v34-header-height',h+'px');B()?.getMap()?.invalidateSize({pan:false});}).observe(top);
  // Phones: keep the zoom buttons clear of the address card at the top of the map.
  const zoomSpot=()=>{const m=B()?.getMap?.();if(!m?.zoomControl)return;m.zoomControl.setPosition('topleft');};
  zoomSpot();matchMedia('(max-width:900px)').addEventListener?.('change',zoomSpot);setTimeout(zoomSpot,1500);
  window.RadarV34={openDossier,show};
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
