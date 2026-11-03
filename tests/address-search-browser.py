"""Street-address acquisition searches keep their center and a separate subject polygon."""
from browser_fixture import *
checks=[]
def check(label,condition):assert condition,label;checks.append(label)
def geocodes():return [parse_qs(urlparse(u).query)['SingleLine'][0] for u in external_requests if 'findAddressCandidates' in u]
try:
 mode['persona']=True;mode['addressSearch']=True
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=chromium_executable(p),headless=True,args=['--no-sandbox'])
  cases=[('near','FL',False),('around','FL',True),('within 2 miles of','FL',False),('at','FL',False),('near','NJ',True)]
  for prep,state,excluded in cases:
   mode['subjectExcluded']=excluded;mode['addressLowScore']=False;external_requests.clear()
   ctx=browser.new_context();page=ctx.new_page();page.route('**/*',network);page.goto(f'http://127.0.0.1:{server.server_port}/');unlock(page)
   addr='7777 Southern Blvd, West Palm Beach FL' if state=='FL' else '1 Harmon Plaza Secaucus NJ'
   page.fill('#agentPrompt','Industrial over 5 acres '+prep+' '+addr);page.press('#agentPrompt','Enter');page.wait_for_function('!document.querySelector("#agentForm [type=submit]").disabled')
   info=page.evaluate('({center:PublicRadarBridge.getSearchCenter(),search:PublicRadarBridge.getSearch(),subject:PublicRadarBridge.getSubject(),rows:PublicRadarBridge.getResults(),meta:PublicRadarBridge.getMeta()})')
   check(prep+state+' geocodes full address only',geocodes()==[addr])
   check(prep+state+' search centers on address',abs(info['center']['lon']-(-80.175 if state=='FL' else -74.070))<.000001)
   check(prep+state+' preserves filters and source',info['search']['state']==state and info['search']['type']=='industrial' and info['search']['acreage']['value']==5 and info['search']['acreage']['op']=='>' and info['search']['radius']==(2 if prep.startswith('within') else 5))
   check(prep+state+' announces address confidence','around '+addr+' (address match score 100)' in page.locator('#agentLog').inner_text())
   expected='Subject parcel (does not match your filters)' if excluded else 'Subject parcel'
   check(prep+state+' subject label reflects filters',info['subject']['subjectLabel']==expected and expected in page.locator('.leaflet-tooltip').inner_text())
   check(prep+state+' subject is separate from accepted counts',all(r['key']!=info['subject']['key'] for r in info['rows']) and info['meta']['count']==len(info['rows']))
   # Selecting another parcel must retain the subject marker and lookup identity.
   if info['rows']:page.evaluate('()=>{const s=PublicRadarBridge.getSubject();PublicRadarBridge.choose(PublicRadarBridge.getResults()[0].key);return !!PublicRadarBridge.getRecord(s.key)}')
   check(prep+state+' subject persists after another selection',expected in page.locator('.leaflet-tooltip').inner_text())
   if prep=='near' and state=='FL':
    page.fill('#agentPrompt','only over 8 acres');page.press('#agentPrompt','Enter');page.wait_for_function('!document.querySelector("#agentForm [type=submit]").disabled')
    check('acreage follow-up preserves address center and marks excluded subject',page.evaluate('PublicRadarBridge.getSearchCenter().lon===-80.175&&PublicRadarBridge.getSubject().subjectLabel.includes("does not match")') and geocodes()==[addr])
    page.fill('#agentPrompt','go back');page.press('#agentPrompt','Enter');page.wait_for_function('!document.querySelector("#agentForm [type=submit]").disabled')
    check('history restores the address confidence, criteria and subject',page.evaluate('PublicRadarBridge.getSearch().acreage.value===5&&PublicRadarBridge.getSearchCenter().lon===-80.175&&PublicRadarBridge.getSubject().subjectLabel==="Subject parcel"') and geocodes()==[addr])
    page.fill('#agentPrompt','industrial over 5 acres in West Palm Beach FL');page.press('#agentPrompt','Enter');page.wait_for_function('!document.querySelector("#agentForm [type=submit]").disabled')
    check('new city search clears the prior address subject',page.evaluate('PublicRadarBridge.getSubject()===null&&PublicRadarBridge.getSearchCenter().lon===-80.13'))
   ctx.close()
  mode['addressLowScore']=True;external_requests.clear();ctx=browser.new_context();page=ctx.new_page();page.route('**/*',network);page.goto(f'http://127.0.0.1:{server.server_port}/');unlock(page)
  page.fill('#agentPrompt','Industrial over 5 acres near 7777 Southern Blvd, West Palm Beach FL');page.press('#agentPrompt','Enter');page.wait_for_function('!document.querySelector("#agentForm [type=submit]").disabled')
  check('low confidence tries address then explicit city fallback',geocodes()==['7777 Southern Blvd, West Palm Beach FL','West Palm Beach, FL'])
  check('fallback is stated and no subject parcel is inferred','Falling back to West Palm Beach, FL' in page.locator('#agentLog').inner_text() and page.evaluate('PublicRadarBridge.getSubject()===null'))
  check('fallback centers on city',page.evaluate('PublicRadarBridge.getSearchCenter().lon===-80.13'));ctx.close()
  mode['addressLowScore']=False
  for overrides,fallback in [({'addressType':'Locality'},True),({'addressState':'NJ'},True),({'addressCounty':'Unknown County'},False)]:
   mode.update(overrides);external_requests.clear();ctx=browser.new_context();page=ctx.new_page();page.route('**/*',network);page.goto(f'http://127.0.0.1:{server.server_port}/');unlock(page)
   page.fill('#agentPrompt','industrial over 5 acres near 7777 Southern Blvd, West Palm Beach FL');page.press('#agentPrompt','Enter');page.wait_for_function('!document.querySelector("#agentForm [type=submit]").disabled')
   check('address candidate guard: '+str(overrides),page.evaluate('PublicRadarBridge.getSubject()===null') and (page.evaluate('PublicRadarBridge.getLastGeocode().fallback&&PublicRadarBridge.getSearchCenter().lon===-80.13') if fallback else page.evaluate('!PublicRadarBridge.getMeta().complete')))
   ctx.close()
   for key in overrides:mode.pop(key)
  for text,expected in [('industrial over 5 acres in West Palm Beach FL',['West Palm Beach FL']),('industrial over 5 acres in Palm Beach County',['Palm Beach County, FL'])]:
   external_requests.clear();ctx=browser.new_context();page=ctx.new_page();page.route('**/*',network);page.goto(f'http://127.0.0.1:{server.server_port}/');unlock(page)
   page.fill('#agentPrompt',text);page.press('#agentPrompt','Enter');page.wait_for_function('!document.querySelector("#agentForm [type=submit]").disabled')
   check('city/county query retains its geocoding behavior: '+text,geocodes()==expected)
   check('city/county query has no subject',page.evaluate('PublicRadarBridge.getSubject()===null&&PublicRadarBridge.getMeta().complete'));ctx.close()
  browser.close()
 print('Address search browser suite passed:',len(checks),'checks.')
finally:server.shutdown();server.server_close()
