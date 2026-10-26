/* Browser-local ownership evidence and business dossiers; no paid contacts or private data bundles. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id),S=window.RadarPublicData,P=window.RadarProperty,bridge=()=>window.PublicRadarBridge,key='capital-radar-ownership-v1';
  let store={version:1,observations:{},dossiers:{}},chosen=null,activeCompany=null,busy=false,controller=null;
  const text=(value,max)=>typeof value==='string'?value.slice(0,max):'';
  const url=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}};
  function message(value){$('ownershipStatus').textContent=value;}
  function persist(){try{localStorage.setItem(key,JSON.stringify(store));return true;}catch{message('Ownership storage is full or unavailable. Export the research backup before closing this browser.');return false;}}
  const button=(label,action)=>{const b=document.createElement('button');b.type='button';b.className='secondary';b.textContent=label;b.addEventListener('click',action);return b;};
  const node=(tag,value)=>{const n=document.createElement(tag);n.textContent=value;return n;};
  const link=(label,href)=>{const a=node('a',label);a.href=href;a.target='_blank';a.rel='noopener noreferrer';return a;};
  function dossier(company){return store.dossiers[company]||(store.dossiers[company]={name:'',state:'',notes:'',evidence:[],contacts:[]});}
  function groups(){
    const map=new Map();
    for(const o of Object.values(store.observations)){
      const group=map.get(o.companyKey)||{key:o.companyKey,name:o.entityName,state:o.property.state,holdings:[]};group.holdings.push(o);map.set(o.companyKey,group);
    }
    for(const [key,d] of Object.entries(store.dossiers))if(!map.has(key))map.set(key,{key,name:d.name,state:d.state,holdings:[]});
    return [...map.values()].sort((a,b)=>b.holdings.length-a.holdings.length||a.name.localeCompare(b.name));
  }
  function render(){
    const host=$('ownerCompanies');host.textContent='';
    for(const group of groups()){
      const row=document.createElement('article');row.className='owner-company';
      row.append(node('strong',group.name),node('small',`${group.holdings.length} researched parcel(s) with this published name in ${group.state}. Matching names do not establish common legal control.`),button('Open research dossier',()=>{activeCompany=group.key;renderDossier(group);}));host.append(row);
    }
    if(!host.children.length)host.textContent='No researched organizations yet. Select a property and look up its published assessment name.';
    const count=Object.keys(store.observations).length;$('ownerResearchCount').textContent=`${groups().length} organizations · ${count} parcel observations stored in this browser`;
    if(activeCompany){const group=groups().find(g=>g.key===activeCompany);if(group)renderDossier(group);}
  }
  function field(form,label,type='text',value='',max=1000){const wrap=document.createElement('label'),input=document.createElement(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type;input.value=value;input.maxLength=max;wrap.append(document.createTextNode(label),input);form.append(wrap);return input;}
  function renderDossier(group){
    const host=$('ownerDossier');host.textContent='';const d=dossier(group.key);d.name=group.name;d.state=group.state;
    host.append(node('h3',group.name),node('p','Research dossier · evidence supplied by you; not an automatic title or beneficial-owner verification.'));
    const registry=group.state==='FL'?'https://search.sunbiz.org/Inquiry/CorporationSearch/ByName':group.state==='NJ'?'https://www.njportal.com/DOR/BusinessNameSearch/Search/BusinessName':'https://file.dos.pa.gov/search/business';
    host.append(link('Official business registry',registry),button('Copy company name',async()=>{try{await navigator.clipboard.writeText(group.name);message('Company name copied for the official registry search.');}catch{message('Company name: '+group.name);}}));
    for(const o of group.holdings){const row=document.createElement('p');row.textContent=`${o.property.address||o.property.id} · ${o.property.acres??'unknown'} acres · source retrieved ${o.retrievedAt}. `;row.append(link('Map',P.links(o.property).maps),document.createTextNode(' · '),link('Assessment source',o.sourceURL));host.append(row);}
    const notes=document.createElement('textarea');notes.value=d.notes;notes.maxLength=4000;notes.setAttribute('aria-label','Organization research notes');notes.placeholder='Research notes';notes.addEventListener('change',()=>{d.notes=notes.value;persist();});host.append(notes);
    const readiness=[group.holdings.length>0,d.evidence.some(e=>e.kind==='registry-reference'),d.evidence.some(e=>e.kind==='deed-reference'),d.contacts.some(c=>c.reviewed)];
    host.append(node('p',`Evidence checklist: ${readiness.filter(Boolean).length}/4 — assessment observation, registry reference, deed reference, and manually reviewed business contact. This is research completeness, not acquisition priority.`));
    const evidence=document.createElement('form'),kind=document.createElement('select');kind.setAttribute('aria-label','Evidence type');for(const k of ['registry-reference','deed-reference','other-public-source']){const op=document.createElement('option');op.value=k;op.textContent=k.replaceAll('-',' ');kind.append(op);}evidence.append(kind);
    const evidenceURL=field(evidence,'Evidence URL','url'),date=field(evidence,'Observation/document date','date'),ref=field(evidence,'Document or filing reference');evidenceURL.required=true;date.required=true;const save=document.createElement('button');save.textContent='Record evidence';save.className='secondary';evidence.append(save);
    evidence.addEventListener('submit',event=>{event.preventDefault();const href=url(evidenceURL.value);if(!href){message('Use a credential-free HTTPS source URL.');return;}if(d.evidence.length>=50){message('Evidence limit reached for this dossier.');return;}d.evidence.push({kind:kind.value,sourceURL:href,observedAt:date.value,reference:text(ref.value,1000),recordedAt:new Date().toISOString()});persist();render();});host.append(node('h4','Source evidence'),evidence);
    for(const e of d.evidence){const row=node('p',`${e.kind} · ${e.observedAt} · ${e.reference} `);row.append(link('Source',e.sourceURL),button('Remove evidence',()=>{d.evidence=d.evidence.filter(x=>x!==e);persist();render();}));host.append(row);}
    const contacts=document.createElement('form'),name=field(contacts,'Business contact name'),role=field(contacts,'Role'),email=field(contacts,'Business email','email'),phone=field(contacts,'Business phone','tel'),source=field(contacts,'Business contact source URL','url');source.required=true;name.required=true;
    const reviewed=document.createElement('input');reviewed.type='checkbox';const label=document.createElement('label');label.append(reviewed,document.createTextNode('Business role/contact route checked by me'));contacts.append(label);const add=document.createElement('button');add.textContent='Save cited business contact';add.className='secondary';contacts.append(add);
    contacts.addEventListener('submit',event=>{event.preventDefault();const href=url(source.value);if(!href){message('Add an HTTPS business-contact source.');return;}if(d.contacts.length>=25){message('Contact limit reached for this dossier.');return;}d.contacts.push({name:text(name.value,200),role:text(role.value,200),email:text(email.value,200),phone:text(phone.value,100),sourceURL:href,reviewed:reviewed.checked,recordedAt:new Date().toISOString()});persist();render();});host.append(node('h4','Manually researched business contacts'),node('p','No contact scraping or automatic outreach. These notes stay in this browser and are excluded from hosted summaries.'),contacts);
    for(const c of d.contacts){const row=node('p',`${c.name} · ${c.role} · ${c.email} · ${c.phone} · ${c.reviewed?'checked by user':'unverified lead'} `);row.append(link('Source',c.sourceURL),button('Remove contact',()=>{d.contacts=d.contacts.filter(x=>x!==c);persist();render();}));host.append(row);}
    host.append(button('Remove this local dossier and its observations',()=>{for(const [key,value] of Object.entries(store.observations))if(value.companyKey===group.key)delete store.observations[key];delete store.dossiers[group.key];activeCompany=null;host.textContent='Local dossier removed. Previously exported backups were not changed.';persist();render();}));
    if(busy)for(const control of host.querySelectorAll('input,textarea,select,button'))control.disabled=true;
  }
  async function lookup(record,signal){
    const meta=bridge().getMeta(),result=await S.lookupOwner(record,{signal});
    if(result.status==='published'){
      bridge().setOwnerObservation(record.key,result);
      if(result.entityName){
        const companyKey=S.entityKey(record.state,result.entityName),property=P.snapshot(record,meta);
        if(Object.keys(store.observations).length>=500&&!store.observations[record.key])throw Error('500-observation browser limit reached; export or remove research first');
        store.observations[record.key]={companyKey,entityName:result.entityName,sourceURL:result.sourceURL,retrievedAt:result.retrievedAt,assessmentYear:result.assessmentYear,property};
        const d=dossier(companyKey);d.name=result.entityName;d.state=record.state;activeCompany=companyKey;
      }else delete store.observations[record.key];
      persist();render();
    }
    return result;
  }
  function attachLookup(record){
    const section=document.createElement('div');section.className='public-owner-section';
    const result=node('p','Published assessment records are source observations, not verified legal title. Organization-style names can be saved to research dossiers. Individual names are not indexed into a company directory.');result.className='muted';
    const run=button('Look up published assessment name',async()=>{run.disabled=true;result.textContent='Checking the official public record…';try{const o=await lookup(record);result.textContent=o.status==='published'?`Published assessment name: ${o.publishedName}. Retrieved ${o.retrievedAt}. ${o.caveat}`:o.message||'Name not published by this source.';}catch(error){result.textContent='Ownership lookup unavailable: '+error.message+'. No owner was inferred.';}finally{run.disabled=false;run.textContent='Refresh published assessment name';}});
    section.append(node('strong','Free public ownership research'),run,result);const source=S.sources[record.provider];if(source?.researchURL)section.append(link('Official property research',source.researchURL));$('details').append(section);
  }
  async function batch(){
    if(busy)return;const rows=bridge().getVisible().filter(r=>S.sources[r.provider]?.owner).slice(0,25);
    if(!rows.length){message('This source does not publish an owner field. Use the official property-record link or choose a connected Florida source.');return;}
    busy=true;controller=new AbortController();render();$('loadBusinessOwners').disabled=true;$('stopOwnerLookup').disabled=false;let next=0,done=0,organizations=0,failed=0;
    try{await Promise.all([0,1].map(async()=>{while(next<rows.length&&!controller.signal.aborted){const record=rows[next++];try{const result=await lookup(record,controller.signal);if(result.entityName)organizations++;}catch{failed++;}done++;message(`Checked ${done}/${rows.length} parcels · ${organizations} organization-name observations · ${failed} unavailable. Non-organization names are not saved to the directory.`);}}));}
    finally{busy=false;$('loadBusinessOwners').disabled=false;$('stopOwnerLookup').disabled=true;if(controller.signal.aborted)message('Ownership lookup stopped. Completed, dated observations were kept.');controller=null;render();}
  }
  function init(){
    if(!$('ownershipWorkbench'))return;
    try{const data=JSON.parse(localStorage.getItem(key));if(data?.version===1&&data.observations&&data.dossiers)store=data;}catch{message('Stored ownership research could not be read; existing storage was left intact.');}
    render();
    document.addEventListener('radar:parcel-selected',e=>{chosen=e.detail.key;const record=bridge().getResults().find(r=>r.key===chosen);if(record)attachLookup(record);$('researchSelectedOwner').disabled=false;});
    document.addEventListener('radar:scan-state',e=>{if(e.detail.state==='idle'){chosen=null;$('researchSelectedOwner').disabled=true;controller?.abort();}});
    $('researchSelectedOwner').addEventListener('click',()=>{const record=bridge().getResults().find(r=>r.key===chosen);if(record){$('details').querySelector('.public-owner-section button')?.click();$('details').scrollIntoView({behavior:'smooth'});}});
    $('loadBusinessOwners').addEventListener('click',batch);$('stopOwnerLookup').addEventListener('click',()=>controller?.abort());
    $('exportOwnershipResearch').addEventListener('click',()=>{const href=URL.createObjectURL(new Blob([JSON.stringify({...store,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'})),a=document.createElement('a');a.href=href;a.download='capital-radar-ownership-research.json';a.click();setTimeout(()=>URL.revokeObjectURL(href),1000);message('Ownership research and user-entered business notes exported. Keep this file private.');});
  }
  window.RadarOwnership={lookup,groups};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
