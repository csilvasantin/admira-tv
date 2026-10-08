// node --test functions/api/_programacion/ — API de escritura /api/programacion/… (E4 · modelo único de playlists).
// D1 simulada (node:sqlite) con la migración real, KV y red simulados: CRUD de playlists, asignaciones y circuitos,
// 409 por rev sin rastro, 422 con el campo, 401/403, clave de servicio de Pixeria, historial y auditoría, y que cada
// escritura sube meta.version y GET /api/programacion deja de acertar en su memoria.
import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { d1Memoria } from "./_d1-memoria.mjs";
import * as A from "./almacen.js";
import { mismaClave } from "./acceso.js";
import { onRequest } from "../programacion/[recurso]/[[resto]].js";
import { onRequestGet as programacionGet, olvidarMemoria } from "../programacion.js";
import { forgetMemo } from "../playlist.js";

const SQL = await readFile(new URL("../../../migrations/programacion/0001.sql", import.meta.url), "utf8");
const sinSqlite = !(await d1Memoria());
const prueba = (nombre, fn) => test(nombre, { skip: sinSqlite && "node:sqlite no disponible (Node ≥ 22.13)" }, fn);

// ── Sesiones, KV, D1 y red simulados ────────────────────────────────────────────────────────────────────────────
const DUENO = "csilvasantin@gmail.com", EDITORA = "editora@admira.com";
const T = { dueno: "tok-dueno", editora: "tok-editora", sinPermiso: "tok-sin-permiso", visor: "tok-visor" };
const CLAVE = "clave-de-prueba-que-no-es-real-0123456789";   // valor ficticio: sólo vive en el env de estas pruebas
const usuarios = { v: 3, projects: [{ id: "admira-tv" }, { id: "digitalsignage-player", parent: "admira-tv" }],
  users: [{ email: EDITORA, status: "active", roles: { "digitalsignage-player": "editor" } }, { email: "nadie@admira.com", status: "active", roles: { "otra-cosa": "viewer" } }] };
function kv() {
  const exp = Date.now() + 3600e3, s = (tok, rec) => ["admira-tv:auth:session:" + tok, JSON.stringify({ ...rec, expiresAt: exp })];
  const store = new Map([
    s(T.dueno, { email: DUENO }), s(T.editora, { email: EDITORA }), s(T.sinPermiso, { email: "nadie@admira.com" }),
    s(T.visor, { email: "lectura@merovingio.box", lectura: true, sid: "a".repeat(64) }),
    ["admira-tv:users:v3", JSON.stringify(usuarios)],
  ]);
  return { get: async k => store.get(k) ?? null, getWithMetadata: async k => ({ value: store.get(k) ?? null, metadata: null }),
    list: async () => ({ keys: [], list_complete: true }), put: async (k, v) => { store.set(k, v); }, delete: async k => { store.delete(k); } };
}
async function mundo(extra = {}) {
  const db = await d1Memoria(SQL);
  return { db, env: { ACCESS: kv(), PROGRAMACION_DB: db, ...extra } };
}
let calls;
beforeEach(() => {
  calls = [];
  globalThis.__realFetch ??= globalThis.fetch;
  globalThis.fetch = async input => {
    const url = String((input && input.url) || input);
    calls.push(url);
    const ok = body => new Response(JSON.stringify(body), { status: body == null ? 404 : 200, headers: { "Content-Type": "application/json" } });
    if (url.startsWith("https://data.yokup.com/api/lectura/sesion")) return ok({ ok: true, site: "tv" });   // el visor sigue vivo
    if (url.includes("/grid/day")) return ok({ ok: true, date: new URL(url).searchParams.get("date") || undefined, bands: [] });
    if (url.includes("/stock/index.json")) return ok({ items: [] });
    return ok(null);
  };
});
afterEach(() => { globalThis.fetch = globalThis.__realFetch; });

/** Una petición a /api/programacion/<ruta> con la sesión `token` (o sin ella con token: null). */
async function api(env, metodo, ruta, { cuerpo, token = T.dueno, cabeceras = {} } = {}) {
  const headers = { ...cabeceras };
  if (token) headers.Cookie = "__Host-atv_session=" + token;
  if (cuerpo !== undefined) headers["Content-Type"] = "application/json";
  const init = { method: metodo, headers };
  if (cuerpo !== undefined) init.body = typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo);
  const r = await onRequest({ request: new Request("https://admira.tv/api/programacion/" + ruta, init), env });
  const texto = await r.text();
  return { status: r.status, body: texto ? JSON.parse(texto) : null, headers: r.headers };
}
const item = s => ({ id: "stock-" + s, stockId: s, title: s, asset: `https://stock.admira.store/stock/${s}/asset.mp4`, assetType: "video", seconds: 10 });
const fija = (extra = {}) => ({ id: "cafes", nombre: "Cafés", proyecto: "starbucks", tipo: "fija", items: [item("c1"), item("c2")], ...extra });
const cuenta = async (db, tabla) => (await db.prepare(`SELECT COUNT(*) AS n FROM ${tabla}`).first()).n;
const version = async db => (await A.leerMeta(db)).version;
const rastro = async db => ({ version: await version(db), auditoria: await cuenta(db, "auditoria"),
  revisiones: (await cuenta(db, "playlist_revision")) + (await cuenta(db, "asignacion_revision")) });

// ── Configuración, rutas y métodos ──────────────────────────────────────────────────────────────────────────────
test("sin el binding PROGRAMACION_DB → 503 programacion_db_no_configurada (después de la auth: sin sesión, 401)", async () => {
  const env = { ACCESS: kv() };
  for (const [m, ruta, cuerpo] of [["GET", "playlists"], ["POST", "playlists", fija()], ["GET", "auditoria"], ["GET", "historial/playlist/cafes"]]) {
    const r = await api(env, m, ruta, { cuerpo });
    assert.deepEqual([r.status, r.body], [503, { ok: false, error: "programacion_db_no_configurada" }], `${m} ${ruta}`);
    assert.match(r.headers.get("Cache-Control"), /no-store/);
  }
  assert.equal((await api(env, "GET", "playlists", { token: null })).status, 401);
});

prueba("D1 creada sin la migración → 503 programacion_db_sin_esquema, al leer y al escribir", async () => {
  const env = { ACCESS: kv(), PROGRAMACION_DB: await d1Memoria("") }, error = console.error, log = [];
  console.error = (...a) => log.push(a);   // la ruta deja el fallo de la D1 en el log: aquí se recoge en vez de ensuciar la salida
  try {
    assert.deepEqual([(await api(env, "GET", "playlists")).body.error, (await api(env, "POST", "playlists", { cuerpo: fija() })).body.error],
      ["programacion_db_sin_esquema", "programacion_db_sin_esquema"]);
  } finally { console.error = error; }
  assert.equal(log.length, 2);
});

prueba("rutas: 404 a lo desconocido, 405 con Allow al método que no toca, 404 a un id imposible", async () => {
  const { env } = await mundo();
  for (const ruta of ["nada", "playlists/a/b", "historial/pantalla/x", "historial/playlist", "auditoria/1", ""]) {
    assert.deepEqual([ruta, (await api(env, "GET", ruta)).status], [ruta, 404]);
  }
  const casos = [["DELETE", "playlists", "GET, POST"], ["POST", "playlists/cafes", "GET, PUT, PATCH, DELETE"], ["POST", "auditoria", "GET"], ["PUT", "historial/playlist/cafes", "GET"]];
  for (const [m, ruta, allow] of casos) {
    const r = await api(env, m, ruta, { cuerpo: {} });
    assert.deepEqual([r.status, r.headers.get("Allow")], [405, allow], `${m} ${ruta}`);
  }
  assert.equal((await api(env, "GET", "playlists/Caf%C3%A9s")).status, 404, "un id que no es slug no existe");
  assert.equal((await api(env, "GET", "playlists/%E0%A4%A")).status, 404, "una URL mal codificada tampoco");
});

// ── CRUD ────────────────────────────────────────────────────────────────────────────────────────────────────────
prueba("playlists: crear, listar, leer, PUT, PATCH y borrar; cada escritura sube meta.version en 1", async () => {
  const { db, env } = await mundo();
  const alta = await api(env, "POST", "playlists", { cuerpo: { ...fija(), motivo: "alta" } });
  assert.equal(alta.status, 201);
  assert.equal(alta.headers.get("Location"), "/api/programacion/playlists/cafes");
  assert.deepEqual([alta.body.ok, alta.body.version, alta.body.playlist.rev, alta.body.playlist.creado_por, alta.body.playlist.duracion_s], [true, 1, 1, DUENO, 20]);
  assert.equal("escritura" in alta.body.playlist, false, "la ficha interna no sale");
  // Sin id, sale del nombre; uno largo se recorta a 60 sin guion final (modelo.slugId) y se puede actualizar.
  const largo = "Campaña de otoño para todas las pantallas del circuito Alca mpo Madrid";
  const otra = await api(env, "POST", "playlists", { cuerpo: { nombre: largo, proyecto: "alcampo", items: [item("a1")] } });
  assert.deepEqual([otra.status, otra.body.playlist.id, otra.body.version], [201, "campana-de-otono-para-todas-las-pantallas-del-circuito-alca", 2]);
  assert.equal((await api(env, "PATCH", "playlists/" + otra.body.playlist.id, { cuerpo: { rev: 1, nombre: "Corta" } })).status, 200, "y se puede actualizar");
  const dup = await api(env, "POST", "playlists", { cuerpo: fija({ nombre: "Otra" }) });
  assert.deepEqual([dup.status, dup.body.error, dup.body.actual.nombre], [409, "ya_existe", "Cafés"]);

  const todas = await api(env, "GET", "playlists");
  assert.deepEqual([todas.status, todas.body.version, todas.body.playlists.map(p => p.id).sort()], [200, 3, ["cafes", otra.body.playlist.id].sort()]);
  assert.deepEqual((await api(env, "GET", "playlists?proyecto=starbucks")).body.playlists.map(p => p.id), ["cafes"]);
  const una = await api(env, "GET", "playlists/cafes");
  assert.deepEqual([una.status, una.body.playlist.nombre, una.body.version], [200, "Cafés", 3]);
  assert.deepEqual([(await api(env, "GET", "playlists/no-hay")).status, (await api(env, "GET", "playlists/no-hay")).body.error], [404, "no_existe"]);

  // PUT sustituye entera: lo que no llega vuelve a su valor por defecto (aquí, proyecto).
  const put = await api(env, "PUT", "playlists/cafes", { cuerpo: { nombre: "Cafés de otoño", items: [item("c3")], rev: 1 } });
  assert.deepEqual([put.status, put.body.playlist.rev, put.body.version, put.body.playlist.proyecto, put.body.playlist.items.map(i => i.stockId)], [200, 2, 4, "", ["c3"]]);
  assert.equal((await api(env, "PUT", "playlists/no-hay", { cuerpo: { nombre: "X", rev: 1 } })).status, 404);
  // PATCH cambia sólo lo que llega; la rev también vale en If-Match.
  const patch = await api(env, "PATCH", "playlists/cafes", { cuerpo: { proyecto: "starbucks" }, cabeceras: { "If-Match": '"2"' } });
  assert.deepEqual([patch.status, patch.body.playlist.rev, patch.body.version, patch.body.playlist.nombre, patch.body.playlist.proyecto, patch.body.playlist.items.length],
    [200, 3, 5, "Cafés de otoño", "starbucks", 1]);
  assert.equal(patch.body.playlist.creado_en, alta.body.playlist.creado_en);
  assert.equal((await api(env, "PATCH", "playlists/no-hay", { cuerpo: { rev: 1 } })).status, 404);

  // Sin rev, ni PUT ni PATCH ni DELETE: 428 (un PUT sin rev crearía).
  for (const m of ["PUT", "PATCH", "DELETE"]) assert.deepEqual([m, (await api(env, m, "playlists/cafes", { cuerpo: fija() })).body.error], [m, "rev_requerida"]);
  assert.equal((await api(env, "DELETE", "playlists/cafes")).status, 428);
  assert.equal(await version(db), 5, "ningún 428 escribe");
  const baja = await api(env, "DELETE", "playlists/cafes?rev=3&motivo=fin%20de%20campa%C3%B1a");
  assert.deepEqual([baja.status, baja.body], [200, { ok: true, borrado: "cafes", version: 6 }]);
  assert.equal((await api(env, "GET", "playlists/cafes")).status, 404);
  assert.equal((await api(env, "DELETE", "playlists/cafes?rev=3")).status, 404);
});

prueba("asignaciones: crear sobre una playlist que existe, filtros, PUT, PATCH, borrar; la playlist en uso no se borra", async () => {
  const { db, env } = await mundo();
  await api(env, "POST", "playlists", { cuerpo: fija() });
  const huerfana = await api(env, "POST", "asignaciones", { cuerpo: { id: "x", playlist_id: "no-hay", destino: { all: ["todas"] } } });
  assert.deepEqual([huerfana.status, huerfana.body.error, huerfana.body.campo], [422, "playlist_inexistente", "playlist_id"]);
  const alta = await api(env, "POST", "asignaciones", { cuerpo: { id: "cafes-gracia", playlist_id: "cafes", destino: { all: ["circuito:gracia"] }, capa: "propia",
    fecha_desde: "2026-10-14", fecha_hasta: "2026-10-20", franjas: ["08:00-12:00"] } });
  assert.equal(alta.status, 201);
  assert.equal(alta.headers.get("Location"), "/api/programacion/asignaciones/cafes-gracia");
  assert.deepEqual([alta.body.asignacion.directa, alta.body.asignacion.prioridad, alta.body.asignacion.mezcla, alta.body.asignacion.franjas, alta.body.version],
    [false, 300, "fusiona", [{ desde: 480, hasta: 720 }], 2]);
  const sinId = await api(env, "POST", "asignaciones", { cuerpo: { playlist_id: "cafes", destino: { any: ["pantalla:sbux-021"] } } });
  assert.equal(sinId.status, 201);
  assert.match(sinId.body.asignacion.id, /^asg-[a-z0-9-]+$/);
  assert.deepEqual([sinId.body.asignacion.directa, sinId.body.asignacion.mezcla], [true, "sustituye"]);

  assert.equal((await api(env, "GET", "asignaciones")).body.asignaciones.length, 2);
  assert.deepEqual((await api(env, "GET", "asignaciones?playlist_id=cafes&estado=activa")).body.asignaciones.map(a => a.id).sort(), ["cafes-gracia", sinId.body.asignacion.id].sort());
  assert.deepEqual((await api(env, "GET", "asignaciones?estado=pausada")).body.asignaciones, []);
  assert.deepEqual((await api(env, "GET", "asignaciones?estado=rara")).body, { ok: false, error: "estado_invalido" });
  assert.equal((await api(env, "GET", "asignaciones/cafes-gracia")).body.asignacion.capa, "propia");

  // PATCH de la programación: inicio_utc/fin_utc se recalculan y el índice del destino se rehace.
  const patch = await api(env, "PATCH", "asignaciones/cafes-gracia", { cuerpo: { rev: 1, fecha_hasta: "2026-10-31", destino: { all: ["circuito:eixample"] } } });
  assert.equal(patch.status, 200);
  assert.ok(patch.body.asignacion.fin_utc > alta.body.asignacion.fin_utc);
  assert.deepEqual([patch.body.asignacion.capa, patch.body.asignacion.franjas, patch.body.asignacion.rev], ["propia", [{ desde: 480, hasta: 720 }], 2], "lo que no llega se queda");
  const indice = (await db.prepare("SELECT etiqueta FROM asignacion_destino WHERE asignacion_id = 'cafes-gracia'").all()).results.map(r => r.etiqueta);
  assert.deepEqual(indice, ["circuito:eixample"]);
  // PUT entera; cambiar a una playlist que no existe es 422 y no deja rastro.
  const antes = await rastro(db);
  const mala = await api(env, "PUT", "asignaciones/cafes-gracia", { cuerpo: { playlist_id: "no-hay", destino: { all: ["todas"] }, rev: 2 } });
  assert.deepEqual([mala.status, mala.body.error, mala.body.campo], [422, "playlist_inexistente", "playlist_id"]);
  assert.deepEqual(await rastro(db), antes);
  const put = await api(env, "PUT", "asignaciones/cafes-gracia", { cuerpo: { playlist_id: "cafes", destino: { all: ["todas"] }, capa: "relleno", rev: 2 } });
  assert.deepEqual([put.status, put.body.asignacion.capa, put.body.asignacion.franjas, put.body.asignacion.rev], [200, "relleno", [], 3]);

  // La playlist sigue en uso: 409 playlist_en_uso. Archivada una y borrada la otra, ya se puede.
  const enUso = await api(env, "DELETE", "playlists/cafes", { cuerpo: { rev: 1 } });
  assert.deepEqual([enUso.status, enUso.body.error], [409, "playlist_en_uso"]);
  assert.equal((await api(env, "PATCH", "asignaciones/cafes-gracia", { cuerpo: { rev: 3, estado: "archivada" } })).body.asignacion.estado, "archivada");
  const baja = await api(env, "DELETE", "asignaciones/" + sinId.body.asignacion.id, { cuerpo: { rev: 1, motivo: "sobra" } });
  assert.deepEqual([baja.status, baja.body.borrado], [200, sinId.body.asignacion.id]);
  assert.equal(await cuenta(db, "asignacion_destino WHERE asignacion_id = '" + sinId.body.asignacion.id + "'") , 0);
  assert.equal((await api(env, "DELETE", "playlists/cafes", { cuerpo: { rev: 1 } })).status, 200);
});

prueba("circuitos: crear, listar, leer, PATCH, borrar; su historial remite a la auditoría", async () => {
  const { db, env } = await mundo();
  const alta = await api(env, "POST", "circuitos", { cuerpo: { nombre: "Gracia", destino: { any: ["pantalla:sbux-021", "pantalla:sbux-022"] } } });
  assert.deepEqual([alta.status, alta.body.circuito.id, alta.body.circuito.activo, alta.body.version], [201, "gracia", true, 1]);
  assert.equal((await api(env, "POST", "circuitos", { cuerpo: { nombre: "Vacío", destino: {} } })).body.campo, "destino");
  assert.deepEqual((await api(env, "GET", "circuitos")).body.circuitos.map(c => c.id), ["gracia"]);
  assert.equal((await api(env, "GET", "circuitos/gracia")).body.circuito.nombre, "Gracia");
  const patch = await api(env, "PATCH", "circuitos/gracia", { cuerpo: { rev: 1, activo: false } });
  assert.deepEqual([patch.status, patch.body.circuito.activo, patch.body.circuito.destino.any.length, patch.body.version], [200, false, 2, 2]);
  const h = await api(env, "GET", "historial/circuitos/gracia");
  assert.deepEqual([h.status, h.body.tipo, h.body.revisiones, h.body.actual.rev], [200, "circuito", [], 2]);
  assert.match(h.body.nota, /auditoria\?entidad=circuito&id=gracia/);
  assert.equal((await api(env, "DELETE", "circuitos/gracia?rev=2")).status, 200);
  assert.equal((await api(env, "GET", "historial/circuito/gracia")).status, 404, "borrado y sin revisiones: sólo queda la auditoría");
  assert.deepEqual((await api(env, "GET", "auditoria?entidad=circuitos&id=gracia")).body.entradas.map(e => e.accion), ["borrar", "actualizar", "crear"]);
  assert.equal(await version(db), 3);
});

// ── Conflictos y validación ─────────────────────────────────────────────────────────────────────────────────────
prueba("409 por una rev vieja (PUT, PATCH y DELETE): con la fila actual y sin rastro en historial, auditoría ni versión", async () => {
  const { db, env } = await mundo();
  await api(env, "POST", "playlists", { cuerpo: fija() });
  await api(env, "PUT", "playlists/cafes", { cuerpo: fija({ nombre: "Cafés 2", rev: 1 }) });
  await api(env, "POST", "asignaciones", { cuerpo: { id: "a1", playlist_id: "cafes", destino: { all: ["todas"] } } });
  await api(env, "POST", "circuitos", { cuerpo: { nombre: "Gracia", destino: { any: ["pantalla:x"] } } });
  const antes = await rastro(db);
  assert.deepEqual(antes, { version: 4, auditoria: 4, revisiones: 3 });
  const casos = [
    ["PUT", "playlists/cafes", { cuerpo: fija({ nombre: "Pisotón", rev: 1 }) }, "playlist", 2],
    ["PATCH", "playlists/cafes", { cuerpo: { nombre: "Pisotón" }, cabeceras: { "If-Match": "1" } }, "playlist", 2],
    ["DELETE", "playlists/cafes?rev=1", {}, "playlist", 2],
    ["PATCH", "asignaciones/a1", { cuerpo: { rev: 7, estado: "pausada" } }, "asignacion", 1],
    ["DELETE", "asignaciones/a1", { cuerpo: { rev: 2 } }, "asignacion", 1],
    ["PUT", "circuitos/gracia", { cuerpo: { nombre: "Gracia", destino: { any: ["pantalla:y"] }, rev: 3 } }, "circuito", 1],
  ];
  for (const [m, ruta, opciones, entidad, revActual] of casos) {
    const r = await api(env, m, ruta, opciones);
    assert.deepEqual([r.status, r.body.ok, r.body.error, r.body.actual && r.body.actual.rev], [409, false, "revision_conflict", revActual], `${m} ${ruta}`);
    assert.equal(r.body.actual.id, ruta.split("/")[1].split("?")[0]);
    if (entidad === "playlist") assert.equal(r.body.actual.nombre, "Cafés 2");
  }
  assert.deepEqual(await rastro(db), antes, "ningún 409 deja revisión, auditoría ni versión");
  assert.equal((await A.leerPlaylist(db, "cafes")).nombre, "Cafés 2");
  assert.equal((await A.leerAsignacion(db, "a1")).estado, "activa");
});

prueba("422 con el campo culpable (y 400 si el JSON no se entiende), sin escribir nada", async () => {
  const { db, env } = await mundo();
  await api(env, "POST", "playlists", { cuerpo: fija() });
  const antes = await rastro(db);
  const casos = [
    ["POST", "playlists", { tipo: "fija", items: [] }, "nombre_requerido", "nombre"],
    ["POST", "playlists", { nombre: "Viva", tipo: "viva" }, "viva_sin_reglas", "reglas"],
    ["POST", "playlists", { nombre: "Rara", tipo: "otra" }, "tipo_invalido", "tipo"],
    ["POST", "playlists", { nombre: "Mala", items: [{ asset: "http://inseguro/x.mp4" }] }, "pieza_invalida", "items"],
    ["POST", "playlists", { nombre: "Muchas", items: Array.from({ length: 201 }, (_, i) => item("p" + i)) }, "demasiados_items", "items"],
    ["POST", "asignaciones", { playlist_id: "cafes" }, "destino_requerido", "destino"],
    ["POST", "asignaciones", { destino: { all: ["todas"] } }, "playlist_requerida", "playlist_id"],
    ["POST", "asignaciones", { playlist_id: "cafes", destino: { all: ["todas"] }, franjas: ["25:00-26:00"] }, "franja_invalida", "franjas"],
    ["POST", "asignaciones", { playlist_id: "cafes", destino: { all: ["todas"] }, fecha_desde: "2026-10-20", fecha_hasta: "2026-10-01" }, "fechas_invertidas", "fecha_hasta"],
    ["POST", "asignaciones", { playlist_id: "cafes", destino: { all: ["todas"] }, capa: "vip" }, "capa_invalida", "capa"],
    ["POST", "asignaciones", { playlist_id: "cafes", destino: { all: ["todas"] }, dias: ["Q"] }, "dias_invalidos", "dias"],
    ["PUT", "playlists/cafes", { ...fija({ id: "otra" }), rev: 1 }, "id_no_coincide", "id"],
    ["PATCH", "playlists/cafes", { rev: 1, tipo: "viva" }, "viva_sin_reglas", "reglas"],
  ];
  for (const [m, ruta, cuerpo, error, campo] of casos) {
    const r = await api(env, m, ruta, { cuerpo });
    assert.deepEqual([r.status, r.body.ok, r.body.error, r.body.campo], [422, false, error, campo], `${m} ${ruta} ${error}`);
    assert.ok(r.body.mensaje && r.body.mensaje.length > 5, "con un mensaje legible");
  }
  for (const cuerpo of ["{roto", "[1,2]", "", "42"]) {
    const r = await api(env, "POST", "playlists", { cuerpo });
    assert.deepEqual([r.status, r.body.error], [400, "json_invalido"], JSON.stringify(cuerpo));
  }
  assert.deepEqual(await rastro(db), antes, "nada de esto escribe");
});

// ── Acceso ──────────────────────────────────────────────────────────────────────────────────────────────────────
prueba("acceso: 401 sin sesión, 403 sin permiso, el visor lee pero no escribe y el actor es el email de la sesión", async () => {
  const { db, env } = await mundo();
  for (const [m, ruta] of [["GET", "playlists"], ["GET", "auditoria"], ["POST", "playlists"], ["PUT", "playlists/cafes"], ["DELETE", "playlists/cafes?rev=1"]]) {
    const anonimo = await api(env, m, ruta, { cuerpo: m === "GET" ? undefined : fija(), token: null });
    assert.deepEqual([m, ruta, anonimo.status, anonimo.body.error], [m, ruta, 401, "unauthorized"]);
    const ajeno = await api(env, m, ruta, { cuerpo: m === "GET" ? undefined : fija(), token: T.sinPermiso });
    assert.deepEqual([m, ruta, ajeno.status, ajeno.body.error], [m, ruta, 403, "forbidden"]);
  }
  assert.equal((await api(env, "GET", "playlists", { token: "tok-caducado-o-inventado" })).status, 401);
  assert.equal(await version(db), 0);
  // Quien tiene digitalsignage-player (sin ser dueño) escribe con su email como actor.
  const alta = await api(env, "POST", "playlists", { cuerpo: fija(), token: T.editora });
  assert.deepEqual([alta.status, alta.body.playlist.creado_por], [201, EDITORA]);
  assert.deepEqual((await A.auditoria(db)).map(a => [a.actor, a.accion]), [[EDITORA, "crear"]]);
  // El visor (sesión de lectura viva) lee las playlists como en /api/emision, pero sin ver quién escribió, y no escribe.
  const visor = await api(env, "GET", "playlists/cafes", { token: T.visor });
  assert.deepEqual([visor.status, visor.body.playlist.id, visor.body.playlist.nombre], [200, "cafes", "Cafés"]);
  assert.ok(calls.some(u => u.startsWith("https://data.yokup.com/api/lectura/sesion")), "comprobó que el visor sigue vivo");
  const lista = await api(env, "GET", "playlists", { token: T.visor });
  assert.deepEqual(lista.body.playlists.map(p => p.id), ["cafes"]);
  for (const fila of [visor.body.playlist, ...lista.body.playlists]) {
    assert.ok(!("creado_por" in fila) && !("actualizado_por" in fila), "el visor no ve los emails de los actores");
  }
  assert.ok(!JSON.stringify([visor.body, lista.body]).includes(EDITORA));
  const escribe = await api(env, "PATCH", "playlists/cafes", { cuerpo: { rev: 1, nombre: "Visor" }, token: T.visor });
  assert.deepEqual([escribe.status, escribe.body.error], [403, "solo_lectura"]);
  assert.equal(await version(db), 1);
});

prueba("privacidad: el visor no ve historial ni auditoría (403 solo_lectura, sin tocar la D1); el portal con permiso sí", async () => {
  const { env } = await mundo();
  await api(env, "POST", "playlists", { cuerpo: fija(), token: T.editora });
  for (const ruta of ["auditoria", "auditoria?entidad=playlist&id=cafes", "historial/playlist/cafes", "historial/circuitos/x", "historial/asignacion/no-hay"]) {
    const r = await api(env, "GET", ruta, { token: T.visor });
    assert.deepEqual([ruta, r.status, r.body], [ruta, 403, { ok: false, error: "solo_lectura" }]);
    const sinD1 = await api({ ACCESS: env.ACCESS }, "GET", ruta, { token: T.visor });
    assert.equal(sinD1.status, 403, "se cierra antes de mirar la D1");
  }
  // Una sesión del portal con digitalsignage-player (sin ser dueña) lo ve todo, con los actores.
  const auditoria = await api(env, "GET", "auditoria", { token: T.editora });
  assert.deepEqual([auditoria.status, auditoria.body.entradas.map(e => e.actor)], [200, [EDITORA]]);
  const historial = await api(env, "GET", "historial/playlist/cafes", { token: T.editora });
  assert.deepEqual([historial.status, historial.body.revisiones.map(r => r.autor), historial.body.actual.creado_por], [200, [EDITORA], EDITORA]);
  assert.equal((await api(env, "GET", "playlists/cafes", { token: T.editora })).body.playlist.actualizado_por, EDITORA);
});

prueba("clave de servicio de Pixeria: Bearer o X-Programacion-Key, actor servicio:…, sólo para escribir y apagada sin el secreto", async () => {
  const { db, env } = await mundo({ PROGRAMACION_SERVICE_KEY: CLAVE });
  const bearer = await api(env, "POST", "playlists", { cuerpo: fija(), token: null, cabeceras: { Authorization: "Bearer " + CLAVE } });
  assert.deepEqual([bearer.status, bearer.body.playlist.creado_por], [201, "servicio:pixeria"]);
  const propia = await api(env, "PUT", "playlists/cafes", { cuerpo: fija({ rev: 1, origen: "pixeria-stock" }), token: null,
    cabeceras: { "X-Programacion-Key": CLAVE, "X-Actor": "Stock Pixeria" } });
  assert.deepEqual([propia.status, propia.body.playlist.actualizado_por, propia.body.playlist.origen], [200, "servicio:stock-pixeria", "pixeria-stock"]);
  assert.deepEqual((await A.auditoria(db)).map(a => a.actor), ["servicio:stock-pixeria", "servicio:pixeria"]);
  // Una clave equivocada no es nada: sin sesión, 401; con sesión, manda la sesión.
  for (const cabeceras of [{ Authorization: "Bearer " + CLAVE + "x" }, { "X-Programacion-Key": CLAVE.slice(0, -1) }, { Authorization: "Basic " + CLAVE }]) {
    assert.equal((await api(env, "POST", "playlists", { cuerpo: fija({ id: "otra" }), token: null, cabeceras })).status, 401, JSON.stringify(cabeceras));
  }
  const conSesion = await api(env, "POST", "playlists", { cuerpo: fija({ id: "otra" }), cabeceras: { "X-Programacion-Key": "mala" } });
  assert.deepEqual([conSesion.status, conSesion.body.playlist.creado_por], [201, DUENO]);
  // Leer exige sesión: la clave no abre lecturas.
  assert.equal((await api(env, "GET", "playlists/cafes", { token: null, cabeceras: { "X-Programacion-Key": CLAVE } })).status, 401);
  assert.equal((await api(env, "GET", "auditoria", { token: null, cabeceras: { Authorization: "Bearer " + CLAVE } })).status, 401);
  // Sin el secreto puesto, la clave de servicio está apagada (401, no 500).
  const { env: sinSecreto } = await mundo();
  for (const cabeceras of [{ Authorization: "Bearer " + CLAVE }, { "X-Programacion-Key": CLAVE }]) {
    const r = await api(sinSecreto, "POST", "playlists", { cuerpo: fija(), token: null, cabeceras });
    assert.deepEqual([r.status, r.body.error], [401, "unauthorized"]);
  }
  assert.equal((await api({ ...sinSecreto, PROGRAMACION_SERVICE_KEY: "" }, "POST", "playlists", { cuerpo: fija(), token: null, cabeceras: { "X-Programacion-Key": "" } })).status, 401);
  // La comparación: por resumen SHA-256, sin atajos por longitud.
  assert.equal(await mismaClave(CLAVE, CLAVE), true);
  assert.equal(await mismaClave(CLAVE, CLAVE + "0"), false);
  assert.equal(await mismaClave("", ""), false);
});

// ── Historial y auditoría ───────────────────────────────────────────────────────────────────────────────────────
prueba("historial: las revisiones con autor y datos, de la última a la primera; tras borrar, siguen y actual es null", async () => {
  const { env } = await mundo({ PROGRAMACION_SERVICE_KEY: CLAVE });
  await api(env, "POST", "playlists", { cuerpo: { ...fija(), motivo: "alta" } });
  await api(env, "PATCH", "playlists/cafes", { cuerpo: { rev: 1, nombre: "Cafés 2", motivo: "renombrar" }, token: T.editora });
  await api(env, "PUT", "playlists/cafes", { cuerpo: fija({ nombre: "Cafés 3", rev: 2 }), token: null, cabeceras: { "X-Programacion-Key": CLAVE } });
  const h = await api(env, "GET", "historial/playlist/cafes");
  assert.equal(h.status, 200);
  assert.deepEqual([h.body.tipo, h.body.id, h.body.actual.rev], ["playlist", "cafes", 3]);
  assert.deepEqual(h.body.revisiones.map(r => [r.rev, r.autor, r.motivo, r.datos.nombre]),
    [[3, "servicio:pixeria", "", "Cafés 3"], [2, EDITORA, "renombrar", "Cafés 2"], [1, DUENO, "alta", "Cafés"]]);
  assert.deepEqual(h.body.revisiones[0].datos.items.map(i => i.stockId), ["c1", "c2"]);
  assert.equal((await api(env, "GET", "historial/playlists/cafes")).status, 200, "también en plural");
  await api(env, "DELETE", "playlists/cafes?rev=3");
  const despues = await api(env, "GET", "historial/playlist/cafes");
  assert.deepEqual([despues.status, despues.body.actual, despues.body.revisiones.length], [200, null, 3]);
  assert.equal((await api(env, "GET", "historial/playlist/nunca")).status, 404);
  assert.equal((await api(env, "GET", "historial/asignacion/nunca")).status, 404);
});

prueba("auditoría: filtros por entidad, id, actor y acción; paginada con `antes` y `siguiente`; el borrado guarda la copia final", async () => {
  const { env } = await mundo();
  await api(env, "POST", "playlists", { cuerpo: fija() });                                                  // 1 crear playlist (dueño)
  await api(env, "POST", "playlists", { cuerpo: fija({ id: "te", nombre: "Tés" }), token: T.editora });     // 2 crear playlist (editora)
  await api(env, "POST", "asignaciones", { cuerpo: { id: "a1", playlist_id: "te", destino: { all: ["todas"] } } });   // 3
  await api(env, "PATCH", "playlists/te", { cuerpo: { rev: 1, nombre: "Tés 2" }, token: T.editora });       // 4 actualizar (editora)
  await api(env, "POST", "circuitos", { cuerpo: { nombre: "Gracia", destino: { any: ["pantalla:x"] } } });  // 5
  await api(env, "DELETE", "playlists/cafes?rev=1&motivo=sobra");                                           // 6 borrar
  const todo = await api(env, "GET", "auditoria");
  assert.deepEqual([todo.status, todo.body.version, todo.body.siguiente], [200, 6, null]);
  assert.deepEqual(todo.body.entradas.map(e => [e.version, e.accion, e.entidad, e.entidad_id]), [
    [6, "borrar", "playlist", "cafes"], [5, "crear", "circuito", "gracia"], [4, "actualizar", "playlist", "te"],
    [3, "crear", "asignacion", "a1"], [2, "crear", "playlist", "te"], [1, "crear", "playlist", "cafes"]]);
  const baja = todo.body.entradas[0];
  assert.deepEqual([baja.actor, baja.detalle.motivo, baja.detalle.datos.nombre, baja.detalle.datos.items.length], [DUENO, "sobra", "Cafés", 2]);
  const ids = r => r.body.entradas.map(e => e.version);
  assert.deepEqual(ids(await api(env, "GET", "auditoria?entidad=playlist")), [6, 4, 2, 1]);
  assert.deepEqual(ids(await api(env, "GET", "auditoria?entidad=playlists&id=te")), [4, 2]);
  assert.deepEqual(ids(await api(env, "GET", "auditoria?actor=" + encodeURIComponent(EDITORA.toUpperCase()))), [4, 2]);
  assert.deepEqual(ids(await api(env, "GET", "auditoria?accion=crear&entidad=asignaciones")), [3]);
  // Páginas de 2: siguiente es el id de auditoría desde el que seguir (antes=).
  const p1 = await api(env, "GET", "auditoria?limite=2");
  assert.deepEqual(ids(p1), [6, 5]);
  assert.ok(p1.body.siguiente > 0);
  const p2 = await api(env, "GET", "auditoria?limite=2&antes=" + p1.body.siguiente);
  assert.deepEqual(ids(p2), [4, 3]);
  const p3 = await api(env, "GET", "auditoria?limite=2&antes=" + p2.body.siguiente);
  assert.deepEqual([ids(p3), p3.body.siguiente], [[2, 1], null]);
  assert.deepEqual(ids(await api(env, "GET", "auditoria?limite=999")).length, 6, "el límite se acota, no falla");
  assert.deepEqual((await api(env, "GET", "auditoria?entidad=pantalla")).body, { ok: false, error: "entidad_invalida" });
  assert.deepEqual((await api(env, "GET", "auditoria?antes=ayer")).body, { ok: false, error: "antes_invalido" });
});

// ── Versión y GET /api/programacion ─────────────────────────────────────────────────────────────────────────────
prueba("cada escritura sube meta.version y GET /api/programacion deja de acertar en su memoria y ve el cambio", async () => {
  forgetMemo();
  olvidarMemoria();
  const { db, env } = await mundo();
  const SCREEN = "alcampo-alcala", AT = Date.parse("2026-10-14T08:00:00.000Z");
  const leer = async () => {
    const r = await programacionGet({ request: new Request(`https://admira.tv/api/programacion?screen=${SCREEN}&at=${AT}`, { headers: { Cookie: "__Host-atv_session=" + T.dueno } }), env });
    return r.json();
  };
  await api(env, "POST", "playlists", { cuerpo: fija({ id: "mano", nombre: "Mano", items: [item("m1")] }) });
  await api(env, "POST", "asignaciones", { cuerpo: { id: "mano", playlist_id: "mano", destino: { all: ["pantalla:" + SCREEN] } } });
  const primera = await leer(), segunda = await leer();
  assert.deepEqual([primera.ok, primera.version, primera.memoria, segunda.memoria], [true, 2, "fallo", "acierto"]);
  assert.deepEqual(segunda.items.map(i => i.stockId), ["m1"]);
  // Una escritura por la API nueva: la versión sube y la memoria de E3 se invalida.
  const put = await api(env, "PATCH", "playlists/mano", { cuerpo: { rev: 1, items: [item("m1"), item("m9")] } });
  assert.equal(put.body.version, 3);
  const tercera = await leer();
  assert.deepEqual([tercera.version, tercera.memoria, tercera.items.map(i => i.stockId)], [3, "fallo", ["m1", "m9"]]);
  assert.equal((await leer()).memoria, "acierto");
  // Pausar la asignación también es una escritura: la pantalla se queda sin base.
  await api(env, "PATCH", "asignaciones/mano", { cuerpo: { rev: 1, estado: "pausada" } });
  const cuarta = await leer();
  assert.deepEqual([cuarta.version, cuarta.memoria, cuarta.items, cuarta.capa], [4, "fallo", [], "relleno"]);
  assert.equal(await version(db), 4);
});
