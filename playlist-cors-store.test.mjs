// /api/playlist legible desde admira.store (gemelo del Hotel Creel), solo GET y sin credenciales (13-nov-2026)
import assert from 'node:assert/strict';
import test from 'node:test';
import { onRequestOptions } from './functions/api/playlist.js';

const options = origin => onRequestOptions({ request: new Request('https://admira.tv/api/playlist?screen=hotel-creel', { method: 'OPTIONS', headers: origin ? { Origin: origin } : {} }) });

test('admira.store puede leer la playlist (GET, OPTIONS) y nada más', async () => {
  for (const origin of ['https://www.admira.store', 'https://admira.store', 'http://127.0.0.1:8781']) {
    const res = await options(origin);
    assert.equal(res.status, 204);
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), origin);
    assert.equal(res.headers.get('Access-Control-Allow-Methods'), 'GET, OPTIONS');
    assert.equal(res.headers.get('Access-Control-Allow-Headers'), 'Content-Type');
    assert.equal(res.headers.get('Access-Control-Allow-Credentials'), null);
  }
});

test('otros orígenes siguen sin CORS y pixeria conserva el POST con clave', async () => {
  assert.equal((await options('https://ejemplo.com')).headers.get('Access-Control-Allow-Origin'), null);
  assert.equal((await options('https://www.pixeria.com')).headers.get('Access-Control-Allow-Methods'), 'GET, POST, OPTIONS');
});
