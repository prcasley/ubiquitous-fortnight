"""USDOT site context stays a labelled operator reference and never becomes ownership."""
import io, json, sys, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import usdot_site_context as U  # noqa: E402

CARRIERS = [
    {"dot_number": "1", "legal_name": "OLD CARRIER", "phy_street": "351 ROOSEVELT AVE", "status_code": "I", "mcs150_date": "2015-01-01", "phone": "7325550000"},
    {"dot_number": "2", "legal_name": "ACTIVE CARRIER", "phy_street": "351 Roosevelt Avenue", "status_code": "A", "mcs150_date": "2024-05-01", "phone": "7325551111", "cell_phone": "7325552222", "email_address": " Ops@Example.com ", "company_officer_1": "PERSON ONE"},
    {"dot_number": "3", "legal_name": "MAIL ONLY CARRIER", "phy_street": "9 OTHER ST", "carrier_mailing_street": "351 ROOSEVELT AVE", "status_code": "A"},
]


class UsdotSiteContext(unittest.TestCase):
    def test_town_names_drop_municipal_suffix(self):
        self.assertEqual(U.town_name("CARTERET BORO"), "CARTERET")
        self.assertEqual(U.town_name("Sayreville Borough"), "SAYREVILLE")

    def test_matches_physical_street_only_and_prefers_active_recent(self):
        rows = U.enrich([{"MUNICIPALITY": "CARTERET BORO", "PROPERTY_ADDRESS": "351 ROOSEVELT AVE", "OWNER": "X"}], {"CARTERET": CARRIERS}, "t")
        r = rows[0]
        self.assertEqual(r["USDOT_CARRIER_NAME"], "ACTIVE CARRIER")
        self.assertEqual(r["USDOT_STATUS"], "ACTIVE")
        self.assertEqual(r["USDOT_OTHER_CARRIERS_AT_ADDRESS"], 1)  # mailing-only carrier is not counted
        self.assertIn("NOT THE PROPERTY OWNER", r["USDOT_ROLE"])
        self.assertEqual(r["OWNER"], "X")  # owner fields are never overwritten
        self.assertEqual(r["USDOT_EMAIL"], "ops@example.com")

    def test_wrong_house_number_or_unchecked_town_does_not_match(self):
        rows = U.enrich([{"MUNICIPALITY": "CARTERET", "PROPERTY_ADDRESS": "353 ROOSEVELT AVE"},
                         {"MUNICIPALITY": "KEARNY", "PROPERTY_ADDRESS": "351 ROOSEVELT AVE"}], {"CARTERET": CARRIERS}, "t")
        self.assertEqual(rows[0]["USDOT_ROLE"], "")
        self.assertIn("no carrier", rows[0]["USDOT_MATCH_METHOD"])
        self.assertIn("not checked", rows[1]["USDOT_MATCH_METHOD"])

    def test_research_block_is_role_labelled_with_filed_email_and_cell(self):
        row = U.enrich([{"MUNICIPALITY": "CARTERET", "PROPERTY_ADDRESS": "351 ROOSEVELT AVE"}], {"CARTERET": CARRIERS}, "t")[0]
        b = U.context_block(row)
        self.assertEqual(b["role"], "on-site-carrier-not-owner")
        self.assertEqual(b["carrierName"], "ACTIVE CARRIER")
        self.assertEqual(b["officers"], ["PERSON ONE"])
        self.assertEqual(b["email"], "ops@example.com")
        self.assertEqual(b["cellPhone"], "7325552222")
        self.assertEqual(b["businessPhone"], "7325551111")

    def test_fetch_uses_real_field_names_and_pages(self):
        seen = []

        class Resp(io.BytesIO):
            def __enter__(self): return self
            def __exit__(self, *a): return False

        def opener(url, timeout):
            seen.append(url)
            return Resp(json.dumps([{"dot_number": str(i)} for i in range(U.PAGE if len(seen) == 1 else 3)]).encode())

        rows = U.fetch_town("CARTERET", opener=opener, sleep=lambda s: None)
        self.assertEqual(len(rows), U.PAGE + 3)
        self.assertIn("phone", seen[0])
        self.assertNotIn("telephone", seen[0])
        self.assertIn("email_address", seen[0])
        self.assertIn("cell_phone", seen[0])

    def test_town_lookup_retries_dropped_connections(self):
        calls = []
        def flaky(town):
            calls.append(town)
            if len(calls) < 3:
                raise OSError("Connection reset by peer")
            return CARRIERS
        orig = U.fetch_town
        U.fetch_town = flaky
        try:
            got, cov = U.load_towns(["CARTERET"], sleep=lambda s: None)
        finally:
            U.fetch_town = orig
        self.assertEqual(cov["CARTERET"]["status"], "checked")
        self.assertEqual(len(calls), 3)

    def test_care_of_and_truncated_streets_match_only_with_same_number(self):
        self.assertTrue(U.carrier_same_address("C O EVERFLOW SUPPLIES 100 MIDD", "100 MIDDLESEX AVENUE"))
        self.assertFalse(U.carrier_same_address("C O EVERFLOW SUPPLIES 102 MIDD", "100 MIDDLESEX AVENUE"))
        self.assertFalse(U.carrier_same_address("100 MIDD", "100 MIDDLESEX AVENUE"))
        self.assertTrue(U.carrier_same_address("351 ROOSEVELT AVE UNIT 1", "351 ROOSEVELT AVE"))


if __name__ == "__main__":
    unittest.main()
