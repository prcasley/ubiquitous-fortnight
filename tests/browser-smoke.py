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

mode = {'fail': False, 'partial': False, 'collision': False}
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
    if parsed.hostname == 'geocode.arcgis.com':
        respond(route, {'candidates': [{'score': 100, 'address': 'Palm Beach County, FL', 'location': {'x': -80.13, 'y': 26.72}, 'attributes': {'RegionAbbr': 'FL', 'Subregion': 'Palm Beach County'}}]})
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
        if mode['fail']:
            respond(route, {'error': {'message': 'Synthetic outage'}}, 503)
            return
        if mode['partial'] and int(params.get('resultOffset', ['0'])[0]) > 0:
            respond(route, {'error': {'message': 'Synthetic second-page outage'}}, 503)
            return
        nj = parsed.hostname == 'services2.arcgis.com'
        fdor = parsed.hostname == 'services9.arcgis.com'
        features = []
        acres_values = [3,4,5] if not mode['partial'] else [3]*150
        if mode['collision']:
            acres_values = [3,3]
        for i, acres in enumerate(acres_values):
            match = re.search(r'(?:ACRES|CALC_ACRE) (>=|<=|>|<) ([\d.]+)', where)
            if match:
                op, value = match.group(1), float(match.group(2))
                if not {'>=': acres >= value, '>': acres > value, '<': acres < value, '<=': acres <= value}[op]:
                    continue
            props = {'PAMS_PIN': 'NJ-'+str(i), 'PROP_LOC': 'Synthetic NJ parcel', 'MUN_NAME': 'Edison', 'PROP_CLASS': '4B', 'CALC_ACRE': acres, 'COUNTY': 'Middlesex'} if nj else {'PARID': 'PBC-'+str(i), 'SITE_ADDR_STR': 'Synthetic FL parcel', 'MUNICIPALITY': 'Palm Beach', 'ACRES': acres, 'PROPERTY_USE': 'VACANT INDUSTRIAL' if '%VACANT%' in where else 'DISTRIBUTION', 'YRBLT': 1990}
            geometry = polygon(-74.363,40.527) if nj else polygon(-80.13,26.72)
            if fdor:
                props = {'PARCEL_ID': 'SAME-ID', 'CO_NO': 53 if i==0 else 66, 'LND_SQFOOT': acres*43560, 'DOR_UC': '048'}
                geometry = {'type':'Point','coordinates':[-80.13,26.72]}
            features.append({'type':'Feature','properties':props,'geometry':geometry})
        if params.get('returnCountOnly') == ['true']:
            respond(route, {'count': len(features)})
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
