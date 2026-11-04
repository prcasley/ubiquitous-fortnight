// Publish only the already-reviewed public archive's ownership fields; never read .radar or internal masters.
import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url),source=JSON.parse(await readFile(new URL('assets/data/recovered-reference.json',root),'utf8'));
const fields=['archiveKey','state','pcn','identity','situs','municipality','county','market','owner','ownerMailing','sourceURL'];
const records=source.records.filter(r=>typeof r.owner==='string'&&r.owner.trim()).map(r=>({...Object.fromEntries(fields.map(k=>[k,r[k]??null])),recordedInFileDate:source.fileGeneratedAt,evidenceRole:'historical-imported-assessment',currentOwnershipVerified:false}));
const payload={format:'RadarPublishedImportedOwners',version:1,sourceFile:source.sourceFile,sourceArchive:'assets/data/recovered-reference.json',recordedInFileDate:source.fileGeneratedAt,notice:'Owner names and mailing recipients recorded in the imported reference file. Not reverified current ownership, legal title, headquarters, seller willingness or acquisition contacts. Separate assessment rows may represent the same underlying parcel. No acquisition notes or deal terms included.',records};
await writeFile(new URL('assets/data/imported-owner-records.json',root),JSON.stringify(payload,null,2)+'\n');
const columns=[...fields,'recordedInFileDate','evidenceRole','currentOwnershipVerified'];
const cell=value=>'"'+String(typeof value==='string'&&/^[=+\-@\t\r]/.test(value)?"'"+value:value??'').replaceAll('"','""')+'"';
await writeFile(new URL('assets/data/imported-owner-records.csv',root),[columns.map(cell).join(','),...records.map(r=>columns.map(k=>cell(r[k])).join(','))].join('\r\n')+'\r\n');
console.log('Published imported ownership observations:',records.length,'(historical, not verified current owners).');
