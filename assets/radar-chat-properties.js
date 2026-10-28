/* Property-first chat results. Official service metadata stays inside a collapsed citation. */
(() => {
  'use strict';
  const P=window.RadarProperty,bridge=()=>window.PublicRadarBridge;
  const button=(label,action)=>{const b=document.createElement('button');b.type='button';b.className='secondary';b.textContent=label;b.addEventListener('click',action);return b;};
  const link=(label,url)=>{const a=document.createElement('a');a.textContent=label;a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;};
  function render(rows,meta){
    if(!rows.length)return;
    const host=document.getElementById('agentLog'),section=document.createElement('section');section.className='agent-message bot chat-properties';
    host.dataset.scrollAnchor='';section.dataset.scan=String(meta.scanId);
    const heading=document.createElement('strong');heading.textContent=`${rows.length} ${meta.yearUnknown?'year not published — not year-filter matches':meta.complete?'properties':'partial results'} · ${meta.complete?'select a property below':'search incomplete; more properties may exist'}`;
    section.append(heading);
    const radiusNote=document.createElement('p');radiusNote.textContent='Parcels touching the search circle qualify. Distances are to a map reference point, so edge parcels can show a distance beyond the radius.';
    let criteriaNote=null;if(meta.unverified?.length){criteriaNote=document.createElement('p');criteriaNote.textContent='Candidates only: '+meta.unverified.join(', ')+' remain unverified.';}
    const grid=document.createElement('div');grid.className='chat-property-grid';section.append(grid);
    let shown=0;
    const more=button('Show more properties',()=>page());
    function page(){
      const end=Math.min(rows.length,shown+6);
      for(const record of rows.slice(shown,end)){
        let item;try{item=P.snapshot(record,meta);}catch{continue;}
        const article=document.createElement('article');article.className='chat-property-card';article.dataset.parcelKey=item.key;
        const title=document.createElement('h3');title.textContent=item.address||'Parcel '+item.id;
        const details=document.createElement('p');details.textContent=`${item.type} · ${item.acres==null?'Acreage unavailable':item.acres.toLocaleString()+' acres'}${Number.isFinite(record.distance)?' · '+record.distance.toFixed(2)+' miles to map point':''}${item.yearBuilt==null?' · Year built not published in source':' · Built '+item.yearBuilt}`;
        const owner=document.createElement('p');owner.className='chat-owner-observation';owner.textContent=item.ownership?'Published assessment entity: '+item.ownership.entityName+' · observed '+item.ownership.retrievedAt+'. Title/control unverified.':item.state==='NJ'?'Owner name redacted in the connected NJ source.':'Published owner not checked yet.';
        const ownerButton=button('Look up published owner',async()=>{ownerButton.disabled=true;owner.textContent='Checking this parcel’s official assessment record…';try{const result=await window.RadarOwnership.lookup(item);item.ownership=result.entityName?result:null;owner.textContent=result.entityName?'Published assessment entity: '+result.entityName+' · retrieved '+result.retrievedAt+'. Title/control unverified.':result.status==='published'?'Individual/unclassified assessment name: not indexed into the company directory. Open this property’s details to review.':result.message||'Name not published by this source.';if(result.status==='published'&&!result.entityName&&bridge().getMeta().scanId===meta.scanId){bridge().choose(item.key);window.RadarOwnership.present(item,result);}}catch{owner.textContent='Public owner lookup unavailable. No owner was inferred.';}finally{ownerButton.disabled=false;}});
        const reference=document.createElement('p');if(record.ozObservation){const o=record.ozObservation;reference.textContent=o.kind.toUpperCase()+' '+(o.status==='no-reference-intersection'?'no matching reference polygon returned':'reference polygon intersects')+' · tracts '+(o.tracts.join(', ')||'none returned')+' · checked '+o.checkedAt+'. Final designation and tax qualification unverified.';}
        const picture=document.createElement('a');picture.className='property-picture';picture.href=P.links(item).satellite;picture.target='_blank';picture.rel='noopener noreferrer';picture.setAttribute('aria-label','Open Google satellite imagery for '+(item.address||item.id));
        const v=P.view(item),image=document.createElement('img');image.src=v.imageURL;image.alt='Satellite imagery near '+(item.address||item.id);image.loading='lazy';
        const overlay=document.createElement('div');overlay.className='property-outline';overlay.innerHTML=P.svg(item);overlay.querySelector('rect')?.remove();
        const unavailable=document.createElement('span');unavailable.className='imagery-unavailable';unavailable.textContent='Imagery unavailable · geometry reference shown';unavailable.hidden=true;
        image.addEventListener('error',()=>{image.hidden=true;unavailable.hidden=false;picture.dataset.unavailable='true';});
        picture.append(image,overlay,unavailable);
        const precision=document.createElement('small');precision.textContent=item.precision+' · Esri imagery / source providers';
        const id=document.createElement('small');id.textContent='Parcel '+item.id+' · Retrieved '+(item.retrievedAt||'time unavailable');
        const actions=document.createElement('div');actions.className='property-card-actions';
        const open=button('View parcel on satellite',()=>{
          if(bridge().getMeta().scanId!==meta.scanId){open.disabled=true;open.textContent='Previous search — run it again to open';return;}
          bridge().focusParcel(item.key,{satellite:true});document.getElementById('mapPanel').scrollIntoView({behavior:'smooth',block:'start'});
        });open.dataset.action='focus-parcel';
        const trip=button('Add to field trip',()=>{if(window.RadarFieldPack?.add(item)){trip.textContent='Added to field trip';}});trip.dataset.action='add-trip';
        const urls=P.links(item);actions.append(link('Google Maps / images',urls.maps),link('Google satellite',urls.satellite),link('Street View (if available)',urls.street),open,trip);
        const citation=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Source and map accuracy';
        const source=document.createElement('p');source.textContent=item.sourceName+' · '+item.sourceVintage;
        citation.append(summary,source);if(item.sourceURL)citation.append(link('Official data layer (technical source)',item.sourceURL));
        article.append(title,details,owner,ownerButton,reference,picture,precision,id,actions,citation);grid.append(article);
      }
      shown=end;more.hidden=shown>=rows.length;more.textContent=`Show more properties (${shown} of ${rows.length} shown)`;
    }
    section.append(more,radiusNote);if(criteriaNote)section.append(criteriaNote);host.append(section);page();
    while(host.children.length>16)host.firstChild.remove();
    host.scrollTop=section.offsetTop-host.offsetTop;
  }
  document.addEventListener('radar:scan-state',()=>{
    const current=String(bridge().getMeta().scanId);
    for(const group of document.querySelectorAll('.chat-properties'))if(group.dataset.scan!==current){
      if(!group.classList.contains('previous-search')){const heading=group.querySelector(':scope > strong');if(heading)heading.textContent='Previous search — '+heading.textContent;}
      group.classList.add('previous-search');for(const b of group.querySelectorAll('[data-action=focus-parcel]'))b.disabled=true;
    }
  });
  window.RadarChatProperties={render};
})();
