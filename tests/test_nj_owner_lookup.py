import copy,csv,importlib.util,json,tempfile,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];spec=importlib.util.spec_from_file_location('owner_pipeline',ROOT/'scripts/build_nj_owner_lookup.py');P=importlib.util.module_from_spec(spec);spec.loader.exec_module(P)
class OwnerPipelineTests(unittest.TestCase):
 def reader(self,url,params=None,post=False):
  if not url.endswith('/query'):return {'objectIdField':'OBJECTID','fields':[{'name':x,'type':'esriFieldTypeString'} for x in P.FIELDS+['OBJECTID']]}
  if params.get('returnCountOnly'):return {'count':2}
  if params.get('returnIdsOnly'):return {'objectIds':[2,1]}
  assert post and '*' not in params['outFields'] and 'MUN_CODE' not in params['outFields']
  return {'features':[{'attributes':{'OBJECTID':i,'PAMS_PIN':f'0909_21_{i}_C0001','PROP_CLASS':'4B','OWNER_NAME':'ALPHA LLC' if i==1 else '', 'ST_ADDRESS':'1 Main St STE 100','CITY_STATE':'Secaucus NJ','ZIP_CODE':'07094'}} for i in map(int,params['objectIds'].split(','))]}
 def test_exact_qualifiers_and_no_empty_identity(self):
  self.assertEqual(P.pin('909','21.00','2.030','C0001'),'0909_21_2.03_C0001');self.assertIsNone(P.pin('','',''));self.assertFalse(P.valid_pin('___'))
 def test_private_bounded_export_never_propagates_owner_via_shared_mail(self):
  records,meta=P.collect(['4B'],['Hudson'],0,1,reader=self.reader);self.assertTrue(meta['partial']);self.assertEqual(len(records),1)
  records,meta=P.collect(['4B'],['Hudson'],0,5,reader=self.reader);self.assertFalse(meta['partial']);self.assertEqual(records['0909_21_2_C0001']['evidence'],[]);self.assertNotIn('ownerName',records['0909_21_2_C0001'])
 def test_missing_chunk_fails_instead_of_writing_incomplete_complete_dataset(self):
  def bad(url,params=None,post=False):
   result=self.reader(url,params,post)
   if post:result['features']=result['features'][:-1]
   return result
  with self.assertRaises(ValueError):P.collect(['4B'],['Hudson'],0,5,reader=bad)
 def test_csv_sale_party_is_not_current_owner_and_qualifier_is_never_dropped(self):
  records={'0909_21_1_C0001':{'evidence':[]},'0909_21_1':{'evidence':[]}}
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'source.csv';p.write_text('PAMS_PIN,GRANTEE,SOURCE_DATE\n0909_21_1_C0001,HISTORICAL BUYER LLC,2018-01-01\n')
   result=P.ingest_csvs(records,d,'https://county.example/deed');self.assertEqual(result['matchedEvidence'],1);self.assertEqual(records['0909_21_1']['evidence'],[]);e=records['0909_21_1_C0001']['evidence'][0];self.assertEqual(e['kind'],'recorded-sale-party');self.assertEqual(e['observedAt'],'2018-01-01');self.assertNotIn('ownerName',records['0909_21_1_C0001'])
 def test_public_output_paths_are_rejected_and_local_writes_are_atomic(self):
  with self.assertRaises(ValueError):P.write_local({},ROOT/'assets/data/nj_industrial_owners.json')
  with tempfile.TemporaryDirectory() as d:
   out=Path(d)/'evidence.json';P.write_local({'before':1},out)
   with self.assertRaises(ValueError):P.write_local({'bad':float('nan')},out)
   self.assertEqual(json.loads(out.read_text()),{'before':1})
 def test_suite_and_street_type_are_not_erased_in_mailing_associations(self):
  a={'street':'1 Main ST STE 100','cityState':'Secaucus NJ','zip':'07094'};b=a|{'street':'1 Main ST STE 200'};self.assertNotEqual(P.mail_key(a),P.mail_key(b));self.assertNotEqual(P.mail_key(a),P.mail_key(a|{'street':'1 Main AVE STE 100'}))
 def test_epa_facility_name_is_never_written_as_owner(self):
  records={'p':{'propertyClass':'4B','location':{'lon':-74.07,'lat':40.79},'evidence':[]}}
  result=P.facility_references(records,reader=lambda u,p:{'Results':{'Facilities':[{'RegistryID':'110000123456','FacName':'FACILITY LLC'}]}});self.assertEqual(result['facilityUnavailable'],0);self.assertEqual(records['p']['evidence'],[]);self.assertNotIn('ownerName',records['p']);self.assertEqual(records['p']['facilityResearch']['references'][0]['role'],'facility-reference-not-owner')
if __name__=='__main__':unittest.main()
