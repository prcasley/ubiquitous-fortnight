"""Shared synthetic network fixtures for isolated browser suites. No live property data."""
import functools
import json
import re
import shutil
import os
import secrets
import subprocess
import base64
import struct
import zlib
import threading
import math
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT / 'dist')))
threading.Thread(target=server.serve_forever, daemon=True).start()

def polygon(lon, lat):
    return {'type': 'Polygon', 'coordinates': [[[lon-.0001, lat-.0001], [lon+.0001, lat-.0001], [lon+.0001, lat+.0001], [lon-.0001, lat+.0001], [lon-.0001, lat-.0001]]]}

def parcel_polygon(lon,lat,acres):
    dy=math.sqrt(max(acres,.001)*4046.8564224)/2/111195
    dx=dy/math.cos(math.radians(lat))
    return {'type':'Polygon','coordinates':[[[lon-dx,lat-dy],[lon+dx,lat-dy],[lon+dx,lat+dy],[lon-dx,lat+dy],[lon-dx,lat-dy]]]}

mode = {'fail': False, 'partial': False, 'collision': False, 'chat': False, 'cards': False, 'imageryFail': False}
mode.update({'njPaging':False,'repeatPage':False,'countDrift':False,'njCap':False})
def png_chunk(tag, data):
    return struct.pack('>I',len(data))+tag+data+struct.pack('>I',zlib.crc32(tag+data)&0xffffffff)
PNG=b'\x89PNG\r\n\x1a\n'+png_chunk(b'IHDR',struct.pack('>IIBBBBB',2,2,8,6,0,0,0))+png_chunk(b'IDAT',zlib.compress((b'\x00'+b'\x77\x99\x88\xff'*2)*2))+png_chunk(b'IEND',b'')
queries = []
external_requests = []

def respond(route, payload, status=200):
    route.fulfill(status=status, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps(payload))

def network(route):
    parsed = urlparse(route.request.url)
    if parsed.hostname == '127.0.0.1':
        route.continue_()
        return
    params = parse_qs(parsed.query)
    external_requests.append(route.request.url)
    if parsed.hostname=='server.arcgisonline.com' and parsed.path.endswith('/export'):
        if mode['imageryFail']: route.abort()
        else: route.fulfill(status=200,content_type='image/png',headers={'access-control-allow-origin':'*'},body=PNG)
        return
    if parsed.hostname == 'geocode.arcgis.com':
        query=params.get('SingleLine',[''])[0]
        normalized=re.sub(r'[,?.]', ' ',query).strip().lower()
        normalized=re.sub(r'\s+', ' ',normalized)
        places={
            'edison':('NJ','Middlesex',-74.363,40.527), 'secaucus':('NJ','Hudson',-74.063,40.789),
            'woodbridge':('NJ','Middlesex',-74.28,40.55), 'north bergen':('NJ','Hudson',-74.01,40.80),
            'perth amboy':('NJ','Middlesex',-74.27,40.51), 'port newark':('NJ','Essex',-74.14,40.69),
            'parsippany':('NJ','Morris',-74.42,40.86), 'south plainfield':('NJ','Middlesex',-74.41,40.58),
            'west palm beach':('FL','Palm Beach',-80.13,26.72), 'palm beach':('FL','Palm Beach',-80.13,26.72),
            'palm beach county':('FL','Palm Beach',-80.13,26.72), 'mangonia park':('FL','Palm Beach',-80.07,26.76),
            'allentown':('PA','Lehigh',-75.49,40.602), 'easton':('PA','Northampton',-75.22,40.69),
            'erie':('PA','Erie',-80.08,42.12), 'albany':('NY','Albany',-73.75,42.65)
        }
        # State abbreviations alone and unknown towns intentionally return no candidates.
        place=re.sub(r'\s+(?:nj|fl|pa|ny|new jersey|florida|pennsylvania)$','',normalized)
        if place=='40 hilton st easton': place='easton'
        if place=='5900 australian ave west palm beach': place='west palm beach'
        found=places.get(place)
        if not found:
            respond(route,{'candidates':[]});return
        state,county,lon,lat=found
        if mode.get('persona') or (mode.get('crossBorder') and place=='easton'): mode['fixtureCenter']=(lon,lat)
        respond(route,{'candidates':[{'score':100,'address':query,'location':{'x':lon,'y':lat},'attributes':{'RegionAbbr':state,'Subregion':county+' County'}}]})
        return
    if parsed.hostname in ('geo.dot.gov','services6.arcgis.com'):
        if mode.get('ozFail'):
            respond(route,{'error':{'message':'Synthetic reference outage'}},503)
        elif params.get('returnCountOnly')==['true']:
            respond(route,{'count':281 if mode.get('ozCap') else 1})
        else:
            env=json.loads(params.get('geometry',['{}'])[0])
            nj="'NJ'" in params.get('where',[''])[0]
            lon=(env.get('xmin',-74.37 if nj else -80.14)+env.get('xmax',-74.35 if nj else -80.12))/2
            lat=(env.get('ymin',40.51 if nj else 26.71)+env.get('ymax',40.53 if nj else 26.73))/2
            respond(route,{'type':'FeatureCollection','features':[{'type':'Feature','geometry':polygon(lon,lat),'properties':{'geoid10':'34023000100' if lat>35 else '12099000100','GEOID':'34023000100' if lat>35 else '12099000100','OZ_2_0_Eli':'unknown' if mode.get('ozUnknown') else 'eligible'}}],'exceededTransferLimit':bool(mode.get('ozTruncated'))})
        return
    if parsed.hostname in ('gis.lehighcounty.org','gis.northamptoncounty.org'):
        if mode.get('paFail'):
            respond(route,{'error':{'message':'Synthetic PA outage'}},503)
            return
        north=parsed.hostname=='gis.northamptoncounty.org'
        idfield='PARCEL_ID' if north else 'PIN'
        acresfield='ASMT_ACREAGE' if north else 'ACREAGE';yearfield='COM_YEAR_BUILT' if north else 'YEAR_BUILT'
        size=320 if mode.get('paLarge') else 2;base=1000000000 if mode.get('paLarge') else 0
        if not parsed.path.endswith('/query'):
            fields=[{'name':'OBJECTID','type':'esriFieldTypeOID'},{'name':idfield,'type':'esriFieldTypeString'},{'name':acresfield,'type':'esriFieldTypeDouble'},{'name':'USE_DESC','type':'esriFieldTypeString'},{'name':yearfield,'type':'esriFieldTypeSmallInteger'},{'name':'SITE_ADDRESS','type':'esriFieldTypeString'}]+[{'name':f,'type':'esriFieldTypeDouble'} for f in ['LAND_VALUE','BLDG_VALUE','SALE_PRICE','SALE_DATE','SALE_VALIDITY_CODE','FLAG_10_KOZ']]
            if mode.get('paNoClass'): fields=[f for f in fields if f['name']!='USE_DESC']
            respond(route,{'geometryType':'esriGeometryPolygon','fields':fields,'advancedQueryCapabilities':{'supportsPagination':True,'supportsOrderBy':True}})
        elif params.get('returnCountOnly')==['true']: respond(route,{'count':size})
        elif params.get('returnIdsOnly')==['true']: respond(route,{'objectIds':list(reversed(range(base,base+size))) if not mode.get('paSnapshotFail') else [0]*size})
        elif 'OWNERS_NAME_1' in params.get('outFields',[''])[0]:
            respond(route,{'features':[{'attributes':{'PARCEL_ID':'N0','OWNERS_NAME_1':'SYNTHETIC COUNTY OWNER LLC','MAIL_ADDRESS':'Synthetic published mailing address'}}]})
        else:
            assert not re.search(r'OWNER|MAIL|CONTACT',params.get('outFields',[''])[0])
            ids=list(map(int,params['objectIds'][0].split(','))) if params.get('objectIds') else list(range(base,base+size))
            features=[{'type':'Feature','properties':{'OBJECTID':i,idfield:('N' if north else 'L')+str(i-base),acresfield:6,'USE_DESC':'Industrial warehouse',yearfield:1984,'SITE_ADDRESS':'Synthetic PA property','LAND_VALUE':100000,'BLDG_VALUE':200000,'SALE_PRICE':1 if i-base==0 else 500000,'SALE_DATE':283996800000 if i-base==0 else 1577836800000,'FLAG_10_KOZ':1,'SALE_VALIDITY_CODE':'unverified'},'geometry':parcel_polygon(-75.22 if north else -75.49,40.69 if north else 40.602,6)} for i in ids]
            if params.get('geometryType')==['esriGeometryPoint'] and not mode.get('paAmbiguous'): features=features[:1]
            respond(route,{'type':'FeatureCollection','features':features,'exceededTransferLimit':False})
        return
    if parsed.hostname=='overpass-api.de':
        data=parse_qs(route.request.post_data or '').get('data',[''])[0]
        m=re.search(r'\]\(([-\d.,]+)\)',data)
        if not m: respond(route,{'remark':'bad fixture query'});return
        south,west,north,east=map(float,m.group(1).split(','));x=(west+east)/2;y=(south+north)/2;dx=(east-west)/4;dy=(north-south)/4
        coords=[(x-dx,y-dy),(x+dx,y-dy),(x+dx,y+dy),(x-dx,y+dy),(x-dx,y-dy)]
        respond(route,{'elements':[{'type':'way','id':1,'nodes':[1,2,3,4,1],'tags':{'building':'warehouse'},'geometry':[{'lon':x,'lat':y} for x,y in coords]}]});return
    if 'USA_Structures_View/FeatureServer/0' in parsed.path or 'Tran_road/FeatureServer/0' in parsed.path:
        building='USA_Structures' in parsed.path
        if not parsed.path.endswith('/query'):
            fields=['OBJECTID','SOURCE','IMAGE_DATE','PROD_DATE','STATE_FIPS'] if building else ['PRIMENAME','SHLD_TYPE','SHLD_NUM','SRI']
            respond(route,{'geometryType':'esriGeometryPolygon' if building else 'esriGeometryPolyline','fields':[{'name':f} for f in fields]})
        elif params.get('returnCountOnly')==['true']:respond(route,{'count':1})
        else:
            env=json.loads(params['geometry'][0]);x=(env['xmin']+env['xmax'])/2;y=(env['ymin']+env['ymax'])/2
            if building:
                dx=(env['xmax']-env['xmin'])/4;dy=(env['ymax']-env['ymin'])/4
                g={'type':'Polygon','coordinates':[[[x-dx,y-dy],[x+dx,y-dy],[x+dx,y+dy],[x-dx,y+dy],[x-dx,y-dy]]]}
                props={'SOURCE':'Synthetic public geometry','IMAGE_DATE':'2024-01-01','PROD_DATE':'2025-01-01'}
            else:g={'type':'LineString','coordinates':[[x,y-.01],[x,y+.01]]};props={'PRIMENAME':'Interstate 287','SHLD_TYPE':'INT','SHLD_NUM':'287','SRI':'SYNTHETIC'}
            respond(route,{'features':[{'type':'Feature','geometry':g,'properties':props}]})
        return
    if parsed.hostname in ('hazards.fema.gov', 'fwspublicservices.wim.usgs.gov'):
        if not parsed.path.endswith('/query'):
            respond(route, {'geometryType': 'esriGeometryPolygon', 'fields': [{'name': 'FLD_ZONE'}, {'name': 'ATTRIBUTE'}], 'maxRecordCount': 1000})
        elif params.get('returnCountOnly') == ['true']:
            respond(route, {'count': 1})
        else:
            respond(route, {'type': 'FeatureCollection', 'features': [{'type': 'Feature', 'geometry': parcel_polygon(-80.13,26.72,1000), 'properties': {'FLD_ZONE': 'AE', 'ATTRIBUTE': 'PEM1'}}]})
        return
    if parsed.hostname in ('services1.arcgis.com','services2.arcgis.com','services9.arcgis.com'):
        where = params.get('where', [''])[0]
        queries.append((parsed.hostname, where))
        ownerfields=params.get('outFields',[''])[0]
        if 'OWNER_NAME' in ownerfields and 'OWNER_NAME1' not in ownerfields:
            match=re.search(r"PAMS_PIN = '([^']+)'",where)
            respond(route,{'features':[{'attributes':{'PAMS_PIN':match.group(1) if match else '', 'OWNER_NAME':mode.get('njOwnerName','')}}]});return
        if any(name in ownerfields for name in ['OWNER_NAME1','NAME_LINE_1','TRUE_OWNER1','OWN_NAME']):
            idfield='PARID' if 'OWNER_NAME1' in ownerfields else 'FOLIO_NUMBER' if 'NAME_LINE_1' in ownerfields else 'FOLIO' if 'TRUE_OWNER1' in ownerfields else 'PARCEL_ID'
            ownerfield='OWNER_NAME1' if idfield=='PARID' else 'NAME_LINE_1' if idfield=='FOLIO_NUMBER' else 'TRUE_OWNER1' if idfield=='FOLIO' else 'OWN_NAME'
            match=re.search(idfield+r" = '([^']+)'",where)
            attributes={idfield:match.group(1) if match else 'unknown',ownerfield:'Synthetic Person' if mode.get('ownerIndividual') else 'SYNTHETIC HOLDINGS LLC','ASMNT_YR':2026,'CO_NO':60}
            respond(route,{'features':[{'attributes':attributes}]})
            return
        if mode['fail']:
            respond(route, {'error': {'message': 'Synthetic outage'}}, 503)
            return
        if mode['partial'] and int(params.get('resultOffset', ['0'])[0]) > 0:
            respond(route, {'error': {'message': 'Synthetic second-page outage'}}, 503)
            return
        nj = parsed.hostname == 'services2.arcgis.com'
        fdor = parsed.hostname == 'services9.arcgis.com'
        features = []
        acres_values = ([3,4,5,6,6.4,7,10] if mode['chat'] else [3,4,5]) if not mode['partial'] else [3]*150
        if mode['cards']: acres_values=[6]*49
        if mode.get('executive') and not mode['partial']: acres_values=[6,12,8,20,5]
        if mode.get('ceo'): acres_values=[6,12,25,40,5]
        if nj and mode['njPaging']: acres_values=[6]*350
        if nj and mode['njCap']: acres_values=[6]*1137
        if nj and mode.get('badAcreage'): acres_values=[6,44900,20]
        if mode['collision']:
            acres_values = [3,3]
        for i, acres in enumerate(acres_values):
            conditions = re.findall(r'(?:ACRES|CALC_ACRE) (>=|<=|>|<|=) ([\d.]+)', where)
            if any(not {'>=': acres >= float(value), '>': acres > float(value), '<': acres < float(value), '<=': acres <= float(value), '=': acres == float(value)}[op] for op,value in conditions):
                continue
            props = {'PAMS_PIN': 'NJ-'+str(i), 'PROP_LOC': 'Synthetic NJ parcel', 'MUN_NAME': 'Edison', 'PROP_CLASS': '4B', 'CALC_ACRE': acres, 'COUNTY': 'Middlesex'} if nj else {'PARID': 'PBC-'+str(i), 'SITE_ADDR_STR': 'Synthetic FL parcel', 'MUNICIPALITY': 'Palm Beach', 'ACRES': acres, 'PROPERTY_USE': 'VACANT INDUSTRIAL' if '%VACANT%' in where else 'DISTRIBUTION', 'YRBLT': 1990}
            if mode.get('persona'):
                if nj and "PROP_CLASS = '4C'" in where: props['PROP_CLASS']='4C'
                if nj and "PROP_CLASS = '1'" in where: props['PROP_CLASS']='1'
                if not nj and '%MULTI%' in where: props['PROPERTY_USE']='MULTIFAMILY'
            props['OBJECTID']=i
            if nj: props['YR_CONSTR']=1974 if i%2==0 else 0
            geometry = parcel_polygon(-74.363,40.527,acres) if nj else parcel_polygon(-80.13,26.72,acres)
            if mode.get('persona'):
                lon,lat=mode.get('fixtureCenter',(-74.363,40.527));geometry=parcel_polygon(lon,lat,acres)
            if nj and mode.get('crossBorder') and mode.get('fixtureCenter')==(-75.22,40.69): geometry=parcel_polygon(-75.18,40.69,acres)
            if nj and mode.get('secaucus'): geometry=parcel_polygon(-74.063,40.789,acres)
            if fdor:
                props = {'PARCEL_ID': 'SAME-ID', 'CO_NO': 53 if i==0 else 66, 'LND_SQFOOT': acres*43560, 'DOR_UC': '048'}
                props['OBJECTID']=i
                geometry = {'type':'Point','coordinates':[-80.13,26.72]}
            features.append({'type':'Feature','properties':props,'geometry':geometry})
        if nj and mode.get('badAcreage'):
            for f in features:
                if f['properties']['CALC_ACRE']==44900: f['geometry']=parcel_polygon(-74.363,40.527,1.031)
        if mode.get('persona') and params.get('resultRecordCount')==['7']:
            env=json.loads(params['geometry'][0]);lon=(env['xmin']+env['xmax'])/2;lat=(env['ymin']+env['ymax'])/2
            features=[{'type':'Feature','properties':{'PARID':'ADDRESS-5900','SITE_ADDR_STR':'5900 Australian Ave','PROPERTY_USE':'DISTRIBUTION','ACRES':6,'YRBLT':1980},'geometry':parcel_polygon(lon,lat,6)}]
        if mode.get('mapInspect') and params.get('resultRecordCount')==['7']:
            env=json.loads(params['geometry'][0]);lon=(env['xmin']+env['xmax'])/2;lat=(env['ymin']+env['ymax'])/2
            features=[{'type':'Feature','properties':{'PARID':'INSPECT-HOME','SITE_ADDR_STR':'Synthetic inspection home','PROPERTY_USE':'SINGLE FAMILY RESIDENTIAL','ACRES':.2,'YRBLT':1991},'geometry':polygon(lon,lat)}]
        if params.get('returnCountOnly') == ['true']:
            respond(route, {'count': len(features)+(1 if nj and mode['countDrift'] else 0)})
        elif nj or fdor:
            offset=0 if mode['repeatPage'] else int(params.get('resultOffset',['0'])[0])
            limit=min(100,int(params.get('resultRecordCount',['150'])[0]))
            rows=features[offset:offset+limit]
            respond(route, {'type':'FeatureCollection','features':rows,'exceededTransferLimit':offset+len(rows)<len(features)})
        else:
            respond(route, {'type':'FeatureCollection','features':features,'exceededTransferLimit':mode['partial']})
        return
    route.abort()


def unlock(page):
    """Exercise the real courtesy-screen form; never bypass application code."""
    if page.locator('#accessGate').count() and page.locator('#accessGate').is_visible():
        page.fill('#accessPassword','WP123');page.click('#accessForm button')
        page.wait_for_function('!document.documentElement.hasAttribute("data-radar-locked")')
