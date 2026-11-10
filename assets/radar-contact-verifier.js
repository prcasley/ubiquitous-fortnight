/* Evidence-gated contact association. Syntax and URL presence never prove a contact. */
(function(g){'use strict';
const suffix={STREET:'ST',AVENUE:'AVE',ROAD:'RD',BOULEVARD:'BLVD',DRIVE:'DR',LANE:'LN',COURT:'CT',NORTH:'N',SOUTH:'S',EAST:'E',WEST:'W'};
const town=s=>String(s||'').toUpperCase().replace(/\b(BOROUGH|BORO|TOWNSHIP|TWP|CITY|TOWN)\.?$/,'').trim();
const street=s=>String(s||'').split(',')[0].toUpperCase().replace(/\b(UNIT|SUITE|STE|APT)\b.*$/,'').replace(/[.]/g,'').split(/\s+/).map(x=>suffix[x]||x).join(' ').trim();
const phone=s=>String(s||'').replace(/\D/g,'').replace(/^1(?=\d{10}$)/,'');
const safe=u=>{try{return new URL(u).protocol==='https:'}catch{return false}};
function parcel(r){return {id:r.id||r.parcelId,address:r.original?.PROP_LOC||r.facts?.PROP_LOC||r.address,city:r.original?.MUN_NAME||r.facts?.MUN_NAME||r.municipality,state:r.state||'NJ'};}
function verify(p,c,now=Date.now()){
 p=parcel(p);const associated=!!p.id&&p.id===c.parcelId&&street(p.address)===street(c.address)&&!!town(p.city)&&town(p.city)===town(c.city)&&p.state===c.state;
 const fresh=Number.isFinite(Date.parse(c.checkedAt))&&Date.parse(c.checkedAt)<=now&&now-Date.parse(c.checkedAt)<=90*86400000;
 const fields=(c.fields||[]).filter(f=>associated&&fresh&&c.company&&c.role&&f.company===c.company&&safe(f.sourceUrl)&&f.evidenceValue===f.value&&['source-observed','human-reviewed'].includes(f.method)&&((f.type==='phone'&&/^[2-9]\d{2}[2-9]\d{6}$/.test(phone(f.value)))||(f.type==='email'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.value))));
 return {associated,fields,status:!associated?'Address or parcel mismatch':!fresh?'Needs a fresh source check':fields.length?'Source-supported business contact':'Needs verification'};
}
function fromCarrier(p,row,sourceUrl,checkedAt){p=parcel(p);const company=row.legal_name||row.dba_name||'';return {parcelId:p.id,address:row.phy_street,city:row.phy_city,state:row.phy_state,company,role:'On-site carrier — ownership unconfirmed',checkedAt,filingDate:row.mcs150_date||null,fields:[['phone',row.phone],['email',row.email_address]].filter(x=>x[1]).map(([type,value])=>({type,value,evidenceValue:value,company,sourceUrl,method:'source-observed'}))};}
async function lookup(r,fetcher=g.fetch){const p=parcel(r);if(p.state!=='NJ'||!p.city)return {status:'Source unavailable: municipality missing',contacts:[]};const contacts=[];const city=town(p.city).replaceAll("'","''");let complete=false;
 for(let offset=0;offset<10000;offset+=1000){const q=new URLSearchParams({$where:"phy_state='NJ' AND upper(phy_city)='"+city+"'",$order:'dot_number',$limit:'1000',$offset:String(offset),$select:'dot_number,legal_name,dba_name,phy_street,phy_city,phy_state,phone,email_address,mcs150_date,status_code'});const url='https://data.transportation.gov/resource/az4n-8mr2.json?'+q;const res=await fetcher(url,{credentials:'omit',signal:AbortSignal.timeout(20000)});if(!res.ok)throw Error('Carrier source unavailable ('+res.status+')');const rows=await res.json();if(!Array.isArray(rows))throw Error('Unexpected carrier response');for(const row of rows){if(row.status_code!=='A'||street(row.phy_street)!==street(p.address)||town(row.phy_city)!==town(p.city)||row.phy_state!=='NJ')continue;contacts.push(fromCarrier(p,row,'https://data.transportation.gov/resource/az4n-8mr2.json?'+new URLSearchParams({$where:'dot_number='+Number(row.dot_number)}),new Date().toISOString()));}if(rows.length<1000){complete=true;break;}}
 return {status:complete?(contacts.length?'Carrier contacts found':'No active carrier match; other business sources still need research'):'Partial carrier search: source limit reached',contacts,complete};
}
const api={parcel,street,town,verify,fromCarrier,lookup};g.RadarContactVerifier=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
