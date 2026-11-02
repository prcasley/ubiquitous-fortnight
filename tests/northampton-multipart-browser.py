"""Synthetic county boundary rows: duplicates and split parcels crossing page boundaries."""
from browser_fixture import *
checks=[]
def check(name,value):assert value,name;checks.append(name)
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=chromium_executable(p),headless=True,args=['--no-sandbox']);page=browser.new_page();mode.update({'ceo':True,'crossBorder':True,'paLarge':True,'paMultipart':True,'paSize':1263})
  requests=[];errors=[]
  def route(r):requests.append(r.request.url);network(r)
  page.route('**/*',route);page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:{server.server_port}/');unlock(page)
  page.fill('#dealNavAddress','40 Hilton St Easton PA');page.click('#dealNavAddressForm button');page.wait_for_function('!RadarDealNav.busy() && !!RadarDealNav.selected()',timeout=60000)
  rows=page.evaluate('PublicRadarBridge.getResults().filter(r=>r.state==="PA").map(r=>({id:r.id,acres:r.acres,parts:r.sourceParts,quality:r.acreageQuality,geometry:r.geometry.geometry.type,sf:turf.area(r.geometry)*10.7639104167}))')
  check('1263 source rows consolidate into 1261 county parcels, with selected anchor excluded',len(rows)==1260 and len(set(r['id'] for r in rows))==1260)
  split=next(r for r in rows if r['id']=='J10 3 0049 0311')
  check('boundary pieces across pages merge into a multipolygon',split['parts']==2 and split['geometry']=='MultiPolygon')
  check('whole-parcel acreage is retained once rather than summed',split['acres']==6 and abs(split['sf']/43560-6)<.02)
  check('temporary first-piece acreage warning clears after the full geometry arrives',split['quality']=='reported' and page.evaluate('PublicRadarBridge.getMeta().quarantinedCount===0'))
  duplicate=next(r for r in rows if r['id']=='J10 3 0099 0311')
  check('exact repeated geometry counts once',duplicate['parts']==1 and duplicate['acres']==6)
  check('merged county and NJ results remain complete',page.evaluate('PublicRadarBridge.getMeta().complete && PublicRadarBridge.getResults().some(r=>r.state==="NJ")'))
  pages=[parse_qs(urlparse(u).query) for u in requests if 'northamptoncounty.org' in u and 'orderByFields=' in u]
  check('compound ordering preserves ties across all 26 pages',len(pages)==26 and all(q['orderByFields']==['CAMA_ID ASC,OBJECTID ASC'] and int(q['resultOffset'][0])==i*50 for i,q in enumerate(pages)))
  page.get_by_role('button',name='Look up published owner & mailing address').click();page.wait_for_function('document.getElementById("dealNavSelected").textContent.includes("SYNTHETIC COUNTY OWNER LLC")')
  check('consistent repeated owner rows resolve to a dated public observation','not title verification' in page.locator('#dealNavSelected').inner_text())
  mode['paPartConflict']=True;page.click('#dealNavNearby');page.wait_for_function('!RadarDealNav.busy()')
  check('conflicting acreage is not silently combined or marked complete',not page.evaluate('PublicRadarBridge.getMeta().complete') and 'Conflicting county attributes' in page.locator('#dealNavStatus').inner_text())
  check('NJ results survive the county conflict',page.evaluate('PublicRadarBridge.getResults().some(r=>r.state==="NJ")'))
  mode['paPartConflict']=False;mode['paRepeatParcel']=True;page.click('#dealNavNearby');page.wait_for_function('!RadarDealNav.busy()')
  check('ignored offsets/repeated entire pages still remain partial',not page.evaluate('PublicRadarBridge.getMeta().complete') and 'repeated an entire boundary page' in page.locator('#dealNavStatus').inner_text())
  mode['paRepeatParcel']=False;mode['paSize']=1603;page.click('#dealNavNearby');page.wait_for_function('!RadarDealNav.busy()',timeout=60000)
  check('1600-row cap preserves partial results with no claim of the nearest in full inventory',not page.evaluate('PublicRadarBridge.getMeta().complete') and '1600' in page.locator('#dealNavStatus').inner_text() and 'closer sites may be missing' in page.locator('#dealNavNearbyResults').inner_text())
  check('no uncaught browser errors',not errors)
  browser.close()
 print('Northampton multipart browser suite passed:',len(checks),'split-page, duplicate-boundary, ownership and failure checks.')
finally:server.shutdown();server.server_close()
