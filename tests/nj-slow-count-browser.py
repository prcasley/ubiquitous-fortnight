"""A slow NJGIN parcel count (beyond the old 12 s cutoff) completes on the first attempt instead of failing."""
from browser_fixture import *
import time
checks=[];counts=[];messages=[]
def check(name,value):assert value,name;checks.append(name)
def routes(r):
 u=urlparse(r.request.url);q=parse_qs(u.query)
 if u.hostname=='services2.arcgis.com' and 'Parcels_Composite' in u.path and q.get('returnCountOnly')==['true']:
  counts.append(time.monotonic())
  if len(counts)==1:time.sleep(14)  # longer than the previous 12 s per-attempt timeout
 network(r)
try:
 mode['persona']=True
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=chromium_executable(p),headless=True,args=['--no-sandbox']);page=browser.new_page();page.route('**/*',routes);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:{server.server_port}/');unlock(page)
  page.evaluate('()=>{window.__statusLog=[];new MutationObserver(()=>window.__statusLog.push(document.getElementById("statusText").textContent)).observe(document.getElementById("statusText"),{childList:true,characterData:true,subtree:true});return true}')
  page.fill('#agentPrompt','industrial at least 5 acres in Edison NJ');page.press('#agentPrompt','Enter')
  deadline=time.monotonic()+60
  while time.monotonic()<deadline:
   messages.append(page.evaluate('document.getElementById("statusText").textContent'))
   if not page.evaluate('document.querySelector("#agentForm [type=submit]").disabled') and page.evaluate('PublicRadarBridge.getMeta().complete'):break
   page.wait_for_timeout(250)
  check('slow count completes on its first attempt',len(counts)==1)
  check('search completes with results instead of a timeout',page.evaluate('PublicRadarBridge.getMeta().complete') and page.evaluate('PublicRadarBridge.getResults().length>0'))
  check('executive sees a plain still-waiting message during the slow count',any('slow to count matching parcels' in m for m in messages+page.evaluate('window.__statusLog')))
  page.evaluate("""()=>{const original=RadarGISTransport.request;window.timeoutAttempts=0;window.injectedTimeout=false;RadarGISTransport.request=(url,options)=>{if(url.includes('services2.arcgis.com')&&url.includes('returnCountOnly'))return original(url,{...options,timeoutMs:400,backoffMs:0,fetcher:(u,o)=>{window.timeoutAttempts++;if(!window.injectedTimeout){window.injectedTimeout=true;return new Promise((resolve,reject)=>o.signal.addEventListener('abort',()=>reject(new DOMException('Injected timeout','AbortError')),{once:true}));}return fetch(u,o);}});return original(url,options);};return true}""")
  page.fill('#agentPrompt','industrial at least 5 acres in Secaucus NJ');page.press('#agentPrompt','Enter');page.wait_for_function('!document.querySelector("#agentForm [type=submit]").disabled')
  check('one actual transport timeout is retried once without manual resubmission',page.evaluate('window.injectedTimeout&&window.timeoutAttempts===2&&PublicRadarBridge.getMeta().complete&&PublicRadarBridge.getResults().length>0'))
  check('no uncaught browser errors',not errors);browser.close()
 print('NJ slow-count suite passed:',len(checks),'checks.')
finally:server.shutdown();server.server_close()
