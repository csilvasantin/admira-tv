// node --test 'functions/api/_programacion/*.test.mjs' — doble escritura (E7 · modelo único de playlists).
// Cada escritura del legado (POST /api/playlist: borrador «Por defecto» con sesión o con la clave del Stock, live-save,
// live-delete, circuit-save, circuit-delete) se hace con el handler de verdad sobre un KV simulado y la D1 simulada con
// la migración real. Después: la simulación del importador sale toda igual y la D1 tiene, columna a columna, lo mismo
// que una importación nueva del mismo KV. Además: bandera apagada = sin D1; un fallo de la D1 no cambia la respuesta y
// deja la marca; lo editado fuera no se pisa; lo sintético no se refleja; la respuesta sale antes que el espejo.
import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { d1Memoria } from "./_d1-memoria.mjs";
import * as A from "./almacen.js";
import { contenido } from "./importador.js";
import { ACTOR_ESPEJO, MEMORIA_MS, actorEspejo, espejar, olvidarBanderas } from "./espejo.js";
import { onRequest } from "../programacion/[recurso]/[[resto]].js";
import { DRAFT_PREFIX, forgetMemo, onRequestGet, onRequestPost } from "../playlist.js";
import { LIVE_KEY } from "../_playlist-live.js";

const SQL = await readFile(new URL("../../../migrations/programacion/0001.sql", import.meta.url), "utf8");
const sinSqlite = !(await d1Memoria());
const prueba = (nombre, fn) => test(nombre, { skip: sinSqlite && "node:sqlite no disponible (Node ≥ 22.13)" }, fn);

// ── Sesiones, KV, D1 y red simulados ────────────────────────────────────────────────────────────────────────────
const DUENO = "csilvasantin@gmail.com", EDITORA = "editora@admira.com";
const T = { dueno: "tok-dueno", editora: "tok-editora" };
const CLAVE_STOCK = "clave-del-stock-de-prueba";   // valor ficticio: sólo vive en el env de estas pruebas
const usuarios = { v: 3, projects: [{ id: "admira-tv" }, { id: "digitalsignage-player", parent: "admira-tv" }],
  users: [{ email: EDITORA, status: "active", roles: { "digitalsignage-player": "editor" } }] };
const sesiones = () => {
  const exp = Date.now() + 3600e3, s = (tok, rec) => ["admira-tv:auth:session:" + tok, JSON.stringify({ ...rec, expiresAt: exp })];
  return Object.fromEntries([s(T.dueno, { email: DUENO }), s(T.editora, { email: EDITORA }), ["admira-tv:users:v3", JSON.stringify(usuarios)]]);
};
function kvLegado(entradas = {}) {
  const store = new Map(Object.entries({ ...sesiones(), ...entradas })), escrituras = [];
  return {
    store, escrituras,
    get: async k => (store.has(k) ? store.get(k) : null),
    getWithMetadata: async k => ({ value: store.get(k) ?? null, metadata: null }),
    list: async ({ prefix = "", limit = 1000, cursor } = {}) => {
      const claves = [...store.keys()].filter(k => k.startsWith(prefix)).sort(), desde = cursor ? Number(cursor) : 0;
      const fin = desde + limit >= claves.length;
      return { keys: claves.slice(desde, desde + limit).map(name => ({ name })), list_complete: fin, ...(fin ? {} : { cursor: String(desde + limit) }) };
    },
    put: async (k, v) => { escrituras.push(["put", k]); store.set(k, v); },
    delete: async k => { escrituras.push(["delete", k]); store.delete(k); },
  };
}
/** La D1 que ven los handlers: la misma base, apuntando cada sentencia. `antes(sqls)` puede fallar o esperar. */
function espia(db, antes = null) {
  const sql = [];
  const pasa = async (lista, fn) => { if (antes) await antes(lista); return fn(); };
  const envolver = st => ({ ...st, bind: (...a) => envolver(st.bind(...a)),
    first: (...a) => { sql.push(st.sql); return pasa([st.sql], () => st.first(...a)); },
    all: () => { sql.push(st.sql); return pasa([st.sql], () => st.all()); },
    run: () => { sql.push(st.sql); return pasa([st.sql], () => st.run()); } });
  return { sql, prepare: s => envolver(db.prepare(s)), batch: lista => { const s = lista.map(x => x.sql); sql.push(...s); return pasa(s, () => db.batch(lista)); } };
}
async function mundo(entradas = {}, { espejo = true, antes = null } = {}) {
  const db = await d1Memoria(SQL);
  if (espejo) await A.fijarBanderas(db, { espejo: true }, { actor: "prueba" });
  const d = espia(db, antes), kv = kvLegado(entradas);
  return { db, d, kv, env: { ACCESS: kv, PROGRAMACION_DB: d, STOCK_NOTIFY_KEY: CLAVE_STOCK } };
}
const escribe = sql => !/^\s*select\b/i.test(sql);

/** POST /api/playlist con el handler de verdad. Devuelve la respuesta tal cual y lo que hizo el espejo (ya terminado). */
async function guardar(env, cuerpo, { token = T.dueno, cabeceras = {}, esperar = true } = {}) {
  const pendientes = [], headers = { "Content-Type": "application/json", ...cabeceras };
  if (token) headers.Cookie = "__Host-atv_session=" + token;
  const r = await onRequestPost({ request: new Request("https://admira.tv/api/playlist", { method: "POST", headers, body: JSON.stringify(cuerpo) }), env, waitUntil: p => pendientes.push(p) });
  const texto = await r.text(), espejos = esperar ? await Promise.all(pendientes) : [];
  return { status: r.status, texto, body: JSON.parse(texto), cabeceras: [...r.headers], espejo: espejos[0], pendientes };
}
async function importar(env, query = "") {
  const r = await onRequest({ request: new Request("https://admira.tv/api/programacion/importar" + (query ? "?" + query : ""), { method: "POST", headers: { Cookie: "__Host-atv_session=" + T.dueno } }), env });
  return { status: r.status, body: await r.json() };
}
const parche = (env, ruta, cuerpo) => onRequest({ request: new Request("https://admira.tv/api/programacion/" + ruta, { method: "PATCH",
  headers: { Cookie: "__Host-atv_session=" + T.editora, "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) }), env });
const alta = (env, ruta, cuerpo) => onRequest({ request: new Request("https://admira.tv/api/programacion/" + ruta, { method: "POST",
  headers: { Cookie: "__Host-atv_session=" + T.editora, "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) }), env });

const todas = async (db, tabla) => (await db.prepare(`SELECT * FROM ${tabla} ORDER BY id`).all()).results;
const filas = async db => ({ playlist: await A.listarPlaylists(db, { limite: 500 }), asignacion: await A.listarAsignaciones(db, { limite: 1000 }), circuito: await A.listarCircuitos(db) });
const marcas = async (db, accion) => (await A.auditoria(db, { accion })).map(e => [e.entidad, e.entidad_id, e.detalle.motivo]);

/**
 * LA PRUEBA DE IDENTIDAD. Tras una escritura reflejada:
 *   1. la simulación del importador (con y sin ?archivar=1) no tiene nada que escribir ni que omitir;
 *   2. una importación NUEVA del mismo KV en una D1 vacía da, entidad a entidad, el mismo contenido (las columnas que
 *      compara el importador) que la D1 del espejo; lo que la del espejo tiene de más es lo que ya no está en el KV, y
 *      está archivado (asignaciones) o apagado (circuitos), o es la playlist de una asignación archivada.
 */
async function igualQueImportar(env, db, { omitidas = [], excepto = [] } = {}) {
  for (const query of ["muestra=500", "muestra=500&archivar=1"]) {
    const r = await importar(env, query);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.resumen.escrituras, 0, query + " " + JSON.stringify(r.body.muestra.filter(o => o.accion !== "igual")));
    assert.deepEqual(r.body.muestra.filter(o => o.accion !== "igual").map(o => [o.entidad, o.id, o.motivo]), omitidas, query);
  }
  const fresca = await d1Memoria(SQL);
  const ap = await importar({ ACCESS: env.ACCESS, PROGRAMACION_DB: fresca }, "aplicar=1");
  assert.equal(ap.body.ok, true, JSON.stringify(ap.body));
  const nueva = await filas(fresca), espejo = await filas(db);
  for (const entidad of ["playlist", "asignacion", "circuito"]) {
    const mias = new Map(espejo[entidad].map(f => [f.id, f]));
    for (const f of nueva[entidad]) {
      assert.ok(mias.has(f.id), `${entidad} ${f.id} falta en la D1 del espejo`);
      // Lo editado fuera (y omitido a propósito) es justo lo que NO tiene que coincidir con la importación nueva.
      if (excepto.includes(entidad + ":" + f.id)) { assert.notDeepEqual(contenido(entidad, mias.get(f.id)), contenido(entidad, f), `${entidad} ${f.id} editada`); continue; }
      assert.deepEqual(contenido(entidad, mias.get(f.id)), contenido(entidad, f), `${entidad} ${f.id}`);
      assert.ok(mias.get(f.id).creado_por.startsWith("importador:") && mias.get(f.id).actualizado_por.startsWith("importador:"), `${entidad} ${f.id} es del importador`);
    }
    const ids = new Set(nueva[entidad].map(f => f.id));
    for (const f of espejo[entidad].filter(x => !ids.has(x.id))) {
      if (entidad === "asignacion") assert.equal(f.estado, "archivada", "asignación de más: " + f.id);
      else if (entidad === "circuito") assert.equal(f.activo, false, "circuito de más: " + f.id);
      else assert.ok(espejo.asignacion.filter(a => a.playlist_id === f.id).every(a => a.estado === "archivada"), "playlist de más: " + f.id);
    }
  }
  return nueva;
}

const STOCK = [{ id: "o1", type: "video", url: "https://stock.admira.store/stock/o1/a.mp4", title: "Oferta 1", tags: ["oferta"], createdAt: 2 }];
let errores, realError;
beforeEach(() => {
  forgetMemo();
  olvidarBanderas();
  errores = [];
  realError = console.error;
  console.error = (...a) => errores.push(a);   // los fallos que se provocan aquí van al log: se miran, no se imprimen
  globalThis.__realFetch ??= globalThis.fetch;
  globalThis.fetch = async input => {
    const url = String((input && input.url) || input);
    const ok = body => new Response(JSON.stringify(body), { status: body == null ? 404 : 200, headers: { "Content-Type": "application/json" } });
    if (url.includes("/stock/index.json")) return ok({ items: STOCK });
    if (url.includes("/grid/config")) return ok({ ok: true, config: { circuit: "alcampo" } });
    if (url.includes("/grid/projects")) return ok({ ok: true, projects: [{ id: "alcampo", name: "Canal Alcampo", circuits: ["alcampo"] }] });
    return ok(null);
  };
});
afterEach(() => { globalThis.fetch = globalThis.__realFetch; console.error = realError; });

const pieza = s => ({ id: "stock-" + s, stockId: s, title: "Pieza " + s, seconds: 10, asset: `https://stock.admira.store/stock/${s}/asset.mp4`, type: "video" });
const OFERTAS = { name: "Ofertas Madrid", content: { any: ["oferta"], limit: 10, seconds: 12 }, target: { all: ["circuito:madrid"] } };
const MARCA = { name: "Marca", content: { any: ["marca"] }, target: { any: ["todas"] } };
const MADRID = { name: "Madrid", target: { all: ["pantalla:alcampo-alcala", "pantalla:alcampo-getafe"] } };

// ── Todas las escrituras del legado, una tras otra ──────────────────────────────────────────────────────────────
prueba("cada escritura del legado se refleja igual que una importación nueva del mismo KV", async () => {
  const { db, kv, env } = await mundo();
  const paso = async (cuerpo, opciones) => { const r = await guardar(env, cuerpo, opciones); assert.equal(r.status, 200, r.texto); assert.equal(r.espejo.estado, "hecho", JSON.stringify(r.espejo)); return r; };

  // 1. Borrador «Por defecto» con la sesión del portal (la parrilla): playlist fija + asignación directa.
  const a = await paso({ screen: "alcampo-alcala", items: ["m1", "m2"].map(pieza), rev: 0 });
  assert.deepEqual(a.espejo.escritas.map(e => [e.entidad, e.id, e.accion]), [["playlist", "defecto-alcampo-alcala", "crear"], ["asignacion", "defecto-alcampo-alcala", "crear"]]);
  const asg = await A.leerAsignacion(db, "defecto-alcampo-alcala");
  assert.deepEqual([asg.ref_externa, asg.directa, asg.mezcla, asg.capa, asg.creado_por, asg.actualizado_en],
    ["kv:default:alcampo-alcala", true, "sustituye", "por_defecto", ACTOR_ESPEJO + DUENO, a.body.updatedAt], "actualizado_en = la hora del KV");
  assert.deepEqual((await A.historial(db, "playlist", "defecto-alcampo-alcala")).map(h => [h.autor, h.motivo]),
    [[ACTOR_ESPEJO + DUENO, `espejo E7 · kv:default:alcampo-alcala · borrador · por ${DUENO}`]], "quién guardó en el KV va en el motivo");
  await igualQueImportar(env, db);

  // 2. Lo mismo desde el Stock de Pixeria (stock.html, players-programar), con la clave del Stock: actor de servicio.
  const p = await paso({ screen: "alcampo-getafe", secret: CLAVE_STOCK, source: "catalogo alcampo-2026-10-09", name: "Catálogo", items: [pieza("c1")] }, { token: null });
  assert.equal(p.body.draft.updatedBy, "pixeria-stock · catalogo alcampo-2026-10-09");
  const pl = await A.leerPlaylist(db, "defecto-alcampo-getafe");
  assert.deepEqual([pl.nombre, pl.creado_por], ["Catálogo", "importador:espejo:pixeria-stock"]);
  assert.match((await A.historial(db, "playlist", "defecto-alcampo-getafe"))[0].motivo, /· por pixeria-stock · catalogo alcampo-2026-10-09$/);
  // Una pantalla virtual es un borrador como otro (el importador también la importa).
  await paso({ screen: "virtual-xtanco", items: [pieza("v1")] });
  // Y otra versión del mismo borrador: actualizar, con la rev de la fila.
  const a2 = await paso({ screen: "alcampo-alcala", items: ["m1", "m2", "m3"].map(pieza), rev: a.body.rev });
  assert.deepEqual(a2.espejo.escritas, [{ entidad: "playlist", id: "defecto-alcampo-alcala", accion: "actualizar", rev: 2 }]);
  await igualQueImportar(env, db);

  // 3. Vivas: crear, crear otra (el peso de la primera sube: N, N-1…), y apagarla (pausada).
  await paso({ action: "live-save", playlist: OFERTAS });
  const m = await paso({ action: "live-save", playlist: MARCA });
  assert.deepEqual(m.espejo.escritas.map(e => [e.entidad, e.id, e.accion]),
    [["asignacion", "viva-ofertas-madrid", "actualizar"], ["playlist", "viva-marca", "crear"], ["asignacion", "viva-marca", "crear"]]);
  assert.deepEqual([(await A.leerAsignacion(db, "viva-ofertas-madrid")).peso, (await A.leerAsignacion(db, "viva-marca")).peso], [2, 1]);
  await paso({ action: "live-save", playlist: { ...MARCA, enabled: false } });
  assert.equal((await A.leerAsignacion(db, "viva-marca")).estado, "pausada");
  await igualQueImportar(env, db);

  // 4. Circuitos: uno normal; otro que no cabe en el modelo (destino_excede_limite) no se escribe y deja su marca,
  //    igual que el importador lo omite.
  const c = await paso({ action: "circuit-save", circuit: MADRID });
  assert.deepEqual(c.espejo.escritas, [{ entidad: "circuito", id: "madrid", accion: "crear", rev: 1 }]);
  const enorme = { name: "Enorme", target: { all: [...Array.from({ length: 60 }, (_, i) => "pantalla:p-" + i), ...Array.from({ length: 60 }, (_, i) => "xpacio:x-" + i)] } };
  const e = await paso({ action: "circuit-save", circuit: enorme });
  assert.deepEqual([e.espejo.escritas, e.espejo.omitidas], [[], [{ entidad: "circuito", id: "enorme", motivo: "destino_excede_limite" }]]);
  assert.equal(await A.leerCircuito(db, "enorme"), null);
  assert.deepEqual((await importar(env)).body.omitidas.map(o => [o.ref, o.motivo]), [["kv:circuito:enorme", "destino_excede_limite"]]);
  await igualQueImportar(env, db);

  // 5. Borrar una viva: su asignación se ARCHIVA (no se borra) y la que queda baja al peso 1.
  const d = await paso({ action: "live-delete", id: "marca" });
  assert.deepEqual(d.espejo.escritas.map(e => [e.entidad, e.id, e.accion]), [["asignacion", "viva-ofertas-madrid", "actualizar"], ["asignacion", "viva-marca", "archivar"]]);
  assert.deepEqual([(await A.leerAsignacion(db, "viva-marca")).estado, (await A.leerAsignacion(db, "viva-ofertas-madrid")).peso], ["archivada", 1]);
  assert.ok(await A.leerPlaylist(db, "viva-marca"), "la playlist se queda (sin asignación activa)");
  assert.match((await A.historial(db, "asignacion", "viva-marca"))[0].motivo, /^espejo E7 · kv:viva:marca · archivada: viva_eliminada · live-delete · por /);

  // 6. Borrar un circuito: se APAGA (activo: false), no se borra; las demás tablas, intactas.
  const cd = await paso({ action: "circuit-delete", id: "madrid" });
  assert.deepEqual(cd.espejo.escritas, [{ entidad: "circuito", id: "madrid", accion: "archivar", rev: 2 }]);
  assert.equal((await A.leerCircuito(db, "madrid")).activo, false);
  await igualQueImportar(env, db);

  // 7. Vaciar el borrador: la asignación se archiva (no se borra) y la playlist se queda; 8. volver a llenarlo la reactiva.
  const v = await paso({ screen: "alcampo-alcala", items: [], rev: a2.body.rev });
  assert.deepEqual(v.espejo.escritas, [{ entidad: "asignacion", id: "defecto-alcampo-alcala", accion: "archivar", rev: 2 }]);
  assert.equal((await A.leerAsignacion(db, "defecto-alcampo-alcala")).estado, "archivada");
  await igualQueImportar(env, db);
  const ll = await paso({ screen: "alcampo-alcala", items: [pieza("n1")], rev: v.body.rev });
  assert.deepEqual(ll.espejo.escritas.map(e => [e.entidad, e.accion]), [["playlist", "actualizar"], ["asignacion", "actualizar"]]);
  assert.equal((await A.leerAsignacion(db, "defecto-alcampo-alcala")).estado, "activa");
  const nueva = await igualQueImportar(env, db);
  assert.deepEqual(nueva.asignacion.map(x => x.id).sort(), ["defecto-alcampo-alcala", "defecto-alcampo-getafe", "defecto-virtual-xtanco", "viva-ofertas-madrid"]);

  // Nada se borró nunca, y el espejo no escribe en el KV (sólo las escrituras del propio legado).
  assert.equal((await A.auditoria(db, { accion: "borrar" })).length, 0);
  assert.ok(kv.escrituras.every(([op, k]) => op === "put" && (k.startsWith(DRAFT_PREFIX) || k === LIVE_KEY)), JSON.stringify(kv.escrituras));
  assert.deepEqual(errores, []);
});

// ── Bandera ─────────────────────────────────────────────────────────────────────────────────────────────────────
prueba("bandera apagada (por defecto): la respuesta es la misma, nada se escribe y, con la memoria caliente, ni se lee la D1", async () => {
  const sinD1 = { ACCESS: kvLegado(), STOCK_NOTIFY_KEY: CLAVE_STOCK };
  const { db, d, env } = await mundo({}, { espejo: false });
  assert.equal((await A.leerMeta(db)).banderas.espejo, undefined, "la migración no trae la bandera: falta = apagada");
  const ahora = Date.now(), real = Date.now;
  Date.now = () => ahora;
  try {
    const cuerpos = [{ screen: "alcampo-alcala", items: [pieza("m1")] }, { action: "live-save", playlist: OFERTAS }, { action: "circuit-save", circuit: MADRID },
      { action: "live-delete", id: "ofertas-madrid" }, { action: "circuit-delete", id: "madrid" }, { screen: "alcampo-alcala", items: [] }];
    for (const [i, cuerpo] of cuerpos.entries()) {
      const con = await guardar(env, cuerpo), sin = await guardar(sinD1, cuerpo);
      assert.deepEqual([con.status, con.texto, con.cabeceras], [sin.status, sin.texto, sin.cabeceras], "misma respuesta: " + JSON.stringify(cuerpo));
      assert.equal(con.espejo.estado, "apagado");
      assert.equal(sin.espejo, undefined, "sin binding no hay ni trabajo en waitUntil");
      // En frío, UNA lectura: la fila de meta. Después, la bandera sale de la memoria: ni una sentencia más.
      assert.deepEqual(d.sql, ["SELECT version, esquema, banderas, actualizado_en FROM meta WHERE id = 1"], "paso " + i);
    }
  } finally { Date.now = real; }
  assert.deepEqual([(await A.leerMeta(db)).version, (await todas(db, "playlist")).length, (await todas(db, "auditoria")).length], [0, 0, 0]);
  // La memoria caduca a los MEMORIA_MS: entonces vuelve a mirar la fila de meta (y sólo ésa).
  const luego = ahora + MEMORIA_MS + 1;
  Date.now = () => luego;
  try {
    await guardar(env, { screen: "alcampo-alcala", items: [pieza("m2")] });
    assert.equal(d.sql.length, 2);
    assert.ok(d.sql.every(s => /FROM meta/.test(s)));
  } finally { Date.now = real; }
});

prueba("encender y apagar la bandera: lo que se escribió con la memoria apagada lo reconcilia el importador; al apagar, deja de escribir", async () => {
  const { db, d, env } = await mundo({}, { espejo: false });
  await guardar(env, { screen: "alcampo-alcala", items: [pieza("m1")] });                 // memoria: apagada
  await A.fijarBanderas(db, { espejo: true }, { actor: "carlos" });
  const tarde = await guardar(env, { screen: "alcampo-getafe", items: [pieza("g1")] });
  assert.equal(tarde.espejo.estado, "apagado", "la instancia sigue con lo que recordaba (MEMORIA_MS)");
  olvidarBanderas();                                                                      // = pasan MEMORIA_MS
  const ya = await guardar(env, { screen: "alcampo-parla", items: [pieza("p1")] });
  assert.equal(ya.espejo.estado, "hecho");
  // El runbook: tras encender, simular e importar lo que faltaba; la simulación siguiente, 0 escrituras.
  const sim = await importar(env);
  assert.deepEqual([sim.body.espejo.bandera, sim.body.resumen.escrituras], [true, 4], "alcalá y getafe: playlist + asignación");
  await importar(env, "aplicar=1");
  await igualQueImportar(env, db);
  // Apagar: la memoria aún dice encendida, pero la lectura de los datos trae meta y no se escribe nada.
  await A.fijarBanderas(db, { espejo: false }, { actor: "carlos" });
  const antes = d.sql.length, apagado = await guardar(env, { screen: "alcampo-parla", items: [pieza("p2")] });
  assert.equal(apagado.espejo.estado, "apagado");
  assert.ok(d.sql.slice(antes).every(s => !escribe(s)), "sólo lecturas");
  assert.deepEqual((await A.leerPlaylist(db, "defecto-alcampo-parla")).items.map(i => i.stockId), ["p1"]);
  // Banderas en texto (como pueda guardarlas E6) también valen.
  await A.fijarBanderas(db, { espejo: "encendido" }, { actor: "carlos" });
  olvidarBanderas();
  assert.equal((await guardar(env, { screen: "alcampo-parla", items: [pieza("p3")] })).espejo.estado, "hecho");
});

// ── Fallos de la D1 ─────────────────────────────────────────────────────────────────────────────────────────────
prueba("si la D1 falla, la respuesta del legado no cambia, queda espejo_fallido y el importador lo reconcilia", async () => {
  let rota = true;
  const { db, env } = await mundo({}, { antes: async sqls => { if (rota && sqls.some(s => /^INSERT INTO playlist /.test(s))) throw new Error("D1_ERROR: simulado"); } });
  const sinD1 = { ACCESS: kvLegado(), STOCK_NOTIFY_KEY: CLAVE_STOCK };
  const ahora = Date.now(), real = Date.now;
  Date.now = () => ahora;
  let con, sin;
  try { con = await guardar(env, { screen: "alcampo-alcala", items: [pieza("m1")] }); sin = await guardar(sinD1, { screen: "alcampo-alcala", items: [pieza("m1")] }); }
  finally { Date.now = real; }
  assert.deepEqual([con.status, con.texto, con.cabeceras], [sin.status, sin.texto, sin.cabeceras]);
  assert.deepEqual([con.espejo.estado, con.espejo.error], ["fallido", "D1_ERROR: simulado"]);
  assert.ok(errores.some(e => String(e[0]).includes("espejo fallido")), "queda en el log");
  // La marca: en la auditoría, con quién guardó, sin subir la versión (no es una escritura del modelo).
  const [marca] = await A.auditoria(db, { accion: "espejo_fallido" });
  assert.deepEqual([marca.entidad, marca.entidad_id, marca.actor, marca.detalle.motivo, marca.detalle.ref, marca.detalle.por, marca.version],
    ["asignacion", "defecto-alcampo-alcala", ACTOR_ESPEJO + DUENO, "fallo_d1", "kv:default:alcampo-alcala", DUENO, 1]);
  assert.equal((await A.leerMeta(db)).version, 1);
  // Con la D1 sana y la bandera encendida, la respuesta tampoco cambia (el espejo escribe, pero después).
  rota = false;
  Date.now = () => ahora + 1000;
  try {
    const bien = await guardar(env, { screen: "alcampo-getafe", items: [pieza("g1")] }), igual = await guardar(sinD1, { screen: "alcampo-getafe", items: [pieza("g1")] });
    assert.deepEqual([bien.status, bien.texto, bien.cabeceras], [igual.status, igual.texto, igual.cabeceras]);
    assert.equal(bien.espejo.estado, "hecho");
  } finally { Date.now = real; }
  // La simulación del importador enseña la marca y la deriva; aplicar la arregla; la siguiente, 0 escrituras.
  const sim = await importar(env);
  assert.deepEqual([sim.body.espejo.fallidos, sim.body.espejo.motivos.fallido, sim.body.resumen.escrituras], [1, { fallo_d1: 1 }, 2]);
  assert.equal((await importar(env, "aplicar=1")).body.aplicadas.crear, 2);
  await igualQueImportar(env, db);
});

prueba("una D1 caída del todo o colgada no tumba nada: el espejo termina, lo dice el log y, si puede, la auditoría", async () => {
  // Caída: ni la bandera se puede leer. No hay marca posible; sólo el log.
  const caida = { prepare: () => { throw new Error("D1 caída"); }, batch: async () => { throw new Error("D1 caída"); } };
  const env = { ACCESS: kvLegado(), PROGRAMACION_DB: caida };
  const r = await guardar(env, { screen: "alcampo-alcala", items: [pieza("m1")] });
  assert.deepEqual([r.status, r.body.ok, r.espejo.estado], [200, true, "error"]);
  // Colgada al leer los datos (la bandera ya está en memoria): vence el plazo y queda tiempo_agotado.
  const { db, env: colgada } = await mundo({}, { antes: sqls => (sqls.some(s => /^SELECT \* FROM asignacion/.test(s)) ? new Promise(() => {}) : undefined) });
  const r2 = await espejar({ env: colgada }, { borrador: { pantalla: "alcampo-alcala", valor: { items: [pieza("m1")], updatedAt: 5 } }, actor: DUENO }, { plazoMs: 30 });
  assert.deepEqual([r2.estado, r2.error], ["fallido", "tiempo_agotado"]);
  assert.deepEqual(await marcas(db, "espejo_fallido"), [["asignacion", "defecto-alcampo-alcala", "tiempo_agotado"]]);
  assert.ok(errores.length >= 2);
});

// ── Conflictos ──────────────────────────────────────────────────────────────────────────────────────────────────
prueba("lo editado fuera (API de E4) no se pisa: espejo_omitido · editado_fuera, y la simulación del importador lo cuenta", async () => {
  const { db, env } = await mundo();
  await guardar(env, { screen: "alcampo-alcala", items: [pieza("m1")] });
  await guardar(env, { action: "live-save", playlist: OFERTAS });
  // La editora retoca por la API la playlist del borrador y la asignación de la viva.
  assert.equal((await parche(env, "playlists/defecto-alcampo-alcala", { rev: 1, nombre: "Retocada" })).status, 200);
  assert.equal((await parche(env, "asignaciones/viva-ofertas-madrid", { rev: 1, peso: 7 })).status, 200);
  const v0 = (await A.leerMeta(db)).version;
  // Llega otra versión del borrador: la playlist editada no se toca; la asignación (igual) tampoco.
  const r = await guardar(env, { screen: "alcampo-alcala", items: [pieza("m1"), pieza("m2")] });
  assert.deepEqual([r.espejo.estado, r.espejo.escritas, r.espejo.omitidas], ["hecho", [], [{ entidad: "playlist", id: "defecto-alcampo-alcala", motivo: "editado_fuera" }]]);
  assert.deepEqual([(await A.leerPlaylist(db, "defecto-alcampo-alcala")).nombre, (await A.leerPlaylist(db, "defecto-alcampo-alcala")).items.length], ["Retocada", 1]);
  // Se añade una viva: la editada se queda con su peso; la nueva se crea igual.
  const m = await guardar(env, { action: "live-save", playlist: MARCA });
  assert.deepEqual(m.espejo.omitidas, [{ entidad: "asignacion", id: "viva-ofertas-madrid", motivo: "editado_fuera" }]);
  assert.deepEqual(m.espejo.escritas.map(e => e.id), ["viva-marca", "viva-marca"]);
  assert.equal((await A.leerAsignacion(db, "viva-ofertas-madrid")).peso, 7);
  // Las marcas, con quién editó y quién guardó en el KV. No suben la versión (las dos escrituras de la viva nueva sí).
  const omitidas = await A.auditoria(db, { accion: "espejo_omitido" });
  assert.deepEqual(omitidas.map(e => [e.entidad_id, e.detalle.motivo, e.detalle.actualizado_por, e.detalle.por, e.detalle.origen]), [
    ["viva-ofertas-madrid", "editado_fuera", EDITORA, DUENO, "live-save"], ["defecto-alcampo-alcala", "editado_fuera", EDITORA, DUENO, "borrador"]]);
  assert.equal((await A.leerMeta(db)).version, v0 + 2);
  // La simulación del importador dice lo mismo (omitir · editado_fuera) y cuenta las marcas del espejo.
  const sim = await importar(env, "muestra=500");
  assert.deepEqual(sim.body.espejo, { bandera: true, dias: 7, fallidos: 0, omitidos: 2, editado_fuera: 2,
    motivos: { fallido: {}, omitido: { editado_fuera: 2 } }, ultima: sim.body.espejo.ultima });
  await igualQueImportar(env, db, { omitidas: [["asignacion", "viva-ofertas-madrid", "editado_fuera"], ["playlist", "defecto-alcampo-alcala", "editado_fuera"]],
    excepto: ["asignacion:viva-ofertas-madrid", "playlist:defecto-alcampo-alcala"] });
  // Lo que no salió del legado tampoco: una playlist puesta a mano con el id del borrador es id_ocupado.
  assert.equal((await alta(env, "playlists", { id: "defecto-alcampo-getafe", nombre: "A mano", items: [pieza("z9")] })).status, 201);
  const g = await guardar(env, { screen: "alcampo-getafe", items: [pieza("g1")] });
  assert.deepEqual(g.espejo.omitidas, [{ entidad: "playlist", id: "defecto-alcampo-getafe", motivo: "id_ocupado" }, { entidad: "asignacion", id: "defecto-alcampo-getafe", motivo: "playlist_omitida" }]);
  assert.equal((await A.leerPlaylist(db, "defecto-alcampo-getafe")).nombre, "A mano");
  assert.equal(await A.leerAsignacion(db, "defecto-alcampo-getafe"), null);
});

prueba("vaciar un borrador cuya asignación se editó fuera no la archiva; borrar un circuito editado fuera no lo apaga", async () => {
  const { db, env } = await mundo();
  await guardar(env, { screen: "alcampo-alcala", items: [pieza("m1")] });
  await guardar(env, { action: "circuit-save", circuit: MADRID });
  assert.equal((await parche(env, "asignaciones/defecto-alcampo-alcala", { rev: 1, nombre: "Retocada" })).status, 200);
  assert.equal((await parche(env, "circuitos/madrid", { rev: 1, nombre: "Madrid centro" })).status, 200);
  const v = await guardar(env, { screen: "alcampo-alcala", items: [] });
  assert.deepEqual([v.espejo.escritas, v.espejo.omitidas], [[], [{ entidad: "asignacion", id: "defecto-alcampo-alcala", motivo: "editado_fuera" }]]);
  assert.equal((await A.leerAsignacion(db, "defecto-alcampo-alcala")).estado, "activa");
  const c = await guardar(env, { action: "circuit-delete", id: "madrid" });
  assert.deepEqual([c.espejo.escritas, c.espejo.omitidas], [[], [{ entidad: "circuito", id: "madrid", motivo: "editado_fuera" }]]);
  assert.equal((await A.leerCircuito(db, "madrid")).activo, true);
});

prueba("lo que llega tarde no pisa lo más nuevo: dos espejos del mismo borrador, en cualquier orden, acaban en el último", async () => {
  const { db, env } = await mundo();
  const viejo = { screen: "alcampo-alcala", items: [pieza("v1")], updatedAt: 1000, rev: 1000 };
  const nuevo = { screen: "alcampo-alcala", items: [pieza("n1")], updatedAt: 2000, rev: 2000 };
  const espeja = valor => espejar({ env }, { borrador: { pantalla: "alcampo-alcala", valor }, actor: DUENO });
  assert.equal((await espeja(nuevo)).estado, "hecho");
  const tarde = await espeja(viejo);
  assert.deepEqual([tarde.escritas, tarde.omitidas], [[], [{ entidad: "playlist", id: "defecto-alcampo-alcala", motivo: "obsoleto" }]]);
  assert.deepEqual((await A.leerPlaylist(db, "defecto-alcampo-alcala")).items.map(i => i.stockId), ["n1"]);
  // A la vez (dos instancias): el 409 se reintenta releyendo, y gana el más nuevo sea cual sea el orden.
  for (const orden of [[viejo, nuevo], [nuevo, viejo]]) {
    const { db: db2, env: env2 } = await mundo();
    await Promise.all(orden.map(valor => espejar({ env: env2 }, { borrador: { pantalla: "alcampo-alcala", valor }, actor: DUENO })));
    assert.deepEqual((await A.leerPlaylist(db2, "defecto-alcampo-alcala")).items.map(i => i.stockId), ["n1"], JSON.stringify(orden.map(o => o.updatedAt)));
    assert.equal((await A.auditoria(db2, { accion: "espejo_fallido" })).length, 0);
  }
});

// ── Sintéticos, identidad y orden ───────────────────────────────────────────────────────────────────────────────
prueba("los borradores sintéticos nunca se reflejan, y lo que no es una playlist (identity-sync, GET) no toca la D1", async () => {
  const live = { rev: 1, updatedAt: 1, playlists: [{ id: "ofertas", name: "Ofertas", enabled: true, content: { all: [], any: ["oferta"], none: [], type: "visual", limit: 20, seconds: 10, matchOrientation: false }, target: { all: [], any: ["todas"] } }], circuits: [] };
  const { db, d, env } = await mundo({ [LIVE_KEY]: JSON.stringify(live) });
  const pendientes = [];
  const g = await (await onRequestGet({ request: new Request("https://admira.tv/api/playlist?screen=alcampo-alcala&w=1920&h=1080"), env, waitUntil: p => pendientes.push(p) })).json();
  await Promise.all(pendientes);
  assert.equal(g.draft.synthetic, true, "el GET compone un borrador sintético");
  const sintetico = await espejar({ env }, { borrador: { pantalla: "alcampo-alcala", valor: g.draft }, actor: DUENO });
  assert.equal(sintetico.estado, "sintetico");
  const id = await guardar(env, { action: "identity-sync", screens: [{ screen: "alcampo-alcala", project: "alcampo", xpace: "x-1", name: "Alcalá" }] });
  assert.deepEqual([id.status, id.pendientes.length], [200, 0]);
  assert.deepEqual(d.sql, [], "ni una sentencia en la D1");
  assert.equal((await todas(db, "playlist")).length, 0);
});

prueba("la respuesta sale antes de que termine el espejo (waitUntil): la D1 lenta no la retrasa", async () => {
  let abrir;
  const compuerta = new Promise(r => { abrir = r; });
  const { db, env } = await mundo({}, { antes: () => compuerta });
  const pendientes = [];
  const handler = onRequestPost({ request: new Request("https://admira.tv/api/playlist", { method: "POST", headers: { "Content-Type": "application/json", Cookie: "__Host-atv_session=" + T.dueno },
    body: JSON.stringify({ screen: "alcampo-alcala", items: [pieza("m1")] }) }), env, waitUntil: p => pendientes.push(p) });
  const r = await Promise.race([handler, new Promise(res => setTimeout(() => res("colgada"), 1000))]);
  assert.notEqual(r, "colgada", "el handler no espera a la D1");
  assert.equal(r.status, 200);
  assert.equal(pendientes.length, 1, "el espejo queda en waitUntil");
  let terminado = false;
  pendientes[0].then(() => { terminado = true; });
  await new Promise(res => setTimeout(res, 20));
  assert.equal(terminado, false, "la D1 sigue cerrada y la respuesta ya está");
  assert.equal(await A.leerPlaylist(db, "defecto-alcampo-alcala"), null);
  abrir();
  assert.equal((await pendientes[0]).estado, "hecho");
  assert.ok(await A.leerPlaylist(db, "defecto-alcampo-alcala"));
});

test("actor del espejo: email o servicio, siempre con el prefijo del importador", () => {
  assert.equal(actorEspejo(" Carlos@Admira.com "), "importador:espejo:carlos@admira.com");
  assert.equal(actorEspejo("pixeria-stock · catalogo alcampo-2026-10-09"), "importador:espejo:pixeria-stock");
  assert.equal(actorEspejo(""), "importador:espejo:desconocido");
  assert.ok(actorEspejo("x@y.z").startsWith("importador:"), "el importador lo toma por suyo (desviación 33)");
});
