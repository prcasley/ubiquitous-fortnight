/* Local display preference only; no data is transmitted. */
(() => {
 'use strict';let size=17;try{const saved=Number(localStorage.getItem('capital-radar-font-size'));if([15,17,19,21,23].includes(saved))size=saved;}catch{}
 const apply=()=>{document.documentElement.style.setProperty('--radar-font-size',size+'px');const status=document.getElementById('textSizeStatus');if(status)status.textContent=size+'px';setTimeout(()=>window.PublicRadarBridge?.getMap()?.invalidateSize(),30);};
 function change(step){size=Math.max(15,Math.min(23,size+step*2));apply();try{localStorage.setItem('capital-radar-font-size',String(size));}catch{}}
 window.RadarReadability={change};
 function init(){document.getElementById('textSmaller').addEventListener('click',()=>change(-1));document.getElementById('textLarger').addEventListener('click',()=>change(1));document.querySelectorAll('[data-how-to-read]').forEach(a=>a.addEventListener('click',()=>{document.getElementById('researchNotice').open=true;}));apply();}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
