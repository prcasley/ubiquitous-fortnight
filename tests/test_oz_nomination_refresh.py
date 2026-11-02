"""Official-source refresh integrity, freshness, and preservation contracts."""
import copy
import datetime as dt
import importlib.util
import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('oz_refresh', ROOT / 'scripts/build-nj-oz-nominations.py')
refresh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(refresh)


class RefreshTest(unittest.TestCase):
    def setUp(self):
        self.bundle = json.loads((ROOT / 'assets/data/oz-designation-evidence.json').read_text())
        self.now = dt.datetime.fromisoformat(self.bundle['records'][0]['checkedAt'].replace('Z', '+00:00')) + dt.timedelta(days=1)
        self.meta = {'geometryType': 'esriGeometryPolygon', 'fields': [{'name': field} for field in refresh.FIELDS],
                     'editingInfo': {'lastEditDate': int(dt.datetime.fromisoformat(self.bundle['sources'][refresh.SOURCE_ID]['layerLastEdit'].replace('Z', '+00:00')).timestamp() * 1000)}}
        self.rows = [{'attributes': {'Geography': r['geoid'], 'OBJECTID': int(r['recordId'].rsplit('-', 1)[1]), 'County': r['county'],
                                     'Municipality': r['municipality'], 'Rural': r['sourceRuralFlag']}} for r in self.bundle['records'] if r['sourceId'] == refresh.SOURCE_ID]
        self.count = len(self.rows)
        self.truncated = False

    def reader(self, url):
        if '/query?' not in url:
            return copy.deepcopy(self.meta)
        if 'returnCountOnly' in url:
            return {'count': self.count}
        return {'features': copy.deepcopy(self.rows), 'exceededTransferLimit': self.truncated}

    def run_refresh(self, **kwargs):
        return refresh.refresh(self.bundle, reader=self.reader, now=kwargs.get('now', self.now))

    def test_unchanged_verified_source_does_not_create_weekly_timestamp_commit(self):
        before = copy.deepcopy(self.bundle)
        self.assertIsNone(self.run_refresh())
        self.assertEqual(before, self.bundle)

    def test_expiring_evidence_is_renewed_even_if_membership_unchanged(self):
        now = dt.datetime.fromisoformat(self.bundle['records'][0]['validUntil'].replace('Z', '+00:00')) - dt.timedelta(days=29)
        result = self.run_refresh(now=now)
        self.assertEqual(result['records'][0]['checkedAt'], refresh.iso(now))
        self.assertTrue(all(r['stage'] == 'state-nominated' for r in result['records']))
        self.assertEqual(len(result['records']), 130)

    def test_invalid_existing_freshness_is_replaced_only_after_successful_source_check(self):
        self.bundle['records'][0]['checkedAt'] = refresh.iso(self.now + dt.timedelta(days=5))
        result = self.run_refresh()
        self.assertEqual(result['records'][0]['checkedAt'], refresh.iso(self.now))

    def test_same_count_membership_change_is_published_without_promoting_certification(self):
        self.rows[0]['attributes']['Geography'] = '34999999999'
        result = self.run_refresh()
        self.assertIn('34999999999', [r['geoid'] for r in result['records']])
        self.assertTrue(all(r['stage'] == 'state-nominated' for r in result['records']))

    def test_preserves_other_state_and_federal_evidence_and_notice(self):
        self.bundle['sources']['future-federal'] = {'authority': 'federal-certifier'}
        self.bundle['records'].append({'sourceId': 'future-federal', 'geoid': '42095000100', 'stage': 'certified'})
        self.bundle['notice'] = 'Multi-source evidence notice'
        self.rows[0]['attributes']['Municipality'] = 'Synthetic changed name'
        result = self.run_refresh()
        self.assertEqual(result['sources']['future-federal'], self.bundle['sources']['future-federal'])
        self.assertIn(self.bundle['records'][-1], result['records'])
        self.assertEqual(result['notice'], self.bundle['notice'])

    def test_incomplete_or_changed_scope_never_replaces_bundle(self):
        before = copy.deepcopy(self.bundle)
        for mutate in ('count', 'truncated', 'duplicate', 'wrong_state', 'duplicate_record', 'missing_field'):
            with self.subTest(mutate=mutate):
                self.setUp()
                if mutate == 'count': self.count = 218
                elif mutate == 'truncated': self.truncated = True
                elif mutate == 'duplicate': self.rows[1]['attributes']['Geography'] = self.rows[0]['attributes']['Geography']
                elif mutate == 'wrong_state': self.rows[0]['attributes']['Geography'] = '42095000100'
                elif mutate == 'duplicate_record': self.rows[1]['attributes']['OBJECTID'] = self.rows[0]['attributes']['OBJECTID']
                else: self.meta['fields'] = []
                with self.assertRaises(ValueError): self.run_refresh()
                self.assertEqual(before, self.bundle)

    def test_outage_and_source_edit_during_read_leave_existing_evidence_untouched(self):
        before = copy.deepcopy(self.bundle)
        def unavailable(url): raise OSError('Synthetic outage')
        with self.assertRaises(OSError): refresh.refresh(self.bundle, reader=unavailable, now=self.now)
        calls = 0
        def unstable(url):
            nonlocal calls
            data = self.reader(url)
            if '/query?' not in url:
                calls += 1
                if calls > 1: data['editingInfo']['lastEditDate'] += 1000
            return data
        with self.assertRaises(ValueError): refresh.refresh(self.bundle, reader=unstable, now=self.now)
        self.assertEqual(before, self.bundle)


if __name__ == '__main__':
    unittest.main()
