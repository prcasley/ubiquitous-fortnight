#!/usr/bin/env python3
"""Resumable, evidence-separated NJ tract enrichment. No UI or CSS mutations.

Default input is the current published manifest/shards, preserving researched records.
Use --scan-dir from nj-enrichment-scan.mjs to merge new count-reconciled tract scans.
A failed provider records lastAttempt and never relabels old evidence as fresh.
"""
from __future__ import annotations
import argparse, copy, csv, datetime as dt, hashlib, io, json, os, re, subprocess, sys, tempfile
from pathlib import Path
from urllib.parse import urlencode
import nj_parcel_leads as N
import usdot_site_context as U
import nj_business_filings as F

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'assets/data'
PRIORITY=['34017012800','34015500400','34027046107','34039030400','34039030600','34039032300','34017010900','34017011000']
PREVIOUS={'34023007103','34023980000'}
SHARED={'WASHINGTON','FRANKLIN','HAMILTON','UNION','MONROE','GREENWICH','SPRINGFIELD','OCEAN','LAWRENCE','MANSFIELD','GLOUCESTER','EGG HARBOR','FAIRFIELD','HOPEWELL','BURLINGTON','PEMBERTON','CHESTER','MENDHAM','BOONTON','ROCKAWAY','FREEHOLD','LEBANON','CLINTON','BERLIN','MILLSTONE'}
ROLES={'assessed_owner','tax_mailing_recipient','njdep_regulatory_site','njdep_program_interest','usdot_carrier','usdot_carrier_officer','epa_facility_reference','business_filing_entity','state_registered_agent','business_filing_contact'}

def now(): return dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')
def fresh(date,days=30):
    try:
        d=dt.datetime.fromisoformat(str(date).replace('Z','+00:00'))
        if d.tzinfo is None:d=d.replace(tzinfo=dt.timezone.utc)
        return 0 <= (dt.datetime.now(dt.timezone.utc)-d).total_seconds() <= days*86400
    except (ValueError,TypeError):return False

def atomic(path,data):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    fd,temp=tempfile.mkstemp(dir=path.parent,suffix='.tmp')
    try:
        with os.fdopen(fd,'w',encoding='utf-8') as fh:
            fh.write(data if isinstance(data,str) else json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n')
        os.replace(temp,path)
    finally:
        if os.path.exists(temp):os.unlink(temp)

def load_full(path):
    path=Path(path);data=json.loads(path.read_text())
    if data.get('format')!='RadarNJParcelResearch':raise ValueError('Expected NJ public research data')
    if data.get('version')==2:
        rows=[]
        for key,meta in sorted(data['shards'].items()):
            if not re.fullmatch(r'\d{4}',key) or meta.get('file')!='nj-research/'+key+'.json':raise ValueError('Unsafe shard reference')
            shard=json.loads((path.parent/meta['file']).read_text())
            if shard.get('format')!='RadarNJParcelResearchShard' or shard.get('version')!=1 or shard.get('shard')!=key or len(shard['records'])!=meta['records']:raise ValueError('Shard/count mismatch')
            if any(not str(r.get('parcelId','')).startswith(key+'_') for r in shard['records']):raise ValueError('Foreign municipal parcel')
            rows.extend(shard['records'])
        if len(rows)!=data['totals']['records']:raise ValueError('Manifest totals do not reconcile')
        data={**data,'version':1,'records':rows}
        for k in ('shards','totals','quickPicks'):data.pop(k,None)
    validate_rows(data['records']);return data

def validate_rows(rows):
    seen=set()
    for r in rows:
        pin=r.get('parcelId','')
        if r.get('state')!='NJ' or not re.fullmatch(r'\d{4}_[^_\s]+_[^_\s]+(?:_[^\s]+)?',pin) or pin in seen:raise ValueError('Invalid/repeated exact NJ parcel ID')
        if r.get('facts',{}).get('PROP_CLASS') not in ('1','4A','4B'):raise ValueError('Only business-target assessment classes permitted')
        if r.get('facts',{}).get('PAMS_PIN')!=pin:raise ValueError('Parcel facts disagree with identity')
        seen.add(pin)

def tract_plan(boundaries,coverage,records,remaining=True):
    features=boundaries.get('features',[]);ids=[f.get('properties',{}).get('Geography') for f in features]
    if len(ids)!=130 or len(set(ids))!=130 or any(not re.fullmatch(r'34\d{9}',str(i)) for i in ids):raise ValueError('Expected reviewed 130 unique NJ tracts')
    by_id={f['properties']['Geography']:f['properties'] for f in features};old={r['tract']:r for r in coverage.get('tracts',[])}
    order=PRIORITY+[i for i in ids if i not in PRIORITY]
    out=[]
    for t in order:
        rs=[r for r in records if t in r.get('tractReferences',[])]
        out.append({'tract':t,'municipality':by_id[t]['Municipality'],'county':by_id[t]['County'],'selected':not remaining or t not in PREVIOUS,
                    'priority':t in PRIORITY,'existingRecords':len(rs),'scanStatus':old.get(t,{}).get('scanStatus','not-checked'),
                    'zeroReason':'No class 1/4A/4B parcels at least 2 acres in the recorded scan; not absence of property' if not rs and old.get(t,{}).get('scanStatus')=='complete' else None})
    return out

def protected(r):
    o=r.get('mailingObservation') or {};return o.get('status') in ('protected','restricted') or r.get('facts',{}).get('PROTECTED') is True

def rings(r):
    g=r.get('geometry') or {}
    if g.get('type')=='Polygon':return g['coordinates']
    if g.get('type')=='MultiPolygon':return [ring for poly in g['coordinates'] for ring in poly]
    return g.get('rings',[])

def merge_scans(full,directory):
    if not directory:return full
    by_id={r['parcelId']:r for r in full['records']};reports=[];seen_attrs={};seen_geometries={}
    for p in sorted(Path(directory).glob('*.json')):
        if p.name.endswith('.attempt.json'):continue
        report=json.loads(p.read_text())
        if report.get('countsOnly') or report.get('status') not in ('complete','partial'):continue
        if report['received']!=len(report['features']) or report['status']=='complete' and report['received']!=report['expected']:raise ValueError('Scan counts do not reconcile')
        reports.append({k:v for k,v in report.items() if k!='features'})
        for feature in report['features']:
            a=feature['properties'];pin=a['PAMS_PIN'];existing=by_id.get(pin)
            safe={k:v for k,v in a.items() if k not in ('OWNER_NAME','ST_ADDRESS','CITY_STATE','ZIP_CODE','CONFID_FLG',report.get('oidField','OBJECTID'))}
            is_protected=bool(re.match(r'^(REDACTED|WITHHELD|PROTECTED|CONFIDENTIAL)\b',str(a.get('OWNER_NAME') or ''),re.I)) or str(a.get('CONFID_FLG','')).upper() in ('Y','YES','TRUE','1')
            name=str(a.get('OWNER_NAME') or '').strip();date=report['checkedAt']
            record=copy.deepcopy(existing) if existing else {'parcelId':pin,'state':'NJ','njdepContext':{'status':'not-checked','sites':[],'interests':[]},'usdotContext':{},'epaContext':{}}
            # Conflicting facts on a shared parcel across tract pages need review; never sum acreage.
            identity_attrs={k:v for k,v in a.items() if k!=report.get('oidField','OBJECTID')}
            if pin in seen_attrs and seen_attrs[pin]!=identity_attrs:raise ValueError('Conflicting cross-tract parcel assessment/mailing attributes')
            seen_attrs[pin]=identity_attrs
            pieces=seen_geometries.setdefault(pin,[])
            for poly in ([feature['geometry']['coordinates']] if feature['geometry']['type']=='Polygon' else feature['geometry']['coordinates']):
                if poly not in pieces:pieces.append(poly)
            merged_geometry={'type':'Polygon','coordinates':pieces[0]} if len(pieces)==1 else {'type':'MultiPolygon','coordinates':pieces}
            record.update({'facts':safe,'geometry':merged_geometry,'tractReferences':sorted(set(record.get('tractReferences',[])+[report['tract']]))})
            mail=None if is_protected else {'street':a.get('ST_ADDRESS') or '', 'cityState':a.get('CITY_STATE') or '', 'zip':a.get('ZIP_CODE') or ''}
            record['mailingObservation']={'key':pin,'parcelId':pin,'state':'NJ','status':'protected' if is_protected else 'observed','sourceURL':N.PARCELS.removesuffix('/query'),'checkedAt':date,'mailing':mail if mail and mail['street'] else None}
            record['assessmentOwnerObservation']={'name':name,'role':'published-assessment-observation','sourceURL':N.PARCELS.removesuffix('/query'),'checkedAt':date} if name and name.upper() not in ('N/A','NA','NULL','UNKNOWN','NOT AVAILABLE') and not is_protected else None
            record['scanObservation']={'status':'source-returned','checkedAt':date,'sourceURL':N.PARCELS.removesuffix('/query')}
            by_id[pin]=record
    full['records']=list(by_id.values());full['coverage']['enrichmentScanReports']=reports;validate_rows(full['records']);return full

def refresh_mail(records,client):
    if not records:return
    ids=[r['parcelId'] for r in records]
    try:
        fields=['PAMS_PIN','PROP_CLASS','OWNER_NAME','ST_ADDRESS','CITY_STATE','ZIP_CODE']
        _,schema=client.meta(N.PARCELS)
        if 'CONFID_FLG' in schema:fields.append('CONFID_FLG')
        rows={}
        for offset in range(0,len(ids),100):
            wanted=ids[offset:offset+100]
            where="PAMS_PIN IN ("+','.join("'"+v.replace("'","''")+"'" for v in wanted)+") AND PROP_CLASS IN ('1','4A','4B')"
            for f in client.query_all(N.PARCELS,{'where':where,'outFields':','.join(fields),'returnGeometry':'false'}):
                a=f['attributes'];pin=a.get('PAMS_PIN')
                if pin not in wanted:raise ValueError('Foreign mailing identity')
                signature={k:a.get(k) for k in fields}
                if pin in rows and rows[pin]!=signature:raise ValueError('Conflicting mailing/assessment observations')
                rows[pin]=signature
        date=now()
        for r in records:
            a=rows.get(r['parcelId'])
            if not a:r.setdefault('mailingObservation',{})['lastAttempt']={'status':'not-returned','attemptedAt':date};continue
            name=str(a.get('OWNER_NAME') or '').strip()
            is_protected=bool(re.match(r'^(REDACTED|WITHHELD|PROTECTED|CONFIDENTIAL)\b',name,re.I)) or str(a.get('CONFID_FLG','')).upper() in ('Y','YES','1','TRUE')
            mail={'street':a.get('ST_ADDRESS') or '', 'cityState':a.get('CITY_STATE') or '', 'zip':a.get('ZIP_CODE') or ''}
            r['mailingObservation']={'parcelId':r['parcelId'],'key':r['parcelId'],'state':'NJ','status':'protected' if is_protected else 'observed','checkedAt':date,'sourceURL':N.PARCELS.removesuffix('/query'),'mailing':mail if mail['street'] and not is_protected else None}
            valid_name=bool(name) and name.upper() not in ('N/A','NA','NULL','UNKNOWN','NOT AVAILABLE') and not is_protected
            r['assessmentOwnerObservation']={'name':name,'role':'published-assessment-observation','sourceURL':N.PARCELS.removesuffix('/query'),'checkedAt':date} if valid_name else None
    except Exception as exc:
        for r in records:r.setdefault('mailingObservation',{})['lastAttempt']={'status':'unavailable','attemptedAt':now(),'message':str(exc)[:250]}

def refresh_dep(records,client):
    if not records:return
    muni=records[0]['parcelId'][:4]
    try:
        sites=N.load_sites(client,[muni]);parcels={r['parcelId']:{**r['facts'],'rings':rings(r)} for r in records}
        if any(not r['rings'] for r in parcels.values()):raise ValueError('Published parcel geometry required for regulatory matching')
        hits=N.match_sites(parcels,sites);programs=N.load_programs(client,[s['SITE_ID'] for matches in hits.values() for s,_,_ in matches]);date=now()
        for r in records:
            ss=[];pp=[]
            for s,method,confidence in hits[r['parcelId']]:
                sid=s['SITE_ID'];inside=method=='inside parcel boundary'
                ss.append({'siteId':sid,'siteName':s['SITE_NAME'],'address':s.get('ADDRESS_LINE_1') or '', 'lat':s.get('y'),'lon':s.get('x'),'insideParcel':inside,'distanceToParcelMeters':0 if inside else round(N.dist_to_rings_m(s['x'],s['y'],parcels[r['parcelId']]['rings']),1) if s.get('x') is not None else None,'role':'regulatory-site','matchMethod':method,'confidence':confidence,'sourceURL':N.SITES+'?'+urlencode({'f':'pjson','where':'SITE_ID = '+str(sid),'outFields':'SITE_ID,SITE_NAME,ADDRESS_LINE_1,MUN_CODE','returnGeometry':'false'})})
                for p in programs.get(sid,[]):
                    pp.append({'siteId':sid,'programInterestId':p['PI_ID'],'name':p.get('PI_NAME'),'program':p.get('PROGRAM_DESC'),'activeSourceValue':p.get('ACTIVE'),'startDateSource':p.get('START_DATE'),'endDateSource':p.get('END_DATE'),'role':'program-interest','matchMethod':'exact SITE_ID join to '+method,'confidence':confidence,'sourceURL':N.PROGRAMS+'?'+urlencode({'f':'pjson','where':f"SITE_ID = {sid} AND PI_ID = {p['PI_ID']}",'outFields':'SITE_ID,PI_ID,PI_NAME,PROGRAM_DESC,ACTIVE','returnGeometry':'false'})})
            r['njdepContext']={'format':'RadarNJDEPContext','version':1,'status':'observed','parcelId':r['parcelId'],'sites':ss,'interests':pp,'checkedAt':date,'interestStatus':'observed','sourceURLs':{'sites':N.SITES.removesuffix('/query'),'interests':N.PROGRAMS.removesuffix('/query')},'caveat':'Regulatory references, not verified owner, operator, permit status or authority to sell. Nearby/address matches retain confidence.'}
    except Exception as exc:
        for r in records:r.setdefault('njdepContext',{'status':'not-checked','sites':[],'interests':[]})['lastAttempt']={'status':'unavailable','attemptedAt':now(),'message':str(exc)[:250]}

def company_candidates(r):
    if protected(r):return []
    candidates={}
    def add(name,role,source,checked,method,confidence):
        if not name or not N.ORG.search(str(name).upper()) or not source:return
        k=F.canonical(name);entry={'name':str(name).strip(),'sourceRole':role,'sourceURL':source,'checkedAt':checked,'matchMethod':method,'confidence':confidence}
        # Prefer a source-record name or in-parcel reference over a nearby regulatory point.
        if k not in candidates or confidence=='high' and candidates[k]['confidence']!='high':candidates[k]=entry
    o=r.get('assessmentOwnerObservation') or {};add(o.get('name'),'assessed_owner',o.get('sourceURL'),o.get('checkedAt'),'exact PAMS_PIN','high')
    u=r.get('usdotContext') or {};add(u.get('carrierName'),'usdot_carrier',u.get('sourceURL'),u.get('checkedAt'),u.get('matchMethod'),'source-reference')
    e=r.get('epaContext') or {}
    for f in e.get('facilities',[]):add(f.get('name'),'epa_facility_reference',f.get('sourceURL'),e.get('checkedAt'),f.get('match'),'source-reference')
    d=r.get('njdepContext') or {};sites={s['siteId']:s for s in d.get('sites',[])}
    for p in d.get('interests',[]):
        s=sites.get(p.get('siteId'),{});confidence=p.get('confidence') or ('high' if s.get('insideParcel') else 'low')
        if confidence=='low':continue
        add(p.get('name'),'njdep_program_interest',p.get('sourceURL'),d.get('checkedAt'),p.get('matchMethod') or 'SITE_ID joins an in-parcel regulatory site',confidence)
    return list(candidates.values())

def normalize_mail(r):
    m=r.get('mailingObservation') or {};mail=m.get('mailing')
    if mail:
        clean=lambda v: '' if str(v or '').strip().upper() in ('','UNKNOWN','NULL','NONE','N/A','NA','NOT AVAILABLE','0','00000') else str(v).strip()
        mail={k:clean(mail.get(k)) for k in ('street','cityState','zip')}
        m['mailing']=mail if mail['street'] and not protected(r) else None
        if not m['mailing']:m['missingReason']='Mailing street is blank or a source placeholder; no recipient inferred'
    return r

def add_roles(r):
    normalize_mail(r);evidence=[]
    def add(role,value,source,date,method,confidence,**extra):
        if value and source and date:evidence.append({'role':role,'value':value,'sourceURL':source,'checkedAt':date,'matchMethod':method,'confidence':confidence,**extra})
    o=r.get('assessmentOwnerObservation') or {}
    if not protected(r):add('assessed_owner',o.get('name'),o.get('sourceURL'),o.get('checkedAt'),'exact PAMS_PIN','source-record; title unverified')
    m=r.get('mailingObservation') or {};mail=m.get('mailing')
    if mail and not protected(r):add('tax_mailing_recipient',mail,m.get('sourceURL'),m.get('checkedAt'),'exact PAMS_PIN','source-record; not headquarters')
    d=r.get('njdepContext') or {};sites={s['siteId']:s for s in d.get('sites',[])}
    for s in sites.values():add('njdep_regulatory_site',s.get('siteName'),s.get('sourceURL'),d.get('checkedAt'),s.get('matchMethod') or ('point inside parcel' if s.get('insideParcel') else 'nearby regulatory point'),s.get('confidence') or ('high' if s.get('insideParcel') else 'low'),siteId=s['siteId'])
    for p in d.get('interests',[]):
        s=sites.get(p.get('siteId'),{});add('njdep_program_interest',p.get('name'),p.get('sourceURL'),d.get('checkedAt'),p.get('matchMethod') or 'exact SITE_ID join to regulatory reference',p.get('confidence') or ('high' if s.get('insideParcel') else 'low'),siteId=p.get('siteId'),programInterestId=p.get('programInterestId'),activeSourceValue=p.get('activeSourceValue'))
    u=r.get('usdotContext') or {}
    if u.get('carrierName'):
        add('usdot_carrier',u['carrierName'],u.get('sourceURL'),u.get('checkedAt'),u.get('matchMethod'),'source-linked carrier, not owner',dotNumber=u.get('dotNumber'),filingDate=u.get('filingDate'),carrierStatus=u.get('status'))
        for officer in u.get('officers',[]):add('usdot_carrier_officer',officer,u.get('sourceURL'),u.get('checkedAt'),'officer disclosed on linked carrier filing','source-record, not property authority',dotNumber=u.get('dotNumber'),company=u['carrierName'],filingDate=u.get('filingDate'),carrierStatus=u.get('status'))
    e=r.get('epaContext') or {}
    for f in e.get('facilities',[]):add('epa_facility_reference',f.get('name'),f.get('sourceURL'),e.get('checkedAt'),f.get('match'),'source-reference, not current operation',registryId=f.get('registryId'))
    for f in (r.get('businessFilingContext') or {}).get('filings',[]):
        add('business_filing_entity',f.get('entityName'),f.get('sourceURL'),f.get('checkedAt'),'exact entity-name filing match','entity match; parcel relationship retains original source role',entityId=f.get('entityId'),verification=f.get('verification'))
        agent=f.get('registeredAgent') or {};add('state_registered_agent',agent.get('name'),agent.get('sourceURL'),agent.get('checkedAt'),'registered agent on exact entity filing','filing role, not owner or seller',entityId=f.get('entityId'),company=f.get('entityName'))
        for c in f.get('contacts',[]):add('business_filing_contact',c.get('value'),c.get('sourceURL'),c.get('checkedAt'),'explicit business contact field on filing','company contact, not property authority',kind=c.get('kind'),company=f.get('entityName'))
    assert all(e['role'] in ROLES for e in evidence)
    r['evidence']=evidence
    return r

COLUMNS=['PAMS_PIN','PROP_CLASS','PROP_LOC','MUN_NAME','COUNTY','CHECKED_AT','ASSESSMENT_ENTITY_NAME','ASSESSMENT_NAME_ROLE','TAX_MAILING_RECIPIENT','TAX_MAILING_CITY_STATE','TAX_MAILING_ZIP','TAX_MAILING_ROLE','NJDEP_SITE_NAMES','NJDEP_REGULATORY_SITE_NAMES','NJDEP_PROGRAM_INTEREST_NAMES','REGULATORY_STATUS','USDOT_CARRIER_NAME','USDOT_NUMBER','USDOT_OFFICERS','USDOT_OFFICER_ROLE','USDOT_BUSINESS_PHONE','USDOT_BUSINESS_EMAIL','USDOT_STATUS','USDOT_LOOKUP_STATUS','USDOT_FILING_DATE','USDOT_CHECKED_AT','USDOT_SOURCE_URL','BUSINESS_FILING_STATUS','BUSINESS_FILING_CANDIDATE_NAMES','BUSINESS_FILING_SEARCH_URL','BUSINESS_FILING_ENTITY_NAMES','BUSINESS_FILING_ENTITY_IDS','REGISTERED_AGENT_NAMES','REGISTERED_AGENT_ROLE','BUSINESS_CONTACT_PHONE','BUSINESS_CONTACT_EMAIL','BUSINESS_FILING_SOURCE_URLS','BUSINESS_FILING_CHECKED_AT','RESEARCH_SCOPE','ASSESSMENT_SOURCE_URL','MAILING_CHECKED_AT','REGULATORY_CHECKED_AT','TRACT_REFERENCES']
def csv_text(full):
    out=io.StringIO(newline='');w=csv.DictWriter(out,fieldnames=COLUMNS,lineterminator='\n');w.writeheader()
    def join(values):return '; '.join(dict.fromkeys(str(v) for v in values if v))
    for r in full['records']:
        f=r['facts'];m=r.get('mailingObservation') or {};mail=m.get('mailing') or {};d=r.get('njdepContext') or {};u=r.get('usdotContext') or {};b=r.get('businessFilingContext') or {};filings=b.get('filings',[]);e=r.get('evidence',[])
        row={'PAMS_PIN':r['parcelId'],**{k:f.get(k,'') for k in ['PROP_CLASS','PROP_LOC','MUN_NAME','COUNTY']},'CHECKED_AT':full['checkedAt'],'ASSESSMENT_ENTITY_NAME':(r.get('assessmentOwnerObservation') or {}).get('name',''),'ASSESSMENT_NAME_ROLE':'assessed_owner' if r.get('assessmentOwnerObservation') else '', 'TAX_MAILING_RECIPIENT':mail.get('street',''),'TAX_MAILING_CITY_STATE':mail.get('cityState',''),'TAX_MAILING_ZIP':mail.get('zip',''),'TAX_MAILING_ROLE':'tax_mailing_recipient' if mail else '', 'NJDEP_SITE_NAMES':join(s.get('siteName') for s in d.get('sites',[])),'NJDEP_REGULATORY_SITE_NAMES':join(s.get('siteName') for s in d.get('sites',[])),'NJDEP_PROGRAM_INTEREST_NAMES':join(p.get('name') for p in d.get('interests',[])),'REGULATORY_STATUS':d.get('status','not-checked'),'USDOT_CARRIER_NAME':u.get('carrierName',''),'USDOT_NUMBER':u.get('dotNumber',''),'USDOT_OFFICERS':join(u.get('officers',[])),'USDOT_OFFICER_ROLE':'usdot_carrier_officer' if u.get('officers') else '', 'USDOT_BUSINESS_PHONE':u.get('businessPhone',''),'USDOT_BUSINESS_EMAIL':u.get('email',''),'USDOT_STATUS':u.get('status',''),'USDOT_LOOKUP_STATUS':u.get('lookupStatus') or u.get('lastAttempt',{}).get('status') or ('source-observed' if u.get('checkedAt') else 'not-checked'),'USDOT_FILING_DATE':u.get('filingDate',''),'USDOT_CHECKED_AT':u.get('checkedAt',''),'USDOT_SOURCE_URL':u.get('sourceURL') or u.get('source',''),'BUSINESS_FILING_STATUS':b.get('status','not-checked'),'BUSINESS_FILING_CANDIDATE_NAMES':join(c.get('name') for c in b.get('candidates',[])),'BUSINESS_FILING_SEARCH_URL':F.PORTAL,'BUSINESS_FILING_ENTITY_NAMES':join(x.get('entityName') for x in filings),'BUSINESS_FILING_ENTITY_IDS':join(x.get('entityId') for x in filings),'REGISTERED_AGENT_NAMES':join(x.get('registeredAgent',{}).get('name') for x in filings if x.get('registeredAgent')),'REGISTERED_AGENT_ROLE':'state_registered_agent' if any(x.get('registeredAgent') for x in filings) else '', 'BUSINESS_CONTACT_PHONE':join(x['value'] for x in e if x['role']=='business_filing_contact' and x.get('kind')=='businessPhone'),'BUSINESS_CONTACT_EMAIL':join(x['value'] for x in e if x['role']=='business_filing_contact' and x.get('kind')=='businessEmail'),'BUSINESS_FILING_SOURCE_URLS':join(x.get('sourceURL') for x in filings),'BUSINESS_FILING_CHECKED_AT':join(x.get('checkedAt') for x in filings),'RESEARCH_SCOPE':'business-target research; role-specific source dates; not verified ownership or availability','ASSESSMENT_SOURCE_URL':m.get('sourceURL',''),'MAILING_CHECKED_AT':m.get('checkedAt',''),'REGULATORY_CHECKED_AT':d.get('checkedAt',''),'TRACT_REFERENCES':join(r.get('tractReferences',[]))}
        w.writerow({k:("'"+str(v) if re.match(r'^\s*[=+@-]',str(v or '')) or str(v or '')[:1] in ('\t','\r','\n') else v) for k,v in row.items()})
    return out.getvalue()

def enrich(full,plan,*,refresh=False,max_age=30,run_sources=True,filing_records=None,checkpoint=None,registry=None,client=None,fetch_carriers=U.fetch_town,filing_limit=100,filing_cache_path=None):
    full=copy.deepcopy(full);selected={p['tract'] for p in plan if p['selected']};rows=full['records'];targets=[r for r in rows if selected.intersection(r.get('tractReferences',[]))]
    ordered={t:i for i,t in enumerate(PRIORITY+[p['tract'] for p in plan if p['tract'] not in PRIORITY])}
    towns={}
    for r in targets:towns.setdefault(r['parcelId'][:4],[]).append(r)
    towns=sorted(towns.items(),key=lambda kv:min(ordered.get(t,999) for r in kv[1] for t in r.get('tractReferences',[])))
    client=client or N.Client(request_interval=.15);registry=registry or F.Registry();filing_records=filing_records or {};filing_cache={F.canonical(f['entityName']):f for r in rows for f in r.get('businessFilingContext',{}).get('filings',[]) if not refresh and fresh(f.get('checkedAt'),max_age)};provider_failure=None;carrier_towns={};queue={};date=now()
    if not refresh and filing_cache_path and Path(filing_cache_path).exists():
        saved=json.loads(Path(filing_cache_path).read_text())
        if saved.get('format')!='RadarNJBusinessLookupCache':raise ValueError('Invalid filing lookup cache')
        filing_cache.update({k:v for k,v in saved.get('results',{}).items() if v.get('status') in ('observed','no-exact-name-result','ambiguous') and fresh(v.get('checkedAt'),7)})
    requests=0
    for index,(muni,recs) in enumerate(towns):
        digests={r['parcelId']:input_digest(r) for r in recs}
        if run_sources:
            needs=[r for r in recs if refresh or r.get('mailingObservation',{}).get('status') not in ('observed','protected') or r.get('mailingObservation',{}).get('lastAttempt',{}).get('status')=='unavailable' or not fresh(r.get('mailingObservation',{}).get('checkedAt'),max_age)]
            refresh_mail(needs,client)
            needs=[r for r in recs if refresh or r.get('njdepContext',{}).get('status')!='observed' or not fresh(r.get('njdepContext',{}).get('checkedAt'),max_age)]
            refresh_dep(needs,client)
        town=U.town_name(recs[0]['facts'].get('MUN_NAME'))
        coverage=full.get('coverage',{}).get('usdot',{}).get('towns',{}).get(town,{})
        needs=[r for r in recs if refresh or not fresh(r.get('usdotContext',{}).get('checkedAt'),max_age) or r.get('usdotContext',{}).get('lastAttempt',{}).get('status')=='unavailable' or coverage.get('carriers')==0]
        if run_sources and needs:
            try:
                if provider_failure:raise RuntimeError(provider_failure)
                carriers=fetch_carriers(town)
                carrier_towns[town]={'status':'checked' if carriers else 'town-name-unresolved','carriers':len(carriers),'checkedAt':now()}
                for r in needs:
                    # Strict physical street match; care-of lines allowed, truncated prefixes remain unassigned.
                    hits=[c for c in carriers if str(c.get('phy_state') or '').upper()=='NJ' and ' '.join(str(c.get('phy_city') or '').upper().split())==town and N.same_address(U.CARE_OF.sub('',str(c.get('phy_street') or '').upper()),r['facts'].get('PROP_LOC'))]
                    if not carriers:
                        r.setdefault('usdotContext',{})['lookupStatus']='town-name-unresolved';continue
                    rows_out=U.enrich([{'MUNICIPALITY':r['facts']['MUN_NAME'],'PROPERTY_ADDRESS':r['facts']['PROP_LOC']}],{town:hits},now());u=U.context_block(rows_out[0]);u['lookupStatus']='matched' if hits else 'no-exact-physical-address-match';u['locationConfidence']='municipality-review-required' if town in SHARED else 'physical-street-association; suite and occupancy unverified';r['usdotContext']=u
            except Exception as exc:
                # A proxy-level denial is provider-wide; don't repeat it for ninety towns.
                if any(s in str(exc).lower() for s in ('403','tunnel connection','forbidden')):provider_failure=str(exc)[:200]
                carrier_towns[town]={'status':'unavailable','attemptedAt':now(),'message':str(exc)[:200]}
                for r in needs:r.setdefault('usdotContext',{})['lastAttempt']=carrier_towns[town]
        for r in recs:
            normalize_mail(r);candidates=company_candidates(r);filings=[];states=[]
            for c in candidates:
                key=F.canonical(c['name'])
                if key not in filing_cache:
                    if key in filing_records:
                        if F.canonical(filing_records[key].get('entityName'))!=key:raise ValueError('Imported filing entity does not match candidate company')
                        filing_cache[key]=filing_records[key]
                    elif run_sources:
                        if getattr(registry,'failure',None):filing_cache[key]={'status':'unavailable','role':'business_filing_entity','searchURL':F.PORTAL,'message':registry.failure}
                        elif requests>=filing_limit:filing_cache[key]={'status':'pending','role':'business_filing_entity','searchURL':F.PORTAL,'message':'Per-run filing limit; resume to continue'}
                        else:filing_cache[key]=registry.lookup(c['name']);requests+=1
                    else:filing_cache[key]={'status':'not-checked','role':'business_filing_entity','searchURL':F.PORTAL}
                result=filing_cache[key]
                if result.get('status')=='observed' and F.canonical(result.get('entityName'))!=key:raise ValueError('Registry returned a different company entity')
                states.append(result['status'])
                if result['status']=='observed':filings.append(copy.deepcopy(result))
                else:
                    item=queue.setdefault(key,{'entityName':c['name'],'sourceRoles':[],'parcelIds':[],'searchURL':F.PORTAL,'status':result['status'],'message':result.get('message'),'sourceReferences':[]})
                    if c['sourceRole'] not in item['sourceRoles']:item['sourceRoles'].append(c['sourceRole'])
                    if r['parcelId'] not in item['parcelIds']:item['parcelIds'].append(r['parcelId'])
                    if c['sourceURL'] not in item['sourceReferences']:item['sourceReferences'].append(c['sourceURL'])
            previous=r.get('businessFilingContext') or {}
            # Retain a prior good dated filing if an attempted refresh fails.
            candidate_keys={F.canonical(c['name']) for c in candidates}
            historical=[f for f in previous.get('filings',[]) if F.canonical(f.get('entityName')) not in candidate_keys]
            if not filings and previous.get('filings'):filings=[f for f in previous['filings'] if F.canonical(f.get('entityName')) in candidate_keys]
            r['businessFilingContext']={'status':('observed' if all(fresh(f.get('checkedAt'),max_age) for f in filings) else 'stale') if filings else 'unavailable' if 'unavailable' in states else 'pending' if states else 'no-source-supported-company','candidates':candidates,'filings':filings,'historicalFilings':historical,'lookupStatus':'unavailable' if 'unavailable' in states else 'pending' if 'pending' in states else 'checked' if states else 'no-candidate','unresolvedCandidates':sum(s!='observed' for s in states),'attemptedAt':date,'role':'business_filing_entity','caveat':'Exact-name registry research; a regulatory company or registered agent is not inferred to own the parcel. Unavailable is not a no-company finding.'}
            add_roles(r)
        if filing_cache_path:atomic(filing_cache_path,{'format':'RadarNJBusinessLookupCache','version':1,'results':filing_cache})
        if checkpoint:atomic(Path(checkpoint)/(muni+'.json'),{'format':'RadarNJEnrichmentCheckpoint','version':1,'municipality':muni,'attemptedAt':date,'inputDigests':digests,'records':recs})
        print(f'Batch {index+1}/{len(towns)} municipality {muni}: {len(recs)} parcel records',flush=True)
    # Records retained outside the remaining-128 scope also receive deterministic export role tags.
    for r in rows:add_roles(r)
    full['checkedAt']=date;full['mailingGroups']=mailing_groups(rows)
    partials=sum(r.get('njdepContext',{}).get('status')!='observed' or r.get('njdepContext',{}).get('lastAttempt',{}).get('status')=='unavailable' for r in rows)
    full.setdefault('coverage',{}).update({'recordsChecked':len(rows),'regulatoryRecordsChecked':sum(bool(r.get('njdepContext',{}).get('checkedAt')) for r in rows),'regulatoryRecordsPartial':partials,'enrichment':{'runAt':date,'selectedTracts':len(selected),'selectedParcels':len(targets),'sourceDatePolicy':'Dataset assembly time is not a source recheck. Per-role checkedAt is authoritative; failed attempts never renew evidence dates.','missingFieldCounts':{'mailingRecipient':sum(not r.get('mailingObservation',{}).get('mailing') for r in rows),'assessedOwnerName':sum(not (r.get('assessmentOwnerObservation') or {}).get('name') for r in rows)},'requestedTracts':plan,'roleCounts':{role:sum(e['role']==role for r in rows for e in r['evidence']) for role in sorted(ROLES)},'businessFilingPendingEntities':len(queue),'carrierRefresh':carrier_towns,'partial':bool(queue or partials or any(t['status']=='unavailable' for t in carrier_towns.values()))}})
    full['coverage']['partial']=full['coverage'].get('sourceScanPartial',False) or full['coverage']['enrichment']['partial']
    return full,{'format':'RadarNJBusinessFilingQueue','version':1,'createdAt':date,'entities':list(queue.values()),'caveat':'Research queue, not resolved owners, agents or contacts.'}

def input_digest(record):
    return hashlib.sha256(json.dumps({k:record.get(k) for k in ('parcelId','facts','geometry','tractReferences')},sort_keys=True,separators=(',',':')).encode()).hexdigest()

def resume(full,directory):
    by_id={r['parcelId']:r for r in full['records']};restored=0
    for path in sorted(Path(directory).glob('*.json')):
        data=json.loads(path.read_text())
        if data.get('format')!='RadarNJEnrichmentCheckpoint' or data.get('version')!=1:raise ValueError('Invalid checkpoint')
        validate_rows(data.get('records',[]))
        for saved in data['records']:
            target=by_id.get(saved['parcelId'])
            if not target or input_digest(target)!=data.get('inputDigests',{}).get(saved['parcelId']):continue
            for key in ('mailingObservation','assessmentOwnerObservation','njdepContext','usdotContext','businessFilingContext'):
                if key not in saved:continue
                raw=saved[key];old=target.get(key) or {};new=raw or {}
                if raw is not None and not isinstance(raw,dict):raise ValueError('Invalid checkpoint context')
                old_date=old.get('checkedAt') or old.get('attemptedAt') or ''
                new_date=new.get('checkedAt') or new.get('attemptedAt') or ''
                if key=='assessmentOwnerObservation':
                    old_date=old_date or target.get('mailingObservation',{}).get('checkedAt','')
                    new_date=new_date or saved.get('mailingObservation',{}).get('checkedAt','')
                def stamp(value):
                    try:
                        d=dt.datetime.fromisoformat(str(value).replace('Z','+00:00'))
                        if d.tzinfo is None:d=d.replace(tzinfo=dt.timezone.utc)
                        return d.timestamp() if d<=dt.datetime.now(dt.timezone.utc) else 0
                    except (TypeError,ValueError):return 0
                if stamp(new_date)>=stamp(old_date):target[key]=copy.deepcopy(raw)
            restored+=1
    return restored

def mailing_groups(records):
    groups={}
    for r in records:
        normalize_mail(r);m=r.get('mailingObservation') or {};address=m.get('mailing')
        if not address or protected(r):continue
        # Full street (including suite), city/state and ZIP; no street-number-only or HQ grouping.
        key='|'.join(' '.join(re.sub(r'[^A-Z0-9]',' ',str(address.get(k) or '').upper()).split()) for k in ('street','cityState','zip'))
        if not address.get('cityState') or not address.get('zip'):continue
        g=groups.setdefault(key,{'mailing':address,'parcelIds':[],'keys':[],'sourceDates':{}})
        g['parcelIds'].append(r['parcelId']);g['keys'].append(r['parcelId']);g['sourceDates'][r['parcelId']]=m.get('checkedAt')
    return [g for g in groups.values() if len(g['parcelIds'])>1]

def update_tract_coverage(original,full):
    out=copy.deepcopy(original);reports={r['tract']:r for r in full['coverage'].get('enrichmentScanReports',[])}
    for row in out['tracts']:
        recs=[r for r in full['records'] if row['tract'] in r.get('tractReferences',[]) and float(r['facts'].get('CALC_ACRE') or 0)>=2]
        row.update({'parcels2acPlus':len(recs),'acres':round(sum(float(r['facts'].get('CALC_ACRE') or 0) for r in recs),2),
         'ownerNamePublished':sum(bool((r.get('assessmentOwnerObservation') or {}).get('name')) for r in recs),
         'taxBillMailing':sum(bool((r.get('mailingObservation') or {}).get('mailing')) for r in recs),
         'njdepSites':sum(len(r.get('njdepContext',{}).get('sites',[])) for r in recs),
         'njdepProgramNames':sum(sum(bool(p.get('name')) for p in r.get('njdepContext',{}).get('interests',[])) for r in recs),
         'onSiteCarriers':sum(bool(r.get('usdotContext',{}).get('carrierName')) for r in recs),
         'carrierPhone':sum(bool(r.get('usdotContext',{}).get('businessPhone')) for r in recs),
         'carrierEmail':sum(bool(r.get('usdotContext',{}).get('email')) for r in recs),
         'epaFacilityParcels':sum(bool(r.get('epaContext',{}).get('facilities')) for r in recs),
         'namedOnSiteBusiness':sum(bool(r.get('usdotContext',{}).get('carrierName') or r.get('epaContext',{}).get('facilities')) for r in recs)})
        if row['tract'] in reports:row.update({'scanStatus':reports[row['tract']]['status'],'sourceCheckedAt':reports[row['tract']]['checkedAt']})
    out['enrichedAt']=full['checkedAt'];out['criteria']='Class 1/4A/4B parcels of at least 2 acres; earlier under-2-acre records remain in the separate research download'
    fields=list(dict.fromkeys(k for row in out['tracts'] for k in row));text=io.StringIO(newline='');writer=csv.DictWriter(text,fieldnames=fields,lineterminator='\n');writer.writeheader();writer.writerows(out['tracts'])
    return out,text.getvalue()

def main(argv=None):
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--input',default=str(DATA/'nj-parcel-research.json'));ap.add_argument('--out',default=str(ROOT/'.radar/nj-enrichment/full.json'))
    ap.add_argument('--scan-dir');ap.add_argument('--all',action='store_true');ap.add_argument('--refresh',action='store_true');ap.add_argument('--offline',action='store_true');ap.add_argument('--plan',action='store_true');ap.add_argument('--publish',action='store_true');ap.add_argument('--filings');ap.add_argument('--max-age-days',type=int,default=30);ap.add_argument('--max-filings-per-run',type=int,default=100)
    args=ap.parse_args(argv)
    if not 1<=args.max_filings_per_run<=1000:raise ValueError('Choose 1–1000 filing lookups per run')
    if not 1<=args.max_age_days<=90:raise ValueError('Choose freshness of 1–90 days')
    out=Path(args.out).resolve()
    if not out.is_relative_to(ROOT/'.radar'):raise ValueError('Working data/checkpoints must remain under .radar; use --publish for reviewed public outputs')
    full=merge_scans(load_full(args.input),args.scan_dir);resume(full,out.parent/'checkpoints');boundaries=json.loads((DATA/'nj-nomination-downloads/NJ_OZ2_2026_Nominations.geojson').read_text());coverage=json.loads((DATA/'nj-tract-coverage.json').read_text());plan=tract_plan(boundaries,coverage,full['records'],remaining=not args.all)
    for item in plan:
        for folder,key in [('priority-counts','latestCountCheck'),('priority-all-size-counts','allSizeCountCheck')]:
            source_file=out.parent/folder/(item['tract']+'.json')
            if source_file.exists():
                report=json.loads(source_file.read_text())
                if report.get('tract')==item['tract'] and report.get('countsOnly') and report.get('status')=='complete':item[key]={k:report[k] for k in ('checkedAt','expected','criteria')}
        if item.get('latestCountCheck',{}).get('expected')==0 and item.get('allSizeCountCheck',{}).get('expected',0)>0:item['zeroReason']=str(item['allSizeCountCheck']['expected'])+' class 1/4A/4B parcels exist below the 2-acre filter; zero does not mean no properties'
    atomic(out.parent/'plan.json',{'format':'RadarNJEnrichmentPlan','version':1,'createdAt':now(),'tracts':plan})
    if args.plan:print(json.dumps({'selectedTracts':sum(p['selected'] for p in plan),'records':len(full['records']),'plan':str(out.parent/'plan.json')}));return 0
    full,queue=enrich(full,plan,refresh=args.refresh,max_age=args.max_age_days,run_sources=not args.offline,filing_records=F.load_reviewed(args.filings),checkpoint=out.parent/'checkpoints',filing_limit=args.max_filings_per_run,filing_cache_path=out.parent/'filing-cache.json')
    atomic(out,full);atomic(out.with_suffix('.csv'),csv_text(full));atomic(out.parent/'business-filing-queue.json',queue)
    if args.publish:
        # Existing sharding contract is retained; no runtime/UI changes are needed.
        coverage_file=out.parent/'coverage.json';atomic(coverage_file,{'format':'RadarNJEnrichmentCoverage','version':1,**full['coverage']['enrichment']})
        tracts,tract_csv=update_tract_coverage(coverage,full);atomic(out.parent/'tract-coverage.json',tracts);atomic(out.parent/'tract-coverage.csv',tract_csv)
        subprocess.run(['node',str(ROOT/'scripts/publish-nj-research-shards.mjs'),'--in',str(out),'--csv',str(out.with_suffix('.csv')),'--coverage',str(coverage_file),'--filing-queue',str(out.parent/'business-filing-queue.json'),'--tract-coverage',str(out.parent/'tract-coverage.json'),'--tract-csv',str(out.parent/'tract-coverage.csv')],cwd=ROOT,check=True)
    print(json.dumps({'records':len(full['records']),'selectedTracts':sum(p['selected'] for p in plan),'pendingFilingEntities':len(queue['entities']),'roleCounts':full['coverage']['enrichment']['roleCounts'],'published':args.publish}));return 0
if __name__=='__main__':
    try:raise SystemExit(main())
    except Exception as exc:print('Enrichment not published: '+str(exc),file=sys.stderr);raise SystemExit(1)
