"""NJ overlay stress runner. Live by default; --fixture explicitly uses synthetic geometry.

No missing muni_points.json dependency: view points are derived from the 130
polygons actually loaded in the overview and checked against the release baseline.
Chromium phone emulation is not a physical iPhone or microphone test.
"""
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import sys
import time
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASELINE = json.loads((ROOT / 'tests/data/nj-oz-release-20261029.json').read_text())
ANNOUNCEMENT = BASELINE['announcement']
PATTERN = re.compile(r'2026_Opportunity_Zone_2_0_Nominations')
DEFAULT_URL = 'https://prcasley.github.io/ubiquitous-fortnight/'


class EnvironmentBlocked(RuntimeError):
    pass


def wait(page, predicate, timeout=35):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate(): return
        page.wait_for_timeout(100)
    raise AssertionError('Browser state did not settle within '+str(timeout)+' seconds')


def status(page):
    return page.locator('#ozNJLegendStatus').inner_text()


def features(page):
    return page.evaluate('''()=>{const out=[];PublicRadarBridge.getMap().eachLayer(l=>{if(l.feature?.properties?.Geography)out.push(l.feature)});return out}''')


def toggle(page, on):
    page.evaluate('v=>{const t=document.getElementById("ozNJToggle");if(t.checked!==v){t.checked=v;t.dispatchEvent(new Event("change",{bubbles:true}))}}',on)


def set_view(page, lat, lon, zoom):
    return page.evaluate('([a,b,z])=>{PublicRadarBridge.getMap().setView([a,b],z,{animate:false});return true}',[lat,lon,zoom])


def settle(page, timeout=35):
    page.wait_for_timeout(450)  # allow the map's 300ms viewport debounce to run
    wait(page,lambda:status(page).startswith(('On · ','Hidden')) and not any(word in status(page) for word in ('Loading','refreshing')),timeout)
    return status(page)


def run_stress(pw, url=DEFAULT_URL, network=None, synthetic=False):
    results=[]
    def record(name, ok, detail=''):
        results.append({'test':name,'ok':bool(ok),'detail':detail})
        print(('PASS ' if ok else 'FAIL ')+name+(' — '+detail if detail else ''),flush=True)
    executable=pw.chromium.executable_path if os.environ.get('RADAR_USE_MANAGED_CHROMIUM')=='1' else os.environ.get('RADAR_CHROMIUM_PATH') or shutil.which('chromium') or pw.chromium.executable_path
    browser=pw.chromium.launch(executable_path=executable,headless=True,args=['--no-sandbox'])
    def open_app(**kwargs):
        ctx=browser.new_context(**kwargs);page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        if network:page.route('**/*',network)
        try:
            response=page.goto(url,wait_until='domcontentloaded',timeout=30000)
            if response and response.status in (403,407):raise EnvironmentBlocked('Site access denied: HTTP '+str(response.status))
            if response and response.status>=400:raise AssertionError('Published site returned HTTP '+str(response.status))
        except Exception as e:
            ctx.close()
            if isinstance(e,EnvironmentBlocked):raise
            if any(code in str(e) for code in ('ERR_TUNNEL_CONNECTION_FAILED','ERR_PROXY_CONNECTION_FAILED','ERR_NO_SUPPORTED_PROXIES')):raise EnvironmentBlocked('Cannot load requested site: '+str(e)) from e
            raise
        if page.locator('#accessGate').is_visible():
            page.fill('#accessPassword','WP123');page.click('#accessForm button')
        wait(page,lambda:page.evaluate('!!window.PublicRadarGeo && !document.documentElement.hasAttribute("data-radar-locked")'))
        page.evaluate('async()=>{await document.fonts.ready}')
        return ctx,page,errors
    try:
        ctx,page,errors=open_app(viewport={'width':1440,'height':950})
        set_view(page,40.15,-74.6,8);toggle(page,True);settle(page)
        raw=features(page);expected={r['geoid'] for r in BASELINE['tracts']};ids=[str(f['properties']['Geography']) for f in raw]
        record('overview matches all 130 reviewed tract identities',set(ids)==expected and len(ids)==130,status(page))
        towns={r['municipality'] for r in BASELINE['tracts']};record('overview matches all 60 release municipality labels',{f['properties'].get('Municipality') for f in raw}==towns)
        record('overview has no duplicate tract polygons',len(ids)==len(set(ids)))
        if set(ids)!=expected:raise AssertionError('Cannot derive a complete municipality stress run from an incomplete overview')
        points=page.evaluate('''()=>{const out={};PublicRadarBridge.getMap().eachLayer(l=>{const f=l.feature;if(f?.properties?.Geography){const [lon,lat]=turf.pointOnFeature(f).geometry.coordinates;(out[f.properties.Municipality] ||= []).push([lat,lon,String(f.properties.Geography)])}});return out}''')
        missing=[]
        for town in sorted(towns):
            lat,lon,geoid=points[town][0];set_view(page,lat,lon,14);settle(page)
            if geoid not in {str(f['properties']['Geography']) for f in features(page)}:missing.append(town)
        record('every release municipality renders its own tract at zoom 14',not missing,', '.join(missing))
        lat,lon,geoid=points['Newark city'][0];set_view(page,lat,lon,15);settle(page)
        # Use the observed point on the real geometry, not a bounding-box center
        # which can be outside a concave tract. Tap the map as a visitor would.
        page.locator('#map').scroll_into_view_if_needed()
        point=page.evaluate('([lat,lon])=>{const m=PublicRadarBridge.getMap(),p=m.latLngToContainerPoint([lat,lon]),r=m.getContainer().getBoundingClientRect();return [r.left+p.x,r.top+p.y]}',[lat,lon])
        page.mouse.click(*point)
        popup=page.locator('.leaflet-popup-content').inner_text()
        record('popup names municipality/county and distinguishes certification','Newark city' in popup and 'Essex County' in popup and 'Certified by U.S. Treasury (SB0682' in popup)
        record('popup uses corrected official announcement',page.locator('.leaflet-popup-content a').get_attribute('href')==ANNOUNCEMENT)
        for _ in range(10):toggle(page,False);toggle(page,True)
        settle(page);raw=features(page);ids=[f['properties']['Geography'] for f in raw]
        record('ten rapid toggle cycles leave one clean layer set',bool(ids) and len(ids)==len(set(ids)))
        toggle(page,False);page.wait_for_timeout(250)
        record('toggle off removes all nomination shapes',not features(page) and status(page)=='Hidden')
        toggle(page,True);settle(page)
        for town in ['Atlantic City city','Paterson city','Trenton city','Camden city','Vineland city','Newton town','Long Branch city']:
            lat,lon,_=points[town][0];set_view(page,lat,lon,14);page.wait_for_timeout(100)
        settle(page);shown={f['properties']['Municipality'] for f in features(page)}
        record('rapid seven-city pan settles on the last city','Long Branch city' in shown and not shown & {'Atlantic City city','Paterson city','Trenton city','Camden city'},str(sorted(shown)))
        set_view(page,26.7,-80.1,11);settle(page);record('Florida view explains NJ-only coverage','covers NJ only' in status(page))
        lat,lon,g=points['Newark city'][0];set_view(page,lat,lon,14);settle(page);record('return to NJ restores the target tract',g in {str(f['properties']['Geography']) for f in features(page)})
        record('desktop has no uncaught JS errors',not errors,'; '.join(errors[:3]));ctx.close()

        ctx,page,errors=open_app(**pw.devices['iPhone 13'])
        set_view(page,40.15,-74.6,8);toggle(page,True);settle(page)
        record('phone emulation overview contains 130 tracts',len(features(page))==130)
        if page.locator('#workspaceLayers').count():page.get_by_role('button',name='Map layers',exact=True).click()
        rect=page.locator('#ozNJToggle').locator('..').bounding_box();record('phone nomination tap target is at least 44px tall',rect is not None and rect['height']>=44,str(rect))
        record('phone has no horizontal page scroll',page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
        lat,lon,g=points['Elizabeth city'][0];set_view(page,lat,lon,14);settle(page);record('phone street-level tract renders',g in {str(f['properties']['Geography']) for f in features(page)})
        record('phone has no uncaught JS errors',not errors,'; '.join(errors[:3]));ctx.close()

        ctx,page,errors=open_app(viewport={'width':1440,'height':950})
        page.route(PATTERN,lambda route:route.fulfill(status=503,headers={'access-control-allow-origin':'*'},body='unavailable'))
        lat,lon,_=points['Newark city'][0];set_view(page,lat,lon,14);toggle(page,True);settle(page)
        record('outage reports unavailable without an absence conclusion','Unavailable' in status(page) and 'No tract-status conclusion' in page.locator('#mapResearchNote').inner_text())
        page.unroute(PATTERN)
        def truncated(route):
            data={'count':3} if 'returnCountOnly' in route.request.url else {'type':'FeatureCollection','features':[]}
            route.fulfill(status=200,content_type='application/json',headers={'access-control-allow-origin':'*'},body=json.dumps(data))
        page.route(PATTERN,truncated);page.evaluate('PublicRadarGeo.loadOpportunityZone("ozNJ")');settle(page)
        record('truncated response is rejected, not treated as empty success','Unavailable' in status(page) and not features(page));ctx.close()

        ctx,page,errors=open_app(viewport={'width':1440,'height':950})
        def slow(route):page.wait_for_timeout(1500);route.fallback()
        page.route(PATTERN,slow);set_view(page,40.15,-74.6,8);toggle(page,True)
        loading='Loading' in status(page);settle(page,60)
        record('slow source shows loading then complete overview',loading and len(features(page))==130,status(page));ctx.close()
    finally:browser.close()
    return {'mode':'synthetic' if synthetic else 'live','url':url,'results':results,'passed':sum(r['ok'] for r in results),'total':len(results)}


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--url',default=DEFAULT_URL);parser.add_argument('--fixture',action='store_true');parser.add_argument('--output',type=Path,default=ROOT/'test-results/nj-oz-stress.json');args=parser.parse_args();fixture=None
    try:
        if args.fixture:
            sys.path.insert(0,str(ROOT/'tests'));import browser_fixture as fixture
            fixture.mode['nominationStress']=True;args.url='http://127.0.0.1:'+str(fixture.server.server_port)+'/'
        with sync_playwright() as pw:report=run_stress(pw,args.url,fixture.network if fixture else None,args.fixture)
        code=int(report['passed']!=report['total']);print(str(report['passed'])+'/'+str(report['total'])+' '+report['mode']+' stress checks passed')
    except EnvironmentBlocked as e:
        report={'mode':'synthetic' if args.fixture else 'live','url':args.url,'status':'blocked','detail':str(e)};print('Environment blocked: '+str(e),flush=True);code=2
    except Exception as e:
        report={'mode':'synthetic' if args.fixture else 'live','url':args.url,'status':'failed','detail':str(e)};print('Stress run failed: '+str(e),flush=True);code=1
    finally:
        if fixture:fixture.server.shutdown();fixture.server.server_close()
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(report,indent=2)+'\n');return code


if __name__=='__main__':raise SystemExit(main())
