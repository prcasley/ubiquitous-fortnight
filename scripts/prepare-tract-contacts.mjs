// Resumable research queue. Output remains local until reviewed; never auto-publish contacts.
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {scan} from './scan-oz-nominated-industrial.mjs';
import V from '../assets/radar-contact-verifier.js';
import {fetch,EnvHttpProxyAgent} from 'undici';
const argIndex=process.argv.indexOf('--limit');const limit=argIndex<0?3:Number(process.argv[argIndex+1]);
if(!Number.isInteger(limit)||limit<1||limit>130)throw Error('Choose --limit 1 through 130');
const boundaries=JSON.parse(await readFile('assets/data/nj-nomination-downloads/NJ_OZ2_2026_Nominations.geojson'));
const evidence=JSON.parse(await readFile('assets/data/oz-designation-evidence.json'));
const file='.radar/contact-research.json';await mkdir('.radar',{recursive:true});
let result;try{result=JSON.parse(await readFile(file));}catch(e){if(e.code!=='ENOENT')throw e;result={version:1,tracts:{}};}
const dispatcher=new EnvHttpProxyAgent(),cache=new Map();
const fetcher=async(url,options={})=>{const key=String(url);if(key.includes('data.transportation.gov')&&cache.has(key))return new Response(cache.get(key),{status:200});const r=await fetch(url,{...options,dispatcher,signal:options.signal||AbortSignal.timeout(30000)});if(r.ok&&key.includes('data.transportation.gov')){const text=await r.text();cache.set(key,text);return new Response(text,{status:200});}return r;};
try{let count=0;for(const f of boundaries.features){const id=f.properties.Geography;if(result.tracts[id]?.status==='researched')continue;if(count++>=limit)break;const checkedAt=new Date().toISOString();try{const inventory=await scan({boundaries,evidence,tracts:[id],minAcres:1.5,perTractLimit:5000,totalLimit:5000,fetcher});const contacts=[],errors=[];for(const p of inventory.parcels){try{const found=await V.lookup({...p,id:p.parcelId,state:'NJ'},fetcher);contacts.push(...found.contacts);if(found.complete!==true)errors.push({parcelId:p.parcelId,status:found.status});}catch(e){errors.push({parcelId:p.parcelId,status:e.message});}}
result.tracts[id]={status:inventory.partial||errors.length?'partial':'researched',checkedAt,scope:'Vacant/commercial/industrial assessment classes; 1.5+ acres; active carriers only',parcels:inventory.parcels.length,contacts,errors,inventoryCoverage:inventory.coverage};}catch(e){result.tracts[id]={status:'unavailable',checkedAt,error:e.message};}
await writeFile(file+'.tmp',JSON.stringify(result,null,2),{mode:0o600});await rename(file+'.tmp',file);console.log(id,result.tracts[id].status);}}finally{await dispatcher.close();}
