import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import nj_carrier_rematch as R  # noqa: E402


def carrier(**kw):
    base = {"dot_number": "1", "legal_name": "EXAMPLE CARRIER", "status_code": "A", "phy_street": "60 GRANT AVE", "phy_city": "CARTERET",
            "phy_state": "NJ", "phy_zip": "07008", "carrier_mailing_street": "60 GRANT AVE", "carrier_mailing_city": "CARTERET",
            "carrier_mailing_state": "NJ", "carrier_mailing_zip": "07008", "phone": "7325550100", "company_officer_1": "A OFFICER"}
    return {**base, **kw}


def parcel(**kw):
    base = {"PAMS_PIN": "1201_1_1", "PROP_LOC": "60 GRANT AVENUE", "MUN_NAME": "CARTERET BORO", "COUNTY": "MIDDLESEX", "PROP_CLASS": "4B",
            "CALC_ACRE": 5, "ST_ADDRESS": "1 CORPORATE PLZ", "CITY_STATE": "EDISON, NJ", "ZIP_CODE": "08817", "PCL_MUN": "1201",
            "PCLBLOCK": "1", "PCLLOT": "1", "PCLQCODE": " ", "LAND_VAL": 100, "IMPRVT_VAL": 50, "tracts": ["34023980000"]}
    return {**base, **kw}


class Rematch(unittest.TestCase):
    def test_town_rules_match_the_browser_verifier(self):
        self.assertEqual(R.towns("ORANGE CITY TWP"), ["ORANGE CITY", "ORANGE"])
        self.assertTrue(R.same_town("ORANGE CITY TWP", "ORANGE"))
        self.assertTrue(R.same_town("JERSEY CITY CITY", "JERSEY CITY"))
        self.assertTrue(R.same_town("PARSIPPANY TR HLS", "PARSIPPANY"))
        self.assertFalse(R.same_town("UNION TWP", "UNION CITY"))
        self.assertFalse(R.same_town("UNION CITY CITY", "UNION"))

    def test_street_and_zip_normalization(self):
        self.assertEqual(R.street("60 Grant Avenue, Suite 2"), "60 GRANT AVE")
        self.assertEqual(R.street("P.O. Box 117"), "PO BOX 117")
        self.assertEqual(R.street("4000 Route 66"), R.street("4000 RT 66"))
        self.assertEqual(R.zip5("07008-1234"), "07008")
        self.assertEqual(R.zip5("7008"), "")

    def test_on_site_needs_same_street_and_municipality_and_an_active_filing(self):
        m = R.match([parcel()], [carrier(), carrier(dot_number="2", phy_city="NEWARK"), carrier(dot_number="3", status_code="I")])[0]
        self.assertEqual([c["usdot"] for c in m["onSite"]], ["1"])
        self.assertEqual(R.match([parcel(PROP_LOC="GRANT AVE")], [carrier()])[0]["onSite"], [])

    def test_mailing_hq_matches_street_plus_zip_in_any_town_and_keeps_roles_apart(self):
        hq = carrier(dot_number="9", phy_street="1 Corporate Plaza", phy_city="EDISON", phy_zip="08817", carrier_mailing_street="PO BOX 5", carrier_mailing_zip="08818")
        other_zip = carrier(dot_number="8", phy_street="1 CORPORATE PLZ", phy_city="TRENTON", phy_zip="08601")
        m = R.match([parcel()], [carrier(), hq, other_zip])[0]
        self.assertEqual([c["usdot"] for c in m["onSite"]], ["1"])
        self.assertEqual([(c["usdot"], c["matchedCarrierAddress"]) for c in m["mailingHq"]], [("9", "physical")])

    def test_a_shared_office_address_is_flagged_not_treated_as_one_owner(self):
        many = [carrier(dot_number=str(100 + i), phy_street="1 CORPORATE PLZ", phy_city="EDISON", phy_zip="08817") for i in range(7)]
        m = R.match([parcel()], many)[0]
        self.assertTrue(m["mailingHqSharedAddress"])
        self.assertEqual(m["mailingHqCount"], 7)

    def test_clusters_rank_by_mapped_area_and_flag_bad_published_acreage(self):
        rows = [parcel(PAMS_PIN="a", CALC_ACRE=98922, GEOM_ACRES=0.2), parcel(PAMS_PIN="b", ST_ADDRESS="9 MAIN ST", ZIP_CODE="07001", CALC_ACRE=30, GEOM_ACRES=29.5),
                parcel(PAMS_PIN="c", ST_ADDRESS="9 Main Street", ZIP_CODE="07001-0001", CALC_ACRE=10, GEOM_ACRES=10.1), parcel(PAMS_PIN="d", PROP_CLASS="4A", GEOM_ACRES=500)]
        out = R.clusters(rows)
        self.assertEqual([(c["mailingAddress"], c["parcels"], c["totalAcres"]) for c in out], [("9 MAIN ST", 2, 39.6), ("1 CORPORATE PLZ", 1, 0.2)])
        self.assertEqual([c["acreageNeedsCheck"] for c in out], [False, True])
        self.assertEqual(out[0]["pins"], ["b", "c"])

    def test_county_links_are_prefilled_only_where_the_county_publishes_the_search(self):
        union = R.county_record_link(parcel(COUNTY="UNION", PCL_MUN="2004", PCLBLOCK="627", PCLLOT="1"))
        self.assertEqual(union["kind"], "prefilled")
        self.assertIn("ms_user=ctb20", union["url"])
        self.assertIn("district=2004&", union["url"])
        self.assertIn("block=627&lot=1", union["url"])
        manual = R.county_record_link(parcel())
        self.assertEqual(manual["kind"], "manual")
        self.assertIn("block 1, lot 1", manual["enter"])
        self.assertEqual(R.county_record_link(parcel(COUNTY="UNION", PCL_MUN="1201"))["kind"], "manual")


if __name__ == "__main__":
    unittest.main()


class CountyOwnerPage(unittest.TestCase):
    PAGE = ("<tr><td>Block</td><td>Lot</td><td>Qual</td><td>Class</td><td>Location</td><td>Owner</td></tr>"
            "<tr><td nowrap><a href=m4.cgi?district=0218><b>More Info<br></A></td><td><font>501</font></td><td><font>10</font></td>"
            "<td><font>&nbsp;</font></td><td><font>4A</font></td><td><font>51 BROAD AVE</font></td><td><font>EXAMPLE HOLDINGS LP</font></td></tr>"
            "<b>1 Records Found for District: 0218 FAIRVIEW Data as of 11/15/26")

    def test_owner_is_read_only_from_one_exact_block_lot_row(self):
        import nj_county_owner_lookup as L
        got = L.parse(self.PAGE, "501", "10", "")
        self.assertEqual((got["status"], got["owner"], got["class"], got["dataAsOf"]), ("found", "EXAMPLE HOLDINGS LP", "4A", "11/15/26"))
        self.assertEqual(L.parse(self.PAGE, "501", "11", "")["owner"], "")
        self.assertEqual(L.parse(self.PAGE, "501", "11", "")["status"], "ambiguous")
        self.assertEqual(L.parse("<b>0 Records Found", "1", "1", "")["status"], "not-found")

    def test_mapped_area_helper(self):
        import nj_pull_rematch_inputs as I
        square = [(-74.0, 40.0), (-74.0, 40.001), (-73.999, 40.001), (-73.999, 40.0), (-74.0, 40.0)]
        self.assertAlmostEqual(I.ring_acres([square]), 2.33, delta=0.05)
