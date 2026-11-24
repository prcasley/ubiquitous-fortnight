/* Evidence-gated contact association. Syntax and URL presence never prove a contact. */
(function(g){'use strict';
const suffix={STREET:'ST',AVENUE:'AVE',ROAD:'RD',BOULEVARD:'BLVD',DRIVE:'DR',LANE:'LN',COURT:'CT',NORTH:'N',SOUTH:'S',EAST:'E',WEST:'W'};
const TYPE=/\s+(BOROUGH|BORO|TOWNSHIP|TWP|CITY|TOWN|VILLAGE)\.?$/;
// Postal/carrier city names that differ from the assessment municipality name.
const ALIAS={'PARSIPPANY TR HLS':['PARSIPPANY'],'PARSIPPANY-TROY HILLS':['PARSIPPANY']};
// Base names used by more than one NJ municipality: a street match alone cannot tell them apart.
const SHARED=new Set(['WASHINGTON','FRANKLIN','HAMILTON','UNION','MONROE','GREENWICH','SPRINGFIELD','OCEAN','LAWRENCE','MANSFIELD','GLOUCESTER','EGG HARBOR','FAIRFIELD','HOPEWELL','BURLINGTON','PEMBERTON','CHESTER','MENDHAM','BOONTON','ROCKAWAY','FREEHOLD','LEBANON','CLINTON','BERLIN','MILLSTONE']);
const upper=s=>String(s||'').toUpperCase().replace(/\s+/g,' ').trim();
const town=s=>upper(s).replace(TYPE,'').trim();
// Every city spelling a carrier filing may use for this municipality. "ORANGE CITY TWP" files as ORANGE;
// "GLOUCESTER CITY" files as GLOUCESTER CITY; "JERSEY CITY CITY" files as JERSEY CITY.
function towns(s){const raw=upper(s),base=town(raw),out=new Set(base?[base]:[]);
 if(/\sCITY$/.test(raw))out.add(raw);
 if(/\sCITY\s+(TWP|TOWNSHIP)\.?$/.test(raw))out.add(base.replace(/\s+CITY$/,''));
 for(const a of ALIAS[base]||ALIAS[raw]||[])out.add(a);
 return [...out].filter(Boolean);}
// A bare name matches a municipality's aliases; two different municipality types never match through a shared base
// (UNION TWP is not UNION CITY).
const sameTown=(a,b)=>{const x=upper(a),y=upper(b);if(!x||!y)return false;return towns(x).includes(y)||towns(y).includes(x)||(town(x)===town(y)&&!/\sCITY$/.test(x)&&!/\sCITY$/.test(y));};
const sharedTown=s=>SHARED.has(town(s));
const street=s=>String(s||'').split(',')[0].toUpperCase().replace(/\b(UNIT|SUITE|STE|APT)\b.*$/,'').replace(/[.]/g,'').split(/\s+/).map(x=>suffix[x]||x).join(' ').trim();
// Secondary address matches are review leads. Keep directions and street types in the comparison.
const reviewStreet=s=>street(s).replace(/\b(?:CENTER|CTR)\b/g,'CTR').replace(/\b(?:TURNPIKE|TPKE)\b/g,'TPKE').replace(/\bSAINT\b/g,'ST').replace(/\bMEADOWLANDS\b/g,'MEADOWLAND');
function houseRange(first){
 const pieces=/^(\d{1,6})-(\d{1,6})$/.exec(first);
 if(!pieces)return null;
 const start=Number(pieces[1]),end=Number(pieces[2]);
 return start>0&&end>start&&end-start<=100?{start,end}:null;
}
function addressMatch(address,candidate,range){
 const wanted=street(address),found=street(candidate);
 if(wanted===found)return /^\d+-\d+ /.test(wanted)?'range':'exact';
 const [first,...rest]=reviewStreet(wanted).split(' '),[number,...filed]=reviewStreet(found).split(' ');
 if(!rest.length||rest.join(' ')!==filed.join(' '))return null;
 if(range&&/^\d+$/.test(number)&&Number(number)>=range.start&&Number(number)<=range.end)return 'range';
 return first===number?'spelling':null;
}
const phone=s=>String(s||'').replace(/\D/g,'').replace(/^1(?=\d{10}$)/,'');
const safe=u=>{try{return new URL(u).protocol==='https:'}catch{return false}};
function parcel(r){return {id:r.id||r.parcelId,address:r.original?.PROP_LOC||r.facts?.PROP_LOC||r.address,city:r.original?.MUN_NAME||r.facts?.MUN_NAME||r.municipality,state:r.state||'NJ'};}
// Age of the carrier's own filing (MCS-150), separate from when we downloaded it.
function filingAge(value,now=Date.now()){const raw=String(value||'').trim();const iso=/^\d{8}$/.test(raw)?raw.slice(0,4)+'-'+raw.slice(4,6)+'-'+raw.slice(6,8):raw.slice(0,10);const t=Date.parse(iso);if(!/^\d{4}-\d{2}-\d{2}$/.test(iso)||!Number.isFinite(t)||t>now)return {date:null,days:null,status:'unknown'};const days=Math.floor((now-t)/86400000);return {date:iso,days,status:days>730?'old':'current'};}
function verify(p,c,now=Date.now()){
 p=parcel(p);const associated=!!p.id&&p.id===c.parcelId&&street(p.address)===street(c.address)&&!!town(p.city)&&sameTown(p.city,c.city)&&p.state===c.state;
 const fresh=Number.isFinite(Date.parse(c.checkedAt))&&Date.parse(c.checkedAt)<=now&&now-Date.parse(c.checkedAt)<=90*86400000;
 const fields=(c.fields||[]).filter(f=>associated&&fresh&&c.company&&c.role&&f.company===c.company&&safe(f.sourceUrl)&&f.evidenceValue===f.value&&['source-observed','human-reviewed'].includes(f.method)&&((f.type==='phone'&&/^[2-9]\d{2}[2-9]\d{6}$/.test(phone(f.value)))||(f.type==='email'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.value))));
 const filing=filingAge(c.filingDate,now);return {associated,fields,filing,status:!associated?'Address or parcel mismatch':!fresh?'Needs a fresh source check':fields.length?'Source-supported business contact':'Needs verification'};
}
function fromCarrier(p,row,sourceUrl,checkedAt){p=parcel(p);const company=row.legal_name||row.dba_name||'';return {parcelId:p.id,address:row.phy_street,city:row.phy_city,state:row.phy_state,company,role:p.state==='NJ'&&sharedTown(p.city)?'Carrier at a matching street address — this town name is used by more than one NJ municipality; confirm the location. Ownership unconfirmed':'On-site carrier — ownership unconfirmed',checkedAt,filingDate:row.mcs150_date||null,fields:[['phone',row.phone],['email',row.email_address]].filter(x=>x[1]).map(([type,value])=>({type,value,evidenceValue:value,company,sourceUrl,method:'source-observed'}))};}
const SOURCE='https://data.transportation.gov/resource/az4n-8mr2.json?';
const quote=v=>"'"+String(v).replaceAll("'","''")+"'";
async function rowsFor(params,fetcher){const res=await fetcher(SOURCE+new URLSearchParams(params),{credentials:'omit',signal:AbortSignal.timeout(20000)});if(!res.ok)throw Error('Carrier source unavailable ('+res.status+')');const rows=await res.json();if(!Array.isArray(rows))throw Error('Unexpected carrier response');return rows;}
// Query a bounded set of street numbers and keep approximate or inactive matches out of callable contacts.
async function lookup(r,fetcher=g.fetch){const p=parcel(r);
 if(!['NJ','FL','PA'].includes(p.state)||!p.id||!p.city)return {status:'Carrier search needs a supported state, parcel ID and municipality',contacts:[]};
 const contacts=[],leads=[],names=p.state==='NJ'?towns(p.city):[upper(p.city)].filter(Boolean),wanted=street(p.address),first=wanted.split(' ')[0];
 if(!names.length||!/^\d[0-9A-Z\/-]*$/.test(first))return {status:'Carrier search needs a published municipality and street number',contacts:[]};
 const townWhere="phy_state="+quote(p.state)+" AND upper(phy_city) in ("+names.map(quote).join(',')+")";
 const range=houseRange(first),prefixes=range?[first,...Array.from({length:range.end-range.start+1},(_,i)=>String(range.start+i))]:[first];
 const filters=prefixes.map(number=>'upper(phy_street) like '+quote(number+' %'));
 const narrow=' AND '+(range?'('+filters.join(' OR ')+')':filters[0]);
 let complete=false;
 for(let offset=0;offset<10000;offset+=1000){const rows=await rowsFor({$where:townWhere+narrow,$order:'dot_number',$limit:'1000',$offset:String(offset),$select:'dot_number,legal_name,dba_name,phy_street,phy_city,phy_state,phone,email_address,mcs150_date,status_code'},fetcher);
  for(const row of rows){
   if(row.phy_state!==p.state||!(p.state==='NJ'?sameTown(row.phy_city,p.city):upper(row.phy_city)===upper(p.city)))continue;
   const match=addressMatch(p.address,row.phy_street,range);
   if(!match||!/^\d+$/.test(String(row.dot_number)))continue;
   const sourceUrl=SOURCE+new URLSearchParams({$where:'dot_number='+Number(row.dot_number)});
   if(match==='exact'&&row.status_code==='A')contacts.push(fromCarrier(p,row,sourceUrl,new Date().toISOString()));
   else if(row.status_code==='A'||match==='exact')leads.push({
    company:row.legal_name||row.dba_name||'',address:row.phy_street,filingDate:row.mcs150_date||null,
    reason:row.status_code==='A'?(match==='range'?'Street number within reported range':'Address spelling variant'):'Carrier status not active',
    sourceUrl
   });
  }
  if(rows.length<1000){complete=true;break;}}
 if(!complete)return {status:'Partial carrier search: source limit reached',contacts,leads,complete};
 if(contacts.length)return {status:p.state==='NJ'&&sharedTown(p.city)?'Carrier contacts found — confirm the town, this name is shared by more than one NJ municipality':'Carrier contacts found',contacts,leads,complete};
 if(leads.length)return {status:'No contact found yet',contacts,leads,complete};
 // No match: tell "nothing at this address" apart from "this town name is not used in carrier filings".
 let listed=null;try{const count=await rowsFor({$select:'count(*) as n',$where:townWhere},fetcher);listed=Number(count[0]?.n);}catch{}
 if(listed===0)return {status:'No carrier records are filed under '+names.join(' / ')+'. Filings use postal city names, so this is not a confirmed absence; research other business sources.',contacts,complete:false,townListed:false};
 return {status:'No active carrier match; other business sources still need research',contacts,complete,townListed:listed>0?true:null};
}
const api={parcel,street,town,towns,sameTown,sharedTown,verify,fromCarrier,lookup,filingAge};g.RadarContactVerifier=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
