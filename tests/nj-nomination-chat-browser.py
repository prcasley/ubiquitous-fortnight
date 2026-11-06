"""Newark: eligible is not nominated; official evidence reaches every executive surface."""
from browser_fixture import *
checks=[]
def check(name,value):assert value,name;checks.append(name)
def submit(page,q):
 page.fill('#agentPrompt',q);page.press('#agentPrompt','Enter');page.wait_for_function('!document.querySelector("#agentForm button[type=submit]").disabled')
try:
 with sync_playwright() as p:
  mode['persona']=True;mode['ceo']=True;mode['njNomCase']=True
  browser=p.chromium.launch(executable_path=chromium_executable(p),headless=True,args=['--no-sandbox']);page=browser.new_page();page.route('**/*',network);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:{server.server_port}/');unlock(page)
  submit(page,'Industrial over 2 acres in Newark NJ')
  page.wait_for_function('PublicRadarBridge.getResults().length===5 && PublicRadarBridge.getResults().every(r=>r.ozObservations?.ozNJ && !["checking","unavailable"].includes(r.ozObservations.ozNJ.status))')
  check('official check runs without an OZ chat question',not any('services6.arcgis.com' in url for url in external_requests))
  check('one nominated parcel and four nonmatches remain distinct',page.evaluate('PublicRadarBridge.getResults().filter(r=>r.ozObservations.ozNJ.nominationVerified).length===1'))
  initial=page.locator('.chat-properties').last
  check('automatic chat cards name official tract and town','NJ-nominated OZ 2.0 tract 34013001000 (Newark city)' in initial.text_content() and 'No matching NJ-nominated' in initial.text_content())
  eligible=page.evaluate('async()=>{const r=await RadarOZResearch.check(PublicRadarBridge.getResults(),{kind:"oz2"});return r.observations.filter(o=>o.tracts.includes("34013006800")).length}')
  check('eligible non-nomination fixture actually intersects all five parcels',eligible==5)
  page.evaluate('RadarAcquisition.build()')
  check('acquisition shortlist shows nomination separately from eligibility','NJ-nominated OZ 2.0 tract 34013001000' in page.locator('#acquisitionResults').text_content() and 'No matching NJ-nominated' in page.locator('#acquisitionResults').text_content())
  key=page.evaluate('PublicRadarBridge.getResults().find(r=>r.ozObservations.ozNJ.nominationVerified).key')
  page.evaluate('(key)=>{PublicRadarBridge.choose(key);RadarFieldPack.add(PublicRadarBridge.getRecord(key))}',key)
  check('Deal Nav shows dated nomination evidence before chat','34013001000' in page.locator('#dealNavSelected').text_content() and 'State nomination, not Treasury certification' in page.locator('#dealNavSelected').text_content())
  with page.expect_download() as download:page.click('#generateFieldPack')
  html=Path(download.value.path()).read_text()
  check('field pack carries official nomination without any OZ question','NJ-nominated OZ 2.0 tract 34013001000 (Newark city)' in html and 'not Treasury certification' in html and '34013006800' not in html)
  for phrase in ['Which of these are in an opportunity zone?','OZ 2','OZ2','Show nominated parcels']:
   scan=page.evaluate('PublicRadarBridge.getMeta().scanId');submit(page,phrase)
   log=page.locator('#agentLog').inner_text()
   check('official nomination route: '+phrase,'1 of 5 checked parcels meet the 95% mapped-area screening rule against the 130 tracts New Jersey nominated' in log and 'Newark city · tract 34013001000' in log and page.evaluate('PublicRadarBridge.getMeta().scanId')==scan)
   check('eligibility-only tract never called nominated: '+phrase,'NJ-nominated OZ 2.0 tract 34013006800' not in log and 'Third-party OZ 2 eligibility reference' not in page.locator('.chat-properties').last.text_content())
  submit(page,'Summarize this for the board');check('board summary names nomination stage, not generic OZ2','NJ nominations (not federal certification): 1/5' in page.locator('.board-summary').last.inner_text())
  page.select_option('#executiveMarket','newark');page.fill('#executiveAcres','2');page.click('#executiveScanForm [type=submit]');page.wait_for_function('!document.querySelector("#executiveScanForm [type=submit]").disabled && PublicRadarBridge.getResults().some(r=>r.ozObservations?.ozNJ?.nominationVerified)')
  check('executive industrial brief refreshes nomination labels','NJ-nominated OZ 2.0 tract 34013001000' in page.locator('#executiveScanSummary').text_content())
  mode['ozFail']=True;submit(page,'Which of these are nominated?')
  check('official outage is unavailable, never zero nominations','No properties were labeled qualified or ineligible' in page.locator('#agentLog').inner_text() and 'Official NJ nomination check unavailable' in page.locator('#executiveScanSummary').text_content())
  mode['ozFail']=False;mode['njNomCase']=False
  submit(page,'industrial over 2 acres in West Palm Beach FL');submit(page,'opportunity zone')
  check('FL keeps eligibility with explicit missing official nomination list','No official state nomination list connected for FL' in page.locator('.chat-properties').last.text_content())
  submit(page,'industrial over 2 acres in Northampton County PA');submit(page,'OZ2')
  check('PA keeps eligibility with explicit missing nomination list','No official state nomination list connected for PA' in page.locator('.chat-properties').last.text_content())
  page.set_viewport_size({'width':390,'height':844});check('official labels fit phone width',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
  check('no uncaught browser errors',not errors);browser.close()
 print('NJ nomination chat suite passed:',len(checks),'official-stage and cross-surface checks.')
finally:server.shutdown();server.server_close()
