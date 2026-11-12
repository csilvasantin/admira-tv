import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { onRequestGet, onRequestPost, projectOf, seedDoc, DOC_KEY } from './functions/api/proyectos.js';

function envFor(email, users) {
  const records = new Map([['admira-tv:auth:session:s1', JSON.stringify({ email, expiresAt: Date.now() + 60000 })]]);
  if (users) records.set('admira-tv:users:v3', JSON.stringify(users));
  return { ACCESS: { get: async k => records.get(k) || null, put: async (k, v) => records.set(k, v) }, records };
}
const get = env => onRequestGet({ request: new Request('https://admira.tv/api/proyectos', { headers: { Cookie: '__Host-atv_session=s1' } }), env });
const post = (env, body, headers = {}) => onRequestPost({ request: new Request('https://admira.tv/api/proyectos', { method: 'POST', headers: { Cookie: '__Host-atv_session=s1', 'Content-Type': 'application/json', Origin: 'https://admira.tv', ...headers }, body: JSON.stringify(body) }), env });

test('la semilla reparte la flota real en proyectos con sentido', () => {
  const doc = seedDoc();
  assert.equal(projectOf(doc, 'macmini-2'), 'mac-mini');
  assert.equal(projectOf(doc, 'xtanco-valencia-c'), 'xtanco-valencia');
  assert.equal(projectOf(doc, 'bcn-kiosk-042-led'), 'kioskos-bcn');
  assert.equal(projectOf(doc, 'admiranext03-a'), 'admiranext');
  assert.equal(projectOf(doc, 'virtual-sbux-d634-vertical'), 'starbucks-alsea');
  assert.equal(projectOf(doc, 'virtual-demo-alcampo'), 'laboratorio');
  assert.equal(projectOf(doc, 'tablet-samsung-unitree-mupi'), 'robots-sitges');
  assert.equal(projectOf(doc, 'algo-desconocido'), '');
});

test('sin sesión no hay proyectos (401) y la escritura tampoco existe', async () => {
  const env = envFor('x@y.z');
  const r = await onRequestGet({ request: new Request('https://admira.tv/api/proyectos'), env });
  assert.equal(r.status, 401);
  const w = await onRequestPost({ request: new Request('https://admira.tv/api/proyectos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"action":"assign","screen":"macmini-1","project":""}' }), env });
  assert.equal(w.status, 401);
});

test('Dios (Carlos) ve todos, «Todos» y puede mover un dispositivo; se guarda en KV', async () => {
  const env = envFor('csilvasantin@gmail.com');
  const d = await (await get(env)).json();
  assert.equal(d.superadmin, true); assert.equal(d.allowAll, true); assert.equal(d.seeded, true);
  assert.ok(d.projects.length >= 8);
  const r = await post(env, { action: 'assign', screen: 'macmini-3', project: 'laboratorio', revision: 0 });
  assert.equal(r.status, 200);
  const saved = JSON.parse(env.records.get(DOC_KEY));
  assert.equal(saved.assign['macmini-3'], 'laboratorio');
  assert.equal(projectOf(saved, 'macmini-3'), 'laboratorio');
  const stale = await post(env, { action: 'assign', screen: 'macmini-1', project: '', revision: 0 });
  assert.equal(stale.status, 409);
  const created = await (await post(env, { action: 'upsert', project: { name: 'Corsair Galleon 100', devices: ['corsair-galleon-100'] } })).json();
  assert.ok(created.projects.some(p => p.id === 'corsair-galleon-100'));
});

test('otro usuario solo ve los proyectos donde es miembro, sin «Todos» ni escritura', async () => {
  const users = { v: 3, projects: [{ id: 'admira-tv' }], users: [{ email: 'cliente@xtanco.es', status: 'active', roles: { 'digitalsignage-player': 'viewer' } }] };
  const env = envFor('cliente@xtanco.es', users);
  const doc = seedDoc(); doc.projects.find(p => p.id === 'xtanco-valencia').members = ['cliente@xtanco.es'];
  env.records.set(DOC_KEY, JSON.stringify(doc));
  const d = await (await get(env)).json();
  assert.equal(d.superadmin, false); assert.equal(d.allowAll, false);
  assert.deepEqual(d.projects.map(p => p.id), ['xtanco-valencia']);
  assert.equal(d.projects[0].members, undefined);
  assert.equal((await post(env, { action: 'assign', screen: 'macmini-1', project: 'xtanco-valencia' })).status, 403);
});

test('un admin raíz de users:v3 también es Dios; un desconocido queda fuera', async () => {
  const users = { v: 3, projects: [{ id: 'admira-tv' }], users: [{ email: 'ops@admira.com', status: 'active', roles: { 'admira-tv': 'admin' } }] };
  assert.equal((await (await get(envFor('ops@admira.com', users))).json()).superadmin, true);
  assert.equal((await get(envFor('nadie@x.com', users))).status, 403);
});

test('origen ajeno o cuerpo no JSON no escriben', async () => {
  const env = envFor('csilvasantin@gmail.com');
  assert.equal((await post(env, { action: 'assign', screen: 'macmini-1', project: '' }, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await post(env, { action: 'assign', screen: 'macmini-1', project: '' }, { 'Content-Type': 'text/plain' })).status, 415);
});

test('el cliente usa el mismo algoritmo y persiste el filtro en localStorage', () => {
  const store = new Map();
  const ctx = { localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) }, fetch: async () => ({ ok: true, json: async () => ({ ok: true, allowAll: true, ...seedDoc() }) }) };
  ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(readFileSync('assets/admira-proyectos.js', 'utf8'), ctx);
  return ctx.AdmiraProyectos.load().then(() => {
    const P = ctx.AdmiraProyectos;
    assert.equal(P.current(), 'todos');
    P.setCurrent('mac-mini');
    assert.equal(store.get('admira.tv.proyecto'), 'mac-mini');
    assert.equal(P.visible('macmini-1'), true);
    assert.equal(P.visible('bcn-kiosk-001-led'), false);
    assert.equal(P.projectOf('xtanco-valencia-a'), 'xtanco-valencia');
  });
});

test('el mando tiene la pestaña Proyectos justo a la derecha de Contenidos y Players filtra', () => {
  const html = readFileSync('mando.html', 'utf8');
  const nav = html.slice(html.indexOf('<nav class="topnav"'), html.indexOf('</nav>'));
  const tabs = [...nav.matchAll(/>([^<>]+)<\/a>/g)].map(m => m[1]);
  assert.deepEqual(tabs.slice(-2), ['Contenidos', 'Proyectos']);
  assert.match(html, /data-mando-pane="proyectos"/);
  assert.match(html, /function rebuildTarget\(/);
  const players = readFileSync('players.html', 'utf8');
  assert.match(players, /admira-proyectos\.js/);
  assert.match(players, /state\.screens\.filter\(projVisible\)/);
});
