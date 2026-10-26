import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,chmodSync} from 'node:fs';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import domain from '../assets/radar-domain.js';
import {feature,booleanValid} from '@turf/turf';
const providers=new Set(['regrid','reportall','attom','reonomy']);
const iso=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const sourceURL=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}};
function text(value,max){return typeof value==='string'?value.trim().slice(0,max):'';}
export class ResearchStore{
  constructor(file){
    if(file!==':memory:')mkdirSync(dirname(file),{recursive:true,mode:0o700});
    this.db=new DatabaseSync(file);
    if(file!==':memory:')chmodSync(file,0o600);
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS parcels(key TEXT PRIMARY KEY,provider TEXT NOT NULL,state TEXT NOT NULL,county TEXT NOT NULL,
        local_id TEXT NOT NULL,address TEXT NOT NULL,type TEXT NOT NULL,acres REAL,owner TEXT NOT NULL,payload TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS parcel_search ON parcels(state,county,type,acres);
      CREATE TABLE IF NOT EXISTS imports(id TEXT PRIMARY KEY,provider TEXT,imported_at TEXT,record_count INTEGER,license_ref TEXT);
      CREATE TABLE IF NOT EXISTS lists(id TEXT PRIMARY KEY,name TEXT NOT NULL,payload TEXT NOT NULL,updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS alerts(id TEXT PRIMARY KEY,list_id TEXT NOT NULL,parcel_key TEXT NOT NULL,created_at TEXT NOT NULL,payload TEXT NOT NULL);`);
  }
  close(){this.db.close();}
  importFeed(feed){
    if(feed?.version!==1||!providers.has(feed.provider))throw Error('Expected version 1 and a supported provider');
    if(!feed.license?.reference||feed.license.localStorage!==true||feed.license.search!==true)
      throw Error('Document provider permission for local storage and search before importing');
    if(!Array.isArray(feed.records)||feed.records.length===0||feed.records.length>100000)throw Error('Import must contain 1–100,000 records');
    const importedAt=new Date().toISOString(),seen=new Set();
    // Validate the entire batch before making any persistent change.
    const rows=feed.records.map(record=>{
      const state=text(record.state,2).toUpperCase(),county=text(record.countyFips,5),id=text(record.parcelId,200);
      if(!/^[A-Z]{2}$/.test(state)||!/^\d{5}$/.test(county)||!id)throw Error('Every parcel needs state, five-digit county FIPS and parcelId');
      if(!sourceURL(record.sourceURL)||!iso(record.observedAt))throw Error('Every record needs a credential-free HTTPS sourceURL and observedAt');
      let geometry=null;
      if(record.geometry){
        geometry=record.geometry;
        if(!['Point','Polygon','MultiPolygon'].includes(geometry.type)||!booleanValid(feature(geometry)))throw Error('Invalid parcel geometry');
        const validate=coordinates=>{
          if(typeof coordinates[0]==='number'){
            if(coordinates.length<2||!Number.isFinite(coordinates[0])||!Number.isFinite(coordinates[1])||Math.abs(coordinates[0])>180||Math.abs(coordinates[1])>90)throw Error('Expected WGS84 longitude/latitude');
          }else for(const child of coordinates)validate(child);
        };validate(geometry.coordinates);
      }
      const acres=record.acres==null?null:Number(record.acres);
      if(acres!==null&&(!Number.isFinite(acres)||acres<0))throw Error('Invalid acreage');
      const key=domain.parcelKey(feed.provider,state,county,id);
      if(seen.has(key))throw Error('Duplicate parcel identity in import');seen.add(key);
      const histories={};
      for(const field of ['sales','mortgages','relationships']){
        const entries=record[field]||[];
        if(!Array.isArray(entries)||entries.length>500)throw Error('Invalid '+field+' history');
        histories[field]=entries.map(entry=>{
          if(!entry||typeof entry!=='object'||!sourceURL(entry.sourceURL)||!iso(entry.observedAt))
            throw Error(field+' entries require sourceURL and observedAt');
          if(field==='relationships'&&(!entry.evidence||!['reported','verified'].includes(entry.status)))
            throw Error('Relationships require evidence and an explicit reported/verified status');
          return entry;
        });
      }
      const payload={key,provider:feed.provider,state,countyFips:county,parcelId:id,
        address:text(record.address,400),type:text(record.type,80),acres,geometry,
        ownerName:text(record.ownerName,400)||null,yearBuilt:Number.isInteger(record.yearBuilt)?record.yearBuilt:null,
        sourceURL:record.sourceURL,observedAt:record.observedAt,importedAt,
        ...histories,license:{reference:feed.license.reference,export:feed.license.export===true}};
      return payload;
    });
    const upsert=this.db.prepare(`INSERT INTO parcels VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET
      provider=excluded.provider,state=excluded.state,county=excluded.county,local_id=excluded.local_id,
      address=excluded.address,type=excluded.type,acres=excluded.acres,owner=excluded.owner,payload=excluded.payload`);
    const lists=this.lists(),find=this.db.prepare('SELECT payload FROM parcels WHERE key=?');
    const addAlert=this.db.prepare('INSERT INTO alerts VALUES(?,?,?,?,?)');
    const match=(row,filters)=>{
      if(!filters||Object.keys(filters).length===0)return false;
      for(const field of ['state','countyFips','provider','type'])if(filters[field]&&row[field]!==filters[field])return false;
      if(filters.minAcres!==undefined&&filters.minAcres!==''&&(row.acres==null||row.acres<Number(filters.minAcres)))return false;
      if(filters.maxAcres!==undefined&&filters.maxAcres!==''&&(row.acres==null||row.acres>Number(filters.maxAcres)))return false;
      if(filters.q&&![row.address,row.ownerName,row.parcelId].join(' ').toLowerCase().includes(String(filters.q).toLowerCase()))return false;
      return true;
    };
    this.db.exec('BEGIN');
    try{
      for(const row of rows){
        const stored=find.get(row.key),previous=stored?JSON.parse(stored.payload):null;
        const changed=['address','type','acres','geometry','ownerName','yearBuilt','sales','mortgages','relationships'].filter(field=>JSON.stringify(previous?.[field])!==JSON.stringify(row[field]));
        upsert.run(row.key,row.provider,row.state,row.countyFips,row.parcelId,row.address,row.type,row.acres,row.ownerName||'',JSON.stringify(row));
        if(changed.length)for(const list of lists){
          if(list.payload.parcelKeys.includes(row.key)||match(row,list.payload.filters)||(previous&&match(previous,list.payload.filters)))
            addAlert.run(randomUUID(),list.id,row.key,importedAt,JSON.stringify({listName:list.name,event:previous?'updated':'new-match',changedFields:changed,sourceURL:row.sourceURL,observedAt:row.observedAt}));
        }
      }
      this.db.prepare('INSERT INTO imports VALUES(?,?,?,?,?)').run(randomUUID(),feed.provider,importedAt,rows.length,text(feed.license.reference,1000));
      this.db.exec('COMMIT');
    }catch(error){this.db.exec('ROLLBACK');throw error;}
    return {provider:feed.provider,importedAt,count:rows.length};
  }
  search(filters={}){
    const clauses=[],values=[];
    for(const [field,column] of [['state','state'],['countyFips','county'],['provider','provider'],['type','type']]){
      if(filters[field]){clauses.push(column+' = ?');values.push(String(filters[field]));}
    }
    for(const [field,op] of [['minAcres','>='],['maxAcres','<=']]){
      if(filters[field]!==undefined&&filters[field]!==''){
        const value=Number(filters[field]);if(!Number.isFinite(value)||value<0)throw Error('Invalid acreage filter');
        clauses.push('acres '+op+' ?');values.push(value);
      }
    }
    if(filters.q){clauses.push("(instr(lower(address),lower(?))>0 OR instr(lower(owner),lower(?))>0 OR instr(lower(local_id),lower(?))>0)");const q=String(filters.q).slice(0,200);values.push(q,q,q);}
    const rawOffset=Number(filters.offset||0);
    if(!Number.isInteger(rawOffset)||rawOffset<0||rawOffset>10000000)throw Error('Invalid offset');
    const where=clauses.length?' WHERE '+clauses.join(' AND '):'';
    const total=this.db.prepare('SELECT count(*) AS count FROM parcels'+where).get(...values).count;
    const records=this.db.prepare('SELECT payload FROM parcels'+where+' ORDER BY key LIMIT 100 OFFSET ?').all(...values,rawOffset).map(row=>JSON.parse(row.payload));
    return {records,total,nextOffset:rawOffset+records.length<total?rawOffset+records.length:null};
  }
  providers(){
    const counts=new Map(this.db.prepare('SELECT provider,count(*) AS count FROM parcels GROUP BY provider').all().map(r=>[r.provider,r.count]));
    return [...providers].map(provider=>({provider,records:counts.get(provider)||0,status:counts.has(provider)?'imported-data':'not-configured',delivery:'licensed-normalized-import',liveAPI:false}));
  }
  lists(){return this.db.prepare('SELECT * FROM lists ORDER BY updated_at DESC').all().map(r=>({...r,payload:JSON.parse(r.payload)}));}
  alerts(){return this.db.prepare('SELECT * FROM alerts ORDER BY created_at DESC,id DESC LIMIT 100').all().map(r=>({...r,payload:JSON.parse(r.payload)}));}
  saveList(input){
    const name=text(input.name,120);if(!name)throw Error('A list name is required');
    if(!Array.isArray(input.parcelKeys)||input.parcelKeys.length>1000||input.parcelKeys.some(k=>typeof k!=='string'||k.length>1000))throw Error('Invalid parcel keys');
    if(input.filters&&(typeof input.filters!=='object'||Array.isArray(input.filters)))throw Error('Invalid saved filters');
    if(input.filters)this.search(input.filters);
    const id=randomUUID(),time=new Date().toISOString();
    const payload={parcelKeys:[...new Set(input.parcelKeys)],note:text(input.note,2000),filters:input.filters||null};
    this.db.prepare('INSERT INTO lists VALUES(?,?,?,?)').run(id,name,JSON.stringify(payload),time);
    return {id,name,payload,updated_at:time};
  }
  deleteList(id){return this.db.prepare('DELETE FROM lists WHERE id=?').run(id).changes>0;}
}
