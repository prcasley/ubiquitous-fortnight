/* Property-first chat results. Official service metadata stays inside a collapsed citation. */
(() => {
  'use strict';
  const P=window.RadarProperty,bridge=()=>window.PublicRadarBridge;
  const button=(label,action)=>{const b=document.createElement('button');b.type='button';b.className='secondary';b.textContent=label;b.addEventListener('click',action);return b;};
  const link=(label,url)=>{const a=document.createElement('a');a.textContent=label;a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;};
  let lastRows=[],lastScan=null;
  function render(rows,meta){
    lastRows=rows.slice();lastScan=meta.scanId;
    if(!rows.length)return;
    const host=document.getElementById('agentLog'),section=document.createElement('section');section.className='agent-message bot chat-properties';
    host.dataset.scrollAnchor='';section.dataset.scan=String(meta.scanId);
    const heading=document.createElement('strong');heading.textContent=meta.subjectParcel?(rows[0].subjectLabel||'Subject parcel'):meta.selectedParcel?'Selected parcel · search results retained':`${rows.length} ${meta.yearUnknown?'year not published — not year-filter matches':meta.complete?'properties':'partial results'} · ${meta.complete?'select a property below':'search incomplete; more properties may exist'}`;
    section.append(heading);
    const radiusNote=document.createElement('p');radiusNote.textContent=meta.scope==='county'?'Countywide search in '+meta.countyLabel+' County. No radius limit; rankings cover retrieved records only.': 'Parcels touching the search circle qualify. Distances are to a map reference point, so edge parcels can show a distance beyond the radius.';
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
        const details=document.createElement('p');details.textContent=`${item.type} · ${item.acres==null?'Acreage unavailable':item.acres.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+' acres'}${meta.scope!=='county'&&Number.isFinite(record.distance)?' · '+record.distance.toFixed(2)+' miles to map point':''}${item.yearBuilt==null?' · Year built not published in source':' · Built '+item.yearBuilt}`;
        if(item.acreageQuality==='computed-polygon')details.textContent+=' · Acreage computed from GIS polygon; not surveyed or net developable area';
        const owner=document.createElement('p');owner.className='chat-owner-observation owner-line';const setOwner=(name,msg,note)=>{owner.textContent='';const tag=document.createElement('span');tag.className='owner-tag';tag.textContent='OWNER';const n=document.createElement('strong');n.className='owner-name'+(name?'':' owner-pending');n.textContent=name||msg;owner.append(tag,n);if(note){const s=document.createElement('span');s.className='owner-note';s.textContent=note;owner.append(s);}};const known=window.RadarOwnerAuto?.ownerName?.(record);if(known?.name)setOwner(known.name,'',known.state==='older'?'Older county file — may have changed':'County tax record');else if(item.ownership?.entityName)setOwner(item.ownership.entityName,'','County tax record');else setOwner(null,'Loading…');
        const ownerButton=button('Show owner',async()=>{ownerButton.disabled=true;setOwner(null,'Checking county record…');try{const result=await window.RadarOwnership.lookup(item);item.ownership=result.entityName?result:null;const live=bridge().getRecord(item.key)||record;if(live&&result&&(result.status==='published'||result.entityName)){live.publishedOwner={...result,status:'published',publishedName:result.publishedName||result.entityName};if(result.entityName)live.ownership=result;}const nm=result.entityName||(result.status==='published'?result.publishedName:null);if(nm){setOwner(nm,'','County tax record');ownerButton.hidden=true;}else setOwner(null,'Not listed in county record');if(result.status==='published'&&!result.entityName&&bridge().getMeta().scanId===meta.scanId){bridge().choose(item.key);window.RadarOwnership.present(item,result);}}catch{setOwner(null,'Owner lookup unavailable — try again');}finally{ownerButton.disabled=false;window.RadarExecutiveCards?.refresh(bridge().getRecord(item.key)||record);}});
        const reference=window.RadarOZObservations.decorate(document.createElement('p'),record);
        const picture=document.createElement('a');picture.className='property-picture';picture.href=P.links(item).satellite;picture.target='_blank';picture.rel='noopener noreferrer';picture.setAttribute('aria-label','Open Google satellite imagery for '+(item.address||item.id));
        const v=P.view(item),image=document.createElement('img');image.src=v.imageURL;image.alt='Satellite imagery near '+(item.address||item.id);image.loading='lazy';
        const overlay=document.createElement('div');overlay.className='property-outline';overlay.innerHTML=P.svg(item);overlay.querySelector('rect')?.remove();
        const unavailable=document.createElement('span');unavailable.className='imagery-unavailable';unavailable.textContent='Imagery unavailable · geometry reference shown';unavailable.hidden=true;
        image.addEventListener('error',()=>{image.hidden=true;unavailable.hidden=false;picture.dataset.unavailable='true';});
        picture.append(image,overlay,unavailable);
        const precision=document.createElement('small');precision.textContent=item.precision+' · Esri imagery / source providers';
        const id=document.createElement('small');id.textContent='Parcel '+(item.parcelNumber||item.id)+' · Retrieved '+(item.retrievedAt||'time unavailable');
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
        article.append(title,details,owner,ownerButton,reference,picture,precision,id,actions,citation);window.RadarExecutiveCards?.enhance(article,record);grid.append(article);if(owner.querySelector('.owner-pending'))setTimeout(()=>ownerButton.click(),150*(grid.children.length));else ownerButton.hidden=true;
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
  window.RadarChatProperties={render,getRows:()=>lastScan===bridge().getMeta().scanId?lastRows.slice():[]};
})();
