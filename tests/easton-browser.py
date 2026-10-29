"""Cross-border Easton regressions use synthetic records, never actual ownership data."""
from browser_fixture import *
checks=[]
def check(name,value):assert value,name;checks.append(name)
def address(page):
 page.fill('#dealNavAddress','40 Hilton St Easton PA');page.click('#dealNavAddressForm button');page.wait_for_function('!RadarDealNav.busy() && !!RadarDealNav.selected()')
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=shutil.which('chromium') or p.chromium.executable_path,headless=True,args=['--no-sandbox']);page=browser.new_page();mode['ceo']=True;mode['crossBorder']=True;mode['paLarge']=True
  requests=[];errors=[]
  def route(r):
   requests.append(r.request.url);network(r)
  page.route('**/*',route);page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:{server.server_port}/');address(page)
  rows=page.evaluate('PublicRadarBridge.getResults().map(r=>({id:r.id,state:r.state}))')
  check('320 county rows span three explicit-ID batches without duplication',len([r for r in rows if r['state']=='PA'])==319 and len({r['id'] for r in rows if r['state']=='PA'})==319)
  county_queries=[parse_qs(urlparse(u).query) for u in requests if 'northamptoncounty.org' in u and '/query?' in u]
  pages=[q for q in county_queries if 'objectIds' in q]
  check('server applies ASMT acreage before count and stable ordered ID retrieval',len(pages)==3 and all('ASMT_ACREAGE >= 5' in q['where'][0] and q['orderByFields']==['OBJECTID ASC'] and q['resultOffset']==['0'] for q in pages))
  check('NJGIN contributes nearby border parcels',any(r['state']=='NJ' for r in rows))
  check('primary PA criteria and controls agree after NJ retrieval',page.evaluate('PublicRadarBridge.getSearch().state==="PA"') and page.input_value('#stateSelect')=='PA')
  text=page.locator('#dealNavSelected').inner_text()
  check('selected county parcel has published acreage, year and public assessment',page.evaluate('RadarDealNav.selected().acres===6 && RadarDealNav.selected().yearBuilt===1984 && RadarDealNav.selected().assessedValue===300000'))
  check('nominal sale and placeholder excluded with explanation','Nominal sale' in text and page.evaluate('RadarDealNav.selected().recordedSalePrice===null'))
  check('PA KOZ flag is distinct from federal OZ','separate from federal Opportunity Zones' in text)
  check('no owner names requested by bulk parcel scanning',not any('OWNERS_NAME_1' in u for u in requests))
  page.get_by_role('button',name='Look up published owner & mailing address').click();page.wait_for_function('document.querySelector("#dealNavSelected").textContent.includes("SYNTHETIC COUNTY OWNER LLC")')
  check('explicit county ownership lookup remains a dated public observation','not title verification' in page.locator('#dealNavSelected').inner_text())
  check('ownership detail not copied into normalized parcel or assistant',page.evaluate('RadarDealNav.selected().owner===null') and 'SYNTHETIC COUNTY OWNER' not in page.locator('#agentMessages').inner_text() if page.locator('#agentMessages').count() else page.evaluate('RadarDealNav.selected().owner===null'))
  mode['paSnapshotFail']=True;page.click('#dealNavNearby');page.wait_for_function('!RadarDealNav.busy()')
  check('invalid/repeated PA ID snapshot preserves NJ results and stays partial',page.evaluate('!PublicRadarBridge.getMeta().complete && PublicRadarBridge.getResults().every(r=>r.state==="NJ") && PublicRadarBridge.getResults().length>0'))
  check('partial county reason is visible','snapshot' in page.locator('#dealNavStatus').inner_text())
  mode['paSnapshotFail']=False;mode['paLarge']=False;mode['paAmbiguous']=True;address(page)
  check('multiple parcel matches do not manufacture a unique address identity','parcel identity unverified' in page.locator('#dealNavSelected').inner_text() and page.locator('#dealNavEnvelopeButton').is_disabled())
  check('no uncaught browser errors',not errors)
  browser.close()
 print('Easton browser suite passed:',len(checks),'paging, cross-border, ownership and failure-boundary checks.')
finally:server.shutdown();server.server_close()
