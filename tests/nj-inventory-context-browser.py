"""Explicit whole-inventory context checks, role-separated export and one failed source."""
from browser_fixture import *
import csv
checks=[];failed_site=False
def check(name,value):assert value,name;checks.append(name)
def routes(route):
 global failed_site
 u=urlparse(route.request.url);q=parse_qs(route.request.post_data or '') if route.request.method=='POST' else parse_qs(u.query)
 if u.hostname=='services2.arcgis.com' and 'OWNER_NAME' in q.get('outFields',[''])[0]:
  ids=re.findall(r"'(1201_[^']+)'",q.get('where',[''])[0]);respond(route,{'features':[{'attributes':{'PAMS_PIN':id,'PROP_CLASS':'4B','OWNER_NAME':'','ST_ADDRESS':'123 Mailing Only Rd','CITY_STATE':'Example NJ','ZIP_CODE':'07000'}} for id in ids]});return
 if u.hostname=='services2.arcgis.com' and 'Parcels_Composite_NJ_WM' in u.path and not u.path.endswith('/query'):
  names=['PAMS_PIN','PROP_LOC','MUN_NAME','PROP_CLASS','CALC_ACRE','COUNTY','YR_CONSTR','PCLBLOCK','PCLLOT','PCL_MUN','DEED_BOOK','DEED_PAGE','DEED_DATE','SALE_PRICE','PCLQCODE','BLDG_DESC','LAND_VAL','IMPRVT_VAL','NET_VALUE','OWNER_NAME','ST_ADDRESS','CITY_STATE','ZIP_CODE'];respond(route,{'geometryType':'esriGeometryPolygon','objectIdField':'OBJECTID','fields':[{'name':'OBJECTID','type':'esriFieldTypeOID'}]+[{'name':n} for n in names]});return
 if 'New_Jersey_Environmental_Management_System_Sites' in u.path:
  site='/143' in u.path
  if not u.path.endswith('/query'):
   if site and not failed_site:failed_site=True;respond(route,{'error':{'message':'Synthetic one-record outage'}},503);return
   names=['SITE_NAME'] if site else ['PI_NAME'];respond(route,{'objectIdField':'OBJECTID',**({'geometryType':'esriGeometryPoint'} if site else {}),'fields':[{'name':'OBJECTID','type':'esriFieldTypeOID'},{'name':'SITE_ID','type':'esriFieldTypeInteger'},{'name':'PI_ID','type':'esriFieldTypeInteger'}]+[{'name':n,'type':'esriFieldTypeString'} for n in names]});return
  if q.get('returnCountOnly')==['true']:respond(route,{'count':0});return
 network(route)
try:
 mode['inventory']=True;mode['inventoryUploaded']=True;mode['inventoryQualified']=True
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=chromium_executable(p),headless=True,args=['--no-sandbox']);page=browser.new_page(viewport={'width':1280,'height':900},accept_downloads=True);errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('**/*',routes);page.goto(f'http://127.0.0.1:{server.server_port}/');unlock(page);page.wait_for_function('RadarOZInventory.getState().tracts===130');page.click('#ozPairScan');page.wait_for_function('!RadarOZInventory.getState().busy&&RadarOZInventory.getState().parcels===3');page.click('#ozInventoryContext');page.wait_for_function('!RadarOZInventory.getState().busy&&RadarOZInventory.getState().contextChecked===3');check('one context failure does not prevent the remaining records from being checked','3/3 had regulatory checks' in page.locator('#ozInventoryStatus').inner_text())
  with page.expect_download() as download:page.click('#ozInventoryCSV')
  rows=list(csv.DictReader(Path(download.value.path()).read_text().splitlines()));check('all requested rows carry mailing dates and published recipients',len(rows)==3 and all(r['MAILING_CHECKED_AT'] and r['MAILING_STATUS']=='published-recipient' and 'Mailing Only' in r['TAX_MAILING_RECIPIENT'] for r in rows));check('failed regulatory attempts have dates and explicit failure status',sum(r['REGULATORY_STATUS']=='unavailable' and bool(r['REGULATORY_CHECKED_AT']) for r in rows)==1);check('successful empty source checks differ from unrequested records',sum(r['REGULATORY_STATUS']=='checked-no-sites-in-scope' for r in rows)==2);check('blank owner fields are explicitly checked-not-published',all(r['ASSESSMENT_NAME_STATUS']=='not-published-in-checked-record' and r['OWNER_OBSERVATION_CHECKED_AT'] for r in rows));check('mailing does not become owner or headquarters',all(r['PUBLISHED_ASSESSMENT_NAME']=='not checked or not published' for r in rows))
  with page.expect_download() as download:page.click('#ozInventoryExport')
  exported=json.loads(Path(download.value.path()).read_text());check('local JSON includes the requested typed context and preserves source coverage',all(r['context'] for r in exported['parcels']) and len(exported['coverage'])==130)
  check('no uncaught errors',not errors);browser.close()
 print('NJ inventory context browser passed:',len(checks),'checks.')
finally:server.shutdown();server.server_close()
