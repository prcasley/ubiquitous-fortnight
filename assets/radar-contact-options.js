/* Reviewed contacts, current carrier matches and research leads share the same parcel card. */
(()=>{
 'use strict';
 const cache=new Map(),node=(tag,value)=>{const el=document.createElement(tag);el.textContent=value||'';return el;};
 const V=()=>window.RadarContactVerifier;
 let prepared;
 function records(){
  return prepared??=fetch('assets/data/reviewed-contacts.json').then(r=>{
   if(!r.ok)throw Error('Prepared contacts unavailable');
   return r.json();
  }).catch(()=>({contacts:[]}));
 }
 async function check(record,{signal}={}){
  const fetcher=signal?(url,options)=>fetch(url,{...options,signal:AbortSignal.any([signal,options.signal])}):undefined;
  const result=await V().lookup(record,fetcher);
  if(!signal?.aborted)cache.set(record.key,result);
  return result;
 }
 function link(label,href){
  const a=node('a',label);a.href=href;a.target='_blank';a.rel='noopener noreferrer';return a;
 }
 function facilityLeads(record){
  const data=window.RadarNJPublicResearch;
  if(record.state!=='NJ'||!data)return [];
  const verified=(data.epa(record)||[]).map(row=>({company:row.name,reason:'EPA facility record',sourceUrl:row.sourceURL}));
  for(const row of data.regulatory(record)?.sites||[]){
   if(row.insideParcel===true&&row.siteName)verified.push({company:row.siteName,reason:'NJDEP site inside the parcel',sourceUrl:row.sourceURL});
  }
  return verified;
 }
 function render(host,record,footer){
  host.replaceChildren();
  const state=node('p'),list=node('div'),research=node('div');
  state.setAttribute('role','status');
  const evidence=node('div');evidence.className='live-contact-sources';(footer||host).append(evidence);
  let reviewed=[],result=cache.get(record.key),problem='';
  const sourceUrl=url=>window.RadarExecutiveCardCore.https(url);
  const companyKey=label=>String(label||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  function show(){
   list.replaceChildren();research.replaceChildren();evidence.replaceChildren();
   const seen=new Set();
   for(const contact of [...reviewed,...result?.contacts||[]]){
    const v=V().verify(record,contact),key=companyKey(contact.company);
    if(!v.fields.length||seen.has(key))continue;
    seen.add(key);
    const box=node('section');
    box.append(node('strong',contact.company),node('p',contact.role));
    if(contact.filingDate){
     const filing=node('p',v.filing.status==='old'?'Old federal filing ('+v.filing.date+') · confirm before calling':v.filing.date?'Federal filing dated '+v.filing.date:'Federal filing date unknown');
     filing.className='contact-filing'+(v.filing.status==='old'?' contact-filing-old':'');box.append(filing);
    }
    for(const f of v.fields){
     const digits=String(f.value).replace(/\D/g,'').replace(/^1(?=\d{10}$)/,'');
     const a=node('a',f.type==='phone'?'Call '+digits.replace(/^(\d{3})(\d{3})(\d{4})$/,'$1-$2-$3'):'Email '+f.value);
     a.className='executive-call';a.href=f.type==='phone'?'tel:'+digits:'mailto:'+f.value;box.append(a);
     evidence.append(link(contact.company+' · '+f.type+' source',f.sourceUrl));
    }
    list.append(box);
   }
   const hasOtherContact=host.parentElement?.querySelector('.executive-contact-actions a:is([href^="tel:"],[href^="mailto:"])');
   state.textContent=problem||(seen.size||hasOtherContact?'':result?'No contact found yet':'');
   const leads=[...(result?.leads||[]),...facilityLeads(record)];
   for(const lead of leads){
    const key=companyKey(lead.company),url=sourceUrl(lead.sourceUrl);
    if(!key||!url||seen.has(key)||research.childElementCount>=5)continue;
    seen.add(key);
    const date=V().filingAge(lead.filingDate).date;
    const box=node('div');
    box.append(link(lead.company,url),node('p',lead.reason+(date?' · filed '+date:'')+' · verify before outreach'));
    research.append(box);
   }
   if(state.textContent&&record.state==='NJ'){
    const address=V().parcel(record).address;
    const hasNumber=/^\d/.test(String(address||'').trim());
    const name=hasNumber?[address,record.municipality,record.state].filter(Boolean).join(', '):Number.isFinite(record.lat)&&Number.isFinite(record.lon)?record.lat+','+record.lon:'';
    research.append(link('Check NJ business filings','https://www.njportal.com/DOR/BusinessNameSearch/'));
    if(name)research.append(link(hasNumber?'Find businesses at the parcel address':'Open parcel location for business research','https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(name)));
   }
  }
  host.append(list,state);
  if(window.RadarContactMode==='live'){
   const button=node('button','Check current business contacts');button.type='button';button.className='executive-call';
   host.append(button);
   button.onclick=async()=>{
    button.disabled=true;problem='';state.textContent='Checking federal carrier records…';
    try{result=await check(record);show();}
    catch{problem='Contact source temporarily unavailable. Try again.';show();}
    finally{button.disabled=false;}
   };
  }else host.append(link('View all 130 tracts and research progress','contact-coverage.html'));
  host.append(research);
  records().then(data=>{reviewed=(data.contacts||[]).filter(c=>c.parcelId===record.id);if(!host.querySelector('button:disabled'))show();});
  if(record.state==='NJ')window.RadarNJPublicResearch?.ensure(record).then(()=>{if(!host.querySelector('button:disabled'))show();});
 }
 window.RadarContactOptions={render,check,hasChecked:record=>cache.has(record.key)};
})();
