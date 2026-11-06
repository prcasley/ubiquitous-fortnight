import unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import review_fl_claims as R
class ClaimReview(unittest.TestCase):
    def test_source_matching_does_not_verify_officer_or_control_claims(self):
        claim={'PARID':'424327050051110','CLAIMED_ADDRESS':'1 Main Street','CLAIMED_ASSESSMENT_NAME':'EXAMPLE LLC','CLAIMED_USE':'OPEN STORAGE','CLAIMED_ACRES':2,'CLAIMED_DOCUMENT_NUMBERS':['L10000000000'],'CLAIMED_REGISTRY_ROLES':'Claimed Person, Manager'}
        row={'PARID':'00424327050051110','PROPERTY_ADDRESS':'1 MAIN ST','OWNER_OF_RECORD':'EXAMPLE LLC','USE':'OPEN STORAGE','ACRES':2,'SALE_PRICE':'10','SALE_DATE':'2023-01-01'}
        result=R.compare(claim,row)
        self.assertIn('Matches published',result['OWNER_NAME_CLAIM_COMPARISON']);self.assertIn('Unverified',result['REGISTRY_VERIFICATION_STATUS'])
        self.assertTrue(result['DECISION_MAKER_STATUS'].startswith('Not established'));self.assertTrue(result['ASSEMBLY_CONTROL_STATUS'].startswith('Not established'))
        self.assertNotIn('RESOLVED_HUMAN_OFFICERS_MGRS',result)
    def test_missing_parcel_stays_missing_and_protected_source_is_not_exposed(self):
        claim={'PARID':'00424327050051110','CLAIMED_ASSESSMENT_NAME':'EXAMPLE LLC'}
        self.assertIn('not returned',R.compare(claim,None)['COUNTY_MATCH_STATUS'])
        r=R.compare(claim,{'PARID':claim['PARID'],'OWNER_OF_RECORD':'SECRET LLC','CONFID_FLG':'Y','TAX_BILL_MAILING':'DO NOT EXPOSE'})
        self.assertEqual(r['OWNER_OF_RECORD'],'');self.assertEqual(r['TAX_BILL_MAILING'],'');self.assertEqual(r['OWNER_NAME_CLAIM_COMPARISON'],'Source protected')
    def test_vacant_commercial_adds_a_zoning_review_flag(self):
        from fl_parcel_review import review
        r=review({'PARID':'00424327050051110','USE':'VACANT COMMERCIAL LAND'})
        self.assertIn('confirm industrial zoning',r['DUE_DILIGENCE_FLAGS'])
if __name__=='__main__':unittest.main()
