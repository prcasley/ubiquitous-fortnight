#!/usr/bin/env node
// Batch-only NJ scan. Runtime UI and its source adapters are deliberately untouched.
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import path from 'node:path';import {fileURLToPath} from 'node:url';import * as turf from '@turf/turf';
import I from '../assets/radar-oz-inventory-core.js';
import {rawAcres} from './apply-mapped-acreage.mjs';
const acreageBasis='mapped-geometry';
export const PRIORITY=['34017012800','34015500400','34027046107','34039030400','34039030600','34039032300','34017010900','34017011000'];
export const PREVIOUS=['34023007103','34023980000'];
export const SOURCE=I.parcelURL;
export const FIELDS=[...I.fields,'OWNER_NAME','ST_ADDRESS','CITY_STATE','ZIP_CODE'];
export function plan(boundaries,{tracts=[],remaining=false}={}){
 if(boundaries?.type!=='FeatureCollection'||boundaries.features?.length!==130)throw Error('Expected the reviewed 130-tract NJ boundary file');
 const byId=new Map(boundaries.features.map(f=>[f.properties?.Geography,f]));if(byId.size!==130||[...byId.keys()].some(id=>!/^34\d{9}$/.test(id)))throw Error('Invalid or repeated tract identity');
 for(const id of tracts)if(!byId.has(id))throw Error('Tract absent from supplied boundary file: '+id);
 const chosen=tracts.length?tracts:[...byId.keys()].filter(id=>!remaining||!PREVIOUS.includes(id));
 return [...new Set([...PRIORITY.filter(id=>chosen.includes(id)),...chosen])].map(id=>byId.get(id));
}
export async function query(url,params,{fetcher=fetch,attempts=3}={}){
 for(let attempt=0;attempt<attempts;attempt++){
  try{const response=await fetcher(url+(params?'/query':'?f=json'),{credentials:'omit',signal:AbortSignal.timeout(35000),...(params?{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({f:'json',...params}).toString()}:{})});
   if(!response.ok){const e=Error('GIS HTTP '+response.status);e.retry=[408,429,500,502,503,504].includes(response.status);throw e;}
   const data=await response.json();if(data.error){const e=Error('GIS source error '+data.error.code);e.retry=[408,429,500,502,503,504].includes(Number(data.error.code));throw e;}return data;
  }catch(e){if(attempt===attempts-1||e.retry===false)throw e;await new Promise(r=>setTimeout(r,300*2**attempt));}
 }
}
export async function collect(feature,{minAcres=2,classes=['1','4A','4B'],limit=10000,countsOnly=false,fetcher=fetch,metadata=null}={}){
 if(!Number.isFinite(minAcres)||minAcres<0||!Number.isSafeInteger(limit)||limit<1||limit>100000||!classes.length||classes.some(c=>!['1','4A','4B'].includes(c)))throw Error('Invalid business-target scan criteria');
 const checkedAt=new Date().toISOString(),tract=feature.properties.Geography;
 const scope={where:"PROP_CLASS IN ("+classes.map(c=>"'"+c+"'").join(',')+")",geometry:JSON.stringify(I.esriPolygon(feature.geometry)),geometryType:'esriGeometryPolygon',inSR:'4326',spatialRel:'esriSpatialRelIntersects'};
 const opts={fetcher},meta=metadata||await query(SOURCE,null,opts),known=new Set(meta.fields?.map(f=>f.name));
 const oid=meta.objectIdField||meta.objectIdFieldName||meta.fields?.find(f=>f.type==='esriFieldTypeOID')?.name;
 if(!known.has(oid)||!FIELDS.every(f=>known.has(f)))throw Error('NJ assessment/mailing schema changed');
 const fields=[...new Set([oid,...FIELDS,...(known.has('CONFID_FLG')?['CONFID_FLG']:[])])];
 const {count}=await query(SOURCE,{...scope,returnCountOnly:'true',returnGeometry:'false'},opts);
 if(!Number.isSafeInteger(count)||count<0||count>500000)throw Error('Invalid or unbounded parcel count');
 const report={tract,municipality:feature.properties.Municipality,county:feature.properties.County,checkedAt,criteria:{classes,minAcres,acreageBasis},candidateCount:count,candidatesChecked:0,expected:0,received:0,status:'complete',countsOnly,oidField:oid,features:[]};
 if(count===0||countsOnly&&minAcres===0){report.expected=count;return report;}
 const listed=await query(SOURCE,{...scope,returnIdsOnly:'true',returnGeometry:'false'},opts),ids=listed.objectIds;
 if(!Array.isArray(ids)||ids.length!==count||new Set(ids).size!==count||ids.some(id=>!Number.isSafeInteger(id)))throw Error('Parcel IDs/count do not reconcile');
 const chosen=ids.sort((a,b)=>a-b).slice(0,limit),seen=new Set();
 for(let offset=0;offset<chosen.length;offset+=100){const batch=chosen.slice(offset,offset+100),data=await query(SOURCE,{...scope,f:'geojson',objectIds:batch.join(','),outFields:fields.join(','),returnGeometry:'true',outSR:'4326',orderByFields:oid+' ASC',resultRecordCount:String(batch.length)},opts);
  if(data.exceededTransferLimit||!Array.isArray(data.features)||data.features.length!==batch.length)throw Error('Explicit parcel batch truncated');
  for(const f of data.features){const id=f.properties?.[oid],pin=f.properties?.PAMS_PIN;
   if(!batch.includes(id)||seen.has(id)||!/^\d{4}_[^_\s]+_[^_\s]+(?:_[^\s]+)?$/.test(pin)||!classes.includes(String(f.properties.PROP_CLASS)))throw Error('Foreign/repeated parcel identity or criteria mismatch');
   I.esriPolygon(f.geometry);if(!turf.booleanIntersects(f,feature))throw Error('Returned parcel misses requested tract');seen.add(id);
   const size=rawAcres(f.geometry);
   if(!Number.isFinite(size)||size<=0)throw Error('Unmeasurable parcel geometry');
   report.candidatesChecked++;
   if(size<minAcres)continue;
   report.received++;
   if(!countsOnly){
    const properties=Object.fromEntries(fields.map(k=>[k,f.properties[k]??null]));
    const original=properties.CALC_ACRE;
    properties.CALC_ACRE_PUBLISHED=original!=null&&original!==''&&Number.isFinite(Number(original))?Number(original):null;
    properties.CALC_ACRE=properties.MAPPED_ACRES=Math.round(size*1000)/1000;
    properties.ACREAGE_BASIS=acreageBasis;
    report.features.push({type:'Feature',geometry:f.geometry,properties});
   }
  }
 }
 const after=await query(SOURCE,{...scope,returnCountOnly:'true',returnGeometry:'false'},opts);if(after.count!==count)throw Error('Source count changed during retrieval');
 if(report.candidatesChecked!==count){report.status='partial';report.expected=null;}
 else report.expected=report.received;
 return report;
}
async function main(){const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),args=process.argv.slice(2),o={tracts:[]};
 for(let i=0;i<args.length;i++){const a=args[i];if(['--remaining','--counts-only','--force'].includes(a))o[a.slice(2)]=true;else if(a==='--tract')o.tracts.push(args[++i]);else if(['--out','--min-acres','--geojson','--limit-per-tract'].includes(a))o[a.slice(2)]=args[++i];else throw Error('Unknown option '+a);}
 const boundaries=JSON.parse(await readFile(o.geojson||path.join(root,'assets/data/nj-nomination-downloads/NJ_OZ2_2026_Nominations.geojson'))),selected=plan(boundaries,{tracts:o.tracts,remaining:o.remaining});
 const dest=path.resolve(o.out||path.join(root,'.radar/nj-enrichment/scans'));if(!dest.startsWith(path.join(root,'.radar')+path.sep))throw Error('Scan checkpoints must remain in .radar');await mkdir(dest,{recursive:true});
 const {fetch:request,EnvHttpProxyAgent}=await import('undici'),dispatcher=new EnvHttpProxyAgent(),fetcher=(u,opts)=>request(u,{...opts,dispatcher});
 try{const metadata=await query(SOURCE,null,{fetcher});let failed=0;
  for(const f of selected){const id=f.properties.Geography,file=path.join(dest,id+'.json');if(!o.force)try{const old=JSON.parse(await readFile(file));if(old.tract===id&&old.status==='complete'&&old.criteria.acreageBasis===acreageBasis&&old.criteria.minAcres===Number(o['min-acres']??2)&&old.countsOnly===!!o['counts-only']&&Date.now()-Date.parse(old.checkedAt)<7*86400000){console.log(id+' cached');continue;}}catch{}
   let report;try{report=await collect(f,{fetcher,metadata,minAcres:Number(o['min-acres']??2),countsOnly:!!o['counts-only'],limit:Number(o['limit-per-tract']??10000)});report.countsOnly=!!o['counts-only'];}catch(e){failed++;report={tract:id,status:'unavailable',attemptedAt:new Date().toISOString(),message:e.message,features:[]};}
   const target=report.status==='unavailable'?file+'.attempt.json':file,tmp=target+'.tmp';await writeFile(tmp,JSON.stringify(report));await rename(tmp,target);console.log(id+' '+report.status+' '+(report.received??0)+'/'+(report.expected??'?')+' qualifying; '+(report.candidatesChecked??0)+'/'+(report.candidateCount??'?')+' candidates checked');
  }if(failed)process.exitCode=2;
 }finally{await dispatcher.close();}}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1;});
