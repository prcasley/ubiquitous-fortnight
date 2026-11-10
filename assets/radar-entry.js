/* The typed code unlocks the contact file in memory; no code is stored anywhere.
   After unlocking, the contacts (not the code) are kept for this browser tab, so a refresh stays open.
   Lock clears them. */
(()=>{'use strict';const root=document.documentElement,gate=document.getElementById('accessGate'),form=document.getElementById('accessForm');
function show(){root.removeAttribute('data-radar-locked');gate.hidden=true;requestAnimationFrame(()=>window.PublicRadarBridge?.getMap()?.invalidateSize());}
form.addEventListener('submit',async e=>{e.preventDefault();const input=document.getElementById('accessPassword'),button=form.querySelector('button');button.disabled=true;try{await window.RadarExecutiveVault.unlockExecutiveContactVault(input.value.trim().toUpperCase());show();}catch(err){document.getElementById('accessError').textContent=/not found|failed to fetch|network/i.test(String(err?.message||''))?'The contact file is unavailable right now. Please try again shortly.':'Code not recognized. Please try again.';}finally{input.value='';button.disabled=false;}});
function lock(){window.RadarExecutiveVault?.lockExecutiveContactVault();root.setAttribute('data-radar-locked','');gate.hidden=false;document.getElementById('accessPassword').focus();}
function resume(){if(window.RadarExecutiveVault?.restoreVaultSession?.())show();}
window.RadarEntry={lock};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',resume);else resume();document.addEventListener('DOMContentLoaded',()=>document.getElementById('lockRadar')?.addEventListener('click',lock));})();
