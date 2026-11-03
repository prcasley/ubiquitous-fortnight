"""NJ DCA Oct 29, 2026 release coverage: every announced municipality stays on the map.

The release (https://www.nj.gov/dca/news/news/2026/approved/20261029.shtml) lists 60
municipality labels (including a combined South Hackensack/Teterboro label)
and 130 tracts across 20 counties. These contracts fail the weekly refresh (before any commit) if the
published evidence bundle silently drops, renames or misfiles any of them.
"""
import collections
import copy
import datetime as dt
import json
import pathlib
import re
import unittest
from urllib.parse import urlparse, parse_qs

ROOT = pathlib.Path(__file__).resolve().parents[1]
BUNDLE = ROOT / 'assets/data/oz-designation-evidence.json'
SOURCE_ID = 'nj-dca-oz2-nominations'
BASELINE = json.loads((ROOT / 'tests/data/nj-oz-release-20261029.json').read_text())
LAYER = 'https://services.arcgis.com/Aur8tCo478N3VovT/arcgis/rest/services/2026_Opportunity_Zone_2_0_Nominations/FeatureServer/0'

# Release wording -> exact municipality name in the official DCA layer.
# The release prints "Woodlynn"; the official layer/Census name is "Woodlynne borough".
RELEASE_MUNICIPALITIES = {
    'Atlantic City': 'Atlantic City city', 'Bayonne': 'Bayonne city', 'Bloomfield': 'Bloomfield township',
    'Bound Brook': 'Bound Brook borough', 'Bridgeton': 'Bridgeton city', 'Burlington City': 'Burlington city',
    'Camden City': 'Camden city', 'Carteret': 'Carteret borough', 'City of Orange': 'City of Orange township',
    'Clifton': 'Clifton city', 'Dunellen': 'Dunellen borough', 'East Newark': 'East Newark borough',
    'East Orange': 'East Orange city', 'Edgewater Park': 'Edgewater Park township', 'Egg Harbor Township': 'Egg Harbor township',
    'Elizabeth': 'Elizabeth city', 'Ewing': 'Ewing township', 'Fairview': 'Fairview borough', 'Garfield': 'Garfield city',
    'Gloucester Township': 'Gloucester township', 'Guttenberg': 'Guttenberg town', 'Hackensack': 'Hackensack city',
    'Hamilton Township': 'Hamilton township', 'Hillside': 'Hillside township', 'Irvington': 'Irvington township',
    'Jackson': 'Jackson township', 'Jersey City': 'Jersey City city', 'Keansburg': 'Keansburg borough', 'Kearny': 'Kearny town',
    'Lakewood': 'Lakewood township', 'Long Branch': 'Long Branch city', 'Manchester Township': 'Manchester township',
    'Millville': 'Millville city', 'Morristown': 'Morristown town', 'Mount Olive': 'Mount Olive township',
    'Neptune Township': 'Neptune township', 'New Brunswick': 'New Brunswick city', 'Newark': 'Newark city',
    'Newton': 'Newton town', 'Parsippany-Troy Hills': 'Parsippany-Troy Hills township', 'Passaic City': 'Passaic city',
    'Paterson': 'Paterson city', 'Paulsboro': 'Paulsboro borough', 'Penns Grove': 'Penns Grove borough',
    'Pennsauken': 'Pennsauken township', 'Perth Amboy': 'Perth Amboy city', 'Phillipsburg': 'Phillipsburg town',
    'Plainfield': 'Plainfield city', 'Pleasantville': 'Pleasantville city', 'Riverside Township': 'Riverside township',
    'Salem City': 'Salem city', 'Sayreville': 'Sayreville borough', 'Seaside Heights': 'Seaside Heights borough',
    'Somers Point': 'Somers Point city', 'South Hackensack Twp./Teterboro': 'South Hackensack twp./Teterboro borough',
    'Trenton': 'Trenton city', 'Union City': 'Union City city', 'Vineland': 'Vineland city', 'Woodbine': 'Woodbine borough',
    'Woodlynn': 'Woodlynne borough',
}
NJ_COUNTY_FIPS = {
    '001': 'Atlantic', '003': 'Bergen', '005': 'Burlington', '007': 'Camden', '009': 'Cape May', '011': 'Cumberland',
    '013': 'Essex', '015': 'Gloucester', '017': 'Hudson', '019': 'Hunterdon', '021': 'Mercer', '023': 'Middlesex',
    '025': 'Monmouth', '027': 'Morris', '029': 'Ocean', '031': 'Passaic', '033': 'Salem', '035': 'Somerset',
    '037': 'Sussex', '039': 'Union', '041': 'Warren',
}
# Municipalities that straddle no county line: each announced town must sit in exactly one county.
EXPECTED_TOTALS = {'tracts': 130, 'counties': 20, 'municipalities': 60}


def nj_records(bundle):
    return [r for r in bundle['records'] if r.get('sourceId') == SOURCE_ID]


def coverage_problems(bundle):
    """Return every reason the bundle no longer reflects the Oct 29 release (empty list = covered)."""
    problems = []
    records = nj_records(bundle)
    geoids = [r.get('geoid') for r in records]
    if len(records) != EXPECTED_TOTALS['tracts']:
        problems.append(f'expected {EXPECTED_TOTALS["tracts"]} nominated tracts, found {len(records)}')
    if len(set(geoids)) != len(geoids):
        problems.append('repeated tract GEOIDs')
    if len({r.get('recordId') for r in records}) != len(records):
        problems.append('repeated source record IDs')
    present = {r.get('municipality') for r in records}
    for release_name, layer_name in RELEASE_MUNICIPALITIES.items():
        if layer_name not in present:
            problems.append(f'release municipality missing from map evidence: {release_name} ({layer_name})')
    for extra in sorted(present - set(RELEASE_MUNICIPALITIES.values()), key=str):
        problems.append(f'municipality not in the release list: {extra}')
    counties = {r.get('county') for r in records}
    if len(counties) != EXPECTED_TOTALS['counties']:
        problems.append(f'expected {EXPECTED_TOTALS["counties"]} counties, found {len(counties)}')
    expected = {r['geoid']: r for r in BASELINE['tracts']}
    actual = {str(r.get('geoid')): r for r in records}
    if set(actual) != set(expected):
        problems.append('tract membership differs from reviewed release baseline')
    for geoid in set(actual) & set(expected):
        if any(actual[geoid].get(key) != expected[geoid][key] for key in ('county', 'municipality')):
            problems.append(f'tract {geoid} differs from reviewed release county/municipality mapping')
    by_town = collections.defaultdict(set)
    for r in records:
        geoid = str(r.get('geoid', ''))
        if not re.fullmatch(r'34\d{9}', geoid):
            problems.append(f'invalid NJ tract GEOID {geoid!r}')
            continue
        if NJ_COUNTY_FIPS.get(geoid[2:5]) != r.get('county'):
            problems.append(f'tract {geoid} filed under {r.get("county")!r}, GEOID county is {NJ_COUNTY_FIPS.get(geoid[2:5])!r}')
        by_town[r.get('municipality')].add(r.get('county'))
        if r.get('stage') != 'state-nominated' or r.get('round') != '2027':
            problems.append(f'tract {geoid} has stage/round {r.get("stage")}/{r.get("round")}; nomination must never read as certification')
        url = urlparse(str(r.get('sourceURL', '')))
        where = parse_qs(url.query).get('where', [''])[0]
        if url.scheme != 'https' or url.netloc != 'services.arcgis.com' or url.path != urlparse(LAYER).path + '/query' or not re.fullmatch(r"Geography\s*=\s*'" + re.escape(geoid) + "'", where):
            problems.append(f'tract {geoid} evidence link does not point at its own official DCA record')
        try:
            checked = dt.datetime.fromisoformat(r['checkedAt'].replace('Z', '+00:00'))
            valid = dt.datetime.fromisoformat(r['validUntil'].replace('Z', '+00:00'))
            if checked.utcoffset() is None or valid.utcoffset() is None or not checked < valid <= checked + dt.timedelta(days=90):
                problems.append(f'tract {geoid} has an invalid evidence validity window')
        except (KeyError, AttributeError, ValueError, TypeError):
            problems.append(f'tract {geoid} is missing evidence dates')
    for town, county_set in by_town.items():
        if len(county_set) != 1:
            problems.append(f'{town} split across counties {sorted(map(str, county_set))}')
    source = bundle.get('sources', {}).get(SOURCE_ID, {})
    if source.get('enabled') is not True or source.get('authority') != 'state-government' or source.get('state') != 'NJ' or source.get('layer') != LAYER or source.get('announcement') != 'https://www.nj.gov/dca/news/news/2026/approved/20261029.shtml':
        problems.append('NJ DCA source is disabled or no longer points at the official layer/announcement')
    return problems


class ReleaseCoverageTest(unittest.TestCase):
    def setUp(self):
        self.bundle = json.loads(BUNDLE.read_text())

    def test_release_list_itself_is_complete(self):
        self.assertEqual(len(RELEASE_MUNICIPALITIES), EXPECTED_TOTALS['municipalities'])
        self.assertEqual(len(set(RELEASE_MUNICIPALITIES.values())), EXPECTED_TOTALS['municipalities'])

    def test_published_bundle_covers_every_release_municipality_tract_and_county(self):
        self.assertEqual(coverage_problems(self.bundle), [])

    def test_each_release_municipality_has_at_least_one_tract(self):
        counts = collections.Counter(r['municipality'] for r in nj_records(self.bundle))
        for release_name, layer_name in RELEASE_MUNICIPALITIES.items():
            with self.subTest(release_name):
                self.assertGreaterEqual(counts[layer_name], 1)

    # Mutation checks: prove the guard actually fails on realistic regressions.
    def mutate(self, fn):
        bundle = copy.deepcopy(self.bundle)
        fn(bundle)
        return coverage_problems(bundle)

    def test_guard_catches_a_dropped_municipality(self):
        for town in ('Woodlynne borough', 'Newark city', 'South Hackensack twp./Teterboro borough'):
            with self.subTest(town):
                problems = self.mutate(lambda b: b.__setitem__('records', [r for r in b['records'] if r.get('municipality') != town]))
                self.assertTrue(any('missing from map evidence' in p for p in problems), problems)

    def test_guard_catches_one_dropped_tract_even_when_all_towns_remain(self):
        newark = [r['geoid'] for r in nj_records(self.bundle) if r['municipality'] == 'Newark city']
        problems = self.mutate(lambda b: b.__setitem__('records', [r for r in b['records'] if r.get('geoid') != newark[0]]))
        self.assertTrue(any('expected 130' in p for p in problems), problems)
        self.assertFalse(any('missing from map evidence' in p for p in problems))

    def test_guard_catches_renamed_or_misfiled_records(self):
        def rename(b):
            nj_records(b)[0]['municipality'] = 'Atlantic City'
        def misfile(b):
            nj_records(b)[0]['county'] = 'Bergen'
        self.assertTrue(any('not in the release list' in p for p in self.mutate(rename)))
        self.assertTrue(any('GEOID county is' in p for p in self.mutate(misfile)))

    def test_guard_refuses_certification_or_wrong_round(self):
        def certify(b):
            nj_records(b)[5]['stage'] = 'certified'
        def old_round(b):
            nj_records(b)[5]['round'] = '2018'
        for fn in (certify, old_round):
            with self.subTest(fn.__name__):
                self.assertTrue(any('never read as certification' in p for p in self.mutate(fn)))

    def test_guard_catches_duplicates_bad_links_and_dates(self):
        def dup(b):
            b['records'].append(copy.deepcopy(nj_records(b)[0]))
        def link(b):
            nj_records(b)[3]['sourceURL'] = 'https://example.com/fake'
        def dates(b):
            nj_records(b)[3]['validUntil'] = nj_records(b)[3]['checkedAt']
        def disabled(b):
            b['sources'][SOURCE_ID]['enabled'] = False
        expectations = {dup: 'repeated tract', link: 'evidence link', dates: 'validity window', disabled: 'source is disabled'}
        for fn, needle in expectations.items():
            with self.subTest(fn.__name__):
                self.assertTrue(any(needle in p for p in self.mutate(fn)), self.mutate(fn))

    def test_guard_catches_same_count_tract_replacement_and_wrong_query_target(self):
        def replacement(b):
            r = nj_records(b)[0]
            old = r['geoid']; r['geoid'] = old[:-1] + ('9' if old[-1] != '9' else '8')
            r['sourceURL'] = r['sourceURL'].replace(old, r['geoid'])
        def wrong_query(b):
            r = nj_records(b)[0]
            r['sourceURL'] = LAYER + "/query?where=Geography%3D%2734999999999%27&fake=" + r['geoid']
        self.assertTrue(any('tract membership differs' in p for p in self.mutate(replacement)))
        self.assertTrue(any('evidence link' in p for p in self.mutate(wrong_query)))

    def test_other_states_evidence_does_not_affect_nj_coverage(self):
        def add_pa(b):
            b['records'].append({'geoid': '42095000100', 'sourceId': 'pa-dced', 'municipality': 'Easton city', 'county': 'Northampton'})
        self.assertEqual(self.mutate(add_pa), [])


if __name__ == '__main__':
    unittest.main()
