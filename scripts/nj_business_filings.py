#!/usr/bin/env python3
"""Read NJ public business search/detail forms or reviewed official filing exports.
Entity existence and registered-agent roles never establish parcel ownership or current occupancy.
No credential, CAPTCHA, paywall or unsupported endpoint is bypassed.
"""
import datetime as dt
import http.cookiejar
import json
import re
import urllib.parse
import urllib.request
from html.parser import HTMLParser

PORTAL = 'https://www.njportal.com/DOR/BusinessNameSearch/Search/BusinessName'
HOSTS = {'www.njportal.com', 'njportal.com', 'www.nj.gov', 'nj.gov'}

def canonical(value):
    return ''.join(c for c in str(value or '').upper() if c.isalnum())

def official_url(value, detail=False):
    u = urllib.parse.urlsplit(str(value))
    if u.scheme != 'https' or u.hostname not in HOSTS or u.username or u.password or u.port not in (None, 443):
        raise ValueError('Use a credential-free official NJ filing URL')
    if detail and (u.path.rstrip('/').lower() == urllib.parse.urlsplit(PORTAL).path.lower() or not u.path.strip('/')):
        raise ValueError('An entity-detail citation is required, not the generic search portal')
    return urllib.parse.urlunsplit(u._replace(fragment=''))

def checked_date(value):
    try:
        d = dt.datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        if d.tzinfo is None: d = d.replace(tzinfo=dt.timezone.utc)
        if d > dt.datetime.now(dt.timezone.utc): raise ValueError('Future filing observation')
        return d.isoformat()
    except (TypeError, ValueError) as exc:
        raise ValueError('Valid nonfuture filing observation date required') from exc

class Page(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.forms, self.links, self.rows, self.lines = [], [], [], []
        self.form = self.link = self.row = self.cell = None
        self.skip = 0
        self.feed(html)
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ('script', 'style'): self.skip += 1
        if tag == 'form': self.form = {'action':a.get('action',''), 'method':a.get('method','get').lower(), 'inputs':[]}; self.forms.append(self.form)
        if tag == 'input' and self.form is not None: self.form['inputs'].append(a)
        if tag == 'a': self.link = {'href':a.get('href',''), 'text':''}
        if tag == 'tr': self.row = []
        if tag in ('td','th'): self.cell = []
        if tag in ('p','div','br','dt','dd','tr'): self.lines.append('\n')
    def handle_endtag(self, tag):
        if tag in ('script','style'): self.skip = max(0,self.skip-1)
        if tag == 'form': self.form = None
        if tag == 'a' and self.link is not None: self.links.append(self.link); self.link = None
        if tag in ('td','th') and self.cell is not None:
            if self.row is not None: self.row.append(' '.join(' '.join(self.cell).split()))
            self.cell = None
        if tag == 'tr' and self.row is not None: self.rows.append(self.row); self.row = None
        if tag in ('p','div','dt','dd','tr'): self.lines.append('\n')
    def handle_data(self, data):
        if self.skip: return
        self.lines.append(data)
        if self.link is not None: self.link['text'] += data
        if self.cell is not None: self.cell.append(data)
    def fields(self):
        pairs = {canonical(r[0]):r[1].strip() for r in self.rows if len(r)==2}
        for line in ''.join(self.lines).splitlines():
            if ':' in line:
                k,v = line.split(':',1)
                if v.strip(): pairs.setdefault(canonical(k),v.strip())
        return pairs

def validate_filing(record, expected_name, *, reviewed_copy=True):
    if not isinstance(record,dict): raise ValueError('Invalid filing record')
    fields = record.get('sourceFields') or {}
    name, number = str(record.get('entityName') or '').strip(), str(record.get('entityId') or '').strip()
    if not name or canonical(name)!=canonical(expected_name) or canonical(fields.get('entityName'))!=canonical(name):
        raise ValueError('Filing entity must exactly match the researched company and source text')
    if not re.fullmatch(r'\d{10}', number) or str(fields.get('entityId') or '')!=number:
        raise ValueError('Exact NJ entity number must appear in the source fields')
    href = official_url(record.get('sourceURL'),detail=True)
    date = checked_date(record.get('observedAt'))
    if reviewed_copy and record.get('reviewed') is not True: raise ValueError('Review the official copy before importing it')
    agent = record.get('registeredAgentName')
    if agent and str(agent)!=str(fields.get('registeredAgentName')): raise ValueError('Agent name differs from the official source fields')
    contacts = []
    for kind in ('businessPhone','businessEmail'):
        value = record.get(kind)
        if value and str(value)==str(fields.get(kind)):
            contacts.append({'role':'business_filing_contact','kind':kind,'value':str(value)[:200], 'sourceURL':href,'checkedAt':date})
    return {'status':'observed','role':'business_filing_entity','entityName':name,'entityId':number,
            'registeredAgent':{'role':'state_registered_agent','name':str(agent)[:400],'sourceURL':href,'checkedAt':date} if agent else None,
            'contacts':contacts,'sourceURL':href,'checkedAt':date,
            'verification':'user-reviewed-official-copy' if reviewed_copy else 'official-page-read',
            'caveat':'Filing entity and registered-agent observations; not property title, current occupancy, beneficial control or authority to sell.'}

def parse_detail(html, company, source):
    p = Page(html); f=p.fields()
    def pick(*keys): return next((f[canonical(k)] for k in keys if f.get(canonical(k))), '')
    name=pick('Entity Name','Business Name','Legal Name'); number=pick('Entity ID','Entity Number','Business ID','Business Entity Number')
    agent=pick('Registered Agent Name','Agent Name'); phone=pick('Business Phone','Business Telephone'); email=pick('Business Email')
    r={'entityName':name,'entityId':number,'registeredAgentName':agent,'businessPhone':phone,'businessEmail':email,
       'sourceURL':source,'observedAt':dt.datetime.now(dt.timezone.utc).isoformat(),
       'sourceFields':{'entityName':name,'entityId':number,'registeredAgentName':agent,'businessPhone':phone,'businessEmail':email}}
    return validate_filing(r,company,reviewed_copy=False)

class Registry:
    def __init__(self, opener=None):
        self.opener = opener or urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())).open
        self.portal = None
        self.failure = None
    def read(self, url, data=None):
        official_url(url)
        request=urllib.request.Request(url,data=data,headers={'User-Agent':'CapitalRadarPublicResearch/1.0','Content-Type':'application/x-www-form-urlencoded'})
        with self.opener(request, timeout=20) as response:
            final=getattr(response,'url',None) or response.geturl(); official_url(final)
            body=response.read(2000001)
            if len(body)>2000000: raise ValueError('Filing page exceeds bounded size')
            return body.decode('utf-8','replace'), final
    def lookup(self, company):
        if self.failure: return {'status':'unavailable','role':'business_filing_entity','searchURL':PORTAL,'message':self.failure}
        try:
            if self.portal is None: self.portal=self.read(PORTAL)[0]
            if re.search(r'captcha',self.portal,re.I): raise ValueError('Official portal requires interactive verification')
            page=Page(self.portal); choices=[]
            for form in page.forms:
                fields=[i for i in form['inputs'] if i.get('type','text').lower() not in ('hidden','submit','button') and re.search(r'(?:business|entity|search).*name|search.*term',i.get('name',''),re.I)]
                if len(fields)==1: choices.append((form,fields[0]))
            if len(choices)!=1: raise ValueError('Official search form schema requires review; no endpoint was guessed')
            form,field=choices[0]; values={i['name']:i.get('value','') for i in form['inputs'] if i.get('name') and i.get('type','').lower()=='hidden'};values[field['name']]=company
            action=official_url(urllib.parse.urljoin(PORTAL,form['action'])); payload=urllib.parse.urlencode(values)
            if form['method']=='post': html,url=self.read(action,payload.encode())
            elif form['method']=='get': html,url=self.read(action+('&' if '?' in action else '?')+payload)
            else: raise ValueError('Unsupported official form method')
            results=Page(html);links={official_url(urllib.parse.urljoin(url,a['href']),detail=True) for a in results.links if canonical(a['text'])==canonical(company)}
            if len(links)!=1: return {'status':'ambiguous' if links else 'no-exact-name-result','role':'business_filing_entity','searchURL':PORTAL,'checkedAt':dt.datetime.now(dt.timezone.utc).isoformat(),'message':'No unique exact entity-name detail link; manual official filing review required'}
            detail,next_url=self.read(next(iter(links)));return parse_detail(detail,company,next_url)
        except Exception as exc:
            # A blocked portal or unknown form is provider-wide, not evidence of no companies.
            self.failure=str(exc)[:300]
            return {'status':'unavailable','role':'business_filing_entity','searchURL':PORTAL,'attemptedAt':dt.datetime.now(dt.timezone.utc).isoformat(),'message':self.failure}

def load_reviewed(path):
    if not path: return {}
    with open(path,encoding='utf-8') as fh: data=json.load(fh)
    if data.get('format')!='RadarNJBusinessFilings' or data.get('version')!=1 or not isinstance(data.get('records'),list): raise ValueError('Use RadarNJBusinessFilings v1 official-copy records')
    out={}
    for row in data['records']:
        checked=validate_filing(row,row.get('entityName'));key=canonical(checked['entityName'])
        if key in out and out[key]['entityId']!=checked['entityId']: raise ValueError('Multiple entity IDs share this name; explicit disambiguation required')
        out[key]=checked
    return out
