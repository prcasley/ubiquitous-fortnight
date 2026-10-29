"""Local archive recovery: synthetic fixtures only, no uploaded data or private notes."""
from browser_fixture import *
checks=[]
def check(name,value):assert value,name;checks.append(name)
fixture={'format':'RadarRecoveredReference','version':1,'sourceFile':'synthetic.html','fileGeneratedAt':'2026-09-28','groups':[{'id':'florida','label':'Palm Beach / Mangonia'},{'id':'newJersey','label':'New Jersey'},{'id':'lehigh','label':'Lehigh Valley'}], 'records':[{'archiveKey':'a','group':'florida','pcn':'001','state':'FL','situs':'Synthetic Mangonia parcel','market':'Mangonia Park','owner':'SYNTHETIC PUBLIC LLC','acreage':6,'point':[-80.07,26.76],'rings':[],'internal':'HELD_STRATEGY','targetRanking':'HELD_RANK'},{'archiveKey':'b','group':'newJersey','pcn':'002','state':'NJ','situs':'Synthetic NJ parcel','acreage':8,'point':[-74.36,40.52],'rings':[[[-74.361,40.519],[-74.359,40.519],[-74.359,40.521],[-74.361,40.519]]]}], 'municipalOverlays':[{'id':'boundary','name':'Synthetic boundary','rings':[[[-80.1,26.7],[-80,26.7],[-80,26.8],[-80.1,26.7]]]}], 'ozReference':[{'geoid':'12099000100','asOf':'2026-09-23','rings':[[[-80.1,26.7],[-80,26.7],[-80,26.8],[-80.1,26.7]]]}]}
def routes(r):
 if r.request.url.endswith('/assets/data/recovered-reference.json'):respond(r,fixture)
 else:network(r)
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=shutil.which('chromium') or p.chromium.executable_path,headless=True,args=['--no-sandbox']);page=browser.new_page();page.route('**/*',routes);errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(f'http://127.0.0.1:{server.server_port}/');unlock(page);page.wait_for_function('RadarArchive.getBundle()?.records.length===2')
  check('archive observations are distinct from live scan results',page.evaluate('PublicRadarBridge.getResults().length===0') and 'historical' in page.locator('#archiveStatus').inner_text())
  page.fill('#agentPrompt','industrial over 5 acres in Edison NJ');page.press('#agentPrompt','Enter');page.wait_for_function('!document.querySelector("#agentForm [type=submit]").disabled');live=page.evaluate('({search:PublicRadarBridge.getSearch(),keys:PublicRadarBridge.getResults().map(r=>r.key)})')
  before=page.evaluate('PublicRadarBridge.getSearchCenter()');page.locator('[data-archive-query="mangonia"]').click();check('Mangonia quick view locates recovered data',len(page.evaluate('RadarArchive.getVisible()'))==1)
  check('archive view never changes future search anchor',page.evaluate('PublicRadarBridge.getSearchCenter()')==before)
  page.locator('#archiveResults').get_by_role('button',name='View historical facts').click();text=page.locator('#archiveDetails').inner_text();check('historical owner, acreage and date are explicit','SYNTHETIC PUBLIC LLC' in text and '261,360' in text and '2026-09-28' in text and 'current ownership unverified' in text)
  check('withheld fields are not accepted into the recovered app model',page.evaluate('RadarArchive.getBundle().records.every(r=>!("internal" in r)&&!("targetRanking" in r))'))
  page.check('#archiveShowMunicipal');page.check('#archiveShowOZ');check('historical OZ layer says not designation','nomination/designation NOT verified' in page.locator('#archiveLegend').inner_text())
  page.select_option('#archiveGroup','newJersey');page.fill('#archiveQuery','');page.wait_for_function('RadarArchive.getVisible()[0]?.state==="NJ"');page.locator('#archiveResults').get_by_role('button',name='Locate on map').click();check('source rings do not replace or widen the existing live search',page.evaluate('({search:PublicRadarBridge.getSearch(),keys:PublicRadarBridge.getResults().map(r=>r.key)})')==live)
  page.select_option('#archiveGroup','');page.fill('#archiveQuery','does-not-exist');page.wait_for_function('RadarArchive.getVisible().length===0');check('empty archive filter is not a live-market zero claim','historical observations' in page.locator('#archiveCount').inner_text())
  page.fill('#archiveQuery','');page.select_option('#archiveGroup','florida');page.wait_for_function('RadarArchive.getVisible().length===1');page.locator('#archiveResults').get_by_role('button',name='View historical facts').click()
  for width in [390,1280]:page.set_viewport_size({'width':width,'height':844});check('reference workspace fits width '+str(width),page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
  check('no uncaught archive errors',not errors);browser.close()
 print('Archive browser suite passed:',len(checks),'historical-data and map-isolation checks.')
finally:server.shutdown();server.server_close()
