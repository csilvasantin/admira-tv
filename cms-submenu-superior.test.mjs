import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const cms = await readFile(new URL('./cms.html', import.meta.url), 'utf8');

test('Programática agrupa el submenú bajo la navegación y antes de EN EMISIÓN', () => {
  const nav = cms.indexOf('<script src="/admira-nav.js');
  const programatica = cms.indexOf('<details class="programatica" id="programatica">');
  const kpis = cms.indexOf('<div class="kpis">');
  const filters = cms.indexOf('<div class="cmsfilter">');
  const emission = cms.indexOf('<section class="emitBoard" id="emitBoard">');
  const cards = cms.indexOf('<div class="grid" id="grid">');

  assert.ok(nav >= 0 && nav < programatica, 'el menú superior debe montarse antes de Programática');
  assert.ok(programatica < kpis, 'Programática debe contener los indicadores');
  assert.ok(kpis < filters, 'los indicadores preceden a búsqueda y filtros');
  assert.ok(filters < emission, 'el submenú completo debe quedar sobre EN EMISIÓN');
  assert.ok(emission < cards, 'la tabla viva conserva prioridad sobre las fichas');
});

test('Programática parte compactada y se despliega con el control nativo', () => {
  assert.match(cms, /<details class="programatica" id="programatica">\s*<summary>Programática/);
  assert.doesNotMatch(cms, /<details class="programatica" id="programatica"[^>]*\sopen(?:\s|>)/);
  assert.match(cms, /\.programatica\[open\] \.programaticaHint::after\{content:'compactar'\}/);
  assert.match(cms, /\.programatica:not\(\[open\]\) \.programaticaHint::after\{content:'desplegar'\}/);
});

test('mover el submenú no duplica controles ni rompe sus IDs', () => {
  for (const id of ['k-total', 'k-online', 'k-aud', 'k-off', 'k-robot', 'k-rev', 'cmsSearch', 'cmsSort', 'filterCount']) {
    assert.equal((cms.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `${id} debe existir una sola vez`);
  }
});
