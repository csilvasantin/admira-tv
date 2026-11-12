import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const canal=fs.readFileSync(new URL('./canal.html',import.meta.url),'utf8');
test('el volumen en % no se recorta a 100 %',()=>{
  const src=canal.match(/function normVolume\(v,fallback\)\{[^\n]*\}/)[0];
  const normVolume=new Function(src+';return normVolume;')();
  assert.equal(normVolume('39',NaN),0.39); assert.equal(normVolume(0.39,NaN),0.39); assert.equal(normVolume(100,NaN),1);
  assert.ok(Number.isNaN(normVolume('',NaN)));
  assert.match(canal,/if\(d\.volume!=null\)\{ volume=normVolume\(d\.volume,volume\)/);
});
test('el cursor se oculta a los 2 s de reposo',()=>{
  assert.match(canal,/html\.cursor-idle, html\.cursor-idle \*\{ cursor:none!important; \}/);
  assert.match(canal,/setTimeout\(idle,2000\)/);
});
