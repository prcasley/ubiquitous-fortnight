"""Exercise real mode navigation without the legacy workflow reveal helper."""
from browser_fixture import *
checks=[]
def check(label,value):assert value,label;checks.append(label)
try:
 mode['workspaceManual']=True;mode['ceo']=True;mode['persona']=True
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=chromium_executable(p),headless=True,args=['--no-sandbox']);page=browser.new_page(viewport={'width':1440,'height':1000});page.route('**/*',network);errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(f'http://127.0.0.1:{server.server_port}/');unlock(page);page.wait_for_function('!!window.RadarWorkspace')
  check('uploaded NJ KML parses as reference boundary geometry',page.evaluate('async()=>RadarKML.parse(await(await fetch("assets/data/nj-nomination-downloads/NJ_OZ2_2026_Nominations.kml")).text()).features.length')>=130)
  check('map caveat is retained in the drawer without covering imagery',page.locator('.map-banner').evaluate('e=>!!e.closest(".workspace-drawer")'))
  check('exactly three accessible modes',page.get_by_role('tab').count()==3 and page.get_by_role('tabpanel').count()==1)
  page.evaluate('window.originalWorkspaceMap=PublicRadarBridge.getMap()');box=page.locator('#map').bounding_box();check('desktop map and drawer share the screen',box['x']>page.locator('#workspaceDrawer').bounding_box()['x'] and box['height']>300)
  artifact=Path(os.environ.get('RADAR_BROWSER_ARTIFACT_DIR','/tmp/radar-workspace-artifacts'));artifact.mkdir(parents=True,exist_ok=True);page.screenshot(path=str(artifact/'workspace-desktop.png'))
  for key in ['deal','owners','scan']:
   page.click('#workspace-tab-'+key);check('mode changes without replacing map: '+key,page.evaluate('(key)=>RadarWorkspace.getMode()===key&&originalWorkspaceMap===PublicRadarBridge.getMap()',key))
  page.fill('#agentPrompt','industrial over 5 acres in Edison NJ');page.press('#agentPrompt','Enter');page.wait_for_function('!document.querySelector("#agentForm [type=submit]").disabled');before=page.evaluate('({ids:PublicRadarBridge.getResults().map(r=>r.key),scan:PublicRadarBridge.getMeta().scanId})')
  page.click('#workspace-tab-owners');page.wait_for_function('document.getElementById("publishedOwnerFilesStatus").textContent.includes("1,490")');check('published owner files are reachable in ownership mode',page.get_by_role('link',name='Download imported owner records (CSV)').is_visible())
  page.click('#workspace-tab-deal');page.keyboard.press('ArrowRight');check('keyboard navigation selects owners',page.evaluate('RadarWorkspace.getMode()')=='owners');page.keyboard.press('Home');check('Home returns to Scan',page.evaluate('RadarWorkspace.getMode()')=='scan')
  for width in [390,360]:
   page.set_viewport_size({'width':width,'height':844});page.wait_for_timeout(100)
   for key in ['scan','deal','owners']:
    page.click('#workspace-tab-'+key);m=page.locator('#map').bounding_box();check('phone map stays on screen '+str(width)+' '+key,m['height']>=170 and m['y']>=0 and m['y']+m['height']<844);check('phone has no sideways overflow '+str(width)+' '+key,page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
   page.locator('#workspaceDrawer').evaluate('e=>e.scrollTop=e.scrollHeight');check('drawer scroll does not move map '+str(width),page.locator('#map').bounding_box()['y']==m['y'])
  check('mode navigation preserves retrieved search',page.evaluate('({ids:PublicRadarBridge.getResults().map(r=>r.key),scan:PublicRadarBridge.getMeta().scanId})')==before)
  page.click('#expandMap');check('fullscreen map can still open',page.locator('body').evaluate('e=>e.classList.contains("map-expanded")'));page.keyboard.press('Escape');check('Escape keeps selected mode',page.evaluate('RadarWorkspace.getMode()')=='owners' and not page.locator('body').evaluate('e=>e.classList.contains("map-expanded")'))
  check('no uncaught errors',not errors);page.click('#workspace-tab-scan');page.screenshot(path=str(artifact/'workspace-phone.png'));browser.close()
 print('Workspace browser passed:',len(checks),'checks.')
finally:server.shutdown();server.server_close()
