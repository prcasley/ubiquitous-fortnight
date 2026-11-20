#!/usr/bin/env node
// Final publication step for the NJ research bundle: correct acreage from parcel geometry and drop lots under the minimum.
//
// The parcel service's CALC_ACRE holds square feet or other units for some municipalities. For every record this
// measures the mapped polygon, screens on its full area, and corrects published figures when they
// differ by more than 25% or fall on the wrong side of the threshold. Manifest, shards, CSV, tract coverage, enrichment role counts and the filing
// queue are rewritten together so the bundle still reconciles.
//
// Usage: node scripts/apply-mapped-acreage.mjs [--min-acres 2] [--keep-file <json list of PAMS_PINs>] [--check]
import {readFile,writeFile,readdir,rm} from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
import * as turf from '@turf/turf';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const DIVERGENCE=0.25;
export const rawAcres=geometry=>turf.area({type:'Feature',geometry,properties:{}})/4046.8564;
export const mappedAcres=geometry=>Math.round(rawAcres(geometry)*1000)/1000;
/** Effective acreage for one record. Idempotent: a record already corrected keeps its original published figure. */
export function acreage(record){
 const published=Object.hasOwn(record.facts,'CALC_ACRE_PUBLISHED')?record.facts.CALC_ACRE_PUBLISHED:Number(record.facts.CALC_ACRE??0),raw=rawAcres(record.geometry),mapped=Math.round(raw*1000)/1000;
 const divergent=raw>0&&(!Number.isFinite(published)||Math.abs(published-raw)/raw>DIVERGENCE);
 const useMapped=divergent||record.facts.ACREAGE_BASIS==='mapped-geometry'&&raw>0;
 return {published,mapped,divergent,effective:useMapped?mapped:published,basis:useMapped?'mapped-geometry':'published'};
}
export function correct(records,{minAcres=2,keep=new Set()}={}){
 const kept=[],dropped=[];
 for(const record of records){
  const a=acreage(record),raw=rawAcres(record.geometry);
  const below=(raw>0?raw:a.effective)<minAcres;
  if(raw>0&&(a.effective<minAcres)!==below){a.effective=a.mapped;a.basis='mapped-geometry';}
  if(below&&!keep.has(record.parcelId)){dropped.push({parcelId:record.parcelId,published:a.published,mapped:a.mapped});continue;}
  const facts={...record.facts,CALC_ACRE:a.effective,CALC_ACRE_PUBLISHED:a.published,MAPPED_ACRES:a.mapped,ACREAGE_BASIS:a.basis};
  if(below)facts.BELOW_MINIMUM_ACRES=true;
  else delete facts.BELOW_MINIMUM_ACRES;
  kept.push({...record,facts});}
 return {kept,dropped};
}
const active=r=>r.usdotContext?.carrierName&&r.usdotContext.status==='ACTIVE';
const callable=r=>active(r)&&/^\+?\d{10,15}$/.test(String(r.usdotContext.businessPhone||'').replace(/[^\d+]/g,''));
const emailable=r=>active(r)&&/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(r.usdotContext.email||'');
export function tractRow(row,records,minAcres=2){
 const rs=records.filter(r=>r.tractReferences.includes(row.tract)&&Number(r.facts.CALC_ACRE)>=minAcres&&!r.facts.BELOW_MINIMUM_ACRES),n=f=>rs.filter(f).length;
 return {...row,parcels2acPlus:rs.length,acres:Math.round(rs.reduce((s,r)=>s+Number(r.facts.CALC_ACRE||0),0)*100)/100,
  taxBillMailing:n(r=>r.mailingObservation?.mailing?.street||r.evidence?.some(e=>e.role==='tax_mailing_recipient')),
  njdepSites:rs.reduce((s,r)=>s+r.njdepContext.sites.length,0),njdepProgramNames:rs.reduce((s,r)=>s+r.njdepContext.interests.length,0),
  onSiteCarriers:n(r=>r.usdotContext?.carrierName),activeOnSiteCarriers:n(active),carrierPhone:n(callable),carrierEmail:n(emailable),
  epaFacilityParcels:n(r=>r.epaContext?.facilities?.length),namedOnSiteBusiness:n(r=>r.usdotContext?.carrierName||r.epaContext?.facilities?.length)};
}
function csvRows(text){const rows=[];let quoted=false,cell='',row=[];const push=()=>{row.push(cell);cell='';};
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted)push();else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;push();if(row.some(v=>v!==''))rows.push(row);row=[];}else cell+=c;}
 if(cell||row.length){push();rows.push(row);}return rows;}
const csvCell=v=>{const s=String(v??'');return /[",\n\r]/.test(s)?'"'+s.replaceAll('"','""')+'"':s;};
export function csvPrune(text,byId){const rows=csvRows(text),header=rows[0];if(header[0]!=='PAMS_PIN')throw Error('CSV must lead with PAMS_PIN');
 const extra=['ACRES','ACRES_PUBLISHED_FIELD','ACRES_MAPPED','ACREAGE_BASIS'],base=header.filter(h=>!extra.includes(h)),index=base.map(h=>header.indexOf(h));
 const out=[[...base,...extra]];for(const row of rows.slice(1)){const r=byId.get(row[0]);if(!r)continue;out.push([...index.map(i=>row[i]),r.facts.CALC_ACRE,r.facts.CALC_ACRE_PUBLISHED,r.facts.MAPPED_ACRES,r.facts.ACREAGE_BASIS]);}
 return out.map(r=>r.map(csvCell).join(',')).join('\n')+'\n';}
export async function run({dataDir=path.join(root,'assets/data'),minAcres=2,keep=new Set(),check=false}={}){
 const read=async name=>JSON.parse(await readFile(path.join(dataDir,name),'utf8')),manifest=await read('nj-parcel-research.json');
 const shards={};let all=[];for(const [key,meta] of Object.entries(manifest.shards)){shards[key]=await read(meta.file);all.push(...shards[key].records);}
 const {kept,dropped}=correct(all,{minAcres,keep}),byId=new Map(kept.map(r=>[r.parcelId,r])),gone=new Set(dropped.map(d=>d.parcelId));
 const summary={records:all.length,kept:kept.length,dropped:dropped.length,corrected:kept.filter(r=>r.facts.ACREAGE_BASIS==='mapped-geometry').length,keptBelowMinimum:kept.filter(r=>r.facts.BELOW_MINIMUM_ACRES).length,
  acresPublishedField:Math.round(all.reduce((s,r)=>s+Number(r.facts.CALC_ACRE_PUBLISHED??r.facts.CALC_ACRE??0),0)),acres:Math.round(kept.filter(r=>!r.facts.BELOW_MINIMUM_ACRES).reduce((s,r)=>s+r.facts.CALC_ACRE,0))};
 if(check)return summary;
 const nextShards={};
 for(const [key,file] of Object.entries(shards)){const records=file.records.filter(r=>byId.has(r.parcelId)).map(r=>byId.get(r.parcelId));
  if(!records.length){await rm(path.join(dataDir,manifest.shards[key].file),{force:true});continue;}
  const body={...file,records},text=JSON.stringify(body)+'\n';await writeFile(path.join(dataDir,manifest.shards[key].file),text);
  nextShards[key]={...manifest.shards[key],records:records.length,onSiteCarriers:records.filter(r=>r.usdotContext?.carrierName).length,activeOnSiteCarriers:records.filter(active).length,
   epaFacilityParcels:records.filter(r=>r.epaContext?.facilities?.length).length,regulatorySites:records.reduce((n,r)=>n+(r.njdepContext?.sites?.length||0),0),sha256:createHash('sha256').update(text).digest('hex')};}
 const tracts=new Set(kept.flatMap(r=>r.tractReferences||[]));
 // Quick picks lead to a call sheet, so only active carrier filings qualify.
 const quickPicks=kept.filter(r=>active(r)&&r.facts?.PROP_LOC).sort((a,b)=>String(b.usdotContext.filingDate||'').localeCompare(String(a.usdotContext.filingDate||''))).slice(0,40)
  .map(r=>({parcelId:r.parcelId,address:r.facts.PROP_LOC,municipality:r.facts.MUN_NAME,carrierName:r.usdotContext.carrierName,status:r.usdotContext.status}));
 const mailingGroups=(manifest.mailingGroups||[]).map(g=>{const ids=g.parcelIds.filter(id=>byId.has(id));return {...g,parcelIds:ids,keys:(g.keys||[]).filter(id=>byId.has(id)),sourceDates:Object.fromEntries(Object.entries(g.sourceDates||{}).filter(([id])=>byId.has(id)))};}).filter(g=>g.parcelIds.length>1);
 const next={...manifest,coverage:{...manifest.coverage,tractsWithParcels:tracts.size,municipalities:Object.keys(nextShards).length,
   acreage:{rule:'Mapped acreage controls the '+minAcres+'-acre screen. It replaces the published field when the values disagree on qualification or differ by more than 25%. Reviewed contacts may be retained below threshold.',...summary}},
  totals:{...manifest.totals,records:kept.length,assessmentNames:kept.filter(r=>r.assessmentOwnerObservation?.name).length,regulatorySites:kept.reduce((n,r)=>n+(r.njdepContext?.sites?.length||0),0),
   onSiteCarriers:kept.filter(r=>r.usdotContext?.carrierName).length,activeOnSiteCarriers:kept.filter(active).length,inactiveCarrierFilings:kept.filter(r=>r.usdotContext?.carrierName&&!active(r)).length,
   epaFacilityParcels:kept.filter(r=>r.epaContext?.facilities?.length).length,namedOnSiteBusiness:kept.filter(r=>r.usdotContext?.carrierName||r.epaContext?.facilities?.length).length,mappedAcres:summary.acres},
  shards:nextShards,quickPicks,mailingGroups};
 await writeFile(path.join(dataDir,'nj-parcel-research.json'),JSON.stringify(next,null,1)+'\n');
 await writeFile(path.join(dataDir,'nj-parcel-research.csv'),csvPrune(await readFile(path.join(dataDir,'nj-parcel-research.csv'),'utf8'),byId));
 const coverage=await read('nj-tract-coverage.json');coverage.criteria='Class 1/4A/4B parcels of at least '+minAcres+' acres by mapped geometry';
 coverage.tracts=coverage.tracts.map(row=>tractRow(row,kept,minAcres));await writeFile(path.join(dataDir,'nj-tract-coverage.json'),JSON.stringify(coverage,null,1)+'\n');
 const columns=Object.keys(coverage.tracts[0]);await writeFile(path.join(dataDir,'nj-tract-coverage.csv'),[columns.join(','),...coverage.tracts.map(t=>columns.map(k=>csvCell(t[k])).join(','))].join('\n')+'\n');
 try{const enrichment=await read('nj-enrichment-coverage.json'),roles={};for(const r of kept)for(const e of r.evidence||[])roles[e.role]=(roles[e.role]||0)+1;
  enrichment.roleCounts=Object.fromEntries(Object.keys(enrichment.roleCounts).map(k=>[k,roles[k]||0]));enrichment.acreage=next.coverage.acreage;await writeFile(path.join(dataDir,'nj-enrichment-coverage.json'),JSON.stringify(enrichment,null,1)+'\n');}catch(e){if(e.code!=='ENOENT')throw e;}
 try{const queue=await read('nj-business-filing-queue.json');queue.entities=queue.entities.map(e=>({...e,parcelIds:e.parcelIds.filter(id=>!gone.has(id))})).filter(e=>e.parcelIds.length);await writeFile(path.join(dataDir,'nj-business-filing-queue.json'),JSON.stringify(queue,null,1)+'\n');}catch(e){if(e.code!=='ENOENT')throw e;}
 return summary;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const a=process.argv.slice(2),get=k=>a.includes(k)?a[a.indexOf(k)+1]:null,keepFile=get('--keep-file');
 const reviewed=JSON.parse(await readFile(path.join(root,'assets/data/reviewed-contacts.json'),'utf8')).contacts.map(c=>c.parcelId);
 const keep=new Set([...reviewed,...(keepFile?JSON.parse(await readFile(keepFile,'utf8')):[])]);
 console.log(JSON.stringify(await run({minAcres:Number(get('--min-acres')||2),keep,check:a.includes('--check')})));
}
