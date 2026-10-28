"""Opt-in, read-only live NJ/FL repro check. No credentials, owner names or records are exported.
Run after build: RADAR_LIVE_SMOKE=1 python3 tests/live-ceo-smoke.py
The HTTP relay permits observation of data/query behavior, not native on-device CORS verification.
"""
from browser_fixture import *
import urllib.request
import urllib.error
import datetime

if os.environ.get('RADAR_LIVE_SMOKE')!='1':
    print('Live CEO check skipped; set RADAR_LIVE_SMOKE=1 to query public services.')
    server.shutdown();server.server_close()
    raise SystemExit(0)
allowed={'geocode.arcgis.com','services1.arcgis.com','services2.arcgis.com','services6.arcgis.com'}
report={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Local browser with live read-only GIS/geocoder HTTP relay; no native-device CORS or deployed Pages verification','queries':[],'transport':[]}
def live(route):
    u=urlparse(route.request.url)
    if u.hostname=='127.0.0.1':route.continue_();return
    if u.hostname not in allowed:route.abort();return
    try:
        with urllib.request.urlopen(urllib.request.Request(route.request.url,headers={'User-Agent':'Capital-Radar-read-only-repro-check'}),timeout=30) as r:
            body=r.read();report['transport'].append({'host':u.hostname,'status':r.status,'corsHeader':r.headers.get('Access-Control-Allow-Origin')})
            route.fulfill(status=r.status,content_type=r.headers.get('Content-Type','application/json'),headers={'access-control-allow-origin':'*'},body=body)
    except Exception as error:
        report['transport'].append({'host':u.hostname,'status':'unavailable','errorType':type(error).__name__,'httpStatus':getattr(error,'code',None)});route.abort()
try:
 with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=shutil.which('chromium') or p.chromium.executable_path,headless=True,args=['--no-sandbox'])
    phrases=[os.environ['RADAR_LIVE_PHRASE']] if os.environ.get('RADAR_LIVE_PHRASE') else ['industrial parcels over 5 acres in Edison NJ','Edison NJ industrial 5 acres','warehouses near Edison, NJ','industrial land over 10 acres in West Palm Beach, FL']
    for question in phrases:
        context=browser.new_context();page=context.new_page();page.route('**/*',live)
        page.goto(f'http://127.0.0.1:{server.server_port}/',wait_until='domcontentloaded')
        page.wait_for_function('!!window.PublicRadarBridge&&!!window.PublicRadarAgent')
        page.fill('#agentPrompt',question);page.locator('#agentPrompt').press('Enter')
        page.wait_for_function('!document.querySelector("#agentForm button[type=submit]").disabled',timeout=240000)
        result=page.evaluate('''({query:PublicRadarBridge.getSearch(),status:PublicRadarBridge.getMeta().status,count:PublicRadarBridge.getResults().length,quarantined:PublicRadarBridge.getMeta().quarantinedCount,allIndustrial:PublicRadarBridge.getResults().every(r=>r.type==='Industrial'),yearNotPublished:PublicRadarBridge.getYearUnknown().length,yearFilterVerified:PublicRadarBridge.getResults().every(r=>{const y=PublicRadarBridge.getSearch().year;return !y||(r.yearBuilt!=null&&(y.op==='<'?r.yearBuilt<y.value:r.yearBuilt>y.value));}),largestAcceptedAcres:Math.max(0,...PublicRadarBridge.getResults().map(r=>r.acres||0)),cards:document.querySelectorAll('.chat-properties:not(.previous-search) .chat-property-card').length})''')
        result['phrase']=question;report['queries'].append(result)
        print(json.dumps({'phrase':question,'status':result['status'],'count':result['count'],'quarantined':result['quarantined'],'allIndustrial':result['allIndustrial'],'largestAcceptedAcres':result['largestAcceptedAcres'],'cards':result['cards'],'yearNotPublished':result['yearNotPublished'],'yearFilterVerified':result['yearFilterVerified']}),flush=True)
        assert result['status'] in ['complete','partial'] and result['count']>0 and result['cards']>0 and result['allIndustrial'] and result['yearFilterVerified']
        if os.environ.get('RADAR_LIVE_ACQUISITION')=='1':
            shortlist=page.evaluate("""()=>{const lists=RadarAcquisition.build();return Object.fromEntries(Object.entries(lists).map(([k,v])=>[k,{candidates:v.rows.length,eligible:v.eligibleCount,status:v.status,allResearchOnly:v.rows.every(x=>x.status==='research-candidate'&&x.offer===null&&x.permit===null),allWithinRetrievedPool:v.rows.every(x=>PublicRadarBridge.getResults().some(r=>r.key===x.key))}]))}""")
            report['acquisition']=shortlist;print(json.dumps({'acquisition':shortlist}),flush=True)
            assert all(v['candidates']>0 and v['allResearchOnly'] and v['allWithinRetrievedPool'] for v in shortlist.values())
        if question.startswith('industrial parcels'):
            prior=result['query'];page.fill('#agentPrompt','Show only parcels over 20 acres');page.locator('#agentPrompt').press('Enter')
            page.wait_for_function('!document.querySelector("#agentForm button[type=submit]").disabled',timeout=240000)
            refinement=page.evaluate('''({query:PublicRadarBridge.getSearch(),count:PublicRadarBridge.getResults().length,status:PublicRadarBridge.getMeta().status,allIndustrial:PublicRadarBridge.getResults().every(r=>r.type==='Industrial'&&r.acres>20)})''')
            assert refinement['query']['type']==prior['type'] and refinement['query']['center']==prior['center'] and refinement['allIndustrial']
            report['refinement']=refinement;print(json.dumps({'refinement':'over 20 acres','count':refinement['count'],'status':refinement['status'],'industrialAndSizePreserved':refinement['allIndustrial']}),flush=True)
        if result['query']['state']=='FL' and os.environ.get('RADAR_LIVE_EXTRA')=='1':
            page.fill('#agentPrompt','Who owns the largest one?');page.locator('#agentPrompt').press('Enter')
            page.wait_for_function('!document.querySelector("#agentForm button[type=submit]").disabled',timeout=120000)
            observation=page.evaluate('''({publishedNameVisible:document.getElementById('details').textContent.includes('Published assessment name:'),companyObserved:PublicRadarBridge.getResults().some(r=>!!r.ownership?.entityName)})''')
            report['ownerCheck']=observation;print(json.dumps({'ownerCheck':observation}),flush=True)
            assert observation['publishedNameVisible'], 'Selected live owner observation unavailable'
            page.fill('#agentPrompt','Which of these qualify for OZ 2?');page.locator('#agentPrompt').press('Enter')
            page.wait_for_function('!document.querySelector("#agentForm button[type=submit]").disabled',timeout=120000)
            references=page.evaluate('''({checked:PublicRadarBridge.getResults().filter(r=>r.ozObservation?.checkedAt).length,intersections:PublicRadarBridge.getResults().filter(r=>r.ozObservation&&r.ozObservation.status!=='no-reference-intersection').length})''')
            report['ozCheck']=references;print(json.dumps({'ozCheck':references,'qualificationVerified':False}),flush=True)
            assert references['checked']==result['count'], 'Live OZ reference check did not cover retrieved candidates'
        context.close()
    browser.close()
 report['passed']=True
finally:
 Path('/tmp/capital-radar-live-ceo-check.json').write_text(json.dumps(report,indent=2))
 server.shutdown();server.server_close()
