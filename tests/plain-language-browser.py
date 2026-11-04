"""Executives and brokers type like people: follow-ups, broker shorthand, ZIPs, parcel IDs, vague questions.
Synthetic fixtures; the live equivalent is scripts/live-persona-check.py."""
from browser_fixture import *
checks=[]
def check(name,value):assert value,name;checks.append(name)
def idle(page):page.wait_for_function('!document.querySelector("#agentForm button[type=submit]").disabled',timeout=60000);page.wait_for_timeout(300)
def say(page,text,typed=False):
 idle(page)
 # The chat log is capped, so mark the last message instead of counting items.
 page.evaluate("()=>{document.querySelectorAll('#agentLog [data-mark]').forEach(e=>e.removeAttribute('data-mark'));document.getElementById('agentLog').lastElementChild?.setAttribute('data-mark','1');return true}")
 if typed:page.click('#agentPrompt');page.keyboard.type(text,delay=5);page.keyboard.press('Enter')
 else:page.fill('#agentPrompt',text);page.press('#agentPrompt','Enter')
 page.wait_for_timeout(400);idle(page);page.wait_for_timeout(300)
 return page.evaluate("()=>{const out=[];let e=document.querySelector('#agentLog [data-mark]');e=e?e.nextElementSibling:document.getElementById('agentLog').firstElementChild;while(e){out.push(e.innerText);e=e.nextElementSibling}return out.join('\\n')}")
CATCH_ALL='records in the retrieved source results match this question'
try:
 with sync_playwright() as p:
  mode['persona']=True
  browser=p.chromium.launch(executable_path=chromium_executable(p),headless=True,args=['--no-sandbox']);page=browser.new_page();page.route('**/*',network);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:{server.server_port}/');unlock(page)
  # 1. Typing a follow-up into the box must never splice it into the previous message.
  say(page,'Industrial over 5 acres in Edison NJ',typed=True)
  check('chat box is empty after sending',page.input_value('#agentPrompt')=='')
  say(page,'who owns the largest one',typed=True)
  users=page.locator('#agentLog .agent-message.user').all_inner_texts()
  check('second typed question arrives intact',users[-1].strip()=='who owns the largest one' and not any('acwho' in u for u in users))
  # 2. Broker acreage and building size.
  log=say(page,'show me industrial land edison nj 10 acre')
  check('"10 acre" searches at least 10 acres, not exactly 10.00',bool(re.search(r'at least 10 acres',log)) and 'with exactly' not in log)
  log=say(page,'50k sf building Edison NJ')
  check('building square footage is acknowledged, not silently dropped','do not include building size' in log)
  # 3. Questions the scan cannot answer get an honest reply, never an unrelated list.
  for q in ['what does it all mean for my taxes','is the neighborhood nice','can you tell me more']:
   log=say(page,q);check('honest fallback for: '+q,CATCH_ALL not in log and 'did not recognize a supported property filter' in log)
  log=say(page,'whats the owners phone number');check('contact question explains no phone/email data',"doesn't have owner phone numbers or emails" in log and CATCH_ALL not in log)
  log=say(page,'how much is it worth');check('value question shows labeled tax-record values',('Published tax-record values' in log or 'assessment figures' in log) and 'not market value' in log)
  for q in ['QOZ?','opp zone?','is this in one of those new tax break zones']:
   log=say(page,q);check('OZ phrasing routes to the official check: '+q,CATCH_ALL not in log and ('nominat' in log.lower() or 'opportunity' in log.lower()))
  log=say(page,'only the ones near the highway');check('highway filter request explains the limit',"isn't a search filter yet" in log)
  log=say(page,'explain that in plain english');check('plain-English request reaches the explanation',CATCH_ALL not in log)
  log=say(page,'start over');check('start over clears results',('Cleared' in log) and page.evaluate('PublicRadarBridge.getResults().length')==0)
  # 4. Lookups people paste.
  log=say(page,'industrial in 08817');check('ZIP becomes its town','ZIP 08817 is Edison, NJ' in log and page.evaluate('PublicRadarBridge.getResults().length')>0)
  log=say(page,'Block 7 Lot 2 Edison NJ');check('NJ block and lot resolve to the published address','Block 7 Lot 2 in Edison Twp is published at 25 Synthetic Way, Edison, NJ' in log)
  log=say(page,'Block 999 Lot 1 Edison NJ');check('unknown block/lot is reported, not guessed','has no Block 999 Lot 1' in log)
  log=say(page,'PCN 00-42-43-27-05-006-4201');check('Palm Beach PCN resolves to its address','published at 7777 Southern Blvd, West Palm Beach, FL' in log)
  log=say(page,'cold storage over 100000 sf in New Jersey');check('statewide request is explained','Statewide searches are not available' in log)
  log=say(page,'any dirt over 20 acres in Monmouth');check('county without "County" stays in NJ and reads dirt as vacant','Monmouth County, NJ' in log and 'vacant land' in log and ' OR.' not in log)
  log=say(page,'https://maps.app.goo.gl/AbCdEf123');check('short map links ask for the address','Paste the street address' in log)
  log=say(page,'');check('empty send does nothing harmful',not errors)
  page.set_viewport_size({'width':390,'height':844});check('fits a phone',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
  check('no uncaught browser errors',not errors);browser.close()
 print('Plain-language suite passed:',len(checks),'checks.')
finally:server.shutdown();server.server_close()
