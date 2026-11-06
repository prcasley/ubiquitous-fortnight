#!/usr/bin/env python3
"""Public Florida parcel facts and due-diligence queues; never seller-propensity predictions."""
import argparse,csv,datetime as dt,json,math,re,sys
from pathlib import Path
from nj_parcel_leads import Client,ORG,ROOT
PBC='https://services1.arcgis.com/ZWOoUZbtaYePLlPw/arcgis/rest/services/Parcels_and_Property_Details_WebMercator/FeatureServer/0/query'
FIELDS='PARID,SITE_ADDR_STR,MUNICIPALITY,PROPERTY_USE,CONDO,ACRES,YRBLT,OWNER_NAME1,OWNER_NAME2,PADDR1,PADDR2,PADDR3,CITYNAME,STATE,ZIP1,CONFID_FLG,SALE_DATE,PRICE,BOOK,PAGE,TOTAL_MARKET'
SUNBIZ='https://search.sunbiz.org/Inquiry/CorporationSearch/ByName'

def parcel_id(value):
    s=str(value or '').strip()
    if not re.fullmatch(r'\d{15,17}',s):raise ValueError('Use a 15–17 digit PBC parcel ID as text; scientific/decimal identifiers cannot be reconstructed safely')
    return s.zfill(17)

def date_value(value,today=None):
    today=today or dt.date.today()
    if value is None or str(value).strip() in ('','nan','None'):return None
    try:
        s=str(value).strip()
        if re.fullmatch(r'\d{12,13}',s):d=dt.datetime.fromtimestamp(int(s)/1000,dt.timezone.utc).date()
        else:d=dt.date.fromisoformat(s[:10])
        return d if dt.date(1800,1,1)<=d<=today and d!=dt.date(1979,1,1) else None
    except (ValueError,OverflowError,OSError):return None

def num(value):
    try:
        n=float(str(value).replace(',','').strip())
        return n if math.isfinite(n) and n>=0 else None
    except (ValueError,TypeError):return None

def review(row,today=None):
    today=today or dt.date.today();r=dict(row);r['PARID']=parcel_id(r.get('PARID'))
    flags=[]
    if r.get('SOURCE_CONFLICT_FIELDS'):flags.append('Source rows disagree on: '+str(r['SOURCE_CONFLICT_FIELDS'])+'; conflicting values withheld pending record review')
    owner=str(r.get('OWNER_OF_RECORD') or '').strip();protected=bool(re.match(r'^(CONFIDENTIAL|REDACTED|PROTECTED|WITHHELD)\b',owner,re.I)) or str(r.get('CONFID_FLG') or '').upper() in ('Y','YES','TRUE','1')
    if protected:
        owner='';r['OWNER_OF_RECORD']='';r['OWNER_LINE_2']='';r['TAX_BILL_MAILING']=''
    text=str(r.get('LAST_SALE') or '')
    source_date=r.get('SALE_DATE') or (re.match(r'^(\d{4}-\d{2}-\d{2})',text).group(1) if re.match(r'^(\d{4}-\d{2}-\d{2})',text) else None)
    date=date_value(source_date,today);price=num(r.get('SALE_PRICE'))
    if price is None:
        match=re.search(r'\$([\d,]+(?:\.\d+)?)',text);price=num(match.group(1)) if match else None
    nominal=price is not None and 0<price<=100
    if nominal:flags.append('Low-consideration recorded transfer: review the deed; no inheritance/restructuring motive inferred')
    if not date:flags.append('Recorded transfer date unavailable or invalid; holding period and loan maturity unknown')
    year=num(r.get('YEAR_BUILT'))
    if year is not None and 1800<=year<=today.year and year<1990:flags.append('Published older building year: inspect physical condition and capacity')
    history=str(r.get('FDEP_RECORDS') or '')
    if re.search(r'older|closed|expired|tanks closed',history,re.I):flags.append('Imported regulatory history mentions older/closed records: verify source, permits and environmental condition; vacancy is unknown')
    if str(r.get('USE') or '').upper()=='VACANT COMMERCIAL LAND':flags.append('Vacant commercial assessment use: confirm industrial zoning and permitted outdoor storage before shortlisting')
    organization=bool(ORG.search(owner.upper())) and not re.search(r'\b(?:FAMILY|LIVING|REVOCABLE|PERSONAL)\s+TRUST\b',owner,re.I)
    route='Review cited tax/deed records; use public business contact evidence only'
    if organization:route='Search the exact published assessment entity in Sunbiz; verify filing status and disclosed roles before identifying a business contact'
    if r.get('OWNER_LINE_2'):route+='; verify the care-of/billing recipient role separately'
    r.update({'OWNER_OF_RECORD':owner,'ASSESSMENT_NAME_STATUS':'protected' if protected else 'published-assessment-observation' if owner else 'not-published',
      'RECORDED_TRANSFER_DATE':date.isoformat() if date else '', 'YEARS_SINCE_RECORDED_TRANSFER':round((today-date).days/365.2425,2) if date else '',
      'TRANSFER_PRICE_REFERENCE':price if price is not None and not nominal and price>0 else '', 'TRANSFER_REVIEW':'low-consideration; not a market-price comparable' if nominal else 'recorded reference only; validity not verified',
      'DUE_DILIGENCE_FLAGS':' | '.join(flags),'DUE_DILIGENCE_FLAG_COUNT':len(flags),'REVIEW_QUEUE':'Review evidence gaps' if flags else 'Baseline verification',
      'SUNBIZ_ENTITY_SEARCH_URL':SUNBIZ if organization and not protected else '', 'REGISTRY_LINK_STATUS':'Search portal, not a verified exact filing or decision-maker match' if organization and not protected else 'No automatic individual-principal research',
      'CONTACT_RESEARCH_ROUTE':route,'AVAILABILITY_STATUS':'Not established','DEBT_MATURITY_STATUS':'Not established','OWNER_OPERATOR_RELATIONSHIP':'Not established',
      'REVIEWED_AT':dt.datetime.now(dt.timezone.utc).isoformat(),'REVIEW_CAVEAT':'Research workload flags, not seller motivation, acquisition likelihood, vacancy, current operation, tax basis or a recommendation. Recorded transfer history is not the current owner holding period. Shared mailing is not common ownership. County assessment names are not verified title; use labels do not establish zoning or industrial approvals.'})
    # Do not propagate the report's unsupported scores/relationship labels as current output.
    for k in ['ACQUISITION_PROPENSITY_SCORE','ACQUISITION_TIER','HOLD_YEARS','OWNER_ALSO_OPERATES_HERE','CURRENT_BUSINESSES_ON_SITE','OUTREACH_PLAYBOOK','FDEP_STATUS','IS_INSTITUTIONAL_OR_GOV','OWNER_TYPE','OTHER_PARCELS_SAME_OWNER','SAME_OWNER_PARIDS','OTHER_PARCELS_SAME_MAILING_ONLY','SAME_MAILING_PARIDS']:
        if k in r:r['INPUT_'+k]=r.pop(k)
    return r

def reconcile(features):
    by_id={}
    for f in features:
        a=f['attributes'];id=parcel_id(a['PARID']);a={k:a.get(k) for k in FIELDS.split(',')};a['PARID']=id
        if id not in by_id:by_id[id]={'attributes':a,'conflicts':set(),'pieces':1}
        else:
            entry=by_id[id];entry['pieces']+=1
            for k in a:
                if entry['attributes'].get(k)!=a.get(k):entry['conflicts'].add(k)
    for id,entry in by_id.items():
        for k in entry['conflicts']:
            entry['attributes'][k]='Y' if k=='CONFID_FLG' else None
        entry['attributes']['PARID']=id
    return by_id

def live_rows(min_acres=1,include_vacant_commercial=False,pins=None):
    c=Client();where="MUNICIPALITY IN ('WEST PALM BEACH','MANGONIA PARK') AND CONDO = 'NO' AND ACRES >= "+str(min_acres)+" AND (PROPERTY_USE LIKE '%WAREH%' OR PROPERTY_USE LIKE '%MFG%' OR PROPERTY_USE LIKE '%INDUST%' OR PROPERTY_USE LIKE '%STORAGE%')"
    if pins:
        if len(pins)>1000:raise ValueError('Use at most 1000 exact parcel IDs')
        features=[]
        for start in range(0,len(pins),100):
            batch=[parcel_id(p) for p in pins[start:start+100]]
            selected=c.query_all(PBC,{'where':"PARID IN ("+','.join("'"+p+"'" for p in batch)+")",'outFields':FIELDS,'returnGeometry':'false'},cap=5000)
            if any(parcel_id(f['attributes']['PARID']) not in batch for f in selected):raise RuntimeError('Exact-ID query returned an unrelated parcel')
            features+=selected
    else:
        if include_vacant_commercial:where=where[:-1]+" OR PROPERTY_USE = 'VACANT COMMERCIAL LAND')"
        features=c.query_all(PBC,{'where':where,'outFields':FIELDS,'returnGeometry':'false'},cap=5000)
    rows=[];entries=reconcile(features)
    for id,entry in entries.items():
        a=entry['attributes']
        rows.append({'PARID':id,'SOURCE_ROW_PIECES':entry['pieces'],'SOURCE_CONFLICT_FIELDS':'; '.join(sorted(entry['conflicts'])),'PROPERTY_ADDRESS':a.get('SITE_ADDR_STR'),'MUNICIPALITY':a.get('MUNICIPALITY'),'USE':a.get('PROPERTY_USE'),'ACRES':a.get('ACRES'),'YEAR_BUILT':a.get('YRBLT'),'OWNER_OF_RECORD':a.get('OWNER_NAME1'),'OWNER_LINE_2':a.get('OWNER_NAME2'),'CONFID_FLG':a.get('CONFID_FLG'),'TAX_BILL_MAILING':', '.join(str(a[k]) for k in ['PADDR1','PADDR2','PADDR3','CITYNAME','STATE','ZIP1'] if a.get(k)),'SALE_DATE':a.get('SALE_DATE'),'SALE_PRICE':a.get('PRICE'),'DEED_BOOK':a.get('BOOK'),'DEED_PAGE':a.get('PAGE'),'COUNTY_MARKET_ASSESSMENT':a.get('TOTAL_MARKET'),'FDEP_RECORDS':'','REGULATORY_SOURCE_STATUS':'Not connected in this fresh parcel-only scan','SOURCE_URL':PBC,'SOURCE_CHECKED_AT':dt.datetime.now(dt.timezone.utc).isoformat()})
    return rows,{'scope':('Exact supplied parcel IDs; source facts regardless of acreage/type' if pins else 'Entire named-source WPB/Mangonia records; CONDO=NO, industrial'+('/vacant commercial' if include_vacant_commercial else '')+' use labels, minimum '+str(min_acres)+' acres. Not an 8-mile radius or the unprovided 803-row input.'),'source_counts':c.counts,'unique_parcels':len(entries),'duplicate_source_rows':len(features)-len(entries),'conflicting_parcels':sum(bool(e['conflicts']) for e in entries.values())}

def main():
    ap=argparse.ArgumentParser(description=__doc__);group=ap.add_mutually_exclusive_group(required=True);group.add_argument('--csv');group.add_argument('--live-pbc',action='store_true');ap.add_argument('--min-acres',type=float,default=1);ap.add_argument('--include-vacant-commercial',action='store_true');ap.add_argument('--out',default=str(ROOT/'.radar/oz-research/fl-parcel-review.csv'));args=ap.parse_args()
    if not math.isfinite(args.min_acres) or args.min_acres<0:ap.error('Use a nonnegative acreage minimum')
    dest=Path(args.out).resolve()
    if dest.is_relative_to(ROOT) and not dest.is_relative_to(ROOT/'.radar'):ap.error('Output stays local under .radar; do not overwrite public datasets')
    if args.csv:
        with open(args.csv,newline='',encoding='utf-8-sig') as f:rows=list(csv.DictReader(f))
        if len(rows)>5000:raise ValueError('Use at most 5000 input records')
        stats={'scope':'Supplied local CSV; input assertions require independent source verification','input_records':len(rows)}
    else:rows,stats=live_rows(args.min_acres,args.include_vacant_commercial)
    reviewed=[review(row) for row in rows];reviewed.sort(key=lambda r:(-r['DUE_DILIGENCE_FLAG_COUNT'],-(num(r.get('ACRES')) or 0)))
    columns=list(dict.fromkeys(k for r in reviewed for k in r)) or ['PARID'];dest.parent.mkdir(parents=True,exist_ok=True);temp=dest.with_name(dest.name+'.tmp')
    with temp.open('w',newline='',encoding='utf8') as f:
        temp.chmod(0o600);w=csv.DictWriter(f,fieldnames=columns);w.writeheader()
        for r in reviewed:w.writerow({k:"'"+str(v) if re.match(r'^[=+\-@\t\r]',str(v or '')) else v for k,v in r.items()})
    temp.replace(dest);stats.update({'records':len(reviewed),'checked_at':dt.datetime.now(dt.timezone.utc).isoformat(),'note':'No seller prediction, skip tracing, phone/email enrichment or automatic outreach.'});dest.with_suffix('.coverage.json').write_text(json.dumps(stats,indent=2)+'\n');print(json.dumps({**stats,'out':str(dest)}))
if __name__=='__main__':main()
