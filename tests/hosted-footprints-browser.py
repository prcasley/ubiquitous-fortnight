"""Exercise real packaged geometry via HTTP; synthetic parcel, not actual title or coverage certification."""
from browser_fixture import *
checks=[]
def check(name,value):assert value,name;checks.append(name)
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=chromium_executable(p),headless=True,args=['--no-sandbox']);page=browser.new_page(viewport={'width':390,'height':844});mode['ceo']=True;mode['hostedFootprints']=True
  requests=[];errors=[]
  def route(r):requests.append(r.request.url);network(r)
  page.route('**/*',route);page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:{server.server_port}/');unlock(page)
  check('manifest is included in built Pages output',page.request.get(f'http://127.0.0.1:{server.server_port}/assets/footprints/manifest.json').status==200)
  page.evaluate('window.hostedLoads=0; window.realRoof=null; true')
  sample=page.evaluate('''async()=>{const fc=await loadLocalFootprints([-74.414,40.517,-74.410,40.521]);window.realRoof=fc.features[0];return {count:fc.features.length,source:fc.source,attribution:fc.attribution}}''')
  check('real packaged Edison tiles return actual polygons',sample['count']>0 and 'Microsoft' in sample['source'])
  check('hosted tiles are served without 404',len([u for u in requests if '/footprints/z14/' in u])>0)
  check('attribution is retained with the geometry','© Microsoft' in sample['attribution'])
  page.locator('#executiveScanControls > summary').click()
  page.select_option('#executiveMarket','edison');page.fill('#executiveAcres','5');page.click('#executiveScanForm [type=submit]');page.wait_for_function('!document.querySelector("#executiveScanForm [type=submit]").disabled')
  # Change only the synthetic fixture's geometry: enclosure of a supplied mapped roof.
  # This is not an asserted real parcel or one of the README's address spot checks.
  page.evaluate('''()=>{const r=PublicRadarBridge.getResults()[0];r.geometry=turf.buffer(realRoof,.005,{units:'kilometers'});const c=turf.pointOnFeature(r.geometry).geometry.coordinates;r.lon=c[0];r.lat=c[1];window.hostedRecord=r;RadarAcquisition.build();}''')
  before=sum('overpass' in u for u in requests)
  page.evaluate('RadarAcquisition.checkTop([hostedRecord])');page.wait_for_function('document.getElementById("acquisitionStatus").textContent.includes("Public checks finished")')
  metrics=page.evaluate('Object.values(RadarAcquisition.getResults()).flatMap(l=>l.rows).filter(x=>x.key===hostedRecord.key).map(x=>({sf:x.metrics.footprintSqft,coverage:x.metrics.coveragePercent,source:x.signals.buildings.source}))')
  check('both profile calculations consume the hosted measurement',len(metrics)==2 and all(x['sf']>0 and 0<x['coverage']<=100 and 'Microsoft' in x['source'] for x in metrics))
  check('hosted measurement avoids both public Overpass mirrors',sum('overpass' in u for u in requests)==before)
  text=page.locator('#executiveScanSummary').text_content()
  check('executive brief refreshes with measured area and attribution','sq ft' in text and 'Building footprints © Microsoft' in text and page.locator('#executiveScanSummary a[href*="opendatacommons"]').count()>0)
  check('acquisition cards include source/license and non-floor-area caveat','Not total floor area' in page.locator('#acquisitionResults').text_content() and page.locator('#acquisitionResults a[href*="opendatacommons"]').count()>0)
  check('hosted brief does not overflow a phone viewport',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
  check('no uncaught browser errors',not errors)
  browser.close()
 print('Hosted footprint browser suite passed:',len(checks),'real-tile, measurement, attribution and mobile checks.')
finally:server.shutdown();server.server_close()
