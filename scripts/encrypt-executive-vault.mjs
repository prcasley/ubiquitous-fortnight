#!/usr/bin/env node
// Encrypt a private contacts JSON into assets/data/executive-vault.enc (PBKDF2-SHA256, 600,000 rounds, AES-256-GCM).
//
// The passphrase comes only from the environment and is never written anywhere:
//   RADAR_VAULT_PASSPHRASE='…' node scripts/encrypt-executive-vault.mjs --input private_build/master_contacts.json
//
// The entry screen upper-cases what is typed, so the passphrase must not contain lower-case letters.
import {readFile,writeFile,mkdir} from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {webcrypto as crypto} from 'node:crypto';
export const ITERATIONS=600000,MIN_LENGTH=16;
const b64=bytes=>Buffer.from(bytes).toString('base64'),bytes=text=>Uint8Array.from(Buffer.from(text,'base64'));
async function key(passphrase,salt,iterations,usage){const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(passphrase),{name:'PBKDF2'},false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,[usage]);}
export function checkPassphrase(passphrase,{minLength=MIN_LENGTH}={}){
 if(typeof passphrase!=='string'||!passphrase)throw Error('Set RADAR_VAULT_PASSPHRASE; the passphrase is never read from a file or an argument');
 if(passphrase!==passphrase.trim()||passphrase!==passphrase.toUpperCase())throw Error('Use a passphrase without lower-case letters or outer spaces: the entry screen upper-cases what is typed');
 if(passphrase.length<minLength)throw Error('Use a passphrase of at least '+minLength+' characters');return passphrase;}
export async function encrypt(data,passphrase,{iterations=ITERATIONS,now=new Date()}={}){
 const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),plain=new TextEncoder().encode(JSON.stringify(data));
 const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(passphrase,salt,iterations,'encrypt'),plain);
 return {v:1,alg:'AES-256-GCM',kdf:'PBKDF2-SHA256',iter:iterations,createdAt:now.toISOString().replace(/\.\d+Z$/,'Z'),salt:b64(salt),iv:b64(iv),ct:b64(new Uint8Array(ct))};}
export async function decrypt(payload,passphrase){
 const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(payload.iv)},await key(passphrase,bytes(payload.salt),Number(payload.iter)||ITERATIONS,'decrypt'),bytes(payload.ct));
 return JSON.parse(new TextDecoder().decode(plain));}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const a=process.argv.slice(2),get=(k,d)=>a.includes(k)?a[a.indexOf(k)+1]:d,root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
 const input=get('--input','private_build/master_contacts.json'),output=get('--output',path.join(root,'assets/data/executive-vault.enc'));
 try{const passphrase=checkPassphrase(process.env.RADAR_VAULT_PASSPHRASE),data=JSON.parse(await readFile(input,'utf8')),payload=await encrypt(data,passphrase);
  if(JSON.stringify(await decrypt(payload,passphrase))!==JSON.stringify(data))throw Error('Vault round trip failed');
  await mkdir(path.dirname(output),{recursive:true});await writeFile(output,JSON.stringify(payload,null,2)+'\n');
  console.log('Encrypted '+Object.keys(data.recordsByPin||data).length+' records to '+output);
 }catch(error){console.error(error.message);process.exit(1);}
}
