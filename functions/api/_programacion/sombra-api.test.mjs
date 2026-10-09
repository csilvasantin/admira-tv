// node --test functions/api/_programacion/ — rutas del modo sombra (E6 · modelo único de playlists):
// GET/POST /api/programacion/banderas (sólo la sesión del portal, auditado, motor bloqueado hasta E13) y
// GET /api/programacion/sombra (como las lecturas de E4: también el visor, porque no lleva emails).
import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { d1Memoria } from "./_d1-memoria.mjs";
import * as A from "./almacen.js";
import { guardarSombra } from "./sombra.js";
import { olvidarSombra, sombraTrasRespuesta } from "./gancho-sombra.js";
import { onRequest } from "../programacion/[recurso]/[[resto]].js";

const SQL = await readFile(new URL("../../../migrations/programacion/0001.sql", import.meta.url), "utf8");
const sinSqlite = !(await d1Memoria());
const prueba = (nombre, fn) => test(nombre, { skip: sinSqlite && "node:sqlite no disponible (Node ≥ 22.13)" }, fn);

// ── Sesiones, KV, D1 y red simulados (como programacion-escritura.test.mjs) ─────────────────────────────────────
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
  return { db, env: { ACCESS: kv(), PROGRAMACION_DB: db, PROGRAMACION_SERVICE_KEY: CLAVE, ...extra } };
}
beforeEach(() => {
  globalThis.__realFetch ??= globalThis.fetch;
  globalThis.fetch = async input => {
    const url = String((input && input.url) || input);
    if (url.startsWith("https://data.yokup.com/api/lectura/sesion")) return new Response(JSON.stringify({ ok: true, site: "tv" }), { status: 200 });
    return new Response("null", { status: 404 });
  };
});
afterEach(() => { globalThis.fetch = globalThis.__realFetch; });

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
const cuenta = async (db, tabla, where = "1") => (await db.prepare(`SELECT COUNT(*) AS n FROM ${tabla} WHERE ${where}`).first()).n;

// ── Banderas ────────────────────────────────────────────────────────────────────────────────────────────────────
prueba("banderas: sólo la sesión del portal con permiso, también para leer (ni visor ni clave de servicio)", async () => {
  const { env } = await mundo();
  const casos = [[null, {}, 401, "unauthorized"], [T.sinPermiso, {}, 403, "forbidden"], [T.visor, {}, 403, "solo_lectura"],
    [null, { "X-Programacion-Key": CLAVE }, 403, "banderas_solo_sesion"], [null, { Authorization: "Bearer " + CLAVE }, 403, "banderas_solo_sesion"],
    [null, { "X-Programacion-Key": "otra" }, 401, "unauthorized"]];
  for (const [token, cabeceras, status, error] of casos) {
    for (const [m, cuerpo] of [["GET"], ["POST", { sombra: true }]]) {
      const r = await api(env, m, "banderas", { token, cabeceras, cuerpo });
      assert.deepEqual([r.status, r.body.error], [status, error], `${m} ${token} ${JSON.stringify(cabeceras)}`);
    }
  }
  const leer = await api(env, "GET", "banderas", { token: T.editora });
  assert.deepEqual(leer.body, { ok: true, version: 0, banderas: { motor: "apagado", sombra: false }, editables: ["sombra"], bloqueadas: { motor: "motor_bloqueado_hasta_E13" } });
  assert.match(leer.headers.get("Cache-Control"), /no-store/);
  const metodo = await api(env, "PUT", "banderas", { cuerpo: {} });
  assert.deepEqual([metodo.status, metodo.headers.get("Allow")], [405, "GET, POST"]);
  // Sin el binding: 503, después del acceso.
  const sinD1 = { ACCESS: kv() };
  assert.deepEqual([(await api(sinD1, "GET", "banderas")).status, (await api(sinD1, "GET", "banderas", { token: null })).status], [503, 401]);
});

prueba("banderas: encender y apagar la sombra queda auditado a nombre de quien lo hace; repetir no escribe", async () => {
  const { db, env } = await mundo();
  const on = await api(env, "POST", "banderas", { cuerpo: { sombra: true, motivo: "arranca el modo sombra" } });
  assert.deepEqual(on.body, { ok: true, cambiado: true, version: 1, banderas: { motor: "apagado", sombra: true } });
  assert.deepEqual((await A.leerMeta(db)).banderas, { motor: "apagado", sombra: true });
  const [audit] = (await api(env, "GET", "auditoria?accion=banderas")).body.entradas;
  assert.deepEqual([audit.actor, audit.accion, audit.entidad, audit.entidad_id, audit.version], [DUENO, "banderas", "meta", "banderas", 1]);
  assert.deepEqual(audit.detalle, { cambios: { sombra: true }, antes: { sombra: false }, motivo: "arranca el modo sombra" });
  // Lo mismo otra vez: ni auditoría ni versión.
  const otra = await api(env, "POST", "banderas", { cuerpo: { sombra: true } });
  assert.deepEqual([otra.body.cambiado, otra.body.version], [false, 1]);
  assert.equal(await cuenta(db, "auditoria"), 1);
  const off = await api(env, "POST", "banderas", { cuerpo: { sombra: false }, token: T.editora });
  assert.deepEqual([off.body.cambiado, off.body.version, off.body.banderas.sombra], [true, 2, false]);
  assert.equal((await api(env, "GET", "auditoria?accion=banderas")).body.entradas[0].actor, EDITORA);
});

prueba("banderas: motor bloqueado hasta E13 (409 sin escribir) y 422 a lo que no es una bandera editable", async () => {
  const { db, env } = await mundo();
  for (const cuerpo of [{ motor: "encendido" }, { motor: "apagado" }, { motor: "sombra", sombra: true }]) {
    const r = await api(env, "POST", "banderas", { cuerpo });
    assert.deepEqual([r.status, r.body.error, r.body.banderas], [409, "motor_bloqueado_hasta_E13", { motor: "apagado", sombra: false }], JSON.stringify(cuerpo));
  }
  const casos = [[{ sombra: "si" }, "bandera_invalida", "sombra"], [{ sombra: 1 }, "bandera_invalida", "sombra"], [{ otra: true }, "bandera_desconocida", "otra"],
    [{}, "bandera_requerida", "sombra"], [{ motivo: "x" }, "bandera_requerida", "sombra"]];
  for (const [cuerpo, error, campo] of casos) {
    const r = await api(env, "POST", "banderas", { cuerpo });
    assert.deepEqual([r.status, r.body.error, r.body.campo], [422, error, campo], JSON.stringify(cuerpo));
  }
  for (const cuerpo of ["{roto", "[1]", ""]) assert.equal((await api(env, "POST", "banderas", { cuerpo })).body.error, "json_invalido");
  assert.deepEqual([(await A.leerMeta(db)).version, await cuenta(db, "auditoria")], [0, 0], "nada escrito");
});

prueba("banderas: encender por la ruta se nota al momento en esta instancia (el gancho vuelve a leer la bandera)", async () => {
  const { env } = await mundo();
  olvidarSombra();
  const tareas = [], encarga = () => sombraTrasRespuesta({ env, waitUntil: p => tareas.push(p), screen: "alcampo-alcala", q: new URLSearchParams("w=1920&h=1080"),
    respuesta: { ok: true, draft: { items: [] }, screenTags: [], auto: [] } });
  assert.equal(encarga(), true);
  assert.deepEqual(await Promise.all(tareas), [{ hecho: "apagada" }]);
  assert.equal(encarga(), false, "apagada y sabida: no encarga nada durante un minuto");
  assert.equal((await api(env, "POST", "banderas", { cuerpo: { sombra: true } })).body.cambiado, true);
  assert.equal(encarga(), true, "tras encenderla, el gancho la relee ya");
  await Promise.all(tareas);
  olvidarSombra();
});

// ── Lista de la sombra ──────────────────────────────────────────────────────────────────────────────────────────
const T0 = Date.UTC(2026, 9, 14, 8);
const res = (veredicto, motivo, capa = "por_defecto") => ({ veredicto, motivo, coincide: { distinta: 0, igual: 1, equivalente: 2 }[veredicto], capa,
  firmaLegado: `${capa}·3p·aaaaaaaa`, firmaNueva: `${capa}·3p·${veredicto === "igual" ? "aaaaaaaa" : "bbbbbbbb"}`,
  detalle: { veredicto, motivo, legado: { fuente: "defecto", capa, claves: ["s1"] }, nuevo: { capa, claves: ["s1"] }, ...(veredicto === "igual" ? {} : { diferencia: { base: { soloLegado: [], soloNuevo: ["s9"] } } }) } });
async function sembrar(db) {
  await guardarSombra(db, "alcampo-alcala", res("igual", "misma_lista"), { ahora: T0, version: 4 });
  await guardarSombra(db, "alcampo-parla", res("equivalente", "relleno_del_player", "relleno"), { ahora: T0 + 1000, version: 4 });
  await guardarSombra(db, "sbux-021-p1", res("distinta", "piezas_distintas"), { ahora: T0 + 2000, version: 4 });
  await guardarSombra(db, "sbux-021-p2", res("distinta", "nuevo_vacio"), { ahora: T0 + 2000, version: 4 });
}

prueba("sombra: lista con veredicto, motivo, firmas, primera y última vez, cuentas por veredicto y por motivo", async () => {
  const { db, env } = await mundo();
  await A.fijarBanderas(db, { sombra: true }, { actor: DUENO });
  await sembrar(db);
  const r = await api(env, "GET", "sombra");
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.banderas, { sombra: true, motor: "apagado" });
  assert.deepEqual(r.body.cuentas, { igual: 1, equivalente: 1, distinta: 2, total: 4 });
  assert.deepEqual(r.body.motivos.find(m => m.motivo === "piezas_distintas"), { veredicto: "distinta", motivo: "piezas_distintas", n: 1 });
  assert.deepEqual(r.body.filas.map(f => f.pantalla), ["sbux-021-p1", "sbux-021-p2", "alcampo-parla", "alcampo-alcala"], "lo que cambió último, primero");
  const f = r.body.filas[0];
  assert.deepEqual([f.veredicto, f.motivo, f.capa, f.version, f.desde, f.primera, f.ultima, f.cambios], ["distinta", "piezas_distintas", "por_defecto", 4, T0 + 2000, T0 + 2000, T0 + 2000, 0]);
  assert.deepEqual(f.firmas, { legado: "por_defecto·3p·aaaaaaaa", nuevo: "por_defecto·3p·bbbbbbbb" });
  assert.deepEqual(f.diferencia, { base: { soloLegado: [], soloNuevo: ["s9"] } });
  assert.equal(r.body.siguiente, null);
  assert.doesNotMatch(JSON.stringify(r.body), /@/, "sin emails");
});

prueba("sombra: filtros por veredicto, motivo y pantalla, páginas con `antes` y 400 a lo ilegible", async () => {
  const { db, env } = await mundo();
  await sembrar(db);
  assert.deepEqual((await api(env, "GET", "sombra?veredicto=distinta")).body.filas.map(f => f.pantalla), ["sbux-021-p1", "sbux-021-p2"]);
  assert.deepEqual((await api(env, "GET", "sombra?veredicto=equivalente")).body.filas.map(f => f.motivo), ["relleno_del_player"]);
  assert.deepEqual((await api(env, "GET", "sombra?motivo=nuevo_vacio")).body.filas.map(f => f.pantalla), ["sbux-021-p2"]);
  assert.deepEqual((await api(env, "GET", "sombra?pantalla=alcampo-alcala")).body.filas.map(f => f.veredicto), ["igual"]);
  // Las cuentas son siempre de todo, con o sin filtro.
  assert.equal((await api(env, "GET", "sombra?veredicto=igual")).body.cuentas.total, 4);
  const vistas = [];
  let p = await api(env, "GET", "sombra?limite=1");
  vistas.push(...p.body.filas.map(f => f.pantalla));
  while (p.body.siguiente) { p = await api(env, "GET", "sombra?limite=1&antes=" + encodeURIComponent(p.body.siguiente)); vistas.push(...p.body.filas.map(f => f.pantalla)); }
  assert.deepEqual(vistas, ["sbux-021-p1", "sbux-021-p2", "alcampo-parla", "alcampo-alcala"], "sin perder ni repetir con el mismo `en`");
  for (const [qs, error] of [["veredicto=rara", "veredicto_invalido"], ["motivo=Con-Guion", "motivo_invalido"], ["pantalla=../x", "pantalla_invalida"], ["antes=ayer", "antes_invalido"]]) {
    assert.deepEqual([(await api(env, "GET", "sombra?" + qs)).status, (await api(env, "GET", "sombra?" + qs)).body.error], [400, error], qs);
  }
  assert.deepEqual([(await api(env, "POST", "sombra", { cuerpo: {} })).status, (await api(env, "POST", "sombra", { cuerpo: {} })).headers.get("Allow")], [405, "GET"]);
});

prueba("sombra: acceso de las lecturas de E4 (el visor también lee: no lleva emails); 503 sin la D1", async () => {
  const { db, env } = await mundo();
  await sembrar(db);
  assert.deepEqual([(await api(env, "GET", "sombra", { token: null })).status, (await api(env, "GET", "sombra", { token: T.sinPermiso })).status], [401, 403]);
  const visor = await api(env, "GET", "sombra", { token: T.visor });
  assert.deepEqual([visor.status, visor.body.cuentas.total], [200, 4]);
  assert.equal((await api(env, "GET", "sombra", { token: null, cabeceras: { "X-Programacion-Key": CLAVE } })).status, 401, "la clave de servicio no lee");
  assert.equal((await api({ ACCESS: kv() }, "GET", "sombra")).body.error, "programacion_db_no_configurada");
  const error = console.error;
  console.error = () => {};   // la ruta deja en el log el fallo de leer meta sin la migración
  try { assert.equal((await api({ ACCESS: kv(), PROGRAMACION_DB: await d1Memoria("") }, "GET", "sombra")).body.error, "programacion_db_sin_esquema"); }
  finally { console.error = error; }
});
