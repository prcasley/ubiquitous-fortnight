// Verify the packaged dataset at build time so Pages cannot silently omit tiles.
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../assets/footprints/',import.meta.url)),m=JSON.parse(await readFile(root+'manifest.json','utf8'));
if(m.zoom!==14||m.tiles.length!==455||new Set(m.tiles).size!==455||m.license!=='ODbL 1.0')throw Error('Unexpected hosted footprint manifest');
let count=0;
for(const key of m.tiles){
 if(!/^\d+\/\d+$/.test(key))throw Error('Unsafe tile path');
 const d=JSON.parse(await readFile(root+'z14/'+key+'.json','utf8'));
 if(d.type!=='FeatureCollection'||!Array.isArray(d.features))throw Error('Invalid tile '+key);
 for(const f of d.features){
  if(f.type!=='Feature'||f.geometry?.type!=='Polygon'||!f.geometry.coordinates.length||Object.keys(f.properties).some(k=>k!=='h'))throw Error('Unexpected footprint '+key);
  const bounds=[Infinity,Infinity,-Infinity,-Infinity];
  for(const ring of f.geometry.coordinates){
   if(ring.length<4||JSON.stringify(ring[0])!==JSON.stringify(ring.at(-1)))throw Error('Unclosed footprint '+key);
   for(const p of ring){if(p.length!==2||p.some(v=>!Number.isFinite(v))||Math.abs(p[0])>180||Math.abs(p[1])>85)throw Error('Invalid coordinate '+key);bounds[0]=Math.min(bounds[0],p[0]);bounds[1]=Math.min(bounds[1],p[1]);bounds[2]=Math.max(bounds[2],p[0]);bounds[3]=Math.max(bounds[3],p[1]);}
  }
  // Bounds substantiate the reader's one-neighbor-tile buffer and 0.75-mile inset.
  if(Math.max(bounds[2]-bounds[0],bounds[3]-bounds[1])>.0071)throw Error('Building exceeds verified tile/coverage margin');
  count++;
 }
}
if(count!==444978||count!==m.buildingCount)throw Error('Footprint count mismatch');
console.log('Verified hosted footprints: '+count+' polygons across '+m.tiles.length+' tiles.');
