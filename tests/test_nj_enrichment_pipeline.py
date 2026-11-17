"""Pipeline regressions: full scope, source failures, evidence roles and resumability."""
import copy, contextlib, datetime as dt, io, json, pathlib, sys, tempfile, unittest
ROOT=pathlib.Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
import nj_enrichment_pipeline as P
import nj_business_filings as F

URL='https://county.example/record';TRACT=P.PRIORITY[0]
def rec(n=1,muni='0907'):
 pin=f'{muni}_100_{n}'
 return {'parcelId':pin,'state':'NJ','facts':{'PAMS_PIN':pin,'PROP_CLASS':'4B','PROP_LOC':f'{n} MAIN ST','MUN_NAME':'KEARNY TOWN','COUNTY':'HUDSON','CALC_ACRE':5},'tractReferences':[TRACT],
 'geometry':{'type':'Polygon','coordinates':[[[-74.1,40.7],[-74.09,40.7],[-74.09,40.71],[-74.1,40.71],[-74.1,40.7]]]},
 'assessmentOwnerObservation':None,'mailingObservation':{'status':'observed','checkedAt':P.now(),'sourceURL':URL,'mailing':{'street':'10 MAIL RD','cityState':'EXAMPLE NJ','zip':'07000'}},
 'njdepContext':{'status':'observed','checkedAt':P.now(),'sites':[{'siteId':1,'siteName':'SITE LLC','insideParcel':True,'sourceURL':URL}], 'interests':[{'siteId':1,'programInterestId':2,'name':f'COMPANY {n} LLC','sourceURL':URL}]},'usdotContext':{},'epaContext':{}}
def full(records):return {'format':'RadarNJParcelResearch','version':1,'checkedAt':P.now(),'records':records,'coverage':{'partial':False}}
PLAN=[{'tract':TRACT,'selected':True}]
class Registry:
 failure=None
 def __init__(self):self.calls=[]
 def lookup(self,name):self.calls.append(name);return {'status':'no-exact-name-result','checkedAt':P.now()}
class DeadClient:
 def meta(self,*args):raise RuntimeError('source timeout')
 def query_all(self,*args,**kwargs):raise RuntimeError('source timeout')

def run(data,**kwargs):
 with contextlib.redirect_stdout(io.StringIO()):return P.enrich(data,PLAN,**kwargs)

class Enrichment(unittest.TestCase):
 def test_plan_has_exact_remaining_128_and_priorities(self):
  b=json.loads((ROOT/'assets/data/nj-nomination-downloads/NJ_OZ2_2026_Nominations.geojson').read_text());p=P.tract_plan(b,{},[])
  self.assertEqual(sum(x['selected'] for x in p),128);self.assertEqual([x['tract'] for x in p[:8]],P.PRIORITY)
  self.assertEqual(sum(x['selected'] for x in P.tract_plan(b,{},[],remaining=False)),130)
 def test_more_than_500_records_are_all_processed_not_sampled(self):
  d,q=run(full([rec(n) for n in range(1,504)]),run_sources=False)
  self.assertEqual(d['coverage']['enrichment']['selectedParcels'],503)
  self.assertTrue(all(r.get('evidence') and r['businessFilingContext']['status']=='pending' for r in d['records']))
  self.assertEqual(len(q['entities']),503)
 def test_roles_never_promote_regulatory_or_mailing_names_to_owner(self):
  r=P.add_roles(rec());self.assertIsNone(r['assessmentOwnerObservation'])
  self.assertEqual({e['role'] for e in r['evidence']},{'tax_mailing_recipient','njdep_regulatory_site','njdep_program_interest'})
  self.assertTrue(all(e['role']!='assessed_owner' for e in r['evidence']))
 def test_number_named_holding_llc_is_a_valid_filing_candidate(self):
  r=rec();r['assessmentOwnerObservation']={'name':'123 MAIN STREET LLC','sourceURL':URL,'checkedAt':P.now()}
  self.assertIn('123 MAIN STREET LLC',[x['name'] for x in P.company_candidates(r)])
 def test_source_officers_retain_company_dot_dates_and_not_title(self):
  r=rec();r['usdotContext']={'carrierName':'CARRIER LLC','dotNumber':'123','officers':['SYNTHETIC OFFICER'],'sourceURL':URL,'checkedAt':P.now(),'filingDate':'20110101','status':'INACTIVE'}
  e=[e for e in P.add_roles(r)['evidence'] if e['role']=='usdot_carrier_officer'][0]
  self.assertEqual((e['company'],e['dotNumber'],e['filingDate'],e['carrierStatus']),('CARRIER LLC','123','20110101','INACTIVE'))
  self.assertIsNone(r['assessmentOwnerObservation'])
 def test_placeholder_or_protected_mailing_never_becomes_recipient(self):
  r=rec();r['mailingObservation']['mailing']={'street':'UNKNOWN','cityState':'UNKNOWN','zip':'00000'}
  P.add_roles(r);self.assertIsNone(r['mailingObservation']['mailing']);self.assertNotIn('tax_mailing_recipient',[x['role'] for x in r['evidence']])
  r=rec();r['mailingObservation']['status']='protected';r['assessmentOwnerObservation']={'name':'OLD LLC','checkedAt':P.now(),'sourceURL':URL};P.add_roles(r)
  self.assertNotIn('assessed_owner',[x['role'] for x in r['evidence']]);self.assertEqual(P.company_candidates(r),[])
 def test_source_failure_retains_dates_and_values(self):
  r=rec();old=copy.deepcopy(r);P.refresh_mail([r],DeadClient());P.refresh_dep([r],DeadClient())
  self.assertEqual(r['mailingObservation']['checkedAt'],old['mailingObservation']['checkedAt']);self.assertEqual(r['njdepContext']['sites'],old['njdepContext']['sites'])
  self.assertEqual(r['njdepContext']['lastAttempt']['status'],'unavailable')
 def test_provider_denial_is_one_attempt_not_ninety_towns(self):
  calls=[]
  def blocked(town):calls.append(town);raise RuntimeError('Tunnel connection failed: 403 Forbidden')
  data=full([rec(1,'0907'),rec(2,'0801'),rec(3,'1301')]);registry=Registry()
  d,_=run(data,refresh=True,client=DeadClient(),fetch_carriers=blocked,registry=registry)
  self.assertEqual(len(calls),1);self.assertTrue(all(r['usdotContext']['lastAttempt']['status']=='unavailable' for r in d['records']))
 def test_filing_budget_and_cached_empty_results_resume_next_company(self):
  data=full([rec(1),rec(2),rec(3)]);registry=Registry()
  # Source dates are fresh; only the business filing stage requires these calls.
  for r in data['records']:r['usdotContext']={'checkedAt':P.now()}
  with tempfile.TemporaryDirectory() as directory:
   cache=pathlib.Path(directory)/'filings.json'
   run(data,registry=registry,filing_limit=1,filing_cache_path=cache);self.assertEqual(registry.calls,['COMPANY 1 LLC'])
   registry2=Registry();run(data,registry=registry2,filing_limit=1,filing_cache_path=cache);self.assertEqual(registry2.calls,['COMPANY 2 LLC'])
 def test_carrier_wrong_state_or_city_is_not_associated(self):
  r=rec();registry=Registry()
  def carriers(town):return [{'phy_state':'NY','phy_city':'KEARNY','phy_street':'1 MAIN ST','legal_name':'FOREIGN LLC','dot_number':'1'},{'phy_state':'NJ','phy_city':'ELSEWHERE','phy_street':'1 MAIN ST','legal_name':'WRONG CITY LLC','dot_number':'2'}]
  d,_=run(full([r]),fetch_carriers=carriers,registry=registry)
  self.assertFalse(d['records'][0]['usdotContext'].get('carrierName'))
 def test_wrong_company_filing_cannot_enter_through_mapping_key(self):
  with self.assertRaises(ValueError):run(full([rec()]),run_sources=False,filing_records={'COMPANY1LLC':{'status':'observed','entityName':'UNRELATED LLC'}})
 def test_resume_preserves_null_owner_and_skips_changed_input(self):
  r=rec();data=full([copy.deepcopy(r)])
  checkpoint={'format':'RadarNJEnrichmentCheckpoint','version':1,'records':[r],'inputDigests':{r['parcelId']:P.input_digest(r)}}
  with tempfile.TemporaryDirectory() as directory:
   pathlib.Path(directory,'0907.json').write_text(json.dumps(checkpoint));self.assertEqual(P.resume(data,directory),1);self.assertIsNone(data['records'][0]['assessmentOwnerObservation'])
   data['records'][0]['facts']['PROP_LOC']='CHANGED';self.assertEqual(P.resume(data,directory),0)
 def test_resume_will_not_replace_newer_live_source(self):
  r=rec();saved=copy.deepcopy(r);saved['mailingObservation']['checkedAt']='2020-01-01T00:00:00Z';saved['mailingObservation']['mailing']['street']='OLD MAIL RD'
  cp={'format':'RadarNJEnrichmentCheckpoint','version':1,'records':[saved],'inputDigests':{r['parcelId']:P.input_digest(r)}}
  with tempfile.TemporaryDirectory() as directory:
   pathlib.Path(directory,'0907.json').write_text(json.dumps(cp));data=full([r]);P.resume(data,directory);self.assertEqual(data['records'][0]['mailingObservation']['mailing']['street'],'10 MAIL RD')
 def test_multipart_rows_merge_without_adding_acreage(self):
  r=rec();features=[]
  for i in [1,2]:features.append({'type':'Feature','properties':{**r['facts'],'OBJECTID':i,'OWNER_NAME':'','ST_ADDRESS':'MAIL RD','CITY_STATE':'NJ','ZIP_CODE':'07000'},'geometry':r['geometry']})
  report={'tract':TRACT,'status':'complete','received':2,'expected':2,'checkedAt':P.now(),'features':features,'oidField':'OBJECTID'}
  with tempfile.TemporaryDirectory() as directory:
   p=pathlib.Path(directory,'tract.json');p.write_text(json.dumps(report));d=P.merge_scans(full([]),directory);self.assertEqual(len(d['records']),1);self.assertEqual(d['records'][0]['facts']['CALC_ACRE'],5)
   report['features'][1]['properties']['ST_ADDRESS']='DIFFERENT';p.write_text(json.dumps(report));self.assertRaises(ValueError,P.merge_scans,full([]),directory)
 def test_counts_only_reports_cannot_replace_parcels(self):
  with tempfile.TemporaryDirectory() as directory:
   pathlib.Path(directory,'tract.json').write_text(json.dumps({'countsOnly':True,'status':'complete','received':0,'expected':100}))
   self.assertEqual(len(P.merge_scans(full([rec()]),directory)['records']),1)
 def test_csv_contains_requested_roles_and_provenance_and_no_formula(self):
  r=rec();r['facts']['PROP_LOC']='=HYPERLINK("evil")';r=P.add_roles(r);text=P.csv_text(full([r]));rows=list(__import__('csv').DictReader(io.StringIO(text)))
  self.assertEqual(rows[0]['TAX_MAILING_ROLE'],'tax_mailing_recipient');self.assertEqual(rows[0]['ASSESSMENT_ENTITY_NAME'],'');self.assertIn('NJDEP_REGULATORY_SITE_NAMES',rows[0]);self.assertTrue(rows[0]['PROP_LOC'].startswith("'="))
 def test_mailing_groups_preserve_suite_and_do_not_group_unknowns(self):
  a,b,c=rec(1),rec(2),rec(3)
  a['mailingObservation']['mailing']['street']='10 MAIL RD STE 100'
  b['mailingObservation']['mailing']['street']='10 MAIL RD STE 200'
  self.assertEqual(P.mailing_groups([a,b]),[])
  c['mailingObservation']['mailing']['street']='10 MAIL RD STE 100'
  self.assertEqual(P.mailing_groups([a,b,c])[0]['parcelIds'],[a['parcelId'],c['parcelId']])
 def test_freshness_rejects_future_or_unknown_dates(self):
  self.assertFalse(P.fresh('2099-01-01'));self.assertFalse(P.fresh(None));self.assertTrue(P.fresh(P.now()))

class BusinessFilings(unittest.TestCase):
 def row(self):return {'entityName':'WAREHOUSE LLC','entityId':'0000123456','registeredAgentName':'SYNTHETIC AGENT','sourceURL':'https://www.njportal.com/DOR/BusinessNameSearch/Entity/0000123456','observedAt':P.now(),'reviewed':True,'sourceFields':{'entityName':'WAREHOUSE LLC','entityId':'0000123456','registeredAgentName':'SYNTHETIC AGENT'}}
 def test_registered_agent_is_a_filing_role_not_owner(self):
  row=F.validate_filing(self.row(),'Warehouse LLC');self.assertEqual(row['registeredAgent']['role'],'state_registered_agent');self.assertNotIn('owner',row);self.assertEqual(row['verification'],'user-reviewed-official-copy')
 def test_wrong_entity_number_source_or_unreviewed_copy_is_rejected(self):
  self.assertRaises(ValueError,F.validate_filing,self.row(),'RELATED WAREHOUSE LLC')
  for update in [{'entityId':'9999999999'},{'reviewed':False},{'sourceURL':F.PORTAL},{'sourceURL':'https://njportal.com.evil.example/entity'},{'observedAt':'2099-01-01'}]:self.assertRaises(ValueError,F.validate_filing,{**self.row(),**update},'WAREHOUSE LLC')
 def test_detail_requires_explicit_labels_not_footer_contact_guess(self):
  html='<table><tr><td>Entity Name</td><td>WAREHOUSE LLC</td></tr><tr><td>Entity ID</td><td>0000123456</td></tr><tr><td>Registered Agent Name</td><td>SYNTHETIC AGENT</td></tr></table><footer>Phone 555-123-4567</footer>'
  d=F.parse_detail(html,'WAREHOUSE LLC',self.row()['sourceURL']);self.assertEqual(d['contacts'],[]);self.assertEqual(d['registeredAgent']['name'],'SYNTHETIC AGENT')
 def test_official_search_is_schema_driven_and_posts_anonymous_token(self):
  responses=['<form method="post" action="/DOR/BusinessNameSearch/Search/BusinessName"><input type="hidden" name="token" value="test"><input name="BusinessName"></form>', '<a href="/DOR/BusinessNameSearch/Entity/0000123456">WAREHOUSE LLC</a>', '<table><tr><td>Entity Name</td><td>WAREHOUSE LLC</td></tr><tr><td>Entity ID</td><td>0000123456</td></tr></table>'];calls=[]
  class Response(io.BytesIO):
   def __init__(self,body,url):super().__init__(body.encode());self.url=url
   def __enter__(self):return self
   def __exit__(self,*args):return False
  def opener(request,timeout):calls.append(request);return Response(responses[len(calls)-1],request.full_url)
  r=F.Registry(opener).lookup('WAREHOUSE LLC');self.assertEqual(r['status'],'observed');self.assertIn(b'BusinessName=WAREHOUSE+LLC',calls[1].data)
 def test_unavailable_portal_never_becomes_no_company_and_only_tried_once(self):
  calls=[]
  def opener(*args,**kwargs):calls.append(1);raise RuntimeError('403 proxy denial')
  registry=F.Registry(opener);self.assertEqual(registry.lookup('A LLC')['status'],'unavailable');self.assertEqual(registry.lookup('B LLC')['status'],'unavailable');self.assertEqual(len(calls),1)
 def test_non_trucking_company_can_resolve_an_imported_registered_agent(self):
  r=rec();r['njdepContext']['interests'][0]['name']='WAREHOUSE LLC';f=F.validate_filing(self.row(),'WAREHOUSE LLC');d,_=run(full([r]),run_sources=False,filing_records={F.canonical('WAREHOUSE LLC'):f})
  evidence=d['records'][0]['evidence'];self.assertTrue(any(e['role']=='state_registered_agent' and e['value']=='SYNTHETIC AGENT' for e in evidence));self.assertIsNone(d['records'][0]['assessmentOwnerObservation'])

if __name__=='__main__':unittest.main()
