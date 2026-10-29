/* Measured public geometry proxies; never floor area, paved-yard detection or legal access. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadarSiteSignals=api;})(globalThis,root=>{
 'use strict';
 const sources={buildings:{name:'OpenStreetMap building footprints · © OpenStreetMap contributors (ODbL)',url:'https://overpass-api.de/api/interpreter',limit:200},roads:{name:'NJ public road centerlines',url:'https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/ArcGIS/rest/services/Tran_road/FeatureServer/0',fields:['PRIMENAME','SHLD_TYPE','SHLD_NUM','SRI'],geometry:'esriGeometryPolyline',limit:800}};
 const metadata=new Map(),buildingLanes=[Promise.resolve()];let nextLane=0;
 async function read(url,fetcher,signal){const r=await fetcher(url,{signal,credentials:'omit',mode:'cors'});if(!r.ok)throw Error('Public geometry HTTP '+r.status);const d=await r.json();if(d.error)throw Error(d.error.message);return d;}
 function corridor(p){const name=String(p.PRIMENAME||'').toUpperCase(),num=String(p.SHLD_NUM||'').trim(),type=String(p.SHLD_TYPE||'').toUpperCase();if(num==='287'&&type==='INT')return 'I-287';if(num==='1'&&type==='US')return 'US Route 1';if(/TURNPIKE/.test(name)&&!/(?:RAMP|^FR |^TO )/.test(name))return 'NJ Turnpike';return null;}
 const batchCache=new Map(),mirrors=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter'];
 async function prepareBuildings(records,{fetcher=root.fetch,geo=root.turf,signal,convert=root.osmtogeojson,timeoutMs=12000}={}){
  const base=r=>({kind:'buildings',parcelKey:r.key,source:sources.buildings.name,sourceURL:mirrors[0],checkedAt:new Date().toISOString(),caveat:'Mapped OSM roof/ground footprints, clipped to the parcel; mapping may omit buildings. Not floor area, pavement, usable yard, vacancy or net buildable land.'});
  const unavailable=(r,reason)=>({...base(r),status:'unavailable',reason});
  if(records.length>25)return Object.fromEntries(records.map(r=>[r.key,unavailable(r,'Choose at most 25 parcels for a bounded building batch.')]));
  const valid=[],answer={};for(const r of records){try{if(!['Polygon','MultiPolygon'].includes(r.geometry?.geometry?.type)||!(geo.area(r.geometry)>0))throw Error('A measurable parcel polygon is required');const b=geo.bbox(r.geometry);if(b.some(x=>!Number.isFinite(x))||b[2]-b[0]>.1||b[3]-b[1]>.1)throw Error('Parcel bounds exceed the footprint batch limit');valid.push({r,b});}catch(e){answer[r.key]=unavailable(r,e.message);}}
  if(!valid.length)return answer;if(typeof convert!=='function')return {...answer,...Object.fromEntries(valid.map(({r})=>[r.key,unavailable(r,'Building geometry converter unavailable')]))};
  const bounds=[...new Set(valid.map(({b})=>[b[1],b[0],b[3],b[2]].map(v=>v.toFixed(7)).join(',')))].sort(),cacheKey=bounds.join(';');
  const previous=buildingLanes[0];let release;buildingLanes[0]=new Promise(resolve=>{release=resolve;});
  let data=null,problem='Building source unavailable',sourceURL=mirrors[0];
  try{await previous;if(signal?.aborted)throw Error('Building batch cancelled');const cached=batchCache.get(cacheKey);if(cached&&Date.now()-cached.at<600000){data=cached.data;sourceURL=cached.sourceURL;}
   if(!data){const query='[out:json][timeout:10][maxsize:16777216];('+bounds.map(b=>'way["building"]["building"!="no"]('+b+');relation["building"]["building"!="no"]('+b+');').join('')+');out meta geom;';
    for(const url of mirrors){if(signal?.aborted)break;const ctrl=new AbortController(),cancel=()=>ctrl.abort();signal?.addEventListener('abort',cancel,{once:true});const timer=setTimeout(cancel,timeoutMs);
     try{const response=await fetcher(url,{method:'POST',body:new URLSearchParams({data:query}),signal:ctrl.signal,credentials:'omit',mode:'cors'});if(!response.ok)throw Error('Building batch HTTP '+response.status);const raw=await response.json();if(raw.remark||!Array.isArray(raw.elements)||raw.elements.length>2000)throw Error('Building batch incomplete, timed out or exceeded 2,000 source elements');const converted=convert(raw,{flatProperties:true});if(!Array.isArray(converted.features))throw Error('Building batch conversion failed');const features=converted.features.filter(f=>f.properties?.building&&f.properties.building!=='no');if(features.some(f=>f.properties?.tainted||!['Polygon','MultiPolygon'].includes(f.geometry?.type)))throw Error('Building batch contained incomplete geometry');data={features,dates:[...new Set(raw.elements.map(e=>e.timestamp).filter(Boolean))]};sourceURL=url;batchCache.set(cacheKey,{at:Date.now(),data,sourceURL});while(batchCache.size>12)batchCache.delete(batchCache.keys().next().value);break;}
     catch(e){problem=signal?.aborted?'Building batch cancelled':ctrl.signal.aborted?'Building batch timed out at both/available sources':e.message;}
     finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
    }
   }
   for(const {r} of valid){if(signal?.aborted){answer[r.key]=unavailable(r,'Building batch cancelled');continue;}if(!data){answer[r.key]=unavailable(r,problem+'; no per-parcel retries were queued.');continue;}try{const clipped=data.features.map(f=>geo.intersect(geo.featureCollection([r.geometry,f]))).filter(Boolean);if(!clipped.length){answer[r.key]=unavailable(r,'No intersecting mapped buildings in the batch; missing mapping is not zero coverage or vacancy.');continue;}if(clipped.length>200)throw Error('Parcel exceeds the 200-footprint measurement limit');const union=clipped.length>1?geo.union(geo.featureCollection(clipped)):clipped[0];answer[r.key]={...base(r),sourceURL,status:'complete',footprintSqft:geo.area(union)*10.7639104167,coveragePercent:Math.min(100,geo.area(union)/geo.area(r.geometry)*100),buildingCount:clipped.length,imageryDates:[],dataSources:['© OpenStreetMap contributors · ODbL; one combined shortlist query, mapping may be incomplete'],licenseURL:'https://www.openstreetmap.org/copyright',sourceEditDates:data.dates};}catch(e){answer[r.key]=unavailable(r,e.message);}}
  }catch(e){for(const {r} of valid)answer[r.key]=unavailable(r,e.message);}finally{release();}
  return answer;
 }
 async function check(record,kind,{fetcher=root.fetch,geo=root.turf,signal,convert=root.osmtogeojson}={}){
  const source=sources[kind];if(!source)throw Error('Unsupported site signal');
  const base={kind,parcelKey:record.key,source:source.name,sourceURL:source.url,checkedAt:new Date().toISOString(),caveat:kind==='buildings'?'Mapped roof/ground footprints only, clipped to the parcel. Not total floor area, pavement, usable yard, vacancy or net buildable land. OSM mapping may omit buildings, so mapped coverage can understate roof coverage. Source dates and completeness vary.':'Straight-line distance to mapped highway centerlines, not an interchange, legal driveway, truck route or travel time.'};
  if(kind==='roads'&&record.state!=='NJ')return {...base,status:'unavailable',reason:'Named NJ corridor adapter does not cover this state.'};
  const ctrl=new AbortController(),abort=()=>ctrl.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();const timer=setTimeout(abort,20000);let releaseBuilding=null;
  try{
   if(!['Polygon','MultiPolygon'].includes(record.geometry?.geometry?.type))throw Error('Parcel polygon required for reliable site geometry');
   if(!(geo.area(record.geometry)>0))throw Error('Parcel polygon has no measurable area');
   if(kind==='buildings'){
    // Serialize public Overpass traffic, even while other parcel services run in parallel.
    const lane=nextLane++%buildingLanes.length,previous=buildingLanes[lane];buildingLanes[lane]=new Promise(resolve=>{releaseBuilding=resolve;});await previous;if(ctrl.signal.aborted)throw new DOMException('Cancelled','AbortError');
    if(typeof convert!=='function')throw Error('Building geometry converter unavailable');
    const b=geo.bbox(record.geometry);if(b.some(x=>!Number.isFinite(x))||b[2]-b[0]>.1||b[3]-b[1]>.1)throw Error('Parcel bounds exceed the bounded footprint request');
    const bbox=[b[1],b[0],b[3],b[2]].join(','),query='[out:json][timeout:15][maxsize:8388608];(way["building"]["building"!="no"]('+bbox+');relation["building"]["building"!="no"]('+bbox+'););out meta geom;';
    const response=await fetcher(source.url,{method:'POST',body:new URLSearchParams({data:query}),signal:ctrl.signal,credentials:'omit',mode:'cors'});
    if(!response.ok)throw Error('OSM footprint service HTTP '+response.status);
    const osm=await response.json();if(osm.remark||!Array.isArray(osm.elements)||osm.elements.length>source.limit)throw Error('OSM footprint response timed out, exceeded its limit or was incomplete');
    const d=convert(osm,{flatProperties:true});if(!Array.isArray(d.features))throw Error('OSM footprint conversion failed');
    const buildings=d.features.filter(f=>f.properties?.building&&f.properties.building!=='no');
    if(buildings.some(f=>f.properties?.tainted||!['Polygon','MultiPolygon'].includes(f.geometry?.type)))throw Error('OSM building geometry incomplete; no coverage calculated');
    const clipped=buildings.map(f=>geo.intersect(geo.featureCollection([record.geometry,f]))).filter(Boolean);
    if(!clipped.length)return {...base,status:'unavailable',reason:'No intersecting OSM building footprints. Unmapped buildings, vacancy or zero coverage cannot be inferred.'};
    const union=clipped.length>1?geo.union(geo.featureCollection(clipped)):clipped[0],area=geo.area(union),parcelArea=geo.area(record.geometry);
    return {...base,status:'complete',footprintSqft:area*10.7639104167,coveragePercent:Math.min(100,area/parcelArea*100),buildingCount:clipped.length,imageryDates:[],dataSources:['© OpenStreetMap contributors · ODbL; mapping may be incomplete'],licenseURL:'https://www.openstreetmap.org/copyright',sourceEditDates:[...new Set(osm.elements.map(e=>e.timestamp).filter(Boolean))]};
   }
   if(!metadata.has(source.url))metadata.set(source.url,read(source.url+'?f=json',fetcher,ctrl.signal).catch(e=>{metadata.delete(source.url);throw e;}));
   const meta=await metadata.get(source.url);if(meta.geometryType!==source.geometry||source.fields.some(f=>!(meta.fields||[]).some(x=>x.name===f)))throw Error('Public geometry schema changed');
   const bounds=kind==='buildings'?geo.bbox(record.geometry):geo.bbox(geo.circle([record.lon,record.lat],5,{units:'miles'}));
   const geometry={xmin:bounds[0],ymin:bounds[1],xmax:bounds[2],ymax:bounds[3],spatialReference:{wkid:4326}};
   const params={f:'json',where:kind==='roads'?"(SHLD_NUM IN ('287','1') OR UPPER(PRIMENAME) LIKE '%TURNPIKE%')":"STATE_FIPS='"+({NJ:'34',FL:'12',PA:'42'}[record.state]||'')+"'",geometry:JSON.stringify(geometry),geometryType:'esriGeometryEnvelope',inSR:'4326',spatialRel:'esriSpatialRelIntersects'};
   const query=extras=>source.url+'/query?'+new URLSearchParams({...params,...extras});
   const count=await read(query({returnCountOnly:'true',returnGeometry:'false'}),fetcher,ctrl.signal);
   if(!Number.isInteger(count.count)||count.count<0||count.count>source.limit)throw Error('Public geometry count exceeds the verified retrieval limit; narrow the search.');
   const d=await read(query({f:'geojson',outFields:source.fields.join(','),outSR:'4326',returnGeometry:'true',resultRecordCount:String(source.limit)}),fetcher,ctrl.signal);
   if(!Array.isArray(d.features)||d.exceededTransferLimit||d.features.length!==count.count)throw Error('Public geometry response was incomplete');
   const distances={};for(const f of d.features){const name=corridor(f.properties||{});if(!name)continue;if(!['LineString','MultiLineString'].includes(f.geometry?.type))throw Error('Unexpected road geometry');const lines=f.geometry.type==='LineString'?[f.geometry.coordinates]:f.geometry.coordinates;for(const coords of lines){const distance=geo.pointToLineDistance([record.lon,record.lat],geo.lineString(coords),{units:'miles'});if(distance<=5)distances[name]=Math.min(distances[name]??Infinity,distance);}}
   return {...base,status:'complete',corridors:distances,nearestMiles:Object.keys(distances).length?Math.min(...Object.values(distances)):null};
  }catch(e){return {...base,status:'unavailable',reason:signal?.aborted?'Site-data check cancelled':ctrl.signal.aborted?'Site-data check timed out':e.message};}
  finally{releaseBuilding?.();clearTimeout(timer);signal?.removeEventListener('abort',abort);}
 }
 return {sources,check,corridor,prepareBuildings};
});
