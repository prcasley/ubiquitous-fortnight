"""Opt-in read-only live address/nearby test; no owner names or property records are printed."""
from browser_fixture import *
import urllib.request,datetime
if os.environ.get('RADAR_LIVE_SMOKE')!='1':
 print('Skipped live Deal Nav check; set RADAR_LIVE_SMOKE=1');server.shutdown();server.server_close();raise SystemExit(0)
transport=[]
def live(route):
 u=urlparse(route.request.url)
 if u.hostname=='127.0.0.1':route.continue_();return
 if u.hostname not in ['geocode.arcgis.com','gis.northamptoncounty.org','gis.lehighcounty.org','services2.arcgis.com']:route.abort();return
 try:
  with urllib.request.urlopen(urllib.request.Request(route.request.url,headers={'User-Agent':'Capital-Radar-public-read-only-check'}),timeout=22) as r:
   route.fulfill(status=r.status,content_type=r.headers.get('Content-Type','application/json'),headers={'access-control-allow-origin':'*'},body=r.read());transport.append({'host':u.hostname,'status':r.status})
 except Exception as e:transport.append({'host':u.hostname,'error':type(e).__name__,'httpStatus':getattr(e,'code',None)});route.abort()
try:
 with sync_playwright() as p:
  b=p.chromium.launch(executable_path=shutil.which('chromium') or p.chromium.executable_path,headless=True,args=['--no-sandbox']);page=b.new_page();page.route('**/*',live);page.goto(f'http://127.0.0.1:{server.server_port}/');unlock(page);page.wait_for_function('!!window.RadarDealNav');page.evaluate("RadarDealNav.findAddress('40 Hilton St Easton PA')")
  result=page.evaluate("({selectedState:RadarDealNav.selected()?.state,selectedCounty:RadarDealNav.selected()?.jurisdiction,radius:PublicRadarBridge.getSearch()?.radius,scanState:PublicRadarBridge.getMeta().status,retrieved:PublicRadarBridge.getResults().length,message:document.getElementById('dealNavStatus').textContent})")
  assert result['selectedState']=='PA' and result['selectedCounty']=='Northampton' and result['radius']==5
  print(json.dumps({'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'address':'40 Hilton St, Easton PA','result':result,'transport':transport,'nativeCORSOrPagesVerified':False}),flush=True);b.close()
finally:server.shutdown();server.server_close()
