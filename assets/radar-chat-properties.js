/* Property-first chat results. Official service metadata stays inside a collapsed citation. */
(() => {
  'use strict';
  const P=window.RadarProperty,bridge=()=>window.PublicRadarBridge;
  const button=(label,action)=>{const b=document.createElement('button');b.type='button';b.className='secondary';b.textContent=label;b.addEventListener('click',action);return b;};
  const link=(label,url)=>{const a=document.createElement('a');a.textContent=label;a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;};
  function render(rows,meta){
    if(!rows.length)return;
    const host=document.getElementById('agentLog'),section=document.createElement('section');section.className='agent-message bot chat-properties';
    section.dataset.scan=String(meta.scanId);
    const heading=document.createElement('strong');heading.textContent=`${rows.length} ${meta.complete?'properties':'partial results'} · ${meta.complete?'select a property below':'search incomplete; more properties may exist'}`;
    section.append(heading);
    if(meta.unverified?.length){const note=document.createElement('p');note.textContent='Candidates only: '+meta.unverified.join(', ')+' remain unverified.';section.append(note);}
    const grid=document.createElement('div');grid.className='chat-property-grid';section.append(grid);
    let shown=0;
    const more=button('Show more properties',()=>page());
    function page(){
      const end=Math.min(rows.length,shown+6);
      for(const record of rows.slice(shown,end)){
        let item;try{item=P.snapshot(record,meta);}catch{continue;}
        const article=document.createElement('article');article.className='chat-property-card';article.dataset.parcelKey=item.key;
        const title=document.createElement('h3');title.textContent=item.address||'Parcel '+item.id;
        const details=document.createElement('p');details.textContent=`${item.type} · ${item.acres==null?'Acreage unavailable':item.acres.toLocaleString()+' acres'}${Number.isFinite(record.distance)?' · '+record.distance.toFixed(2)+' miles':''} · Built ${item.yearBuilt??'unknown'}`;
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
        article.append(title,details,picture,precision,id,actions,citation);grid.append(article);
      }
      shown=end;more.hidden=shown>=rows.length;more.textContent=`Show more properties (${shown} of ${rows.length} shown)`;
    }
    section.append(more);host.append(section);page();
    while(host.children.length>16)host.firstChild.remove();
    host.scrollTop=section.offsetTop-host.offsetTop;
  }
  document.addEventListener('radar:scan-state',()=>{
    const current=String(bridge().getMeta().scanId);
    for(const group of document.querySelectorAll('.chat-properties'))if(group.dataset.scan!==current){
      group.classList.add('previous-search');for(const b of group.querySelectorAll('[data-action=focus-parcel]'))b.disabled=true;
    }
  });
  window.RadarChatProperties={render};
})();
