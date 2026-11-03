import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
test('every shipped first-party browser script parses without executing it',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');let checked=0;
 for(const match of html.matchAll(/<script[^>]+src="(assets\/[^"?]+)(?:\?[^\"]*)?"/g)){
  const path=match[1];if(path.startsWith('assets/vendor/')||path==='assets/osmtogeojson.js')continue;
  assert.ok(!path.includes('..'));new vm.Script(readFileSync(new URL('../'+path,import.meta.url),'utf8'),{filename:path});checked++;
 }
 assert.ok(checked>=20,'Expected the application script set, not an empty HTML match');
});
