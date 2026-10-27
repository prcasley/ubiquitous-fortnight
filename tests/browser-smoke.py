"""Deterministic browser integration checks. No public data or external network required.
Run after npm run build: python3 tests/browser-smoke.py
Requires Playwright Python and Chromium (provided by the cloud environment).
"""
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
        nj_place=bool(re.search(r'\b(NJ|Edison|Parsippany)\b',params.get('SingleLine',[''])[0],re.I))
        respond(route, {'candidates': [{'score': 100, 'address': 'Edison, NJ' if nj_place else 'Palm Beach County, FL', 'location': {'x': -74.363 if nj_place else -80.13, 'y': 40.527 if nj_place else 26.72}, 'attributes': {'RegionAbbr': 'NJ' if nj_place else 'FL', 'Subregion': 'Middlesex County' if nj_place else 'Palm Beach County'}}]})
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
            features=[{'type':'Feature','properties':{'OBJECTID':i,idfield:('N' if north else 'L')+str(i),'ACREAGE':6,'USE_DESC':'Industrial warehouse','YEAR_BUILT':1984,'SITE_ADDRESS':'Synthetic PA property'},'geometry':polygon(-75.22 if north else -75.49,40.69 if north else 40.602)} for i in range(2)]
            respond(route,{'type':'FeatureCollection','features':features,'exceededTransferLimit':False})
        return
    if parsed.hostname in ('hazards.fema.gov', 'fwspublicservices.wim.usgs.gov'):
        if not parsed.path.endswith('/query'):
            respond(route, {'geometryType': 'esriGeometryPolygon', 'fields': [{'name': 'FLD_ZONE'}, {'name': 'ATTRIBUTE'}], 'maxRecordCount': 1000})
        elif params.get('returnCountOnly') == ['true']:
            respond(route, {'count': 1})
        else:
            respond(route, {'type': 'FeatureCollection', 'features': [{'type': 'Feature', 'geometry': polygon(-80.13,26.72), 'properties': {'FLD_ZONE': 'AE', 'ATTRIBUTE': 'PEM1'}}]})
        return
    if parsed.hostname in ('services1.arcgis.com','services2.arcgis.com','services9.arcgis.com'):
        where = params.get('where', [''])[0]
        queries.append((parsed.hostname, where))
        ownerfields=params.get('outFields',[''])[0]
        if any(name in ownerfields for name in ['OWNER_NAME1','NAME_LINE_1','TRUE_OWNER1','OWN_NAME']):
            idfield='PARID' if 'OWNER_NAME1' in ownerfields else 'FOLIO_NUMBER' if 'NAME_LINE_1' in ownerfields else 'FOLIO' if 'TRUE_OWNER1' in ownerfields else 'PARCEL_ID'
            ownerfield='OWNER_NAME1' if idfield=='PARID' else 'NAME_LINE_1' if idfield=='FOLIO_NUMBER' else 'TRUE_OWNER1' if idfield=='FOLIO' else 'OWN_NAME'
            match=re.search(idfield+r" = '([^']+)'",where)
            attributes={idfield:match.group(1) if match else 'unknown',ownerfield:'SYNTHETIC HOLDINGS LLC','ASMNT_YR':2026,'CO_NO':60}
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
        if nj and mode['njPaging']: acres_values=[6]*350
        if nj and mode['njCap']: acres_values=[6]*1101
        if mode['collision']:
            acres_values = [3,3]
        for i, acres in enumerate(acres_values):
            conditions = re.findall(r'(?:ACRES|CALC_ACRE) (>=|<=|>|<|=) ([\d.]+)', where)
            if any(not {'>=': acres >= float(value), '>': acres > float(value), '<': acres < float(value), '<=': acres <= float(value), '=': acres == float(value)}[op] for op,value in conditions):
                continue
            props = {'PAMS_PIN': 'NJ-'+str(i), 'PROP_LOC': 'Synthetic NJ parcel', 'MUN_NAME': 'Edison', 'PROP_CLASS': '4B', 'CALC_ACRE': acres, 'COUNTY': 'Middlesex'} if nj else {'PARID': 'PBC-'+str(i), 'SITE_ADDR_STR': 'Synthetic FL parcel', 'MUNICIPALITY': 'Palm Beach', 'ACRES': acres, 'PROPERTY_USE': 'VACANT INDUSTRIAL' if '%VACANT%' in where else 'DISTRIBUTION', 'YRBLT': 1990}
            props['OBJECTID']=i
            if nj: props['YR_CONSTR']=1974 if i%2==0 else 0
            geometry = polygon(-74.363,40.527) if nj else polygon(-80.13,26.72)
            if fdor:
                props = {'PARCEL_ID': 'SAME-ID', 'CO_NO': 53 if i==0 else 66, 'LND_SQFOOT': acres*43560, 'DOR_UC': '048'}
                props['OBJECTID']=i
                geometry = {'type':'Point','coordinates':[-80.13,26.72]}
            features.append({'type':'Feature','properties':props,'geometry':geometry})
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

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=shutil.which('chromium') or p.chromium.executable_path, headless=True, args=['--no-sandbox'])
        context = browser.new_context(accept_downloads=True)
        page = context.new_page()
        exceptions = []
        page.on('pageerror', lambda error: exceptions.append(str(error)))
        page.route('**/*', network)
        page.goto(f'http://127.0.0.1:{server.server_port}/')
        page.locator('#filterDrawer').evaluate('e=>e.open=true')
        assert page.evaluate('!!window.L && !!window.turf && !!window.PublicRadarBridge.getMap()')
        assert not re.search(r'nvidia|nemotron|webgpu|download.*model',page.locator('body').inner_text(),re.I)
        assert page.locator('#explainResults').is_disabled()
        page.fill('#agentPrompt', 'Find vacant land under 4 acres in Palm Beach County FL')
        page.locator('#agentForm button[type=submit]').click()
        page.wait_for_function('window.PublicRadarBridge.getMeta().complete')
        assert any(host=='services1.arcgis.com' and 'ACRES < 4' in where for host,where in queries), queries
        assert page.evaluate('window.PublicRadarBridge.getResults().map(r=>r.acres)') == [3]
        assert page.evaluate('window.PublicRadarBridge.getResults()[0].type') == 'Vacant'
        assert 'Palm Beach County' in page.locator('#resultInfo').inner_text()
        page.locator('#results .parcel').first.click()
        # Free-source ownership is explicit, dated and saved only as a business observation.
        page.locator('#details .public-owner-section button').click()
        page.wait_for_function('document.getElementById("ownerCompanies").textContent.includes("SYNTHETIC HOLDINGS LLC")')
        assert 'Published assessment name' in page.locator('#details').inner_text()
        page.locator('#ownerDossier textarea').fill('Synthetic organization research note')
        page.locator('#ownerDossier textarea').blur()
        evidence=page.locator('#ownerDossier form').first
        evidence.locator('input[type=url]').fill('https://example.org/registry/synthetic')
        evidence.locator('input[type=date]').fill('2026-10-26')
        evidence.locator('button').click()
        assert 'Evidence checklist: 2/4' in page.locator('#ownerDossier').inner_text()
        page.click('#loadBusinessOwners')
        page.wait_for_function('!document.getElementById("loadBusinessOwners").disabled')
        with page.expect_download() as owners_download:
            page.click('#exportOwnershipResearch')
        owners=json.loads(Path(owners_download.value.path()).read_text())
        assert len(owners['observations'])==1
        assert list(owners['dossiers'].values())[0]['notes']=='Synthetic organization research note'
        page.locator('#researchTools details').nth(0).evaluate('e=>e.open=true')
        page.click('#addResearchAssembly')
        with page.expect_download() as assembly_download:
            page.click('#exportAssemblyGeoJSON')
        assembly=json.loads(Path(assembly_download.value.path()).read_text())
        assert assembly['features'][0]['properties']['parcel_id']=='PBC-0'
        assert assembly['features'][0]['geometry']['type']=='Polygon'
        page.locator('#researchTools details').nth(1).evaluate('e=>e.open=true')
        page.select_option('[aria-label="flood screening status"]','source-observation')
        page.fill('[aria-label="flood source URL"]','https://example.org/flood/synthetic')
        page.fill('[aria-label="flood observation date"]','2026-10-26')
        page.fill('[aria-label="flood observation"]','Check flood evidence at source')
        page.locator('#manualScreening form').nth(1).locator('button').click()
        assert 'Screening observation saved' in page.locator('#researchToolsStatus').inner_text()
        page.locator('#researchTools details').nth(2).evaluate('e=>e.open=true')
        page.locator('#localCompsImport').set_input_files({'name':'synthetic-comps.csv','mimeType':'text/csv','buffer':b'comp_id,address,transaction_type,sale_price,building_sqft,latitude,longitude\nS1,Synthetic comp,closed sale,2000000,10000,26.72,-80.13\nA1,Synthetic asking,asking,2000000,10000,26.72,-80.13'})
        page.wait_for_function('document.getElementById("localCompResults").textContent.includes("$200.00/building SF")')
        assert 'Closed-sale $/building SF unavailable' in page.locator('#localCompResults').inner_text()
        page.locator('#localCompsImport').set_input_files({'name':'bad.csv','mimeType':'text/csv','buffer':b'comp_id,address,transaction_type\n1,A,sale\n1,B,sale'})
        page.wait_for_function('document.getElementById("researchToolsStatus").textContent.includes("previous records preserved")')
        assert '$200.00/building SF' in page.locator('#localCompResults').inner_text()
        map_box=page.locator('#map').bounding_box()
        assert map_box['width']>600 and map_box['height']>=500, map_box
        page.click('#expandMap')
        assert page.locator('#expandMap').get_attribute('aria-expanded')=='true'
        page.keyboard.press('Escape')
        assert page.locator('#expandMap').get_attribute('aria-expanded')=='false'
        page.locator('#filterDrawer').evaluate('e=>e.open=false')
        page.evaluate('window.scrollTo(0,0)')
        page.screenshot(path='/tmp/capital-radar-map-workbench.png')
        page.locator('#filterDrawer').evaluate('e=>e.open=true')
        page.click('#saveParcel')
        page.fill('#savedResearch textarea', 'Verify wetland delineation')
        page.locator('#savedResearch textarea').blur()
        page.click('#saveSearch')
        page.click('#screenParcel')
        page.wait_for_function('document.getElementById("screenResults").textContent.includes("mapped-intersection")')
        assert '100.0% mapped overlap' in page.locator('#screenResults').inner_text()
        with page.expect_download() as download:
            page.click('#exportResearch')
        exported = json.loads(Path(download.value.path()).read_text())
        assert exported['parcels'][0]['note'] == 'Verify wetland delineation'
        assert exported['parcels'][0]['sourceURL'].startswith('https://services1.arcgis.com/')
        assert len(exported['parcels'][0]['screenings']) == 2
        assert exported['searches'][0]['search']['acreage']['op'] == '<'
        assert 'owner' not in exported['parcels'][0]
        mode['fail'] = True
        page.click('#scanButton')
        page.wait_for_function('window.PublicRadarBridge.getMeta().status==="failed"')
        assert page.evaluate('window.PublicRadarBridge.getResults().length') == 0
        assert page.locator('#details').is_hidden()
        assert page.locator('#results .parcel').count() == 0
        page.reload()
        page.locator('#filterDrawer').evaluate('e=>e.open=true')
        assert 'Verify wetland delineation' == page.locator('#savedResearch textarea').input_value()
        assert page.locator('#savedResearch').get_by_text('Load filters',exact=True).count() == 1
        page.locator('#savedResearch').get_by_text('Load filters',exact=True).click()
        assert page.locator('#acreageComparison').input_value() == '<'
        assert not page.evaluate('window.PublicRadarBridge.getMeta().ready')
        mode['fail'] = False
        page.select_option('#market','njcentral')
        page.select_option('#typeSelect','industrial')
        page.select_option('#acreageComparison','>=')
        page.fill('#minAcres','0')
        page.click('#scanButton')
        page.wait_for_function('window.PublicRadarBridge.getMeta().complete')
        assert page.evaluate('window.PublicRadarBridge.getResults()[0].yearBuilt')==1974
        assert page.evaluate('window.PublicRadarBridge.getResults()[1].yearBuilt') is None
        mode['njPaging']=True
        page.click('#scanButton')
        page.wait_for_function('window.PublicRadarBridge.getMeta().complete')
        assert page.evaluate('window.PublicRadarBridge.getResults().length')==350
        assert page.locator('#results .parcel').count()==300
        page.locator('#results').get_by_text('Show more parcels',exact=False).click()
        assert page.locator('#results .parcel').count()==350
        assert 'map reference point' in page.locator('#statusText').inner_text()
        mode['repeatPage']=True
        page.click('#scanButton')
        page.wait_for_function('window.PublicRadarBridge.getMeta().status==="partial" && !document.getElementById("scanButton").textContent.includes("Cancel")')
        assert not page.evaluate('window.PublicRadarBridge.getMeta().complete')
        assert 'repeated or omitted' in page.locator('#statusText').inner_text()
        mode['repeatPage']=False
        mode['countDrift']=True
        page.click('#scanButton')
        page.wait_for_function('window.PublicRadarBridge.getMeta().status==="partial" && !document.getElementById("scanButton").textContent.includes("Cancel")')
        assert 'did not reconcile' in page.locator('#statusText').inner_text()
        mode['countDrift']=False
        mode['njPaging']=False
        mode['njCap']=True
        page.click('#scanButton')
        page.wait_for_function('window.PublicRadarBridge.getMeta().status==="partial" && !document.getElementById("scanButton").textContent.includes("Cancel")')
        assert 'safety cap' in page.locator('#statusText').inner_text()
        mode['njCap']=False
        page.select_option('#stateSelect','FL')
        assert 'services1.arcgis.com' in page.evaluate('window.PublicRadarBridge.getSources().FL')
        mode['partial'] = True
        page.click('#scanButton')
        page.wait_for_function('window.PublicRadarBridge.getMeta().status==="partial" && !document.getElementById("scanButton").textContent.includes("Cancel")')
        assert not page.evaluate('window.PublicRadarBridge.getMeta().ready')
        page.fill('#askInput','How many parcels?')
        page.locator('#askForm button').click()
        assert 'partial' in page.locator('#answers').inner_text()
        mode['partial'] = False
        mode['collision'] = True
        page.select_option('#countySelect','')
        assert page.evaluate('window.PublicRadarCounty') == ''
        page.click('#scanButton')
        page.wait_for_function('window.PublicRadarBridge.getMeta().complete')
        keys = page.evaluate('window.PublicRadarBridge.getResults().map(r=>r.key)')
        assert len(keys) == 2 and len(set(keys)) == 2, keys
        mode['collision'] = False
        page.select_option('#countySelect','Broward')
        page.fill('#minAcres','5')
        page.click('#scanButton')
        assert 'does not publish acreage' in page.locator('#statusText').inner_text()
        assert 'PARCEL_POLY_BCPA_TAXROLL' in page.evaluate('window.PublicRadarBridge.getSource("FL",26.12,-80.14).url')
        broward=page.evaluate('''() => window.PublicRadarBridge.ingestOne({type:'Feature',properties:{FOLIO_NUMBER:'BRO-TEST',USE_CODE:'4800'},geometry:{type:'Point',coordinates:[-80.14,26.12]}},'FL',{lat:26.12,lon:-80.14})''')
        assert broward['key'].startswith('broward:FL:12011:') and broward['acres'] is None
        page.select_option('#countySelect','MiamiDade')
        miami=page.evaluate('''() => window.PublicRadarBridge.ingestOne({type:'Feature',properties:{FOLIO:'MDC-TEST',DOR_CODE_CUR:'4800',LOT_SIZE:130680},geometry:{type:'Point',coordinates:[-80.19,25.77]}},'FL',{lat:25.77,lon:-80.19})''')
        assert miami['key'].startswith('miamidade:FL:12086:') and miami['acres']==3
        page.select_option('#countySelect','PalmBeach')
        page.fill('#minAcres','0')
        page.evaluate('''() => {
          const original=window.fetch;window.__hold=true;
          window.fetch=async(...args)=>{
            const response=await original(...args);
            if(window.__hold&&String(args[0]).includes('/query?')){
              window.__hold=false;await new Promise(resolve=>window.__release=resolve);
            }return response;
          };
        }''')
        page.click('#scanButton')
        page.wait_for_function('typeof window.__release === "function"')
        page.select_option('#market','njcentral')
        page.click('#scanButton')
        page.wait_for_function('window.PublicRadarBridge.getMeta().complete')
        page.evaluate('window.__release()')
        page.wait_for_timeout(100)
        assert page.evaluate('window.PublicRadarBridge.getResults().every(r=>r.state==="NJ")')
        assert page.evaluate('window.PublicRadarBridge.getMeta().complete')
        missing = context.new_page()
        missing.route('**/*', network)
        missing.route('**/assets/vendor/leaflet/leaflet.js',lambda route: route.abort())
        missing.goto(f'http://127.0.0.1:{server.server_port}/')
        assert missing.locator('#scanButton').is_disabled()
        assert 'Map library unavailable' in missing.locator('#statusText').inner_text()
        missing.close()
        assert not exceptions, exceptions
        mode['chat']=True
        natural=context.new_page()
        natural.route('**/*',network)
        natural_errors=[]
        natural.on('pageerror',lambda error: natural_errors.append(str(error)))
        natural.goto(f'http://127.0.0.1:{server.server_port}/')
        before=len(queries)
        natural.fill('#agentPrompt','find me the nearest parcels with 5 acres and for industrial')
        natural.locator('#agentForm button[type=submit]').click()
        assert 'Which city or address' in natural.locator('#agentLog .bot').last.inner_text()
        assert len(queries)==before,'A missing location must not trigger a guessed search'
        natural.fill('#agentPrompt','Edison NJ')
        natural.locator('#agentForm button[type=submit]').click()
        natural.wait_for_function('window.PublicRadarBridge.getMeta().complete')
        assert natural.evaluate('window.PublicRadarBridge.getResults().map(r=>r.acres)')==[5,6,6.4,7,10]
        assert any(host=='services2.arcgis.com' and 'CALC_ACRE >= 5' in where for host,where in queries[before:])
        assert 'at least 5 acres' in natural.locator('#agentLog').inner_text()
        natural.fill('#agentPrompt','find me a 6 acre parcel which is up for renewal and has the owner name')
        natural.locator('#agentForm button[type=submit]').click()
        natural.wait_for_function('window.PublicRadarBridge.getMeta().complete && window.PublicRadarBridge.getSearch().acreage.op==="="')
        assert natural.evaluate('window.PublicRadarBridge.getResults().map(r=>r.acres)')==[6]
        assert natural.evaluate('window.PublicRadarBridge.getMeta().unverified')==['lease renewal dates','verified owner names']
        assert 'Candidates only' in natural.locator('#resultInfo').inner_text()
        assert any('CALC_ACRE = 6' in where for host,where in queries)
        natural.fill('#agentPrompt','find me a NJ property up for sale that has approx $200 per sq foot')
        natural.locator('#agentForm button[type=submit]').click()
        natural.wait_for_function('window.PublicRadarBridge.getMeta().complete && window.PublicRadarBridge.getMeta().unverified.includes("current sale availability")')
        assert natural.evaluate('window.PublicRadarBridge.getResults().length')==7
        assert 'asking sale price per building square foot' in natural.locator('#agentLog').inner_text()
        assert 'current sale availability' in natural.locator('#resultInfo').inner_text()
        assert 'remain unverified' in natural.locator('#agentLog .bot').last.inner_text()
        natural.fill('#agentPrompt','Find warehouses about 6 acres near Edison NJ')
        natural.locator('#agentForm button[type=submit]').click()
        natural.wait_for_function('window.PublicRadarBridge.getMeta().complete && window.PublicRadarBridge.getSearch().acreage.op==="between"')
        assert natural.evaluate('window.PublicRadarBridge.getResults().map(r=>r.acres)')==[6,6.4]
        natural.locator('#filterDrawer').evaluate('e=>e.open=true')
        assert natural.locator('#maxAcresField').is_visible()
        assert natural.locator('#maxAcres').input_value()=='6.6'
        assert any('CALC_ACRE >= 5.4 AND CALC_ACRE <= 6.6' in where for host,where in queries)
        natural.fill('#agentPrompt','actually exactly 7 acres')
        natural.locator('#agentForm button[type=submit]').click()
        natural.wait_for_function('window.PublicRadarBridge.getMeta().complete && window.PublicRadarBridge.getSearch().acreage.value===7')
        assert natural.evaluate('window.PublicRadarBridge.getResults().map(r=>r.acres)')==[7]
        assert natural.locator('#typeSelect').input_value()=='industrial'
        natural.close()
        mode['chat']=False
        assert not natural_errors,natural_errors
        mode['cards']=True
        field=context.new_page()
        field.route('**/*',network)
        field_errors=[]
        field.on('pageerror',lambda error: field_errors.append(str(error)))
        field.goto(f'http://127.0.0.1:{server.server_port}/')
        field.fill('#agentPrompt','Find industrial over 5 acres near Edison NJ')
        field.locator('#agentForm button[type=submit]').click()
        field.wait_for_function('window.PublicRadarBridge.getMeta().complete && document.querySelectorAll(".chat-property-card").length===6')
        assert 'Built 1974' in field.locator('.chat-property-card').first.inner_text()
        assert 'Year built not published in source' in field.locator('.chat-property-card').nth(1).inner_text()
        assert 'Parcels touching the search circle qualify' in field.locator('.chat-properties').inner_text()
        assert field.locator('.chat-properties').get_by_text('49 properties',exact=False).count()>=1
        field.locator('.chat-properties').get_by_text('Show more properties',exact=False).click()
        assert field.locator('.chat-property-card').count()==12
        card=field.locator('.chat-property-card').first
        assert card.get_by_text('Google Maps / images',exact=True).get_attribute('href').startswith('https://www.google.com/maps/search/')
        assert 'basemap=satellite' in card.get_by_text('Google satellite',exact=True).get_attribute('href')
        assert card.locator('details').get_attribute('open') is None
        card.get_by_text('View parcel on satellite',exact=True).click()
        assert field.locator('#basemap').input_value()=='satellite'
        assert field.evaluate('window.PublicRadarBridge.getMap().getZoom()')>=16
        card.locator('[data-action=add-trip]').click()
        field.locator('#researchTools details').nth(1).evaluate('e=>e.open=true')
        field.select_option('[aria-label="access screening status"]','source-observation')
        field.fill('[aria-label="access source URL"]','https://example.org/synthetic-access-evidence')
        field.fill('[aria-label="access observation date"]','2026-10-26')
        field.fill('[aria-label="access observation"]','Manual access source recorded; legal access unverified')
        field.locator('#manualScreening form').nth(3).locator('button').click()
        field.locator('.chat-property-card').nth(1).locator('[data-action=add-trip]').click()
        assert field.locator('.field-trip-stop').count()==2
        field.locator('.field-trip-stop').nth(1).get_by_text('Move up',exact=True).click()
        trip=field.locator('.field-trip-stop').first
        trip.locator('textarea').fill('Check legal access <script>window.PACKET_INJECTION=true</script>')
        trip.locator('textarea').blur()
        trip.locator('input[placeholder="Next action"]').fill('Confirm source geometry and access')
        trip.locator('input[placeholder="Next action"]').blur()
        trip.locator('input[type=file]').set_input_files({'name':'field-photo.png','mimeType':'image/png','buffer':PNG})
        field.wait_for_function('document.querySelectorAll(".field-photo-grid img").length===1')
        field.locator('.radar-agent').screenshot(path='/tmp/capital-radar-property-cards.png')
        mode['fail']=True
        field.fill('#agentPrompt','Find industrial over 5 acres near Edison NJ')
        field.locator('#agentForm button[type=submit]').click()
        field.wait_for_function('window.PublicRadarBridge.getMeta().status==="failed"')
        assert '503' in field.locator('#agentLog .bot').last.inner_text()
        assert 'warning above' not in field.locator('#agentLog .bot').last.inner_text()
        mode['fail']=False
        field.locator('#agentLog').get_by_text('Retry this search',exact=True).last.click()
        field.wait_for_function('window.PublicRadarBridge.getMeta().complete')
        assert field.locator('.chat-properties:not(.previous-search)').count()==1
        phone_context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
        phone=phone_context.new_page()
        phone.route('**/*',network)
        phone.goto(f'http://127.0.0.1:{server.server_port}/',wait_until='domcontentloaded')
        phone.wait_for_function('!!window.PublicRadarBridge?.getMap()')
        assert phone.locator('#agentPrompt').bounding_box()['y']<400
        assert phone.locator('#agentPrompt').bounding_box()['y']<phone.locator('#map').bounding_box()['y']
        phone.locator('#mobileNav summary').click()
        assert phone.locator('#mobileNav nav').is_visible()
        phone.locator('#mobileNav').get_by_text('Field trips & packs',exact=True).click()
        assert not phone.locator('#mobileNav nav').is_visible()
        phone.fill('#agentPrompt','Find industrial over 5 acres near Edison NJ')
        phone.locator('#agentForm button[type=submit]').click()
        phone.wait_for_function('document.querySelectorAll(".chat-property-card").length===6')
        assert phone.evaluate('document.documentElement.scrollWidth <= window.innerWidth+2')
        small=phone.evaluate('''[...document.querySelectorAll('button')].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&e.getBoundingClientRect().height<43.5).map(e=>({text:e.textContent,height:e.getBoundingClientRect().height}))''')
        assert not small,small
        phone.locator('.radar-agent').screenshot(path='/tmp/capital-radar-chat-mobile.png')
        phone_context.close()
        field.reload()
        field.wait_for_function('document.querySelectorAll(".field-trip-stop").length===2 && document.querySelectorAll(".field-photo-grid img").length===1')
        assert field.locator('.field-trip-stop').first.get_attribute('data-parcel-key').endswith('NJ-1')
        assert 'Check legal access' in field.locator('.field-trip-stop textarea').first.input_value()
        with field.expect_download() as backup_download:
            field.click('#exportFieldTrip')
        backup=json.loads(Path(backup_download.value.path()).read_text())
        assert len(backup['stops'])==2
        assert backup['stops'][0]['photos'][0]['dataURL'].startswith('data:image/jpeg;base64,')
        assert 'owner' not in backup['stops'][0]['property']
        with field.expect_download() as pack_download:
            field.click('#generateFieldPack')
        packet_path=Path(pack_download.value.path())
        packet=packet_path.read_text()
        assert 'Satellite imagery: Esri' in packet and 'User photo added' in packet
        assert '<script>' not in packet and '&lt;script&gt;' in packet
        assert 'Confirm source geometry and access' in packet
        assert 'https://example.org/synthetic-access-evidence' in packet
        assert 'legal access unverified' in packet
        packet_page=context.new_page()
        packet_page.set_content(packet)
        assert packet_page.locator('section.stop').count()==2
        assert packet_page.locator('script').count()==0
        assert not packet_page.evaluate('!!window.PACKET_INJECTION')
        packet_page.pdf(path='/tmp/capital-radar-field-pack.pdf',format='Letter',print_background=True)
        assert Path('/tmp/capital-radar-field-pack.pdf').read_bytes().startswith(b'%PDF')
        packet_page.screenshot(path='/tmp/capital-radar-field-pack.png',full_page=True)
        packet_page.close()
        mode['imageryFail']=True
        with field.expect_download() as missing_download:
            field.click('#generateFieldPack')
        assert 'SATELLITE IMAGERY UNAVAILABLE' in Path(missing_download.value.path()).read_text()
        mode['imageryFail']=False
        fresh=browser.new_context(accept_downloads=True)
        restored=fresh.new_page()
        restored.route('**/*',network)
        restored.goto(f'http://127.0.0.1:{server.server_port}/')
        restored.locator('#importFieldTrip').set_input_files({'name':'trip.json','mimeType':'application/json','buffer':json.dumps(backup).encode()})
        restored.wait_for_function('document.querySelectorAll(".field-trip-stop").length===2 && document.querySelectorAll(".field-photo-grid img").length===1')
        assert 'Check legal access' in restored.locator('.field-trip-stop textarea').first.input_value()
        restored.locator('#importFieldTrip').set_input_files({'name':'trip.json','mimeType':'application/json','buffer':json.dumps(backup).encode()})
        restored.wait_for_function('document.getElementById("fieldPackStatus").textContent.includes("0 stops imported")')
        assert restored.locator('.field-trip-stop').count()==2
        fresh.close()
        assert not field_errors,field_errors
        field.close()
        mode['cards']=False
        pa=context.new_page()
        pa_errors=[]
        pa.on('pageerror',lambda error:pa_errors.append(str(error)))
        pa.route('**/*',network)
        pa.goto(f'http://127.0.0.1:{server.server_port}/')
        trip_before=pa.evaluate('localStorage.getItem("capital-radar-field-trip-v1")')
        pa.fill('#agentPrompt','Find industrial over 5 acres near Allentown PA')
        pa.locator('#agentPrompt').press('Enter')
        pa.wait_for_function('window.PublicRadarBridge.getMeta().complete')
        assert pa.locator('#stateSelect').input_value()=='PA'
        assert pa.locator('#market').input_value()=='lehigh'
        assert pa.locator('#countySelect').input_value()=='Lehigh'
        assert pa.evaluate('window.PublicRadarBridge.getResults()[0].key').startswith('lehigh:PA:42077:')
        assert 'Built 1984' in pa.locator('.chat-property-card').first.inner_text()
        pa.fill('#agentPrompt','Find industrial over 5 acres near Easton PA')
        pa.locator('#agentPrompt').press('Enter')
        pa.wait_for_function('window.PublicRadarBridge.getMeta().complete && window.PublicRadarBridge.getResults()[0]?.provider==="northampton"')
        assert pa.locator('#market').input_value()=='northampton'
        pa.fill('#agentPrompt','Find industrial near Erie PA')
        pa.locator('#agentPrompt').press('Enter')
        pa.wait_for_function('document.getElementById("agentLog").textContent.includes("Pennsylvania county Erie is not connected")')
        assert pa.evaluate('window.PublicRadarBridge.getResults().length')==0
        assert 'Previous search' in pa.locator('.chat-properties').first.inner_text()
        pa.fill('#agentPrompt','Find industrial near Albany NY')
        pa.locator('#agentPrompt').press('Enter')
        pa.wait_for_function('document.getElementById("agentLog").textContent.includes("Address located in NY")')
        assert "Couldn't verify the requested location" not in pa.locator('#agentLog').inner_text()
        mode['paFail']=True
        pa.fill('#agentPrompt','Find industrial over 5 acres near Allentown PA')
        pa.locator('#agentPrompt').press('Enter')
        pa.wait_for_function('window.PublicRadarBridge.getMeta().status==="failed"')
        assert 'Pennsylvania coverage could not be verified' in pa.locator('#agentLog').inner_text()
        mode['paFail']=False
        mode['paNoClass']=True
        pa.fill('#agentPrompt','Find industrial over 5 acres near Allentown PA')
        pa.locator('#agentPrompt').press('Enter')
        pa.wait_for_function('document.getElementById("statusText").textContent.includes("verified descriptive assessment classification")')
        assert not pa.evaluate('window.PublicRadarBridge.getMeta().complete')
        mode['paNoClass']=False
        pa.fill('#agentPrompt','Find industrial over 5 acres in West Palm Beach FL')
        pa.locator('#agentPrompt').press('Enter')
        pa.wait_for_function('window.PublicRadarBridge.getMeta().complete')
        assert pa.locator('#market').input_value()=='palm'
        assert pa.locator('#stateSelect').input_value()=='FL'
        assert pa.locator('#countySelect').input_value()=='PalmBeach'
        assert pa.evaluate('localStorage.getItem("capital-radar-field-trip-v1")')==trip_before
        assert not pa_errors,pa_errors
        pa.close()
        mode['cards']=False
        password = secrets.token_hex(24)
        fixture = '''
          import {ResearchStore} from './server/research-store.mjs';
          import {createWorkspace} from './server/workspace.mjs';
          import {createHostedAssistant} from './server/hosted-assistant.mjs';
          const store=new ResearchStore(':memory:');
          store.importFeed({version:1,provider:'regrid',license:{reference:'Synthetic browser fixture only',localStorage:true,search:true},records:[{
            state:'NJ',countyFips:'34023',parcelId:'TEST-PRIVATE',address:'Synthetic private parcel',type:'Industrial',acres:3,ownerName:'Example LLC',
            sourceURL:'https://example.com/fixture',observedAt:'2026-01-01T00:00:00Z',geometry:{type:'Point',coordinates:[-74.36,40.52]},
            sales:[{amount:100,date:'2025-01-01',sourceURL:'https://example.com/deed',observedAt:'2026-01-01T00:00:00Z'}]
          }]});
          let aiCalls=0;
          const assistant=createHostedAssistant({apiKey:'synthetic-browser-key',model:'synthetic-browser-model',fetcher:async()=>{
            aiCalls++;if(aiCalls>1)throw Error('NVIDIA synthetic-browser-key upstream error');
            return {ok:true,json:async()=>({choices:[{message:{content:'Parcel NJ-0 reports 3 acres. Verify the assessment source before making decisions.'}}]})};
          }});
          const server=createWorkspace({store,password:process.env.RADAR_WORKSPACE_PASSWORD,assistant});
          server.listen(0,'127.0.0.1',()=>console.log(server.address().port));
        '''
        private_server = subprocess.Popen(['node','--input-type=module','-e',fixture],cwd=ROOT,env={**os.environ,'RADAR_WORKSPACE_PASSWORD':password},stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        try:
            port = int(private_server.stdout.readline().strip())
            private_context = browser.new_context(http_credentials={'username':'radar','password':password})
            private = private_context.new_page()
            private_errors = []
            private.on('pageerror',lambda error: private_errors.append(str(error)))
            private.route('**/*',lambda route: route.continue_() if urlparse(route.request.url).hostname=='127.0.0.1' else route.abort())
            private.goto(f'http://127.0.0.1:{port}/workspace.html')
            private.wait_for_function('document.getElementById("providerStatus").textContent.includes("1 imported parcels")')
            private.fill('#privateState','NJ')
            private.fill('#privateMax','4')
            private.locator('#privateSearch button').click()
            private.wait_for_function('document.getElementById("privateStatus").textContent.includes("1 imported records match")')
            assert 'Example LLC' in private.locator('#privateResults').inner_text()
            private.locator('#privateResults input[type=checkbox]').check()
            private.fill('#privateListName','Fixture watchlist')
            private.fill('#privateNote','Check source deed')
            private.locator('#savePrivateList button').click()
            private.wait_for_function('document.getElementById("privateLists").textContent.includes("Fixture watchlist")')
            private.reload()
            private.wait_for_function('document.getElementById("privateLists").textContent.includes("Check source deed")')
            private.locator('#privateLists').get_by_text('Run saved filters',exact=True).click()
            private.wait_for_function('document.getElementById("privateResults").textContent.includes("Synthetic private parcel")')
            assert private.locator('#privateResults input[type=checkbox]').is_checked()
            private.screenshot(path='/tmp/capital-radar-private.png',full_page=True)
            assert not private_errors, private_errors
            hosted=private_context.new_page()
            hosted.route('**/*',network)
            sent=[]
            hosted.on('request',lambda request: sent.append(request.post_data_json) if request.url.endswith('/api/radar-agent') and request.method=='POST' else None)
            hosted.goto(f'http://127.0.0.1:{port}/')
            hosted.wait_for_function('window.PublicRadarAssistant.isAvailable()')
            hosted.locator('#filterDrawer').evaluate('e=>e.open=true')
            hosted.fill('#minAcres','0')
            hosted.click('#scanButton')
            hosted.wait_for_function('window.PublicRadarBridge.getMeta().complete')
            hosted.click('#explainResults')
            hosted.wait_for_function('document.getElementById("agentLog").textContent.includes("Radar summary")')
            assert len(sent)==1
            assert sent[0]['totalCount']==3
            assert all('owner' not in row and 'note' not in row and 'original' not in row for row in sent[0]['records'])
            assert not re.search(r'nvidia|nemotron|webgpu|download.*model|synthetic-browser-key',hosted.locator('body').inner_text(),re.I)
            hosted.screenshot(path='/tmp/capital-radar-hosted.png',full_page=True)
            hosted.click('#explainResults')
            hosted.wait_for_function('document.getElementById("assistantStatus").textContent.includes("could not be prepared")')
            assert hosted.evaluate('window.PublicRadarBridge.getMeta().complete')
            assert not re.search(r'nvidia|nemotron|synthetic-browser-key',hosted.locator('body').inner_text(),re.I)
            assert not any(re.search(r'huggingface|onnx|transformers|model\.onnx',url,re.I) for url in external_requests)
            private_context.close()
        finally:
            private_server.terminate()
            private_server.communicate(timeout=10)
        browser.close()
    print('Browser smoke passed: search, screening, persistence/export, scan failures, private research, hosted summaries and neutral failure UI; no local model downloads.')
finally:
    server.shutdown()
    server.server_close()
