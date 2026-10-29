"""Selected-property neighborhood, pricing boundaries, and schematic zoning inputs."""
from browser_fixture import *
checks=[]
def check(name,value):assert value,name;checks.append(name)
def submit(page,q):
 page.fill('#agentPrompt',q);page.press('#agentPrompt','Enter');page.wait_for_function('!document.querySelector("#agentForm button[type=submit]").disabled')
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=shutil.which('chromium') or p.chromium.executable_path,headless=True,args=['--no-sandbox']);page=browser.new_page();page.route('**/*',network);mode['ceo']=True;mode['crossBorder']=True
  page.goto(f'http://127.0.0.1:{server.server_port}/')
  check('no selected-property actions before selection',page.locator('#dealNavNearby').is_disabled())
  submit(page,'Recommend industrial over 5 acres in Edison NJ')
  check('strict source acreage is inherited in both profile controls',page.locator('#warehouseAcquisitionMin').input_value()=='5' and page.locator('#iosAcquisitionMin').input_value()=='5' and 'over 5 acres' in page.locator('.acquisition-card').first.inner_text())
  check('all shortlist images start eagerly',page.evaluate('[...document.querySelectorAll(".acquisition-card img")].every(n=>n.loading==="eager")'))
  page.locator('.acquisition-card').first.get_by_role('button',name='Open parcel card',exact=True).click()
  check('Deal Nav follows the selected parcel',not page.locator('#dealNavNearby').is_disabled() and 'Synthetic NJ parcel' in page.locator('#dealNavSelected').inner_text())
  page.click('#checkSelectedOZ');page.wait_for_function('!document.querySelector("#checkSelectedOZ").disabled');check('third-party tract reference never becomes a certified prediction','not verified' in page.locator('#ozStatusResults').inner_text() and 'No probability' in page.locator('#ozStatusResults').inner_text())
  check('sq feet and source pricing distinction visible','sq ft' in page.locator('#dealNavSelected').inner_text() and 'not an asking price' in page.locator('#dealNavSelected').inner_text())
  check('county deed portal is a lookup, not an inferred owner',page.locator('#dealNavSelected a').count()>0 and 'portal link does not verify' in page.locator('#dealNavSelected').inner_text())
  page.click('#dealNavNextDoor');page.wait_for_function('!document.querySelector("#dealNavNearby").disabled');check('next-door query describes approximate boundary adjacency and price limits','within about 20 feet' in page.locator('#dealNavStatus').inner_text())
  page.click('#dealNavNearby');page.wait_for_function('!document.querySelector("#dealNavNearby").disabled')
  check('nearby search uses actual selection and five miles',page.evaluate('PublicRadarBridge.getSearch().radius===5&&PublicRadarBridge.getSearch().type==="all"'))
  check('nearby facts remain public records, not sale listings','not a current asking price' in page.locator('#dealNavNearbyResults').inner_text())
  page.locator('#dealNav details summary').click()
  page.fill('#dealNavZoningSource','https://example.gov/zoning');page.fill('#dealNavZoningDate','2026-10-28');page.fill('#dealNavFront','30');page.fill('#dealNavRear','20');page.fill('#dealNavSide','10');page.fill('#dealNavCoverage','40');page.fill('#dealNavFar','0.5');page.click('#dealNavEnvelopeButton')
  check('setback estimator is not a max-buildable claim','Not maximum developable acreage' in page.locator('#dealNavEnvelope').inner_text() and 'largest entered setback (30 ft)' in page.locator('#dealNavEnvelope').inner_text())
  page.fill('#dealNavFront','');page.click('#dealNavEnvelopeButton');check('missing rules cannot become a developable-area calculation','Enter all three' in page.locator('#dealNavEnvelope').inner_text())
  page.fill('#dealNavAddress','40 Hilton St Easton PA');page.click('#dealNavAddressForm button');page.wait_for_function('!!RadarDealNav.selected()&&RadarDealNav.selected().state==="PA"&&!RadarDealNav.busy()')
  check('Easton address uses Northampton and five miles',page.evaluate('PublicRadarBridge.getSearch().state==="PA"&&PublicRadarBridge.getSearch().county==="Northampton"&&PublicRadarBridge.getSearch().radius===5'))
  check('address point locks to one containing published parcel, with address discrepancy caveat','falls inside this published GIS parcel' in page.locator('#dealNavSelected').inner_text() and page.evaluate('RadarDealNav.selected().id==="N0"'))
  check('identified parcel polygon enables setback worksheet',not page.locator('#dealNavEnvelopeButton').is_disabled())
  check('nearby minimum is server-filtered and cross-border sources are merged',page.evaluate('PublicRadarBridge.getSearch().acreage.value===5 && new Set(PublicRadarBridge.getResults().map(r=>r.state)).size===2'))
  page.set_viewport_size({'width':390,'height':844});check('Deal Nav does not overflow phone width',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
  browser.close()
 print('Deal Nav browser suite passed:',len(checks),'selected-property and zoning-boundary checks.')
finally:server.shutdown();server.server_close()
