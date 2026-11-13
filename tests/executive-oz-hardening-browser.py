"""Adversarial executive prompts, zero-area/tiny overlaps, expiry and cross-border coverage."""
from browser_fixture import *
import datetime
checks=[]
def check(label,value):assert value,label;checks.append(label)
def ask(page,text):
 page.fill('#agentPrompt',text);page.press('#agentPrompt','Enter');page.wait_for_function('!document.querySelector("#agentForm [type=submit]").disabled')
def context(browser):
 ctx=browser.new_context(accept_downloads=True);page=ctx.new_page();page.route('**/*',network);page.goto(f'http://127.0.0.1:{server.server_port}/');unlock(page);return ctx,page
try:
 mode['persona']=True;mode['ceo']=True;mode['njNomCase']=True
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=chromium_executable(p),headless=True,args=['--no-sandbox']);ctx,page=context(browser)
  ask(page,'industrial over 2 acres in Newark NJ');page.wait_for_function('PublicRadarBridge.getResults().some(r=>r.ozObservations?.ozNJ?.nominationVerified)')
  for text in ['QOZ?','OZ?','opp zone?']:
   ask(page,text);log=page.locator('#agentLog').inner_text();check('source verification instead of a canned count: '+text,'checked parcels meet the 95% mapped-area screening rule' in log and 'records in the retrieved source results match this question' not in log)
  ask(page,'Is the first one in an OZ?');check('ordinal targets the first visible result instead of all results','1 of 1 checked parcels' in page.locator('#agentLog').inner_text())
  key=page.evaluate('PublicRadarBridge.getResults().find(r=>r.ozObservations?.ozNJ?.nominationVerified).key');g=page.evaluate('(key)=>PublicRadarBridge.getRecord(key).geometry.geometry',key)
  ring=g['coordinates'][0];xmin=min(v[0] for v in ring);xmax=max(v[0] for v in ring);ymin=min(v[1] for v in ring);ymax=max(v[1] for v in ring);width=xmax-xmin
  for name,left,bottom,status in [('sliver',xmax-width*.0008,ymin,'partial-overlap'),('line',xmax,ymin,'boundary-contact'),('corner',xmax,ymax,'boundary-contact')]:
   mode['nominationGeometry']={'type':'Polygon','coordinates':[[[left,bottom],[xmax+width,bottom],[xmax+width,ymax+(ymax-ymin)],[left,ymax+(ymax-ymin)],[left,bottom]]]}
   page.evaluate('(key)=>RadarChatProperties.render([PublicRadarBridge.getRecord(key)],PublicRadarBridge.getMeta())',key);ask(page,'Is the first one in an OZ?')
   o=page.evaluate('(key)=>PublicRadarBridge.getRecord(key).ozObservations.ozNJ',key)
   check(name+' never becomes a positive nomination match',o['status']==status and not o['nominationVerified'] and '0 of 1 checked parcels' in page.locator('#agentLog').inner_text())
   check(name+' is visibly flagged for boundary review','Not counted as a positive parcel match' in page.locator('.chat-properties').last.text_content())
   if name=='sliver':check('tiny overlap reports the actual share',abs(o['overlapPercent']-.08)<.001 and '0.080%' in page.locator('.chat-properties').last.text_content())
  page.evaluate('()=>{window.PublicRadarAssistant={isAvailable:()=>true,explain:async()=>{}};return true}')
  before=page.locator('#agentLog').inner_text();ask(page,'Can you help with due diligence?');check('hosted assistant silence still produces a visible reply',page.locator('#agentLog').inner_text()!=before and 'no match count was inferred' in page.locator('#agentLog').inner_text())
  page.clock.set_fixed_time(datetime.datetime(2027,2,3,tzinfo=datetime.timezone.utc));ask(page,'QOZ?')
  check('expired evidence explicitly asks for refresh',page.evaluate('PublicRadarBridge.getResults().every(r=>r.ozObservations.ozNJ.status==="expired"&&!r.ozObservations.ozNJ.nominationVerified)') and 'NJ nomination data expired; refresh needed' in page.locator('#agentLog').inner_text())
  page.evaluate('(key)=>PublicRadarBridge.choose(key)',key);page.click('#checkSelectedOZ');page.wait_for_function('!document.querySelector("#checkSelectedOZ").disabled');check('selected-parcel OZ workspace preserves the expiry reason','expired; refresh needed' in page.locator('#ozStatusResults').inner_text())
  check('expired cards do not imply either nomination or absence','NJ nomination data expired; refresh needed' in page.locator('.oz-observation').first.text_content());ctx.close();mode.pop('nominationGeometry');mode['njNomCase']=False;mode['njNomination']=True
  ctx,page=context(browser);ask(page,'industrial over 2 acres in Camden NJ');n=page.evaluate('PublicRadarBridge.getResults().length');check('Camden fixture has results',n>0)
  requests_before=len(external_requests);ask(page,'QOZ?');check('Camden QOZ repro triggers an official source request',any('2026_Opportunity_Zone_2_0_Nominations' in u for u in external_requests[requests_before:]) and 'records in the retrieved source results match this question' not in page.locator('#agentLog').inner_text());ctx.close()
  mode['crossBorder']=True;ctx,page=context(browser);ask(page,'industrial over 5 acres near Easton PA')
  check('Easton chat searches PA and NJ',set(page.evaluate('PublicRadarBridge.getResults().map(r=>r.state)'))=={'PA','NJ'})
  check('cross-border source coverage is reported independently',set(page.evaluate('PublicRadarBridge.getMeta().sourceReports.map(r=>r.state)'))=={'PA','NJ'})
  ask(page,'QOZ?');check('Easton includes official NJ nominations','the 130 New Jersey designated OZ 2.0 tracts' in page.locator('#agentLog').inner_text());ctx.close()
  ctx,page=context(browser);mode['addressSearch']=True;ask(page,'industrial over 5 acres near 40 Hilton St Easton PA')
  check('address-centered cross-border search retains its PA subject',page.evaluate('PublicRadarBridge.getSubject()?.provider==="northampton"&&PublicRadarBridge.getResults().some(r=>r.state==="NJ")'));ctx.close();mode.pop('addressSearch');mode['crossBorder']=False
  ctx,page=context(browser);external_requests.clear();ask(page,'industrial over 10 acres in Lehigh County PA')
  check('Lehigh is explicitly unavailable instead of Failed to fetch','Lehigh County blocks direct cross-site browser requests' in page.locator('#agentLog').inner_text() and not any('gis.lehighcounty.org' in u for u in external_requests))
  check('unavailable Lehigh menu is disabled',page.locator('#countySelect option').evaluate_all('(nodes)=>nodes.some(n=>n.textContent.includes("Lehigh")&&n.disabled)') if page.locator('#stateSelect').input_value()=='PA' else True);ctx.close()
  # A transient zero NJ count must be independently verified before showing an empty scan.
  ctx,page=context(browser)
  page.evaluate("""()=>{const original=RadarGISTransport.request;window.injectedEmpty=false;RadarGISTransport.request=(u,o)=>{if(u.includes('services2.arcgis.com')&&u.includes('returnCountOnly')&&!window.injectedEmpty){window.injectedEmpty=true;return Promise.resolve({count:0});}return original(u,o);};return true}""")
  ask(page,'industrial over 2 acres in Newark NJ');check('one transient zero count recovers without a false empty search',page.evaluate('window.injectedEmpty&&PublicRadarBridge.getResults().length>0&&PublicRadarBridge.getMeta().complete'));ctx.close()
  mode['countySearch']=True;mode['broLarge']=True;ctx,page=context(browser);external_requests.clear();ask(page,'industrial over 10 acres in Broward County FL')
  check('Broward applies an acreage prefilter before its count and page cap',page.evaluate('PublicRadarBridge.getMeta().complete&&PublicRadarBridge.getResults().length===100&&PublicRadarBridge.getMeta().expectedSourceCount===100') and any('Shape__Area >=' in parse_qs(urlparse(u).query).get('where',[''])[0] for u in external_requests))
  check('filtered Broward result is not the first 900 of 8508','8508' not in page.locator('#statusText').inner_text());ctx.close();browser.close()
 print('Executive OZ hardening suite passed:',len(checks),'checks.')
finally:server.shutdown();server.server_close()
