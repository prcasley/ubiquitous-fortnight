/* Map expansion and source coverage. This code has no hosting or AI dependencies. */
(() => {
  const $=id=>document.getElementById(id);
  function init(){
    const button=$('expandMap'),panel=$('mapPanel');if(!button||!panel)return;
    function expand(value){document.body.classList.toggle('map-expanded',value);button.setAttribute('aria-expanded',String(value));button.textContent=value?'Close expanded map':'Expand map';setTimeout(()=>window.PublicRadarBridge.getMap()?.invalidateSize(),30);if(!value)button.focus();}
    button.addEventListener('click',()=>expand(!document.body.classList.contains('map-expanded')));
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('map-expanded'))expand(false);});
    const host=$('freeSourceCoverage');if(host)for(const source of Object.values(window.RadarPublicData.sources)){
      const row=document.createElement('p');row.textContent=source.name+' — '+source.status+'. No provider account/key required for the public service.';host.append(row);
    }
    const search=document.querySelector('.radar-agent'),sidebar=document.querySelector('.workbench-sidebar'),scanner=$('scanner');
    const mobile=window.matchMedia('(max-width:900px)');
    const prompt=$('agentPrompt'),desktopPlaceholder='Industrial 5+ acres in Edison, NJ';
    function arrangeSearch(){const log=$('agentLog'),scroll=log.scrollTop;prompt.placeholder=mobile.matches?'5+ acres in Edison, NJ':desktopPlaceholder;if(mobile.matches)scanner.prepend(search);else sidebar.prepend(search);requestAnimationFrame(()=>{const board=log.dataset.scrollAnchor==='board'?[...log.querySelectorAll('.board-summary')].at(-1):null;log.scrollTop=board?board.offsetTop-log.offsetTop:scroll;});setTimeout(()=>window.PublicRadarBridge.getMap()?.invalidateSize(),30);}
    mobile.addEventListener('change',arrangeSearch);arrangeSearch();
    $('mobileNav')?.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{$('mobileNav').open=false;}));
    setTimeout(()=>window.PublicRadarBridge.getMap()?.invalidateSize(),30);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
