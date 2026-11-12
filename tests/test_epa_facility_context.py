import importlib.util, pathlib, unittest
spec = importlib.util.spec_from_file_location("E", pathlib.Path(__file__).resolve().parents[1] / "scripts/epa_facility_context.py")
E = importlib.util.module_from_spec(spec); spec.loader.exec_module(E)
SQUARE = {"type": "Polygon", "coordinates": [[[-75.07, 39.51], [-75.05, 39.51], [-75.05, 39.53], [-75.07, 39.53], [-75.07, 39.51]]]}

class EpaFacilityContext(unittest.TestCase):
    def test_address_normalizes_number_and_street_words(self):
        self.assertEqual(E.norm_address("2055 Demarco Drive"), "2055 DEMARCO DR")
        self.assertEqual(E.norm_address("2055-2061 DEMARCO DR."), "2055 DEMARCO DR")
        self.assertIsNone(E.norm_address("TILBURY RD"))

    def test_point_in_parcel(self):
        self.assertTrue(E.inside(-75.06, 39.52, SQUARE))
        self.assertFalse(E.inside(-75.04, 39.52, SQUARE))

    def test_facility_is_role_labelled_with_no_contact_fields(self):
        f = E.facility({"FacName": "DAVY COLD STORAGE CORP", "FacStreet": "2055 DEMARCO DR", "FacCity": "VINELAND", "FacZip": "08360", "RegistryID": "110030803496", "FacActiveFlag": "Y"}, "address")
        self.assertEqual(f["role"], "on-site-facility-not-owner")
        self.assertTrue(f["sourceURL"].endswith("110030803496"))
        self.assertFalse(any(k in f for k in ("phone", "email", "contact")))

if __name__ == "__main__":
    unittest.main()
