/* Compact parcel rows for the simple view: each result opens as a short row (address, size · use · OZ status, best
   owner/contact lead) so several parcels fit on one screen. Selecting a row opens the full card underneath it.
   The row only repeats what the card already shows; it never adds or infers a fact. All tools keeps full cards. */
(() => {
  'use strict';
  const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;};
  const text=(root,selector)=>root.querySelector(selector)?.textContent.replace(/\s+/g,' ').trim()||'';
  function summary(card){
    const identity=card.querySelector('.executive-identity'),tier=identity?.dataset.tier||'none',name=text(card,'.executive-identity strong'),role=text(card,'.executive-identity .executive-label');
    const phone=card.querySelector('.executive-facts a[href^="tel:"]')?.textContent.replace(/\s+/g,' ').trim()||'';
    const lead=tier==='none'||!name?'No owner or contact on file yet':tier==='protected'?'Protected record — open the official record':role?role+': '+name:name;
    return {title:text(card,'.executive-card-heading h3')||'Property record',glance:text(card,'.executive-glance'),lead,phone,has:tier!=='none'&&tier!=='protected'&&!!name};
  }
  function paint(card){
    const row=card.querySelector(':scope > .parcel-row');if(!row)return;const s=summary(card),parts=[s.title,s.glance,s.lead+(s.phone?' · '+s.phone:'')];
    const spans=row.querySelectorAll('.parcel-row-line');spans.forEach((span,i)=>{if(span.textContent!==parts[i]){span.textContent=parts[i];span.title=parts[i];}});
    row.dataset.lead=s.has?'yes':'no';
  }
  function setOpen(card,open){card.dataset.collapsed=open?'false':'true';const row=card.querySelector(':scope > .parcel-row');row.setAttribute('aria-expanded',String(open));row.querySelector('.parcel-row-toggle').textContent=open?'Hide details':'Details';}
  function attach(card){
    if(card.querySelector(':scope > .parcel-row')||!card.querySelector(':scope > .executive-facts'))return;
    const row=node('button',null,'parcel-row');row.type='button';
    row.append(node('strong',null,'parcel-row-line parcel-row-title'),node('span',null,'parcel-row-line parcel-row-glance'),node('span',null,'parcel-row-line parcel-row-lead'),node('span','Details','parcel-row-toggle'));
    row.addEventListener('click',()=>setOpen(card,card.dataset.collapsed!=='false'));
    card.prepend(row);setOpen(card,false);paint(card);
    new MutationObserver(()=>paint(card)).observe(card.querySelector(':scope > .executive-facts'),{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['data-tier','href']});
  }
  function toolbar(section){
    if(section.querySelector(':scope > .parcel-row-tools'))return;
    const tools=node('div',null,'parcel-row-tools'),all=node('button','Expand all','secondary');all.type='button';
    all.addEventListener('click',()=>{const open=all.textContent==='Expand all';for(const card of section.querySelectorAll('.chat-property-card'))if(card.querySelector(':scope > .parcel-row'))setOpen(card,open);all.textContent=open?'Collapse all':'Expand all';});
    tools.append(all);section.querySelector(':scope > .chat-property-grid')?.before(tools);
    // Bring the new result list to the top of the rail so as many rows as possible are on screen.
    if(document.body.dataset.radarMode==='simple'&&!section.classList.contains('previous-search'))requestAnimationFrame(()=>section.scrollIntoView({block:'start'}));
  }
  function scan(root){for(const card of root.querySelectorAll('.chat-property-card'))attach(card);for(const section of root.querySelectorAll('.chat-properties'))toolbar(section);}
  function start(){const log=document.getElementById('agentLog');if(!log)return;scan(log);new MutationObserver(()=>scan(log)).observe(log,{subtree:true,childList:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
  window.RadarParcelRows={summary};
})();
