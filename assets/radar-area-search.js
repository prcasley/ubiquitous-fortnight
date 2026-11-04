/* Radius searches near the PA/NJ border query each connected jurisdiction independently. */
(() => {
 'use strict';const $=id=>document.getElementById(id),B=()=>window.PublicRadarBridge;
 async function scan(request={}){
  const b=B(),state=$('stateSelect').value,county=window.PublicRadarCounty,center=b.getSearchCenter(),radius=Number($('radiusSelect').value);
  if(request.scope==='county'||!['PA','NJ'].includes(state))return b.scan(request);
  const dy=radius/69,dx=dy/Math.max(.1,Math.cos(center.lat*Math.PI/180));
  const touches=box=>center.lon+dx>=box[0]&&center.lon-dx<=box[2]&&center.lat+dy>=box[1]&&center.lat-dy<=box[3];
  const pa=Object.entries(window.RadarPA.sources).filter(([,s])=>s.browserAvailable!==false&&touches(s.bounds)).map(([county])=>({state:'PA',county}));
  const cross=state==='PA'?pa.length&&touches(b.getSource('NJ').bounds):pa.length;
  if(!cross)return b.scan(request);
  const targets=[{state,county},...pa,...(state==='PA'?[{state:'NJ',county:''}]:[])],unique=[...new Map(targets.map(t=>[t.state+':'+t.county,t])).values()];
  const rows=[],unknown=[],reports=[];let primary;
  for(const target of unique){
   $('stateSelect').value=target.state;window.PublicRadarCounty=target.county;$('countySelect').value=target.county||'';b.setCenter(center.lat,center.lon);b.setRadius(radius);
   await b.scan(request);const meta=b.getMeta();if(['cancelled','idle'].includes(meta.status))throw Error('Search cancelled; cross-border retrieval stopped');
   if(!primary)primary=b.getSearch();rows.push(...b.getResults());unknown.push(...b.getYearUnknown());reports.push({state:target.state,county:target.county,name:meta.source,url:meta.sourceURL,complete:meta.complete,count:b.getResults().length,message:b.getStatus().message});
  }
  $('stateSelect').value=state;window.PublicRadarCounty=county;$('countySelect').value=county||'';
  const deduped=[...new Map(rows.map(r=>[r.key,r])).values()].sort((a,b)=>a.distance-b.distance),capped=deduped.length>1600;
  if(capped)reports.push({name:'Combined radius safety cap',url:reports[0].url,complete:false,count:1600,message:'Partial: first 1,600 among '+deduped.length+' retrieved parcels; narrow the radius or acreage.'});
  for(const [name,s] of Object.entries(window.RadarPA.sources))if(s.browserAvailable===false&&touches(s.bounds))reports.push({state:'PA',county:name,name:s.name,url:s.url,complete:false,count:0,message:s.unavailableReason});
  b.mergeNearby(deduped.slice(0,1600),reports,primary);b.setYearUnknown(unknown);
  return reports.every(r=>r.complete);
 }
 window.RadarAreaSearch={scan};
})();
