"""Dated Florida evidence: complete source reads, stable edits and fail-closed renewal."""
import copy
import datetime as dt
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs,urlparse
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('fl_refresh',ROOT/'scripts/build-fl-oz-eligibility.py');fl=importlib.util.module_from_spec(spec);spec.loader.exec_module(fl)

class RefreshTests(unittest.TestCase):
 def setUp(self):
  self.data=json.loads((ROOT/'assets/data/fl-oz-eligibility.json').read_text());self.now=dt.datetime.fromisoformat(self.data['checkedAt'].replace('Z','+00:00'))+dt.timedelta(seconds=1);self.bad=None;self.reads={}
 def reader(self,url):
  status='met' if '/oppzones_ustreasury_met/' in url else 'not-met';name,expected=fl.LAYERS[status]
  if '/query?' not in url:
   self.reads[status]=self.reads.get(status,0)+1;edited=int(dt.datetime.fromisoformat(self.data['sources'][status]['layerLastEdit'].replace('Z','+00:00')).timestamp()*1000)
   if self.bad=='changed-edit' and self.reads[status]>1:edited+=1000
   return {'geometryType':'esriGeometryPolygon','fields':[{'name':n} for n in fl.FIELDS+['FID']],'editingInfo':{'lastEditDate':edited}}
  q=parse_qs(urlparse(url).query)
  if q.get('returnCountOnly')==['true']:return {'count':expected+(1 if self.bad=='count' else 0)}
  rows=[r for r in self.data['records'] if r['criteria']==status];start=int(q['resultOffset'][0]);take=int(q['resultRecordCount'][0]);features=[]
  for r in rows[start:start+take]:features.append({'attributes':{'GEOID':r['geoid'],'COUNTYFP':r['geoid'][2:5],'designatio':'Meets Criteria' if status=='met' else 'Does not Meets Criteria','tract_pove':r['povertyRate'],'Median_Fam':r['medianFamilyIncome'],'MetroArea_':r['areaMedianFamilyIncome']}})
  if start==0:
   if self.bad=='truncate':features=features[:-1]
   if self.bad=='duplicate':features[1]=copy.deepcopy(features[0])
   if self.bad=='nomination':features[0]['attributes']['designatio']='Nominated'
   if self.bad=='bad-poverty':features[0]['attributes']['tract_pove']=12.3
  return {'features':features}
 def test_complete_source_preserves_all_reviewed_criteria_and_never_certifies(self):
  d=fl.build(reader=self.reader,now=self.now);self.assertEqual(d['records'],self.data['records']);self.assertFalse(d['nominationVerified']);self.assertFalse(d['certificationVerified']);self.assertLessEqual(dt.datetime.fromisoformat(d['validUntil'].replace('Z','+00:00'))-self.now,dt.timedelta(days=90))
 def test_bad_or_changing_source_never_generates_replacement_evidence(self):
  for value in ['count','truncate','duplicate','nomination','bad-poverty','changed-edit']:
   with self.subTest(value):
    self.bad=value;self.reads={}
    with self.assertRaises(ValueError):fl.build(reader=self.reader,now=self.now)
 def test_failed_refresh_keeps_prior_file_bytes(self):
  with tempfile.TemporaryDirectory() as folder:
   target=Path(folder)/'data.json';target.write_text(json.dumps(self.data));before=target.read_bytes()
   with patch.object(fl,'OUT',target),patch.object(fl,'build',side_effect=ValueError('source down')):
    with self.assertRaises(ValueError):fl.main()
   self.assertEqual(target.read_bytes(),before)
 def test_unchanged_recent_source_does_not_create_timestamp_only_commit(self):
  with tempfile.TemporaryDirectory() as folder:
   target=Path(folder)/'data.json';target.write_text(json.dumps(self.data));before=target.read_bytes();updated=copy.deepcopy(self.data);updated['checkedAt']=self.now.isoformat().replace('+00:00','Z')
   with patch.object(fl,'OUT',target),patch.object(fl,'build',return_value=updated):fl.main()
   self.assertEqual(target.read_bytes(),before)

if __name__=='__main__':unittest.main()
