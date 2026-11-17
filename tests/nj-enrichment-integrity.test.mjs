import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {csvIdentities} from '../scripts/publish-nj-research-shards.mjs';

test('published NJ enrichment reconciles manifest, shard hashes, source roles, CSV and 128-tract ledger',async()=>{
 const base=new URL('../assets/data/',import.meta.url),manifest=JSON.parse(await readFile(new URL('nj-parcel-research.json',base))),coverage=JSON.parse(await readFile(new URL('nj-enrichment-coverage.json',base)));
 assert.equal(manifest.version,2);assert.equal(coverage.selectedTracts,128);assert.equal(coverage.requestedTracts.length,130);assert.equal(new Set(coverage.requestedTracts.map(t=>t.tract)).size,130);
 const ids=new Set(),roles={};let assessed=0,regulatory=0,carriers=0;
 const allowed=new Set(['assessed_owner','tax_mailing_recipient','njdep_regulatory_site','njdep_program_interest','usdot_carrier','usdot_carrier_officer','epa_facility_reference','business_filing_entity','state_registered_agent','business_filing_contact']);
 for(const [key,meta] of Object.entries(manifest.shards)){
  assert.equal(meta.file,'nj-research/'+key+'.json');const bytes=await readFile(new URL(meta.file,base));assert.equal(createHash('sha256').update(bytes).digest('hex'),meta.sha256);
  const shard=JSON.parse(bytes);assert.equal(shard.records.length,meta.records);
  for(const r of shard.records){assert.ok(r.parcelId.startsWith(key+'_'));assert.equal(r.facts.PAMS_PIN,r.parcelId);assert.ok(!ids.has(r.parcelId));ids.add(r.parcelId);assert.ok(['1','4A','4B'].includes(r.facts.PROP_CLASS));
   if(r.assessmentOwnerObservation?.name)assessed++;regulatory+=r.njdepContext.sites.length;if(r.usdotContext?.carrierName)carriers++;
   assert.ok(Array.isArray(r.evidence));for(const e of r.evidence){assert.ok(allowed.has(e.role));roles[e.role]=(roles[e.role]||0)+1;assert.ok(e.value);assert.equal(new URL(e.sourceURL).protocol,'https:');assert.ok(Number.isFinite(Date.parse(e.checkedAt))&&Date.parse(e.checkedAt)<=Date.now());if(e.role==='assessed_owner')assert.equal(e.value,r.assessmentOwnerObservation?.name);if(e.role==='tax_mailing_recipient')assert.ok(e.value.street&&!/^(UNKNOWN|N\/A|NULL)$/i.test(e.value.street));if(e.role==='usdot_carrier_officer')assert.equal(e.company,r.usdotContext.carrierName);}
   if(!r.assessmentOwnerObservation?.name)assert.equal(r.evidence.some(e=>e.role==='assessed_owner'),false);
  }
 }
 assert.equal(ids.size,manifest.totals.records);assert.equal(assessed,manifest.totals.assessmentNames);assert.equal(regulatory,manifest.totals.regulatorySites);assert.equal(carriers,manifest.totals.onSiteCarriers);
 for(const [role,n] of Object.entries(coverage.roleCounts))assert.equal(roles[role]||0,n);
 const csv=csvIdentities(await readFile(new URL('nj-parcel-research.csv',base),'utf8'));assert.equal(csv.length,ids.size);assert.equal(new Set(csv).size,ids.size);assert.ok(csv.every(id=>ids.has(id)));
 for(const group of manifest.mailingGroups){assert.ok(group.mailing.street&&!/^UNKNOWN$/i.test(group.mailing.street));assert.equal(new Set(group.parcelIds).size,group.parcelIds.length);assert.ok(group.parcelIds.every(id=>ids.has(id)));}
});
