/* A user-started, bounded research pass over the connected public parcel sources. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id),B=()=>window.PublicRadarBridge;
 const markets=[
  ['northampton','Lehigh Valley / Easton, PA'],
  ['njcentral','Central New Jersey'],
  ['njnorth','Northern New Jersey'],
  ['palm','West Palm Beach, FL'],
  ['broward','Broward County, FL'],
  ['miami','Miami-Dade County, FL']
 ];
 const minimum=2,radius=3,limit=5;
 const node=(tag,label)=>{const el=document.createElement(tag);if(label)el.textContent=label;return el;};
 function button(label,action){
  const el=node('button',label);el.type='button';el.addEventListener('click',action);return el;
 }
 function link(url,label){
  const href=window.RadarExecutiveCardCore.https(url);
  if(!href)return null;
  const el=node('a',label);el.href=href;el.target='_blank';el.rel='noopener noreferrer';return el;
 }
 function restrictedRecord(record){
  return !!window.RadarOwnerAuto?.getResearch(record.key)?.protectedName||
   [record.publishedOwner,record.ownership].some(owner=>owner?.protectedName||/protected|confidential/i.test(owner?.message||''));
 }
 function leaseRecords(data){
  if(!Array.isArray(data?.leases)||data.leases.length>5000)throw Error('Use a lease file with up to 5,000 records.');
  const records=new Map();
  for(const row of data.leases){
   const {parcelKey,expiration,sourceURL}=row||{};
   const date=typeof expiration==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(expiration)?new Date(expiration):null;
   if(typeof parcelKey!=='string'||!parcelKey.trim()||parcelKey.length>400||!date||!Number.isFinite(+date)||date.toISOString().slice(0,10)!==expiration||!window.RadarExecutiveCardCore.https(sourceURL)||records.has(parcelKey))
    throw Error('Each lease needs a unique exact parcel key, a valid YYYY-MM-DD expiration and an HTTPS source.');
   records.set(parcelKey,{expiration,sourceURL});
  }
  return records;
 }
 function init(){
  const anchor=$('filterDrawer'),coverage=document.querySelector('.v34-tract-coverage');
  const chips=document.querySelector('.agent-suggestions');
  if(!anchor||!chips)return;
  const gate=document.documentElement,unlocked=()=>!gate.hasAttribute('data-radar-locked')&&window.RadarExecutiveVault?.isVaultUnlocked();
  let run=null,scanId=null,rows=[],pick=0,leases=new Map(),leaseImport=0;
  const panel=node('section');panel.id='propertyPlay';panel.className='property-play';panel.hidden=true;
  panel.setAttribute('aria-labelledby','propertyPlayTitle');
  const title=node('h3','Property search');title.id='propertyPlayTitle';
  const areaLabel=node('label','Market'),market=node('select');market.id='propertyPlayMarket';areaLabel.htmlFor=market.id;
  for(const [id,label] of markets)market.add(new Option(label,id));
  const controls=node('div');controls.className='property-play-controls';
  const live=node('p','Searches for industrial parcels of at least 2 acres within 3 miles.');live.setAttribute('role','status');
  const play=button('▶ Play this market',start),stop=button('Stop',()=>run?.abort());stop.disabled=true;
  const previous=button('Previous parcel',()=>open(pick-1)),next=button('Next parcel',()=>open(pick+1));
  const pager=node('div');pager.className='property-play-controls';pager.hidden=true;pager.append(previous,next);
  const result=node('article');result.className='property-play-result';result.hidden=true;
  const leasePanel=node('details'),leaseSummary=node('summary','Lease evidence');
  const fileLabel=node('label','Choose lease evidence file'),file=node('input');file.type='file';file.accept='.json,application/json';file.id='propertyPlayLeaseFile';fileLabel.htmlFor=file.id;
  const leaseStatus=node('p');leaseStatus.setAttribute('role','status');
  leasePanel.append(leaseSummary,node('p','Parcel sources do not publish lease expiration. For an exact parcel match, import a local JSON file with leases containing parcelKey, expiration and sourceURL. The file stays in this tab until you lock Radar or reload.'),fileLabel,file,leaseStatus);
  file.addEventListener('change',async()=>{
   const selected=file.files[0],id=++leaseImport;
   if(!selected||!unlocked())return;
   try{
    if(selected.size>1000000)throw Error('Choose a file smaller than 1 MB.');
    const imported=leaseRecords(JSON.parse(await selected.text()));
    if(id!==leaseImport||!unlocked())return;
    leases=imported;leaseStatus.textContent=leases.size+' parcel lease records loaded.';
    if(rows.length)render();
   }catch(error){if(id===leaseImport&&unlocked())leaseStatus.textContent=error.message;}
   finally{if(id===leaseImport)file.value='';}
  });
  controls.append(areaLabel,market,play,stop);
  panel.append(title,controls,live,result,pager,leasePanel);anchor.before(panel);
  const shortcuts=node('div');shortcuts.className='property-play-shortcuts';
  const quickPlay=button('▶ Play',start),chooseMarket=button('Market',()=>{
   showPanel();
   market.focus();
  });
  quickPlay.className='property-play-start';
  chooseMarket.setAttribute('aria-label','Choose a market for Play');
  chooseMarket.setAttribute('aria-controls',panel.id);
  chooseMarket.setAttribute('aria-expanded','false');
  (coverage||chips).before(shortcuts);
  shortcuts.append(quickPlay);
  if(coverage)shortcuts.append(coverage);
  shortcuts.append(chooseMarket);
  function showPanel(){
   if(!unlocked())return;
   panel.hidden=false;chooseMarket.setAttribute('aria-expanded','true');
  }

  function render(){
   const row=rows[pick],r=row.record;
   const checked=row.owner,restricted=restrictedRecord(r);
   const official=checked?.status==='published'&&link(checked.sourceURL,'Assessment source');
   const vault=restricted?null:window.RadarExecutiveVault.getExecutiveRecordForParcel(r.id);
   const vaultFields=vault?.phones?.length||vault?.emails?.length;
   const contactCount=row.contacts?.contacts.filter(c=>window.RadarContactVerifier.verify(r,c).fields.length).length||0;
   const reviewed=window.RadarOwnership?.reviewedContacts?.(r)?.length||0;
   const carrier=r.state==='NJ'?window.RadarNJPublicResearch?.usdot?.(r):null;
   const lease=leases.get(r.key);
   const parcelSource=link(r.source?.url,'Parcel source');
   const title=node('h4',r.address||'Parcel '+r.id);
   const facts=node('dl');
   function fact(label,value){facts.append(node('dt',label),node('dd',value));}
   fact('Parcel ID',r.id);
   fact('Parcel key for lease evidence',r.key);
   fact('Market',[r.municipality,r.state].filter(Boolean).join(', '));
   fact('Size and use',r.acres.toLocaleString('en-US',{maximumFractionDigits:2})+' acres · '+r.type);
   fact('Year built',r.yearBuilt==null?'Not published':String(r.yearBuilt));
   if(r.buildingArea>0)fact('Published building area',r.buildingArea.toLocaleString('en-US')+' sq ft');
   fact('Recorded sale date',r.recordedSaleDate||'Not published');
   fact('Assessment owner',restricted?'Protected record':official?(checked.publishedName||checked.entityName||'Name not published'):checked?.message||'Source unavailable');
   fact('Lease expiration',lease?lease.expiration+' · imported evidence':'No lease evidence connected for this parcel');
   fact('Contacts',restricted?'Protected record':vaultFields||reviewed||contactCount||carrier?.status==='ACTIVE'&&(carrier.businessPhone||carrier.email)?'Contact leads on the parcel card':row.contacts?.status||'No reviewed contact found in the connected sources');
   result.replaceChildren(title,facts);
   for(const source of [parcelSource,restricted?null:official,lease&&link(lease.sourceURL,'Imported lease source')])if(source)result.append(source);
   result.hidden=false;pager.hidden=false;previous.disabled=pick===0;next.disabled=pick===rows.length-1;
  }
  function open(index){
   if(!unlocked()||!rows[index]||B().getMeta().scanId!==scanId)return;
   pick=index;B().focusParcel(rows[pick].record.key,{satellite:true});
   render();live.textContent='Recommendation '+(pick+1)+' of '+rows.length+' · '+market.selectedOptions[0].textContent+(B().getMeta().complete?'':' · partial source coverage');
  }
  function clear(){
   rows=[];scanId=null;result.replaceChildren();result.hidden=true;pager.hidden=true;
  }
  async function enrich(row,signal){
   const r=row.record;
   row.owner=await window.RadarPublicData.lookupOwner(r,{signal}).catch(()=>null);
   if(signal.aborted)return;
   if(row.owner)r.publishedOwner=row.owner;
   if(!restrictedRecord(r)){
    row.contacts=await window.RadarContactOptions?.check(r,{signal:AbortSignal.any([signal,AbortSignal.timeout(12000)])}).catch(()=>null);
   }
  }
  async function start(){
   if(run||!unlocked()||!B()?.getMap())return;
   showPanel();
   if(B().isScanning()||$('agentForm').querySelector('[type=submit]').disabled){live.textContent='A search is already running.';return;}
   clear();const controller=new AbortController();run=controller;const signal=controller.signal;
   play.disabled=true;quickPlay.disabled=true;stop.disabled=false;market.disabled=true;
   try{
    const target=$('market');target.value=market.value;target.dispatchEvent(new Event('change'));
    $('typeSelect').value='industrial';B().setRadius(radius);B().setAcreageFilter(minimum,'>=');
    live.textContent='Searching public parcel records in '+market.selectedOptions[0].textContent+'…';
    const search=B().scan({signal});scanId=B().getMeta().scanId;
    await search;
    if(signal.aborted||!unlocked()||B().getMeta().scanId!==scanId)return;
    const meta=B().getMeta(),ranked=window.RadarAcquisitionCore.build(B().getResults(),meta,{minAcres:minimum,limit});
    if(!ranked.rows.length){
     live.textContent=meta.complete?'No qualifying parcels found in this search area.':'Search coverage was incomplete and no qualifying parcels were retrieved.';
     return;
    }
    live.textContent='Checking assessment owners and available contacts for '+ranked.rows.length+' parcels…';
    await Promise.all(ranked.rows.map(row=>enrich(row,signal)));
    if(signal.aborted||!unlocked()||B().getMeta().scanId!==scanId)return;
    rows=ranked.rows;open(0);
   }catch{
    if(!signal.aborted&&unlocked())live.textContent='Property search did not finish. Try the market again.';
   }finally{
    run=null;play.disabled=false;quickPlay.disabled=false;stop.disabled=true;market.disabled=false;
    if(signal.aborted&&unlocked())live.textContent='Property search stopped.';
   }
  }
  document.addEventListener('radar:scan-state',event=>{
   if(scanId===null||event.detail.scanId===scanId)return;
   run?.abort();clear();live.textContent='Map search changed. Press Play for new recommendations.';
  });
  market.addEventListener('change',()=>{clear();live.textContent='Press Play to search '+market.selectedOptions[0].textContent+'.';});
  function syncGate(){
   const open=unlocked();
   quickPlay.hidden=!open;chooseMarket.hidden=!open;
   if(!open){
    panel.hidden=true;chooseMarket.setAttribute('aria-expanded','false');
    run?.abort();clear();leases.clear();leaseImport++;file.value='';leaseStatus.textContent='';leasePanel.open=false;
    live.textContent='Searches for industrial parcels of at least 2 acres within 3 miles.';
   }
  }
  new MutationObserver(syncGate).observe(gate,{attributes:true,attributeFilter:['data-radar-locked']});
  document.addEventListener('radar:vault-state',syncGate);
  syncGate();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
