(() => {
  const $=id=>document.getElementById(id);let filters={},next=null;const selected=new Set();
  const map=window.L?L.map('privateMap').setView([39,-96],4):null;
  const shapes=map?L.featureGroup().addTo(map):null;
  if(map)L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© OpenStreetMap contributors'}).addTo(map);
  async function api(path,options){const response=await fetch(path,options);if(!response.ok)throw Error('Workspace request failed (HTTP '+response.status+')');return response.json();}
  function message(text){$('privateStatus').textContent=text;}
  function node(tag,text){const n=document.createElement(tag);n.textContent=text;return n;}
  async function search(offset=0){
    const data=await api('/api/parcels?'+new URLSearchParams({...filters,offset}));
    shapes?.clearLayers();
    const host=$('privateResults');host.textContent='';next=data.nextOffset;$('privateNext').hidden=next==null;
    message(`${data.total} imported records match. Showing ${data.records.length}. This is imported coverage, not all properties nationwide.`);
    for(const row of data.records){
      const item=document.createElement('article'),label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=selected.has(row.key);
      check.addEventListener('change',()=>{if(check.checked)selected.add(row.key);else selected.delete(row.key);});label.append(check,document.createTextNode('Select parcel '+row.parcelId));
      if(shapes&&row.geometry){
        const layer=L.geoJSON({type:'Feature',geometry:row.geometry,properties:{}},{style:{color:'#0c655e',weight:2}}).addTo(shapes);
        layer.on('click',()=>{check.checked=!check.checked;check.dispatchEvent(new Event('change'));item.scrollIntoView({behavior:'smooth',block:'center'});});
      }
      item.append(node('h2',row.address||row.parcelId),label,node('p',`${row.state} · ${row.type||'class unavailable'} · ${row.acres??'acreage unavailable'} ac · Assessment owner: ${row.ownerName||'not provided'}`));
      const link=node('a','Provider/source record');link.href=row.sourceURL;link.target='_blank';link.rel='noopener noreferrer';item.append(link,node('small',`Observed ${row.observedAt} · imported ${row.importedAt} · provider ${row.provider}`));
      for(const kind of ['sales','mortgages','relationships']){
        const section=document.createElement('details');section.append(node('summary',`${kind}: ${row[kind].length} supplied records`),node('pre',row[kind].length?JSON.stringify(row[kind],null,2):'Not supplied. Absence does not establish no history.'));item.append(section);
      }
      host.append(item);
    }
    if(shapes?.getBounds().isValid())map.fitBounds(shapes.getBounds().pad(.15),{maxZoom:16});
  }
  async function lists(){
    const host=$('privateLists');host.textContent='';
    for(const row of await api('/api/lists')){
      const item=document.createElement('article');item.append(node('strong',row.name),node('p',`${row.payload.parcelKeys.length} selected parcels · ${row.payload.note}`));
      const load=node('button','Run saved filters');load.type='button';load.addEventListener('click',()=>{filters=row.payload.filters||{};selected.clear();row.payload.parcelKeys.forEach(k=>selected.add(k));$('privateState').value=filters.state||'';$('privateQuery').value=filters.q||'';$('privateMin').value=filters.minAcres||'';$('privateMax').value=filters.maxAcres||'';search().catch(e=>message(e.message));});
      const remove=node('button','Remove list');remove.type='button';remove.addEventListener('click',async()=>{try{await api('/api/lists/'+row.id,{method:'DELETE'});await lists();}catch(e){message(e.message);}});item.append(load,remove);host.append(item);
    }
  }
  $('privateSearch').addEventListener('submit',e=>{e.preventDefault();filters={state:$('privateState').value.trim().toUpperCase(),q:$('privateQuery').value,minAcres:$('privateMin').value,maxAcres:$('privateMax').value};selected.clear();search().catch(e=>message(e.message));});
  $('privateNext').addEventListener('click',()=>search(next).catch(e=>message(e.message)));
  $('savePrivateList').addEventListener('submit',async e=>{e.preventDefault();try{await api('/api/lists',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:$('privateListName').value,note:$('privateNote').value,parcelKeys:[...selected],filters})});await lists();message('Private list and filters saved to this server.');}catch(error){message(error.message);}});
  api('/api/providers').then(rows=>{$('providerStatus').textContent=rows.map(r=>`${r.provider}: ${r.records} imported parcels (${r.status})`).join(' · ');}).catch(e=>{$('providerStatus').textContent=e.message+' Open this page through the authenticated research server.';});
  lists().catch(e=>message(e.message));
  api('/api/alerts').then(rows=>{
    const host=$('privateAlerts');host.textContent=rows.length?'':'No import changes recorded for your saved lists.';
    for(const row of rows)host.append(node('p',`${row.payload.listName}: ${row.payload.event} · ${row.parcel_key} · ${row.payload.changedFields.join(', ')} · observed ${row.payload.observedAt}`));
  }).catch(e=>message(e.message));
})();
