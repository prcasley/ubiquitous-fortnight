#!/usr/bin/env node
// Publish full NJ nominated-tract research as one small manifest plus one file per municipality.
// The first four digits of a NJ PAMS_PIN are the municipal code, so the site loads only the town it needs.
// Usage: node scripts/publish-nj-research-shards.mjs --in .radar/oz-research/nj-research-all.json
import {readFile,writeFile,mkdir,rm,rename} from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
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
 }
 const tracts=new Set(full.records.flatMap(r=>r.tractReferences||[]));
 const quickPicks=full.records.filter(r=>r.usdotContext?.carrierName&&r.facts?.PROP_LOC)
  .sort((a,b)=>(b.usdotContext.status==='ACTIVE')-(a.usdotContext.status==='ACTIVE')||String(b.usdotContext.filingDate||'').localeCompare(String(a.usdotContext.filingDate||'')))
  .slice(0,40).map(r=>({parcelId:r.parcelId,address:r.facts.PROP_LOC,municipality:r.facts.MUN_NAME,carrierName:r.usdotContext.carrierName,status:r.usdotContext.status||null}));
 const manifest={format:'RadarNJParcelResearch',version:2,checkedAt:full.checkedAt,
  coverage:{...full.coverage,tractsWithParcels:tracts.size,municipalities:groups.size},
  totals:{records:full.records.length,assessmentNames:full.records.filter(r=>r.assessmentOwnerObservation).length,
   regulatorySites:full.records.reduce((n,r)=>n+(r.njdepContext?.sites?.length||0),0),onSiteCarriers:full.records.filter(r=>r.usdotContext?.carrierName).length,epaFacilityParcels:full.records.filter(r=>r.epaContext?.facilities?.length).length,namedOnSiteBusiness:full.records.filter(r=>r.usdotContext?.carrierName||r.epaContext?.facilities?.length).length},
  shards,quickPicks,mailingGroups:full.mailingGroups||[],caveat:full.caveat};
 return {manifest,files};
}
async function main(){
 const a=process.argv.slice(2),i=a.indexOf('--in');if(i<0||!a[i+1])throw Error('Choose --in <full research json>');
 const {manifest,files}=split(JSON.parse(await readFile(a[i+1],'utf8')));
 const dataDir=path.join(root,'assets/data'),dir=path.join(dataDir,'nj-research'),tmp=dir+'.tmp';
 await rm(tmp,{recursive:true,force:true});await mkdir(tmp,{recursive:true});
 for(const [key,body] of Object.entries(files))await writeFile(path.join(tmp,key+'.json'),JSON.stringify(body)+'\n');
 await rm(dir,{recursive:true,force:true});await rename(tmp,dir);
 await writeFile(path.join(dataDir,'nj-parcel-research.json'),JSON.stringify(manifest,null,1)+'\n');
 console.log(JSON.stringify({municipalities:Object.keys(files).length,...manifest.totals}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error('Publish not completed: '+e.message);process.exitCode=1;});
