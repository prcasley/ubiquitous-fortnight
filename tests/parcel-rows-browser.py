"""Compact parcel rows: the simple view lists results as short rows that open into the full card; All tools is unchanged."""
from browser_fixture import *
checks=[]
def check(label,value):assert value,label;checks.append(label)
SIMPLE="try{sessionStorage.removeItem('radar_ui_mode')}catch(e){}"
def search(page):
 page.fill('#agentPrompt','industrial over 2 acres near Edison NJ');page.locator('#agentPrompt').press('Enter')
 page.wait_for_function('!document.querySelector("#agentForm [type=submit]").disabled',timeout=60000);page.wait_for_function("document.querySelectorAll('#agentLog .chat-property-card .parcel-row').length>0");page.wait_for_timeout(800)
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=chromium_executable(p),headless=True,args=['--no-sandbox'])
  base=f'http://127.0.0.1:{server.server_port}/'
  for width,height in ((1366,900),(390,844)):
   page=browser.new_page(viewport={'width':width,'height':height});page.add_init_script(SIMPLE);page.route('**/*',network);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(base);unlock(page);page.wait_for_function('document.body.classList.contains("radar-v34")');search(page)
   cards=page.evaluate("""()=>[...document.querySelectorAll('#agentLog .chat-property-card')].map(c=>{const r=c.querySelector(':scope > .parcel-row'),b=c.getBoundingClientRect();return {collapsed:c.dataset.collapsed,height:b.height,right:b.right,lines:[...r.querySelectorAll('.parcel-row-line')].map(x=>x.textContent),expanded:r.getAttribute('aria-expanded'),visibleOther:[...c.children].filter(x=>x!==r&&x.getClientRects().length).length,card:[c.querySelector('.executive-card-heading h3').textContent,c.querySelector('.executive-glance').textContent]}})""")
   check(f'{width}px: every result starts as a collapsed row',len(cards)>=3 and all(c['collapsed']=='true' and c['expanded']=='false' and c['visibleOther']==0 for c in cards))
   check(f'{width}px: a collapsed row is short enough to skim',all(c['height']<=120 for c in cards))
   check(f'{width}px: the row repeats the card address and its size, use and OZ line',all(c['lines'][0]==c['card'][0] and c['lines'][1]==c['card'][1] and re.search(r'\d AC · ',c['lines'][1]) for c in cards))
   check(f'{width}px: a row with no lead says so instead of guessing',all(c['lines'][2]=='No owner or contact on file yet' or ': ' in c['lines'][2] for c in cards))
   check(f'{width}px: rows stay inside the screen',all(c['right']<=width+1 for c in cards))
   first=page.locator('#agentLog .chat-property-card').first;first.locator(':scope > .parcel-row').click()
   check(f'{width}px: selecting a row opens that card only',first.get_attribute('data-collapsed')=='false' and first.locator(':scope > .executive-facts').is_visible() and first.get_by_role('button',name='Research owner & contact routes').first.is_visible() and page.locator('#agentLog .chat-property-card[data-collapsed=false]').count()==1)
   first.locator(':scope > .parcel-row').click();check(f'{width}px: selecting it again closes it',first.get_attribute('data-collapsed')=='true')
   page.get_by_role('button',name='Expand all',exact=True).click();check(f'{width}px: Expand all opens every card',page.locator('#agentLog .chat-property-card[data-collapsed=true]').count()==0)
   page.get_by_role('button',name='Collapse all',exact=True).click();check(f'{width}px: Collapse all closes every card',page.locator('#agentLog .chat-property-card[data-collapsed=false]').count()==0)
   # An unlocked contact record leads the row with its role label; an owner-only record shows the county tax list owner.
   page.evaluate("""()=>{const rows=PublicRadarBridge.getResults(),recs={[rows[0].id]:{company:'SYNTHETIC CARRIER LLC',phones:['555-222-3333'],fieldSources:{'555-222-3333':'https://source.example/filing'},sourceUrls:['https://source.example/filing'],evidenceRole:'Registered USDOT carrier at this address (occupant, not owner)'},[rows[1].id]:{company:'',evidenceRole:'County tax-list assessment owner (not a deed search)',assessmentOwner:{name:'SYNTHETIC HOLDINGS LP',dataAsOf:'11/16/26',url:'https://county.example/record'}}};
     window.RadarExecutiveVault.getExecutiveRecordForParcel=id=>recs[id]||null;for(const r of rows)RadarExecutiveCards.refresh(r);}""");page.wait_for_timeout(700)
   leads=page.evaluate("[...document.querySelectorAll('#agentLog .chat-property-card > .parcel-row')].map(r=>[r.dataset.lead,r.querySelector('.parcel-row-lead').textContent])")
   check(f'{width}px: a contact record leads its row with the role label and phone',leads[0]==['yes','Registered USDOT carrier at this address (occupant, not owner): SYNTHETIC CARRIER LLC · Call 555-222-3333'])
   check(f'{width}px: an owner-only record shows the county tax list owner, labelled',leads[1][0]=='yes' and 'SYNTHETIC HOLDINGS LP' in leads[1][1] and 'County tax-list assessment owner' in leads[1][1])
   check(f'{width}px: a parcel without a record still says none on file',leads[2]==['no','No owner or contact on file yet'])
   # A second list for the same search replaces the first as the current answer; the earlier one folds to its heading.
   page.evaluate("RadarChatProperties.render(PublicRadarBridge.getResults().slice(0,1),PublicRadarBridge.getMeta())");page.wait_for_timeout(500)
   state=page.evaluate("[...document.querySelectorAll('#agentLog .chat-properties')].map(s=>[s.classList.contains('superseded'),s.querySelector(':scope > strong').textContent,[...s.querySelectorAll('.parcel-row')].filter(r=>r.getClientRects().length).length])")
   check(f'{width}px: an earlier list for the same search is marked and folded',len(state)==2 and state[0][0] and state[0][1].startswith('Earlier list — ') and state[0][2]==0 and not state[1][0] and state[1][2]==1)
   search(page);page.wait_for_function("document.querySelectorAll('#agentLog .chat-properties.previous-search').length>=1")
   state=page.evaluate("[...document.querySelectorAll('#agentLog .chat-properties')].map(s=>[s.classList.contains('previous-search'),[...s.querySelectorAll('.parcel-row')].filter(r=>r.getClientRects().length).length])")
   check(f'{width}px: lists from a previous search fold; only the current one shows rows',all(n==0 for prev,n in state if prev) and [n for prev,n in state if not prev]==[3])
   check(f'{width}px: no page errors',not errors);page.close()
  # All tools keeps the full cards.
  page=browser.new_page(viewport={'width':1366,'height':900});page.route('**/*',network);page.goto(base);unlock(page);page.wait_for_function('document.body.classList.contains("radar-v34")');search(page)
  check('All tools shows full cards and no compact row',page.locator('#agentLog .chat-property-card .parcel-row').first.is_hidden() and page.locator('#agentLog .chat-property-card .executive-facts').first.is_visible() and page.get_by_role('button',name='Expand all',exact=True).count()==0 or page.get_by_role('button',name='Expand all',exact=True).first.is_hidden())
  page.close();browser.close()
 print(f'Parcel rows suite passed: {len(checks)} checks.')
finally:
 server.shutdown()
