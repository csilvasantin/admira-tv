import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, STATUSES, SLA_P0_MIN } from './store.js';

function storeAt(now) {
  return createStore({
    storage: new MapStorage(),
    now: () => now,
    broadcast: false,
  });
}

function MapStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

const T0 = Date.parse('2026-09-13T12:00:00+02:00');

test('seed prioriza P0 y cuenta la red', () => {
  const s = storeAt(T0);
  const rows = s.list();
  assert.equal(rows[0].id, 'INC-10482');
  assert.equal(rows[0].sev, 'P0');
  assert.equal(rows[0].playerId, 'admiranext-mupi');
  const st = s.stats();
  assert.equal(st.p0, 1);
  assert.equal(st.slaP0, SLA_P0_MIN);
  assert.ok(st.abiertas >= 5);
  assert.equal(st.enCampo, 1);
});

test('ensureSala nunca deja hueco vacío: crea INC al click y reusa el vivo', () => {
  const s = storeAt(T0);
  const a = s.ensureSala('admiranext-mupi', { source: 'asistencia_click' });
  assert.equal(a.id, 'INC-10482');
  assert.ok(a.source.includes('cae'));
  assert.ok(a.source.includes('asistencia_click'));
  const b = s.ensureSala('admiranext-mupi', { source: 'asistencia_click' });
  assert.equal(b.id, a.id);
  const nuevo = s.ensureSala('player-lab-99', { site: 'lab', source: 'asistencia_click' });
  assert.match(nuevo.id, /^INC-\d+$/);
  assert.notEqual(nuevo.id, 'INC-10482');
  assert.equal(nuevo.status, 'open');
  assert.ok(nuevo.id);
});

test('ensureSala exige playerId', () => {
  const s = storeAt(T0);
  assert.throws(() => s.ensureSala(''), /playerId_required/);
});

test('no fusiona sitios distintos', () => {
  const s = storeAt(T0);
  assert.throws(() => s.merge('INC-10482', 'INC-10471'), /distinct_site/);
  const still = s.get('INC-10482');
  assert.equal(still.mergedInto, null);
});

test('fusiona dupes del mismo sitio', () => {
  const s = storeAt(T0);
  const extra = s.ensureSala('admiranext-mupi-b', {
    site: 'Alcampo Alcalá', siteId: 'ALC-ALC-01', source: 'cae',
  });
  const into = s.merge(extra.id, 'INC-10482');
  assert.equal(into.id, 'INC-10482');
  assert.equal(s.get(extra.id).mergedInto, 'INC-10482');
  assert.ok(!s.list().some((r) => r.id === extra.id));
});

test('ciclo assigned → in_field → resolved → valued escribe valuation', () => {
  const s = storeAt(T0);
  s.acceptParte('INC-10482');
  assert.equal(s.get('INC-10482').status, 'assigned');
  s.setStatus('INC-10482', 'in_field');
  s.setStatus('INC-10482', 'resolved');
  assert.throws(() => s.valueIncident('INC-10482', { score: 0 }), /score_required/);
  const v = s.valueIncident('INC-10482', { score: 5, by: 'punto', minutes: 24, cost: 85 });
  assert.equal(v.status, 'valued');
  assert.deepEqual(v.valuation, { score: 5, by: 'punto', minutes: 24, cost: 85 });
});

test('snooze, escalate, capture y filtros', () => {
  const s = storeAt(T0);
  s.snooze('INC-10440', 30);
  assert.ok(s.get('INC-10440').snoozedUntil > T0);
  s.escalate('INC-10440', 'Trinity');
  assert.equal(s.get('INC-10440').assignee, 'Trinity');
  assert.equal(s.get('INC-10440').status, 'assigned');
  s.deviceAction('INC-10482', 'capture');
  assert.ok(s.get('INC-10482').photos.some((p) => p.id === 'captura' && p.on));
  assert.equal(s.list({ sev: 'P0' }).length, 1);
  assert.ok(s.list({ status: 'valued' }).every((r) => r.status === 'valued'));
  assert.ok(STATUSES.includes('in_field'));
});

test('orphans eco Flota', () => {
  const o = storeAt(T0).orphans();
  assert.equal(o.vivosSinCircuito.length, 3);
  assert.equal(o.virtuales.length, 2);
  assert.equal(o.sitiosSinPlayer.length, 1);
});
