#!/usr/bin/env node
// Publish full NJ nominated-tract research as one small manifest plus one file per municipality.
// The first four digits of a NJ PAMS_PIN are the municipal code, so the site loads only the town it needs.
// Usage: node scripts/publish-nj-research-shards.mjs --in .radar/oz-research/nj-research-all.json
import {readFile,writeFile,mkdir,rm,rename,mkdtemp} from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const shardKey=id=>{const m=/^(\d{4})_/.exec(String(id||''));return m?m[1]:null;};
export function split(full){
 if(full?.format!=='RadarNJParcelResearch'||full.version!==1||!Array.isArray(full.records)||!full.records.length)throw Error('Use a populated RadarNJParcelResearch v1 file');
 const groups=new Map();
 for(const r of full.records){const key=shardKey(r.parcelId);if(!key||r.state!=='NJ')throw Error('Unexpected parcel identity '+r.parcelId);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
 const seen=new Set();for(const r of full.records){if(seen.has(r.parcelId))throw Error('Repeated parcel '+r.parcelId);seen.add(r.parcelId);}
 const shards={},files={};
 for(const [key,records] of [...groups].sort()){
  const first=records[0].facts||{};
  shards[key]={file:'nj-research/'+key+'.json',records:records.length,municipality:first.MUN_NAME||null,county:first.COUNTY||null,
   onSiteCarriers:records.filter(r=>r.usdotContext?.carrierName).length,epaFacilityParcels:records.filter(r=>r.epaContext?.facilities?.length).length,regulatorySites:records.reduce((n,r)=>n+(r.njdepContext?.sites?.length||0),0)};
  files[key]={format:'RadarNJParcelResearchShard',version:1,shard:key,checkedAt:full.checkedAt,records};
  shards[key].sha256=createHash('sha256').update(JSON.stringify(files[key])+'\n').digest('hex');
 }
 const tracts=new Set(full.records.flatMap(r=>r.tractReferences||[]));
 const quickPicks=full.records.filter(r=>r.usdotContext?.carrierName&&r.facts?.PROP_LOC)
  .sort((a,b)=>(b.usdotContext.status==='ACTIVE')-(a.usdotContext.status==='ACTIVE')||String(b.usdotContext.filingDate||'').localeCompare(String(a.usdotContext.filingDate||'')))
  .slice(0,40).map(r=>({parcelId:r.parcelId,address:r.facts.PROP_LOC,municipality:r.facts.MUN_NAME,carrierName:r.usdotContext.carrierName,status:r.usdotContext.status||null}));
 const manifest={format:'RadarNJParcelResearch',version:2,checkedAt:full.checkedAt,
  coverage:{...full.coverage,tractsWithParcels:tracts.size,municipalities:groups.size},
  totals:{records:full.records.length,assessmentNames:full.records.filter(r=>r.assessmentOwnerObservation?.name).length,
   regulatorySites:full.records.reduce((n,r)=>n+(r.njdepContext?.sites?.length||0),0),onSiteCarriers:full.records.filter(r=>r.usdotContext?.carrierName).length,epaFacilityParcels:full.records.filter(r=>r.epaContext?.facilities?.length).length,namedOnSiteBusiness:full.records.filter(r=>r.usdotContext?.carrierName||r.epaContext?.facilities?.length).length},
  shards,quickPicks,mailingGroups:full.mailingGroups||[],caveat:full.caveat};
 return {manifest,files};
}
export function csvIdentities(text){
 if(typeof text!=='string'||text.length>100000000)throw Error('CSV publication must be under 100 MB');
 let quoted=false,cell='',row=[],ids=[],header=null;const push=()=>{row.push(cell);cell='';};
 const end=()=>{push();if(row.some(v=>v.trim())){if(!header){header=row;if(header[0]!=='PAMS_PIN')throw Error('CSV must lead with exact PAMS_PIN');}else{if(row.length!==header.length)throw Error('CSV column count mismatch');ids.push(row[0]);}}row=[];};
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted)push();else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;end();}else cell+=c;}
 if(quoted)throw Error('Unclosed CSV quote');if(cell||row.length)end();return ids;
}
export async function publish(full,{dataDir=path.join(root,'assets/data'),csvText=null,coverage=null,filingQueue=null,tractCoverage=null,tractCSV=null,move=rename}={}){
 const {manifest,files}=split(full);if(csvText!==null){const ids=csvIdentities(csvText),wanted=new Set(full.records.map(r=>r.parcelId));if(ids.length!==wanted.size||new Set(ids).size!==ids.length||ids.some(id=>!wanted.has(id)))throw Error('CSV and JSON parcel identities do not reconcile');}await mkdir(dataDir,{recursive:true});
 const stage=await mkdtemp(path.join(dataDir,'.nj-enrichment-stage-')),backup=await mkdtemp(path.join(dataDir,'.nj-enrichment-backup-'));
 const names=['nj-research','nj-parcel-research.json'],installed=[],saved=[];
 try{
  await mkdir(path.join(stage,'nj-research'));
  for(const [key,body] of Object.entries(files))await writeFile(path.join(stage,'nj-research',key+'.json'),JSON.stringify(body)+'\n');
  await writeFile(path.join(stage,'nj-parcel-research.json'),JSON.stringify(manifest,null,1)+'\n');
  for(const [name,value] of [['nj-parcel-research.csv',csvText],['nj-enrichment-coverage.json',coverage],['nj-business-filing-queue.json',filingQueue],['nj-tract-coverage.json',tractCoverage],['nj-tract-coverage.csv',tractCSV]])if(value!==null){names.push(name);await writeFile(path.join(stage,name),typeof value==='string'?value:JSON.stringify(value,null,1)+'\n');}
  // Stage every output before swapping; ordinary failures restore the prior complete bundle.
  for(const name of names){try{await move(path.join(dataDir,name),path.join(backup,name));saved.push(name);}catch(e){if(e.code!=='ENOENT')throw e;}await move(path.join(stage,name),path.join(dataDir,name));installed.push(name);}
 }catch(error){for(const name of installed.reverse())await rm(path.join(dataDir,name),{recursive:true,force:true});for(const name of saved.reverse())await rename(path.join(backup,name),path.join(dataDir,name));throw error;}
 finally{await rm(stage,{recursive:true,force:true});await rm(backup,{recursive:true,force:true});}
 return manifest;
}
async function main(){
 const a=process.argv.slice(2),o={};for(let i=0;i<a.length;i++){if(!['--in','--csv','--coverage','--filing-queue','--tract-coverage','--tract-csv'].includes(a[i])||!a[i+1])throw Error('Use --in <full json> with optional --csv, --coverage and --filing-queue');o[a[i].slice(2)]=a[++i];}
 if(!o.in)throw Error('Choose --in <full research json>');
 const full=JSON.parse(await readFile(o.in,'utf8')),manifest=await publish(full,{csvText:o.csv?await readFile(o.csv,'utf8'):null,coverage:o.coverage?JSON.parse(await readFile(o.coverage,'utf8')):null,filingQueue:o['filing-queue']?JSON.parse(await readFile(o['filing-queue'],'utf8')):null,tractCoverage:o['tract-coverage']?JSON.parse(await readFile(o['tract-coverage'],'utf8')):null,tractCSV:o['tract-csv']?await readFile(o['tract-csv'],'utf8'):null});
 console.log(JSON.stringify({municipalities:Object.keys(manifest.shards).length,...manifest.totals}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error('Publish not completed: '+e.message);process.exitCode=1;});
