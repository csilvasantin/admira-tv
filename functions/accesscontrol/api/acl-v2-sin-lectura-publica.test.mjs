// El ACL v2 ya no se lee sin credencial (16-09-2026). Hasta hoy /state y /audit
// respondían 200 a cualquiera con los correos y roles de todo el grupo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet } from './[[path]].js';

const SOL_REV = 'apps21-pres-2026-07-16'; // igual que SOLUTIONS_REV: evita que readDoc renormalice
const DOC = {
  v: 2, rev: 4, solRev: SOL_REV, updatedAt: 1,
  solutions: [{ id: 'digitalsignage', nm: 'Cartelería Digital', url: 'https://admira.tv/digitalsignage/', ds: '' }],
  users: [
    { email: 'jefa@admira.com', roles: { digitalsignage: 'admin' } },
    { email: 'mira@admira.com', roles: { digitalsignage: 'viewer' } },
  ],
};
const SESION = 'tok-de-prueba';

function env(doc = DOC) {
  const kv = new Map([
    ['acl:v2', JSON.stringify(doc)],
    ['audit:v2', JSON.stringify([{ ts: 1, action: 'role.set', actor: 'jefa@admira.com' }])],
  ]);
  return {
    ACCESS: {
      get: async (k) => (kv.has(k) ? kv.get(k) : null),
      put: async (k, v) => { kv.set(k, v); },
      delete: async (k) => { kv.delete(k); },
    },
  };
}
const peticion = (cookie) => new Request('https://admira.tv/accesscontrol/api/state', cookie ? { headers: { Cookie: cookie } } : undefined);
const sesionDe = (email, expiresAt = Date.now() + 60000) => {
  const e = env();
  const original = e.ACCESS.get;
  e.ACCESS.get = async (k) => (k === `admira-tv:auth:session:${SESION}` ? JSON.stringify({ email, expiresAt }) : original(k));
  return e;
};
const pide = (seg, e, request = peticion()) => onRequestGet({ request, env: e, params: { path: [seg] } });

test('sin credencial, /state y /audit responden 401 y no sueltan ni un correo', async () => {
  for (const seg of ['state', 'audit']) {
    const res = await pide(seg, env());
    assert.equal(res.status, 401, `${seg} debe exigir credencial`);
    const cuerpo = await res.text();
    assert.equal(JSON.parse(cuerpo).error, 'unauthorized');
    assert.doesNotMatch(cuerpo, /@admira\.com/, `${seg} no puede filtrar correos en el error`);
  }
});

test('una sesión caducada no vale como credencial', async () => {
  const res = await pide('state', sesionDe('jefa@admira.com', Date.now() - 1000), peticion(`__Host-atv_session=${SESION}`));
  assert.equal(res.status, 401);
});

test('estar en el ACL no basta: un viewer no ve el directorio', async () => {
  const res = await pide('state', sesionDe('mira@admira.com'), peticion(`__Host-atv_session=${SESION}`));
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, 'forbidden');
});

test('un admin de solución sí lee el documento, y nunca desde una caché compartida', async () => {
  const res = await pide('state', sesionDe('jefa@admira.com'), peticion(`__Host-atv_session=${SESION}`));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Cache-Control'), 'no-store, private');
  const cuerpo = await res.json();
  assert.equal(cuerpo.v, 2);
  assert.deepEqual(cuerpo.users.map((u) => u.email), ['jefa@admira.com', 'mira@admira.com']);
});

test('el owner entra aunque no figure en la lista de usuarios', async () => {
  const res = await pide('audit', sesionDe('csilva@admira.com'), peticion(`__Host-atv_session=${SESION}`));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).events.length, 1);
});

test('una ruta que no existe sigue siendo 404, sin pistas', async () => {
  const res = await pide('usuarios', env());
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error, 'not_found');
});
