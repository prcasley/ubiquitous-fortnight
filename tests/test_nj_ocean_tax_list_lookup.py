import sys, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import nj_ocean_tax_list_lookup as O

DETAIL = """<html><body><table><tr><td>Tax List Details - Current Year</td></tr>
<tr><td>Municipality:</td><td>Synth</td><td>Deed date:</td><td>5/4/2026</td></tr>
<tr><td>Block / Lot:</td><td>1.01 / 2</td><td>Qual:</td><td>n/a</td></tr>
<tr><td>Mailing address:</td><td>1 EXAMPLE ROAD</td><td>City/State:</td><td>SYNTH NJ 00000</td></tr>
<tr><td>Location:</td><td>1 SYNTHETIC WAY</td><td>Prop class:</td><td>4B</td></tr>
<tr><td>Land val:</td><td>84,100</td><td>Bldg desc:</td><td></td></tr>
<tr><td>Improvement val:</td><td></td><td>Land desc:</td><td>48.03 AC.</td></tr>
<tr><td>Zone:</td><td>LI</td><td>Year blt:</td><td></td></tr>
<tr><td>Net value:</td><td>84,100</td><td>Book/page:</td><td>20529/743</td></tr>
<tr><td>Last yr taxes:</td><td>2345.55</td><td>Sale price:</td><td>368,150</td></tr>
<tr><td>Nonusable code:</td><td>04 (List)</td><td>Facility:</td><td></td></tr>
</table><span>Assessment History</span><table><tr><td>Zone:</td><td>WRONG</td></tr></table></body></html>"""
RESULTS = """<table><tr><td><a href="frmTaxBoardTaxListDetail.aspx?ID=AAAAAAAA-0000-0000-0000-000000000001">INFO</a></td><td>Synth</td><td>1.01</td><td>2</td><td>&nbsp;</td><td>1 SYNTHETIC WAY</td></tr>
<tr><td><a href="frmTaxBoardTaxListDetail.aspx?ID=AAAAAAAA-0000-0000-0000-000000000002">INFO</a></td><td>Synth</td><td>1.01</td><td>2</td><td>C0001</td><td>1 SYNTHETIC WAY</td></tr>
<tr><td><a href="frmTaxBoardTaxListDetail.aspx?ID=AAAAAAAA-0000-0000-0000-000000000003">INFO</a></td><td>Synth</td><td>1.01</td><td>20</td><td>&nbsp;</td><td>3 SYNTHETIC WAY</td></tr></table>"""


class OceanTaxList(unittest.TestCase):
    def test_detail_reads_facts_and_never_a_name_or_mailing_address(self):
        f = O.parse_detail(DETAIL)
        self.assertEqual((f["zone"], f["deedDate"], f["deedBookPage"], f["salePrice"], f["lastYearTaxes"]), ("LI", "5/4/2026", "20529/743", "368,150", "2345.55"))
        self.assertEqual((f["landDescription"], f["propertyClass"], f["nonusableCode"]), ("48.03 AC.", "4B", "04 (List)"))
        self.assertEqual((f["buildingDescription"], f["yearBuilt"], f["improvementValue"], f["facility"]), ("", "", "", ""))
        self.assertFalse(any("EXAMPLE ROAD" in str(v) or "SYNTH NJ" in str(v) for v in f.values()))
        self.assertNotIn("owner", " ".join(f).lower())

    def test_result_row_must_match_block_lot_and_qualifier_exactly(self):
        self.assertTrue(O.find_detail_link(RESULTS, "1.01", "2", "").endswith("000000000001"))
        self.assertTrue(O.find_detail_link(RESULTS, "1.01", "2", "C0001").endswith("000000000002"))
        self.assertIsNone(O.find_detail_link(RESULTS, "1.01", "200", ""))
        self.assertIsNone(O.find_detail_link(RESULTS + RESULTS.replace("000000000001", "000000000009"), "1.01", "2", ""))


if __name__ == "__main__":
    unittest.main()
