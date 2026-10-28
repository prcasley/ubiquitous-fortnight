/* Browser-local public research. Licensed data never enters these exports. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id),bridge=()=>window.PublicRadarBridge;
  const key='capital-radar-research-v1';
  let saved={version:1,parcels:[],searches:[]},selected=null,controller=null;
  const results=new Map();
  function message(text){$('researchStatus').textContent=text;}
  function persist(){
    try{localStorage.setItem(key,JSON.stringify(saved));render();return true;}
    catch{message('Browser storage is unavailable or full. Export your research before closing this tab.');return false;}
  }
  function button(label,fn){const b=document.createElement('button');b.type='button';b.className='secondary';b.textContent=label;b.addEventListener('click',fn);return b;}
  function render(){
    const host=$('savedResearch');host.textContent='';
    for(const item of saved.searches){
      const row=document.createElement('div');row.className='research-row';
      const title=document.createElement('strong');title.textContent=item.name;
      row.append(title,button('Load filters',()=>{
        const s=item.search;
        bridge().clearResults();$('stateSelect').value=s.state;
        document.dispatchEvent(new CustomEvent('radar:location',{detail:{state:s.state,county:item.countyLabel}}));
        $('countySelect').value=s.county;window.PublicRadarCounty=s.county;
        bridge().setCenter(s.center.lat,s.center.lon);bridge().setRadius(s.radius);
        $('typeSelect').value=s.type;bridge().setAcreageFilter(s.acreage.value,s.acreage.op,s.acreage.max);
        message('Saved filters loaded. Run a new scan to retrieve current source records.');
      }),button('Remove',()=>{saved.searches=saved.searches.filter(x=>x.id!==item.id);persist();}));
      host.append(row);
    }
    for(const item of saved.parcels){
      const row=document.createElement('div');row.className='research-row';
      const title=document.createElement('strong');title.textContent=item.address||item.id;
      const info=document.createElement('small');info.textContent=`Parcel ${item.id} · ${item.state} · ${item.acres??'unknown'} ac · observed ${item.retrievedAt}`;
      const note=document.createElement('textarea');note.value=item.note||'';note.maxLength=2000;note.setAttribute('aria-label','Notes for parcel '+item.id);
      note.placeholder='Research note (stored only in this browser)';note.addEventListener('change',()=>{item.note=note.value;persist();});
      const screens=document.createElement('small');screens.textContent=(item.screenings||[]).map(s=>window.RadarScreening.review(s)).map(s=>`${s.kind}: ${s.status}${s.overlapPercent==null?'':` (${s.overlapPercent.toFixed(1)}% mapped overlap)`}`).join(' · ')||'Environmental screening not checked';
      row.append(title,info,screens,note,button('Remove',()=>{saved.parcels=saved.parcels.filter(x=>x.key!==item.key);persist();}));host.append(row);
    }
    if(!saved.parcels.length&&!saved.searches.length)host.textContent='No saved research yet. Select a parcel or complete a scan.';
  }
  function snapshot(record){
    const meta=bridge().getMeta();
    return {key:record.key,id:record.id,state:record.state,jurisdiction:record.jurisdiction,provider:record.provider,
      address:record.address,acres:record.acres,assessmentClass:record.use,yearBuilt:record.yearBuilt,
      sourceURL:record.source.url,sourceName:record.source.name,sourceVintage:record.source.date,
      retrievedAt:record.retrievedAt||meta.time,scanStatus:record.scanStatus||meta.status,unverifiedCriteria:meta.unverified||[],geometryPrecision:record.locationPrecision,
      geometry:record.geometry.geometry,screenings:results.get(record.key)||[],note:'',savedAt:new Date().toISOString()};
  }
  window.PublicRadarResearch={getScreenings:parcelKey=>JSON.parse(JSON.stringify((results.get(parcelKey)||[]).map(s=>window.RadarScreening.review(s))))};
  function init(){
    if(!$('savedResearch'))return;
    try{const data=JSON.parse(localStorage.getItem(key));
      if(data?.version===1&&Array.isArray(data.parcels)&&Array.isArray(data.searches))saved=data;
    }catch{message('Saved research could not be read. Existing browser storage was left intact.');}
    render();
    document.addEventListener('radar:parcel-selected',e=>{
      selected=e.detail.key;$('saveParcel').disabled=false;$('screenParcel').disabled=false;
      $('screenResults').textContent='Selected parcel has not been screened in this session.';
    });
    document.addEventListener('radar:scan-state',e=>{
      if(e.detail.state==='idle'){selected=null;controller?.abort();results.clear();$('saveParcel').disabled=true;$('screenParcel').disabled=true;$('screenResults').textContent='Select a parcel to screen.';}
    });
    $('saveParcel').addEventListener('click',()=>{
      const record=bridge().getRecord(selected);if(!record)return;
      if(saved.parcels.length>=500&&!saved.parcels.some(r=>r.key===selected)){message('500-parcel browser limit reached. Export or remove records first.');return;}
      const item=snapshot(record),old=saved.parcels.find(x=>x.key===selected);item.note=old?.note||'';
      saved.parcels=saved.parcels.filter(x=>x.key!==selected);saved.parcels.push(item);
      if(persist())message('Parcel snapshot saved in this browser with source and retrieval time.');
    });
    $('saveSearch').addEventListener('click',()=>{
      const search=bridge().getSearch();if(!search||!bridge().getMeta().complete){message('Complete a scan before saving its filters.');return;}
      if(saved.searches.length>=50){message('50-search browser limit reached. Remove a saved search first.');return;}
      saved.searches.push({id:crypto.randomUUID(),name:`${search.state} · ${search.type} · ${search.acreage.op} ${search.acreage.value} ac · ${search.radius} mi`,
        search,countyLabel:$('countySelect').selectedOptions[0]?.textContent||'',savedAt:new Date().toISOString()});
      if(persist())message('Search filters saved. Loading them will not reuse old scan results.');
    });
    $('exportResearch').addEventListener('click',()=>{
      const blob=new Blob([JSON.stringify({...saved,exportedAt:new Date().toISOString(),scope:'Browser-saved public-source observations only; not title, zoning or feasibility verification'},null,2)],{type:'application/json'});
      const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='capital-radar-research.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      message('Exported saved research, notes, provenance and screening observations.');
    });
    $('screenParcel').addEventListener('click',async()=>{
      const record=bridge().getRecord(selected);if(!record)return;
      controller?.abort();controller=new AbortController();const signal=controller.signal,scanId=bridge().getMeta().scanId;
      $('screenParcel').disabled=true;$('screenResults').textContent='Checking public flood and wetlands layers…';
      const checks=await Promise.all(['flood','wetlands'].map(kind=>window.RadarScreening.screen(record,kind,{signal})));
      if(signal.aborted||scanId!==bridge().getMeta().scanId)return;
      results.set(record.key,checks);
      const savedRecord=saved.parcels.find(r=>r.key===record.key);if(savedRecord){savedRecord.screenings=checks;persist();}
      if(selected===record.key){
        const host=$('screenResults');host.textContent='';
        for(const check of checks){
          const row=document.createElement('p');
          row.textContent=`${check.source}: ${check.status}${check.overlapPercent==null?'':` · ${check.overlapPercent.toFixed(1)}% mapped overlap`}. ${check.labels?.join(', ')||check.reason||''} ${check.precision==='point-only'?'Centroid check only; parcel overlap is unavailable. ':''}${check.caveat} Retrieved ${check.retrievedAt}. `;
          const link=document.createElement('a');link.href=check.sourceURL;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Source layer';row.append(link);host.append(row);
        }
      }
      $('screenParcel').disabled=false;
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
