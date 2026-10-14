// Pure unit acceptance: no network, credentials or product writes.
// Run: node --test gestor-colas-room-client.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomClient, PendingOrder } from './gestorColas/room-client.mjs';

const response = data => ({ ok: true, status: 200, json: async () => ({ ok: true, ...data }) });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key), values };
}
function controlledFetch() {
  const requests = [];
  return { requests, fetchImpl: (url, options) => { const d = deferred(); requests.push({ url, options, ...d }); return d.promise; } };
}

test('timeout finishes even when fetch ignores abort; later request can recover', async () => {
  const transport = controlledFetch(), client = new RoomClient('room-a', { ...transport, timeout: 25 });
  const attempt = client.state();
  let guard;
  try {
    await assert.rejects(Promise.race([attempt, new Promise((_, reject) => { guard = setTimeout(() => reject(new Error('Timeout did not settle request')), 750); })]), e => e.code === 'timeout');
  } finally { clearTimeout(guard); }
  assert.equal(transport.requests[0].options.signal.aborted, true);
  assert.equal(client.controllers.size, 0);
  const next = client.state();
  transport.requests[1].resolve(response({ recibido: [{ id: 'new' }] }));
  assert.equal((await next).recibido[0].id, 'new');
  transport.requests[0].resolve(response({ recibido: [{ id: 'late' }] }));
});

test('switch room rejects old in-flight state and old snapshot cannot send a mutation', async () => {
  const transport = controlledFetch(), client = new RoomClient('room-a', { ...transport, timeout: 500 });
  const oldContext = client.snapshot(), old = client.state();
  const stale = assert.rejects(old, e => e.code === 'stale');
  client.switch('room-b');
  await stale;
  assert.equal(transport.requests[0].options.signal.aborted, true);
  await assert.rejects(client.request('avanzar', { pedido: 'old-id', a: 'listo' }, oldContext), e => e.code === 'stale');
  assert.equal(transport.requests.length, 1, 'No stale action sent');
  const fresh = client.state();
  transport.requests[1].resolve(response({ sala: 'room-b', recibido: [{ id: 'b' }] }));
  assert.equal((await fresh).sala, 'room-b');
  transport.requests[0].resolve(response({ sala: 'room-a', recibido: [{ id: 'a' }] }));
  assert.equal(client.room, 'room-b');
});

test('state coalesces concurrent reads and creates a fresh request after settlement', async () => {
  const transport = controlledFetch(), client = new RoomClient('room-a', { ...transport, timeout: 500 });
  const first = client.state(), second = client.state();
  assert.strictEqual(second, first);
  assert.equal(transport.requests.length, 1);
  transport.requests[0].resolve(response({ sala: 'room-a' }));
  await first;
  const third = client.state();
  assert.notStrictEqual(third, first);
  assert.equal(transport.requests.length, 2);
  transport.requests[1].resolve(response({ sala: 'room-a' }));
  await third;
});

test('invalidateState prevents old read overwriting new state or clearing new pending read', async () => {
  const transport = controlledFetch(), client = new RoomClient('room-a', { ...transport, timeout: 500 });
  assert.equal(typeof client.invalidateState, 'function');
  const old = client.state();
  const stale = assert.rejects(old, e => e.code === 'stale');
  client.invalidateState();
  const fresh = client.state();
  assert.notStrictEqual(fresh, old);
  assert.equal(transport.requests.length, 2);
  transport.requests[0].resolve(response({ recibido: [{ id: 'before-mutation' }] }));
  await stale;
  assert.strictEqual(client.state(), fresh, 'Old finally must not clear the new read');
  assert.equal(transport.requests.length, 2);
  transport.requests[1].resolve(response({ recibido: [{ id: 'after-mutation' }] }));
  assert.equal((await fresh).recibido[0].id, 'after-mutation');
});

test('state invalidation leaves same-room mutation snapshot valid', async () => {
  const transport = controlledFetch(), client = new RoomClient('room-a', { ...transport, timeout: 500 });
  const mutationContext = client.snapshot();
  const mutation = client.request('avanzar', { pedido: 'stable-order-id', a: 'listo' }, mutationContext);
  client.invalidateState();
  assert.equal(client.current(mutationContext), true, 'Read version must not invalidate a write snapshot');
  assert.equal(transport.requests[0].options.signal.aborted, false);
  transport.requests[0].resolve(response({ estado: 'listo', id: 'stable-order-id' }));
  assert.equal((await mutation).estado, 'listo');
});

test('HTTP and malformed JSON failures release coalesced state for safe reattempt', async () => {
  const transport = controlledFetch(), client = new RoomClient('room-a', { ...transport, timeout: 500 });
  const denied = client.state();
  const deniedCheck = assert.rejects(denied, e => e.code === 'response' && e.status === 401);
  transport.requests[0].resolve({ ok: false, status: 401, json: async () => ({ ok: false, error: 'Room credential required' }) });
  await deniedCheck;
  const invalid = client.state();
  const invalidCheck = assert.rejects(invalid, e => e.code === 'response' && e.status === 502);
  transport.requests[1].resolve({ ok: false, status: 502, json: async () => { throw new SyntaxError('not JSON'); } });
  await invalidCheck;
  const recovered = client.state();
  transport.requests[2].resolve(response({ sala: 'room-a' }));
  assert.equal((await recovered).sala, 'room-a');
  assert.equal(client.controllers.size, 0);
});

test('invalid room rejects before any network request', async () => {
  const transport = controlledFetch(), client = new RoomClient('../wrong', { ...transport });
  await assert.rejects(client.state(), e => e.code === 'room');
  assert.equal(transport.requests.length, 0);
});

test('room credentials stay scoped; legacy key migrates only to initial room', async () => {
  const saved = storage({ gc_clave: 'legacy-a' }), seen = [];
  const client = new RoomClient('room-a', { storage: saved, fetchImpl: async (url, options) => { seen.push({ url, key: options.headers['x-clave-sala'] }); return response({}); } });
  assert.equal(saved.getItem('gc_clave'), null);
  assert.equal(client.key(), 'legacy-a');
  await client.state();
  client.switch('room-b');
  assert.equal(client.key(), '');
  await client.state();
  client.setKey('key-b');
  await client.state();
  client.switch('room-a');
  await client.state();
  assert.deepEqual(seen.map(x => x.key), ['legacy-a', undefined, 'key-b', 'legacy-a']);
  assert.ok(seen[1].url.endsWith('sala=room-b'));
  const reloaded = new RoomClient('room-b', { storage: saved });
  assert.equal(reloaded.key(), 'key-b');
});

test('legacy migration preserves existing room credential', () => {
  const saved = storage({ gc_clave: 'legacy-wrong', 'gc_clave:room-a': 'existing-a' });
  const client = new RoomClient('room-a', { storage: saved });
  assert.equal(client.key(), 'existing-a');
  assert.equal(saved.getItem('gc_clave'), null);
});

test('pending order retry and same-tab reload preserve intent and idem', () => {
  const saved = storage(); let generated = 0;
  const pending = new PendingOrder(saved, () => 'nonce-test-' + ++generated);
  const draft = pending.begin('room-a', 'First name');
  assert.deepEqual(pending.begin('room-a', 'Changed after failure'), draft);
  assert.equal(generated, 1);
  const reloaded = new PendingOrder(saved, () => 'must-not-generate');
  assert.deepEqual(reloaded.begin('room-a', 'Other name'), draft);
  assert.equal(reloaded.get('room-a').nombre, 'First name');
});

test('complete is room and nonce scoped; late success cannot erase a new draft', () => {
  const saved = storage(); let generated = 0;
  const pending = new PendingOrder(saved, () => 'nonce-test-' + ++generated);
  const a = pending.begin('room-a', 'A'), b = pending.begin('room-b', 'B');
  pending.complete('room-a', b.idem);
  assert.deepEqual(pending.get('room-a'), a);
  pending.complete('room-a', a.idem);
  assert.equal(pending.get('room-a'), null);
  assert.deepEqual(pending.get('room-b'), b);
  const freshA = pending.begin('room-a', 'Fresh A');
  assert.notEqual(freshA.idem, a.idem);
  pending.complete('room-a', a.idem);
  assert.deepEqual(pending.get('room-a'), freshA);
  const reloaded = new PendingOrder(saved);
  assert.deepEqual(reloaded.get('room-a'), freshA);
  assert.deepEqual(reloaded.get('room-b'), b);
});

test('invalid persisted draft is ignored; inaccessible storage keeps retry safety in memory', () => {
  const saved = storage({ 'gc_pending:room-a': '{broken json' });
  const pending = new PendingOrder(saved, () => 'valid-test-id');
  assert.equal(pending.get('room-a'), null);
  assert.equal(pending.begin('room-a', 'A').idem, 'valid-test-id');
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  const memoryOnly = new PendingOrder(blocked, () => 'memory-only-id');
  const draft = memoryOnly.begin('room-a', 'A');
  assert.deepEqual(memoryOnly.begin('room-a', 'B'), draft);
  memoryOnly.complete('room-a', draft.idem);
  assert.equal(memoryOnly.get('room-a'), null);
});
