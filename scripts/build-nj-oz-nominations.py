"""Refresh NJ state nominations; never infer federal certification.

Run manually or from the weekly workflow. Unchanged facts are written only when
fewer than 30 days remain on the existing evidence, avoiding timestamp-only
commits every week. A failed source check never replaces the last good bundle.
"""
import datetime as dt
import json
import os
import pathlib
import re
import tempfile
import urllib.parse
import urllib.request

LAYER = 'https://services.arcgis.com/Aur8tCo478N3VovT/arcgis/rest/services/2026_Opportunity_Zone_2_0_Nominations/FeatureServer/0'
ANNOUNCEMENT = 'https://www.nj.gov/dca/news/news/2026/approved/20261029.shtml'
SOURCE_ID = 'nj-dca-oz2-nominations'
OUT = pathlib.Path(__file__).resolve().parents[1] / 'assets/data/oz-designation-evidence.json'
FIELDS = ['OBJECTID', 'Geography', 'County', 'Municipality', 'Rural']
EXPECTED_COUNT = 130  # A changed scope needs source review before publication.


def read_json(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'CapitalRadar-PublicReferenceRefresh/1.0'})
    with urllib.request.urlopen(request, timeout=60) as response:
        data = json.load(response)
    if not isinstance(data, dict) or data.get('error'):
        raise ValueError('Official source returned an invalid response or service error')
    return data


def query(params, reader):
    return reader(LAYER + '/query?' + urllib.parse.urlencode(params))


def iso(value):
    return value.isoformat().replace('+00:00', 'Z')


def refresh(existing, *, reader=read_json, now=None):
    now = (now or dt.datetime.now(dt.timezone.utc)).replace(microsecond=0)
    if existing.get('version') != 1 or existing.get('round') != '2027' or not isinstance(existing.get('sources'), dict) or not isinstance(existing.get('records'), list):
        raise ValueError('Existing evidence bundle schema/round needs review')
    meta = reader(LAYER + '?f=json')
    if meta.get('geometryType') != 'esriGeometryPolygon' or not set(FIELDS).issubset({f.get('name') for f in meta.get('fields', [])}):
        raise ValueError('Official nomination layer schema changed; review required')
    count = query({'where': '1=1', 'returnCountOnly': 'true', 'f': 'json'}, reader).get('count')
    if type(count) is not int or count != EXPECTED_COUNT:
        raise ValueError('Nomination count changed; review source before replacing evidence')
    page = query({'where': '1=1', 'outFields': ','.join(FIELDS), 'returnGeometry': 'false', 'orderByFields': 'Geography', 'f': 'json'}, reader)
    features = page.get('features')
    if page.get('exceededTransferLimit') or not isinstance(features, list) or len(features) != count:
        raise ValueError('Nomination response was truncated or did not reconcile')
    rows = [f['attributes'] for f in features]
    ids = [str(r.get('Geography', '')) for r in rows]
    if any(not re.fullmatch(r'34\d{9}', geoid) for geoid in ids) or len(set(ids)) != count:
        raise ValueError('Invalid or repeated NJ tract identities')
    object_ids = [r.get('OBJECTID') for r in rows]
    if any(type(oid) is not int or oid < 0 for oid in object_ids) or len(set(object_ids)) != count:
        raise ValueError('Invalid or repeated source record identities')
    edited = dt.datetime.fromtimestamp(meta['editingInfo']['lastEditDate'] / 1000, dt.timezone.utc).replace(microsecond=0)
    if edited > now:
        raise ValueError('Source edit date is in the future')
    # Detect a layer edit during the read, including same-count membership changes.
    after = reader(LAYER + '?f=json')
    if after.get('editingInfo', {}).get('lastEditDate') != meta['editingInfo']['lastEditDate']:
        raise ValueError('Source changed during retrieval; try again later')
    source = {'enabled': True, 'name': 'NJ Department of Community Affairs · 2026 Opportunity Zone 2.0 Nominations',
              'origin': 'https://services.arcgis.com', 'pathPrefix': '/Aur8tCo478N3VovT/arcgis/rest/services/2026_Opportunity_Zone_2_0_Nominations/',
              'authority': 'state-government', 'state': 'NJ', 'announcement': ANNOUNCEMENT,
              'layer': LAYER, 'layerLastEdit': iso(edited)}
    records = [{'geoid': str(r['Geography']), 'round': '2027', 'stage': 'state-nominated', 'sourceId': SOURCE_ID,
                'recordId': 'NJDCA-OZ2-NOM-' + str(r['OBJECTID']),
                'sourceURL': LAYER + '/query?' + urllib.parse.urlencode({'where': "Geography='" + str(r['Geography']) + "'", 'outFields': '*', 'f': 'json'}),
                'publishedAt': '2026-10-28T00:00:00Z', 'checkedAt': iso(now), 'validUntil': iso(now + dt.timedelta(days=89)),
                'county': r['County'], 'municipality': r['Municipality'], 'sourceRuralFlag': r['Rural']}
               for r in sorted(rows, key=lambda row: str(row['Geography']))]
    previous = [r for r in existing['records'] if r.get('sourceId') == SOURCE_ID]
    def facts(items):
        return sorted([{k: v for k, v in r.items() if k not in ('checkedAt', 'validUntil')} for r in items], key=lambda r: r['geoid'])
    try:
        def needs_renewal(record):
            checked = dt.datetime.fromisoformat(record['checkedAt'].replace('Z', '+00:00'))
            expires = dt.datetime.fromisoformat(record['validUntil'].replace('Z', '+00:00'))
            return checked > now or expires <= now + dt.timedelta(days=30) or expires <= checked or expires - checked > dt.timedelta(days=90)
        renewal_due = any(needs_renewal(r) for r in previous)
    except (KeyError, TypeError, ValueError):
        renewal_due = True
    if existing['sources'].get(SOURCE_ID) == source and facts(previous) == facts(records) and not renewal_due:
        return None
    # Preserve PA/FL and any separately verified federal sources and evidence.
    result = {**existing, 'sources': {**existing['sources'], SOURCE_ID: source},
              'records': [r for r in existing['records'] if r.get('sourceId') != SOURCE_ID] + records}
    result['notice'] = ('New Jersey state nominations (130 tracts, submitted to Treasury Oct 28, 2026) are connected from the official NJ DCA layer, checked '
                        + iso(now)[:10] + '. Nomination is not Treasury certification. Florida and Pennsylvania nominations and all federal certifications are not connected.')
    # Do not overwrite a future multi-source notice with the NJ-only wording.
    if any(key != SOURCE_ID for key in existing['sources']):
        result['notice'] = existing.get('notice', 'State nomination evidence is not federal certification; review source dates.')
    return result


def main():
    existing = json.loads(OUT.read_text())
    result = refresh(existing)
    if result is None:
        print('Official NJ source checked; facts unchanged and evidence not due for renewal.')
        return
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', dir=OUT.parent, suffix='.tmp', delete=False) as file:
            temporary = file.name
            file.write(json.dumps(result, indent=1) + '\n')
        os.replace(temporary, OUT)
    finally:
        if temporary and os.path.exists(temporary):
            os.unlink(temporary)
    print('Updated NJ state-nomination evidence; no federal certification was inferred.')


if __name__ == '__main__':
    main()
