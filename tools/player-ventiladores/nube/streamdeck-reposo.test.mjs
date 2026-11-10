import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizarReposo } from './streamdeck-reposo.mjs';

test('reposo válido se guarda recortado y con pieza', () => {
  const r = normalizarReposo({ estado: 'reposo', desde: 1, ts: 2, fuente: 'elgato-screensaver',
    playlist: { screen: 'admira-tv-streamdeck', name: 'admira.tv StreamDeck', rev: 9, total: 5 },
    pieza: { id: '1791993523684-fts4hw', title: 'x'.repeat(300), index: 0, total: 5, poster: 'https://stock.admira.store/stock/a/poster.jpg' } }, 100);
  assert.equal(r.estado, 'reposo');
  assert.equal(r.pieza.title.length, 120);
  assert.equal(r.pieza.poster, 'https://stock.admira.store/stock/a/poster.jpg');
  assert.equal(r.recibido, 100);
});

test('sin señal o señal rara no se guarda nada (retrocompatible)', () => {
  for (const v of [undefined, null, 'reposo', [], { estado: 'dormido' }]) assert.equal(normalizarReposo(v), null);
  const a = normalizarReposo({ estado: 'activo' }, 50);
  assert.equal(a.estado, 'activo');
  assert.equal(a.ts, 50);
  assert.equal(a.pieza, null);
  assert.equal(normalizarReposo({ estado: 'reposo', pieza: { id: 'x', poster: 'javascript:alert(1)' } }).pieza.poster, '');
});
