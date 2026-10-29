/* Courtesy screen only. Static files remain public; server authentication is required for access control. */
(() => {
 'use strict';const key='capital-radar-entry-v1',root=document.documentElement,gate=document.getElementById('accessGate');
 function unlock(){root.removeAttribute('data-radar-locked');gate.hidden=true;try{sessionStorage.setItem(key,'entered');}catch{}requestAnimationFrame(()=>window.PublicRadarBridge?.getMap()?.invalidateSize());}
 function lock(){try{sessionStorage.removeItem(key);}catch{}root.setAttribute('data-radar-locked','');gate.hidden=false;document.getElementById('accessPassword').value='';document.getElementById('accessError').textContent='';document.getElementById('accessPassword').focus();window.scrollTo(0,0);}
 document.getElementById('accessForm').addEventListener('submit',e=>{e.preventDefault();if(document.getElementById('accessPassword').value==='WP123'){unlock();document.getElementById('accessPassword').value='';}else document.getElementById('accessError').textContent='Password not recognized. Please try again.';});
 try{if(sessionStorage.getItem(key)==='entered')unlock();}catch{}
 window.RadarEntry={lock};document.addEventListener('DOMContentLoaded',()=>document.getElementById('lockRadar')?.addEventListener('click',lock));
})();
