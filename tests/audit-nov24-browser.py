"""Checks for the Nov 24 audit: the Search area and filters drawer fits the rail on a dark panel, OZ 2.0 wording says
designated, the 2018 comparison filters cover all 130 tracts with one label set, and check dates are stated separately."""
from browser_fixture import *
checks=[]
def check(label,value):assert value,label;checks.append(label)
SIMPLE="try{sessionStorage.removeItem('radar_ui_mode')}catch(e){}"
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=chromium_executable(p),headless=True,args=['--no-sandbox'])
  base=f'http://127.0.0.1:{server.server_port}/'
  for width in (1366,375):
   page=browser.new_page(viewport={'width':width,'height':900});page.add_init_script(SIMPLE+"; localStorage.setItem('capital-radar-font-size','19')");page.route('**/*',network);page.goto(base);unlock(page)
   page.wait_for_function('document.body.classList.contains("radar-v34")')
   page.evaluate("for(const id of ['filterDrawer','executiveScanControls','publicParcelFilters'])document.getElementById(id).open=true")
   info=page.evaluate(r'''()=>{
     const luminance=color=>{const m=color.match(/[\d.]+/g).map(Number);if(m[3]===0)return null;
       const [r,g,b]=m.slice(0,3).map(n=>{const x=n/255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4});
       return .2126*r+.7152*g+.0722*b;};
     const bgOf=e=>{for(let n=e;n;n=n.parentElement){const l=luminance(getComputedStyle(n).backgroundColor);if(l!==null)return l}return 1};
     const d=document.getElementById('filterDrawer'),box=d.getBoundingClientRect();
     const shown=[...d.querySelectorAll('label,select,input:not([type=checkbox]),button,summary,h2,h3,p')].filter(e=>e.getClientRects().length&&!e.matches(':disabled'));
     const canvas=document.createElement('canvas').getContext('2d');
     const clipped=[...d.querySelectorAll('select')].filter(e=>{
       if(!e.getClientRects().length)return false;
       const style=getComputedStyle(e);canvas.font=style.font;
       return canvas.measureText(e.selectedOptions[0]?.textContent||'').width+parseFloat(style.paddingLeft)+parseFloat(style.paddingRight)+16>e.clientWidth;
     }).map(e=>e.id);
     return {font:getComputedStyle(document.body).fontSize,
       overflow:shown.filter(e=>{const r=e.getBoundingClientRect();return r.right>box.right+1||r.left<box.left-1}).map(e=>e.id||e.textContent.trim().slice(0,20)),
       lowContrast:shown.filter(e=>{const f=luminance(getComputedStyle(e).color),b=bgOf(e);return (Math.max(f,b)+.05)/(Math.min(f,b)+.05)<4.5}).map(e=>e.id||e.textContent.trim().slice(0,20)),
       light:[...d.querySelectorAll('form,.toolbar,.geo-row,#publicParcelFilters,select,input:not([type=checkbox])')].filter(e=>e.getClientRects().length&&bgOf(e)>.6).map(e=>e.id||e.className),
       clipped,sideways:[...document.querySelectorAll('#workspaceDrawer,#scanner,#filterDrawer')].filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>e.id)};}''')
   check(f'{width}px: tested at default 19px',info['font']=='19px')
   check(f'{width}px: no controls overflow the panel '+str(info['overflow']),info['overflow']==[])
   check(f'{width}px: text contrast is at least 4.5:1 '+str(info['lowContrast']),info['lowContrast']==[])
   check(f'{width}px: no light subpanel '+str(info['light']),info['light']==[])
   check(f'{width}px: selected values fit '+str(info['clipped']),info['clipped']==[])
   check(f'{width}px: no horizontal overflow '+str(info['sideways']),info['sideways']==[])
   if os.environ.get('RADAR_AUDIT_SCREENSHOTS'):
    page.locator('#executiveScanForm').scroll_into_view_if_needed()
    page.screenshot(path=f'/tmp/radar-ceo-{width}-primary.png')
    page.locator('#market').scroll_into_view_if_needed()
    page.screenshot(path=f'/tmp/radar-ceo-{width}-options.png')
   page.close()
  page=browser.new_page(viewport={'width':1366,'height':900});page.add_init_script(SIMPLE+"; localStorage.setItem('capital-radar-font-size','19')");page.route('**/*',network);page.goto(base);unlock(page)
  page.wait_for_function('document.body.classList.contains("radar-v34")');page.locator('.v34-nav [data-view="data"]').click()
  page.wait_for_function("document.querySelectorAll('.oz-cohort').length>=5&&/designated by U\\.S\\. Treasury/.test(document.getElementById('ozEvidence').textContent)",timeout=20000)
  page.evaluate("for(const d of document.querySelectorAll('details'))d.open=true");page.wait_for_timeout(600)
  inventory=page.locator('#ozInventory').inner_text()
  check('the OZ inventory controls say designated, not nominated',not re.search(r'\bnominat',inventory,re.I))
  bar=page.evaluate("[...document.querySelectorAll('.oz-cohort')].map(b=>b.textContent)")
  counts=[int(re.search(r'\((\d+)\)',t).group(1)) for t in bar]
  check('the 2018 filter buttons after "All" add up to all 130 tracts',counts==[130,36,27,66,1] and sum(counts[1:])==130)
  check('the filter bar uses the same names as the parcel card badges',bar[1].startswith('Brand-new 2026') and bar[2].startswith('Partly a 2018 zone') and bar[3].startswith('Retained 2018 zone') and bar[4].startswith('2018 overlap not measured') and not any('Mostly' in t for t in bar))
  unknown=page.locator('#ozCohortBar [data-cohort="unknown"]')
  unknown.click()
  check('unknown cohort shows exactly one tract',page.evaluate('RadarOZInventory.getState().filteredTracts')==1 and unknown.get_attribute('aria-pressed')=='true')
  label=page.evaluate("RadarOZ2Designations.COHORT.retained")
  check('the retained button and parcel badge share one label',bar[3]==label+' (66)' and page.evaluate("RadarOZ2Designations.badges('34001000400').some(b=>b.text==='Retained 2018 zone')"))
  status=page.locator('#ozRoundComparisonStatus').inner_text()
  check('the comparison summary states all four groups in plain dates','130 designated OZ 2.0 tracts' in status and '36 brand-new' in status and '66 retained' in status and '27 partly' in status and '1 not measured' in status and not re.search(r'\d{4}-\d{2}-\d{2}T',status))
  evidence=page.locator('#ozEvidence').inner_text()
  check('the designation date and the state-list read date are stated separately',re.search(r'designated by U\.S\. Treasury on Nov 5, 2026 \(release SB0682; effective Jan 1, 2027\), last confirmed 2026-\d\d-\d\d\.',evidence) and 'Boundary input: NJ DCA tract snapshot dated 2026-11-02' in evidence and 'Checked 2026-11-02; evidence valid' not in evidence)
  confirmed=page.evaluate("RadarOZ2Designations.meta().source.confirmedAt")
  check('the designation confirmation date is on or after the Nov 5 release',confirmed>='2026-11-05')
  page.close();browser.close()
 print(f'Nov 24 audit suite passed: {len(checks)} checks.')
finally:
 server.shutdown()
