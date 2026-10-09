// node --test functions/api/_programacion/ — modo sombra (E6 · modelo único de playlists): el gancho en el GET del
// player, la evaluación y el registro en la tabla `sombra`. D1 simulada (node:sqlite) con la migración real, KV y red
// simulados, y el reloj fijado para mover el tiempo a mano.
import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { d1Memoria } from "./_d1-memoria.mjs";
import * as A from "./almacen.js";
import { aMinutos, aUtc } from "./horario.js";
import { desdeBorrador } from "./legado.js";
import { DRAFT_PREFIX, forgetMemo, onRequestGet as playlistGet } from "../playlist.js";
import { olvidarMemoria } from "../programacion.js";
import { madridClock } from "../_emision.js";
import { BANDERA_MS, CADA_MS, olvidarSombra, sombraTrasRespuesta } from "./gancho-sombra.js";
import { LATIDO_MS, MAX_ESCRITURAS_HORA, guardarSombra, olvidarMemoriaSombra } from "./sombra.js";

const SQL = await readFile(new URL("../../../migrations/programacion/0001.sql", import.meta.url), "utf8");
const sinSqlite = !(await d1Memoria());
const prueba = (nombre, fn) => test(nombre, { skip: sinSqlite && "node:sqlite no disponible (Node ≥ 22.13)" }, fn);

const M = (fecha, hhmm) => aUtc(fecha, aMinutos(hhmm));
const T0 = M("2026-10-14", "10:00"), MIN = 60_000;
const SCREEN = "alcampo-alcala", PLAYER = `screen=${SCREEN}&w=1920&h=1080&lang=es`;
const item = s => ({ id: "stock-" + s, stockId: s, title: "Pieza " + s, sub: "", lane: "publicidad", seconds: 10,
  asset: `https://stock.admira.store/stock/${s}/asset.mp4`, assetType: "video", tags: [] });
const borradorKV = items => JSON.stringify({ screen: SCREEN, playlist: "default", name: "Por defecto", items, rev: 7, updatedAt: T0 - 86_400_000 });
const STOCK = ["s1", "s2", "s3", "s4", "s5", "s6"].map((id, i) => ({ id, type: "video", title: id, tags: [], url: `https://stock.admira.store/stock/${id}/asset.mp4`, createdAt: "2026-10-0" + (i + 1) }));

// ── Reloj, red, KV y D1 simulados ───────────────────────────────────────────────────────────────────────────────
const realNow = Date.now;
let reloj = T0, llamadas = [], bandas = [], parrillaLenta = 0;
beforeEach(() => {
  reloj = T0; llamadas = []; bandas = []; parrillaLenta = 0;
  Date.now = () => reloj;
  forgetMemo(); olvidarMemoria(); olvidarSombra(); olvidarMemoriaSombra();
  globalThis.__realFetch ??= globalThis.fetch;
  globalThis.fetch = async input => {
    const url = String((input && input.url) || input);
    llamadas.push(url);
    const ok = body => new Response(JSON.stringify(body), { status: body == null ? 404 : 200, headers: { "Content-Type": "application/json" } });
    if (url.includes("/grid/day")) {
      if (parrillaLenta) await new Promise(r => setTimeout(r, parrillaLenta));
      const d = new URL(url).searchParams.get("date"), fecha = d ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : madridClock(Date.now()).date;
      return ok({ ok: true, screen: SCREEN, date: fecha, config: { circuit: "alcampo", slotSeconds: 10 }, bands: fecha === madridClock(Date.now()).date ? bandas : [] });
    }
    if (url.includes("/stock/index.json") || url.includes("/stock/list")) return ok({ items: STOCK });
    if (url.includes("/grid/config")) return ok({ ok: true, config: { circuit: "alcampo" } });
    if (url.includes("/grid/projects")) return ok({ ok: true, projects: [] });
    return ok(null);
  };
});
afterEach(() => { Date.now = realNow; globalThis.fetch = globalThis.__realFetch; olvidarSombra(); });

function kv(entradas = {}) {
  const store = new Map(Object.entries(entradas)), escrituras = [];
  return { store, escrituras, get: async k => (store.has(k) ? store.get(k) : null), getWithMetadata: async k => ({ value: store.get(k) ?? null, metadata: null }),
    list: async () => ({ keys: [], list_complete: true }), put: async (k, v) => { escrituras.push(k); store.set(k, v); }, delete: async k => { escrituras.push(k); store.delete(k); } };
}
/** La D1 que ve el código, apuntando cada sentencia (y si escribe). */
function espia(db) {
  const sql = [];
  const envolver = st => ({ ...st, bind: (...a) => envolver(st.bind(...a)),
    first: (...a) => { sql.push(st.sql); return st.first(...a); }, all: () => { sql.push(st.sql); return st.all(); }, run: () => { sql.push(st.sql); return st.run(); } });
  return { sql, prepare: s => envolver(db.prepare(s)), batch: lista => { sql.push(...lista.map(s => s.sql)); return db.batch(lista); } };
}
const escribe = s => !/^\s*select\b/i.test(s);
const filasSombra = async db => (await db.prepare("SELECT * FROM sombra ORDER BY pantalla").all()).results.map(f => ({ ...f, detalle: JSON.parse(f.detalle) }));

async function mundo({ sombra = true, importar = true, items = [item("s1"), item("s2"), item("s3")] } = {}) {
  const db = await d1Memoria(SQL), d = espia(db), store = kv({ [DRAFT_PREFIX + SCREEN]: borradorKV(items) });
  if (importar) {
    const r = desdeBorrador({ screen: SCREEN, name: "Por defecto", items });
    await A.guardarPlaylist(db, r.playlist, { actor: "importador:csilvasantin@gmail.com", ahora: T0 - 3600e3 });
    await A.guardarAsignacion(db, r.asignacion, { actor: "importador:csilvasantin@gmail.com", ahora: T0 - 3600e3 });
  }
  if (sombra) await A.fijarBanderas(db, { sombra: true }, { actor: "csilvasantin@gmail.com", ahora: T0 - 3600e3 });
  return { db, d, store, env: { ACCESS: store, PROGRAMACION_DB: d } };
}
/** Una petición del player. Devuelve la respuesta, lo que la D1 vio ANTES de responder y las tareas encargadas. */
async function pide(env, qs = PLAYER, { waitUntil } = {}) {
  const tareas = [], antes = env.PROGRAMACION_DB && env.PROGRAMACION_DB.sql ? env.PROGRAMACION_DB.sql.length : 0;
  const r = await playlistGet({ request: new Request("https://admira.tv/api/playlist?" + qs), env, waitUntil: waitUntil || (p => { tareas.push(p); }) });
  const enRespuesta = env.PROGRAMACION_DB && env.PROGRAMACION_DB.sql ? env.PROGRAMACION_DB.sql.slice(antes) : [];
  return { status: r.status, body: await r.json(), enRespuesta, tareas };
}
/** Espera a todo lo encargado (también lo que se encarga mientras tanto) y devuelve lo que acabó el modo sombra. */
async function drena(tareas) {
  let n = -1;
  while (n !== tareas.length) { n = tareas.length; await Promise.all(tareas); }
  return (await Promise.all(tareas)).filter(x => x && typeof x === "object" && "hecho" in x);
}

// ── El gancho ───────────────────────────────────────────────────────────────────────────────────────────────────
prueba("bandera apagada: la respuesta no cambia, nada se escribe y la bandera se lee como mucho una vez por minuto", async () => {
  const { d, db, env } = await mundo({ sombra: false });
  const sin = await pide({ ...env, PROGRAMACION_DB: undefined });
  const uno = await pide(env);
  assert.deepEqual(uno.body, sin.body, "la misma respuesta que sin el gancho");
  assert.deepEqual(uno.enRespuesta, [], "nada de D1 antes de responder");
  assert.deepEqual(await drena(uno.tareas), [{ hecho: "apagada" }]);
  assert.deepEqual(d.sql, ["SELECT version, esquema, banderas, actualizado_en FROM meta WHERE id = 1"], "sólo la bandera");
  // Sabida apagada, el gancho ni siquiera encarga trabajo durante un minuto.
  reloj += 30_000;
  const dos = await pide(env);
  assert.deepEqual(await drena(dos.tareas), []);
  assert.equal(d.sql.length, 1);
  reloj += BANDERA_MS;
  assert.deepEqual(await drena((await pide(env)).tareas), [{ hecho: "apagada" }]);
  assert.equal(d.sql.filter(escribe).length, 0);
  assert.deepEqual(await filasSombra(db), []);
});

prueba("bandera encendida: evalúa DESPUÉS de responder, sin tocar la respuesta, y registra la primera vez (igual)", async () => {
  const { d, db, env } = await mundo();
  const sin = await pide({ ...env, PROGRAMACION_DB: undefined });
  llamadas = [];
  const r = await pide(env);
  assert.deepEqual(r.body, sin.body);
  assert.deepEqual(r.enRespuesta, [], "el GET del player no espera a la D1");
  assert.equal(llamadas.some(u => u.includes("/grid/day")), false, "ni a la parrilla");
  const [hecho] = await drena(r.tareas);
  assert.deepEqual(hecho, { hecho: "primera", veredicto: "igual", motivo: "misma_lista" });
  const [fila] = await filasSombra(db);
  assert.deepEqual([fila.pantalla, fila.en, fila.coincide, fila.capa, fila.firma_legado === fila.firma_nueva], [SCREEN, T0, 1, "por_defecto", true]);
  assert.deepEqual([fila.detalle.veredicto, fila.detalle.primera, fila.detalle.ultima, fila.detalle.cambios, fila.detalle.anterior], ["igual", T0, T0, 0, null]);
  assert.equal(fila.version, (await A.leerMeta(db)).version);
  assert.deepEqual(fila.detalle.legado.claves, ["s1", "s2", "s3"]);
  assert.equal(d.sql.filter(escribe).length, 2, "primera vez: borrar + insertar");
  assert.doesNotMatch(JSON.stringify(fila), /@/, "sin emails");
});

prueba("una evaluación por pantalla cada 10 min en cada instancia; sin cambios no escribe; la última comprobación, una vez por hora", async () => {
  const { d, db, env } = await mundo();
  assert.deepEqual((await drena((await pide(env)).tareas)).map(x => x.hecho), ["primera"]);
  const escrituras = () => d.sql.filter(escribe).length, base = escrituras();
  reloj += MIN;
  assert.deepEqual(await drena((await pide(env)).tareas), [], "antes de 10 min, ni se encarga");
  reloj = T0 + CADA_MS + MIN;
  assert.deepEqual((await drena((await pide(env)).tareas)).map(x => x.hecho), ["nada"]);
  assert.equal(escrituras(), base, "sin cambios no escribe");
  reloj = T0 + LATIDO_MS + MIN;
  assert.deepEqual((await drena((await pide(env)).tareas)).map(x => x.hecho), ["latido"]);
  assert.equal(escrituras(), base + 1, "una sola sentencia: la última comprobación");
  const [fila] = await filasSombra(db);
  assert.deepEqual([fila.en, fila.detalle.primera, fila.detalle.ultima, fila.detalle.cambios], [T0, T0, T0 + LATIDO_MS + MIN, 0]);
  // Dos peticiones a la vez de la misma pantalla: una sola evaluación.
  reloj += CADA_MS + MIN;
  const [a, b] = await Promise.all([pide(env), pide(env)]);
  assert.equal((await drena([...a.tareas, ...b.tareas])).filter(x => x.hecho !== "reciente").length, 1);
});

prueba("sólo se reescribe la fila si cambia el veredicto o una firma: una por pantalla, con lo anterior resumido", async () => {
  const { d, db, env, store } = await mundo();
  await drena((await pide(env)).tareas);
  // El KV cambia y la D1 no (sin importar otra vez): ahora difieren.
  store.store.set(DRAFT_PREFIX + SCREEN, borradorKV([item("s1"), item("s4")]));
  reloj = T0 + CADA_MS + MIN;
  const antes = d.sql.filter(escribe).length;
  const [hecho] = await drena((await pide(env)).tareas);
  assert.deepEqual(hecho, { hecho: "cambio", veredicto: "distinta", motivo: "piezas_distintas" });
  assert.equal(d.sql.filter(escribe).length, antes + 2);
  const filas = await filasSombra(db);
  assert.equal(filas.length, 1, "una sola fila por pantalla");
  const [f] = filas;
  assert.deepEqual([f.en, f.coincide, f.detalle.primera, f.detalle.cambios], [reloj, 0, T0, 1]);
  assert.deepEqual([f.detalle.anterior.veredicto, f.detalle.anterior.desde, f.detalle.anterior.hasta], ["igual", T0, reloj]);
  assert.deepEqual(f.detalle.diferencia.base, { soloLegado: ["s4"], soloNuevo: ["s2", "s3"] });
});

prueba("nunca rompe la respuesta: D1 que falla, evaluación que lanza, waitUntil que lanza y evaluación que no acaba", async () => {
  const { env } = await mundo();
  const sin = await pide({ ...env, PROGRAMACION_DB: undefined });
  const errores = [], error = console.error;
  console.error = (...a) => errores.push(a.map(String).join(" "));
  try {
    // La D1 entera falla: la bandera no se puede leer y se da por apagada.
    const rota = { prepare: () => { throw new Error("D1 caída"); }, batch: async () => { throw new Error("D1 caída"); } };
    const a = await pide({ ...env, PROGRAMACION_DB: rota });
    assert.deepEqual([a.status, a.body], [200, sin.body]);
    assert.deepEqual(await drena(a.tareas), [{ hecho: "apagada" }]);
    // La bandera se lee, pero la lectura de candidatas falla: la evaluación lanza y sólo queda en el log.
    olvidarSombra();
    const db2 = (await mundo()).db;
    const mitad = { prepare: s => db2.prepare(s), batch: async lista => { if (lista.some(s => /asignacion_destino/.test(s.sql))) throw new Error("D1 lenta"); return db2.batch(lista); } };
    const b = await pide({ ...env, PROGRAMACION_DB: mitad });
    assert.deepEqual([b.status, b.body], [200, sin.body]);
    assert.deepEqual(await drena(b.tareas), [{ hecho: "fallo" }]);
    assert.ok(errores.some(e => /sombra/.test(e) && /D1 lenta/.test(e)));
    // Un waitUntil que lanza no llega al player.
    olvidarSombra();
    const c = await pide(env, PLAYER, { waitUntil: () => { throw new Error("contexto cerrado"); } });
    assert.deepEqual([c.status, c.body], [200, sin.body]);
    // Una evaluación que no acaba se corta en el plazo.
    olvidarSombra({ plazoMs: 40 }); olvidarMemoria(); parrillaLenta = 300;
    const t0 = realNow();
    const e = await pide(env);
    assert.ok(realNow() - t0 < 250, "la respuesta no espera a la parrilla lenta");
    assert.deepEqual(await drena(e.tareas), [{ hecho: "fallo" }]);
    assert.ok(errores.some(x => /sombra_plazo/.test(x)));
    // Lo abandonado sigue por detrás hasta acabar: se le deja terminar con la red simulada (y no con la de verdad).
    await new Promise(r => setTimeout(r, parrillaLenta + 300));
  } finally { console.error = error; }
});

prueba("sólo el player: sin w/h/lang ni player=1 no se encarga nada; sin waitUntil, sin D1 o sin respuesta buena, tampoco", async () => {
  const { d, env } = await mundo();
  const r = await pide(env, `screen=${SCREEN}`);
  assert.deepEqual(await drena(r.tareas), []);
  assert.deepEqual(d.sql, []);
  assert.deepEqual((await drena((await pide(env, `screen=${SCREEN}&player=1`)).tareas)).map(x => x.hecho), ["primera"], "player=1 sí");
  const q = new URLSearchParams(PLAYER), respuesta = { ok: true, draft: { items: [] }, screenTags: [], auto: [] }, nada = () => {};
  assert.equal(sombraTrasRespuesta({ env, screen: "otra-pantalla", q, respuesta }), false, "sin waitUntil");
  assert.equal(sombraTrasRespuesta({ env: { ...env, PROGRAMACION_DB: undefined }, waitUntil: nada, screen: "otra-pantalla", q, respuesta }), false, "sin D1 (como la consulta en proceso de /api/emision)");
  assert.equal(sombraTrasRespuesta({ env, waitUntil: nada, screen: "otra-pantalla", q, respuesta: { ok: false } }), false);
  assert.equal(sombraTrasRespuesta(), false);
});

// ── El registro ─────────────────────────────────────────────────────────────────────────────────────────────────
const resultado = (veredicto, firmaNueva = "por_defecto·3p·aaaaaaaa", motivo = veredicto === "igual" ? "misma_lista" : "piezas_distintas") => ({
  veredicto, motivo, coincide: { distinta: 0, igual: 1, equivalente: 2 }[veredicto], capa: "por_defecto",
  firmaLegado: "por_defecto·3p·aaaaaaaa", firmaNueva, detalle: { veredicto, motivo, legado: { capa: "por_defecto" }, nuevo: { capa: "por_defecto" } } });

prueba("registro: primera, nada, latido a la hora, cambio con el anterior y una sola fila por pantalla", async () => {
  const db = await d1Memoria(SQL), d = espia(db);
  assert.deepEqual(await guardarSombra(d, "p1", resultado("igual"), { ahora: T0, version: 3 }), { accion: "primera" });
  assert.deepEqual(await guardarSombra(d, "p1", resultado("igual"), { ahora: T0 + 30 * MIN }), { accion: "nada" });
  assert.deepEqual(await guardarSombra(d, "p1", resultado("igual"), { ahora: T0 + LATIDO_MS }), { accion: "latido" });
  assert.deepEqual(await guardarSombra(d, "p1", resultado("distinta", "por_defecto·2p·bbbbbbbb"), { ahora: T0 + 2 * LATIDO_MS, version: 4 }), { accion: "cambio" });
  assert.deepEqual(await guardarSombra(d, "p1", resultado("distinta", "por_defecto·2p·bbbbbbbb", "orden_distinto"), { ahora: T0 + 3 * LATIDO_MS }), { accion: "cambio" }, "otro motivo también es un cambio");
  assert.deepEqual(await guardarSombra(d, "p2", resultado("equivalente"), { ahora: T0 }), { accion: "primera" });
  const filas = await filasSombra(db);
  assert.deepEqual(filas.map(f => [f.pantalla, f.coincide]), [["p1", 0], ["p2", 2]]);
  const p1 = filas[0];
  assert.deepEqual([p1.en, p1.version, p1.detalle.primera, p1.detalle.cambios, p1.detalle.anterior.motivo, p1.detalle.anterior.desde], [T0 + 3 * LATIDO_MS, 0, T0, 2, "piezas_distintas", T0 + 2 * LATIDO_MS]);
  // Escrituras: 2 (primera) + 0 + 1 (latido) + 2 + 2 + 2 (p2).
  assert.equal(d.sql.filter(escribe).length, 9);
});

prueba("fusible: como mucho MAX_ESCRITURAS_HORA sentencias de escritura por hora en cada instancia", async () => {
  const db = await d1Memoria(SQL);
  const acciones = [];
  for (let i = 0; i <= MAX_ESCRITURAS_HORA / 2; i += 1) acciones.push((await guardarSombra(db, "p" + i, resultado("igual"), { ahora: T0 })).accion);
  assert.deepEqual(acciones.slice(-2), ["primera", "sin_presupuesto"]);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM sombra").first()).n, MAX_ESCRITURAS_HORA / 2);
  assert.deepEqual(await guardarSombra(db, "otra", resultado("igual"), { ahora: T0 + LATIDO_MS }), { accion: "primera" }, "la hora siguiente, otra vez");
});
