/* Executive-facing hosted summaries. Authentication and provider credentials stay on the server. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id),bridge=()=>window.PublicRadarBridge;
  let available=false,busy=false,controller=null;
  function tell(text){$('assistantStatus').textContent=text;}
  function buttons(){
    const button=$('explainResults');
    button.hidden=!available;
    if($('assistantDisclosure'))$('assistantDisclosure').hidden=!available;
    button.disabled=!available||busy||!(bridge()?.getMeta()?.complete||bridge()?.getMeta()?.status==='partial')||!bridge()?.getVisible()?.length;
    button.textContent=busy?'Preparing summary…':'Explain these results';
  }
  function log(text,sourceURL){
    const row=document.createElement('div');row.className='agent-message bot';row.textContent=text;
    if(sourceURL){const citation=document.createElement('details'),label=document.createElement('summary'),link=document.createElement('a');label.textContent='Data source';link.href=sourceURL;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Official data layer (technical source)';citation.append(label,link);row.append(citation);}
    const host=$('agentLog');host.append(row);host.scrollTop=host.scrollHeight;
  }
  async function explain(question='Summarize these public parcel results, their limitations, and the next source checks.'){
    if(busy)return;
    const meta=bridge()?.getMeta(),rows=bridge()?.getVisible()||[];
    if(!available){tell('Result summaries are not available right now. Search and source links remain available.');return;}
    if(!(meta?.complete||meta?.status==='partial')||!meta?.time||!rows.length){tell('Retrieve parcel results before requesting a summary.');return;}
    busy=true;controller=new AbortController();const current=controller;
    const snapshotId=meta.scanId;
    buttons();tell('Preparing a summary from the current public records…');
    const timer=setTimeout(()=>current.abort(),25000);
    try{
      const response=await fetch('/api/radar-agent',{method:'POST',credentials:'same-origin',signal:current.signal,
        headers:{'content-type':'application/json'},body:JSON.stringify({question,sourceURL:meta.sourceURL,
          retrievedAt:meta.time,scanComplete:meta.complete,scanStatus:meta.status,totalCount:rows.length,unverifiedCriteria:meta.unverified||[],
          records:rows.slice(0,25).map(row=>({id:row.id,key:row.key,jurisdiction:row.jurisdiction,address:row.address,state:row.state,type:row.type,acres:row.acres,yearBuilt:row.yearBuilt}))})});
      if(!response.ok)throw Error('summary-unavailable');
      const result=await response.json();
      if(current.signal.aborted||snapshotId!==bridge().getMeta().scanId)return;
      if(result.generated!==true||typeof result.answer!=='string'||result.sourceURL!==meta.sourceURL)throw Error('invalid-summary');
      const sampling=result.sampleCount<result.recordCount?` Summary uses ${result.sampleCount} of ${result.recordCount} visible records; it is not an exhaustive ranking.`:'';
      const qualification=meta.unverified?.length?'\nCandidates only: '+meta.unverified.join(', ')+' remain unverified.':'';
      log('Radar summary'+(!meta.complete?' — PARTIAL RESULTS; more parcels may exist':'')+'\n'+result.answer+'\n'+result.caveat+sampling+qualification+'\nSource records retrieved '+meta.time+'.',meta.sourceURL);
      tell('Summary ready. Verify facts using the linked source records.'+sampling);
    }catch{
      if(snapshotId===bridge().getMeta().scanId)tell('A summary could not be prepared. Your search results and source links remain available.');
    }finally{clearTimeout(timer);if(controller===current){busy=false;controller=null;buttons();}}
  }
  async function init(){
    if(!$('explainResults'))return;
    $('explainResults').addEventListener('click',()=>explain());
    document.addEventListener('radar:scan-state',()=>{
      if(controller){controller.abort();controller=null;busy=false;}
      tell(available?'Select Explain these results for retrieved results (partial searches are labeled).':'Search returns property cards here. Open satellite views or add properties to a field trip.');buttons();
    });
    $('textFilter').addEventListener('input',()=>{controller?.abort();buttons();});
    try{
      const response=await fetch('/api/radar-agent/status',{credentials:'same-origin',signal:AbortSignal.timeout(5000)});
      if(response.ok)available=(await response.json()).available===true;
    }catch{/* A static deployment still supports deterministic search. */}
    tell(available?'Select Explain these results for retrieved results (partial searches are labeled).':'Search returns property cards here. Open satellite views or add properties to a field trip.');buttons();
  }
  window.PublicRadarAssistant={isAvailable:()=>available,explain};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
