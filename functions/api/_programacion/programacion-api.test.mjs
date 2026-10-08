// node --test functions/api/_programacion/ — GET /api/programacion (E3 · modelo único de playlists).
// D1 simulada (node:sqlite) con la migración real, KV y fetch simulados (sin red): 503 sin binding, auth como
// /api/emision, playlist directa, grupos que se suman y directa que gana, `at` y `tag`, memoria por meta.version y
// ninguna escritura (ni KV, ni D1, ni nada que no sea GET).
import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { d1Memoria } from "./_d1-memoria.mjs";
import * as A from "./almacen.js";
import { aMinutos, aUtc } from "./horario.js";
import { onRequest, onRequestGet, olvidarMemoria } from "../programacion.js";
import { forgetMemo } from "../playlist.js";
import { TAGS_PREFIX } from "../_playlist-live.js";
import { madridClock } from "../_emision.js";

const SQL = await readFile(new URL("../../../migrations/programacion/0001.sql", import.meta.url), "utf8");
const sinSqlite = !(await d1Memoria());
const prueba = (nombre, fn) => test(nombre, { skip: sinSqlite && "node:sqlite no disponible (Node ≥ 22.13)" }, fn);

const M = (fecha, hhmm) => aUtc(fecha, aMinutos(hhmm));
const HOY = "2026-10-14", AT = M(HOY, "10:00");                 // miércoles, franja de mañana en Madrid
const SCREEN = "alcampo-alcala", TOKEN = "tok-sesion";
const yo = { actor: "csilvasantin@gmail.com", ahora: AT - 86_400_000 };
const item = s => ({ id: "stock-" + s, stockId: s, title: s, asset: `https://stock.admira.store/stock/${s}/asset.mp4`, assetType: "video", seconds: 10 });
const fija = (id, piezas, extra = {}) => ({ id, nombre: id, tipo: "fija", items: piezas.map(item), ...extra });
const ids = lista => lista.map(i => i.stockId || i.id);
const papel = (r, id) => (r.fuentes.find(f => f.id === id) || {}).papel;

// ── KV, D1 y red simulados ──────────────────────────────────────────────────────────────────────────────────────
// Toda escritura en cualquier KV de este fichero queda aquí: también las que lanzaría por detrás enrichFacts al rehacer
// el índice de Xpacios (el catálogo simulado devuelve una ficha para que lo intente).
const escriturasKV = [];
function kv(entries = {}, metas = {}) {
  const store = new Map(Object.entries(entries)), meta = new Map(Object.entries(metas)), writes = [];
  const anota = w => { writes.push(w); escriturasKV.push(w); };
  return {
    writes,
    get: async k => store.has(k) ? store.get(k) : null,
    getWithMetadata: async k => ({ value: store.get(k) ?? null, metadata: meta.get(k) ?? null }),
    list: async () => ({ keys: [], list_complete: true }),
    put: async (k, v) => { anota(["put", k]); store.set(k, v); },
    delete: async k => { anota(["delete", k]); store.delete(k); },
  };
}
const session = () => ({ ["admira-tv:auth:session:" + TOKEN]: JSON.stringify({ email: "csilvasantin@gmail.com", expiresAt: Date.now() + 3600e3 }) });
/** La D1 que ve la ruta: la misma base, apuntando cada sentencia que se ejecuta. */
function espia(db) {
  const sql = [];
  const envolver = st => ({ ...st, bind: (...a) => envolver(st.bind(...a)),
    first: (...a) => { sql.push(st.sql); return st.first(...a); }, all: () => { sql.push(st.sql); return st.all(); }, run: () => { sql.push(st.sql); return st.run(); } });
  return { sql, prepare: s => envolver(db.prepare(s)), batch: lista => { sql.push(...lista.map(s => s.sql)); return db.batch(lista); } };
}
const STOCK = [
  { id: "o1", type: "video", url: "https://stock.admira.store/stock/o1/a.mp4", title: "Oferta 1", tags: ["oferta"], createdAt: 2 },
  { id: "o2", type: "image", url: "https://stock.admira.store/stock/o2/a.jpg", title: "Oferta 2", tags: ["ofertas"], createdAt: 3 },
];
const banda = (id, from, to, slots = []) => ({ id, label: id, from, to, slots });
const pagado = bookingId => ({ kind: "paid", status: "sold", bookingId, title: bookingId, creative: { type: "image", url: `https://cdn.admira.store/${bookingId}.jpg` } });
let dias, calls, catalogoPedido = 0;
beforeEach(() => {
  forgetMemo();
  olvidarMemoria();
  calls = [];
  dias = { [HOY]: [banda("manana", "08:00", "12:00"), banda("mediodia", "12:00", "16:00", [pagado("P1")])] };
  globalThis.__realFetch ??= globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String((input && input.url) || input), method = String(init.method || (input && input.method) || "GET").toUpperCase();
    calls.push({ url, method });
    const ok = body => new Response(JSON.stringify(body), { status: body == null ? 404 : 200, headers: { "Content-Type": "application/json" } });
    if (url.includes("/grid/day")) {
      const d = new URL(url).searchParams.get("date"), fecha = d ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : madridClock(Date.now()).date;
      return ok({ ok: true, screen: SCREEN, date: fecha, config: { name: "Alcampo Alcalá", circuit: "alcampo", slotSeconds: 15 }, bands: dias[fecha] || [] });
    }
    if (url.includes("/stock/index.json")) return ok({ items: STOCK });
    if (url.includes("/grid/config")) return ok({ ok: true, config: { circuit: "alcampo" } });
    if (url.includes("/grid/projects")) return ok({ ok: true, projects: [{ id: "alcampo", name: "Canal Alcampo", circuits: ["alcampo"] }] });
    if (url === "https://api.admira.store/locations") { catalogoPedido += 1; return ok({ locations: [{ id: "alcampo-alcala-x", name: "Alcampo Alcalá", circuit: "alcampo", screen: SCREEN }] }); }
    return ok(null);
  };
});
afterEach(() => { globalThis.fetch = globalThis.__realFetch; });

async function get(qs, env, cookie = true) {
  const r = await onRequestGet({ request: new Request("https://admira.tv/api/programacion?" + qs, { headers: cookie ? { Cookie: "__Host-atv_session=" + TOKEN } : {} }), env });
  return { status: r.status, body: await r.json(), headers: r.headers };
}
const en = (ms, extra = "") => `screen=${SCREEN}&at=${encodeURIComponent(new Date(ms).toISOString())}${extra}`;
async function mundo() {
  const db = await d1Memoria(SQL), d = espia(db), store = kv(session());
  return { db, d, store, env: { ACCESS: store, PROGRAMACION_DB: d } };
}

// ── Configuración y acceso ──────────────────────────────────────────────────────────────────────────────────────
test("sin el binding PROGRAMACION_DB → 503 programacion_db_no_configurada, sin leer nada de fuera", async () => {
  const r = await get(en(AT), { ACCESS: kv(session()) });
  assert.equal(r.status, 503);
  assert.deepEqual(r.body, { ok: false, error: "programacion_db_no_configurada" });
  assert.match(r.headers.get("Cache-Control"), /no-store/);
  const virtual = await get("screen=virtual-xtanco", { ACCESS: kv() }, false);
  assert.deepEqual([virtual.status, virtual.body.error], [503, "programacion_db_no_configurada"]);
  assert.deepEqual(calls, [], "ni parrilla, ni Stock, ni identidad");
});

prueba("acceso como /api/emision: 400 por pantalla o instante, 401 sin sesión (sin tocar la D1), 405 a lo que no sea GET", async () => {
  const { d, env } = await mundo();
  assert.equal((await get("screen=../x", env)).status, 400);
  assert.equal((await get(`screen=${SCREEN}&at=ayer`, env)).status, 400);
  const anonimo = await get(en(AT), { ...env, ACCESS: kv() }, false);
  assert.deepEqual([anonimo.status, anonimo.body.error], [401, "unauthorized"]);
  assert.deepEqual(d.sql, [], "sin sesión no se lee la D1");
  assert.equal((await get("screen=virtual-xtanco&at=" + AT, { PROGRAMACION_DB: d }, false)).body.publico, true, "una virtual es pública");
  assert.equal(onRequest().status, 405);
});

prueba("D1 creada pero sin la migración aplicada → 503 programacion_db_sin_esquema", async () => {
  const r = await get(en(AT), { ACCESS: kv(session()), PROGRAMACION_DB: await d1Memoria("") });
  assert.deepEqual([r.status, r.body.error], [503, "programacion_db_sin_esquema"]);
});

// ── Resolución ──────────────────────────────────────────────────────────────────────────────────────────────────
prueba("playlist directa: sale tal cual, con las etiquetas completadas, la parrilla de tres días, validoHasta y siguiente", async () => {
  const { db, env } = await mundo();
  await A.guardarPlaylist(db, fija("mano", ["m1", "m2"]), yo);
  await A.guardarAsignacion(db, { id: "mano", playlist_id: "mano", destino: { all: ["pantalla:" + SCREEN] } }, yo);
  const r = await get(en(AT), env);
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.deepEqual([r.body.screen, r.body.at, r.body.version, r.body.motor, r.body.publico], [SCREEN, new Date(AT).toISOString(), 2, "apagado", false]);
  assert.equal(r.body.capa, "por_defecto");
  assert.deepEqual(ids(r.body.items), ["m1", "m2"]);
  assert.deepEqual(r.body.base, ["mano"]);
  assert.equal(r.body.exacta, false);
  assert.deepEqual(r.body.spots, []);
  assert.equal(r.body.cadencia, 4);
  assert.equal(papel(r.body, "mano"), "base");
  assert.equal(typeof r.body.rev, "number");
  // enrichFacts completó circuito y proyecto con /grid/config y /grid/projects.
  for (const t of ["pantalla:" + SCREEN, "circuito:alcampo", "proyecto:alcampo", "todas"]) assert.ok(r.body.screenTags.includes(t), t);
  // Víspera, día y siguiente de /grid/day; el borde de las 12:00 lo marca la franja pagada de mediodía.
  assert.deepEqual(r.body.lecturas.parrilla, ["2026-10-13", HOY, "2026-10-15"]);
  assert.equal(r.body.lecturas.stock, 2);
  assert.equal(r.body.validoHasta, M(HOY, "12:00"));
  assert.equal(r.body.siguiente.en, M(HOY, "12:00"));
  assert.deepEqual(r.body.siguiente.items.map(i => i.id), ["stock-m1", "stock-m2", "grid:P1"]);
});

prueba("grupos: lo que llega por grupos se suma; lo directo gana y los grupos quedan eclipsados", async () => {
  const { db, env } = await mundo();
  await A.guardarPlaylist(db, fija("circuito", ["c1", "c2"]), yo);
  await A.guardarPlaylist(db, fija("marca", ["k1", "c2"]), yo);
  await A.guardarAsignacion(db, { id: "circuito", playlist_id: "circuito", destino: { all: ["circuito:alcampo"] } }, { ...yo, ahora: yo.ahora + 2 });
  await A.guardarAsignacion(db, { id: "marca", playlist_id: "marca", destino: { all: ["proyecto:alcampo"] } }, { ...yo, ahora: yo.ahora + 1 });
  const grupos = await get(en(AT), env);
  assert.deepEqual(ids(grupos.body.items), ["c1", "c2", "k1"], "fusionadas en orden K y sin repetir pieza");
  assert.deepEqual(grupos.body.base, ["circuito", "marca"]);
  assert.equal(grupos.body.nombre, "circuito + marca");
  await A.guardarPlaylist(db, fija("mano", ["m1"]), yo);
  await A.guardarAsignacion(db, { id: "mano", playlist_id: "mano", destino: { any: ["pantalla:" + SCREEN] } }, yo);
  const directa = await get(en(AT), env);
  assert.deepEqual(ids(directa.body.items), ["m1"]);
  assert.deepEqual(directa.body.base, ["mano"]);
  assert.deepEqual([papel(directa.body, "circuito"), papel(directa.body, "marca")], ["eclipsada", "eclipsada"]);
});

prueba("`at` manda: la franja programada, el día de la parrilla y el instante en milisegundos", async () => {
  const { db, env } = await mundo();
  await A.guardarPlaylist(db, fija("mano", ["m1"]), yo);
  await A.guardarPlaylist(db, fija("comida", ["k1", "k2"]), yo);
  await A.guardarAsignacion(db, { id: "mano", playlist_id: "mano", destino: { all: ["pantalla:" + SCREEN] } }, yo);
  await A.guardarAsignacion(db, { id: "comida", playlist_id: "comida", destino: { all: ["circuito:alcampo"] }, capa: "propia", mezcla: "sustituye", franjas: ["13:00-15:00"] }, yo);
  const manana = await get(en(AT), env);
  assert.deepEqual([manana.body.capa, ids(manana.body.items)], ["por_defecto", ["m1"]]);
  assert.equal(manana.body.validoHasta, M(HOY, "12:00"), "el primer borde: la franja de mediodía de la parrilla");
  const comida = await get(`screen=${SCREEN}&at=${M(HOY, "14:00")}`, env);
  assert.equal(comida.body.at, new Date(M(HOY, "14:00")).toISOString());
  // La propia de comida sustituye al por defecto y lo pagado de la franja de mediodía se intercala (base corta: detrás).
  assert.deepEqual([comida.body.capa, ids(comida.body.items)], ["propia", ["k1", "k2", "grid:P1"]]);
  assert.equal(papel(comida.body, "mano"), "eclipsada");
  assert.equal(comida.body.validoHasta, M(HOY, "15:00"));
  // Otro día: /grid/day se pide con &date= para la víspera, el día y el siguiente de ESE día.
  calls = [];
  await get(en(M("2026-10-20", "10:00")), env);
  const pedidos = calls.filter(c => c.url.includes("/grid/day")).map(c => new URL(c.url).searchParams.get("date")).sort();
  assert.deepEqual(pedidos, ["20261019", "20261020", "20261021"]);
});

prueba("tag: simula el mando por hashtag desde `at`; lo pagado se sigue intercalando y caduca en el borde de franja", async () => {
  const { db, env } = await mundo();
  await A.guardarPlaylist(db, fija("mano", ["m1"]), yo);
  await A.guardarAsignacion(db, { id: "mano", playlist_id: "mano", destino: { all: ["pantalla:" + SCREEN] } }, yo);
  const r = await get(en(M(HOY, "13:00"), "&tag=%23oferta"), env);
  assert.equal(r.body.capa, "mando");
  assert.deepEqual(ids(r.body.items), ["o2", "o1", "grid:P1"]);
  assert.deepEqual([r.body.mando.tipo, r.body.mando.activo, r.body.mando.caduca, r.body.mando.motivo], ["hashtag", true, M(HOY, "15:00"), "2h"]);
  assert.equal(papel(r.body, "mano"), "ignorada_por_mando");
});

prueba("identidad: sin pistas del player, la orientación y el idioma salen de lo que la pantalla registró; el player habla por sí mismo", async () => {
  const { db, env } = await mundo();
  const store = kv(session(), { [TAGS_PREFIX + SCREEN]: { tags: ["circuito:alcampo", "idioma:es", "orientacion:vertical", "pantalla:" + SCREEN, "todas"], w: 1080, h: 1920, seenAt: 1 } });
  await A.guardarPlaylist(db, fija("vertical", ["v1"]), yo);
  await A.guardarAsignacion(db, { id: "vertical", playlist_id: "vertical", destino: { all: ["orientacion:vertical", "idioma:es"] } }, yo);
  const editor = await get(en(AT), { ...env, ACCESS: store });
  assert.ok(editor.body.screenTags.includes("orientacion:vertical") && editor.body.screenTags.includes("idioma:es"));
  assert.equal(editor.body.lecturas.autorretrato, true);
  assert.deepEqual(ids(editor.body.items), ["v1"]);
  const player = await get(en(AT, "&w=1920&h=1080&lang=ca"), { ...env, ACCESS: store });
  assert.ok(player.body.screenTags.includes("orientacion:horizontal") && player.body.screenTags.includes("idioma:ca"));
  assert.equal(player.body.lecturas.autorretrato, false);
  assert.deepEqual(player.body.items, [], "la vertical no le toca: sin base ni añadidos, relleno");
  assert.equal(player.body.capa, "relleno");
});

// ── Memoria y efectos ───────────────────────────────────────────────────────────────────────────────────────────
prueba("memoria por meta.version: acierto mientras no cambia; tras una escritura, fallo y lo nuevo", async () => {
  const { db, d, env } = await mundo();
  await A.guardarPlaylist(db, fija("mano", ["m1"]), yo);
  await A.guardarAsignacion(db, { id: "mano", playlist_id: "mano", destino: { all: ["pantalla:" + SCREEN] } }, yo);
  const lecturasD1 = () => { const n = d.sql.length; return () => d.sql.slice(n); };
  let desde = lecturasD1();
  const primera = await get(en(AT), env);
  assert.equal(primera.body.memoria, "fallo");
  assert.ok(desde().some(s => /FROM asignacion a/.test(s)), "lee las candidatas");
  assert.ok(desde().some(s => /FROM circuito/.test(s)), "lee los circuitos");
  desde = lecturasD1();
  const segunda = await get(en(AT + 20 * 60_000), env);   // otro sondeo dentro de la misma hora
  assert.equal(segunda.body.memoria, "acierto");
  assert.deepEqual(desde().map(s => s.trim().split(/\s+/).slice(0, 2).join(" ")), ["SELECT version,"], "sólo la versión");
  assert.deepEqual(ids(segunda.body.items), ["m1"]);
  // Una escritura sube meta.version: la siguiente consulta lo vuelve a leer y ve el cambio.
  await A.guardarPlaylist(db, fija("mano", ["m1", "m9"]), { ...yo, rev: 1 });
  desde = lecturasD1();
  const tercera = await get(en(AT), env);
  assert.equal(tercera.body.memoria, "fallo");
  assert.equal(tercera.body.version, segunda.body.version + 1);
  assert.deepEqual(ids(tercera.body.items), ["m1", "m9"]);
  assert.ok(desde().some(s => /FROM asignacion a/.test(s)));
  // Otra hora: candidatas nuevas (otra ventana), pero los circuitos siguen en memoria.
  desde = lecturasD1();
  assert.equal((await get(en(AT + 3 * 3600_000), env)).body.memoria, "fallo");
  assert.ok(!desde().some(s => /FROM circuito/.test(s)), "los circuitos no se releen con la misma versión");
  assert.equal((await get(en(AT + 3 * 3600_000), env)).body.memoria, "acierto");
});

prueba("sin efectos: ni KV (censo, índice de Xpacios), ni D1 (sólo SELECT), ni nada que no sea GET", async () => {
  const { db, d, store, env } = await mundo();
  await A.guardarPlaylist(db, fija("mano", ["m1"]), yo);
  await A.guardarAsignacion(db, { id: "mano", playlist_id: "mano", destino: { all: ["pantalla:" + SCREEN] } }, yo);
  const version = (await A.leerMeta(db)).version, auditadas = (await db.prepare("SELECT COUNT(*) AS n FROM auditoria").first()).n;
  for (const qs of [en(AT), en(AT, "&w=1080&h=1920&lang=es"), en(AT, "&tag=oferta"), "screen=" + SCREEN]) {
    assert.equal((await get(qs, env)).status, 200, qs);
  }
  assert.deepEqual(store.writes, [], "la consulta ha escrito en KV");
  await new Promise(r => setTimeout(r, 20));
  assert.ok(catalogoPedido > 0, "enrichFacts intentó rehacer el índice de Xpacios en alguna prueba");
  assert.deepEqual(escriturasKV, [], "ninguna prueba ha escrito en KV (tampoco el índice de Xpacios)");
  assert.ok(d.sql.length > 0);
  assert.deepEqual(d.sql.filter(s => !/^\s*SELECT\b/i.test(s)), [], "alguna sentencia de la D1 no es un SELECT");
  assert.equal((await A.leerMeta(db)).version, version, "meta.version no se movió");
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM auditoria").first()).n, auditadas);
  assert.ok(calls.every(c => c.method === "GET"), "alguna llamada no es GET");
  assert.ok(!calls.some(c => /locations\/cmd|\/api\/playlist|sync\/state/.test(c.url)), "sólo parrilla, Stock e identidad");
});
