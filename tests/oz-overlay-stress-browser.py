"""Run the reusable release-overlay stress checks against synthetic source geometry."""
from browser_fixture import *
import importlib.util
spec=importlib.util.spec_from_file_location('nj_stress',ROOT/'scripts/live-nj-oz-stress.py');stress=importlib.util.module_from_spec(spec);spec.loader.exec_module(stress)
try:
 mode['nominationStress']=True
 with sync_playwright() as pw:
  # The fixture uses real Leaflet, but its initial map graph is much smaller
  # than a live map's graph. Exercise Playwright's actual serialization limit
  # deterministically rather than mocking evaluate or copying map internals.
  browser=pw.chromium.launch(executable_path=chromium_executable(pw),headless=True,args=['--no-sandbox']);page=browser.new_page();page.route('**/*',network);page.goto(f'http://127.0.0.1:{server.server_port}/');unlock(page)
  page.evaluate('()=>{let root={},p=root;for(let i=0;i<512;i++){p.next={};p=p.next}PublicRadarBridge.getMap().__serializationRegression=root;return true}')
  try:
   page.evaluate('([a,b,z])=>PublicRadarBridge.getMap().setView([a,b],z,{animate:false})',[40.15,-74.6,8])
  except Exception as error:
   assert 'Cannot serialize result' in str(error),str(error)
  else:raise AssertionError('Negative control did not reproduce map serialization failure')
  assert stress.set_view(page,40.15,-74.6,9) is True,'set_view must return a serializable primitive'
  assert page.evaluate('PublicRadarBridge.getMap().getZoom()')==9
  page.evaluate('delete PublicRadarBridge.getMap().__serializationRegression');browser.close()
  print('Map serialization regression: old call failed; current helper moved the same map and returned true.')
  report=stress.run_stress(pw,f'http://127.0.0.1:{server.server_port}/',network,True)
 assert report['passed']==report['total'],report
 print('NJ overlay stress browser suite passed:',report['total'],'synthetic checks; no live boundary verification claimed.')
finally:server.shutdown();server.server_close()
