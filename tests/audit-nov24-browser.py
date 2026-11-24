"""Checks for the Nov 24 audit: the Search area and filters drawer fits the rail on a dark panel, OZ 2.0 wording says
designated, the 2018 comparison filters cover all 130 tracts with one label set, and check dates are stated separately."""
from browser_fixture import *
checks=[]
def check(label,value):assert value,label;checks.append(label)
SIMPLE="try{sessionStorage.removeItem('radar_ui_mode')}catch(e){}"
LUM="(c)=>{const m=c.match(/[\\d.]+/g).map(Number);return (m[3]===0)?null:(0.2126*m[0]+0.7152*m[1]+0.0722*m[2])}"
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=chromium_executable(p),headless=True,args=['--no-sandbox'])
  base=f'http://127.0.0.1:{server.server_port}/'
  for width in (1366,390):
   page=browser.new_page(viewport={'width':width,'height':900});page.add_init_script(SIMPLE);page.route('**/*',network);page.goto(base);unlock(page)
   page.wait_for_function('document.body.classList.contains("radar-v34")');page.evaluate("document.getElementById('filterDrawer').open=true");page.wait_for_timeout(400)
   info=page.evaluate("""()=>{const lum="""+LUM+""",d=document.getElementById('filterDrawer'),box=d.getBoundingClientRect();
     const bgOf=e=>{for(let n=e;n;n=n.parentElement){const l=lum(getComputedStyle(n).backgroundColor);if(l!==null)return l}return 255};
     const shown=[...d.querySelectorAll('label,select,input:not([type=checkbox]),button,h2,h3,p')].filter(e=>e.getClientRects().length);
     return {overflow:shown.filter(e=>{const r=e.getBoundingClientRect();return r.right>box.right+1||r.left<box.left-1}).map(e=>e.id||e.textContent.trim().slice(0,20)),
       lowContrast:shown.filter(e=>Math.abs(lum(getComputedStyle(e).color)-bgOf(e))<110).map(e=>e.id||e.textContent.trim().slice(0,20)),
       light:[...d.querySelectorAll('*')].filter(e=>e.getClientRects().length&&lum(getComputedStyle(e).backgroundColor)>200&&e.type!=='checkbox').map(e=>e.id||e.className),
       clipped:[...d.querySelectorAll('select')].filter(e=>e.getClientRects().length&&e.getBoundingClientRect().width<150).map(e=>e.id),
       sideways:[...document.querySelectorAll('#workspaceDrawer,#scanner,body')].filter(e=>e.scrollWidth>e.clientWidth+2&&getComputedStyle(e).overflowX!=='hidden'&&getComputedStyle(e).overflowX!=='clip').map(e=>e.id||e.tagName)}}""")
   check(f'{width}px: no search-panel control runs past the panel edge',info['overflow']==[])
   check(f'{width}px: every label and field is readable against its background',info['lowContrast']==[])
   check(f'{width}px: the panel has no white sub-panel or white field',info['light']==[])
   check(f'{width}px: dropdowns are wide enough to show their value',info['clipped']==[])
   check(f'{width}px: the left rail has no horizontal scrollbar',info['sideways']==[])
   page.close()
  page=browser.new_page(viewport={'width':1366,'height':900});page.add_init_script(SIMPLE);page.route('**/*',network);page.goto(base);unlock(page)
  page.wait_for_function('document.body.classList.contains("radar-v34")');page.locator('.v34-nav [data-view="data"]').click()
  page.wait_for_function("document.querySelectorAll('.oz-cohort').length>=5&&/designated by U\\.S\\. Treasury/.test(document.getElementById('ozEvidence').textContent)",timeout=20000)
  page.evaluate("for(const d of document.querySelectorAll('details'))d.open=true");page.wait_for_timeout(600)
  inventory=page.locator('#ozInventory').inner_text()
  check('the OZ inventory controls say designated, not nominated',not re.search(r'\bnominat',inventory,re.I))
  bar=page.evaluate("[...document.querySelectorAll('.oz-cohort')].map(b=>b.textContent)")
  counts=[int(re.search(r'\((\d+)\)',t).group(1)) for t in bar]
  check('the 2018 filter buttons after "All" add up to all 130 tracts',counts[0]==130 and sum(counts[1:])==130 and len(bar)==5)
  check('the filter bar uses the same names as the parcel card badges',bar[1].startswith('Brand-new 2026') and bar[2].startswith('Partly a 2018 zone') and bar[3].startswith('Retained 2018 zone') and bar[4].startswith('2018 overlap not measured') and not any('Mostly' in t for t in bar))
  status=page.locator('#ozRoundComparisonStatus').inner_text()
  check('the comparison summary states all four groups in plain dates','130 designated OZ 2.0 tracts' in status and '36 brand-new' in status and '66 retained' in status and '27 partly' in status and '1 not measured' in status and not re.search(r'\d{4}-\d{2}-\d{2}T',status))
  evidence=page.locator('#ozEvidence').inner_text()
  check('the designation date and the state-list read date are stated separately',re.search(r'designated by U\.S\. Treasury on Nov 5, 2026 \(release SB0682; effective Jan 1, 2027\), last confirmed 2026-\d\d-\d\d\.',evidence) and 'NJ state nomination layer, read 2026-11-02' in evidence and 'Checked 2026-11-02; evidence valid' not in evidence)
  confirmed=page.evaluate("RadarOZ2Designations.meta().source.confirmedAt")
  check('the designation confirmation date is on or after the Nov 5 release',confirmed>='2026-11-05')
  page.close();browser.close()
 print(f'Nov 24 audit suite passed: {len(checks)} checks.')
finally:
 server.shutdown()
