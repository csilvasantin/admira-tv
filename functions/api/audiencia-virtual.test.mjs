import test from 'node:test'; import assert from 'node:assert/strict';
import { onRequestPost } from './audiencia-virtual.js';
function environment(email = 'csilva@admira.com', { key = 'k'.repeat(40), registered = true } = {}) {
  return {
    ACCESS: { async get(k) { return k === 'admira-tv:auth:session:test' ? JSON.stringify({ email, expiresAt: Date.now() + 60000 }) : null; } },
    VIRTUAL_PLAYERS: { getByName() { return { async readPlayer() { return registered ? { screen: 'xtore-virtual-zapatillas', mode: 'conditional' } : null; } }; } },
    XTORE_AUDIENCE_FLEET_KEY: key,
  };
}
const req = (body, headers = {}) => new Request('https://admira.tv/api/audiencia-virtual', { method: 'POST', headers: { Cookie: '__Host-atv_session=test', Origin: 'https://admira.tv', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const bus = calls => async (url, init) => { calls.push({ url, init }); return Response.json({ ok: true, decision: { lane: 'Coche' } }); };

test('solo la categoría viaja al bus, con la clave del servidor', async () => {
  const calls = []; const r = await onRequestPost({ env: environment(), request: req({ screen: 'xtore-virtual-zapatillas', kind: 'car' }), fetchImpl: bus(calls) });
  assert.equal(r.status, 200); assert.equal((await r.json()).lane, 'Coche');
  assert.equal(calls[0].url, 'https://mcp-tv.admira.store/audience/xtore-virtual-zapatillas');
  assert.equal(calls[0].init.headers.authorization, 'Bearer ' + 'k'.repeat(40));
  assert.deepEqual(Object.keys(JSON.parse(calls[0].init.body)).sort(), ['age_band', 'confidence', 'kind', 'sex', 'source', 'ts']);
  assert.equal(JSON.parse(calls[0].init.body).sex, 'u');
});
test('sin sesión, otro origen, visitante, campos extra o pantalla no virtual: nada llega al bus', async () => {
  for (const [env, body, headers, status] of [
    [environment(), { screen: 'xtore-virtual-zapatillas', kind: 'car' }, { Cookie: '' }, 401],
    [environment(), { screen: 'xtore-virtual-zapatillas', kind: 'car' }, { Origin: 'https://evil.example' }, 403],
    [environment('viewer@example.org'), { screen: 'xtore-virtual-zapatillas', kind: 'car' }, {}, 403],
    [environment(), { screen: 'xtore-virtual-zapatillas', kind: 'person', sex: 'f' }, {}, 400],
    [environment(), { screen: 'ipad-luma-mupi', kind: 'car' }, {}, 400],
    [environment(undefined, { registered: false }), { screen: 'xtore-virtual-zapatillas', kind: 'car' }, {}, 404],
    [environment(undefined, { key: '' }), { screen: 'xtore-virtual-zapatillas', kind: 'car' }, {}, 503],
  ]) { const calls = []; const r = await onRequestPost({ env, request: req(body, headers), fetchImpl: bus(calls) }); assert.equal(r.status, status); assert.equal(calls.length, 0); }
});
test('«none» no se publica: el bus caduca solo', async () => {
  const calls = []; const r = await onRequestPost({ env: environment(), request: req({ screen: 'xtore-virtual-zapatillas', kind: 'none' }), fetchImpl: bus(calls) });
  assert.equal(r.status, 200); assert.equal((await r.json()).relayed, false); assert.equal(calls.length, 0);
});
