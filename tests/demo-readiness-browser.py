"""First-impression checks: where the map opens, visible search progress, the empty search box, phone header/toolbar fit,
starred labels, plain dates and cross-county radius searches. Synthetic fixtures only."""
from browser_fixture import *
checks=[]
def check(label,value):assert value,label;checks.append(label)
SIMPLE="try{sessionStorage.removeItem('radar_ui_mode')}catch(e){}"
WATCH="""window.__seen={progress:false,label:false};new MutationObserver(()=>{const b=document.querySelector('#agentForm [type=submit]');
 if(document.querySelector('#agentLog .search-progress .search-spinner'))window.__seen.progress=true;if(b&&b.textContent==='Searching…'&&b.getAttribute('aria-busy')==='true')window.__seen.label=true;})
 .observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true})"""
def idle(page):page.wait_for_function('!document.querySelector("#agentForm [type=submit]").disabled',timeout=60000)
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=chromium_executable(p),headless=True,args=['--no-sandbox'])
  base=f'http://127.0.0.1:{server.server_port}/'
  # Desktop, simple view (what a first-time visitor sees).
  page=browser.new_page(viewport={'width':1366,'height':787});page.add_init_script(SIMPLE);page.route('**/*',network);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(base);unlock(page);page.wait_for_function('!!window.RadarArchive&&document.body.classList.contains("radar-v34")');page.wait_for_timeout(900)
  check('the map opens on the market named in the menu',page.locator('#market').input_value()=='njcentral' and page.evaluate("(()=>{const m=PublicRadarBridge.getMap(),c=m.getCenter();return Math.abs(c.lat-40.527)<0.05&&Math.abs(c.lng+74.363)<0.05&&m.getZoom()===12})()"))
  check('simple view does not show an empty Parcel results panel',page.evaluate("document.querySelector('section[aria-label=\"Parcel search results\"]').getClientRects().length===0"))
  page.evaluate(WATCH);external_requests.clear();queries.clear()
  check('the search box starts empty with an example as placeholder',page.locator('#agentPrompt').input_value()=='' and 'Edison' in page.locator('#agentPrompt').get_attribute('placeholder'))
  page.locator('#agentForm [type=submit]').click();idle(page)
  log=page.locator('#agentLog').inner_text()
  check('clicking Find with an empty box runs the example and says so','The search box was empty, so I ran the example' in log and page.evaluate('PublicRadarBridge.getSearch()?.state')=='NJ')
  check('a spinner row and a Searching… button are shown while the search runs',page.evaluate('window.__seen.progress&&window.__seen.label'))
  check('the progress row is removed and the button label restored',page.locator('.search-progress').count()==0 and page.locator('#agentForm [type=submit]').inner_text().strip()=='Find with Radar')
  nj=[w for h,w in queries if 'services2.arcgis.com' in h or 'arcgis' in h]
  check('a radius search is not restricted to one county',any("PROP_CLASS = '4B'" in w for w in nj) and not any('UPPER(COUNTY)' in w for w in nj))
  check('dates on screen are plain, not ISO timestamps',re.search(r'Retrieved: [A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2} [AP]M',log) and not re.search(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}',log))
  # Starred labels: no repeated town or state, and labels saved by an older build are repaired.
  page.evaluate("localStorage.setItem('radar-v34-stars',JSON.stringify([{key:'k1',address:'1 SYNTHETIC RD, EDISON TWP, NJ, NJ'}]))");page.reload();unlock(page);page.wait_for_function('document.body.classList.contains("radar-v34")')
  check('a saved "NJ, NJ" label is repaired in storage',page.evaluate("JSON.parse(localStorage.getItem('radar-v34-stars'))[0].address")=='1 SYNTHETIC RD, EDISON TWP, NJ')
  check('no page errors on desktop',not errors);page.close()
  # Phone, 390px.
  page=browser.new_page(viewport={'width':390,'height':844});page.add_init_script(SIMPLE);page.route('**/*',network);page.goto(base);unlock(page);page.wait_for_function('document.body.classList.contains("radar-v34")');page.wait_for_timeout(600)
  tabs=page.evaluate("[...document.querySelectorAll('.v34-nav [data-view]')].map(b=>{const r=b.getBoundingClientRect();return [b.textContent,r.left,r.right,r.top,r.bottom,b.getAttribute('aria-label')]})")
  size=page.evaluate("[...document.querySelectorAll('.text-size-controls button')].map(b=>{const r=b.getBoundingClientRect();return [r.left,r.right,r.top,r.bottom]})")
  check('all five tabs are on screen at 390px',len(tabs)==5 and all(t[1]>=0 and t[2]<=390.5 for t in tabs))
  check('no tab sits under the text-size buttons',all(t[2]<=s[0] or t[1]>=s[1] or t[4]<=s[2] or t[3]>=s[3] for t in tabs for s in size))
  check('phone tabs keep their full names for screen readers',[t[5] for t in tabs]==['Find','Deal Nav','Ownership','Starred (0)','Data & Export'])
  tools=page.evaluate("[...document.querySelectorAll('#mapPanel .map-actions>*')].filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect();return [e.id||e.textContent.trim().slice(0,20),r.left,r.right]})")
  check('every map toolbar control is on screen at 390px',len(tools)>=5 and all(t[1]>=0 and t[2]<=390.5 for t in tools))
  check('the page does not scroll sideways on a phone',page.evaluate('document.documentElement.scrollWidth<=window.innerWidth+1'))
  page.close()
  # Tablet keeps full tab names.
  page=browser.new_page(viewport={'width':768,'height':1024});page.add_init_script(SIMPLE);page.route('**/*',network);page.goto(base);unlock(page);page.wait_for_function('document.body.classList.contains("radar-v34")')
  check('tablet keeps the full tab names',page.locator('.v34-nav [data-view="data"]').inner_text().strip()=='Data & Export');page.close()
  browser.close()
 print(f'Demo readiness suite passed: {len(checks)} checks.')
finally:
 server.shutdown()
