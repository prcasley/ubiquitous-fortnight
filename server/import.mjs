import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {ResearchStore} from './research-store.mjs';
import {databasePath} from './runtime-config.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
if(!process.argv[2])throw Error('Usage: node server/import.mjs /private/path/normalized-provider-feed.json');
const store=new ResearchStore(databasePath(process.env,root));
try{const result=store.importFeed(JSON.parse(await readFile(process.argv[2],'utf8')));console.log(JSON.stringify(result));}
finally{store.close();}
