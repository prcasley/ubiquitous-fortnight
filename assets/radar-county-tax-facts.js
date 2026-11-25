/* County tax-list facts: zoning, last recorded deed, recorded sale price and last year's taxes, as published by a
   county Tax Board for one block and lot. Parcel facts only: the county pages used here publish no owner name.
   Shown under "Parcel details" on the card, with the county record link and the date it was read. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else{root.RadarCountyTaxFacts=api;api.start(root);}})(typeof self!=='undefined'?self:globalThis,function(){
  'use strict';
  const clean=v=>{const s=String(v??'').replace(/\s+/g,' ').trim();return /^(n\/a|na|\/|0|0\.00)?$/i.test(s)?'':s;};
  const money=v=>{const n=Number(String(v).replace(/[$,]/g,''));return clean(v)&&Number.isFinite(n)&&n>0?'$'+n.toLocaleString('en-US',{minimumFractionDigits:Number.isInteger(n)?0:2,maximumFractionDigits:2}):'';};
  const date=v=>{const m=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(clean(v));if(!m)return '';const d=new Date(Date.UTC(+m[3],+m[1]-1,+m[2]));/* reject dates that do not exist instead of letting them roll over */return Number.isNaN(+d)||d.getUTCMonth()!==+m[1]-1||d.getUTCDate()!==+m[2]?'':d.toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'});};
  // Label/value rows for one parcel. A blank or placeholder value is left out; nothing is interpreted or inferred.
  function rows(f){
    if(!f||typeof f!=='object')return [];
    const out=[],book=/^(\w+)\/(\w+)$/.exec(clean(f.deedBookPage)),deed=[date(f.deedDate),book?'Book '+book[1]+', page '+book[2]:''].filter(Boolean).join(' · ');
    if(clean(f.zone))out.push(['Zoning (county tax list)',clean(f.zone)]);
    if(deed)out.push(['Last recorded deed',deed]);
    if(money(f.salePrice))out.push(['Recorded sale price',money(f.salePrice)+(clean(f.nonusableCode)?' · county non-usable code '+clean(f.nonusableCode):'')]);
    if(money(f.lastYearTaxes))out.push(["Last year's taxes",money(f.lastYearTaxes)]);
    if(clean(f.landDescription))out.push(['Land description',clean(f.landDescription)]);
    if(clean(f.buildingDescription))out.push(['Building description',clean(f.buildingDescription)]);
    if(/^(1[89]|20)\d{2}$/.test(clean(f.yearBuilt)))out.push(['Year built',clean(f.yearBuilt)]);
    return out;
  }
  const https=u=>{try{const x=new URL(u);return x.protocol==='https:'?x.href:null;}catch{return null;}};
  function start(root){
    const doc=root.document;if(!doc||typeof root.fetch!=='function')return;
    let data=null;
    const node=(tag,text,cls)=>{const e=doc.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;};
    function decorate(card){
      const technical=card.querySelector(':scope > .executive-technical');if(!data||!technical||technical.querySelector(':scope > .county-tax-facts'))return;
      const record=root.PublicRadarBridge?.getRecord?.(card.dataset.executiveKey);if(!record||record.state!=='NJ')return;
      const entry=data.records?.[record.id],list=rows(entry);if(!list.length)return;
      const box=node('section',null,'county-tax-facts');box.append(node('h4',data.source?.name||'County tax list'));
      const dl=node('dl');for(const [label,value] of list)dl.append(node('dt',label),node('dd',value));box.append(dl);
      const url=https(entry.url);if(url){const a=node('a','Open this county record');a.href=url;a.target='_blank';a.rel='noopener noreferrer';box.append(a);}
      box.append(node('small','Read '+(root.RadarTime?.plain?.(entry.retrievedAt)||entry.retrievedAt||'date unavailable')+'. The county page publishes no owner name; a recorded price is not an asking price.'));
      technical.querySelector(':scope > summary')?.after(box);
    }
    const scan=()=>{for(const card of doc.querySelectorAll('.executive-parcel'))decorate(card);};
    root.fetch('assets/data/nj-county-tax-list-facts.json',{credentials:'omit',cache:'no-cache'}).then(r=>r.ok?r.json():null).then(d=>{
      if(!d||d.format!=='RadarCountyTaxListFacts'||!d.records)return;data=d;scan();
      new MutationObserver(scan).observe(doc.body,{subtree:true,childList:true});
    }).catch(()=>{});
  }
  return {rows,start};
});
