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
  page.goto(f'http://127.0.0.1:{server.server_port}/');unlock(page);address(page)
  rows=page.evaluate('PublicRadarBridge.getResults().map(r=>({id:r.id,state:r.state}))')
  check('320 county rows span seven parcel-key pages with OIDs absent and objectIds ignored without duplication',len([r for r in rows if r['state']=='PA'])==319 and len({r['id'] for r in rows if r['state']=='PA'})==319)
  county_queries=[parse_qs(urlparse(u).query) for u in requests if 'northamptoncounty.org' in u and '/query?' in u]
  pages=[q for q in county_queries if q.get('f')==['geojson'] and q.get('orderByFields')==['PARCEL_ID ASC']]
  check('server applies ASMT acreage before count and stable parcel-key seek retrieval',len(pages)==7 and all('ASMT_ACREAGE >= 5' in q['where'][0] and q['orderByFields']==['PARCEL_ID ASC'] and q['resultOffset']==['0'] for q in pages))
  check('county feature GET URLs stay below the server length limit',all(len(u)<2000 for u in requests if 'northamptoncounty.org' in u and 'objectIds=' in u))
  check('outFields contain each requested column only once',all(len(q['outFields'][0].split(','))==len(set(q['outFields'][0].split(','))) for q in pages))
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
  page.evaluate('document.getElementById("dealNavAutoNearby").checked=true')
  page.evaluate('RadarAcquisition.build(); window.openedShortlists=RadarAcquisition.getResults(); window.scrollTargets=[]; const original=Element.prototype.scrollIntoView; Element.prototype.scrollIntoView=function(options){window.scrollTargets.push(this.id); return original.call(this,options)}; true')
  page.set_viewport_size({'width':390,'height':844})
  before=page.evaluate('({scan:PublicRadarBridge.getMeta().scanId,count:PublicRadarBridge.getResults().length})')
  page.locator('#dealNavNearbyResults button').first.click();page.wait_for_timeout(500)
  check('opening nearby parcel preserves retrieved search and does not start auto-nearby',page.evaluate('({scan:PublicRadarBridge.getMeta().scanId,count:PublicRadarBridge.getResults().length})')==before and not page.evaluate('RadarDealNav.busy()'))
  check('mobile navigation scrolls to map and retains acquisition shortlists',page.evaluate('scrollTargets.at(-1)==="mapPanel" && RadarAcquisition.getResults()===openedShortlists'))
  check('single-card header describes selection, not partial search', 'Selected parcel' in page.locator('.chat-properties').last.inner_text())
  page.evaluate('document.getElementById("dealNavAutoNearby").checked=false')
  page.locator('.chat-properties').last.get_by_role('button',name='Look up published owner',exact=True).click()
  page.wait_for_function('document.querySelectorAll(".chat-owner-observation")[document.querySelectorAll(".chat-owner-observation").length-1].textContent.includes("SYNTHETIC COUNTY OWNER LLC")')
  check('chat card uses the same exact-match Northampton ownership adapter','SYNTHETIC COUNTY OWNER LLC' in page.locator('.chat-properties').last.inner_text())
  mode['paRepeatParcel']=True;page.click('#dealNavNearby');page.wait_for_function('!RadarDealNav.busy()')
  check('truly repeated parcel keys still fail closed and preserve cross-border candidates',not page.evaluate('PublicRadarBridge.getMeta().complete') and page.evaluate('PublicRadarBridge.getResults().some(r=>r.state==="NJ")'))
  mode['paRepeatParcel']=False
  mode['paSnapshotFail']=True;page.click('#dealNavNearby');page.wait_for_function('!RadarDealNav.busy()')
  check('invalid PA source count preserves NJ results and stays partial',page.evaluate('!PublicRadarBridge.getMeta().complete && PublicRadarBridge.getResults().every(r=>r.state==="NJ") && PublicRadarBridge.getResults().length>0'))
  check('partial county reason is visible','reliable record count' in page.locator('#dealNavStatus').inner_text())
  mode['paSnapshotFail']=False;mode['paLarge']=False;mode['paAmbiguous']=True;address(page)
  check('multiple parcel matches do not manufacture a unique address identity','parcel identity unverified' in page.locator('#dealNavSelected').inner_text() and page.locator('#dealNavEnvelopeButton').is_disabled())
  check('no uncaught browser errors',not errors)
  browser.close()
 print('Easton browser suite passed:',len(checks),'paging, cross-border, ownership and failure-boundary checks.')
finally:server.shutdown();server.server_close()
