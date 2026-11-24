"""Post-unlock property recommendations through connected market adapters."""
from browser_fixture import *

archive = {
    'format':'RadarRecoveredReference','version':1,'sourceFile':'synthetic.html',
    'fileGeneratedAt':'2026-09-28','groups':[{'id':'lehigh','label':'Lehigh Valley'}],
    'records':[
        {'archiveKey':'a','group':'lehigh','state':'PA','pcn':'A','point':[-75.75,40.54],'rings':[]},
        {'archiveKey':'b','group':'lehigh','state':'PA','pcn':'B','point':[-75.16,40.85],'rings':[]}
    ], 'municipalOverlays':[],'ozReference':[]
}
def routes(route):
    if route.request.url.endswith('/assets/data/recovered-reference.json'):
        respond(route,archive)
    else:
        network(route)

try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=chromium_executable(p),headless=True,args=['--no-sandbox'])
        page=browser.new_page(viewport={'width':1440,'height':900})
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.route('**/*',routes)
        page.goto(f'http://127.0.0.1:{server.server_port}/')
        panel=page.locator('#propertyPlay')
        assert not panel.is_visible()
        unlock(page)
        page.wait_for_function("RadarArchive.getVisible().length===2")
        page.wait_for_timeout(400)
        # The map opens on the market the menu and status line name (Central New Jersey), not on the Pennsylvania reference pins.
        assert page.locator('#market').input_value()=='njcentral'
        assert page.evaluate("(()=>{const c=PublicRadarBridge.getMap().getCenter();return Math.abs(c.lat-40.527)<0.05&&Math.abs(c.lng+74.363)<0.05&&PublicRadarBridge.getMap().getZoom()===12})()")
        assert page.locator('#basemap').input_value()=='satellite'
        assert page.locator('#archiveShowPoints').is_checked()
        assert page.evaluate('PublicRadarBridge.getResults().length===0')
        page.get_by_role('button',name='Choose a market for Play').click()
        market=panel.get_by_label('Market')
        result=panel.locator('.property-play-result')
        for area,state in [('northampton','PA'),('njcentral','NJ'),('palm','FL')]:
            mode['persona']=state=='FL'
            mode['fixtureCenter']=(-80.057,26.715)
            market.select_option(area)
            panel.get_by_role('button',name='Play this market').click()
            page.wait_for_function("!document.querySelector('.property-play-start').disabled",timeout=45000)
            assert panel.locator('p[role=status]').first.inner_text().startswith('Recommendation 1 of'), (area,panel.locator('p[role=status]').first.inner_text(),page.evaluate('PublicRadarBridge.getStatus()'))
            assert page.evaluate('PublicRadarBridge.getSearch().state')==state
            assert page.evaluate('PublicRadarBridge.getMap().getZoom()>13')
            assert 'Parcel ID' in result.inner_text() and 'Lease expiration' in result.inner_text()
        assert 'SYNTHETIC HOLDINGS LLC' in result.inner_text()
        original=page.evaluate('PublicRadarBridge.getSelected()')
        with page.expect_file_chooser() as chooser:
            panel.get_by_text('Lease evidence',exact=True).click()
            panel.get_by_label('Choose lease evidence file').click()
        chooser.value.set_files({'name':'leases.json','mimeType':'application/json','buffer':json.dumps({'leases':[{'parcelKey':original,'expiration':'2030-05-31','sourceURL':'https://example.org/lease'}]}).encode()})
        page.wait_for_function("document.querySelector('.property-play-result').textContent.includes('2030-05-31')")
        assert result.get_by_role('link',name='Imported lease source').count()==1
        panel.get_by_role('button',name='Next parcel').click()
        assert page.evaluate('PublicRadarBridge.getSelected()')!=original
        assert '2030-05-31' not in result.inner_text()
        panel.get_by_role('button',name='Previous parcel').click()
        assert page.evaluate('PublicRadarBridge.getSelected()')==original
        page.locator('#lockRadar').click()
        assert not panel.is_visible() and '2030-05-31' not in result.text_content()
        unlock(page)
        assert not result.is_visible()
        page.evaluate("() => { PublicRadarBridge.scan=({signal})=>new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true})); }")
        page.get_by_role('button',name='▶ Play',exact=True).click()
        panel.get_by_role('button',name='Stop',exact=True).click()
        page.wait_for_function("document.querySelector('#propertyPlay p[role=status]').textContent==='Property search stopped.'")
        assert not result.is_visible()
        assert not errors, errors
        browser.close()
    print('Property Play passed for PA, NJ and FL with synthetic connected sources.')
finally:
    server.shutdown()
    server.server_close()
