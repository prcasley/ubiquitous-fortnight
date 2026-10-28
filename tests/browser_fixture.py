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
        if re.search(r'\b(PA|Pennsylvania|Allentown|Easton|Erie)\b',query,re.I):
            easton='Easton' in query
            county='Erie' if 'Erie' in query else 'Northampton' if easton else 'Lehigh'
            respond(route,{'candidates':[{'score':100,'address':query,'location':{'x':-75.22 if easton else -75.49,'y':40.69 if easton else 40.602},'attributes':{'RegionAbbr':'PA','Subregion':county+' County'}}]})
            return
        if 'Albany' in query:
            respond(route,{'candidates':[{'score':100,'address':query,'location':{'x':-73.75,'y':42.65},'attributes':{'RegionAbbr':'NY','Subregion':'Albany County'}}]})
            return
        if 'Secaucus' in query:
            respond(route,{'candidates':[{'score':100,'address':query,'location':{'x':-74.063,'y':40.789},'attributes':{'RegionAbbr':'NJ','Subregion':'Hudson County'}}]})
            return
        nj_place=bool(re.search(r'\b(NJ|Edison|Parsippany)\b',params.get('SingleLine',[''])[0],re.I))
        respond(route, {'candidates': [{'score': 100, 'address': 'Edison, NJ' if nj_place else 'Palm Beach County, FL', 'location': {'x': -74.363 if nj_place else -80.13, 'y': 40.527 if nj_place else 26.72}, 'attributes': {'RegionAbbr': 'NJ' if nj_place else 'FL', 'Subregion': 'Middlesex County' if nj_place else 'Palm Beach County'}}]})
        return
    if parsed.hostname in ('geo.dot.gov','services6.arcgis.com'):
        if mode.get('ozFail'):
            respond(route,{'error':{'message':'Synthetic reference outage'}},503)
        elif params.get('returnCountOnly')==['true']:
            respond(route,{'count':281 if mode.get('ozCap') else 1})
        else:
            env=json.loads(params.get('geometry',['{}'])[0])
            lon=(env.get('xmin',-80.14)+env.get('xmax',-80.12))/2
            lat=(env.get('ymin',26.71)+env.get('ymax',26.73))/2
            respond(route,{'type':'FeatureCollection','features':[{'type':'Feature','geometry':polygon(lon,lat),'properties':{'geoid10':'12099000100','GEOID':'12099000100','OZ_2_0_Eli':'unknown' if mode.get('ozUnknown') else 'eligible'}}],'exceededTransferLimit':bool(mode.get('ozTruncated'))})
        return
    if parsed.hostname in ('gis.lehighcounty.org','gis.northamptoncounty.org'):
        if mode.get('paFail'):
            respond(route,{'error':{'message':'Synthetic PA outage'}},503)
            return
        north=parsed.hostname=='gis.northamptoncounty.org'
        idfield='PARCEL_ID' if north else 'PIN'
        if not parsed.path.endswith('/query'):
            fields=[{'name':'OBJECTID','type':'esriFieldTypeOID'},{'name':idfield,'type':'esriFieldTypeString'},{'name':'ACREAGE','type':'esriFieldTypeDouble'},{'name':'USE_DESC','type':'esriFieldTypeString'},{'name':'YEAR_BUILT','type':'esriFieldTypeSmallInteger'},{'name':'SITE_ADDRESS','type':'esriFieldTypeString'}]
            if mode.get('paNoClass'): fields=[f for f in fields if f['name']!='USE_DESC']
            respond(route,{'geometryType':'esriGeometryPolygon','fields':fields,'advancedQueryCapabilities':{'supportsPagination':True,'supportsOrderBy':True}})
        elif params.get('returnCountOnly')==['true']: respond(route,{'count':2})
        else:
            assert not re.search(r'OWNER|MAIL|CONTACT',params.get('outFields',[''])[0])
            features=[{'type':'Feature','properties':{'OBJECTID':i,idfield:('N' if north else 'L')+str(i),'ACREAGE':6,'USE_DESC':'Industrial warehouse','YEAR_BUILT':1984,'SITE_ADDRESS':'Synthetic PA property'},'geometry':parcel_polygon(-75.22 if north else -75.49,40.69 if north else 40.602,6)} for i in range(2)]
            respond(route,{'type':'FeatureCollection','features':features,'exceededTransferLimit':False})
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
            props['OBJECTID']=i
            if nj: props['YR_CONSTR']=1974 if i%2==0 else 0
            geometry = parcel_polygon(-74.363,40.527,acres) if nj else parcel_polygon(-80.13,26.72,acres)
            if nj and mode.get('secaucus'): geometry=parcel_polygon(-74.063,40.789,acres)
            if fdor:
                props = {'PARCEL_ID': 'SAME-ID', 'CO_NO': 53 if i==0 else 66, 'LND_SQFOOT': acres*43560, 'DOR_UC': '048'}
                props['OBJECTID']=i
                geometry = {'type':'Point','coordinates':[-80.13,26.72]}
            features.append({'type':'Feature','properties':props,'geometry':geometry})
        if nj and mode.get('badAcreage'):
            for f in features:
                if f['properties']['CALC_ACRE']==44900: f['geometry']=parcel_polygon(-74.363,40.527,1.031)
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
