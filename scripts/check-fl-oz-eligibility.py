"""Weekly guard for the FloridaCommerce OZ 2.0 eligibility layers Radar reads live.

Radar queries boundaries live and retains a dated, aggregate-statistics snapshot. This check fails
loudly if FloridaCommerce changes the schema, designations, tract counts or splits a
tract across both layers, so the change is reviewed before executives rely on it.
Eligibility is never treated as nomination or certification. The public-recommendation
layer (which carries contact fields) is deliberately not read.
"""
import json
import re
import sys
import urllib.parse
import urllib.request

BASE = 'https://services1.arcgis.com/HpJC1O7FLVQlHgaG/arcgis/rest/services'
LAYERS = {
    'met': (BASE + '/oppzones_ustreasury_met/FeatureServer/0', 'Meets Criteria', 1367),
    'notMet': (BASE + '/oppzones_ustreasury_NotMet/FeatureServer/0', 'Does not Meets Criteria', 3709),
}
FIELDS = {'GEOID', 'designatio', 'tract_pove', 'Median_Fam', 'MetroArea_'}
# Reviewed anchor: 7777 Southern Blvd, West Palm Beach (PCN 00-42-43-27-05-006-4201).
ANCHOR = ('12099007833', 'notMet')


def read_json(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'CapitalRadar-PublicReferenceCheck/1.0'})
    with urllib.request.urlopen(request, timeout=60) as response:
        data = json.load(response)
    if not isinstance(data, dict) or data.get('error'):
        raise ValueError('FloridaCommerce returned an invalid response or service error')
    return data


def query(url, params, reader):
    return reader(url + '/query?' + urllib.parse.urlencode({'f': 'json', **params}))


def check(reader=read_json):
    seen = {}
    for name, (url, designation, expected) in LAYERS.items():
        meta = reader(url + '?f=json')
        if meta.get('geometryType') != 'esriGeometryPolygon' or not FIELDS.issubset({f.get('name') for f in meta.get('fields', [])}):
            raise ValueError(f'{name}: layer schema changed; review before relying on it')
        count = query(url, {'where': '1=1', 'returnCountOnly': 'true'}, reader).get('count')
        if type(count) is not int or count != expected:
            raise ValueError(f'{name}: expected {expected} tracts, found {count}; review the source (it may now reflect nominations or a new round)')
        values = query(url, {'where': '1=1', 'outFields': 'designatio', 'returnDistinctValues': 'true', 'returnGeometry': 'false'}, reader).get('features')
        if not isinstance(values, list) or [f.get('attributes', {}).get('designatio') for f in values] != [designation]:
            raise ValueError(f'{name}: designation values changed; review required')
        ids, offset = [], 0
        while offset < expected:
            page = query(url, {'where': '1=1', 'outFields': 'GEOID', 'returnGeometry': 'false', 'orderByFields': 'GEOID',
                               'resultOffset': offset, 'resultRecordCount': 1000}, reader)
            batch = [str(f.get('attributes', {}).get('GEOID', '')) for f in page.get('features', [])]
            ids += batch
            offset += len(batch)
            if not batch or (len(batch) < 1000 and not page.get('exceededTransferLimit')):
                break
        if len(ids) != expected or len(set(ids)) != expected or any(not re.fullmatch(r'12\d{9}', g) for g in ids):
            raise ValueError(f'{name}: tract identities are invalid, repeated or incomplete')
        seen[name] = set(ids)
    if seen['met'] & seen['notMet']:
        raise ValueError('A tract appears in both Meets and Does-not-meet layers')
    if ANCHOR[0] not in seen[ANCHOR[1]]:
        raise ValueError('Reviewed anchor tract 12099007833 changed classification; review required')
    return {name: len(ids) for name, ids in seen.items()}


if __name__ == '__main__':
    try:
        result = check()
    except Exception as error:  # noqa: BLE001 - report any source change plainly
        print('FloridaCommerce eligibility check FAILED:', error)
        sys.exit(1)
    print('FloridaCommerce eligibility layers verified:', json.dumps(result), '(eligibility only; not nominations)')
