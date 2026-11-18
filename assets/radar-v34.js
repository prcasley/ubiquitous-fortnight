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
  const DATA_ITEMS=[['ozDesignationResearch','OZ 2.0 designation evidence'],['ozInventory','NJ OZ 2.0 areas & tract coverage'],['localMapOverlays','Map overlays'],['recoveredReference','Parcel Data'],['sources','Sources & provenance'],['researchNotice','Research limits']];
  const simple=()=>document.body.dataset.radarMode!=='advanced',modeBox=make('section',null,'v34-mode-box');modeBox.id='v34ModeBox';
  function openData(id){show('data');const el=$(id);if(!el)return;if(el.tagName==='DETAILS')el.open=true;for(let p=el.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;requestAnimationFrame(()=>(el.closest('.v34-data-item')||el).scrollIntoView({block:'start'}));}
  const top=document.querySelector('header.top'),brand=top.firstElementChild;
  brand.className='v34-brand';brand.replaceChildren(make('strong','Capital Radar'),make('small','Parcel research · V3.4'));
  const nav=document.querySelector('.workspace-mode-tabs');nav.classList.add('v34-nav');nav.setAttribute('aria-label','Radar navigation');top.insertBefore(nav,brand.nextSibling);
  const extra=make('section',null,'v34-list-view');extra.id='v34ListView';extra.hidden=true;$('workspaceDrawer').prepend(extra);
  const normal=[...$('workspaceDrawer').children].filter(e=>e!==extra);let view='scan';
  let stars=[];try{stars=JSON.parse(localStorage.getItem('radar-v34-stars')||'[]');if(!Array.isArray(stars))stars=[];}catch{}
  const save=()=>{try{localStorage.setItem('radar-v34-stars',JSON.stringify(stars));}catch{}renderStarsCount();};
  const renderStarsCount=()=>{const b=nav.querySelector('[data-view="stars"]');if(b)b.textContent='Starred ('+stars.length+')';};
  function show(mode){view=mode;document.body.dataset.v34View=mode;extra.hidden=!['stars','data'].includes(mode);if(!extra.hidden){normal.forEach(p=>p.hidden=true);renderExtra();if(mode==='data'){$('workspace-mode-scan').hidden=false;$('workspaceDrawer').scrollTop=0;}}else{window.RadarWorkspace.activate(mode);if(mode==='owners')renderOwnership();}for(const b of nav.querySelectorAll('[data-view]'))b.setAttribute('aria-current',b.dataset.view===mode?'page':'false');}
  for(const [mode,label] of [['scan','Find'],['deal','Deal Nav'],['owners','Ownership'],['stars','Starred'],['data','Data & Export']]){const b=$('workspace-tab-'+mode)||make('button');b.textContent=label;b.type='button';b.dataset.view=mode;b.addEventListener('click',()=>show(mode));nav.append(b);}
  document.querySelectorAll('.workspace-mode-tabs button[data-mode]').forEach(b=>b.addEventListener('click',()=>{extra.hidden=true;view=b.dataset.mode;document.body.dataset.v34View=view;}));
  function go(r){show('scan');if(B().getRecord(r.key))B().choose(r.key);else window.RadarMapActions?.retrieve(r.address);}
  const evidenceOptions=[['all','All evidence'],['assessment','Published assessment owner'],['business','Business lead'],['research','Needs research']];
  const outreachOptions=[['not-started','Not started'],['contacted','Contacted'],['follow-up','Follow-up']];
  let shortlistFilter='all';
  function optionMenu(options,value){
   const select=make('select');
   for(const [key,label] of options){const option=make('option',label);option.value=key;select.append(option);}
   select.value=options.some(([key])=>key===value)?value:options[0][0];
   return select;
  }
  function renderShortlist(){
   extra.append(make('p','Outreach status is saved on this device. Open a property to refresh its evidence.'));
   const label=make('label','Filter by evidence','v34-shortlist-field');
   const filter=optionMenu(evidenceOptions,shortlistFilter);
   const rows=make('div');
   filter.onchange=()=>{shortlistFilter=filter.value;renderRows();};
   label.append(filter);extra.append(label,rows);renderRows();
   function renderRows(){
    rows.replaceChildren();
    for(const entry of stars){
     const record=B()?.getRecord(entry.key);
     const core=window.RadarExecutiveCardCore;
     const research=record&&window.RadarOwnerAuto?.getResearch(record.key);
     const restricted=record&&core.isProtectedRecord(record,research);
     const observation=record?.publishedOwner||record?.ownership;
     const usdot=record&&window.RadarNJPublicResearch?.usdot?.(record);
     const owner=record&&!restricted?core.getPrimaryDisplayOwner(record,{usdot:usdot?.status==='ACTIVE'?usdot:null}):null;
     const assessment=owner?.tier==='owner'&&!!owner.url;
     const carrier=owner?.tier==='carrier'&&!!(owner.phone||owner.email);
     const evidence=assessment?'assessment':carrier?'business':'research';
     if(shortlistFilter!=='all'&&shortlistFilter!==evidence)continue;
     const row=make('article',null,'v34-shortlist-row');
     const actions=make('div',null,'v34-saved-row');
     const open=make('button',entry.address),remove=make('button','Remove');
     remove.setAttribute('aria-label','Remove '+entry.address);
     open.onclick=()=>go(entry);remove.onclick=()=>{stars=stars.filter(x=>x.key!==entry.key);save();renderRows();filter.focus();};
     actions.append(open,remove);row.append(actions);
     if(record){
      const size=core.numbers(record).acres;
      row.append(make('p',[size==null?'Acreage unavailable':size.toLocaleString('en-US',{maximumFractionDigits:2})+' acres',core.oz(record)].join(' · ')));
      if(assessment||carrier){
       const description=assessment?'Assessment owner · deed review needed':'Business lead · on-site carrier';
       const rawDate=String((assessment?observation?.retrievedAt:usdot?.filingDate)||'').replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3');
       const date=/^\d{4}-\d{2}-\d{2}/.test(rawDate)?rawDate.slice(0,10):null;
       const detail=make('p',description+' · '+owner.name+' · '+(date?(assessment?'Checked ':'Filed ')+date:'Source date unavailable'));
       const source=make('a','View source');source.href=owner.url;source.target='_blank';source.rel='noopener noreferrer';
       row.append(detail,source);
      }else row.append(make('p',restricted?'Protected record':'Needs research'));
     }else row.append(make('p','Open property to reload acreage and evidence.'));
     const state=optionMenu(outreachOptions,entry.outreach);
     const status=make('label','Outreach','v34-shortlist-field');state.setAttribute('aria-label','Outreach for '+entry.address);
     state.onchange=()=>{entry.outreach=state.value;save();};
     status.append(state);row.append(status);rows.append(row);
    }
    if(!rows.children.length)rows.append(make('p',stars.length?'No starred properties match this filter.':'Select a property, then choose Star property.'));
   }
  }
  function renderExtra(){extra.replaceChildren(make('h2',view==='stars'?'Starred properties':'Data & Export'));
   if(view==='stars')renderShortlist();
   else{extra.append(make('p','Reference data, OZ 2.0 evidence, tract coverage, map overlays and exports. Imported private files stay in your browser.'));
    const jump=make('div',null,'v34-data-jumps');
    for(const [id,label,mode] of [['researchTools','Local files & assemblies','deal'],['fieldTripPanel','Field packs & exports','owners']]){const b=make('button',label+' →');b.type='button';b.onclick=()=>{show(mode);const el=$(id);for(let p=el?.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;window.RadarWorkspace.reveal(id);};jump.append(b);}
    extra.append(jump);
    const links=make('p',null,'v34-downloads');for(const [href,label] of [['assets/data/nj-tract-coverage.csv','NJ 130-tract coverage report (CSV)'],['assets/data/nj-parcel-research.csv','NJ parcel research (CSV)'],['assets/data/oz2-designations.json','Treasury OZ 2.0 designations, NJ & FL (JSON)']]){const a=make('a',label);a.href=href;a.download='';if(href.endsWith('/nj-tract-coverage.csv'))a.id='v34PublishedTractCoverage';links.append(a);}extra.append(links);}
  }
  const lock=$('lockRadar');if(lock){lock.classList.add('v34-vault-pill');top.append(lock);}
  const lockLabel=()=>{if(lock)lock.textContent=window.RadarExecutiveVault?.isVaultUnlocked?.()?'🔓 Contacts open · Lock':'Lock screen';};document.addEventListener('radar:vault-state',lockLabel);lockLabel();
  const agent=document.querySelector('.radar-agent');agent.classList.add('v34-ask');
  const chips=document.querySelector('.agent-suggestions');chips.replaceChildren();
  // Quick chips search the area chosen in the filter drawer; each sends a plain-language request the search already understands.
  const AREAS={palm:'West Palm Beach, FL',palmarea:'Riviera Beach, FL',delray:'Delray Beach, FL',newark:'Newark, NJ',secaucus:'Secaucus, NJ',northbergen:'North Bergen, NJ',edison:'Edison, NJ'};
  const area=()=>AREAS[$('executiveMarket')?.value]||'Edison, NJ',chipLabel=make('span',null,'v34-chip-area');chips.append(chipLabel);
  const chipArea=()=>{chipLabel.textContent='Quick search · '+area();};chipArea();$('executiveMarket')?.addEventListener('change',chipArea);
  for(const [label,q] of [['Warehouse',a=>'warehouses in '+a],['Outdoor storage',a=>'outdoor storage in '+a],['Designated OZ 2.0',a=>'industrial properties in opportunity zones in '+a]]){const b=make('button',label);b.type='button';b.onclick=()=>{$('agentPrompt').value=q(area());$('agentForm').requestSubmit();};chips.append(b);}
  const coverageLink=make('button','NJ tract coverage','v34-tract-coverage');
  coverageLink.type='button';
  coverageLink.addEventListener('click',()=>{
   show('data');
   $('v34PublishedTractCoverage')?.focus();
  });
  chips.before(coverageLink);
  const scan=$('workspace-mode-scan');const title=make('div',null,'v34-section-title');title.append(make('h2','Acquisition Radar'),make('p','Find properties and contacts from published records.'));scan.prepend(title);
  $('scanner').prepend(agent);const filter=$('filterDrawer');if(filter){filter.querySelector('summary').textContent='Search area and filters';filter.open=false;agent.after(filter);}
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
  {const exec=$('executiveScan'),drawer=$('filterDrawer');if(exec&&drawer){exec.classList.add('v34-merged-scan');drawer.querySelector('summary').after(exec);}}
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

  // Find holds search and results only. Reference sections stay in the same panel (ids, listeners and anchors intact)
  // and are shown under Data & Export; "All tools" still lays everything out in one page.
  const scanPanel=$('workspace-mode-scan');
  for(const [id] of DATA_ITEMS){const el=$(id),item=el?.closest('.v34-fold')||el;if(!item)continue;scanPanel.append(item);item.classList.add('v34-data-item');item.dataset.v34Item=id;
   if(item.tagName==='DETAILS')item.addEventListener('toggle',()=>{if(item.open&&simple()&&view!=='data')show('data');});}
  for(const el of scanPanel.querySelectorAll(':scope > .map-banner, :scope > .map-caption')){scanPanel.append(el);el.classList.add('v34-data-item');}
  {const note=$('scanner')?.querySelector('.intro-disclaimer');if(note){scanPanel.append(note);note.classList.add('v34-data-item');}}
  for(const el of [legal,modeBox]){scanPanel.append(el);el.classList.add('v34-data-item');}
  document.addEventListener('click',e=>{const a=e.target.closest?.('a[href^="#"]');if(!a||!simple())return;const id=a.getAttribute('href').slice(1);if($(id)?.closest('.v34-data-item'))openData(id);});
  // "All tools" sits in Data & Export in the standard view; while it is on, the switch back is in the header.
  const toggle=$('radarModeToggleBtn');modeBox.append(make('h3','All tools (analyst layout)'),make('p','Shows every research section on one long page. The standard view keeps to the five tabs; this choice lasts until the tab is closed.'));
  const placeToggle=()=>{if(!toggle)return;if(simple())modeBox.append(toggle);else top.insertBefore(toggle,top.querySelector('.text-size-controls'));modeBox.hidden=!simple();};
  placeToggle();new MutationObserver(placeToggle).observe(document.body,{attributes:true,attributeFilter:['data-radar-mode']});

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
  const reveal=window.RadarWorkspace.reveal;window.RadarWorkspace.reveal=id=>{if(id==='selectedOwnershipResearch'||id==='ownerDossier'){openDossier();return;}if(simple()&&$(id)?.closest('.v34-data-item')){openData(id);return;}extra.hidden=true;const el=$(id);for(let p=el?.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;reveal(id);};
  new ResizeObserver(()=>{const h=top.getBoundingClientRect().height;document.documentElement.style.setProperty('--v34-header-height',h+'px');B()?.getMap()?.invalidateSize({pan:false});}).observe(top);
  // Phones: keep the zoom buttons clear of the address card at the top of the map.
  const zoomSpot=()=>{const m=B()?.getMap?.();if(!m?.zoomControl)return;m.zoomControl.setPosition('topleft');};
  zoomSpot();matchMedia('(max-width:900px)').addEventListener?.('change',zoomSpot);setTimeout(zoomSpot,1500);
  window.RadarV34={openDossier,show};
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
