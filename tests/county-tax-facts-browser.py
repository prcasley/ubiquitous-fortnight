"""County tax-list facts appear under Parcel details only for parcels the sidecar file covers. Synthetic data only."""
import json
from browser_fixture import *
checks=[]
def check(label,value):assert value,label;checks.append(label)
SIDECAR={'format':'RadarCountyTaxListFacts','version':1,'source':{'name':'Synthetic County tax list','url':'https://tax.example.gov/'},'records':{
 'NJ-0':{'zone':'LI','deedDate':'5/4/2026','deedBookPage':'20529/743','salePrice':'368,150','nonusableCode':'04','lastYearTaxes':'2345.55','landDescription':'3.00 AC','url':'https://tax.example.gov/detail?ID=1','retrievedAt':'2026-11-24'},
 'NJ-1':{'zone':'<img src=x onerror=window.__xss=1>','url':'javascript:alert(1)','retrievedAt':'2026-11-24'}}}
def routes(route):
 if route.request.url.split('?')[0].endswith('assets/data/nj-county-tax-list-facts.json'):route.fulfill(status=200,content_type='application/json',body=json.dumps(SIDECAR));return
 network(route)
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=chromium_executable(p),headless=True,args=['--no-sandbox'])
  page=browser.new_page(viewport={'width':1366,'height':900});page.route('**/*',routes);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:{server.server_port}/');unlock(page);page.wait_for_function('document.body.classList.contains("radar-v34")')
  page.fill('#agentPrompt','industrial over 2 acres near Edison NJ');page.locator('#agentPrompt').press('Enter')
  page.wait_for_function('!document.querySelector("#agentForm [type=submit]").disabled',timeout=60000);page.wait_for_function("document.querySelectorAll('#agentLog .county-tax-facts').length>=2")
  card=lambda n:page.locator(f'#agentLog .chat-property-card[data-parcel-key$=":NJ-{n}"]')
  box=card(0).locator('.executive-technical > .county-tax-facts')
  text=box.text_content()
  check('facts sit inside the collapsed Parcel details section',box.count()==1 and not card(0).locator('.executive-technical').evaluate('e=>e.open') and not box.is_visible())
  check('zoning, deed, sale price and taxes are shown in plain form',all(x in text for x in ['Synthetic County tax list','Zoning (county tax list)','LI','May 4, 2026 · Book 20529, page 743','$368,150 · county non-usable code 04','$2,345.55','Read Nov 24, 2026']))
  check('the county record link is https and opens in a new tab',box.locator('a').get_attribute('href')=='https://tax.example.gov/detail?ID=1' and box.locator('a').get_attribute('rel')=='noopener noreferrer')
  check('values are written as text and an unsafe link is dropped',page.evaluate('window.__xss===undefined') and card(1).locator('.county-tax-facts a').count()==0 and '<img' in card(1).locator('.county-tax-facts dd').first.text_content())
  check('a parcel the file does not cover gets no county block',card(2).locator('.county-tax-facts').count()==0)
  check('no page errors',not errors);browser.close()
 print(f'County tax facts suite passed: {len(checks)} checks.')
finally:
 server.shutdown()
