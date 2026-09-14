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

// Topics anónimos (Jobs #3275 · FLT-100418): solo con XTORE_AUDIENCE_TOPICS, solo vocabulario de Pixeria, solo personas.
test('sin XTORE_AUDIENCE_TOPICS, sex/age_band siguen prohibidos; con la lista, viajan validados y solo para person', async () => {
  const off = environment(); let calls = [];
  assert.equal((await onRequestPost({ env: off, request: req({ screen: 'xtore-virtual-zapatillas', kind: 'person', sex: 'f' }), fetchImpl: bus(calls) })).status, 400);
  assert.equal(calls.length, 0);
  const on = { ...environment(), XTORE_AUDIENCE_TOPICS: 'sex,age_band' }; calls = [];
  const r = await onRequestPost({ env: on, request: req({ screen: 'xtore-virtual-zapatillas', kind: 'person', sex: 'f', age_band: 'adulto' }), fetchImpl: bus(calls) });
  assert.equal(r.status, 200); const out = await r.json(); assert.equal(out.sex, 'f'); assert.equal(out.age_band, 'adulto');
  const sent = JSON.parse(calls[0].init.body); assert.equal(sent.sex, 'f'); assert.equal(sent.age_band, 'adulto'); assert.equal(sent.kind, 'person');
  assert.deepEqual(Object.keys(sent).sort(), ['age_band', 'confidence', 'kind', 'sex', 'source', 'ts']);
  for (const body of [{ screen: 'xtore-virtual-zapatillas', kind: 'person', sex: 'x' }, { screen: 'xtore-virtual-zapatillas', kind: 'person', age_band: '30-55' }, { screen: 'xtore-virtual-zapatillas', kind: 'person', face: 'data:…' }]) {
    calls = []; assert.equal((await onRequestPost({ env: on, request: req(body), fetchImpl: bus(calls) })).status, 400); assert.equal(calls.length, 0);
  }
  calls = []; await onRequestPost({ env: on, request: req({ screen: 'xtore-virtual-zapatillas', kind: 'car', sex: 'm', age_band: 'joven' }), fetchImpl: bus(calls) });
  assert.equal(JSON.parse(calls[0].init.body).sex, 'u'); assert.equal(JSON.parse(calls[0].init.body).age_band, 'unknown');
  const only = { ...environment(), XTORE_AUDIENCE_TOPICS: 'age_band' }; calls = [];
  assert.equal((await onRequestPost({ env: only, request: req({ screen: 'xtore-virtual-zapatillas', kind: 'person', sex: 'f' }), fetchImpl: bus(calls) })).status, 400);
});
