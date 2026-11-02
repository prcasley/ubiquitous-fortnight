"""Real CSP, transient GIS recovery, clear failures and immediate parcel focus."""
from browser_fixture import *
checks=[];attempts=0
def check(name,value):assert value,name;checks.append(name)
def routes(r):
 global attempts
 u=urlparse(r.request.url);q=parse_qs(u.query)
 if u.hostname=='services2.arcgis.com' and 'Parcels_Composite' in u.path and q.get('returnCountOnly')==['true']:
  attempts+=1
  if attempts==1:r.abort();return
 network(r)
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=chromium_executable(p),headless=True,args=['--no-sandbox']);page=browser.new_page();page.route('**/*',routes);errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(f'http://127.0.0.1:{server.server_port}/');unlock(page)
  page.fill('#agentPrompt','industrial at least 5 acres in Edison NJ');page.press('#agentPrompt','Enter');page.wait_for_function('!document.querySelector("#agentForm [type=submit]").disabled')
  check('one transient GIS failure recovers without requiring another user click',attempts==2 and page.evaluate('PublicRadarBridge.getMeta().complete') and page.evaluate('PublicRadarBridge.getResults().length>0'))
  page.locator('.chat-properties:not(.previous-search) [data-action=focus-parcel]').first.click();check('parcel focus is synchronous and fits the source boundary',focused_parcel_fits(page))
  original=page.evaluate('structuredClone(PublicRadarBridge.getResults()[0].geometry)')
  for width in [390,1280]:
   page.set_viewport_size({'width':width,'height':720})
   page.evaluate('const r=PublicRadarBridge.getResults()[0];r.geometry=turf.buffer(turf.point([r.lon,r.lat]),.6,{units:"miles"});PublicRadarBridge.focusParcel(r.key,{satellite:true})')
   check('large parcel fits without an arbitrary minimum zoom at '+str(width),focused_parcel_fits(page) and page.evaluate('PublicRadarBridge.getMap().getZoom()<16'))
  page.evaluate('g=>{PublicRadarBridge.getResults()[0].geometry=g}',original)
  mode['fail']=True;page.fill('#agentPrompt','industrial at least 5 acres in Edison NJ');page.press('#agentPrompt','Enter');page.wait_for_function('!document.querySelector("#agentForm [type=submit]").disabled')
  check('failed source uses a clear short message without a zero-inventory claim','could not complete' in page.locator('#statusText').inner_text() and 'More properties may exist' in page.locator('#statusText').inner_text() and 'NOT a report' not in page.locator('#statusText').inner_text())
  check('raw source diagnosis stays collapsed and available',page.locator('#statusText details').get_attribute('open') is None);page.locator('#statusText summary').click();check('source diagnosis remains inspectable','HTTP 503' in page.locator('#statusText').inner_text())
  check('application has no uncaught errors with CSP enforced',not errors)
  page.evaluate('()=>setTimeout(()=>{try{new Function("return 1")();window.__evalBlocked=false}catch(e){window.__evalBlocked=e.name==="EvalError"}},0)');page.wait_for_function('window.__evalBlocked!==undefined')
  check('CSP prevents dynamic code evaluation in page tasks',page.evaluate('window.__evalBlocked'))
  page.evaluate('()=>{const s=document.createElement("script");s.textContent="window.__unsafeInlineRan=true";document.body.append(s)}');check('CSP blocks arbitrary inline scripts',not page.evaluate('!!window.__unsafeInlineRan'))
  page.evaluate('()=>{window.print=()=>{window.__printWorked=true};const b=document.createElement("button");b.id="printPolicyTest";b.setAttribute("onclick","window.print()");b.textContent="Print test";document.querySelector(".content").append(b)}');page.click('#printPolicyTest');check('the narrowly allowed print action remains usable',page.evaluate('!!window.__printWorked'))
  browser.close()
 print('Reliability browser suite passed:',len(checks),'retry, focus, failure-language and CSP checks.')
finally:server.shutdown();server.server_close()
