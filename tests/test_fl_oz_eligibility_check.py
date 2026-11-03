"""FloridaCommerce eligibility guard: schema, counts, designations, overlap and anchor."""
import importlib.util
import pathlib
import unittest
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('fl_check', ROOT / 'scripts/check-fl-oz-eligibility.py')
fl = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fl)


class FakeSource:
    def __init__(self):
        self.ids = {'met': [f'120990{i:05d}' for i in range(1367)], 'notMet': ['12099007833'] + [f'120860{i:05d}' for i in range(3708)]}
        self.designation = {'met': 'Meets Criteria', 'notMet': 'Does not Meets Criteria'}
        self.fields = sorted(fl.FIELDS)

    def __call__(self, url):
        name = 'met' if 'oppzones_ustreasury_met' in url else 'notMet'
        if '/query?' not in url:
            return {'geometryType': 'esriGeometryPolygon', 'fields': [{'name': f} for f in self.fields]}
        q = dict(urllib.parse.parse_qsl(url.split('?', 1)[1]))
        if q.get('returnCountOnly') == 'true':
            return {'count': len(self.ids[name])}
        if q.get('returnDistinctValues') == 'true':
            return {'features': [{'attributes': {'designatio': self.designation[name]}}]}
        start, size = int(q['resultOffset']), int(q['resultRecordCount'])
        return {'features': [{'attributes': {'GEOID': g}} for g in self.ids[name][start:start + size]]}


class FloridaEligibilityGuardTest(unittest.TestCase):
    def test_reviewed_layers_pass(self):
        self.assertEqual(fl.check(FakeSource()), {'met': 1367, 'notMet': 3709})

    def test_count_change_fails(self):
        src = FakeSource(); src.ids['met'].append('12099999999')
        with self.assertRaisesRegex(ValueError, 'expected 1367'):
            fl.check(src)

    def test_designation_change_fails(self):
        src = FakeSource(); src.designation['met'] = 'Nominated'
        with self.assertRaisesRegex(ValueError, 'designation values changed'):
            fl.check(src)

    def test_schema_change_fails(self):
        src = FakeSource(); src.fields = ['GEOID']
        with self.assertRaisesRegex(ValueError, 'schema changed'):
            fl.check(src)

    def test_overlap_fails(self):
        src = FakeSource(); src.ids['notMet'][-1] = src.ids['met'][0]
        with self.assertRaisesRegex(ValueError, 'both'):
            fl.check(src)

    def test_anchor_reclassification_fails(self):
        src = FakeSource(); src.ids['notMet'][0] = '12086099999'
        with self.assertRaisesRegex(ValueError, 'anchor'):
            fl.check(src)

    def test_invalid_or_repeated_ids_fail(self):
        src = FakeSource(); src.ids['met'][5] = src.ids['met'][4]
        with self.assertRaisesRegex(ValueError, 'invalid, repeated'):
            fl.check(src)


if __name__ == '__main__':
    unittest.main()
