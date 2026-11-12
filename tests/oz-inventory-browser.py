"""Nomination inventory completeness, exact public owner lookups and local contact research."""
from browser_fixture import *
checks=[]
def check(name,value):assert value,name;checks.append(name)
try:
 with sync_playwright() as p:
  mode['inventory']=True;mode['njOwnerName']='SYNTHETIC INVENTORY LLC'
  browser=p.chromium.launch(executable_path=chromium_executable(p),headless=True,args=['--no-sandbox']);page=browser.new_page(viewport={'width':1280,'height':900});page.route('**/*',network);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:{server.server_port}/');unlock(page);page.wait_for_function('RadarOZInventory.getState().tracts===130')
  page.locator('#v34Fold-ozInventory > summary').click()
  check('all 130 tracts start unchecked, not falsely complete','0/130 tracts complete' in page.locator('#ozInventorySummary').inner_text() and '130 not checked' in page.locator('#ozInventorySummary').inner_text())
  before=page.evaluate('({criteria:PublicRadarBridge.getSearch(),results:PublicRadarBridge.getResults().map(r=>r.key)})')
  page.click('#ozInventoryBuild');page.wait_for_function('!RadarOZInventory.getState().busy && RadarOZInventory.getState().parcels===3')
  check('selected tract reconciles all parcels without industrial/acreage exclusion','1/130 tracts complete' in page.locator('#ozInventorySummary').inner_text() and page.locator('#ozInventoryResults article').count()==3)
  check('published assessments are distinguished from asking/market values','$300,000' in page.locator('#ozInventoryResults').inner_text() and 'Not asking prices or verified market values' in page.locator('#ozInventoryResults').inner_text())
  check('names and contacts do not appear without research','Owner name not checked' in page.locator('#ozInventoryResults').inner_text() and 'no phone or email has been verified' in page.locator('#ozInventoryResults').inner_text())
  page.select_option('#ozInventoryType','Industrial');check('use filter changes display, not source completeness',page.locator('#ozInventoryResults article').count()==2 and page.evaluate('RadarOZInventory.getState().parcels===3'))
  page.fill('#ozInventoryAcres','8');check('acreage filter works on accepted public acres',page.locator('#ozInventoryResults article').count()==1 and '8.00 acres' in page.locator('#ozInventoryResults').inner_text())
  page.fill('#ozInventoryAcres','0');page.select_option('#ozInventoryType','')
  page.locator('#ozInventoryResults article').first.get_by_role('button',name='Look up published owner',exact=True).click();page.wait_for_function('!RadarOZInventory.getState().busy')
  check('exact owner observation displayed with source date','SYNTHETIC INVENTORY LLC' in page.locator('#ozInventoryResults').inner_text() and '1 published names loaded' in page.locator('#ozInventorySummary').inner_text())
  page.locator('#ozInventoryResults article').first.get_by_role('button',name='Research business contacts').click()
  page.get_by_label('Business contact name',exact=True).fill('Synthetic Acquisitions Contact');page.get_by_label('Business contact source URL',exact=True).fill('https://example.gov/company-directory');page.get_by_label('Business role/contact route checked by me').check();page.get_by_role('button',name='Save cited business contact',exact=True).click()
  check('cited contact status connects to existing browser-local company dossier','1 cited business contact(s) marked reviewed' in page.locator('#ozInventoryResults').inner_text())
  page.locator('#ozInventoryResults article').first.get_by_role('button',name='Open parcel on map').click();page.wait_for_function('!!RadarDealNav.selected()')
  check('parcel opens in Deal Nav without replacing scanner criteria/results',page.evaluate('({criteria:PublicRadarBridge.getSearch(),results:PublicRadarBridge.getResults().map(r=>r.key)})')==before and page.evaluate('RadarDealNav.selected().id==="INV-2"'))
  for width in [360,390,1280]:
   page.set_viewport_size({'width':width,'height':844});check('inventory fits '+str(width)+'px',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
  mode['inventoryFail']=True;page.select_option('#ozInventoryTract','34023004600');page.click('#ozInventoryBuild');page.wait_for_function('!RadarOZInventory.getState().busy')
  check('failed new tract stays unavailable and previous parcels remain',page.evaluate('RadarOZInventory.getState().parcels===3 && RadarOZInventory.getState().reports.some(r=>r.status==="unavailable")') and '1 unavailable' in page.locator('#ozInventorySummary').inner_text())
  mode['inventoryFail']=False
  with page.expect_download() as d:page.click('#ozInventoryExport')
  exported=json.loads(Path(d.value.path()).read_text());check('export preserves coverage, names and reviewed-contact status without inventing completeness',len(exported['coverage'])==130 and any(r['status']=='not-checked' for r in exported['coverage']) and len(exported['parcels'])==3 and any(r['ownership'] and r['ownership'].get('publishedName')=='SYNTHETIC INVENTORY LLC' for r in exported['parcels']))
  page.click('#ozInventoryAll');page.wait_for_function('!RadarOZInventory.getState().busy && RadarOZInventory.getState().reports.length===130',timeout=120000)
  check('all-tract run reconciles every tract and deduplicates crossing parcel IDs',page.evaluate('RadarOZInventory.getState().parcels===3 && RadarOZInventory.getState().reports.every(r=>r.status==="complete")') and '130/130 tracts complete' in page.locator('#ozInventorySummary').inner_text())
  page.click('#ozInventoryOwners');page.wait_for_function('!RadarOZInventory.getState().busy')
  check('requested owner batch enriches only matching inventory records','3 published names loaded' in page.locator('#ozInventorySummary').inner_text())
  page.select_option('#ozInventoryTract','34023004502')
  for cls,label in [('4A','Commercial'),('2','Residential')]:
   mode['inventoryClass']=cls;page.click('#ozInventoryBuild');page.wait_for_function('!RadarOZInventory.getState().busy');page.select_option('#ozInventoryType',label)
   check('published NJ class '+cls+' appears under '+label,page.locator('#ozInventoryResults article').count()==1 and label in page.locator('#ozInventoryResults article').inner_text())
  check('changed cross-tract attributes are flagged for review','Source attributes differ' in page.locator('#ozInventoryResults').inner_text())
  page.close();page=browser.new_page();page.route('**/*',network);mode['inventoryFail']=True;page.goto(f'http://127.0.0.1:{server.server_port}/');unlock(page);page.wait_for_function('RadarOZInventory.getState().tracts===130');page.click('#ozInventoryAll');page.wait_for_function('!RadarOZInventory.getState().busy')
  check('source-wide outage stops after three failures without claiming remaining coverage',page.evaluate('RadarOZInventory.getState().reports.length===3 && RadarOZInventory.getState().parcels===0') and '127 not checked' in page.locator('#ozInventorySummary').inner_text() and 'three consecutive' in page.locator('#ozInventoryStatus').inner_text())
  check('no uncaught browser errors',not errors);browser.close()
 print('OZ inventory browser suite passed:',len(checks),'coverage, owner and local-contact checks.')
finally:server.shutdown();server.server_close()
