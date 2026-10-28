"""CEO persona acceptance: exact user phrases, strict geocoder, isolated browser storage."""
from browser_fixture import *
checks=[]
def check(name,value):
    assert value,name
    checks.append(name)
def submit(page,q):
    page.fill('#agentPrompt',q);page.locator('#agentPrompt').press('Enter')
    page.wait_for_function('!document.querySelector("#agentForm button[type=submit]").disabled')
    page.wait_for_timeout(30)
# query, state, type, acreage operator, acres, upper, radius, geocoded town, response action
cases=[
('show me warehouses near me','NJ','industrial','>=',0,None,5,None,'gps'),
('I want to see big industrial lots in edison new jersey','NJ','industrial','>=',0,None,5,'Edison','search'),
("what's for sale in west palm beach",'FL','industrial','>=',0,None,5,'West Palm Beach','search'),
('how do I find land',None,None,None,None,None,None,None,'help'),
('edison','NJ','industrial','>=',0,None,5,'Edison','search'),
('industrial land 10 acres woodbridge nj please','NJ','industrial','>=',10,None,5,'Woodbridge','search'),
('INDUSTIAL LOTS IN EDISSON NJ','NJ','industrial','>=',0,None,5,'Edison','suggest'),
('Where is 5900 Australian Ave West Palm Beach','FL',None,None,None,None,None,'5900 Australian Ave West Palm Beach','address'),
('can you make the print bigger',None,None,None,None,None,None,None,'font'),
('help',None,None,None,None,None,None,None,'help'),
('Give me the top 5 industrial sites over 10 acres in Northern New Jersey','NJ','industrial','>',10,None,5,'Parsippany','search'),
("What's available in Secaucus over 5 acres",'NJ','industrial','>',5,None,5,'Secaucus','search'),
('Anything over 20 acres near the Turnpike in Edison?','NJ','industrial','>',20,None,5,'Edison','search'),
('Compare Edison and Secaucus industrial',None,None,None,None,None,None,None,'compare'),
('Biggest industrial sites in Palm Beach County','FL','industrial','>=',0,None,5,'Palm Beach County','search'),
('Summarize this for the board',None,None,None,None,None,None,None,'board-empty'),
('industrial parcels 4+ acres in North Bergen NJ','NJ','industrial','>=',4,None,5,'North Bergen','search'),
('industrial between 4 and 10 acres in Perth Amboy NJ','NJ','industrial','between',4,10,5,'Perth Amboy','search'),
('IOS sites 3-8 acres near Port Newark','NJ','industrial','between',3,8,5,'Port Newark','search'),
('vacant land over 5 acres in Mangonia Park FL','FL','vacant','>',5,None,5,'Mangonia Park','search'),
('industrial over 10 acres built before 1990 in Edison NJ','NJ','industrial','>',10,None,5,'Edison','search'),
('Lehigh Valley industrial over 50 acres','PA','industrial','>',50,None,5,'Allentown','search'),
('industrial over 25 acres within 2 miles of Allentown PA','PA','industrial','>',25,None,2,'Allentown','search'),
('multifamily over 3 acres in Edison NJ','NJ','multifamily','>',3,None,5,'Edison','search'),
]
try:
 with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=shutil.which('chromium') or p.chromium.executable_path,headless=True,args=['--no-sandbox'])
    mode['persona']=True;mode['ceo']=True
    for q,state,kind,op,acres,upper,radius,place,action in cases:
        mode.pop('fixtureCenter',None)
        context=browser.new_context(permissions=['geolocation'],geolocation={'latitude':40.527,'longitude':-74.363},accept_downloads=True)
        page=context.new_page();page.route('**/*',network)
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(f'http://127.0.0.1:{server.server_port}/')
        parsed=page.evaluate('(q)=>PublicRadarAgent.parseIntent(q)',q)
        submit(page,q)
        if action=='suggest':
            check('typo asks for confirmation',page.get_by_role('button',name='Yes — industrial in Edison, NJ').count()==1)
            check('typo does not start a guessed scan',page.evaluate('PublicRadarBridge.getSearch()===null'))
            page.get_by_role('button',name='Yes — industrial in Edison, NJ').click()
            page.wait_for_function('!document.querySelector("#agentForm button[type=submit]").disabled')
        if action in ['search','gps','suggest']:
            query=page.evaluate('PublicRadarBridge.getSearch()')
            check('search ran for '+q,query is not None)
            check('state/type/size/radius for '+q,query['state']==state and query['type']==kind and query['acreage']['op']==op and query['acreage']['value']==acres and query['acreage'].get('max')==upper and query['radius']==radius)
            if place: check('place for '+q,place.lower() in page.locator('#placeInput').input_value().lower())
            if 'available' in q or 'for sale' in q: check('availability is explicitly unapplied',"I couldn't apply: current sale availability" in page.locator('#agentLog').inner_text())
            if 'Turnpike' in q:check('road proximity is explicitly unapplied',"I couldn't apply: Turnpike proximity" in page.locator('#agentLog').inner_text())
            if 'built before' in q:
                check('published year filter excludes newer and missing years',page.evaluate('PublicRadarBridge.getResults().every(r=>r.yearBuilt!=null&&r.yearBuilt<1990)'))
                check('missing years are separate',page.evaluate('PublicRadarBridge.getYearUnknown().length>0') and page.locator('.year-not-published').count()==1)
        else:
            check('non-search does not run a guessed scan: '+q,page.evaluate('PublicRadarBridge.getSearch()===null'))
            if action=='help':check('help has four tappable examples: '+q,page.locator('.chat-chip').count()==4)
            if action=='compare':check('comparison asks which market to search',page.locator('.chat-chip').count()==2)
            if action=='font':check('text enlarged by chat',page.evaluate('getComputedStyle(document.body).fontSize')=='19px')
            if action=='address':check('address geocoded and parcel identified',page.locator('#details').is_visible() and 'identified at that map point' in page.locator('#agentLog').inner_text())
        if action=='address':check('address parse retains state/place',parsed['state']==state and parsed['address'] and place.lower() in parsed['location'].lower())
        if action in ['help','font','board-empty']:check('non-search parse invents no criteria: '+q,all(parsed[k] is None for k in ['state','type','acres','radius']) and not parsed['location'])
        if action=='compare':check('comparison parse retains both places without a guessed center',len(parsed['places'])==2 and parsed['type']=='industrial' and not parsed['location'])
        text=page.locator('#agentLog').inner_text()
        check('non-canned reply: '+q,'No retrieved parcel results are loaded' not in text and page.locator('#agentLog > :not(.agent-welcome)').count()>0)
        check('no uncaught error: '+q,not errors)
        context.close()
    # All requested follow-ups are tested fresh, both without context and after a known search.
    followups=['the big one','go back','what does that mean','Which of these qualify for OZ2?','Who owns the largest one?','Show only the ones over 20 acres','only over 8 acres','sort by acreage','export these']
    for followup in followups:
        context=browser.new_context(accept_downloads=True);page=context.new_page();page.route('**/*',network);page.goto(f'http://127.0.0.1:{server.server_port}/')
        submit(page,followup)
        check('fresh follow-up is useful: '+followup,'No retrieved parcel results are loaded' not in page.locator('#agentLog').inner_text())
        submit(page,'industrial over 5 acres in Edison NJ');original=page.evaluate('PublicRadarBridge.getSearch()')
        submit(page,'only over 8 acres');current=page.evaluate('PublicRadarBridge.getSearch()')
        if followup=='export these':
            with page.expect_download() as download:submit(page,followup)
            body=Path(download.value.path()).read_text();check('export has public source evidence','source_url' in body and 'Synthetic' in body)
        else:submit(page,followup)
        result=page.evaluate('PublicRadarBridge.getSearch()')
        check('follow-up preserves state/type/place/radius: '+followup,all(result[k]==original[k] for k in ['state','type','center','radius','county']))
        if followup=='go back':check('go back restores previous acreage',result['acreage']==original['acreage'])
        elif followup=='Show only the ones over 20 acres':check('20-acre refinement applied',result['acreage']['value']==20)
        elif followup=='only over 8 acres':check('8-acre refinement applied',result['acreage']['value']==8)
        elif followup=='what does that mean':check('clarification explains the current acreage and type','more than 8 acres' in page.locator('#agentLog .bot').last.inner_text() and 'industrial' in page.locator('#agentLog .bot').last.inner_text())
        elif followup=='the big one':check('largest accepted card opened',page.locator('#details').is_visible() and page.locator('.chat-properties').last.locator('.chat-property-card').count()==1)
        context.close()
    context=browser.new_context();page=context.new_page();page.route('**/*',network);page.goto(f'http://127.0.0.1:{server.server_port}/')
    submit(page,'industrial in Completely Unknown Town NJ')
    check('unknown place cannot become Palm Beach',page.evaluate('PublicRadarBridge.getSearch()===null') and 'No confident US location' in page.locator('#agentLog').inner_text())
    submit(page,'industrial in Edison NJ');submit(page,'Summarize this for the board')
    check('board summary is five evidence lines',len(page.locator('.board-summary').inner_text().splitlines())==5)
    for width in [390,1280]:
        page.set_viewport_size({'width':width,'height':900})
        check('readable layout has no overflow at '+str(width),page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
        check('placeholder fits at '+str(width),page.evaluate('''()=>{const n=document.querySelector('#agentPrompt'),c=document.createElement('canvas').getContext('2d'),s=getComputedStyle(n);c.font=s.font;return c.measureText(n.placeholder).width<=n.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight);}'''))
        check('visible type is at least 15px at '+str(width),page.evaluate('''()=>[...document.querySelectorAll('body *')].filter(n=>n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden').every(n=>parseFloat(getComputedStyle(n).fontSize)>=15)'''))
        check('board reply stays visible after responsive reparenting at '+str(width),page.locator('.board-summary').last.bounding_box()['y']<page.locator('#agentLog').bounding_box()['y']+page.locator('#agentLog').bounding_box()['height'])
    page.screenshot(path='/tmp/radar-sprint1-desktop.png')
    page.set_viewport_size({'width':390,'height':844});page.screenshot(path='/tmp/radar-sprint1-mobile.png')
    # Board shares preserve separately checked reference kinds, never qualification.
    submit(page,'Which of these qualify for OZ1?');submit(page,'Which of these qualify for OZ2?');submit(page,'Summarize this for the board')
    check('board retains OZ1 and OZ2 reference shares', 'OZ1: 5/5' in page.locator('.board-summary').last.inner_text() and 'OZ2: 5/5' in page.locator('.board-summary').last.inner_text())
    submit(page,'industrial newer than 2000 in Edison NJ')
    check('newer-than filter never accepts missing years',page.evaluate('PublicRadarBridge.getResults().length===0&&PublicRadarBridge.getYearUnknown().length===2'))
    check('missing-year parcel still opens for research',page.locator('.year-not-published').count()>0)
    page.locator('.chat-properties').last.get_by_role('button',name='View parcel on satellite',exact=True).first.click()
    check('missing-year details do not join accepted matches',page.locator('#details').is_visible() and page.evaluate('PublicRadarBridge.getResults().length===0'))
    # One-time inline consent and final-transcript preview with a speech test double.
    voice=context.new_page();voice.route('**/*',network)
    voice.add_init_script("""window.confirm=()=>{throw Error('No modal consent permitted')};window.voiceStarts=0;window.SpeechRecognition=class {start(){voiceStarts++;if(window.voiceThrows)throw Error('Unavailable');queueMicrotask(()=>{this.onresult({resultIndex:0,results:[Object.assign([{transcript:'industrial 5 acres in Edison NJ'}],{isFinal:true})]});this.onend()})}}""")
    voice.goto(f'http://127.0.0.1:{server.server_port}/');voice.click('#agentMic')
    check('voice waits for inline consent',voice.evaluate('voiceStarts===0') and voice.locator('#voiceConsent').is_visible())
    voice.get_by_role('button',name='Allow voice',exact=True).click()
    check('consent is remembered locally',voice.evaluate("localStorage.getItem('capital-radar-voice-consent-v1')==='allow'"))
    voice.wait_for_selector('#voicePreview');voice.wait_for_timeout(400)
    check('final speech previews without an immediate scan',voice.evaluate('PublicRadarBridge.getSearch()===null') and 'Searching for:' in voice.locator('#voicePreview').inner_text())
    voice.click('#voicePreview');voice.wait_for_timeout(2100)
    check('tap-to-edit cancels automatic submission',voice.evaluate('PublicRadarBridge.getSearch()===null') and voice.locator('#voicePreview').count()==0)
    voice.click('#agentMic');voice.wait_for_selector('#voicePreview');voice.wait_for_timeout(500)
    check('preview remains visible before two seconds',voice.evaluate('PublicRadarBridge.getSearch()===null'))
    voice.wait_for_function('PublicRadarBridge.getMeta().complete')
    check('final speech automatically searches the previewed words',voice.evaluate('PublicRadarBridge.getSearch().type==="industrial"&&PublicRadarBridge.getSearch().acreage.value===5'))
    voice.reload();voice.evaluate('window.voiceThrows=true');voice.click('#agentMic')
    check('reload uses saved consent without a modal',voice.locator('#voiceConsent').count()==0 and voice.evaluate('voiceStarts===1'))
    check('speech start failure restores typing','Voice input could not start' in voice.locator('#agentLog').inner_text())
    blocked=browser.new_context();no_storage=blocked.new_page();no_storage.route('**/*',network)
    no_storage.add_init_script("""Storage.prototype.getItem=function(){throw Error('Storage unavailable')};Storage.prototype.setItem=function(){throw Error('Storage unavailable')};window.SpeechRecognition=class {start(){queueMicrotask(()=>this.onend())}}""")
    no_storage.goto(f'http://127.0.0.1:{server.server_port}/');no_storage.click('#agentMic');no_storage.get_by_role('button',name='Allow voice',exact=True).click();no_storage.click('#agentMic')
    check('storage exceptions still remember consent for this tab',no_storage.locator('#voiceConsent').count()==0)
    no_storage.click('#textLarger');check('text controls work when storage is blocked',no_storage.evaluate('getComputedStyle(document.body).fontSize')=='19px')
    blocked.close()
    browser.close()
 print('Sprint 1 browser suite passed:',len(checks),'persona/follow-up/readability checks (synthetic public fixtures).')
finally:
 server.shutdown();server.server_close()
