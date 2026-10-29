"""Real entry form, tracked converter and executive industrial brief, using synthetic GIS."""
from browser_fixture import *
checks=[]
def check(name,value):assert value,name;checks.append(name)
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=shutil.which('chromium') or p.chromium.executable_path,headless=True,args=['--no-sandbox']);context=browser.new_context();page=context.new_page();page.route('**/*',network);errors=[];page.on('pageerror',lambda e:errors.append(str(e)));mode['ceo']=True
  page.goto(f'http://127.0.0.1:{server.server_port}/')
  check('fresh entry screen hides the application and navigation',page.locator('#accessGate').is_visible() and not page.locator('.shell').is_visible() and not page.locator('.mobile-shortcuts').is_visible())
  page.fill('#accessPassword','wrong');page.click('#accessForm button');check('wrong password keeps screen locked','not recognized' in page.locator('#accessError').inner_text() and not page.locator('.shell').is_visible())
  unlock(page);check('requested password reveals the app',page.locator('.shell').is_visible())
  check('building converter is actually served and executable',page.evaluate('typeof osmtogeojson==="function"') and page.request.get(f'http://127.0.0.1:{server.server_port}/assets/osmtogeojson.js').status==200)
  page.select_option('#executiveMarket','secaucus');page.fill('#executiveAcres','5');page.select_option('#executiveRadius','2');mode['secaucus']=True;page.click('#executiveScanForm [type=submit]');page.wait_for_function('!document.querySelector("#executiveScanForm [type=submit]").disabled')
  check('executive scan applies selected market, industrial type, size and radius',page.evaluate('PublicRadarBridge.getSearch().state==="NJ" && PublicRadarBridge.getSearch().type==="industrial" && PublicRadarBridge.getSearch().acreage.value===5 && PublicRadarBridge.getSearch().radius===2'))
  check('two brief profiles explain reasons and diligence gaps',page.locator('#executiveScanSummary h3').count()==2 and 'Why it fits the industrial brief' in page.locator('#executiveScanSummary').inner_text() and 'sale availability' in page.locator('#executiveScanSummary').inner_text())
  mode['secaucus']=False;mode['persona']=True
  for market,state in [('palm','FL'),('northbergen','NJ'),('edison','NJ')]:
   page.select_option('#executiveMarket',market);page.click('#executiveScanForm [type=submit]');page.wait_for_function('!document.querySelector("#executiveScanForm [type=submit]").disabled')
   check('top preset scans the actual industrial market '+market,page.evaluate('PublicRadarBridge.getSearch().state')==state and page.evaluate('PublicRadarBridge.getSearch().type==="industrial" && PublicRadarBridge.getResults().length>0'))
  check('NJ nominal sales are excluded by the actual parcel normalizer',page.evaluate("""()=>{const r=PublicRadarBridge.getResults()[0],f=structuredClone(r.geometry);f.properties.SALE_PRICE=1;f.properties.DEED_DATE='210818';const n=PublicRadarBridge.normalizeRecord(f,'NJ',{lat:r.lat,lon:r.lon},r.source);return n.recordedSalePrice===null&&n.saleSuppressed;}"""))
  for raw,expected in [('210818','Aug 18, 2021'),('030806','Aug 6, 2003')]:
   page.evaluate("""raw=>{const r=PublicRadarBridge.getResults()[0],f=structuredClone(r.geometry);f.properties.SALE_PRICE=1000000;f.properties.DEED_DATE=raw;PublicRadarBridge.ingestOne(f,'NJ',{lat:r.lat,lon:r.lon},r.source);}""",raw)
   check('NJ recorded date renders as a calendar date '+raw,expected in page.locator('#dealNavSelected').inner_text())
  mode['njOwnerName']='SYNTHETIC NJ INDUSTRIAL LLC';page.locator('#executiveScanSummary button').first.click();page.locator('#details .public-owner-section button').click();page.wait_for_function('document.querySelector("#details").textContent.includes("SYNTHETIC NJ INDUSTRIAL LLC")')
  check('NJ official source name is displayed with provenance', 'Published assessment name' in page.locator('#details').inner_text() and 'Retrieved' in page.locator('#details').inner_text())
  for width in [390,1280]:
   page.set_viewport_size({'width':width,'height':844});check('brief has no horizontal overflow '+str(width),page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
  page.click('#lockRadar');check('lock returns to black entry screen without deleting research',not page.locator('.shell').is_visible() and page.locator('#accessGate').is_visible());unlock(page)
  page.reload();check('same-session refresh remembers entry',page.locator('.shell').is_visible())
  fresh=browser.new_context();blocked=fresh.new_page();blocked.add_init_script("Object.defineProperty(window,'sessionStorage',{get(){throw new Error('blocked')}})");blocked.route('**/*',network);blocked.goto(f'http://127.0.0.1:{server.server_port}/');unlock(blocked);check('entry works even when session storage is blocked',blocked.locator('.shell').is_visible())
  check('no uncaught application errors',not errors);browser.close()
 print('Executive entry browser suite passed:',len(checks),'entry, deployment-asset and industrial-brief checks.')
finally:server.shutdown();server.server_close()
