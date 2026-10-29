"""Local overlay safety and persistence while zooming; no KML metadata enters search."""
from browser_fixture import *
checks=[]
def check(name,value):assert value,name;checks.append(name)
KML='''<kml xmlns="http://www.opengis.net/kml/2.2"><Document><NetworkLink><Link><href>https://example.invalid/private-feed</href></Link></NetworkLink><Placemark><name>&lt;img src=x onerror=alert(1)&gt;</name><description>&lt;script&gt;alert(1)&lt;/script&gt;</description><MultiGeometry><Point><coordinates>-74.36,40.52,0</coordinates></Point><LineString><coordinates>-74.36,40.52 -74.35,40.53</coordinates></LineString><Polygon><outerBoundaryIs><LinearRing><coordinates>-74.36,40.52 -74.35,40.52 -74.35,40.53 -74.36,40.52</coordinates></LinearRing></outerBoundaryIs></Polygon></MultiGeometry></Placemark></Document></kml>'''
try:
 with sync_playwright() as p:
  b=p.chromium.launch(executable_path=shutil.which('chromium') or p.chromium.executable_path,headless=True,args=['--no-sandbox']);page=b.new_page();page.route('**/*',network);page.goto(f'http://127.0.0.1:{server.server_port}/');unlock(page);page.wait_for_function('!!window.RadarKML');errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  before=page.evaluate('({search:PublicRadarBridge.getSearch(),center:PublicRadarBridge.getSearchCenter()})')
  page.set_input_files('#kmlFile',{'name':'Research overlay.kml','mimeType':'application/vnd.google-earth.kml+xml','buffer':KML.encode()})
  page.wait_for_function('RadarKML.count()===1')
  check('multiple KML geometries load locally','3 shapes' in page.locator('#kmlOverlays').inner_text())
  check('KML does not fetch NetworkLink or remote content',not any('example.invalid' in u for u in external_requests))
  page.get_by_role('button',name='Show on map',exact=True).click()
  check('map fit does not change search location or records',page.evaluate('({search:PublicRadarBridge.getSearch(),center:PublicRadarBridge.getSearchCenter()})')==before)
  page.uncheck('[aria-label="Show Research overlay.kml"]');check('overlay can be hidden without deleting the file',page.evaluate('RadarKML.count()')==1)
  page.get_by_role('button',name='Show on map',exact=True).click();page.get_by_role('button',name='Remove overlay',exact=True).click();check('overlay removal is reversible by re-opening the original file',page.evaluate('RadarKML.count()')==0)
  for text in ['<!DOCTYPE kml [<!ENTITY x SYSTEM "https://example.invalid/secret">]><kml/>','<kml><Placemark><Point><coordinates>,20</coordinates></Point></Placemark></kml>','<kml><Placemark><Point><coordinates>181,20</coordinates></Point></Placemark></kml>']:
   page.set_input_files('#kmlFile',{'name':'invalid.kml','mimeType':'application/xml','buffer':text.encode()});page.wait_for_timeout(50);check('invalid or entity-bearing overlay rejected',page.evaluate('RadarKML.count()')==0)
  page.evaluate('PublicRadarBridge.getMap().setZoom(13,{animate:false})');page.check('#oz2Toggle');page.wait_for_function('PublicRadarGeo.getOverlayState("oz2").count>0')
  for zoom in [9,6,3]:
   page.evaluate('(z)=>PublicRadarBridge.getMap().setZoom(z,{animate:false})',zoom);page.wait_for_function('document.getElementById("oz2LegendStatus").textContent.includes("overview")');check('OZ geometry and toggle remain on at zoom '+str(zoom),page.evaluate('PublicRadarGeo.getOverlayState("oz2").count>0') and page.is_checked('#oz2Toggle'))
  page.evaluate('PublicRadarBridge.getMap().setZoom(13,{animate:false})');page.wait_for_function('document.getElementById("oz2LegendStatus").textContent.includes("displayed")');mode['ozFail']=True;page.evaluate('PublicRadarGeo.loadOpportunityZone("oz2")');check('source error retains old valid geometry with an explanation',page.evaluate('PublicRadarGeo.getOverlayState("oz2").count>0') and 'previous' in page.locator('#oz2LegendStatus').inner_text());mode['ozFail']=False
  page.set_viewport_size({'width':390,'height':844});check('overlay tools fit phone width',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
  check('no uncaught errors',not errors);b.close()
 print('KML/OZ browser suite passed:',len(checks),'local-safety and zoom-persistence checks.')
finally:server.shutdown();server.server_close()
