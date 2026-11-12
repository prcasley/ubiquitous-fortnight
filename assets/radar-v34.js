/* V3.4 presentation: reuse live controls and evidence; no reference-file datasets. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id), make=(tag,text,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;};
 const B=()=>window.PublicRadarBridge;
 function init(){
  document.body.classList.add('radar-v34');document.title='Woodmont Capital Markets Radar | V3.4';
  const top=document.querySelector('header.top'),brand=top.firstElementChild;
  brand.className='v34-brand';brand.replaceChildren(make('strong','Capital Markets Radar'),make('small','Woodmont · V3.4'));
  const nav=document.querySelector('.workspace-mode-tabs');nav.classList.add('v34-nav');nav.setAttribute('aria-label','Radar navigation');top.insertBefore(nav,brand.nextSibling);
  const extra=make('section',null,'v34-list-view');extra.id='v34ListView';extra.hidden=true;$('workspaceDrawer').append(extra);
  const normal=[...$('workspaceDrawer').children].filter(e=>e!==extra);let view='scan';
  let stars=[];try{stars=JSON.parse(localStorage.getItem('radar-v34-stars')||'[]');if(!Array.isArray(stars))stars=[];}catch{}
  const save=()=>{try{localStorage.setItem('radar-v34-stars',JSON.stringify(stars));}catch{}renderStarsCount();};
  const renderStarsCount=()=>{const b=nav.querySelector('[data-view="stars"]');if(b)b.textContent='Starred '+stars.length;};
  function show(mode){view=mode;extra.hidden=!['stars','data'].includes(mode);if(!extra.hidden){normal.forEach(p=>p.hidden=true);renderExtra();}else{window.RadarWorkspace.activate(mode);if(mode==='owners')renderOwnership();}for(const b of nav.querySelectorAll('[data-view]'))b.setAttribute('aria-current',b.dataset.view===mode?'page':'false');}
  for(const [mode,label] of [['scan','Find'],['deal','Deal Nav'],['owners','Ownership'],['stars','Starred'],['data','Data & Export']]){const b=$('workspace-tab-'+mode)||make('button');b.textContent=label;b.type='button';b.dataset.view=mode;b.addEventListener('click',()=>show(mode));nav.append(b);}
  // Existing workspace navigation and API keep working from keyboard and deep links.
  document.querySelectorAll('.workspace-mode-tabs button[data-mode]').forEach(b=>b.addEventListener('click',()=>{extra.hidden=true;view=b.dataset.mode;}));
  function go(r){show('scan');if(B().getRecord(r.key))B().choose(r.key);else window.RadarMapActions?.retrieve(r.address);}
  function renderExtra(){extra.replaceChildren(make('h2',view==='stars'?'Starred properties':'Data & Export'));
   if(view==='stars'){extra.append(make('p','Saved on this device. Select a property to reopen current records.'));if(!stars.length)extra.append(make('p','Select a property on the map, then choose ☆ Star property.'));for(const r of stars){const row=make('div',null,'v34-saved-row'),open=make('button',r.address),remove=make('button','Remove');open.onclick=()=>go(r);remove.onclick=()=>{stars=stars.filter(x=>x.key!==r.key);save();renderExtra();};row.append(open,remove);extra.append(row);}}
   else{extra.append(make('p','Public records and your local research tools. Imported private files stay in your browser.'));for(const [id,label,mode] of [['sources','Sources & provenance','scan'],['recoveredReference','Parcel Data','scan'],['localMapOverlays','Map overlays & imports','scan'],['researchTools','Local files & assemblies','deal'],['fieldTripPanel','Field packs & exports','owners']]){const b=make('button',label);b.onclick=()=>{window.RadarSimpleMode?.applyMode?.('advanced');show(mode);const el=$(id);if(el){el.style.setProperty('display','block','important');el.querySelector('details')?.setAttribute('open','');window.RadarWorkspace.reveal(id);}};extra.append(b);}}
  }
  const lock=$('lockRadar');if(lock){lock.classList.add('v34-vault-pill');top.append(lock);}
  const lockLabel=()=>{if(lock)lock.textContent=window.RadarExecutiveVault?.isVaultUnlocked?.()?'🔓 Contacts Open · Lock':'Lock screen';};document.addEventListener('radar:vault-state',lockLabel);lockLabel();
  const agent=document.querySelector('.radar-agent');agent.classList.add('v34-ask');
  const chips=document.querySelector('.agent-suggestions');chips.replaceChildren();
  for(const [label,q] of [['351 Roosevelt Ave','351 Roosevelt Ave, Carteret NJ'],['650 Jernee Mill Rd','650 Jernee Mill Rd, Sayreville NJ'],['60 Grant Ave','60 Grant Ave, Carteret NJ'],['Lake Worth Beach','industrial properties over 5 acres in Lake Worth Beach FL']]){const b=make('button',label);b.type='button';b.onclick=()=>{$('agentPrompt').value=q;$('agentForm').requestSubmit();};chips.append(b);}
  const scan=$('workspace-mode-scan');const title=make('div',null,'v34-section-title');title.append(make('h2','Acquisition Radar'),make('p','Find properties and contacts from published records.'));scan.prepend(title);
  // Put the existing search first; fold optional controls without replacing their listeners.
  $('scanner').prepend(agent);const filter=$('filterDrawer');if(filter){filter.querySelector('summary').textContent='Search filters, market selector & OZ gates';agent.after(filter);}
  const coverage=make('details',null,'v34-fold');coverage.id='v34Coverage';coverage.append(make('summary','Nominated properties, workstreams & coverage limits'));const content=make('div');coverage.append(content);for(const id of ['executiveScan','ozInventory','localMapOverlays','recoveredReference']){const e=$(id);if(e)content.append(e);}scan.append(coverage);
  // A persistent detail column on desktop; existing mobile map/card behavior is retained.
  const empty=make('aside',null,'v34-detail-empty');empty.id='v34DetailEmpty';empty.append(make('h2','Property & contacts'),make('p','Select a property to view ownership, contact routes and parcel data.'));document.querySelector('.map-column').append(empty);
  function selection(){empty.hidden=!!B()?.getSelected();const card=$('details');if(!card||card.hidden)return;let star=card.querySelector('.v34-star');if(!star){star=make('button',null,'v34-star');star.type='button';card.querySelector('.executive-facts')?.after(star);}const r=B().getRecord(B().getSelected());if(!r)return;const has=stars.some(x=>x.key===r.key);star.textContent=has?'★ Starred · remove':'☆ Star property';star.onclick=()=>{stars=has?stars.filter(x=>x.key!==r.key):[...stars,{key:r.key,address:[r.address,r.municipality,r.state].filter(Boolean).join(', ')}];save();selection();};}
  document.addEventListener('radar:parcel-selected',selection);new MutationObserver(()=>{empty.hidden=!$('details').hidden;}).observe($('details'),{attributes:true,attributeFilter:['hidden']});
  const ownership=make('section',null,'v34-ownership');ownership.id='v34Ownership';$('workspace-mode-owners').prepend(ownership);
  const query=make('input');query.type='search';query.placeholder='Search address, company or owner';query.setAttribute('aria-label','Search ownership records');query.oninput=renderOwnership;
  const table=make('div',null,'v34-table-wrap'),stats=make('div',null,'v34-kpis');ownership.append(make('h2','Ownership & Contact Vault'),make('p','Current search results. Select a property for sourced contact details beside the map.'),stats,query,table);
  function renderOwnership(){const records=B()?.getResults()||[];stats.replaceChildren();for(const [count,label] of [[records.length,'Loaded parcels'],[records.filter(r=>window.RadarOwnership?.reviewedContacts?.(r)?.length).length,'Reviewed contacts']]){const k=make('div');k.append(make('strong',String(count)),make('span',label));stats.append(k);}table.replaceChildren();const t=make('table'),head=make('thead'),tr=make('tr');for(const h of ['Property / Address','Company / Owner','Contact details'])tr.append(make('th',h));head.append(tr);t.append(head);const body=make('tbody');for(const r of records){const owner=window.RadarExecutiveCardCore.getPrimaryDisplayOwner(r,{});if(![r.address,owner.name,r.municipality].join(' ').toLowerCase().includes(query.value.toLowerCase()))continue;const row=make('tr'),cell=make('td'),b=make('button',r.address||r.id);b.onclick=()=>{B().choose(r.key);};cell.append(b);row.append(cell,make('td',owner.name),make('td','Open property for verified sources'));body.append(row);}t.append(body);table.append(t);if(!body.children.length)table.append(make('p','Search in Find to load properties. No contact coverage is implied for unsearched parcels.'));}
  for(const event of ['radar:scan-complete','radar:ownership-updated','radar:vault-state'])document.addEventListener(event,renderOwnership);
  renderOwnership();renderStarsCount();show('scan');
  const reveal=window.RadarWorkspace.reveal;window.RadarWorkspace.reveal=id=>{extra.hidden=true;const el=$(id);for(let p=el?.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;reveal(id);};
  new ResizeObserver(()=>{const h=top.getBoundingClientRect().height;document.documentElement.style.setProperty('--v34-header-height',h+'px');B()?.getMap()?.invalidateSize({pan:false});}).observe(top);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
