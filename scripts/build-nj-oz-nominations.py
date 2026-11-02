"""Refresh the NJ OZ 2.0 state-nomination evidence bundle from the official NJ DCA layer.
Run: python3 scripts/build-nj-oz-nominations.py   (records expire 90 days after checkedAt; re-run to refresh)."""
import json,urllib.request,urllib.parse,datetime,pathlib,os,tempfile,re
LAYER='https://services.arcgis.com/Aur8tCo478N3VovT/arcgis/rest/services/2026_Opportunity_Zone_2_0_Nominations/FeatureServer/0'
ANNOUNCEMENT='https://www.nj.gov/dca/news/news/2026/20261029.shtml'
OUT=pathlib.Path(__file__).resolve().parents[1]/'assets'/'data'/'oz-designation-evidence.json'
def get(q):return json.load(urllib.request.urlopen(LAYER+'/query?'+urllib.parse.urlencode(q),timeout=60))
meta=json.load(urllib.request.urlopen(LAYER+'?f=json',timeout=60))
rows=[f['attributes'] for f in get({'where':'1=1','outFields':'OBJECTID,Geography,County,Municipality,Rural','returnGeometry':'false','orderByFields':'Geography','f':'json'})['features']]
count=get({'where':'1=1','returnCountOnly':'true','f':'json'})['count']
if len(rows)!=count or count!=130:raise ValueError('Nomination count changed or response was truncated; review before replacing evidence')
if len({str(r['Geography']) for r in rows})!=count:raise ValueError('Repeated tract identities')
if not all(re.fullmatch(r'34\d{9}',str(r['Geography'])) for r in rows):raise ValueError('Invalid NJ tract identity')
now=datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0)
checked=now.isoformat().replace('+00:00','Z');until=(now+datetime.timedelta(days=89)).isoformat().replace('+00:00','Z')
edited=datetime.datetime.fromtimestamp(meta['editingInfo']['lastEditDate']/1000,datetime.timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z')
bundle={'version':1,'round':'2027',
 'sources':{'nj-dca-oz2-nominations':{'enabled':True,'name':'NJ Department of Community Affairs · 2026 Opportunity Zone 2.0 Nominations','origin':'https://services.arcgis.com','pathPrefix':'/Aur8tCo478N3VovT/arcgis/rest/services/2026_Opportunity_Zone_2_0_Nominations/','authority':'state-government','state':'NJ','announcement':ANNOUNCEMENT,'layer':LAYER,'layerLastEdit':edited}},
 'records':[{'geoid':str(r['Geography']),'round':'2027','stage':'state-nominated','sourceId':'nj-dca-oz2-nominations','recordId':'NJDCA-OZ2-NOM-'+str(r['OBJECTID']),
   'sourceURL':LAYER+'/query?'+urllib.parse.urlencode({'where':"Geography='"+str(r['Geography'])+"'",'outFields':'*','f':'json'}),
   'publishedAt':'2026-10-28T00:00:00Z','checkedAt':checked,'validUntil':until,'county':r['County'],'municipality':r['Municipality'],'sourceRuralFlag':r['Rural']} for r in rows],
 'notice':'New Jersey state nominations (130 tracts, submitted to Treasury Oct 28, 2026) are connected from the official NJ DCA layer, checked '+checked[:10]+'. Nomination is not Treasury certification. Florida and Pennsylvania nominations and all federal certifications are not connected.'}
with tempfile.NamedTemporaryFile(mode='w',dir=OUT.parent,suffix='.tmp',delete=False) as f:
    f.write(json.dumps(bundle,indent=1)+'\n');tmp=f.name
os.replace(tmp,OUT)
print('wrote',OUT,len(bundle['records']),'records; valid until',until)
