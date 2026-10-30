/* Bounded retries for read-only GIS queries. Never retry a cancelled or invalid query. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadarGISTransport=api;})(globalThis,root=>{
 'use strict';
 const aborted=()=>new DOMException('Search cancelled','AbortError');
 function delay(ms,signal){return new Promise((resolve,reject)=>{if(signal?.aborted)return reject(aborted());const stop=()=>{clearTimeout(timer);reject(aborted());};const timer=setTimeout(()=>{signal?.removeEventListener('abort',stop);resolve();},ms);signal?.addEventListener('abort',stop,{once:true});});}
 async function request(url,{fetcher=root.fetch,signal,attempts=3,timeoutMs=12000,backoffMs=500,onRetry=()=>{}}={}){
  for(let attempt=0;attempt<attempts;attempt++){
   if(signal?.aborted)throw aborted();const ctrl=new AbortController(),stop=()=>ctrl.abort();signal?.addEventListener('abort',stop,{once:true});const timer=setTimeout(stop,timeoutMs);let retry=true,error;
   try{const response=await fetcher(url,{signal:ctrl.signal,credentials:'omit',mode:'cors'});if(!response.ok){retry=[408,429,500,502,503,504].includes(response.status);throw Error('Public GIS service returned HTTP '+response.status);}
    let data;try{data=await response.json();}catch{throw Error('Public GIS returned an unreadable response');}
    if(data.error){retry=[429,500,502,503,504].includes(Number(data.error.code));throw Error('GIS service: '+(data.error.message||'Query not available'));}return data;
   }catch(e){if(signal?.aborted)throw aborted();error=ctrl.signal.aborted?Error('GIS response timed out'):e;}
   finally{clearTimeout(timer);signal?.removeEventListener('abort',stop);}
   if(!retry||attempt===attempts-1)throw error;
   onRetry({attempt:attempt+1,maxAttempts:attempts,reason:error.message});await delay(backoffMs*2**attempt,signal);
  }
 }
 return {request};
});
