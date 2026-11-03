"""Local overlay safety and persistence while zooming; no KML metadata enters search."""
from browser_fixture import *
checks=[]
def check(name,value):assert value,name;checks.append(name)
KML='''<kml xmlns="http://www.opengis.net/kml/2.2"><Document><NetworkLink><Link><href>https://example.invalid/private-feed</href></Link></NetworkLink><Placemark><name>&lt;img src=x onerror=alert(1)&gt;</name><description>&lt;script&gt;alert(1)&lt;/script&gt;</description><MultiGeometry><Point><coordinates>-74.36,40.52,0</coordinates></Point><LineString><coordinates>-74.36,40.52 -74.35,40.53</coordinates></LineString><Polygon><outerBoundaryIs><LinearRing><coordinates>-74.36,40.52 -74.35,40.52 -74.35,40.53 -74.36,40.52</coordinates></LinearRing></outerBoundaryIs></Polygon></MultiGeometry></Placemark></Document></kml>'''
try:
 with sync_playwright() as p:
  b=p.chromium.launch(executable_path=chromium_executable(p),headless=True,args=['--no-sandbox']);page=b.new_page();page.route('**/*',network);page.goto(f'http://127.0.0.1:{server.server_port}/');unlock(page);page.wait_for_function('!!window.RadarKML');errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
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
  mode['njNomination']=True;mode['executive']=True
  page.set_viewport_size({'width':1280,'height':900})
  page.fill('#agentPrompt','Find industrial over 5 acres near West Palm Beach FL');page.press('#agentPrompt','Enter')
  page.wait_for_function('!document.querySelector("#agentForm button[type=submit]").disabled && PublicRadarBridge.getSearch()?.state==="FL"')
  florida=page.evaluate('({criteria:PublicRadarBridge.getSearch(),keys:PublicRadarBridge.getResults().map(r=>r.key)})')
  check('Florida scan loaded before cross-state map browsing',page.input_value('#stateSelect')=='FL' and len(florida['keys'])>0)
  page.check('#ozNJToggle');page.wait_for_function('document.getElementById("ozNJLegendStatus").textContent.includes("covers NJ only")')
  check('NJ overlay explains its geographic coverage while centered in Florida',page.is_checked('#ozNJToggle') and page.evaluate('PublicRadarGeo.getOverlayState("ozNJ").count===0'))
  page.evaluate('PublicRadarBridge.getMap().setView([40.51,-74.27],13,{animate:false})')
  page.wait_for_function('PublicRadarGeo.getOverlayState("ozNJ").count===1',timeout=5000)
  check('panning FL to Perth Amboy loads nominations without changing the Florida search',page.input_value('#stateSelect')=='FL' and page.evaluate('({criteria:PublicRadarBridge.getSearch(),keys:PublicRadarBridge.getResults().map(r=>r.key)})')==florida)
  check('NJ nomination layer is separate from eligibility',page.is_checked('#oz2Toggle') and 'federal certification not verified' in page.locator('#ozNJLegendStatus').locator('..').inner_text())
  page.evaluate('PublicRadarBridge.getMap().setZoom(7,{animate:false})');page.wait_for_function('PublicRadarGeo.getOverlayState("ozNJ").count===130')
  check('all 130 nomination reference boundaries survive zoom out',page.is_checked('#ozNJToggle'))
  page.evaluate('PublicRadarBridge.getMap().setZoom(13,{animate:false})');page.wait_for_function('PublicRadarGeo.getOverlayState("ozNJ").count===1')
  mode['njNomFail']=True;page.evaluate('PublicRadarGeo.loadOpportunityZone("ozNJ")')
  check('nomination outage preserves prior boundaries and checked control',page.evaluate('PublicRadarGeo.getOverlayState("ozNJ").count===1') and page.is_checked('#ozNJToggle') and 'previous' in page.locator('#ozNJLegendStatus').inner_text())
  mode['njNomFail']=False;mode['njNomInvalid']=True;page.evaluate('PublicRadarGeo.loadOpportunityZone("ozNJ")')
  check('non-NJ tract identity rejected without replacing valid map',page.evaluate('PublicRadarGeo.getOverlayState("ozNJ").count===1') and 'invalid' in page.locator('#mapResearchNote').inner_text())
  mode['njNomInvalid']=False
  page.set_viewport_size({'width':360,'height':800});page.evaluate('scrollTo(0,0)')
  check('three overlays fit narrow phone with accessible full nomination label',page.evaluate('document.documentElement.scrollWidth<=innerWidth') and 'nomination' in page.locator('#ozNJToggle').get_attribute('aria-label').lower())
  page.uncheck('#ozNJToggle');check('hiding nominations does not turn eligibility off',page.is_checked('#oz2Toggle') and page.evaluate('PublicRadarGeo.getOverlayState("ozNJ").count===0'))
  page.check('#ozNJToggle');page.wait_for_function('PublicRadarGeo.getOverlayState("ozNJ").count===1')
  start=mode.get('njNomRequestCount',0);mode['njNomTransientBudget']=1
  page.evaluate('PublicRadarGeo.loadOpportunityZone("ozNJ")');page.wait_for_function('document.getElementById("ozNJLegendStatus").textContent.includes("displayed")')
  check('one transient failure retries automatically without moving map',mode['njNomRequestCount']-start==3 and mode['njNomTransientBudget']==0 and page.is_checked('#ozNJToggle'))
  start=mode['njNomRequestCount'];mode['njNomTransientBudget']=100
  page.evaluate('PublicRadarGeo.loadOpportunityZone("ozNJ")');page.wait_for_function('document.getElementById("ozNJLegendStatus").textContent.includes("Unavailable")');page.wait_for_timeout(900)
  check('persistent transient outage retries exactly once and preserves boundaries',mode['njNomRequestCount']-start==2 and page.evaluate('PublicRadarGeo.getOverlayState("ozNJ").count===1'))
  mode['njNomTransientBudget']=0;mode['njNomErrorStatus']=400;mode['njNomTransientBudget']=1;start=mode['njNomRequestCount']
  page.evaluate('PublicRadarGeo.loadOpportunityZone("ozNJ")');page.wait_for_timeout(900)
  check('permanent request errors are not retried',mode['njNomRequestCount']-start==1)
  mode['njNomErrorStatus']=503;mode['njNomTransientBudget']=1;start=mode['njNomRequestCount']
  page.evaluate('PublicRadarGeo.loadOpportunityZone("ozNJ")');page.uncheck('#ozNJToggle');page.wait_for_timeout(1100)
  check('turning layer off cancels a pending retry',mode['njNomRequestCount']-start==1 and not page.is_checked('#ozNJToggle') and page.evaluate('PublicRadarGeo.getOverlayState("ozNJ").count===0'))
  mode['njNomTransientBudget']=0
  check('no uncaught errors',not errors);b.close()
 print('KML/OZ browser suite passed:',len(checks),'local-safety and zoom-persistence checks.')
finally:server.shutdown();server.server_close()
