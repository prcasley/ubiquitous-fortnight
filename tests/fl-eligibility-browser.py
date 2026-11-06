"""Florida OZ 2.0: FloridaCommerce eligibility is shown as eligibility, never nomination or certification."""
from browser_fixture import *
checks=[]
def check(name,value):assert value,name;checks.append(name)
def submit(page,q):
 page.fill('#agentPrompt',q);page.press('#agentPrompt','Enter');page.wait_for_function('!document.querySelector("#agentForm button[type=submit]").disabled')
def log(page):return page.locator('#agentLog').text_content()
try:
 with sync_playwright() as p:
  mode['persona']=True
  browser=p.chromium.launch(executable_path=chromium_executable(p),headless=True,args=['--no-sandbox']);page=browser.new_page();page.route('**/*',network);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:{server.server_port}/');unlock(page)
  submit(page,'industrial over 2 acres in West Palm Beach FL');n=page.evaluate('PublicRadarBridge.getResults().length');check('Florida fixture search returns parcels',n>0)
  page.wait_for_function('PublicRadarBridge.getResults().every(r=>r.ozObservations?.ozFL?.status==="reference-intersection")')
  check('Florida eligibility runs automatically before an OZ question','FloridaCommerce OZ 2.0 eligibility' in page.locator('.chat-properties').last.text_content())
  submit(page,'Which of these are in an opportunity zone?')
  text=log(page);cards=page.locator('.chat-properties').last.text_content()
  check('chat reports FloridaCommerce eligibility, labeled as not a nomination list',f'FloridaCommerce OZ 2.0 eligibility (not a nomination list): {n} of {n} parcels are in tracts that meet the criteria' in text)
  check('chat states FL nominations are not connected and new-round certification is unverified','No official state nomination list connected for FL; no new-round federal certification is verified by this check' in text)
  check('cards name the meeting tract with its published facts','FloridaCommerce OZ 2.0 eligibility: tract 12099000222 (poverty 25.8%, family income $49,911 vs area $89,212) meets the criteria' in cards)
  check('eligibility is never presented as nomination',' nominated' not in cards.lower().replace('not a nomination','') and 'Eligibility is not nomination' in cards)
  check('legacy third-party label is not used for FL once FloridaCommerce answered','Third-party OZ 2 eligibility reference' not in cards)
  # 7777 Southern Blvd pattern: tract does not meet criteria, but is a 2018 OZ 1.0 tract.
  mode['flNotMet']=True;submit(page,'opportunity zone')
  text=log(page);cards=page.locator('.chat-properties').last.text_content()
  check('not-met tract is reported as not meeting, never as eligible',f'0 of {n} parcels are in tracts that meet the criteria, {n} are in tracts that do not meet them' in text)
  check('not-met card shows the published poverty and income facts','tract 12099007833 (poverty 12.3%, family income $81,309 vs area $89,212) does not meet the criteria' in cards)
  check('OZ 1.0 overlap is reported independently of new-round eligibility','intersect 2018 OZ 1.0 tracts' in text and 'Also intersects 2018 OZ 1.0 tract' in cards)
  check('OZ1 anchor is independently identified in the fixture','Also intersects 2018 OZ 1.0 tract 12099007833' in cards)
  submit(page,'Summarize this for the board')
  check('board summary uses FloridaCommerce eligibility rather than third-party eligibility','FloridaCommerce eligibility (not nomination): 0 meet / '+str(n)+' do not meet' in page.locator('.board-summary').last.inner_text() and 'Third-party' not in page.locator('.board-summary').last.inner_text())
  page.evaluate('()=>{const r=PublicRadarBridge.getResults()[0];PublicRadarBridge.choose(r.key);RadarFieldPack.add(r);return true}')
  check('Deal Nav carries both Florida eligibility and OZ1 references','does not meet the criteria' in page.locator('#dealNavSelected').text_content() and 'Also intersects 2018 OZ 1.0 tract 12099007833' in page.locator('#dealNavSelected').text_content())
  with page.expect_download() as download:page.click('#generateFieldPack')
  pack=Path(download.value.path()).read_text();check('field pack preserves the separate official observations','does not meet the criteria' in pack and 'Also intersects 2018 OZ 1.0 tract 12099007833' in pack and '2028' not in pack)
  mode['flNotMet']=False;mode['flDesignation']='Meets Criteria (draft)';submit(page,'OZ2')
  check('unrecognized designation is refused, not classified','FloridaCommerce eligibility check unavailable' in log(page) and 'No properties were labeled qualified or ineligible' in log(page))
  mode.pop('flDesignation');mode['flEligFail']=True;submit(page,'opportunity zone')
  check('FloridaCommerce outage is unavailable, never zero eligibility','FloridaCommerce eligibility check unavailable' in log(page).split('opportunity zone')[-1] and 'FloridaCommerce eligibility check unavailable; no eligibility or ineligibility was inferred' in page.locator('.chat-properties').last.text_content())
  mode['flEligFail']=False
  # Map overlay: FL only, labeled as eligibility.
  page.evaluate('()=>{PublicRadarBridge.getMap().setView([26.72,-80.13],12,{animate:false});const t=document.getElementById("ozFLToggle");t.checked=true;t.dispatchEvent(new Event("change",{bubbles:true}));return true}')
  page.wait_for_function('document.getElementById("ozFLLegendStatus")?.textContent.startsWith("On · 1")',timeout=15000)
  check('FL eligibility overlay draws FloridaCommerce tracts','eligibility' in page.locator('#mapResearchNote').inner_text().lower() and 'not nomination' in page.locator('#mapResearchNote').inner_text())
  page.evaluate('()=>{PublicRadarBridge.getMap().setView([40.73,-74.17],12,{animate:false});return true}')
  page.wait_for_function('document.getElementById("ozFLLegendStatus")?.textContent.includes("covers FL only")',timeout=15000)
  check('FL overlay makes no claim outside Florida',True)
  page.set_viewport_size({'width':390,'height':844});check('FL labels fit phone width',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
  check('no uncaught browser errors',not errors);browser.close()
 print('Florida eligibility suite passed:',len(checks),'checks.')
finally:server.shutdown();server.server_close()
