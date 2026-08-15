import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const cms = await readFile(new URL('./cms.html', import.meta.url), 'utf8');
const stats = await readFile(new URL('./estadisticas/index.html', import.meta.url), 'utf8');

test('el CMS cuenta los pases del contenido actual desde proof-of-play', () => {
  assert.match(cms, /api\.admira\.store\/emit\/range\?loc=/);
  assert.match(cms, /day\.assets&&day\.assets\[info\.id\]/);
  assert.match(cms, /<b>'\+passes\.count\+'<\/b> pases hoy/);
  assert.match(cms, /\/estadisticas\/\?screen=/);
});

test('Estadísticas ofrece día, semana, mes e histórico real por player', () => {
  for (const p of ['day','week','month','history']) assert.match(stats, new RegExp('data-period="'+p+'"'));
  assert.match(stats, /\/emit\/range\?loc=/);
  assert.match(stats, /\/signage\/now\?screen=/);
  assert.match(stats, /\/signage\/screens\?/);
  assert.match(stats, /\/api\/playout\?screen=/);
  assert.match(stats, /function aggregate\(days\)/);
  assert.match(stats, /renderAssets\(agg\.assets,currentId\)/);
  assert.match(stats, /renderDays\(agg\.daily\)/);
});

test('el script inline de Estadísticas conserva sintaxis válida', () => {
  const scripts=[...stats.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(Boolean);
  scripts.forEach((source,i)=>assert.doesNotThrow(()=>new vm.Script(source),`script inline ${i}`));
});
