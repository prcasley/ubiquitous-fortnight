"""Real entry form, tracked converter and executive industrial brief, using synthetic GIS."""
from browser_fixture import *
checks=[]
def check(name,value):
 if not value:print('BRIEF_DIAGNOSTIC',page.locator('#executiveScanSummary').text_content()[:6000],page.evaluate('Object.values(RadarAcquisition.getResults()||{}).map(l=>l.rows.map(r=>({key:r.key,environmental:r.environmentalPriority,signals:Object.values(r.signals).map(s=>({kind:s.kind,status:s.status,reason:s.reason}))})))'),flush=True)
 assert value,name;checks.append(name)
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=chromium_executable(p),headless=True,args=['--no-sandbox']);context=browser.new_context();page=context.new_page();page.route('**/*',network);errors=[];page.on('pageerror',lambda e:errors.append(str(e)));mode['ceo']=True
  page.goto(f'http://127.0.0.1:{server.server_port}/')
  check('fresh entry screen hides the application and navigation',page.locator('#accessGate').is_visible() and not page.locator('.shell').is_visible() and not page.locator('.mobile-shortcuts').is_visible())
  page.fill('#accessPassword','wrong');page.click('#accessForm button');check('wrong password keeps screen locked','not recognized' in page.locator('#accessError').inner_text() and not page.locator('.shell').is_visible())
  unlock(page);check('requested password reveals the app',page.locator('.shell').is_visible())
  check('fresh NJ source starts executive area in Edison without location access',page.input_value('#executiveMarket')=='edison' and page.input_value('#stateSelect')=='NJ' and 'Starting area: Edison NJ' in page.locator('#executiveScanStatus').inner_text())
  page.select_option('#executiveMarket','palmarea');page.reload();unlock(page)
  check('saved Florida choice restores actual area, source and county',page.input_value('#executiveMarket')=='palmarea' and page.input_value('#stateSelect')=='FL' and page.input_value('#countySelect')=='PalmBeach' and page.evaluate('Math.abs(PublicRadarBridge.getSearchCenter().lon+80.0956)<.001') and page.input_value('#executiveRadius')=='8')
  page.select_option('#executiveMarket','edison');page.reload();unlock(page)
  check('explicit NJ choice stays selected after reload',page.input_value('#executiveMarket')=='edison' and page.input_value('#stateSelect')=='NJ')
  page.evaluate('localStorage.setItem("capital-radar-executive-market-v1","__proto__")');page.reload();unlock(page)
  check('invalid saved area falls back to NJ safely',page.input_value('#executiveMarket')=='edison')
  page.evaluate('window.gisBudgets=[]; const originalGIS=RadarGISTransport.request; RadarGISTransport.request=(url,options)=>{gisBudgets.push({url,timeout:options.timeoutMs});return originalGIS(url,options)}; true')
  check('building converter is actually served and executable',page.evaluate('typeof osmtogeojson==="function"') and page.request.get(f'http://127.0.0.1:{server.server_port}/assets/osmtogeojson.js').status==200)
  page.select_option('#executiveMarket','secaucus');page.fill('#executiveAcres','5');page.select_option('#executiveRadius','2');mode['secaucus']=True;page.click('#executiveScanForm [type=submit]');page.wait_for_function('!document.querySelector("#executiveScanForm [type=submit]").disabled')
  check('executive scan applies selected market, industrial type, size and radius',page.evaluate('PublicRadarBridge.getSearch().state==="NJ" && PublicRadarBridge.getSearch().type==="industrial" && PublicRadarBridge.getSearch().acreage.value===5 && PublicRadarBridge.getSearch().radius===2'))
  check('two brief profiles explain reasons and diligence gaps',page.locator('#executiveScanSummary > .acquisition-grid > section > h3').count()==2 and 'Why it fits the industrial brief' in page.locator('#executiveScanSummary').text_content() and 'sale availability' in page.locator('#executiveScanSummary').text_content())
  mode['secaucus']=False;mode['persona']=True
  for market,state in [('palm','FL'),('palmarea','FL'),('delray','FL'),('northbergen','NJ'),('edison','NJ')]:
   page.select_option('#executiveMarket',market);page.click('#executiveScanForm [type=submit]');page.wait_for_function('!document.querySelector("#executiveScanForm [type=submit]").disabled')
   check('top preset scans the actual industrial market '+market,page.evaluate('PublicRadarBridge.getSearch().state')==state and page.evaluate('PublicRadarBridge.getSearch().type==="industrial" && PublicRadarBridge.getResults().length>0'))
   if market=='palmarea':check('WPB-area preset preserves the airport center and 8-mile radius',page.evaluate('PublicRadarBridge.getSearch().radius===8 && Math.abs(PublicRadarBridge.getSearch().center.lon+80.0956)<.001'))
   if market=='palm':
    check('West Palm Beach brief explains neighboring municipalities','Riviera Beach' in page.locator('#executiveScanSummary').text_content() and 'not restricted to city limits' in page.locator('#executiveScanSummary').text_content())
    mode['screeningClear']=True;page.click('#executiveCheck');page.wait_for_function('document.getElementById("acquisitionStatus").textContent.includes("Public checks finished")')
    check('finished checks refresh the brief with measured building facts','reference checks completed without a mapped constraint' in page.locator('#executiveScanSummary').text_content() and 'sq ft' in page.locator('#executiveScanSummary').text_content() and 'Site checks not run yet' not in page.locator('#executiveScanSummary').text_content())
    mode['screeningClear']=False;mode['screeningFail']=True;page.click('#executiveCheck');page.wait_for_function('document.getElementById("acquisitionStatus").textContent.includes("Public checks finished")')
    check('failed checks update brief without claiming a clean site','Site checks attempted; some environmental results remain unavailable' in page.locator('#executiveScanSummary').text_content() and 'checks completed without a mapped constraint' not in page.locator('#executiveScanSummary').text_content())
    mode['screeningFail']=False

  mode['flVacantIndustrial']=True;page.select_option('#executiveMarket','delray');page.click('#executiveScanForm [type=submit]');page.wait_for_function('!document.querySelector("#executiveScanForm [type=submit]").disabled')
  check('vacant industrial FL land remains in industrial searches',page.evaluate('PublicRadarBridge.getResults().length>0 && PublicRadarBridge.getResults().every(r=>r.type==="Vacant"&&/industrial/i.test(r.use))'))
  check('DOR 040 is identified explicitly as vacant industrial',page.evaluate("""()=>{const r=PublicRadarBridge.getResults()[0],f=structuredClone(r.geometry);f.properties={PARCEL_ID:"SYN-FDOR-040",CO_NO:60,DOR_UC:"040",LND_SQFOOT:7*43560};const n=PublicRadarBridge.normalizeRecord(f,"FL",{lat:r.lat,lon:r.lon},PublicRadarBridge.getSource("FL",27,-80.4));return n.type==="Vacant"&&/industrial/i.test(n.use);}"""))
  mode['flVacantIndustrial']=False;page.select_option('#executiveMarket','edison');page.click('#executiveScanForm [type=submit]');page.wait_for_function('!document.querySelector("#executiveScanForm [type=submit]").disabled')
  check('Palm Beach scan requests allow 35 seconds; NJGIN counts allow 30 seconds; other requests retain 12 seconds',page.evaluate('gisBudgets.some(r=>r.url.includes("Parcels_and_Property_Details")&&r.timeout===35000)&&gisBudgets.filter(r=>!r.url.includes("Parcels_and_Property_Details")).every(r=>r.timeout===12000||(r.url.includes("Parcels_Composite_NJ")&&r.url.includes("returnCountOnly=true")&&r.timeout===30000))&&gisBudgets.some(r=>r.url.includes("Parcels_Composite_NJ")&&r.url.includes("returnCountOnly=true")&&r.timeout===30000)'))
  mode['pbcCondoMixed']=True;page.select_option('#executiveMarket','palmarea');page.click('#executiveScanForm [type=submit]');page.wait_for_function('!document.querySelector("#executiveScanForm [type=submit]").disabled')
  check('executive whole-site option uses county non-condo flags, excluding units and unknown flags',page.evaluate('PublicRadarBridge.getSearch().wholeSitesOnly&&PublicRadarBridge.getResults().length===2') and 'Individual condo units' in page.locator('#executiveScanSummary').text_content())
  page.uncheck('#executiveWholeSites');page.click('#executiveScanForm [type=submit]');page.wait_for_function('!document.querySelector("#executiveScanForm [type=submit]").disabled')
  check('condo exclusion is reversible',page.evaluate('!PublicRadarBridge.getSearch().wholeSitesOnly&&PublicRadarBridge.getResults().length===5'))
  mode['pbcCondoMixed']=False;page.check('#executiveWholeSites');page.select_option('#executiveMarket','edison');page.click('#executiveScanForm [type=submit]');page.wait_for_function('!document.querySelector("#executiveScanForm [type=submit]").disabled')
  page.evaluate('const r={...PublicRadarBridge.getResults()[0],acres:17.308}; RadarChatProperties.render([r],PublicRadarBridge.getMeta())')
  check('Ask Radar acreage rounds to two decimals','17.31 acres' in page.locator('.chat-properties').last.text_content() and '17.308' not in page.locator('.chat-properties').last.text_content())
  check('NJ nominal sales are excluded by the actual parcel normalizer',page.evaluate("""()=>{const r=PublicRadarBridge.getResults()[0],f=structuredClone(r.geometry);f.properties.SALE_PRICE=1;f.properties.DEED_DATE='210818';const n=PublicRadarBridge.normalizeRecord(f,'NJ',{lat:r.lat,lon:r.lon},r.source);return n.recordedSalePrice===null&&n.saleSuppressed;}"""))
  for raw,expected in [('210818','Aug 18, 2021'),('030806','Aug 6, 2003')]:
   page.evaluate("""raw=>{const r=PublicRadarBridge.getResults()[0],f=structuredClone(r.geometry);f.properties.SALE_PRICE=1000000;f.properties.DEED_DATE=raw;PublicRadarBridge.ingestOne(f,'NJ',{lat:r.lat,lon:r.lon},r.source);}""",raw)
   check('NJ recorded date renders as a calendar date '+raw,expected in page.locator('#dealNavSelected').text_content())
  mode['njOwnerName']='SYNTHETIC NJ INDUSTRIAL LLC';page.locator('#executiveScanSummary').get_by_role('button',name='Review parcel & owner records',exact=True).first.click();page.locator('#details .public-owner-section button').click();page.wait_for_function('document.querySelector("#details").textContent.includes("SYNTHETIC NJ INDUSTRIAL LLC")')
  check('NJ official source name is displayed with provenance', 'Published assessment name' in page.locator('#details').text_content() and 'Retrieved' in page.locator('#details').text_content())
  for width in [390,1280]:
   page.set_viewport_size({'width':width,'height':844});check('brief has no horizontal overflow '+str(width),page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
  page.click('#lockRadar');check('lock returns to black entry screen without deleting research',not page.locator('.shell').is_visible() and page.locator('#accessGate').is_visible());unlock(page)
  page.reload();check('same-session refresh remembers entry',page.locator('.shell').is_visible())
  fresh=browser.new_context();blocked=fresh.new_page();blocked.add_init_script("Object.defineProperty(window,'sessionStorage',{get(){throw new Error('blocked')}})");blocked.route('**/*',network);blocked.goto(f'http://127.0.0.1:{server.server_port}/');unlock(blocked);check('entry works even when session storage is blocked',blocked.locator('.shell').is_visible())
  check('no uncaught application errors',not errors);browser.close()
 print('Executive entry browser suite passed:',len(checks),'entry, deployment-asset and industrial-brief checks.')
finally:server.shutdown();server.server_close()
