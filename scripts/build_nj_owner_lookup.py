#!/usr/bin/env python3
"""Local-only NJ commercial assessment evidence. Never infer owners from facilities or shared mail.
Uses the public NJGIN schema; raw exports are deliberately outside the published assets tree.
"""
from __future__ import annotations
import argparse,csv,datetime as dt,json,math,os,re,tempfile,urllib.parse,urllib.request
from decimal import Decimal,InvalidOperation
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
ROOT=Path(__file__).resolve().parents[1]
LAYER='https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/ArcGIS/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0'
COUNTIES='Atlantic|Bergen|Burlington|Camden|Cape May|Cumberland|Essex|Gloucester|Hudson|Hunterdon|Mercer|Middlesex|Monmouth|Morris|Ocean|Passaic|Salem|Somerset|Sussex|Union|Warren'.split('|')
FIELDS=['PAMS_PIN','PROP_CLASS','PROP_LOC','CALC_ACRE','NET_VALUE','MUN_NAME','COUNTY','PCL_MUN','PCLBLOCK','PCLLOT','PCLQCODE','OWNER_NAME','ST_ADDRESS','CITY_STATE','ZIP_CODE','DEED_BOOK','DEED_PAGE','DEED_DATE','SALE_PRICE']
ENTITY=re.compile(r'\b(?:LLC|L\.?L\.?C\.?|INC\.?|CORP(?:ORATION)?\.?|LTD\.?|LLP|LP|AUTHORITY|COUNTY|CITY OF|STATE OF)\b',re.I)
def organization(value):return bool(ENTITY.search(str(value or ''))) and not re.search(r'\b(?:FAMILY|REVOCABLE|LIVING|PERSONAL)\s+TRUST\b',str(value),re.I)
def source_url(value):
    try:
        u=urllib.parse.urlparse(str(value));return str(value) if u.scheme=='https' and u.hostname and not u.username and not u.password else None
    except ValueError:return None
def date_value(value):
    try:
        value=str(value or '')[:10];d=dt.date.fromisoformat(value)
        return value if d<=dt.datetime.now(dt.timezone.utc).date() else None
    except ValueError:return None
def pin(municipality,block,lot,qualifier=''):
    m=str(municipality).strip();b=str(block).strip();l=str(lot).strip();q=str(qualifier or '').strip()
    if not re.fullmatch(r'\d{1,4}',m) or not b or not l:return None
    def component(v):
        if re.fullmatch(r'\d+(?:\.\d+)?',v):return format(Decimal(v).normalize(),'f')
        return v
    if any('_' in v or len(v)>80 for v in (b,l,q)):return None
    return m.zfill(4)+'_'+component(b)+'_'+component(l)+('_'+q if q else '')
def valid_pin(value):return bool(re.fullmatch(r'\d{4}_[^_\s]+_[^_\s]+(?:_[^\s]+)?',str(value)))
def mail_key(m):
    if not m or not all(m.get(k) for k in ['street','cityState','zip']) or not re.fullmatch(r'\d{5}(?:-?\d{4})?',m['zip']):return None
    def norm(v):
        v=str(v).upper()
        for a,b in [('STREET','ST'),('AVENUE','AVE'),('ROAD','RD'),('BOULEVARD','BLVD'),('SUITE','STE')]:v=re.sub(r'\b'+a+r'\b',b,v)
        return re.sub(r'[^A-Z0-9]','',v)
    return '|'.join([norm(m['street']),norm(m['cityState']),m['zip'][:5]])
def read(url,params=None,post=False):
    body=urllib.parse.urlencode(params).encode() if params else None
    req=urllib.request.Request(url if post or not params else url+'?'+body.decode(),data=body if post else None,headers={'User-Agent':'CapitalRadar-LocalAssessmentEvidence/1.0'})
    with urllib.request.urlopen(req,timeout=45) as response:data=json.load(response)
    if not isinstance(data,dict) or data.get('error'):raise ValueError('Public source returned an unavailable or invalid response')
    return data
def collect(classes,counties,min_acres,max_records,pams_ids=(),reader=read):
    if not set(classes)<= {'4A','4B','1'}:raise ValueError('Only explicitly supported target classes are allowed')
    if not math.isfinite(min_acres) or not 0<=min_acres<=99999 or not 1<=max_records<=20000:raise ValueError('Invalid bounded scope')
    canonical={re.sub(r'[^A-Z]','',c.upper()):c for c in COUNTIES};selected=[]
    for c in counties:
        key=re.sub(r'[^A-Z]','',c.upper())
        if key not in canonical:raise ValueError('Unknown NJ county')
        selected.append(canonical[key])
    if any(not valid_pin(v) for v in pams_ids):raise ValueError('Use an exact PAMS_PIN; qualifiers cannot be dropped')
    meta=reader(LAYER,{'f':'json'});available={f['name'] for f in meta.get('fields',[])};oid=meta.get('objectIdField') or next((f['name'] for f in meta.get('fields',[]) if f.get('type')=='esriFieldTypeOID'),None)
    if not oid or not {'PAMS_PIN','PROP_CLASS','CALC_ACRE'}.issubset(available):raise ValueError('NJ source schema changed')
    clauses=["PROP_CLASS IN ("+','.join("'"+c+"'" for c in classes)+')',f'CALC_ACRE >= {min_acres}']
    if selected:clauses.append('UPPER(COUNTY) IN ('+','.join("'"+c.upper()+"'" for c in selected)+')')
    if pams_ids:clauses.append('PAMS_PIN IN ('+','.join("'"+v.replace("'","''")+"'" for v in pams_ids)+')')
    where=' AND '.join(clauses);count=reader(LAYER+'/query',{'f':'json','where':where,'returnCountOnly':'true'}).get('count')
    ids=reader(LAYER+'/query',{'f':'json','where':where,'returnIdsOnly':'true'}).get('objectIds')
    if type(count) is not int or not isinstance(ids,list) or len(ids)!=count or len(set(ids))!=count or any(type(i) is not int for i in ids):raise ValueError('Object IDs did not reconcile with source count; prior output preserved')
    chosen=sorted(ids)[:max_records];fields=list(dict.fromkeys([oid]+[f for f in FIELDS if f in available]));chunks=[chosen[i:i+75] for i in range(0,len(chosen),75)]
    def batch(chunk):
        data=reader(LAYER+'/query',{'f':'json','objectIds':','.join(map(str,chunk)),'outFields':','.join(fields),'returnGeometry':'false','returnCentroid':'true','outSR':'4326'},post=True)
        if data.get('exceededTransferLimit') or not isinstance(data.get('features'),list):raise ValueError('Incomplete source batch; no export written')
        features=data['features'];observed=[f.get('attributes',{}).get(oid) for f in features]
        if len(observed)!=len(chunk) or set(observed)!=set(chunk):raise ValueError('Missing or repeated batch identities; no export written')
        return features
    now=dt.datetime.now(dt.timezone.utc).isoformat().replace('+00:00','Z');records={}
    for features in ThreadPoolExecutor(max_workers=2).map(batch,chunks):
        for f in features:
            a=f['attributes'];key=str(a['PAMS_PIN']).strip()
            if not valid_pin(key) or str(a['PROP_CLASS']).strip() not in classes:raise ValueError('Source returned invalid identity or class')
            owner=str(a.get('OWNER_NAME') or '').strip();protected=bool(re.match(r'^(?:REDACTED|WITHHELD|PROTECTED)\b',owner,re.I))
            mailing=None if protected else {'street':str(a.get('ST_ADDRESS') or '').strip(),'cityState':str(a.get('CITY_STATE') or '').strip(),'zip':str(a.get('ZIP_CODE') or '').strip()}
            record={'pamsPin':key,'propertyClass':str(a['PROP_CLASS']),'address':a.get('PROP_LOC'),'county':a.get('COUNTY'),'municipality':a.get('MUN_NAME'),'reportedAcres':a.get('CALC_ACRE'),'mailing':mailing,'reference':{k:a.get(k) for k in ['PCL_MUN','PCLBLOCK','PCLLOT','PCLQCODE','DEED_BOOK','DEED_PAGE','DEED_DATE','SALE_PRICE']},'sourceURL':LAYER,'retrievedAt':now,'evidence':[]}
            centroid=f.get('centroid') or {};x,y=centroid.get('x'),centroid.get('y');record['location']={'lon':x,'lat':y,'basis':'published server centroid'} if isinstance(x,(int,float)) and isinstance(y,(int,float)) and -75.6<=x<=-73.8 and 38.8<=y<=41.4 else None
            if organization(owner) and not protected:record['evidence'].append({'kind':'assessment-observation','name':owner,'sourceURL':LAYER,'observedAt':now[:10]})
            if key in records:
                if any(records[key].get(k)!=record.get(k) for k in ['mailing','propertyClass','reportedAcres']):records[key]['conflict']=True;records[key]['mailing']=None
                for e in record['evidence']:
                    if e not in records[key]['evidence']:records[key]['evidence'].append(e)
            else:records[key]=record
    return records,{'expectedSourceRows':count,'retrievedSourceRows':len(chosen),'uniqueParcels':len(records),'partial':len(chosen)<count,'classes':classes,'counties':selected,'minAcres':min_acres,'sourceURL':LAYER,'retrievedAt':now}
def ingest_csvs(records,directory,default_url=None,default_date=None,classes=('4A','4B'),csv_only=False):
    totals={'matchedEvidence':0,'unmatchedRows':0,'uncitedOrNonorganizationRows':0}
    if not directory:return totals
    for path in sorted(Path(directory).glob('*')):
        if path.suffix.lower()!='.csv':continue
        with path.open(newline='',encoding='utf-8-sig') as stream:
            for raw in csv.DictReader(stream):
                row={str(k).strip().upper():str(v or '').strip() for k,v in raw.items() if k is not None}
                key=row.get('PAMS_PIN') or row.get('PAMSPIN') or pin(row.get('PCL_MUN') or row.get('MUN_CODE') or row.get('DIST',''),row.get('PCLBLOCK') or row.get('BLOCK',''),row.get('PCLLOT') or row.get('LOT',''),row.get('PCLQCODE') or row.get('QCODE') or row.get('QUALIFIER',''))
                if not valid_pin(key):totals['unmatchedRows']+=1;continue
                if key not in records and csv_only and row.get('PROP_CLASS') in classes:records[key]={'pamsPin':key,'propertyClass':row['PROP_CLASS'],'evidence':[],'sourceURL':source_url(row.get('SOURCE_URL') or default_url),'mailing':None}
                if key not in records:totals['unmatchedRows']+=1;continue
                url=source_url(row.get('SOURCE_URL') or default_url);observed=date_value(row.get('SOURCE_DATE') or row.get('AS_OF') or default_date)
                for column,kind in [('OWNER_NAME','assessment-observation'),('OWN_NAME','assessment-observation'),('GRANTEE','recorded-sale-party')]:
                    name=row.get(column,'')
                    if not organization(name) or not url:
                        if name:totals['uncitedOrNonorganizationRows']+=1
                        continue
                    e={'kind':kind,'name':name[:400],'sourceURL':url,'observedAt':observed,'sourceFile':path.name}
                    if e not in records[key]['evidence']:records[key]['evidence'].append(e);totals['matchedEvidence']+=1
    return totals
def facility_references(records,max_lookups=25,reader=read):
    candidates=[r for r in records.values() if r.get('propertyClass')=='4B' and r.get('location')][:max_lookups];unavailable=0;checked=0
    for record in candidates:
        if unavailable>=3:break
        checked+=1;location=record['location'];root='https://echodata.epa.gov/echo/echo_rest_services.'
        try:
            data=reader(root+'get_facilities',{'output':'JSON','p_lat':location['lat'],'p_long':location['lon'],'p_radius':.15});result=data.get('Results')
            if not isinstance(result,dict):raise ValueError('EPA response schema unavailable')
            if result.get('QueryID') and not result.get('Facilities') and str(result.get('QueryRows'))!='0':
                qid=str(result['QueryID'])
                if not qid.isdigit() or int(result.get('QueryRows',101))>100:raise ValueError('EPA response exceeds checked scope')
                result=reader(root+'get_qid',{'output':'JSON','qid':qid}).get('Results',{})
            raw=result.get('Facilities',result.get('FRSFacility'))
            if raw is None and str(result.get('QueryRows'))!='0':raise ValueError('No complete EPA facility list returned')
            rows=raw if isinstance(raw,list) else [raw] if isinstance(raw,dict) else [];references=[]
            if len(rows)>100:raise ValueError('EPA response exceeds checked scope')
            for f in rows:
                registry=str(f.get('RegistryID') or f.get('RegistryId') or '');name=str(f.get('FacName') or f.get('FacilityName') or '')
                if not re.fullmatch(r'\d{12}',registry) or not name:raise ValueError('Invalid EPA facility identity')
                references.append({'registryId':registry,'facilityName':name[:400],'sourceURL':'https://echo.epa.gov/detailed-facility-report?fid='+registry,'role':'facility-reference-not-owner','proximityOnly':True})
            record['facilityResearch']={'status':'observed','references':references,'caveat':'Nearby registered facility, not inferred owner, active operator, contact or decision-maker.'}
        except Exception as error:
            unavailable+=1;record['facilityResearch']={'status':'unavailable','message':str(error)[:200],'references':[]}
    return {'facilityQueries':checked,'facilityUnavailable':unavailable,'facilityCandidatesNotChecked':len(candidates)-checked}

def write_local(payload,out):
    out=Path(out).resolve()
    if out.is_relative_to(ROOT) and not out.is_relative_to(ROOT/'.radar'):raise ValueError('Raw research exports inside the repo must stay under .radar; assets/data/dist are public')
    out.parent.mkdir(parents=True,exist_ok=True);temporary=None
    try:
        with tempfile.NamedTemporaryFile(mode='w',encoding='utf-8',dir=out.parent,delete=False) as stream:temporary=stream.name;json.dump(payload,stream,separators=(',',':'),allow_nan=False)
        os.replace(temporary,out)
    finally:
        if temporary and os.path.exists(temporary):os.unlink(temporary)
def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--classes',nargs='+',choices=['4A','4B','1'],default=['4A','4B']);p.add_argument('--counties',nargs='*',default=[]);p.add_argument('--pams-ids',nargs='*',default=[]);p.add_argument('--statewide',action='store_true');p.add_argument('--min-acres',type=float,default=1);p.add_argument('--max-records',type=int,default=500);p.add_argument('--local-csv-dir');p.add_argument('--csv-source-url');p.add_argument('--source-date');p.add_argument('--csv-only',action='store_true');p.add_argument('--resolve-epa',action='store_true',help='Store facility references separately, never as owners');p.add_argument('--max-facility-lookups',type=int,default=25);p.add_argument('--output',default=str(ROOT/'.radar/owner-research/nj-ownership-evidence.json'));args=p.parse_args()
    if not args.csv_only and not (args.counties or args.pams_ids or args.statewide):p.error('Choose --counties, --pams-ids or explicit --statewide scope')
    if args.csv_only:records={};metadata={'partial':True,'source':'local CSV evidence only; live source not checked'}
    else:records,metadata=collect(args.classes,args.counties,args.min_acres,args.max_records,args.pams_ids)
    imported=ingest_csvs(records,args.local_csv_dir,args.csv_source_url,args.source_date,args.classes,args.csv_only);groups={}
    if args.resolve_epa:
        if not 1<=args.max_facility_lookups<=100:p.error('Facility lookup limit must be 1–100')
        metadata.update(facility_references(records,args.max_facility_lookups))
    for key,r in records.items():
        k=mail_key(r.get('mailing'))
        if k:groups.setdefault(k,[]).append(key)
    payload={'format':'RadarLocalOwnershipEvidence','version':1,'metadata':metadata|imported,'caveat':'Assessment observations and sale parties are not verified title. Shared mailing is not common ownership. Facility names never become owners. Raw research stays local.','byPamsPin':records,'sharedMailingObservations':{k:v for k,v in groups.items() if len(v)>1}}
    write_local(payload,args.output);print(json.dumps({'output':str(Path(args.output).resolve()),'parcels':len(records),'partial':metadata['partial'],**imported}))
if __name__=='__main__':main()
