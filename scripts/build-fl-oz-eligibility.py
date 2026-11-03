"""Refresh published FloridaCommerce eligibility, never nominations/certifications.
No recommendation-form contacts are fetched. Atomic write after complete validation.
"""
import datetime as dt
import json
import os
from pathlib import Path
import re
import tempfile
import urllib.parse
import urllib.request

BASE='https://services1.arcgis.com/HpJC1O7FLVQlHgaG/arcgis/rest/services/'
LAYERS={'met':('oppzones_ustreasury_met',1367),'not-met':('oppzones_ustreasury_NotMet',3709)}
FIELDS=['GEOID','COUNTYFP','designatio','tract_pove','Median_Fam','MetroArea_']
PROGRAM='https://floridajobs.org/rural/opportunity-zones-program'
OUT=Path(__file__).resolve().parents[1]/'assets/data/fl-oz-eligibility.json'

def read(url):
    request=urllib.request.Request(url,headers={'User-Agent':'CapitalRadar-PublicEligibilityRefresh/1.0'})
    with urllib.request.urlopen(request,timeout=60) as response:data=json.load(response)
    if not isinstance(data,dict) or data.get('error'):raise ValueError('FloridaCommerce service response unavailable')
    return data

def numeric(value):
    if value is None:return None
    if isinstance(value,bool):raise ValueError('Unexpected boolean statistic')
    clean=re.sub(r'[$,\s]','',str(value))
    if not re.fullmatch(r'\d+(?:\.\d+)?',clean):return None
    return float(clean)

def build(*,reader=read,now=None):
    now=(now or dt.datetime.now(dt.timezone.utc)).replace(microsecond=0)
    records=[];sources={};seen=set()
    for status,(name,expected) in LAYERS.items():
        layer=BASE+name+'/FeatureServer/0'
        meta=reader(layer+'?f=json');available={f.get('name') for f in meta.get('fields',[])}
        if meta.get('geometryType')!='esriGeometryPolygon' or not set(FIELDS+['FID']).issubset(available):raise ValueError('FloridaCommerce eligibility schema changed')
        def query(q):return reader(layer+'/query?'+urllib.parse.urlencode({'f':'json',**q}))
        count=query({'where':'1=1','returnCountOnly':'true'}).get('count')
        if type(count) is not int or count!=expected:raise ValueError('FloridaCommerce scope changed; review eligibility baseline')
        rows=[]
        for offset in range(0,count,500):
            page=query({'where':'1=1','outFields':','.join(FIELDS),'returnGeometry':'false','orderByFields':'GEOID ASC','resultOffset':offset,'resultRecordCount':min(500,count-offset)})
            if not isinstance(page.get('features'),list) or len(page['features'])!=min(500,count-offset):raise ValueError('Incomplete FloridaCommerce eligibility page')
            rows.extend(f['attributes'] for f in page['features'])
        after=reader(layer+'?f=json')
        edited=meta['editingInfo']['lastEditDate']
        if after.get('editingInfo',{}).get('lastEditDate')!=edited:raise ValueError('FloridaCommerce source changed during retrieval')
        edit_date=dt.datetime.fromtimestamp(edited/1000,dt.timezone.utc).replace(microsecond=0)
        if edit_date>now:raise ValueError('Future source timestamp')
        sources[status]={'url':layer,'authority':'state-government','state':'FL','layerLastEdit':edit_date.isoformat().replace('+00:00','Z'),'expectedCount':expected}
        for r in rows:
            geoid=str(r['GEOID']);flag=str(r['designatio']).strip().lower()
            if not re.fullmatch(r'12\d{9}',geoid) or geoid in seen or str(r['COUNTYFP'])!=geoid[2:5]:raise ValueError('Conflicting, duplicate or invalid Florida tract identity')
            if flag not in ({'meets','meets criteria'} if status=='met' else {'does not meets criteria','does not meet criteria'}):raise ValueError('Unrecognized or conflicting Florida eligibility indicator')
            poverty=numeric(r['tract_pove'])
            if poverty is not None and not 0<=poverty<=1:raise ValueError('Poverty statistic is not a fraction')
            seen.add(geoid);records.append({'geoid':geoid,'criteria':status,'povertyRate':poverty,'medianFamilyIncome':numeric(r['Median_Fam']),'areaMedianFamilyIncome':numeric(r['MetroArea_'])})
    return {'version':1,'authority':'state-government','state':'FL','programURL':PROGRAM,'appId':'cbcc5a0156214cd4ae4607348282f9b1','webmapId':'2405328b68eb453497c1cb9565ca195b','label':'FloridaCommerce eligibility (not a nomination list)','checkedAt':now.isoformat().replace('+00:00','Z'),'validUntil':(now+dt.timedelta(days=89)).isoformat().replace('+00:00','Z'),'nominationVerified':False,'certificationVerified':False,'roundVerification':'Published eligibility reference; layer metadata does not independently establish federal OZ 2.0 qualification.','sources':sources,'recommendationsURL':BASE+'Join_Features_to_oppzones_recommend_tracts15/FeatureServer/0','records':sorted(records,key=lambda r:r['geoid'])}

def main():
    result=build()
    if OUT.exists():
        previous=json.loads(OUT.read_text());facts=lambda d:{k:v for k,v in d.items() if k not in ('checkedAt','validUntil')}
        expiry=dt.datetime.fromisoformat(previous['validUntil'].replace('Z','+00:00'))
        if facts(previous)==facts(result) and expiry>dt.datetime.now(dt.timezone.utc)+dt.timedelta(days=30):print('FloridaCommerce eligibility checked; facts unchanged and no renewal due.');return
    temporary=None
    try:
        with tempfile.NamedTemporaryFile(mode='w',dir=OUT.parent,suffix='.tmp',delete=False) as f:temporary=f.name;f.write(json.dumps(result,separators=(',',':'))+'\n')
        os.replace(temporary,OUT)
    finally:
        if temporary and os.path.exists(temporary):os.unlink(temporary)
    print('Updated',len(result['records']),'FloridaCommerce eligibility references; no nomination or certification inferred.')

if __name__=='__main__':main()
