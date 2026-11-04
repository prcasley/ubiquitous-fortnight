/* Automatic published owner names. After every scan, owner names are read in batches from the same
   county record each parcel came from, and earlier recovered research fills gaps. Names are public
   assessment observations: not verified title, and no mailing or contact fields are requested. */
(() => {
 'use strict';
 const B=()=>window.PublicRadarBridge,S=()=>window.RadarPublicData;let archive=null,run=0;
 function loadArchive(){if(!archive)archive=fetch('assets/data/recovered-reference.json',{credentials:'omit'}).then(r=>r.ok?r.json():null).then(d=>{const m=new Map();for(const x of d?.records||[])if(x.owner){const id=String(x.identity||'').split(':').slice(1).join(':');m.set(x.state+':'+id,{owner:String(x.owner).slice(0,400),saleDate:x.lastSaleDate||null,generatedAt:d.fileGeneratedAt||null});}return m;}).catch(()=>new Map());return archive;}
 const text=r=>{const o=r.publishedOwner;if(o?.status==='published')return 'Owner of record: '+o.publishedName+' ('+o.sourceName+', checked '+String(o.retrievedAt).slice(0,10)+'). Assessment name, not verified title.';
   if(r.archiveOwner)return 'Owner in earlier research: '+r.archiveOwner.owner+' (recovered file dated '+(r.archiveOwner.generatedAt||'unknown')+'; not re-verified). '+(o?.status==='not-published'&&r.state==='NJ'?'NJ\'s statewide layer does not publish names; check county tax records for a current name.':'');
   if(o?.status==='not-published')return r.state==='NJ'?'NJ\'s statewide parcel layer leaves the owner name blank for every property class. The county tax record below shows the current owner.':'The county record does not publish an owner name for this parcel. No owner was inferred.';
   if(o?.status==='conflicting')return 'The county returned conflicting owner names; open the property to review.';
   if(o?.status==='checking')return 'Reading the owner of record…';
   if(o?.status==='no-match')return 'The county assessment record did not return this parcel number, so no assessment name is shown. No owner was inferred.';
   if(o)return 'Owner lookup unavailable right now ('+(o.message||o.status)+'). Use "Look up published owner" to retry.';return null;};
 // NJ: the state layer blanks OWNER_NAME for every class (Daniel's Law), and the county tax board
 // search does not allow automated access, so Radar links the exact record for a person to open.
 const njLink=r=>{const o=r.original||{};const mun=String(o.PCL_MUN||'').match(/^\d{4}$/)?.[0];if(r.state!=='NJ'||!mun)return null;
   return {href:'https://tax1.co.monmouth.nj.us/cgi-bin/prc6.cgi?menu=index&ms_user=ctb12&district='+mun+'&mode=11',label:'Open the county tax record (Block '+(o.PCLBLOCK||'?')+', Lot '+(o.PCLLOT||'?')+(o.PCLQCODE?', Qual '+o.PCLQCODE:'')+')'};};
 const njFacts=r=>{const o=r.original||{};if(r.state!=='NJ')return '';const bits=[];const sp=Number(o.SALE_PRICE);if(sp>0)bits.push(sp<=1000?'last recorded deed for a nominal $'+sp.toLocaleString('en-US')+' (not a market sale)':'last recorded sale $'+sp.toLocaleString('en-US'));
   const d=String(o.DEED_DATE||'');if(/^\d{6}$/.test(d))bits.push('deed dated '+d.slice(2,4)+'/'+d.slice(4,6)+'/'+(Number(d.slice(0,2))>50?'19':'20')+d.slice(0,2));if(o.DEED_BOOK)bits.push('deed book '+o.DEED_BOOK+(o.DEED_PAGE?' page '+o.DEED_PAGE:''));
   return bits.length?' Published in the state record: '+bits.join(', ')+'.':'';};
 // Tax-bill mailing-address clusters (NJ publishes the mailing address even though it blanks the name).
 // Only nonresidential classes; only the mailing city/state is shown, never the street line.
 const NONRES=/^(1|4A|4B|4C|5A|5B|15[A-F])$/i;let clusters=new Map();
 const mailKey=r=>{const o=r.original||{};if(r.state!=='NJ'||!NONRES.test(String(o.PROP_CLASS||'')))return null;const st=String(o.ST_ADDRESS||'').toUpperCase().replace(/\b(STE|SUITE|UNIT|FL|FLOOR|RM|ROOM|#)\s*[\w-]+\b/g,'').replace(/[^A-Z0-9 ]/g,' ').replace(/\bSTREET\b/g,'ST').replace(/\bAVENUE\b/g,'AVE').replace(/\bROAD\b/g,'RD').replace(/\bBOULEVARD\b/g,'BLVD').replace(/\s+/g,' ').trim();const zip=String(o.ZIP5||o.ZIP_CODE||'').slice(0,5);return st&&zip?st+'|'+zip:null;};
 function buildClusters(rows){clusters=new Map();for(const r of rows){const k=mailKey(r);if(!k)continue;if(!clusters.has(k))clusters.set(k,[]);clusters.get(k).push(r.key);}}
 const clusterText=r=>{const k=mailKey(r),g=k&&clusters.get(k);if(!g||g.length<2)return '';const city=String(r.original?.CITY_STATE||'').trim();return ' '+(g.length-1)+' other parcel'+(g.length>2?'s':'')+' in this search share'+(g.length>2?'':'s')+' this tax-bill mailing address'+(city?' (mail goes to '+city+')':'')+'. A shared mailing address suggests, but does not prove, common ownership.';};
 const registry=r=>{const o=r.publishedOwner;if(o?.status!=='published'||o.classification!=='organization-style')return null;if(r.state==='FL')return {href:'https://search.sunbiz.org/Inquiry/CorporationSearch/SearchResults?inquiryType=EntityName&searchNameOrder='+encodeURIComponent(o.publishedName.replace(/[^A-Z0-9]/gi,''))+'&searchTerm='+encodeURIComponent(o.publishedName),label:'Look up '+o.publishedName+' on Sunbiz (Florida business registry)'};return null;};
 function paint(){const rows=new Map(B().getResults().map(r=>[r.key,r]));for(const card of document.querySelectorAll('.chat-property-card[data-parcel-key]')){const r=rows.get(card.dataset.parcelKey)||B().getRecord?.(card.dataset.parcelKey);const t=r&&text(r);const node=card.querySelector('.chat-owner-observation');if(!t||!node)continue;node.textContent=t+(r.publishedOwner?.status!=='checking'?njFacts(r):'');
   node.textContent+=clusterText(r);const l=r.publishedOwner?.status!=='published'&&njLink(r)||registry(r);if(l){const a=document.createElement('a');a.href=l.href;a.target='_blank';a.rel='noopener noreferrer';a.textContent=l.label;a.className='chat-owner-tax-link';a.style.display='block';node.append(' ',a);}}}
 async function fill(){
  const id=++run,rows=B().getResults().slice(0,1600);if(!rows.length)return;
  for(const r of rows)if(!r.publishedOwner)r.publishedOwner={status:'checking'};paint();
  const [names,arch]=await Promise.all([S()?.lookupOwners?S().lookupOwners(rows).catch(()=>new Map()):new Map(),loadArchive()]);
  if(id!==run)return;
  for(const r of rows){const o=names.get(r.key);if(o)r.publishedOwner=o;else if(r.publishedOwner?.status==='checking')r.publishedOwner=null;
   const a=arch.get(r.state+':'+r.id);if(a)r.archiveOwner=a;
   const name=r.publishedOwner?.status==='published'?r.publishedOwner.publishedName:r.archiveOwner?.owner||null;if(name&&!r.owner)r.owner=name;}
  buildClusters(rows);
  try{B().restoreOwnerObservations?.({});}catch{} // re-renders the results list and owner groups once with the new names
  paint();document.dispatchEvent(new CustomEvent('radar:owners-updated',{detail:{count:rows.filter(r=>r.owner).length,total:rows.length}}));
 }
 window.RadarOwnerAuto={fill,text,paint,njLink,njFacts,clusterText,mailKey,registry,buildClusters};
 const init=()=>{let t=null;const soon=()=>{clearTimeout(t);t=setTimeout(fill,250);};document.addEventListener('radar:scan-complete',soon);document.addEventListener('radar:scan-state',e=>{if(e.detail?.state==='partial')soon();}); // partial scans still show rows, so they get names too
 new MutationObserver(()=>paint()).observe(document.getElementById('agentLog')||document.body,{childList:true,subtree:false});};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
