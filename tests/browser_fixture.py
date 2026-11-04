"""Shared synthetic network fixtures for isolated browser suites. No live property data."""
import functools
import json
import re
import shutil
import os
import secrets
import subprocess
import base64
import struct
import zlib
import threading
import math
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, Page, Locator, TimeoutError as PlaywrightTimeoutError

# Playwright's page-side waiter uses eval, which strict script-src correctly blocks.
# Poll through DevTools evaluation instead; keep CSP enforced in every browser suite.
def csp_wait_for_function(page, expression, *, arg=None, timeout=None, polling=None):
    deadline=time.monotonic()+(30 if timeout is None else timeout/1000) if timeout!=0 else float('inf')
    while True:
        value=page.evaluate(expression,arg)
        if value:return value
        if time.monotonic()>=deadline:raise PlaywrightTimeoutError('Timed out waiting for browser state: '+expression[:180])
        page.wait_for_timeout(polling if isinstance(polling,(int,float)) else 50)
Page.wait_for_function=csp_wait_for_function

def chromium_executable(p):
    if os.environ.get('RADAR_USE_MANAGED_CHROMIUM')=='1':return p.chromium.executable_path
    return os.environ.get('RADAR_CHROMIUM_PATH') or shutil.which('chromium') or p.chromium.executable_path

def focused_parcel_fits(page, timeout_ms=8000):
    # Wait on observed Leaflet/layout state: moveend can fire before a test attaches.
    deadline=time.monotonic()+timeout_ms/1000
    state=None
    while True:
        state=page.evaluate("""()=>{const b=window.PublicRadarBridge,p=b?.getRecord(document.getElementById('details')?.dataset.parcelKey),map=b?.getMap();if(!p||!map)return {fits:false,reason:'selection not ready'};const bounds=L.geoJSON(p.geometry).getBounds(),size=map.getSize(),nw=map.latLngToContainerPoint(bounds.getNorthWest()),se=map.latLngToContainerPoint(bounds.getSouthEast()),center=map.latLngToContainerPoint(bounds.getCenter()),polygon=['Polygon','MultiPolygon'].includes(p.geometry.geometry.type),expected=polygon?Math.min(19,map.getBoundsZoom(bounds,false,L.point(70,70))):Math.min(17,map.getMaxZoom()),zoom=map.getZoom(),visible=nw.x>=-2&&nw.y>=-2&&se.x<=size.x+2&&se.y<=size.y+2,centered=Math.abs(center.x-size.x/2)<=3&&Math.abs(center.y-size.y/2)<=3,idle=!map._animatingZoom&&!map._panAnim?._inProgress,fits=idle&&size.x>0&&size.y>0&&visible&&centered&&zoom>=expected-(polygon?1:0)-.01&&zoom<=expected+.01;return {fits,zoom,expected,idle,visible,centered,size:[size.x,size.y],nw:[nw.x,nw.y],se:[se.x,se.y],center:[center.x,center.y],viewport:[innerWidth,innerHeight],rect:map.getContainer().getBoundingClientRect().toJSON(),parcel:p.key,trace:b.getMapTrace?.()||[],fonts:document.fonts?.status};}""")
        if state.get('fits'):return True
        if time.monotonic()>=deadline:break
        page.wait_for_timeout(50)
    artifact=Path(os.environ.get('RADAR_BROWSER_ARTIFACT_DIR','/tmp/radar-browser-artifacts'))
    artifact.mkdir(parents=True,exist_ok=True)
    (artifact/'map-focus.json').write_text(json.dumps(state,indent=2))
    page.screenshot(path=str(artifact/'map-focus.png'),full_page=True)
    print('Map focus did not settle within 8 seconds:',json.dumps(state),flush=True)
    return False


ROOT = Path(__file__).resolve().parents[1]

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT / 'dist')))
threading.Thread(target=server.serve_forever, daemon=True).start()

def polygon(lon, lat):
    return {'type': 'Polygon', 'coordinates': [[[lon-.0001, lat-.0001], [lon+.0001, lat-.0001], [lon+.0001, lat+.0001], [lon-.0001, lat+.0001], [lon-.0001, lat-.0001]]]}

def parcel_polygon(lon,lat,acres):
    dy=math.sqrt(max(acres,.001)*4046.8564224)/2/111195
    dx=dy/math.cos(math.radians(lat))
    return {'type':'Polygon','coordinates':[[[lon-dx,lat-dy],[lon+dx,lat-dy],[lon+dx,lat+dy],[lon-dx,lat+dy],[lon-dx,lat-dy]]]}

mode = {'fail': False, 'partial': False, 'collision': False, 'chat': False, 'cards': False, 'imageryFail': False}
mode.update({'njPaging':False,'repeatPage':False,'countDrift':False,'njCap':False})

# Legacy workflow tests now navigate the actual mode tabs before interacting with a moved panel.
# The dedicated workspace suite disables this helper and verifies the navigation itself manually.
def reveal_workspace(locator):
    if mode.get('workspaceManual'):return
    page=locator.page
    if not page.evaluate('!!window.RadarWorkspace'):return
    root=locator
    if root.count()==0:
        selector=locator._impl_obj._selector.split(' >> ')[0]
        root=page.locator(selector)
    if root.count()==0:return
    target=root.first.evaluate('(e)=>e.closest("[data-workspace-mode]")?.dataset.workspaceMode||null')
    if target and page.evaluate('RadarWorkspace.getMode()')!=target:
        _workspace_locator_click(page.locator('#workspace-tab-'+target))
    if not root.first.is_visible():
        for details in root.first.locator('xpath=ancestor::details[not(@open)]').all():
            _workspace_locator_click(details.locator(':scope > summary'))
_workspace_locator_click=Locator.click
for _method in ['click','fill','press','check','uncheck','select_option','set_input_files','screenshot','scroll_into_view_if_needed']:
    def _wrapped(self,*args,_original=getattr(Locator,_method),**kwargs):
        reveal_workspace(self)
        return _original(self,*args,**kwargs)
    setattr(Locator,_method,_wrapped)
for _method in ['click','fill','press','check','uncheck','select_option','set_input_files']:
    def _wrapped_page(self,selector,*args,_original=getattr(Page,_method),**kwargs):
        reveal_workspace(self.locator(selector))
        return _original(self,selector,*args,**kwargs)
    setattr(Page,_method,_wrapped_page)

def png_chunk(tag, data):
    return struct.pack('>I',len(data))+tag+data+struct.pack('>I',zlib.crc32(tag+data)&0xffffffff)
PNG=b'\x89PNG\r\n\x1a\n'+png_chunk(b'IHDR',struct.pack('>IIBBBBB',2,2,8,6,0,0,0))+png_chunk(b'IDAT',zlib.compress((b'\x00'+b'\x77\x99\x88\xff'*2)*2))+png_chunk(b'IEND',b'')
queries = []
external_requests = []

def respond(route, payload, status=200):
    route.fulfill(status=status, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps(payload))

def network(route):
    parsed = urlparse(route.request.url)
    if parsed.hostname=='127.0.0.1' and parsed.path.endswith('/assets/data/recovered-reference.json'):
        respond(route,{'format':'RadarRecoveredReference','version':1,'sourceFile':'synthetic-empty.html','fileGeneratedAt':'2026-09-28','groups':[],'records':[],'municipalOverlays':[],'ozReference':[]});return
    if parsed.hostname=='127.0.0.1' and parsed.path.endswith('/assets/footprints/manifest.json') and not mode.get('hostedFootprints'):
        # Existing synthetic scenarios exercise the live fallback outside hosted markets.
        respond(route,{'zoom':14,'tiles':[],'source':'Synthetic out-of-area extract','license':'ODbL 1.0','markets':{'synthetic':{'center':[-150,0],'radiusMiles':6.5}}});return
    if parsed.hostname == '127.0.0.1':
        route.continue_()
        return
    params = parse_qs(parsed.query)
    if route.request.method=='POST':params=parse_qs(route.request.post_data or '')
    external_requests.append(route.request.url)
    if parsed.hostname=='server.arcgisonline.com' and parsed.path.endswith('/export'):
        if mode['imageryFail']: route.abort()
        else: route.fulfill(status=200,content_type='image/png',headers={'access-control-allow-origin':'*'},body=PNG)
        return
    if parsed.hostname == 'geocode.arcgis.com':
        query=params.get('SingleLine',[''])[0]
        normalized=re.sub(r'[,?.]', ' ',query).strip().lower()
        normalized=re.sub(r'\s+', ' ',normalized)
        places={
            'camden':('NJ','Camden',-75.12,39.93),'phillipsburg':('NJ','Warren',-75.19,40.69),'newark':('NJ','Essex',-74.17,40.735), 'edison':('NJ','Middlesex',-74.363,40.527), 'secaucus':('NJ','Hudson',-74.063,40.789),
            'woodbridge':('NJ','Middlesex',-74.28,40.55), 'north bergen':('NJ','Hudson',-74.01,40.80),
            'perth amboy':('NJ','Middlesex',-74.27,40.51), 'port newark':('NJ','Essex',-74.14,40.69),
            'parsippany':('NJ','Morris',-74.42,40.86), 'south plainfield':('NJ','Middlesex',-74.41,40.58),
            'palm beach international airport west palm beach':('FL','Palm Beach',-80.0956,26.6832), 'delray beach':('FL','Palm Beach',-80.072,26.461),
            'west palm beach':('FL','Palm Beach',-80.13,26.72), 'palm beach':('FL','Palm Beach',-80.13,26.72),
            'palm beach county':('FL','Palm Beach',-80.13,26.72), 'mangonia park':('FL','Palm Beach',-80.07,26.76),
            'allentown':('PA','Lehigh',-75.49,40.602), 'easton':('PA','Northampton',-75.22,40.69),
            'erie':('PA','Erie',-80.08,42.12), 'albany':('NY','Albany',-73.75,42.65),
            'new jersey turnpike exit 8a':('NJ','Middlesex',-74.474,40.347)
        }
        if re.fullmatch(r'\d{5}',normalized):
            zips={'08817':('Edison','NJ'),'33411':('West Palm Beach','FL'),'10001':('New York','NY')}
            if normalized in zips:respond(route,{'candidates':[{'score':100,'address':normalized,'location':{'x':-74.3937,'y':40.5125},'attributes':{'Addr_type':'Postal','City':zips[normalized][0],'RegionAbbr':zips[normalized][1]}}]})
            else:respond(route,{'candidates':[]})
            return
        # State abbreviations alone and unknown towns intentionally return no candidates.
        place=re.sub(r'\s+(?:nj|fl|pa|ny|new jersey|florida|pennsylvania)$','',normalized)
        if place=='40 hilton st easton': place='easton'
        if place=='5900 australian ave west palm beach': place='west palm beach'
        address_fixture={'7777 southern blvd west palm beach':('FL','Palm Beach',-80.175,26.6797),'1 harmon plaza secaucus':('NJ','Hudson',-74.070,40.793)}
        exact_address=place in address_fixture
        found=address_fixture.get(place) or places.get(place)
        if not found:
            respond(route,{'candidates':[]});return
        state,county,lon,lat=found
        if mode.get('persona') or (mode.get('crossBorder') and place=='easton'): mode['fixtureCenter']=(lon,lat)
        respond(route,{'candidates':[{'score':60 if exact_address and mode.get('addressLowScore') else 100,'address':query,'location':{'x':lon,'y':lat},'attributes':{'RegionAbbr':mode.get('addressState',state) if exact_address else state,'Subregion':(mode.get('addressCounty',county) if exact_address else county)+' County','Addr_type':mode.get('addressType','PointAddress') if re.match(r'^\d',normalized) else 'Locality'}}]})
        return
    county_paths=('Parcels_Composite_NJ_WM','Parcels_and_Property_Details_WebMercator','PARCEL_POLY_BCPA_TAXROLL','PaParcelView_gdb')
    if mode.get('countySearch') and any(path in parsed.path for path in county_paths) or 'PARCEL_POLY_BCPA_TAXROLL' in parsed.path:
        nj='Parcels_Composite' in parsed.path;bro='BCPA' in parsed.path;mdc='PaParcelView' in parsed.path
        if bro and not parsed.path.endswith('/query'):
            fields=['FOLIO_NUMBER','USE_CODE','SITUS_STREET_NUMBER','SITUS_STREET_NAME','SITUS_STREET_TYPE',mode.get('broOID','OBJECTID')]
            respond(route,{'extent':{'spatialReference':{'wkid':3857}},'geometryProperties':{'shapeAreaFieldName':'Shape__Area'},'geometryType':'esriGeometryPolygon','fields':[{'name':'Shape__Area','type':'esriFieldTypeDouble'}]+[{'name':f,'type':('esriFieldTypeInteger' if mode.get('broNumeric') else 'esriFieldTypeString') if f=='USE_CODE' else 'esriFieldTypeOID' if f==mode.get('broOID','OBJECTID') else 'esriFieldTypeString'} for f in fields]});return
        queries.append((parsed.hostname,params.get('where',['1=1'])[0]))
        total=mode.get('countySize',3)
        large_bro=bro and mode.get('broLarge')
        prefiltered=large_bro and 'Shape__Area >=' in params.get('where',[''])[0]
        if large_bro:total=100 if prefiltered else 8508
        if params.get('returnCountOnly')==['true']:respond(route,{'count':total});return
        offset=int(params.get('resultOffset',['0'])[0]);limit=int(params.get('resultRecordCount',['150'])[0]);features=[]
        for i in range(offset,min(total,offset+limit)):
            acres=(20 if prefiltered or i>=5000 else 1) if large_bro else 15+i%3*10;lon,lat=(-74.1-(.45 if i%2 else 0),40.3) if nj else (-80.15-(.5 if i%2 else 0),26.15 if bro else 25.6 if mdc else 26.7)
            props={'PAMS_PIN':'COUNTY-NJ-'+str(i),'PROP_LOC':'County NJ '+str(i),'COUNTY':(re.search(r"UPPER\(COUNTY\) = '([^']+)'",params.get('where',[''])[0]).group(1) if re.search(r"UPPER\(COUNTY\) = '([^']+)'",params.get('where',[''])[0]) else 'MONMOUTH'),'MUN_NAME':'Synthetic town','CALC_ACRE':acres,'PROP_CLASS':'4B','OBJECTID':i} if nj else {'FOLIO_NUMBER':'COUNTY-BRO-'+str(i),'USE_CODE':'4800','SITUS_STREET_NUMBER':str(i+1),'SITUS_STREET_NAME':'COUNTY','SITUS_STREET_TYPE':'RD','OBJECTID':i} if bro else {'FOLIO':'COUNTY-MDC-'+str(i),'TRUE_SITE_ADDR':'County MDC '+str(i),'LOT_SIZE':acres*43560,'DOR_CODE_CUR':'048','OBJECTID':i} if mdc else {'PARID':'COUNTY-PBC-'+str(i),'SITE_ADDR_STR':'County FL '+str(i),'ACRES':acres,'PROPERTY_USE':'INDUSTRIAL','OBJECTID_1':i}
            if bro and mode.get('broOID'):props[mode['broOID']]=props.pop('OBJECTID')
            geometry=parcel_polygon(lon,lat,acres)
            if bro and mode.get('broNoGeometry'):geometry={'type':'Point','coordinates':[lon,lat]}
            features.append({'type':'Feature','properties':props,'geometry':geometry})
        respond(route,{'type':'FeatureCollection','features':features,'exceededTransferLimit':offset+len(features)<total});return
    if mode.get('njNomCase') and parsed.hostname=='services.arcgis.com' and '2026_Opportunity_Zone_2_0_Nominations' in parsed.path:
        if mode.get('ozFail'):respond(route,{'error':{'message':'Synthetic official nomination outage'}},503);return
        if params.get('returnCountOnly')==['true']:respond(route,{'count':1});return
        respond(route,{'features':[{'type':'Feature','geometry':mode.get('nominationGeometry') or parcel_polygon(-74.16,40.735,100),'properties':{'Geography':'34013001000','Municipality':'Newark city','County':'Essex'}}]});return
    if mode.get('nominationStress') and parsed.hostname=='services.arcgis.com' and '2026_Opportunity_Zone_2_0_Nominations' in parsed.path:
        records=json.loads((ROOT/'tests/data/nj-oz-release-20261029.json').read_text())['tracts'];towns=sorted({r['municipality'] for r in records});env=json.loads(params.get('geometry',['{}'])[0]);features=[]
        for r in records:
            i=towns.index(r['municipality']);lon=-74.9+(i%10)*.08;lat=40+(i//10)*.12
            if env and not (env['xmin']-.002<=lon<=env['xmax']+.002 and env['ymin']-.002<=lat<=env['ymax']+.002):continue
            features.append({'type':'Feature','geometry':parcel_polygon(lon,lat,10),'properties':{'Geography':r['geoid'],'Municipality':r['municipality'],'County':r['county']}})
        if params.get('returnCountOnly')==['true']:respond(route,{'count':len(features)})
        else:respond(route,{'features':features,'exceededTransferLimit':False})
        return
    if mode.get('inventory') and parsed.hostname=='services.arcgis.com' and route.request.method=='POST':
        tract=re.search(r"Geography = '([^']+)'",params.get('where',[''])[0])
        respond(route,{'features':[{'type':'Feature','geometry':parcel_polygon(-74.363,40.527,1000),'properties':{'Geography':tract.group(1) if tract else 'unknown'}}]});return
    if mode.get('inventory') and parsed.hostname=='services2.arcgis.com' and ('OWNER_NAME' not in params.get('outFields',[''])[0]):
        if not parsed.path.endswith('/query'):
            names=['PAMS_PIN','PROP_LOC','MUN_NAME','PROP_CLASS','CALC_ACRE','COUNTY','YR_CONSTR','PCLBLOCK','PCLLOT','PCL_MUN','DEED_BOOK','DEED_PAGE','DEED_DATE','SALE_PRICE','PCLQCODE','BLDG_DESC','LAND_VAL','IMPRVT_VAL','NET_VALUE']
            respond(route,{'geometryType':'esriGeometryPolygon','objectIdField':'OBJECTID','fields':[{'name':'OBJECTID','type':'esriFieldTypeOID'}]+[{'name':n} for n in names]});return
        if params.get('returnCountOnly')==['true']:respond(route,{'count':3});return
        if params.get('returnIdsOnly')==['true']:respond(route,{'objectIds':[0,1,2]});return
        if mode.get('inventoryFail'):respond(route,{'error':{'message':'Synthetic inventory outage'}},503);return
        offset=int(params.get('resultOffset',['0'])[0]);take=int(params.get('resultRecordCount',['250'])[0]);features=[]
        for i in range(offset,min(3,offset+take)):
            if mode.get('inventoryUploaded'):
                first=json.loads(params.get('geometry',['{}'])[0]).get('rings',[[[-74.363,40.527]]])[0][0];mode['inventoryFixturePoint']=first
            features.append({'type':'Feature','geometry':parcel_polygon((mode.get('inventoryFixturePoint') or [-74.363,40.527])[0]+i*.00001,(mode.get('inventoryFixturePoint') or [-74.363,40.527])[1],6+i),'properties':{'OBJECTID':i,'PAMS_PIN':'INV-'+str(i),'PROP_LOC':'Synthetic inventory '+str(i),'MUN_NAME':'Synthetic Edison','PROP_CLASS':(mode.get('inventoryClass','4B') if i==2 else '4B') if i!=1 else '1','CALC_ACRE':6+i,'COUNTY':'Middlesex','YR_CONSTR':1980,'PCLBLOCK':'12','PCLLOT':str(i+1),'PCL_MUN':'1205','DEED_BOOK':'123','DEED_PAGE':'456','LAND_VAL':100000,'IMPRVT_VAL':200000,'NET_VALUE':300000}})
        respond(route,{'features':features,'exceededTransferLimit':False});return
    if parsed.hostname=='services.arcgis.com' and '2026_Opportunity_Zone_2_0_Nominations' in parsed.path:
        mode['njNomRequestCount']=mode.get('njNomRequestCount',0)+1
        if mode.get('njNomTransientBudget',0)>0:
            mode['njNomTransientBudget']-=1
            respond(route,{'error':{'message':'Synthetic transient nomination failure','code':mode.get('njNomErrorStatus',503)}},mode.get('njNomErrorStatus',503));return
        if mode.get('njNomFail'):
            respond(route,{'error':{'message':'Synthetic nomination outage'}},503);return
        overview='geometry' not in params
        ids=[r['geoid'] for r in json.loads((ROOT/'assets/data/oz-designation-evidence.json').read_text())['records']] if overview and mode.get('njNomination') else ['34023004502' if mode.get('njNomination') else '34023000100']
        if mode.get('njNomInvalid'):ids=['12099000100']
        if params.get('returnCountOnly')==['true']:respond(route,{'count':len(ids)});return
        env=json.loads(params.get('geometry',['{}'])[0]);lon=(env.get('xmin',-74.37)+env.get('xmax',-74.35))/2;lat=(env.get('ymin',40.51)+env.get('ymax',40.53))/2
        respond(route,{'type':'FeatureCollection','features':[{'type':'Feature','geometry':parcel_polygon(lon,lat,1000),'properties':{'Geography':geoid,'County':'Synthetic Middlesex','Municipality':'Synthetic town'}} for geoid in ids],'exceededTransferLimit':False});return
    if parsed.hostname=='services1.arcgis.com' and 'oppzones_ustreasury' in parsed.path:
        # Synthetic FloridaCommerce eligibility layers. 'flNotMet' mirrors 7777 Southern Blvd (tract 12099007833).
        met=parsed.path.split('/services/')[1].startswith('oppzones_ustreasury_met')
        if mode.get('flEligFail') or mode.get('ozFail'):respond(route,{'error':{'message':'Synthetic FloridaCommerce outage'}},503);return
        env=json.loads(params.get('geometry',['{}'])[0]);lon=(env.get('xmin',-80.14)+env.get('xmax',-80.12))/2;lat=(env.get('ymin',26.71)+env.get('ymax',26.73))/2
        show=(met and not mode.get('flNotMet')) or (not met and mode.get('flNotMet'))
        props={'GEOID':'12099007833','designatio':'Does not Meets Criteria','tract_pove':0.12292531,'Median_Fam':'$81,309','MetroArea_':'89212'} if not met else {'GEOID':'12099000222','designatio':mode.get('flDesignation','Meets Criteria'),'tract_pove':0.25811688,'Median_Fam':'$49,911','MetroArea_':'89212'}
        features=[{'type':'Feature','geometry':parcel_polygon(lon,lat,20000),'properties':props}] if show else []
        if params.get('returnCountOnly')==['true']:respond(route,{'count':len(features)})
        else:respond(route,{'type':'FeatureCollection','features':features,'exceededTransferLimit':False})
        return
    if parsed.hostname in ('geo.dot.gov','services6.arcgis.com'):
        if mode.get('njNomCase') and parsed.hostname=='services6.arcgis.com':
            if params.get('returnCountOnly')==['true']:respond(route,{'count':1});return
            respond(route,{'features':[{'type':'Feature','geometry':parcel_polygon(-74.16,40.735,10000),'properties':{'GEOID':'34013006800','OZ_2_0_Eli':'eligible'}}]});return
        if mode.get('ozFail'):
            respond(route,{'error':{'message':'Synthetic reference outage'}},503)
        elif params.get('returnCountOnly')==['true']:
            respond(route,{'count':281 if mode.get('ozCap') else 1})
        else:
            env=json.loads(params.get('geometry',['{}'])[0])
            nj="'NJ'" in params.get('where',[''])[0]
            lon=(env.get('xmin',-74.37 if nj else -80.14)+env.get('xmax',-74.35 if nj else -80.12))/2
            lat=(env.get('ymin',40.51 if nj else 26.71)+env.get('ymax',40.53 if nj else 26.73))/2
            respond(route,{'type':'FeatureCollection','features':[{'type':'Feature','geometry':polygon(lon,lat),'properties':{'geoid10':'34023000100' if lat>35 else '12099007833' if mode.get('flNotMet') else '12099000100','GEOID':'34023000100' if lat>35 else '12099007833' if mode.get('flNotMet') else '12099000100','OZ_2_0_Eli':'unknown' if mode.get('ozUnknown') else 'eligible'}}],'exceededTransferLimit':bool(mode.get('ozTruncated'))})
        return
    if parsed.hostname=='gis.northamptoncounty.org' and '/Administration/OperationalLayers/' in parsed.path:
        if not parsed.path.endswith('/query'):
            respond(route,{'geometryType':'esriGeometryPolygon','fields':[{'name':'FULLNAME','type':'esriFieldTypeString'},{'name':'MUNI_CODE','type':'esriFieldTypeString'}]})
        elif params.get('returnCountOnly')==['true']:respond(route,{'count':1})
        else:respond(route,{'features':[{'type':'Feature','geometry':parcel_polygon(-75.22,40.69,50000),'properties':{'FULLNAME':'Synthetic Williams Township','MUNI_CODE':'36'}}]})
        return
    if parsed.hostname in ('gis.lehighcounty.org','gis.northamptoncounty.org'):
        if mode.get('paFail'):
            respond(route,{'error':{'message':'Synthetic PA outage'}},503)
            return
        north=parsed.hostname=='gis.northamptoncounty.org'
        idfield='CAMA_ID' if north else 'PIN'
        multipart=north and mode.get('paMultipart')
        def cama(i):
            n=i-base-(1 if multipart and i-base>=50 else 0)-(1 if multipart and i-base>=101 else 0)
            return 'J10 3 '+str(n).zfill(4)+' 0311' if multipart else i
        acresfield='ASMT_ACREAGE' if north else 'ACREAGE';yearfield='COM_YEAR_BUILT' if north else 'YEAR_BUILT'
        size=mode.get('paSize') or (320 if mode.get('paLarge') else 2);base=1000000000 if mode.get('paLarge') else 0
        if not parsed.path.endswith('/query'):
            fields=[{'name':'OBJECTID','type':'esriFieldTypeOID'},{'name':idfield,'type':'esriFieldTypeInteger' if north and not multipart else 'esriFieldTypeString'},{'name':acresfield,'type':'esriFieldTypeDouble'},{'name':'USE_DESC','type':'esriFieldTypeString'},{'name':yearfield,'type':'esriFieldTypeSmallInteger'},{'name':'SITE_ADDRESS','type':'esriFieldTypeString'}]+[{'name':f,'type':'esriFieldTypeDouble'} for f in ['LAND_VALUE','BLDG_VALUE','SALE_PRICE','SALE_DATE','SALE_VALIDITY_CODE','FLAG_10_KOZ']]
            if north: fields.append({'name':'PARCEL_ID','type':'esriFieldTypeString'})
            if mode.get('paNoClass'): fields=[f for f in fields if f['name']!='USE_DESC']
            respond(route,{'geometryType':'esriGeometryPolygon','fields':fields,'advancedQueryCapabilities':{'supportsPagination':True,'supportsOrderBy':True}})
        elif params.get('returnCountOnly')==['true']: respond(route,{'count':size if not mode.get('paSnapshotFail') else -1})
        elif params.get('returnIdsOnly')==['true']: respond(route,{'objectIds':list(reversed(range(base,base+size))) if not mode.get('paSnapshotFail') else [0]*size})
        elif 'OWNERS_NAME_1' in params.get('outFields',[''])[0] or params.get('outFields')==['*']:
            owner_id=re.search(r"CAMA_ID = (?:'([^']+)'|(\d+))",params.get('where',[''])[0])
            owner_value=(owner_id.group(1) or owner_id.group(2)) if owner_id else str(cama(base))
            respond(route,{'features':[{'attributes':{'CAMA_ID':owner_value,'OWNERS_NAME_1':'SYNTHETIC COUNTY OWNER LLC','MAIL_ADDRESS':'Synthetic published mailing address'}}]*(2 if multipart else 1)})
        else:
            assert not re.search(r'OWNER|MAIL|CONTACT',params.get('outFields',[''])[0])
            ids=list(range(base,base+size))
            # Simulate the actual troublesome server: no OIDs, objectIds ignored.
            seek=re.search(r"(?:CAMA_ID|PIN) > (?:'([^']+)'|(\d+))",params.get('where',[''])[0])
            if seek and not mode.get('paRepeatParcel'):
                ids=[i for i in ids if (i if north else 'L'+str(i-base))>(int(seek.group(2)) if north else seek.group(1))]
            ids=sorted(ids,key=lambda i:i if north else 'L'+str(i-base))
            offset=0 if mode.get('paRepeatParcel') else int(params.get('resultOffset',['0'])[0]) if north else 0
            ids=ids[offset:offset+int(params.get('resultRecordCount',[str(size)])[0])]
            features=[{'type':'Feature','properties':{'OBJECTID':i,idfield:cama(i) if north else 'L'+str(i-base),acresfield:6,'USE_DESC':'Industrial warehouse',yearfield:1984,'SITE_ADDRESS':'Synthetic PA property','LAND_VALUE':100000,'BLDG_VALUE':200000,'SALE_PRICE':1 if i-base==0 else 500000,'SALE_DATE':283996800000 if i-base==0 else 1577836800000,'FLAG_10_KOZ':1,'SALE_VALIDITY_CODE':'unverified'},'geometry':parcel_polygon(-75.22 if north else -75.49,40.69 if north else 40.602,6)} for i in ids]
            if north:
                for i,feature in zip(ids,features):
                    feature['properties'].pop('OBJECTID',None)
                    feature['properties']['PARCEL_ID']='SHARED-PARCEL-'+str((i-base)//3)
                    if multipart and i-base in (49,50):
                        feature['geometry']=parcel_polygon(-75.221 if i-base==49 else -75.219,40.69,.1 if i-base==49 else 5.9)
                        if mode.get('paPartConflict') and i-base==50:feature['properties'][acresfield]=7
            if (params.get('geometryType')==['esriGeometryPoint'] or mode.get('addressSearch') and params.get('resultRecordCount')==['7']) and not mode.get('paAmbiguous'): features=features[:1]
            respond(route,{'type':'FeatureCollection','features':features,'exceededTransferLimit':False})
        return
    if parsed.hostname=='overpass-api.de':
        data=parse_qs(route.request.post_data or '').get('data',[''])[0]
        m=re.search(r'\]\(([-\d.,]+)\)',data)
        if not m: respond(route,{'remark':'bad fixture query'});return
        south,west,north,east=map(float,m.group(1).split(','));x=(west+east)/2;y=(south+north)/2;dx=(east-west)/4;dy=(north-south)/4
        coords=[(x-dx,y-dy),(x+dx,y-dy),(x+dx,y+dy),(x-dx,y+dy),(x-dx,y-dy)]
        respond(route,{'elements':[{'type':'way','id':1,'nodes':[1,2,3,4,1],'tags':{'building':'warehouse'},'geometry':[{'lon':x,'lat':y} for x,y in coords]}]});return
    if 'USA_Structures_View/FeatureServer/0' in parsed.path or 'Tran_road/FeatureServer/0' in parsed.path:
        building='USA_Structures' in parsed.path
        if not parsed.path.endswith('/query'):
            fields=['OBJECTID','SOURCE','IMAGE_DATE','PROD_DATE','STATE_FIPS'] if building else ['PRIMENAME','SHLD_TYPE','SHLD_NUM','SRI']
            respond(route,{'geometryType':'esriGeometryPolygon' if building else 'esriGeometryPolyline','fields':[{'name':f} for f in fields]})
        elif params.get('returnCountOnly')==['true']:respond(route,{'count':1})
        else:
            env=json.loads(params['geometry'][0]);x=(env['xmin']+env['xmax'])/2;y=(env['ymin']+env['ymax'])/2
            if building:
                dx=(env['xmax']-env['xmin'])/4;dy=(env['ymax']-env['ymin'])/4
                g={'type':'Polygon','coordinates':[[[x-dx,y-dy],[x+dx,y-dy],[x+dx,y+dy],[x-dx,y+dy],[x-dx,y-dy]]]}
                props={'SOURCE':'Synthetic public geometry','IMAGE_DATE':'2024-01-01','PROD_DATE':'2025-01-01'}
            else:g={'type':'LineString','coordinates':[[x,y-.01],[x,y+.01]]};props={'PRIMENAME':'Interstate 287','SHLD_TYPE':'INT','SHLD_NUM':'287','SRI':'SYNTHETIC'}
            respond(route,{'features':[{'type':'Feature','geometry':g,'properties':props}]})
        return
    if parsed.hostname in ('hazards.fema.gov', 'fwspublicservices.wim.usgs.gov'):
        if mode.get('screeningFail'):
            respond(route,{'error':{'message':'Synthetic screening outage'}},503);return
        if not parsed.path.endswith('/query'):
            respond(route, {'geometryType': 'esriGeometryPolygon', 'fields': [{'name': 'FLD_ZONE'}, {'name': 'ATTRIBUTE'}], 'maxRecordCount': 1000})
        elif params.get('returnCountOnly') == ['true']:
            respond(route, {'count': 0 if mode.get('screeningClear') else 1})
        else:
            respond(route, {'type': 'FeatureCollection', 'features': [] if mode.get('screeningClear') else [{'type': 'Feature', 'geometry': parcel_polygon(-80.13,26.72,1000), 'properties': {'FLD_ZONE': 'AE', 'ATTRIBUTE': 'PEM1'}}]})
        return
    if parsed.hostname=='services1.arcgis.com' and "PARCEL_NUMBER='" in params.get('where',[''])[0] and 'SITE_ADDR_STR' in params.get('outFields',[''])[0]:
        respond(route,{'features':[{'attributes':{'SITE_ADDR_STR':'7777 SOUTHERN BLVD','MUNICIPALITY':'WEST PALM BEACH','PARCEL_NUMBER':'00424327050064201'}}] if '00424327050064201' in params['where'][0] else []});return
    if parsed.hostname=='services2.arcgis.com' and "PCLBLOCK='" in params.get('where',[''])[0] and 'PROP_LOC' in params.get('outFields',[''])[0] and 'returnCountOnly' not in params:
        respond(route,{'features':[{'attributes':{'PROP_LOC':'25 SYNTHETIC WAY','MUN_NAME':'EDISON TWP','PCLBLOCK':'7','PCLLOT':'2','PAMS_PIN':'1205_7_2'}}] if "PCLBLOCK='7'" in params['where'][0] else []});return
    if parsed.hostname in ('services1.arcgis.com','services2.arcgis.com','services9.arcgis.com'):
        where = params.get('where', [''])[0]
        queries.append((parsed.hostname, where))
        ownerfields=params.get('outFields',[''])[0]
        if 'OWNER_NAME' in ownerfields and 'OWNER_NAME1' not in ownerfields:
            match=re.search(r"PAMS_PIN = '([^']+)'",where)
            respond(route,{'features':[{'attributes':{'PAMS_PIN':match.group(1) if match else '', 'OWNER_NAME':mode.get('njOwnerName','')}}]});return
        if any(name in ownerfields for name in ['OWNER_NAME1','NAME_LINE_1','TRUE_OWNER1','OWN_NAME']):
            idfield='PARID' if 'OWNER_NAME1' in ownerfields else 'FOLIO_NUMBER' if 'NAME_LINE_1' in ownerfields else 'FOLIO' if 'TRUE_OWNER1' in ownerfields else 'PARCEL_ID'
            ownerfield='OWNER_NAME1' if idfield=='PARID' else 'NAME_LINE_1' if idfield=='FOLIO_NUMBER' else 'TRUE_OWNER1' if idfield=='FOLIO' else 'OWN_NAME'
            match=re.search(idfield+r" = '([^']+)'",where)
            attributes={idfield:match.group(1) if match else 'unknown',ownerfield:'Synthetic Person' if mode.get('ownerIndividual') else 'SYNTHETIC HOLDINGS LLC','ASMNT_YR':2026,'CO_NO':60}
            respond(route,{'features':[{'attributes':attributes}]})
            return
        if mode['fail']:
            respond(route, {'error': {'message': 'Synthetic outage'}}, 503)
            return
        if mode['partial'] and int(params.get('resultOffset', ['0'])[0]) > 0:
            respond(route, {'error': {'message': 'Synthetic second-page outage'}}, 503)
            return
        nj = parsed.hostname == 'services2.arcgis.com'
        fdor = parsed.hostname == 'services9.arcgis.com'
        features = []
        acres_values = ([3,4,5,6,6.4,7,10] if mode['chat'] else [3,4,5]) if not mode['partial'] else [3]*150
        if mode['cards']: acres_values=[6]*49
        if mode.get('executive') and not mode['partial']: acres_values=[6,12,8,20,5]
        if mode.get('ceo'): acres_values=[6,12,25,40,5]
        if nj and mode['njPaging']: acres_values=[6]*350
        if nj and mode['njCap']: acres_values=[6]*1637
        if nj and mode.get('badAcreage'): acres_values=[6,44900,20]
        if mode['collision']:
            acres_values = [3,3]
        for i, acres in enumerate(acres_values):
            condo='NO' if not mode.get('pbcCondoMixed') or i%3==0 else 'YES' if i%3==1 else None
            if not nj and not fdor and "CONDO = 'NO'" in where and condo!='NO':continue
            conditions = re.findall(r'(?:ACRES|CALC_ACRE) (>=|<=|>|<|=) ([\d.]+)', where)
            if any(not {'>=': acres >= float(value), '>': acres > float(value), '<': acres < float(value), '<=': acres <= float(value), '=': acres == float(value)}[op] for op,value in conditions):
                continue
            props = {'PAMS_PIN': 'NJ-'+str(i), 'PROP_LOC': 'Synthetic NJ parcel', 'MUN_NAME': 'Edison', 'PROP_CLASS': '4B', 'CALC_ACRE': acres, 'COUNTY': 'Middlesex'} if nj else {'PARID': 'PBC-'+str(i), 'SITE_ADDR_STR': 'Synthetic FL parcel', 'MUNICIPALITY': 'Palm Beach', 'ACRES': acres, 'PROPERTY_USE': 'VACANT INDUSTRIAL' if '%VACANT%' in where or mode.get('flVacantIndustrial') else 'DISTRIBUTION', 'YRBLT': 1990,'CONDO':condo}
            if nj and mode.get('njNomCase'):props.update({'MUN_NAME':'Newark','COUNTY':'Essex','PROP_LOC':'Synthetic Newark parcel '+str(i)})
            if mode.get('persona'):
                if nj and "PROP_CLASS = '4C'" in where: props['PROP_CLASS']='4C'
                if nj and "PROP_CLASS = '1'" in where: props['PROP_CLASS']='1'
                if not nj and '%MULTI%' in where: props['PROPERTY_USE']='MULTIFAMILY'
            if nj and mode.get('ownershipKeys'):props['PAMS_PIN']='1205_21_'+str(i+1)+'_C0001'
            props['OBJECTID']=i
            if not nj and not fdor:props['OBJECTID_1']=i
            if nj: props['YR_CONSTR']=1974 if i%2==0 else 0
            geometry = parcel_polygon(-74.363,40.527,acres) if nj else parcel_polygon(-80.13,26.72,acres)
            if mode.get('persona'):
                lon,lat=mode.get('fixtureCenter',(-74.363,40.527));geometry=parcel_polygon(lon,lat,acres)
            if nj and mode.get('njNomCase'):geometry=parcel_polygon(-74.17+i*.01,40.735,acres)
            if nj and mode.get('crossBorder') and mode.get('fixtureCenter')==(-75.22,40.69): geometry=parcel_polygon(-75.18,40.69,acres)
            if nj and mode.get('secaucus'): geometry=parcel_polygon(-74.063,40.789,acres)
            if fdor:
                props = {'PARCEL_ID': 'SAME-ID', 'CO_NO': 53 if i==0 else 66, 'LND_SQFOOT': acres*43560, 'DOR_UC': '048'}
                props['OBJECTID']=i
                geometry = {'type':'Point','coordinates':[-80.13,26.72]}
            features.append({'type':'Feature','properties':props,'geometry':geometry})
        if nj and mode.get('badAcreage'):
            for f in features:
                if f['properties']['CALC_ACRE']==44900: f['geometry']=parcel_polygon(-74.363,40.527,1.031)
        if mode.get('persona') and params.get('resultRecordCount')==['7']:
            env=json.loads(params['geometry'][0]);lon=(env['xmin']+env['xmax'])/2;lat=(env['ymin']+env['ymax'])/2
            features=[{'type':'Feature','properties':{'PARID':'ADDRESS-5900','SITE_ADDR_STR':'5900 Australian Ave','PROPERTY_USE':'DISTRIBUTION','ACRES':6,'YRBLT':1980},'geometry':parcel_polygon(lon,lat,6)}]
        if mode.get('addressSearch') and params.get('resultRecordCount')==['7']:
            env=json.loads(params['geometry'][0]);lon=(env['xmin']+env['xmax'])/2;lat=(env['ymin']+env['ymax'])/2
            acres=2 if mode.get('subjectExcluded') else 6.05
            props={'PAMS_PIN':'SUBJECT-NJ','PROP_LOC':'1 HARMON PLAZA','MUN_NAME':'SECAUCUS','PROP_CLASS':'4B','CALC_ACRE':acres,'COUNTY':'HUDSON'} if nj else {'PARID':'SUBJECT-FL','SITE_ADDR_STR':'7777 SOUTHERN BLVD','PROPERTY_USE':'INDUSTRIAL','ACRES':acres,'YRBLT':1980}
            features=[{'type':'Feature','properties':props,'geometry':parcel_polygon(lon,lat,acres)}]
        if mode.get('mapInspect') and params.get('resultRecordCount')==['7']:
            env=json.loads(params['geometry'][0]);lon=(env['xmin']+env['xmax'])/2;lat=(env['ymin']+env['ymax'])/2
            features=[{'type':'Feature','properties':{'PARID':'INSPECT-HOME','SITE_ADDR_STR':'Synthetic inspection home','PROPERTY_USE':'SINGLE FAMILY RESIDENTIAL','ACRES':.2,'YRBLT':1991},'geometry':polygon(lon,lat)}]
        if params.get('returnCountOnly') == ['true']:
            respond(route, {'count': len(features)+(1 if nj and mode['countDrift'] else 0)})
        elif nj or fdor:
            offset=0 if mode['repeatPage'] else int(params.get('resultOffset',['0'])[0])
            limit=min(100,int(params.get('resultRecordCount',['150'])[0]))
            rows=features[offset:offset+limit]
            respond(route, {'type':'FeatureCollection','features':rows,'exceededTransferLimit':offset+len(rows)<len(features)})
        else:
            respond(route, {'type':'FeatureCollection','features':features,'exceededTransferLimit':mode['partial']})
        return
    route.abort()


def unlock(page):
    """Exercise the real courtesy-screen form; never bypass application code."""
    if page.locator('#accessGate').count() and page.locator('#accessGate').is_visible():
        page.fill('#accessPassword','WP123');page.click('#accessForm button')
        page.wait_for_function('!document.documentElement.hasAttribute("data-radar-locked")')
    page.evaluate('document.fonts.ready')
