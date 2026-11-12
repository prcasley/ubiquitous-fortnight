"""Executive cards retain evidence roles, accessible actions and original source controls."""
from browser_fixture import *
checks=[]
def check(name,value):assert value,name;checks.append(name)
try:
 mode['ceo']=True;mode['persona']=True
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=chromium_executable(p),headless=True,args=['--no-sandbox']);page=browser.new_page(viewport={'width':1280,'height':900});errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('**/*',network);page.goto(f'http://127.0.0.1:{server.server_port}/');unlock(page)
  page.fill('#agentPrompt','Industrial over 5 acres in Edison NJ');page.press('#agentPrompt','Enter');page.wait_for_function('!document.querySelector("#agentForm [type=submit]").disabled')
  card=page.locator('.chat-property-card').first
  check('chat facts lead while complete original source records remain collapsed',card.locator(':scope > .executive-facts').count()==1 and not card.locator(':scope > .executive-technical').evaluate('e=>e.open') and 'Parcel ' in card.locator('.executive-technical').text_content())
  key=card.get_attribute('data-parcel-key');page.evaluate('(key)=>{const r=PublicRadarBridge.getRecord(key);r.publishedOwner={status:"published",publishedName:"SYNTHETIC EXECUTIVE LLC",sourceURL:"https://county.example/exact-record",sourceName:"Synthetic county",retrievedAt:new Date().toISOString()};r.landValue=1000000;r.improvementValue=0;r.assessedValue=1000000;RadarExecutiveCards.refresh(r)}',key)
  page.wait_for_function('document.querySelector(".executive-identity").textContent.includes("SYNTHETIC EXECUTIVE LLC")')
  check('bold name retains exact assessment evidence in footer',card.locator('.card-source-box a[href="https://county.example/exact-record"]').count()==1 and card.locator('.executive-identity strong').evaluate('e=>parseFloat(getComputedStyle(e).fontSize)')>=22)
  check('contacts precede acreage and footer is last',card.evaluate('e=>{const f=e.querySelector(".executive-facts");return f.children[1].classList.contains("executive-identity")&&f.children[2].classList.contains("executive-contact-actions")&&e.lastElementChild.classList.contains("card-source-box")}'))
  check('V3.4 header and desktop detail column',page.title().endswith('V3.4') and page.locator('.v34-nav').is_visible())
  check('late evidence refresh preserves the active contact control',page.evaluate('(key)=>{const card=document.querySelector(".chat-property-card"),button=card.querySelector(".executive-contact-actions button");RadarExecutiveCards.refresh(PublicRadarBridge.getRecord(key));return !!button&&button===card.querySelector(".executive-contact-actions button")}',key))
  page.evaluate('(key)=>PublicRadarBridge.choose(key)',key)
  check('desktop detail sits beside the map',page.locator('#details').bounding_box()['x']>=page.locator('#map').bounding_box()['x']+page.locator('#map').bounding_box()['width']-2)
  page.locator('.v34-star').click();page.locator('[data-view=stars]').click();check('starred property can be reopened',page.locator('#v34ListView').is_visible() and page.locator('.v34-saved-row').count()==1);page.locator('.v34-saved-row button').first.click()
  check('real zero improvements do not become an OZ legal hurdle','$0' in page.locator('#details .executive-metrics').inner_text() and 'Building' in page.locator('#details .executive-metrics').inner_text() and 'OZ Building Hurdle' not in card.inner_text())
  check('address has high contrast',card.locator('.executive-card-heading h3').evaluate('e=>getComputedStyle(e).color')=='rgb(11, 41, 66)')
  check('selected parcel uses the same executive card and keeps close control',page.locator('#details > .executive-facts').count()==1 and page.locator('#closeDetail').is_visible())
  page.evaluate('(key)=>{const r=PublicRadarBridge.getRecord(key);r.ozObservations={ozNJ:{kind:"ozNJ",status:"partial-overlap",overlapPercent:.08}};document.dispatchEvent(new CustomEvent("radar:oz-updated",{detail:{scanId:PublicRadarBridge.getMeta().scanId,keys:[key],observations:[]}}))}',key)
  check('late OZ updates show boundary review, never a positive nomination', 'review needed' in card.locator('.executive-oz').inner_text() and 'NJ-nominated' not in card.locator('.executive-oz').inner_text())
  page.evaluate('(key)=>{RadarOwnership.reviewedContacts=()=>[{name:"SYNTHETIC BUSINESS CONTACT",role:"Broker",phone:"(555) 123-4567",email:"test@example.com",sourceURL:"https://business.example/contact"}];RadarExecutiveCards.refresh(PublicRadarBridge.getRecord(key))}',key)
  check('reviewed business routes have safe one-tap call/email links',card.locator('a[href="tel:5551234567"]').count()==1 and card.locator('a[href="mailto:test@example.com"]').count()==1 and 'reviewed by user' in card.locator('.executive-contact-actions').inner_text())
  page.evaluate('(key)=>{const r=PublicRadarBridge.getRecord(key);r.state="NJ";window.RadarExecutiveVault.getExecutiveRecordForParcel=()=>({company:"SYNTHETIC VAULT CO",officers:["SYNTHETIC OFFICER"],phones:["555-222-3333"],fieldSources:{}});window.RadarContactOptions={render:host=>{host.textContent="LIVE LOOKUP";}};RadarExecutiveCards.refresh(r)}',key)
  check('unprotected NJ card shows vault contact and live lookup',card.locator('.executive-vault-contact').count()==1 and card.locator('.executive-live-contacts').count()==1)
  check('unverified phone is bold plain text',card.locator('.executive-needs-review strong').inner_text()=='555-222-3333' and card.locator('a[href="tel:5552223333"]').count()==0)
  page.evaluate('(key)=>{const r=PublicRadarBridge.getRecord(key);r.publishedOwner={status:"not-published",protectedName:true,message:"Owner name protected"};RadarExecutiveCards.refresh(r)}',key)
  check('protection arriving later removes vault contact, reviewed contacts and live lookup',card.locator('.executive-vault-contact').count()==0 and card.locator('.executive-live-contacts').count()==0 and card.locator('a[href="tel:5551234567"]').count()==0 and card.locator('a[href="tel:555-222-3333"],a[href="tel:5552223333"]').count()==0)
  page.locator('#closeDetail').click()
  for width in [1280,390,360]:
   page.set_viewport_size({'width':width,'height':900});check('no horizontal overflow '+str(width),page.evaluate('document.documentElement.scrollWidth<=innerWidth'));check('main address and acreage have large type '+str(width),card.locator('.executive-card-heading h3').evaluate('e=>parseFloat(getComputedStyle(e).fontSize)')>=22)
  page.evaluate('(key)=>PublicRadarBridge.choose(key)',key);page.wait_for_timeout(100);check('phone selection leaves map toolbar accessible',page.locator('#details').bounding_box()['y']>=page.locator('#mapPanel .panel-head').bounding_box()['y']+page.locator('#mapPanel .panel-head').bounding_box()['height']);page.locator('#closeDetail').click()
  card.locator(':scope > .executive-technical > summary').click();check('source drawer can be opened',card.locator(':scope > .executive-technical').evaluate('e=>e.open'))
  artifact=Path(os.environ.get('RADAR_BROWSER_ARTIFACT_DIR','/tmp/radar-executive-card-artifacts'));artifact.mkdir(parents=True,exist_ok=True);page.evaluate('RadarWorkspace.setSnap(90)');card.locator('.executive-facts').evaluate('e=>{const d=document.getElementById("workspaceDrawer");d.scrollTop+=e.getBoundingClientRect().top-d.getBoundingClientRect().top-8}');page.screenshot(path=str(artifact/'executive-card-phone.png'))
  assert not errors,errors
  check('no uncaught browser errors',not errors);browser.close()
 print('Executive cards passed:',len(checks),'checks')
finally:server.shutdown();server.server_close()
