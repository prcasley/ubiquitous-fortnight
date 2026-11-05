"""Automatic, role-separated NJDEP context and an explicitly scoped mailing comparison."""
from browser_fixture import *
checks=[];dep_requests=[];mail_batches=[];pi_down=False;summary_payloads=[]
def check(name,value):assert value,name;checks.append(name)
def route_all(route):
 u=urlparse(route.request.url);q=parse_qs(route.request.post_data or '') if route.request.method=='POST' else parse_qs(u.query)
 if u.hostname=='127.0.0.1' and u.path=='/api/radar-agent/status':respond(route,{'available':True});return
 if u.hostname=='127.0.0.1' and u.path=='/api/radar-agent' and route.request.method=='POST':
  d=json.loads(route.request.post_data);summary_payloads.append(d);respond(route,{'generated':True,'answer':'Public acreage only.','sourceURL':d['sourceURL'],'recordCount':d['totalCount'],'sampleCount':len(d['records']),'caveat':'Verify facts.'});return
 if u.hostname=='services1.arcgis.com' and 'New_Jersey_Environmental_Management_System_Sites' in u.path:
  dep_requests.append((u.path,q));site='/143' in u.path
  if not site and pi_down:respond(route,{'error':{'message':'Synthetic table outage'}},503);return
  if not u.path.endswith('/query'):
   names=['SITE_NAME','ADDRESS_LINE_1','CITY','ZIP_CODE','SSN'] if site else ['PI_NAME','PROGRAM_DESC','ACTIVE']
   respond(route,{'objectIdField':'OBJECTID',**({'geometryType':'esriGeometryPoint'} if site else {}),'fields':[{'name':'OBJECTID','type':'esriFieldTypeOID'},{'name':'SITE_ID','type':'esriFieldTypeInteger'},{'name':'PI_ID','type':'esriFieldTypeInteger'}]+[{'name':n,'type':'esriFieldTypeString'} for n in names]});return
  if q.get('returnCountOnly')==['true']:respond(route,{'count':1});return
  if q.get('returnIdsOnly')==['true']:respond(route,{'objectIds':[1]});return
  if site:
   b=json.loads(q['geometry'][0]);lon=(b['xmin']+b['xmax'])/2;lat=(b['ymin']+b['ymax'])/2
   respond(route,{'features':[{'attributes':{'OBJECTID':1,'SITE_ID':101,'SITE_NAME':'REGULATORY SITE LLC','SSN':'DO NOT EXPORT'},'geometry':{'x':lon,'y':lat}}]});return
  respond(route,{'features':[{'attributes':{'OBJECTID':1,'SITE_ID':101,'PI_ID':55,'PI_NAME':'PROGRAM INTEREST LLC','PROGRAM_DESC':'Synthetic regulatory program','ACTIVE':'Y','SSN':'DO NOT EXPORT'}}]});return
 if u.hostname=='services2.arcgis.com' and 'Parcels_Composite_NJ_WM' in u.path:
  if not u.path.endswith('/query'):
   fields=['PAMS_PIN','PROP_CLASS','OWNER_NAME','ST_ADDRESS','CITY_STATE','ZIP_CODE','PCL_MUN','PCLBLOCK','PCLLOT','PCLQCODE','COUNTY','MUN_NAME'];respond(route,{'geometryType':'esriGeometryPolygon','fields':[{'name':n,'type':'esriFieldTypeString'} for n in fields]});return
  if 'OWNER_NAME' in q.get('outFields',[''])[0]:
   where=q.get('where',[''])[0];ids=re.findall(r"'(\d{4}_[^']+)'",where);batch=route.request.method=='POST'
   if batch:mail_batches.append(q)
   rows=[]
   for i,pin in enumerate(ids):
    rows.append({'attributes':{'PAMS_PIN':pin,'PROP_CLASS':'4B','OWNER_NAME':'','ST_ADDRESS':'123 Mailing Only St STE '+('200' if batch and i==2 else '100'),'CITY_STATE':'Secaucus NJ','ZIP_CODE':'07094','PCL_MUN':'1205','PCLBLOCK':'21','PCLLOT':pin.split('_')[2],'PCLQCODE':'C0001','COUNTY':'MIDDLESEX','MUN_NAME':'EDISON'}})
   respond(route,{'features':rows});return
 network(route)
try:
 mode['ceo']=True;mode['persona']=True;mode['ownershipKeys']=True
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=chromium_executable(p),headless=True,args=['--no-sandbox']);page=browser.new_page(accept_downloads=True);errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('**/*',route_all);page.goto(f'http://127.0.0.1:{server.server_port}/');unlock(page);page.fill('#agentPrompt','industrial over 5 acres in Edison NJ');page.press('#agentPrompt','Enter');page.wait_for_function('!document.querySelector("#agentForm [type=submit]").disabled');check('a scan does not batch-harvest regulatory or mailing records',not dep_requests and not mail_batches)
  keys=page.evaluate('PublicRadarBridge.getResults().map(r=>r.key)');page.evaluate('(key)=>PublicRadarBridge.choose(key)',keys[0]);page.wait_for_function('(key)=>RadarOwnerAuto.getNJDEP(key)?.status==="observed"&&RadarOwnerAuto.getResearch(key)?.status==="observed"',arg=keys[0]);preview=page.locator('#details .selected-research-preview').inner_text();check('selected map card immediately shows mailing and regulatory references','123 Mailing Only St STE 100' in preview and 'REGULATORY SITE LLC' in preview and 'not owner matches' in preview)
  page.click('#workspace-tab-owners');panel=page.locator('#selectedOwnershipResearch');check('site and PI names stay explicit regulatory roles','REGULATORY SITE LLC' in panel.inner_text() and 'PROGRAM INTEREST LLC' in panel.inner_text() and 'not a verified owner' in panel.inner_text());check('regulatory companies do not replace a blank assessor owner or populate the company-owner directory',page.evaluate('(key)=>PublicRadarBridge.getRecord(key).owner===null&&RadarOwnership.groups().length===0',keys[0]));check('NJDEP queries omit unneeded sensitive fields',all('SSN' not in q.get('outFields',[''])[0] for _,q in dep_requests))
  page.fill('#njMailingLimit','3');page.click('#njMailingStart');page.wait_for_function('!RadarNJMailingUI.isBusy()');report=page.evaluate('RadarNJMailingUI.getReport()');check('scan comparison checks an explicit subset and keeps suites distinct',report['requested']==3 and len(report['groups'])==1 and len(report['groups'][0]['parcelIds'])==2 and 'Partial coverage' in page.locator('#njMailingStatus').inner_text());check('mailing relationships do not copy program names into owner fields',page.evaluate('PublicRadarBridge.getResults().every(r=>!r.owner)'))
  with page.expect_download() as download:page.get_by_role('button',name='Export selected cited research (local)').click()
  data=json.loads(Path(download.value.path()).read_text());check('local export keeps NJDEP roles and excludes unrequested private fields',data['njdepContext']['sites'][0]['role']=='regulatory-site' and data['njdepContext']['interests'][0]['role']=='program-interest' and 'DO NOT EXPORT' not in json.dumps(data))
  page.evaluate('()=>PublicRadarAssistant.explain("Summarize public acreage")');page.wait_for_function('document.getElementById("assistantStatus").textContent.includes("Summary ready")');payload=json.dumps(summary_payloads[-1]);check('hosted prompts exclude regulatory names and mailing recipients',all(x not in payload for x in ['REGULATORY SITE LLC','PROGRAM INTEREST LLC','Mailing Only']))
  pi_down=True;page.get_by_role('button',name='Refresh NJDEP references',exact=True).click();page.wait_for_function('(key)=>RadarOwnerAuto.getNJDEP(key)?.status==="partial"',arg=keys[0]);check('table outage keeps site facts with an unavailable-table label','REGULATORY SITE LLC' in panel.inner_text() and 'Program-interest table unavailable' in panel.inner_text())
  rejected={'format':'RadarLocalOwnershipEvidence','version':1,'byPamsPin':{'1205_21_1_C0001':{'evidence':[{'kind':'assessment-observation','name':'PROGRAM INTEREST LLC','sourceURL':'https://services1.arcgis.com/QWdNfRs7lkPq4g4Q/arcgis/rest/services/New_Jersey_Environmental_Management_System_Sites/FeatureServer/148','observedAt':'2026-11-05'}]}}}
  page.set_input_files('#localOwnerEvidenceFile',{'name':'mislabelled.json','mimeType':'application/json','buffer':json.dumps(rejected).encode()});page.wait_for_function('document.getElementById("localOwnerEvidenceStatus").textContent.includes("not loaded")');check('the proposed mislabelled owner generator cannot be imported as assessment ownership','previous research was retained' in page.locator('#localOwnerEvidenceStatus').inner_text())
  check('no uncaught errors',not errors);browser.close()
 print('NJ research browser passed:',len(checks),'checks.')
finally:server.shutdown();server.server_close()
