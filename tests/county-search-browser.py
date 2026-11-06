"""County queries have no centroid circle and never claim capped retrieval is complete."""
from browser_fixture import *
checks=[]
def check(label,value):assert value,label;checks.append(label)
def ask(page,q):
 page.fill('#agentPrompt',q);page.press('#agentPrompt','Enter');page.wait_for_function('!document.querySelector("#agentForm [type=submit]").disabled')
def open_page(browser):
 ctx=browser.new_context(accept_downloads=True);page=ctx.new_page();page.route('**/*',network);page.goto(f'http://127.0.0.1:{server.server_port}/');unlock(page);return ctx,page
try:
 mode['countySearch']=True
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=chromium_executable(p),headless=True,args=['--no-sandbox'])
  for county,state in [('Monmouth','NJ'),('Palm Beach','FL'),('Broward','FL'),('Miami-Dade','FL')]:
   external_requests.clear();queries.clear();ctx,page=open_page(browser);ask(page,'Industrial over '+('5' if state=='PA' else '10')+' acres in '+county+' County '+state)
   search=page.evaluate('PublicRadarBridge.getSearch()');rows=page.evaluate('PublicRadarBridge.getResults()');meta=page.evaluate('PublicRadarBridge.getMeta()')
   check(county+' countywide complete with results',search['scope']=='county' and meta['complete'] and len(rows)>0)
   check(county+' does not geocode a centroid',not any('findAddressCandidates' in u for u in external_requests))
   check(county+' map has no search-radius circle',page.evaluate('!Object.values(PublicRadarBridge.getMap()._layers).some(l=>l instanceof L.Circle)'))
   parcel_requests=[parse_qs(urlparse(u).query) for u in external_requests if any(x in u for x in ['Parcels_Composite','Parcels_and_Property','BCPA_TAXROLL','PaParcelView','ParcelSDE']) and '/query?' in u]
   check(county+' parcel requests contain no radius geometry',bool(parcel_requests) and all('geometry' not in q and 'geometryType' not in q for q in parcel_requests))
   check(county+' explains no radius limit','No radius limit' in page.locator('#agentLog').inner_text() and 'Countywide search' in page.locator('.chat-properties').last.text_content())
   if state!='PA':check(county+' includes distant county parcel',any(abs(r['lon']-search['center']['lon'])>.3 for r in rows))
   if state=='NJ':check('NJ uses explicit county field',all("UPPER(COUNTY) = 'MONMOUTH'" in q['where'][0] for q in parcel_requests))
   if county=='Broward':
    check('Broward computes acres without claiming published acreage',all(r['acreageQuality']=='computed-polygon' and r['reportedAcres'] is None and abs(r['acres']-(15+i%3*10))<.2 for i,r in enumerate(sorted(rows,key=lambda r:r['id']))))
    check('Broward card clearly labels computation','Acreage computed from GIS polygon' in page.locator('.chat-properties').last.text_content())
    check('Broward string use-code filter applies industrial codes',any("USE_CODE LIKE '4___'" in q['where'][0] for q in parcel_requests))
    page.evaluate('()=>{const r=PublicRadarBridge.getResults()[0];PublicRadarBridge.choose(r.key);RadarFieldPack.add(r);return true}')
    with page.expect_download() as download:page.click('#generateFieldPack')
    packet=Path(download.value.path()).read_text();check('field pack labels computed acreage','acres computed from GIS polygon' in packet and 'Source reports null' not in packet)
   if county=='Monmouth':
    ask(page,'only over 20 acres');check('follow-up preserves countywide scope',page.evaluate('PublicRadarBridge.getSearch().scope==="county"&&PublicRadarBridge.getResults().length===2'))
    check('county follow-up does not invent a requested radius','radius around an entire county boundary' not in page.locator('#agentLog').inner_text())
    ask(page,'Hudson County industrial over 10 acres');check('new explicit county does not inherit the previous county',page.evaluate('PublicRadarBridge.getSearch().county==="Hudson"&&PublicRadarBridge.getSearch().scope==="county"'))
    ask(page,'industrial over 10 acres within 2 miles of Monmouth County NJ');check('unsupported county-boundary radius is explicit','radius around an entire county boundary' in page.locator('#agentLog').inner_text() and page.evaluate('PublicRadarBridge.getSearch().scope==="county"'))
   ctx.close()
  for county,state,total,cap in [('Monmouth','NJ',1605,1600),('Palm Beach','FL',905,900)]:
   mode['countySize']=total;ctx,page=open_page(browser);ask(page,'industrial over 10 acres in '+county+' County '+state)
   check(county+' cap remains partial with correct county total',page.evaluate('PublicRadarBridge.getMeta().status==="partial"&&!PublicRadarBridge.getMeta().complete') and f'Partial: first {cap} of {total} source parcels countywide' in page.locator('#agentLog').inner_text())
   check(county+' cap offers narrower town searches',page.locator('.chat-chip').count()>=3);ctx.close()
  mode.pop('countySize');mode['broNumeric']=True;mode['broOID']='FID';ctx,page=open_page(browser);external_requests.clear();ask(page,'industrial over 10 acres in Broward County FL')
  check('Broward numeric use-code schema uses numeric ranges',page.evaluate('PublicRadarBridge.getMeta().complete') and any('USE_CODE BETWEEN 4000 AND 4999' in parse_qs(urlparse(u).query).get('where',[''])[0] for u in external_requests));check('Broward pages on its published OID field',any(parse_qs(urlparse(u).query).get('orderByFields')==['FID ASC'] for u in external_requests));ctx.close()
  mode['broNoGeometry']=True;ctx,page=open_page(browser);ask(page,'industrial over 10 acres in Broward County FL')
  check('missing Broward polygon is not treated as zero matches',page.evaluate('!PublicRadarBridge.getMeta().complete') and 'no measurable parcel polygon' in page.locator('#statusText').text_content());ctx.close();mode.pop('broNoGeometry')
  ctx,page=open_page(browser);external_requests.clear();ask(page,'industrial over 10 acres in Lehigh County PA')
  check('Lehigh is marked browser-unavailable without a doomed fetch',page.evaluate('PublicRadarBridge.getSearch()===null') and 'Lehigh County blocks direct cross-site browser requests' in page.locator('#agentLog').inner_text() and not any('gis.lehighcounty.org' in u for u in external_requests));ctx.close()
  ctx,page=open_page(browser);external_requests.clear();ask(page,'industrial over 10 acres in Orange County FL')
  check('unconnected county offers towns instead of radius scan',page.evaluate('PublicRadarBridge.getSearch()===null') and 'No county-centroid circle was substituted' in page.locator('#agentLog').inner_text() and page.get_by_role('button',name='Orlando',exact=True).count()==1 and not any('findAddressCandidates' in u for u in external_requests));ctx.close()
  browser.close()
 print('County browser suite passed:',len(checks),'checks.')
finally:server.shutdown();server.server_close()
