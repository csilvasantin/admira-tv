import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const publisher = readFileSync(new URL('./tools/publica-playlists-kioskos.py', import.meta.url), 'utf8');
const contract = readFileSync(new URL('./mcp/player-contract.md', import.meta.url), 'utf8');

test('el DGX conserva un tema de respaldo con la misma música de Jardinets', () => {
  assert.match(publisher, /"samsung-galaxy-fold-8-mupi"\s*:\s*"musica"/);
  assert.match(publisher, /"dgx-spark"\s*:\s*"musica"/);
});

test('el contrato mantiene screens únicos y comparte el circuito del Fold', () => {
  assert.match(contract, /DGX `dgx-spark` conserva[n]? un `screen` propio/);
  assert.match(contract, /circuito del Fold `samsung-galaxy-fold-8`/);
  assert.match(contract, /leader=samsung-galaxy-fold-8-mupi-tema/);
  assert.match(contract, /edición en CanalKiosk se refleja sin copiar ni republicar/);
  assert.match(contract, /no pisan telemetría y sí reciben los mismos contenidos/);
});
