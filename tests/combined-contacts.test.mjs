import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);const V=require('../assets/radar-contact-verifier.js');
const now=Date.parse('2026-11-10T12:00:00Z');
test('carrier filing age is judged from the filing date, not the download time',()=>{
 assert.deepEqual(V.filingAge('20261022',now),{date:'2026-10-22',days:19,status:'current'});
 assert.equal(V.filingAge('20021020',now).status,'old');
 assert.equal(V.filingAge('2027-01-01',now).status,'unknown');
 assert.equal(V.filingAge('',now).status,'unknown');
 const p={id:'1201_304_5',address:'351 ROOSEVELT AVE',municipality:'CARTERET BORO',state:'NJ'};
 const c={parcelId:'1201_304_5',address:'351 Roosevelt Avenue',city:'Carteret',state:'NJ',company:'X',role:'r',checkedAt:'2026-11-10',filingDate:'20021020',fields:[]};
 assert.equal(V.verify(p,c,now).filing.status,'old');});
test('decrypted contacts persist for the tab session; the code never does; lock clears them',async()=>{
 const store=new Map();globalThis.sessionStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
 const Vault=require('../assets/radar-executive-vault.js');const {execFileSync}=await import('node:child_process');const fs=await import('node:fs');const os=await import('node:os');const path=await import('node:path');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vs-')),plain=path.join(dir,'c.json'),enc=path.join(dir,'v.enc');fs.writeFileSync(plain,JSON.stringify({recordsByPin:{'1201_304_5':{company:'SYNTHETIC'}}}));
 execFileSync('python3',[path.resolve('scripts/encrypt_executive_vault.py'),'--input',plain,'--output',enc],{env:{...process.env,RADAR_EXEC_PASSPHRASE:'CODE9'}});
 globalThis.fetch=async()=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(enc,'utf8'))});
 await Vault.unlockExecutiveContactVault('CODE9','x');assert.ok([...store.values()].every(v=>!v.includes('CODE9')));
 Vault.lockExecutiveContactVault();assert.equal(Vault.isVaultUnlocked(),false);assert.equal(Vault.restoreVaultSession(),false);
 await Vault.unlockExecutiveContactVault('CODE9','x');assert.equal(Vault.restoreVaultSession(),true);assert.equal(Vault.getExecutiveRecordForParcel('1201_304_5').company,'SYNTHETIC');});
