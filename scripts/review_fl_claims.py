#!/usr/bin/env python3
"""Compare local parcel/filing claims to fresh public county facts. Filing roles stay unverified."""
import argparse,csv,datetime as dt,json,re,urllib.parse
from pathlib import Path
from fl_parcel_review import live_rows,review,parcel_id,PBC,ROOT
from nj_parcel_leads import norm_addr
REGISTRY='https://search.sunbiz.org/Inquiry/CorporationSearch/ByDocumentNumber'

def compare(claim,source):
    out={**claim};id=parcel_id(claim['PARID']);out['PARID']=id
    if not source:
        return {**out,'COUNTY_MATCH_STATUS':'Exact ID not returned; verify PCN','REGISTRY_VERIFICATION_STATUS':'Unverified; no filing retrieved'}
    facts=review(source);out.update(facts);protected=facts['ASSESSMENT_NAME_STATUS']=='protected'
    norm=lambda s:re.sub(r'[^A-Z0-9]','',str(s or '').upper())
    expected_name=norm(claim.get('CLAIMED_ASSESSMENT_NAME'));published_name=norm(facts.get('OWNER_OF_RECORD'))
    name_result='Source protected' if protected else 'Claim or published name unavailable'
    if not protected and expected_name and published_name:
        name_result='Matches published assessment name text; title not verified' if expected_name==published_name else 'Matches combined published name lines; entity roles unverified' if expected_name==norm(str(facts.get('OWNER_OF_RECORD') or '')+' '+str(facts.get('OWNER_LINE_2') or '')) else 'Differs from published assessment name; review source'
    out.update({'COUNTY_MATCH_STATUS':'Exact parcel ID returned','ADDRESS_CLAIM_COMPARISON':'Text matches after suffix normalization' if norm_addr(claim.get('CLAIMED_ADDRESS'))==norm_addr(facts.get('PROPERTY_ADDRESS')) else 'Text differs; review official situs',
      'OWNER_NAME_CLAIM_COMPARISON':name_result,
      'USE_CLAIM_COMPARISON':'Matches source use label' if norm(claim.get('CLAIMED_USE'))==norm(facts.get('USE')) else 'Differs from source use label',
      'REGISTRY_DOCUMENT_SEARCH_URL':REGISTRY if claim.get('CLAIMED_DOCUMENT_NUMBERS') else '',
      'REGISTRY_VERIFICATION_STATUS':'Unverified; no current filing retrieved. Claimed officers and document numbers are not confirmed',
      'DECISION_MAKER_STATUS':'Not established; manager/officer/registered-agent roles do not establish acquisition authority or beneficial ownership',
      'ASSEMBLY_CONTROL_STATUS':'Not established; common mailing or names do not establish common control or parcel contiguity',
      'SOURCE_URL':PBC+'?'+urllib.parse.urlencode({'f':'pjson','where':"PARID = '"+id+"'",'outFields':'PARID,SITE_ADDR_STR,OWNER_NAME1,OWNER_NAME2,CONFID_FLG,ACRES,PROPERTY_USE','returnGeometry':'false'})})
    try:out['ACREAGE_CLAIM_COMPARISON']='Within 0.02-acre rounding' if abs(float(claim.get('CLAIMED_ACRES'))-float(facts.get('ACRES')))<=.02 else 'Differs from source acreage; review required'
    except (TypeError,ValueError):out['ACREAGE_CLAIM_COMPARISON']='Unavailable/conflicting acreage; no match claimed'
    return out

def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--claims',required=True);ap.add_argument('--out',default=str(ROOT/'.radar/oz-research/fl-target-claims-review.csv'));args=ap.parse_args();data=json.loads(Path(args.claims).read_text());claims=data.get('records')
    if data.get('format')!='RadarFLTargetClaims' or not isinstance(claims,list) or not 1<=len(claims)<=1000:raise ValueError('Use 1–1000 local RadarFLTargetClaims records')
    ids=[parcel_id(c['PARID']) for c in claims]
    if len(set(ids))!=len(ids):raise ValueError('Repeated claimed parcel IDs require review')
    dest=Path(args.out).resolve()
    if dest.is_relative_to(ROOT) and not dest.is_relative_to(ROOT/'.radar'):ap.error('Claims remain local; public output requires separate review')
    rows,coverage=live_rows(pins=ids);by_id={r['PARID']:r for r in rows};output=[compare(c,by_id.get(parcel_id(c['PARID']))) for c in claims];fields=list(dict.fromkeys(k for r in output for k in r));dest.parent.mkdir(parents=True,exist_ok=True);temp=dest.with_name(dest.name+'.tmp')
    with temp.open('w',newline='') as f:
        temp.chmod(0o600);w=csv.DictWriter(f,fieldnames=fields);w.writeheader()
        for row in output:w.writerow({k:(json.dumps(v) if isinstance(v,list) else "'"+str(v) if re.match(r'^[=+\-@\t\r]',str(v or '')) else v) for k,v in row.items()})
    temp.replace(dest);coverage.update({'claims':len(claims),'county_matched':len(rows),'registry_verified':0,'checked_at':dt.datetime.now(dt.timezone.utc).isoformat(),'note':'Input role claims remain unverified and local; no individual contacts, personal skip tracing or owner inference.'});dest.with_suffix('.coverage.json').write_text(json.dumps(coverage,indent=2)+'\n');print(json.dumps(coverage))
if __name__=='__main__':main()
