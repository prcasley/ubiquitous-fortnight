/* Local screening, assembly and read-only comparable imports. Imported data is never uploaded. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id),P=window.RadarProperty,C=window.RadarResearchToolsCore,bridge=()=>window.PublicRadarBridge;
  const key='capital-radar-research-tools-v1';let state={version:1,assembly:[],checks:{},comps:[]},selected=null;
  const kinds=['zoning','flood','wetlands','access','power','fiber'];
  const node=(tag,value)=>{const n=document.createElement(tag);n.textContent=value;return n;};
  const button=(text,fn)=>{const b=node('button',text);b.type='button';b.className='secondary';b.addEventListener('click',fn);return b;};
  function message(text){$('researchToolsStatus').textContent=text;}
  function persist(){try{localStorage.setItem(key,JSON.stringify(state));return true;}catch{message('Storage is full. The current data is loaded only in this tab; retain the original source file and export your research.');return false;}}
  function download(name,text,type='text/csv'){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  const current=()=>bridge().getResults().find(r=>r.key===selected);
  function assembly(){
    const host=$('assemblyResearch');host.textContent='';
    if(!state.assembly.length){host.textContent='Select mapped parcels to build a research assembly.';return;}
    const summary=C.assemblySummary(state.assembly,window.turf);
    host.append(node('p',`${summary.count} parcels · ${summary.knownAcreage.toFixed(2)} summed reported acres · ${summary.unknownAcreage} unknown acreages · ${summary.pointOnly} point-only records. Polygon components: ${summary.polygonComponents}; overlapping pairs: ${summary.overlappingPairs}.`),node('p','Geometry connectivity is a planning check, not proof of legal adjacency, common control, access or assemblage feasibility. Summed acres are not dissolved unique land area, especially when geometries overlap.'));
    for(const r of state.assembly){const row=node('p',`${r.address||r.id} · ${r.acres??'unknown'} acres `);row.append(button('Remove',()=>{state.assembly=state.assembly.filter(x=>x.key!==r.key);persist();assembly();}));host.append(row);}
  }
  function screening(){
    const host=$('manualScreening');host.textContent='';const record=current();if(!record){host.textContent='Select a parcel to record source-linked screening observations.';return;}
    host.append(node('h3',record.address||record.id));
    for(const kind of kinds){
      const existing=(state.checks[record.key]||[]).find(x=>x.kind==='manual-'+kind)||{};
      const form=document.createElement('form');form.append(node('strong',kind));const status=document.createElement('select');status.setAttribute('aria-label',kind+' screening status');
      for(const value of ['unchecked','needs-review','source-observation']){const op=node('option',value.replaceAll('-',' '));op.value=value;status.append(op);}status.value=existing.status||'unchecked';
      const source=document.createElement('input');source.type='url';source.placeholder='HTTPS evidence URL';source.setAttribute('aria-label',kind+' source URL');source.value=existing.sourceURL||'';
      const date=document.createElement('input');date.type='date';date.setAttribute('aria-label',kind+' observation date');date.value=existing.observedAt||'';
      const note=document.createElement('input');note.placeholder='Observation / next check';note.maxLength=1000;note.setAttribute('aria-label',kind+' observation');note.value=existing.note||'';
      const save=node('button','Save observation');save.className='secondary';form.append(status,source,date,note,save);
      form.addEventListener('submit',event=>{event.preventDefault();let href='';try{const u=new URL(source.value);if(u.protocol==='https:'&&!u.username&&!u.password)href=u.href;}catch{}
        if(status.value==='source-observation'&&(!href||!date.value)){message('A source observation needs an HTTPS reference and observation date. Otherwise mark it needs review.');return;}
        const rows=state.checks[record.key]||[];state.checks[record.key]=rows.filter(x=>x.kind!=='manual-'+kind);
        state.checks[record.key].push({kind:'manual-'+kind,origin:'manual',status:status.value,sourceURL:href,observedAt:date.value,retrievedAt:date.value,note:note.value,caveat:note.value||'User-recorded screening observation; not an independent feasibility determination.'});persist();document.dispatchEvent(new CustomEvent('radar:research-updated',{detail:{key:record.key}}));message('Screening observation saved in this browser.');
      });host.append(form);
    }
  }
  function comps(){
    const host=$('localCompResults');host.textContent='';const record=current(),radius=Number($('compRadius').value)||3;
    const center=record?{lat:record.lat,lon:record.lon}:bridge().getCenter();let missing=0;
    const rows=state.comps.map(row=>{if(!center||row.lat==null||row.lon==null){missing++;return {...row,distance:null};}return {...row,distance:window.turf.distance(window.turf.point([center.lon,center.lat]),window.turf.point([row.lon,row.lat]),{units:'miles'})};}).filter(r=>r.distance!=null&&r.distance<=radius).sort((a,b)=>a.distance-b.distance);
    host.append(node('p',`${state.comps.length} imported records · ${rows.length} within ${radius} miles of ${record?record.address||record.id:'the map center'} · ${missing} lack a usable coordinate comparison. User-supplied data; independently verify source records. No active-listing or lease-renewal coverage is implied.`));
    for(const r of rows.slice(0,100)){const row=document.createElement('article');row.className='owner-company';row.append(node('strong',r.address),node('p',`${r.id} · ${r.type} · ${r.date||'date unavailable'} · ${r.distance.toFixed(2)} mi · ${r.pricePerBuildingSF==null?'Closed-sale $/building SF unavailable':'$'+r.pricePerBuildingSF.toFixed(2)+'/building SF (closed-sale record)'}`));
      if(r.sourceURL){const link=node('a','Source record');link.href=r.sourceURL;link.target='_blank';link.rel='noopener noreferrer';row.append(link);}host.append(row);
    }
  }
  function init(){
    if(!$('researchTools'))return;
    try{const saved=JSON.parse(localStorage.getItem(key));if(saved?.version===1&&Array.isArray(saved.assembly)&&saved.checks&&Array.isArray(saved.comps))state=saved;}catch{message('Stored research could not be read. Original storage was left intact.');}
    assembly();screening();comps();
    document.addEventListener('radar:parcel-selected',e=>{selected=e.detail.key;$('addResearchAssembly').disabled=false;screening();comps();});
    document.addEventListener('radar:scan-state',e=>{if(e.detail.state==='idle'){selected=null;$('addResearchAssembly').disabled=true;screening();}});
    $('addResearchAssembly').addEventListener('click',()=>{const r=current();if(!r)return;if(state.assembly.some(p=>p.key===r.key)){message('Parcel is already selected.');return;}if(state.assembly.length>=30){message('Select up to 30 parcels per assembly.');return;}state.assembly.push(P.snapshot(r,bridge().getMeta()));persist();assembly();});
    $('exportAssemblyGeoJSON').addEventListener('click',()=>{if(!state.assembly.length){message('Select parcels first.');return;}download('capital-radar-assembly.geojson',JSON.stringify(C.geoJSON(state.assembly),null,2),'application/geo+json');});
    $('exportAssemblyCSV').addEventListener('click',()=>download('capital-radar-assembly.csv',C.csv(state.assembly,['id','state','address','acres','sourceURL','retrievedAt','precision'])));
    $('compRadius').addEventListener('change',comps);
    $('localCompsImport').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>5000000)throw Error('Choose a CSV under 5 MB');const rows=C.importComps(await file.text());state.comps=rows;const saved=persist();comps();if(saved)message(`${rows.length} comparable records imported locally. Original files were not changed; no data was uploaded.`);}catch(error){message('Import failed; previous records preserved: '+error.message);}finally{event.target.value='';}});
    $('clearLocalComps').addEventListener('click',()=>{state.comps=[];persist();comps();});
    $('exportResearchQueue').addEventListener('click',()=>{const rows=bridge().getResults().map(r=>({parcel_id:r.id,state:r.state,address:r.address,reported_acres:r.acres,assessment_class:r.type,published_entity:r.ownership?.entityName||'',owner_observed_at:r.ownership?.retrievedAt||'',source_url:r.source.url,source_retrieved_at:bridge().getMeta().time,screening_observations:(state.checks[r.key]||[]).filter(x=>x.status==='source-observation').length,screening_needs_review:(state.checks[r.key]||[]).filter(x=>x.status==='needs-review').length}));download('capital-radar-research-queue.csv',C.csv(rows,['parcel_id','state','address','reported_acres','assessment_class','published_entity','owner_observed_at','source_url','source_retrieved_at','screening_observations','screening_needs_review']));});
  }
  window.RadarResearchTools={getScreenings:parcelKey=>JSON.parse(JSON.stringify(state.checks[parcelKey]||[]))};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
