import unittest,sys,datetime as dt
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import fl_parcel_review as F
TODAY=dt.date(2026,11,6)
class FloridaReview(unittest.TestCase):
    def test_ids_remain_text_and_scientific_ids_are_refused(self):
        self.assertEqual(F.parcel_id('424327050051110'),'00424327050051110')
        with self.assertRaises(ValueError):F.parcel_id('4.2432705005111e14')
    def test_unknown_date_never_becomes_25_year_hold_or_maturity_prediction(self):
        r=F.review({'PARID':'00424327050051110','OWNER_OF_RECORD':'EXAMPLE LLC'},TODAY)
        self.assertEqual(r['YEARS_SINCE_RECORDED_TRANSFER'],'')
        self.assertEqual(r['DEBT_MATURITY_STATUS'],'Not established')
        self.assertNotIn('ACQUISITION_PROPENSITY_SCORE',r)
    def test_nominal_sale_and_closed_permits_are_review_flags_not_seller_signals(self):
        r=F.review({'PARID':'00424327050051110','LAST_SALE':'2023-10-23 $10 (book 1/2)','FDEP_RECORDS':'tanks closed; older/closed','YEAR_BUILT':'1956'},TODAY)
        self.assertEqual(r['TRANSFER_PRICE_REFERENCE'],'')
        self.assertEqual(r['AVAILABILITY_STATUS'],'Not established')
        self.assertIn('vacancy is unknown',r['DUE_DILIGENCE_FLAGS'])
        self.assertIn('no inheritance/restructuring motive',r['DUE_DILIGENCE_FLAGS'])
    def test_protected_records_hide_owner_and_mailing(self):
        r=F.review({'PARID':'00424327050051110','OWNER_OF_RECORD':'EXAMPLE LLC','OWNER_LINE_2':'SECRET','TAX_BILL_MAILING':'SECRET','CONFID_FLG':'Y'},TODAY)
        self.assertEqual(r['OWNER_OF_RECORD'],'');self.assertEqual(r['TAX_BILL_MAILING'],'');self.assertEqual(r['SUNBIZ_ENTITY_SEARCH_URL'],'')
    def test_registry_is_a_search_route_and_relationships_are_unverified(self):
        r=F.review({'PARID':'00424327050051110','OWNER_OF_RECORD':'EXAMPLE LLC','OWNER_ALSO_OPERATES_HERE':'yes','ACQUISITION_PROPENSITY_SCORE':'100'},TODAY)
        self.assertIn('Search portal',r['REGISTRY_LINK_STATUS'])
        self.assertEqual(r['OWNER_OPERATOR_RELATIONSHIP'],'Not established')
        self.assertNotIn('OWNER_ALSO_OPERATES_HERE',r)
    def test_future_and_placeholder_dates_do_not_enter_transfer_history(self):
        self.assertIsNone(F.date_value('2099-01-01',TODAY));self.assertIsNone(F.date_value('1979-01-01',TODAY));self.assertIsNone(F.date_value('2026-02-30',TODAY))
if __name__=='__main__':unittest.main()

class SourceReconciliation(unittest.TestCase):
    def test_identical_boundary_rows_merge_and_conflicting_values_are_withheld(self):
        attrs={'PARID':'00424327050051110','OWNER_NAME1':'EXAMPLE LLC','ACRES':2,'CONFID_FLG':'N'}
        entries=F.reconcile([{'attributes':attrs},{'attributes':dict(attrs)}]);entry=next(iter(entries.values()))
        self.assertEqual(entry['pieces'],2);self.assertEqual(entry['conflicts'],set())
        entries=F.reconcile([{'attributes':attrs},{'attributes':{**attrs,'OWNER_NAME1':'DIFFERENT LLC'}}]);entry=next(iter(entries.values()))
        self.assertEqual(entry['attributes']['OWNER_NAME1'],None);self.assertIn('OWNER_NAME1',entry['conflicts'])
    def test_institutional_owner_is_not_excluded_and_unsupported_claims_are_prefixed(self):
        r=F.review({'PARID':'00424327050051110','OWNER_OF_RECORD':'COSTCO WHOLESALE CORP','OUTREACH_PLAYBOOK':'SELLER IS DISTRESSED','OTHER_PARCELS_SAME_OWNER':'100'},TODAY)
        self.assertEqual(r['OWNER_OF_RECORD'],'COSTCO WHOLESALE CORP')
        self.assertEqual(r['INPUT_OUTREACH_PLAYBOOK'],'SELLER IS DISTRESSED');self.assertNotIn('OUTREACH_PLAYBOOK',r)
