// Backoffice de audiencia: sesión + permiso, solo lectura fuera, QA-only en simular, reglas validadas, CSV.
// Requiere node >= 22 (node:sqlite como D1 de pruebas).
import test from 'node:test'; import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { onRequest } from './[[path]].js';
import * as AUD from '../_audiencia.js';
const SQL = `-- Audiencia del tótem/quiosco (Carlos, 8-oct-2026): contenidos segmentados por sexo, edad y número de personas.
-- D1 «kiosko-audiencia», compartida por mcp-ainimation (binding AUDIENCIA_DB) y admira.tv (Pages, binding AUDIENCIA_DB).
-- PRIVACIDAD: solo estimaciones agregadas. Nunca imágenes, fotogramas, vectores de cara ni plantillas biométricas.
-- Retención: 90 días (se purga al escribir).
CREATE TABLE IF NOT EXISTS aud_visitas (
  id TEXT PRIMARY KEY,
  tienda TEXT NOT NULL,
  dispositivo TEXT NOT NULL,
  origen TEXT NOT NULL,
  canal TEXT,
  inicio INTEGER NOT NULL,
  fin INTEGER NOT NULL,
  dwell_ms INTEGER NOT NULL,
  personas INTEGER NOT NULL,
  hombres INTEGER NOT NULL DEFAULT 0,
  mujeres INTEGER NOT NULL DEFAULT 0,
  nino INTEGER NOT NULL DEFAULT 0,
  joven INTEGER NOT NULL DEFAULT 0,
  adulto INTEGER NOT NULL DEFAULT 0,
  senior INTEGER NOT NULL DEFAULT 0,
  grupo TEXT,
  genero_seg TEXT,
  edad_seg TEXT,
  franja TEXT,
  caras TEXT,
  regla TEXT,
  variante TEXT,
  pedido TEXT,
  pedido_num TEXT,
  demo_run TEXT,
  creado INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS aud_visitas_tienda_inicio ON aud_visitas (tienda, inicio);
CREATE INDEX IF NOT EXISTS aud_visitas_creado ON aud_visitas (creado);
CREATE TABLE IF NOT EXISTS aud_estado (
  tienda TEXT NOT NULL,
  dispositivo TEXT NOT NULL,
  origen TEXT NOT NULL,
  ts INTEGER NOT NULL,
  camara TEXT,
  personas INTEGER NOT NULL DEFAULT 0,
  grupo TEXT,
  genero_seg TEXT,
  edad_seg TEXT,
  regla TEXT,
  variante TEXT,
  visita TEXT,
  PRIMARY KEY (tienda, dispositivo)
);
CREATE TABLE IF NOT EXISTS aud_reglas (
  tienda TEXT PRIMARY KEY,
  doc TEXT NOT NULL,
  actualizado INTEGER NOT NULL,
  por TEXT
);`;
function d1() {
  const db = new DatabaseSync(':memory:'); db.exec(SQL);
  const stmt = (sql, args = []) => ({ bind: (...a) => stmt(sql, a),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
    all: async () => ({ results: db.prepare(sql).all(...args).map((x) => ({ ...x })) }),
    first: async () => { const r = db.prepare(sql).get(...args); return r ? { ...r } : null; } });
  return { prepare: (sql) => stmt(sql), batch: async (l) => Promise.all(l.map((s) => s.run())) };
}
function env(email = 'csilva@admira.com', { lectura = false, db = d1(), acl = null } = {}) {
  return { AUDIENCIA_DB: db, ACCESS: { async get(k) {
    if (k === 'admira-tv:auth:session:test') return JSON.stringify({ email, expiresAt: Date.now() + 60000, ...(lectura ? { lectura: true } : {}) });
    if (k === 'admira-tv:users:v3') return acl ? JSON.stringify(acl) : null;
    return null; } } };
}
const req = (path, { method = 'GET', body, headers = {} } = {}) => new Request('https://admira.tv/audiencia/api/' + path, { method, headers: { Cookie: '__Host-atv_session=test', ...(method !== 'GET' ? { Origin: 'https://admira.tv', 'content-type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
const call = (e, path, o) => onRequest({ env: e, request: req(path, o), params: { path: path.split('?')[0].split('/') } });

test('sin sesión, sesión de lectura o sin permiso: fuera', async () => {
  assert.equal((await call(env(), 'resumen', { headers: { Cookie: '' } })).status, 401);
  assert.equal((await call(env(undefined, { lectura: true }), 'resumen')).status, 403);
  assert.equal((await call(env('nadie@example.org'), 'resumen')).status, 403);
  assert.equal((await call(env(), 'simular', { method: 'POST', body: { tienda: 'starbucks-qa' }, headers: { Origin: 'https://evil.example' } })).status, 403);
});
test('simular solo en *-qa; el resumen y el CSV lo ven (horas de Madrid)', async () => {
  const e = env();
  const no = await call(e, 'simular', { method: 'POST', body: { tienda: 'starbucks-paseo-de-gracia', n: 5 } });
  assert.equal(no.status, 400);
  const si = await (await call(e, 'simular', { method: 'POST', body: { tienda: 'starbucks-qa', n: 12 } })).json();
  assert.equal(si.insertadas, 12);
  const r = await (await call(e, 'resumen?tienda=starbucks-qa&dias=2&origen=real,qa,demo')).json();
  assert.equal(r.kpis.visitas, 12); assert.equal(r.zona, 'Europe/Madrid'); assert.equal(r.por_hora.length, 24);
  assert.ok(r.recientes.every((v) => v.origen === 'demo' && v.tienda === 'starbucks-qa' && Array.isArray(v.caras)));
  const real = await (await call(e, 'resumen?tienda=starbucks-paseo-de-gracia')).json();
  assert.equal(real.kpis.visitas, 0);
  const csv = await call(e, 'csv?tienda=starbucks-qa&origen=demo');
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.equal((await csv.text()).trim().split('\n').length, 13);
  const t = await (await call(e, 'tiendas')).json();
  assert.ok(t.tiendas.some((x) => x.tienda === 'starbucks-qa' && x.visitas === 12 && x.qa));
});
test('reglas: semilla, guardar validado, solo editores', async () => {
  const e = env();
  const g = await (await call(e, 'reglas?tienda=starbucks-qa')).json();
  assert.equal(g.semilla, true); assert.ok(g.variantes.grupo && g.reglas.length === 6);
  const bad = await call(e, 'reglas?tienda=starbucks-qa', { method: 'PUT', body: { doc: { ...g, reglas: [{ id: 'x', variante: 'no-existe' }] } } });
  assert.equal(bad.status, 400);
  const doc = { ...g, reglas: [...g.reglas, { id: 'r-tarde', nombre: 'Tarde', prioridad: 95, genero: 'any', edad: 'any', grupo: 'any', franja: 'tarde', variante: 'joven' }] };
  const ok = await (await call(e, 'reglas?tienda=starbucks-qa', { method: 'PUT', body: { doc } })).json();
  assert.equal(ok.ok, true); assert.equal(ok.reglas.length, 7); assert.equal(ok.por, 'csilva@admira.com');
  const leido = await AUD.leerReglas(e.AUDIENCIA_DB, 'starbucks-qa');
  assert.equal(leido.semilla, false); assert.equal(AUD.elegir(leido, { personas: 1, grupo: 'individuo', genero: 'm', edad: 'adulto', franja: 'tarde' }).regla, 'r-tarde');
  const acl = { v: 3, projects: [{ id: 'admira-tv' }, { id: 'digitalsignage-conditional', parent: 'admira-tv' }], users: [{ email: 'ver@admira.com', status: 'active', roles: { 'digitalsignage-conditional': 'viewer' } }] };
  const v = env('ver@admira.com', { acl, db: e.AUDIENCIA_DB });
  assert.equal((await call(v, 'reglas?tienda=starbucks-qa')).status, 200);
  assert.equal((await call(v, 'reglas?tienda=starbucks-qa', { method: 'PUT', body: { doc } })).status, 403);
});
