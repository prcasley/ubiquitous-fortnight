"""Create a local, allowlisted reference bundle; never copy full source records into the app."""
import argparse, json, math
from urllib.parse import urlparse, parse_qs
from pathlib import Path
GROUPS={'florida':'Palm Beach / Mangonia','newJersey':'New Jersey','lakeWorth':'Lake Worth Beach','lakeWorthContext':'Lake Worth surroundings','triCountyMunicipalities':'Tri-county Florida','lakeWorthInventory':'Lake Worth inventory','newFloridaEvidence':'Additional Florida parcels'}
# Deliberately excludes strategy, scores, workflow authority, free-text notes, lease
# references, demo comps, proposed site plans and nested/raw evidence payloads.
FIELDS=('identity','pcn','baseParcelId','state','region','situs','market','municipality','county','acreage','gisAcres','buildingSF','yearBuilt','buildingDescription','propertyUse','dorUseCode','useCode','zoning','futureLandUse','block','lot','landValue','improvementValue','marketValue','lastSaleDate','lastSalePrice','saleQualification','saleVerification','owner','ownerMailing','zoningAuthority')
def text_or_number(v):
 return v if isinstance(v,(str,int,float)) and not isinstance(v,bool) and (not isinstance(v,float) or math.isfinite(v)) else None
def pair(v):return isinstance(v,list) and len(v)>=2 and all(isinstance(x,(int,float)) and not isinstance(x,bool) and math.isfinite(x) for x in v[:2]) and abs(v[0])<=180 and abs(v[1])<=90
def rings(value):
 if isinstance(value,list) and len(value)>=4 and all(pair(p) for p in value):return [[[p[0],p[1]] for p in value]]
 return [r for child in value for r in rings(child)] if isinstance(value,list) else []
def prepare(source):
 b=source['bootstrap'];groups=[];records=[]
 for key,label in GROUPS.items():
  rows=b['acquisition'].get(key,[]);groups.append({'id':key,'label':label,'count':len(rows)})
  for i,row in enumerate(rows):records.append(clean(row,key,i))
 rows=source['constants']['LHV_TARGETS'];groups.append({'id':'lehigh','label':'Lehigh Valley','count':len(rows)})
 records.extend(clean(row,'lehigh',i) for i,row in enumerate(rows))
 municipal=[{'id':str(r['id']),'name':str(r['name']),'rings':rings(r.get('polygons',[]))} for r in b.get('mapOverlays',[])]
 snapshot=b.get('oz2Snapshot',{});oz=[{'geoid':str(r.get('geoid','')),'rings':rings(r.get('rings',[])),'asOf':r.get('sourceAsOf') or snapshot.get('asOf'),'stage':'Historical eligibility reference; nomination/designation not verified'} for r in snapshot.get('features',[])]
 return {'format':'RadarRecoveredReference','version':1,'sourceFile':'Recovered reference map — September 2026','fileGeneratedAt':b.get('generatedAt'),'status':'historical-file-reference','notice':'Recovered uploaded-file observations, not independently reverified. Counts are source observations, not verified distinct parcels. Historical owner/assessment/zoning facts do not establish current title, availability, permission or OZ designation.','groups':groups,'records':records,'municipalOverlays':municipal,'ozReference':oz,'heldOut':['rankings and acquisition strategy','draft risk and redevelopment conclusions','lease and availability references','demo transactions','40 Hilton concept plan and image','raw internal/provenance notes and source-document paths']}
def clean(row,group,index):
 r={k:v for k in FIELDS if (v:=text_or_number(row.get(k))) is not None}
 evidence=row.get('lhvEvidence') or {}
 for key in ['assessmentRecordsForBaseParcel','parcelType','zoningCodeLehigh','lvpcZoningDistrict','buildingShareOfValue','marketSale']:
  value=evidence.get(key)
  if isinstance(value,(str,int,float,bool)):r[key]=value
 for dest,value in [('reportedCoverage',row.get('coverage')),('historicalTract',row.get('tract') or evidence.get('ozTract')),('historicalOZ1Reference',row.get('oz1')),('historicalOZ2Reference',row.get('oz2') if row.get('oz2') is not None else evidence.get('ozEligible'))]:
  if isinstance(value,(str,int,float,bool)):r[dest]=value
 source_url=row.get('parcelSource')
 if isinstance(source_url,str):
  u=urlparse(source_url)
  if u.scheme=='https' and not u.username and not u.password and (u.hostname or '').endswith(('.gov','.us','.arcgis.com')) and not any(any(term in k.lower() for term in ['key','token','password']) for k in parse_qs(u.query)):r['sourceURL']=source_url
 r.update({'archiveKey':group+':'+str(index),'group':group,'point':row.get('point')[:2] if pair(row.get('point')) else None,'rings':rings(row.get('geometryParts',[]))})
 return r
if __name__=='__main__':
 a=argparse.ArgumentParser();a.add_argument('source');a.add_argument('--output',default='.radar/recovered-reference.json');a.add_argument('--lineage-output',default='.radar/recovered-reference-lineage.json');args=a.parse_args();source=json.loads(Path(args.source).read_text());bundle=prepare(source);lineage=Path(args.lineage_output);lineage.parent.mkdir(parents=True,exist_ok=True);lineage.write_text(json.dumps({'sourceFile':source.get('sourceFile'),'sourceSHA256':source.get('sourceSHA256')},indent=2));dest=Path(args.output);dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(json.dumps(bundle,ensure_ascii=False,separators=(',',':')));print(json.dumps({'output':str(dest),'records':len(bundle['records']),'municipalOverlays':len(bundle['municipalOverlays']),'ozReferences':len(bundle['ozReference']),'heldOut':bundle['heldOut']}))
