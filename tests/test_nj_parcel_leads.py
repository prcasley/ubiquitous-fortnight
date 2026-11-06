import unittest
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import nj_parcel_leads as L

SQ = [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]]
HOLE = SQ + [[[0.4, 0.4], [0.4, 0.6], [0.6, 0.6], [0.6, 0.4], [0.4, 0.4]]]


class Address(unittest.TestCase):
    def test_suffixes_standardized_not_removed(self):
        self.assertEqual(L.norm_addr("700 Jernee Mill Road."), "700 JERNEE MILL RD")
        self.assertEqual(L.norm_addr("100 KENNEDY DR."), "100 KENNEDY DR")
        self.assertNotEqual(L.norm_addr("100 Kennedy Dr"), L.norm_addr("100 Kennedy Rd"))

    def test_same_address(self):
        self.assertTrue(L.same_address("700 JERNEE MILL RD", "700 JERNEE MILL ROAD"))
        self.assertFalse(L.same_address("100 KENNEDY DR", "100 KENNEDY RD"))
        self.assertFalse(L.same_address("701 JERNEE MILL RD", "700 JERNEE MILL ROAD"))

    def test_ranges_and_pairs(self):
        self.assertTrue(L.same_address("350 KENNEDY DR", "300 & 350 KENNEDY DRIVE"))
        self.assertTrue(L.same_address("41 TALMADGE RD", "25-53 TALMADGE RD"))
        self.assertFalse(L.same_address("60 TALMADGE RD", "25-53 TALMADGE RD"))

    def test_suite_lines_preserved_for_mailing(self):
        self.assertNotEqual(L.mail_key("STE 2200 60 STATE ST", "021091884"), L.mail_key("60 State Street", "02109"))
        self.assertIsNone(L.mail_key("", "02109"))


class Geometry(unittest.TestCase):
    def test_point_in_polygon_with_hole(self):
        self.assertTrue(L.point_in_rings(0.2, 0.2, HOLE))
        self.assertFalse(L.point_in_rings(0.5, 0.5, HOLE))
        self.assertFalse(L.point_in_rings(1.5, 0.5, SQ))

    def test_edge_distance(self):
        d = L.dist_to_rings_m(-74.0, 40.0005, [[[-74.001, 40.0], [-73.999, 40.0], [-73.999, 39.999], [-74.001, 39.999], [-74.001, 40.0]]])
        self.assertAlmostEqual(d, 55.6, delta=1.5)


class Matching(unittest.TestCase):
    def setUp(self):
        a = [[[-74.0010, 40.0], [-74.0000, 40.0], [-74.0000, 40.001], [-74.0010, 40.001], [-74.0010, 40.0]]]
        b = [[[-74.0000, 40.0], [-73.9990, 40.0], [-73.9990, 40.001], [-74.0000, 40.001], [-74.0000, 40.0]]]
        self.parcels = {"A": {"PROP_LOC": "10 MAIN ST", "PCL_MUN":"1201", "rings": a}, "B": {"PROP_LOC": "20 MAIN ST", "PCL_MUN":"1201", "rings": b}}

    def test_inside_wins_over_address(self):
        s = {"SITE_ID": 1, "SITE_NAME": "X", "ADDRESS_LINE_1": "20 MAIN ST", "x": -74.0005, "y": 40.0005}
        m = L.match_sites(self.parcels, [s])
        self.assertEqual([h for _, h, _ in m["A"]], ["inside parcel boundary"])
        self.assertEqual(m["B"], [])

    def test_address_when_no_point(self):
        s = {"SITE_ID": 2, "MUN_CODE":"1201", "SITE_NAME": "Y", "ADDRESS_LINE_1": "20 Main Street", "x": None, "y": None}
        m = L.match_sites(self.parcels, [s])
        self.assertEqual(m["B"][0][2], "medium")

    def test_ambiguous_nearby_is_not_assigned(self):
        s = {"SITE_ID": 3, "SITE_NAME": "Z", "ADDRESS_LINE_1": "", "x": -74.0000, "y": 40.0012}  # ~22 m from both
        m = L.match_sites(self.parcels, [s])
        self.assertEqual(m["A"] + m["B"], [])

    def test_far_point_is_dropped(self):
        s = {"SITE_ID": 4, "SITE_NAME": "W", "ADDRESS_LINE_1": "99 OTHER RD", "x": -74.01, "y": 40.01}
        m = L.match_sites(self.parcels, [s])
        self.assertEqual(m["A"] + m["B"], [])


class Programs(unittest.TestCase):
    def test_status_and_dates(self):
        progs = {5: [{"PI_NAME": "ACME INC", "PROGRAM_DESC": "AIR", "ACTIVE": "Y", "START_DATE": "03/29/1999", "END_DATE": None},
                     {"PI_NAME": "700 MAIN ST", "PROGRAM_DESC": "SITE REMEDIATION", "ACTIVE": "N", "START_DATE": "01/01/2010", "END_DATE": "02/02/2011"}]}
        s = L.summarize_site({"SITE_ID": 5, "SITE_NAME": "ACME"}, progs)
        self.assertEqual(s["status"], "older record")  # active flag but nothing in the last 10 years
        self.assertEqual(s["latest"], "2011-02-02")
        fresh = L.summarize_site({"SITE_ID": 7, "SITE_NAME": "NEW CO"}, {7: [{"ACTIVE": "Y", "START_DATE": "09/11/2023", "END_DATE": None}]})
        self.assertEqual(fresh["status"], "recent")
        self.assertTrue(L.summarize_site({"SITE_ID": 8, "SITE_NAME": "EXIT 125 LOOP GARDEN STATE PARKWAY"}, {})["public"])
        self.assertEqual(s["program_names"], ["ACME INC"])  # address-only names dropped
        old = L.summarize_site({"SITE_ID": 6, "SITE_NAME": "OLD"}, {6: [{"ACTIVE": "N", "START_DATE": "01/01/1990", "END_DATE": "01/01/1995"}]})
        self.assertEqual(old["status"], "older record")

    def test_lead_name(self):
        self.assertEqual(L.lead_name("1000 PORT CARTERET DRIVE @ PORT CARTERET INDUSTRIAL", ["ACME LOGISTICS LLC"]), "ACME LOGISTICS LLC")
        self.assertEqual(L.lead_name("DISTRIBUTION CENTER 1 @ PARK", ["400 MAIN ST"]), "")
        self.assertEqual(L.lead_name("CONTINENTAL TERMINALS INC", []), "CONTINENTAL TERMINALS INC")

    def test_residences_dropped(self):
        a = [[[-74.001, 40.0], [-74.0, 40.0], [-74.0, 40.001], [-74.001, 40.001], [-74.001, 40.0]]]
        m = L.match_sites({"A": {"PROP_LOC": "1 X ST", "rings": a}}, [{"SITE_ID": 9, "SITE_NAME": "SMITH JOHN RESIDENCE", "ADDRESS_LINE_1": "", "x": -74.0005, "y": 40.0005}])
        self.assertEqual(m["A"], [])



class Reliability(unittest.TestCase):
    def test_overlap_and_shared_edge_are_ambiguous(self):
        rings = [[[-74.001,40],[-74,40],[-74,40.001],[-74.001,40.001],[-74.001,40]]]
        parcels = {'A':{'rings':rings,'PROP_LOC':'1 X ST','PCL_MUN':'1201'},'B':{'rings':rings,'PROP_LOC':'1 X ST','PCL_MUN':'1201'}}
        site = {'SITE_ID':1,'SITE_NAME':'TEST LLC','ADDRESS_LINE_1':'1 X ST','MUN_CODE':'1201','x':-74.0005,'y':40.0005}
        self.assertFalse(any(L.match_sites(parcels,[site]).values()))
        parcels['B']['rings'] = [[[-74,40],[-73.999,40],[-73.999,40.001],[-74,40.001],[-74,40]]]
        site['x']=-74
        self.assertFalse(any(L.match_sites(parcels,[site]).values()))

    def test_foreign_town_and_far_geocode_do_not_win_by_same_address(self):
        rings=[[[-74.001,40],[-74,40],[-74,40.001],[-74.001,40.001],[-74.001,40]]]
        parcel={'A':{'rings':rings,'PROP_LOC':'1 X ST','PCL_MUN':'1201'}}
        site={'SITE_ID':1,'SITE_NAME':'TEST LLC','ADDRESS_LINE_1':'1 X ST','MUN_CODE':'1219','x':None,'y':None}
        self.assertFalse(any(L.match_sites(parcel,[site]).values()))
        site.update(MUN_CODE='1201',x=-74.1,y=40.1)
        self.assertFalse(any(L.match_sites(parcel,[site]).values()))

    def test_new_closed_program_cannot_make_old_active_program_recent(self):
        import datetime
        programs={1:[{'ACTIVE':'Y','START_DATE':'01/01/1990','END_DATE':None},{'ACTIVE':'N','START_DATE':'01/01/2025','END_DATE':'01/01/2026'}]}
        record=L.summarize_site({'SITE_ID':1,'SITE_NAME':'TEST LLC'},programs,today=datetime.date(2026,11,6))
        self.assertEqual(record['status'],'older record')
        programs[1]=[{'ACTIVE':'Y','START_DATE':'01/01/2099','END_DATE':None}]
        self.assertEqual(L.summarize_site({'SITE_ID':1,'SITE_NAME':'TEST LLC'},programs,today=datetime.date(2026,11,6))['latest'],'')
        L.summarize_site({'SITE_ID':1,'SITE_NAME':'TEST LLC'},programs,today=datetime.date(2024,2,29))

    def test_mailing_suites_cities_and_invalid_zips_stay_distinct(self):
        self.assertEqual(L.mail_key('1 Main Street Suite 200','07000','A NJ'),L.mail_key('1 Main St STE 200','07000','A NJ'))
        self.assertNotEqual(L.mail_key('1 Main St STE 100','07000','A NJ'),L.mail_key('1 Main St STE 200','07000','A NJ'))
        self.assertNotEqual(L.mail_key('1 Main St','07000','A NJ'),L.mail_key('1 Main St','07000','B NJ'))
        self.assertIsNone(L.mail_key('1 Main St','07000abc'))

    def test_person_like_names_do_not_become_primary_organization_leads(self):
        self.assertEqual(L.lead_name('JOHN SMITH',[]),'')
        self.assertEqual(L.lead_name('BUILDING 1',['JOHN SMITH','EXAMPLE LOGISTICS LLC']),'EXAMPLE LOGISTICS LLC')

class FakeClient(L.Client):
    def __init__(self, mode='good'):
        super().__init__();self.mode=mode;self.calls=[];self.counts_seen=0
    def query(self,url,data,tries=3):
        self.calls.append((url,data))
        if not url.endswith('/query'):
            return {'objectIdField':'FID','fields':[{'name':'FID','type':'esriFieldTypeOID'},{'name':'SITE_ID'},{'name':'SSN'}]}
        if data.get('returnCountOnly'):
            self.counts_seen+=1
            return {'count':4 if self.mode=='changed' and self.counts_seen>1 else 3}
        if data.get('returnIdsOnly'):
            return {'objectIds':[10,10,12] if self.mode=='repeated-list' else [10,11,12]}
        ids=list(map(int,data['objectIds'].split(',')))
        if self.mode=='foreign':ids[0]=999
        if self.mode=='repeated' and len(ids)>1:ids[1]=ids[0]
        return {'features':[{'attributes':{'FID':i,'SITE_ID':i}} for i in ids],'exceededTransferLimit':self.mode=='truncated'}

class Pagination(unittest.TestCase):
    def test_metadata_id_batches_and_whitelist(self):
        c=FakeClient();rows=c.query_all('https://example.gov/0/query',{'where':'1=1','outFields':'SITE_ID'},page=2)
        self.assertEqual(len(rows),3)
        self.assertEqual([r['attributes']['FID'] for r in rows],[10,11,12])
        self.assertTrue(all('SSN' not in data.get('outFields','') for _,data in c.calls))
        self.assertEqual(c.counts[-1]['received'],3)
    def test_repetition_truncation_foreign_and_changed_counts_fail(self):
        for mode in ['repeated-list','foreign','repeated','truncated','changed']:
            with self.subTest(mode=mode),self.assertRaises(RuntimeError):
                FakeClient(mode).query_all('https://example.gov/0/query',{'outFields':'SITE_ID'},page=2)
    def test_unchecked_scope_or_wildcard_rejected(self):
        with self.assertRaises(RuntimeError):FakeClient().query_all('https://example.gov/0/query',{'outFields':'*'})
        with self.assertRaises(RuntimeError):FakeClient().query_all('https://example.gov/0/query',{'outFields':'SITE_ID'},cap=2)
        with self.assertRaises(ValueError):FakeClient().query_all('https://example.gov/0/query',{'outFields':'SITE_ID'},page=0)



class SourceBackoff(unittest.TestCase):
    def test_json_rate_limit_recovers_once_with_backoff(self):
        import io
        from unittest.mock import patch
        responses=[{'error':{'code':429,'message':'Too many requests'}},{'count':3}]
        def open_response(*args,**kwargs):
            return io.BytesIO(L.json.dumps(responses.pop(0)).encode())
        with patch.object(L.urllib.request,'urlopen',side_effect=open_response),patch.object(L.time,'sleep') as sleep:
            self.assertEqual(L.Client(request_interval=0).query('https://example.gov/query',{}),{'count':3})
            sleep.assert_called_once_with(5)

if __name__ == "__main__":
    unittest.main()
