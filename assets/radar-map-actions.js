/* Map shortcuts that work in Simple and All-tools view:
   - Right-click (or long-press) the map: "Identify property here" runs parcel identification at that
     point without turning on the toolbar's Identify mode; also offers Street View.
   - RadarMapActions.retrieve(address): runs the address through Ask Radar so the standard property card
     (address, acres, land/building split, owner or carrier, officers, Call/Email) appears in the visible panel. */
(()=>{'use strict';
 function retrieve(address){const box=document.getElementById('agentPrompt'),form=document.getElementById('agentForm');if(!box||!form||!address)return false;
  if(document.body.dataset.radarMode!=='advanced')document.getElementById('workspace-tab-scan')?.click();
  box.value=address;form.requestSubmit?form.requestSubmit():form.dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}));
  box.scrollIntoView({block:'center',behavior:'smooth'});return true;}
 function menu(map,latlng){const wrap=document.createElement('div');wrap.className='radar-map-menu';wrap.setAttribute('role','menu');
  const item=(text,fn)=>{const b=document.createElement('button');b.type='button';b.className='radar-map-menu-item';b.setAttribute('role','menuitem');b.textContent=text;b.addEventListener('click',()=>{map.closePopup();fn();});wrap.append(b);return b;};
  const first=item('🔍 Identify property here',()=>window.PublicRadarGeo?.identifyAt(latlng.lat,latlng.lng));
  item('🛣️ Street View here',()=>window.open('https://www.google.com/maps/@?api=1&map_action=pano&viewpoint='+latlng.lat+','+latlng.lng,'_blank','noopener'));
  L.popup({closeButton:true,autoPan:true,className:'radar-map-menu-popup'}).setLatLng(latlng).setContent(wrap).openOn(map);setTimeout(()=>first.focus(),30);}
 function init(){const map=window.PublicRadarBridge?.getMap?.();if(!map||!window.L){setTimeout(init,300);return;}
  map.on('contextmenu',e=>{e.originalEvent?.preventDefault?.();menu(map,e.latlng);});}
 window.RadarMapActions={retrieve,menu};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
