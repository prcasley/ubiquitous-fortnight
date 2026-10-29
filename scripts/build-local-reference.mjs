// Produce a private, self-contained local review page. Never part of Pages deployment.
import {readFile,writeFile} from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),dist=path.join(root,'dist');
let html=await readFile(path.join(dist,'index.html'),'utf8');const data=JSON.parse(await readFile(path.join(root,'.radar/recovered-reference.json'),'utf8'));
const safeScript=s=>s.replace(/<\/script/gi,'<\\/script');
for(const match of [...html.matchAll(/<link\b[^>]*href="(assets\/[^"?]+)(?:\?[^\"]*)?"[^>]*>/g)]){
 const filename=path.join(dist,match[1]);let css=await readFile(filename,'utf8');
 for(const image of [...css.matchAll(/url\(["']?(images\/[^)'"\s]+)["']?\)/g)]){const bytes=await readFile(path.join(path.dirname(filename),image[1]));css=css.replaceAll(image[0],'url(data:image/png;base64,'+bytes.toString('base64')+')');}
 html=html.replace(match[0],()=>'<style>'+css+'</style>');
}
for(const match of [...html.matchAll(/<script\b[^>]*src="(assets\/[^"?]+)(?:\?[^\"]*)?"[^>]*><\/script>/g)]){const code=safeScript(await readFile(path.join(dist,match[1]),'utf8'));html=html.replace(match[0],()=>'<script>'+code+'</script>');}
const json=JSON.stringify(data).replaceAll('<','\\u003c');html=html.replace('</head>',()=>'<script>window.__RADAR_STANDALONE_REFERENCE__='+json+';</script></head>');
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
let licenses='';for(const name of ['assets/vendor/LEAFLET-LICENSE.txt','assets/vendor/TURF-LICENSE.txt','assets/OSMTOGEOJSON-LICENSE.txt'])licenses+='\n'+name+'\n'+await readFile(path.join(dist,name),'utf8');
html=html.replace('</body>',()=>'<template id="local-library-licenses">'+escape(licenses)+'</template></body>');
const output=process.argv[2]||path.join(root,'.radar/Capital_Radar_Local_Reference_Preview.html');await writeFile(output,html);console.log('Local-only self-contained reference preview written: '+output);
