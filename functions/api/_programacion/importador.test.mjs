// node --test 'functions/api/_programacion/*.test.mjs' — importador del legado (E5 · modelo único de playlists).
// El plan puro (importador.js) y POST /api/programacion/importar (importar.js) sobre la D1 simulada con la migración
// real y un KV simulado con list/get: plan de una mezcla realista, simulación sin escrituras, aplicar y que la segunda
// pasada salga toda igual, actualizaciones con la rev buena, huérfanos que no se borran, tramos con cursor y tope de
// escrituras, acceso y, tras aplicar, que GET /api/programacion sirve lo mismo que hoy.
import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { d1Memoria } from "./_d1-memoria.mjs";
import * as A from "./almacen.js";
import { circuitoDesdeLegado, desdeBorrador, desdeLegado, desdeViva, idDefecto, idViva, refDefecto, slugEntero } from "./legado.js";
import { sha256Hex } from "./huella.js";
import { slugId } from "./modelo.js";
import { createHash } from "node:crypto";
import { planificar, traducir } from "./importador.js";
import { MAX_ESCRITURAS } from "./importar.js";
import { resolver } from "./resolver.js";
import { onRequest } from "../programacion/[recurso]/[[resto]].js";
import { onRequestGet as programacionGet, olvidarMemoria } from "../programacion.js";
import { DRAFT_PREFIX, forgetMemo } from "../playlist.js";
import { LIVE_KEY, applyCircuits, cleanCircuit, cleanLive, deduceScreenTags, resolveForScreen, targetMatches } from "../_playlist-live.js";

const SQL = await readFile(new URL("../../../migrations/programacion/0001.sql", import.meta.url), "utf8");
const sinSqlite = !(await d1Memoria());
const prueba = (nombre, fn) => test(nombre, { skip: sinSqlite && "node:sqlite no disponible (Node ≥ 22.13)" }, fn);

// ── Sesiones, KV, D1 y red simulados ────────────────────────────────────────────────────────────────────────────
const DUENO = "csilvasantin@gmail.com", EDITORA = "editora@admira.com";
const T = { dueno: "tok-dueno", editora: "tok-editora", sinPermiso: "tok-sin-permiso", visor: "tok-visor" };
const CLAVE = "clave-de-prueba-que-no-es-real-0123456789";   // valor ficticio: sólo vive en el env de estas pruebas
const usuarios = { v: 3, projects: [{ id: "admira-tv" }, { id: "digitalsignage-player", parent: "admira-tv" }],
  users: [{ email: EDITORA, status: "active", roles: { "digitalsignage-player": "editor" } }, { email: "nadie@admira.com", status: "active", roles: { "otra-cosa": "viewer" } }] };
const sesiones = () => {
  const exp = Date.now() + 3600e3, s = (tok, rec) => ["admira-tv:auth:session:" + tok, JSON.stringify({ ...rec, expiresAt: exp })];
  return Object.fromEntries([s(T.dueno, { email: DUENO }), s(T.editora, { email: EDITORA }), s(T.sinPermiso, { email: "nadie@admira.com" }),
    s(T.visor, { email: "lectura@merovingio.box", lectura: true, sid: "a".repeat(64) }), ["admira-tv:users:v3", JSON.stringify(usuarios)]]);
};
/** KV con list (paginado por cursor, como el de Cloudflare) y get; toda escritura queda apuntada. */
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
/** La D1 que ve la ruta: la misma base, apuntando cada sentencia que se ejecuta. */
function espia(db) {
  const sql = [];
  const envolver = st => ({ ...st, bind: (...a) => envolver(st.bind(...a)),
    first: (...a) => { sql.push(st.sql); return st.first(...a); }, all: () => { sql.push(st.sql); return st.all(); }, run: () => { sql.push(st.sql); return st.run(); } });
  return { sql, prepare: s => envolver(db.prepare(s)), batch: lista => { sql.push(...lista.map(s => s.sql)); return db.batch(lista); } };
}
async function mundo(entradas = {}, extra = {}) {
  const db = await d1Memoria(SQL), d = espia(db), kv = kvLegado(entradas);
  return { db, d, kv, env: { ACCESS: kv, PROGRAMACION_DB: d, ...extra } };
}
async function importar(env, query = "", { token = T.dueno, cabeceras = {}, metodo = "POST" } = {}) {
  const headers = { ...cabeceras };
  if (token) headers.Cookie = "__Host-atv_session=" + token;
  const r = await onRequest({ request: new Request("https://admira.tv/api/programacion/importar" + (query ? "?" + query : ""), { method: metodo, headers }), env });
  const texto = await r.text();
  return { status: r.status, body: texto ? JSON.parse(texto) : null, headers: r.headers };
}
/** Una pasada entera, tramo a tramo, siguiendo `siguiente` hasta `completo`. */
async function pasada(env, query = "") {
  const tramos = [];
  let cursor = null;
  do {
    const r = await importar(env, [query, cursor ? "cursor=" + encodeURIComponent(cursor) : ""].filter(Boolean).join("&"));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    tramos.push(r.body);
    cursor = r.body.siguiente;
    assert.ok(tramos.length < 20, "la pasada termina");
  } while (cursor);
  return tramos;
}
const cuenta = async (db, tabla) => (await db.prepare(`SELECT COUNT(*) AS n FROM ${tabla}`).first()).n;
const version = async db => (await A.leerMeta(db)).version;
const operacion = (r, entidad, id) => (r.muestra || r.operaciones).find(o => o.entidad === entidad && o.id === id);

const STOCK = [
  { id: "o1", type: "video", url: "https://stock.admira.store/stock/o1/a.mp4", title: "Oferta 1", tags: ["oferta"], createdAt: 2 },
  { id: "o2", type: "image", url: "https://stock.admira.store/stock/o2/a.jpg", title: "Oferta 2", tags: ["ofertas"], createdAt: 3 },
  { id: "k1", type: "image", url: "https://stock.admira.store/stock/k1/a.jpg", title: "Marca", tags: ["marca"], createdAt: 4 },
];
let calls;
beforeEach(() => {
  forgetMemo();
  olvidarMemoria();
  calls = [];
  globalThis.__realFetch ??= globalThis.fetch;
  globalThis.fetch = async input => {
    const url = String((input && input.url) || input);
    calls.push(url);
    const ok = body => new Response(JSON.stringify(body), { status: body == null ? 404 : 200, headers: { "Content-Type": "application/json" } });
    if (url.includes("/grid/day")) return ok({ ok: true, date: new URL(url).searchParams.get("date") || undefined, bands: [] });
    if (url.includes("/stock/index.json")) return ok({ items: STOCK });
    if (url.includes("/grid/config")) return ok({ ok: true, config: { circuit: "alcampo" } });
    if (url.includes("/grid/projects")) return ok({ ok: true, projects: [{ id: "alcampo", name: "Canal Alcampo", circuits: ["alcampo"] }] });
    return ok(null);
  };
});
afterEach(() => { globalThis.fetch = globalThis.__realFetch; });

// ── El legado: una mezcla realista ──────────────────────────────────────────────────────────────────────────────
const item = s => ({ id: "stock-" + s, stockId: s, title: "Pieza " + s, sub: "", lane: "publicidad", seconds: 10,
  asset: `https://stock.admira.store/stock/${s}/asset.mp4`, assetType: "video", tags: [] });
const borrador = (screen, piezas, extra = {}) => JSON.stringify({ screen, playlist: "default", name: "Por defecto", items: piezas.map(item),
  rev: 1759900000001, updatedAt: 1759900000000, updatedBy: DUENO, ...extra });
const CIRCUITO = cleanCircuit({ name: "Madrid", target: { all: ["pantalla:alcampo-alcala", "pantalla:alcampo-getafe"] } }, DUENO, 1000);
const VIVAS = [
  cleanLive({ name: "Ofertas Madrid", content: { any: ["oferta"], limit: 10, seconds: 12 }, target: { all: ["circuito:madrid"] } }, DUENO, 2000),
  cleanLive({ name: "Marca", content: { any: ["marca"] }, target: { any: ["todas"] }, enabled: false }, DUENO, 3000),
];
const LIVE = { rev: 5, updatedAt: 3000, updatedBy: DUENO, playlists: VIVAS, circuits: [CIRCUITO] };
// alcalá: guardado a mano · parla: sintético (no es dato guardado) · móstoles: vacío · leganés: guardado (luego se borra).
// getafe no tiene borrador: le llegan las vivas por el circuito definido.
const legadoMixto = (cambios = {}) => ({
  [LIVE_KEY]: JSON.stringify(LIVE),
  [DRAFT_PREFIX + "alcampo-alcala"]: borrador("alcampo-alcala", ["m1", "m2"]),
  [DRAFT_PREFIX + "alcampo-parla"]: borrador("alcampo-parla", ["x1"], { synthetic: true }),
  [DRAFT_PREFIX + "alcampo-mostoles"]: borrador("alcampo-mostoles", []),
  [DRAFT_PREFIX + "alcampo-leganes"]: borrador("alcampo-leganes", ["l1"]),
  ...cambios,
});
const borradoresDe = entradas => Object.entries(entradas).filter(([k]) => k.startsWith(DRAFT_PREFIX)).map(([clave, valor]) => ({ clave, pantalla: clave.slice(DRAFT_PREFIX.length), valor }));

// ── Plan puro ───────────────────────────────────────────────────────────────────────────────────────────────────
test("plan de una mezcla realista: borrador con piezas, sintético, vacío, vivas con destino y circuito", () => {
  const entradas = legadoMixto();
  const plan = planificar({ live: entradas[LIVE_KEY], borradores: borradoresDe(entradas), pantallas: borradoresDe(entradas).map(b => b.pantalla), d1: {} });
  assert.deepEqual(plan.operaciones.map(o => [o.entidad, o.id, o.accion]), [
    ["circuito", "madrid", "crear"],
    ["playlist", "viva-ofertas-madrid", "crear"], ["asignacion", "viva-ofertas-madrid", "crear"],
    ["playlist", "viva-marca", "crear"], ["asignacion", "viva-marca", "crear"],
    ["playlist", "defecto-alcampo-alcala", "crear"], ["asignacion", "defecto-alcampo-alcala", "crear"],
    ["playlist", "defecto-alcampo-leganes", "crear"], ["asignacion", "defecto-alcampo-leganes", "crear"],
  ], "circuitos primero; cada playlist antes que su asignación");
  assert.ok(plan.operaciones.every(o => o.motivo === "nueva" && o.datos));
  assert.deepEqual(plan.omitidas.map(o => [o.ref, o.motivo]).sort(), [["kv:default:alcampo-mostoles", "borrador_vacio"], ["kv:default:alcampo-parla", "sintetico"]]);
  assert.deepEqual(plan.huerfanos, []);
  assert.equal(plan.vivas, "leidas");
  assert.deepEqual(plan.resumen, { escrituras: 9, omitidas: 2, huerfanos: 0, circuito: { crear: 1, actualizar: 0, archivar: 0, igual: 0, omitir: 0 },
    playlist: { crear: 4, actualizar: 0, archivar: 0, igual: 0, omitir: 0 }, asignacion: { crear: 4, actualizar: 0, archivar: 0, igual: 0, omitir: 0 } });
  // La traducción es la de legado.js: directa · sustituye para el borrador; fusiona con peso N, N-1… para las vivas.
  const a = id => operacion(plan, "asignacion", id).datos;
  assert.deepEqual([a("defecto-alcampo-alcala").ref_externa, a("defecto-alcampo-alcala").directa, a("defecto-alcampo-alcala").mezcla, a("defecto-alcampo-alcala").destino],
    ["kv:default:alcampo-alcala", true, "sustituye", { all: ["pantalla:alcampo-alcala"], any: [] }]);
  assert.deepEqual([a("viva-ofertas-madrid").ref_externa, a("viva-ofertas-madrid").mezcla, a("viva-ofertas-madrid").peso, a("viva-ofertas-madrid").estado], ["kv:viva:ofertas-madrid", "fusiona", 2, "activa"]);
  assert.deepEqual([a("viva-marca").peso, a("viva-marca").estado], [1, "pausada"], "una viva apagada se importa pausada");
  assert.deepEqual(operacion(plan, "circuito", "madrid").datos, { id: "madrid", nombre: "Madrid", destino: { all: ["pantalla:alcampo-alcala", "pantalla:alcampo-getafe"], any: [] }, activo: true });
  // Sin el documento de vivas en el tramo, sólo los borradores; un documento ilegible no se toma por vacío.
  assert.equal(planificar({ borradores: borradoresDe(entradas) }).vivas, "fuera_del_tramo");
  assert.equal(planificar({ live: "{roto" }).vivas, "ilegible");
  assert.equal(planificar({ live: null }).vivas, "sin_documento");
});

test("circuitos: el destino largo de /parrilla/ pasa entero (una faceta a `any`); si no cabe, se omite en vez de recortarlo", () => {
  const pantallas = Array.from({ length: 60 }, (_, i) => "pantalla:alcampo-" + String(i).padStart(2, "0"));
  const largo = cleanCircuit({ name: "Toda la red", target: { all: [...pantallas, "orientacion:vertical"] } }, DUENO, 1);
  const traducido = circuitoDesdeLegado(largo);
  assert.deepEqual([traducido.destino.all, traducido.destino.any.length], [["orientacion:vertical"], 60]);
  // Mismo significado: las mismas pantallas casan con la definición de hoy y con la traducida.
  for (const tags of [["pantalla:alcampo-07", "orientacion:vertical"], ["pantalla:alcampo-07", "orientacion:horizontal"], ["pantalla:otra", "orientacion:vertical"], ["pantalla:alcampo-59", "orientacion:vertical", "todas"]]) {
    assert.equal(targetMatches(traducido.destino, tags), targetMatches(largo.target, tags), tags.join(" "));
  }
  const xpacios = Array.from({ length: 60 }, (_, i) => "xpacio:x-" + i);
  const imposible = cleanCircuit({ name: "Imposible", target: { all: [...pantallas, ...xpacios] } }, DUENO, 1);
  const plan = planificar({ live: { playlists: [], circuits: [largo, imposible] }, d1: {} });
  assert.deepEqual(plan.operaciones.map(o => [o.id, o.accion]), [["toda-la-red", "crear"]]);
  assert.deepEqual(plan.omitidas, [{ ref: "kv:circuito:imposible", motivo: "destino_excede_limite", error: "120 etiquetas" }]);
});

test("no pisa lo ajeno: un id ocupado por algo que no salió del legado se omite, y su asignación con él", () => {
  const entradas = legadoMixto();
  const ajena = { id: "defecto-alcampo-alcala", nombre: "Hecha a mano", proyecto: "", tipo: "fija", items: [{ ...item("z9"), tipo: "pieza" }], reglas: [],
    opciones: { exacta: false, segundos: 10 }, duracion_s: 10, origen: "manual", rev: 4, creado_por: EDITORA, actualizado_por: EDITORA };
  const plan = planificar({ borradores: borradoresDe(entradas), d1: { playlists: [ajena] } });
  assert.deepEqual([operacion(plan, "playlist", "defecto-alcampo-alcala").accion, operacion(plan, "playlist", "defecto-alcampo-alcala").motivo,
    operacion(plan, "playlist", "defecto-alcampo-alcala").actualizado_por], ["omitir", "id_ocupado", EDITORA]);
  const asg = operacion(plan, "asignacion", "defecto-alcampo-alcala");
  assert.deepEqual([asg.accion, asg.motivo, "datos" in asg], ["omitir", "playlist_omitida", false]);
  // Dos claves que dan la misma pantalla (doble guion) no se importan dos veces.
  const dobles = traducir({ borradores: [{ pantalla: "alcampo-alcala", valor: borrador("x", ["a"]) }, { pantalla: "alcampo--alcala", valor: borrador("x", ["b"]) }] });
  assert.deepEqual([dobles.unidades.length, dobles.omitidas.map(o => o.motivo)], [1, ["ref_duplicada"]]);
  // Un borrador ilegible o sin piezas válidas se omite con el motivo; los demás siguen.
  // Archivar: nunca por `sintetico` (hoy playlist.js emitiría ese borrador), y nunca lo ajeno.
  const filaAs = (id, ref, extra = {}) => ({ id, playlist_id: id, destino: { all: ["pantalla:" + id], any: [] }, ref_externa: ref, estado: "activa", rev: 1,
    creado_por: "importador:x", actualizado_por: "importador:x", ...extra });
  const conArchivo = planificar({ archivar: true, borradores: [{ pantalla: "a-1", valor: borrador("a-1", ["x"], { synthetic: true }) }, { pantalla: "a-2", valor: borrador("a-2", []) }],
    d1: { asignaciones: [filaAs("defecto-a-1", "kv:default:a-1"), filaAs("defecto-a-2", "kv:default:a-2"), filaAs("otra", "kv:default:a-3", { creado_por: EDITORA })] }, pantallas: ["a-1", "a-2"] });
  assert.deepEqual(conArchivo.operaciones.map(o => [o.id, o.accion, o.motivo]), [["defecto-a-2", "archivar", "borrador_vacio"], ["otra", "omitir", "ajena"]]);
  assert.deepEqual(conArchivo.huerfanos.map(h => [h.id, h.motivo]), [["defecto-a-1", "sintetico"], ["defecto-a-2", "borrador_vacio"], ["otra", "sin_clave_kv"]]);
  assert.deepEqual(operacion(conArchivo, "asignacion", "defecto-a-2").datos.estado, "archivada");
  const raros = traducir({ borradores: [{ pantalla: "a-1", valor: "{roto" }, { pantalla: "a-2", valor: JSON.stringify({ items: [{ asset: "http://inseguro" }] }) }, { pantalla: "a-3", valor: null }] });
  assert.deepEqual(raros.omitidas.map(o => [o.ref, o.motivo, o.error]), [["kv:default:a-1", "ilegible", undefined], ["kv:default:a-2", "invalido", "pieza_invalida"], ["kv:default:a-3", "sin_valor", undefined]]);
});

// ── Ids de las fuentes largas (E7) ──────────────────────────────────────────────────────────────────────────────
// Lo de antes, tal cual: los ids y refs que ya están en la D1 (34 pantallas importadas el 9-oct-2026) salen de aquí.
const antes = { defecto: p => slugId("defecto-" + p), legadoDefecto: p => slugId("defecto-" + slugId(p)), viva: id => slugId("viva-" + id), ref: p => "kv:default:" + slugId(p) };
const azar = (n, alfabeto, semilla) => { let x = semilla; return Array.from({ length: n }, () => { x = (x * 1103515245 + 12345) % 2147483648; return alfabeto[x % alfabeto.length]; }).join(""); };

test("huella: el SHA-256 síncrono es el de node:crypto", () => {
  const casos = ["", "abc", "defecto-" + "a".repeat(70), "ñandú € 𝄞", "x".repeat(55), "x".repeat(56), "x".repeat(64), "y".repeat(1000)];
  for (let n = 0; n < 150; n += 1) casos.push(azar(n, "abcdefghijklmnopqrstuvwxyz0123456789-_ :#ÁéÑü€", n + 1));
  for (const c of casos) assert.equal(sha256Hex(c), createHash("sha256").update(c, "utf8").digest("hex"), JSON.stringify(c));
});

test("ids largos: los cortos (todos los de hoy) no cambian; slugEntero es slugId mientras cabe en 60", () => {
  const hoy = ["alcampo-alcala", "alcampo-getafe", "alcampo-esplugues", "virtual-xtanco", "xtore-virtual-demo-store", "macbookpro16", "sim-gracia-kiosko",
    "starbucks-paseodegracia-103-pantalla1", "a1", "a--b", "pantalla-con-52-caracteres-exactos-0123456789-abcdef"];
  assert.equal(hoy.at(-1).length, 52);
  // Pantallas válidas para cleanScreen de hasta 52 caracteres: defecto-<pantalla> cabe en 60.
  for (let i = 0; i < 400; i += 1) hoy.push("p" + azar(1 + (i % 51), "abcdefghijklmnopqrstuvwxyz0123456789--", i + 7));
  for (const p of hoy) {
    assert.ok(slugEntero("defecto-" + p).length <= 60, p);
    assert.equal(idDefecto(p), antes.defecto(p), p);
    assert.equal(desdeBorrador({ screen: p, items: [{ asset: "https://x.y/a.mp4" }] }).playlist.id, antes.legadoDefecto(p), p);
    assert.equal(refDefecto(p), antes.ref(p), p);
  }
  // Vivas: el id de cleanLive (60 como mucho) con viva- cabe si tiene 55 o menos.
  for (let i = 0; i < 300; i += 1) {
    const id = cleanLive({ name: azar(1 + (i % 55), "abcdefghijklmnopqrstuvwxyz0123456789 -", i + 3) + "x", content: { any: ["a"] }, target: { any: ["todas"] } }).id;
    if (id.length > 55) continue;
    assert.equal(idViva(id), antes.viva(id), id);
    assert.equal(desdeViva({ id, name: "n", content: { any: ["a"] }, target: { any: ["todas"] } }, 0, 1).playlist.id, antes.viva(id), id);
  }
  // slugEntero es slugId sin el recorte: con cualquier texto (tildes, mayúsculas, #, :, _, espacios) que quepa, igual.
  for (let i = 0; i < 2000; i += 1) {
    const t = azar(i % 70, "abcAB019 -_:#.é Ñü/", i + 11);
    if (slugEntero(t).length <= 60) assert.equal(slugEntero(t), slugId(t), JSON.stringify(t));
    else assert.equal(slugEntero(t).slice(0, 60).replace(/-+$/, ""), slugId(t), JSON.stringify(t));
  }
});

test("ids largos: dos pantallas de más de 52 caracteres con el mismo principio dan ids distintos y estables", () => {
  const pre = "alcampo-centro-comercial-la-gavia-planta-baja-pasillo";            // 53
  const [a, b] = [pre + "-tv1", pre + "-tv2"];
  assert.equal(antes.defecto(a), antes.defecto(b), "antes chocaban");
  // Los mismos en cada pasada, en cualquier máquina: recorte + «-» + 8 hexadecimales del SHA-256 del id entero.
  assert.deepEqual([idDefecto(a), idDefecto(b)], ["defecto-alcampo-centro-comercial-la-gavia-planta-ba-fc208a2e", "defecto-alcampo-centro-comercial-la-gavia-planta-ba-fd5e62bc"]);
  assert.equal(idDefecto(a), "defecto-alcampo-centro-comercial-la-gavia-planta-ba-" + sha256Hex(slugEntero("defecto-" + a)).slice(0, 8));
  for (const id of [idDefecto(a), idDefecto(b)]) {
    assert.ok(id.length <= 60 && /^defecto-[a-z0-9-]+-[0-9a-f]{8}$/.test(id), id);
    assert.equal(slugId(id), id, "guardar* lo deja tal cual");
  }
  // Con más de 60, también chocaba la ref: ahora lleva la pantalla entera.
  const largo = "alcampo-centro-comercial-la-gavia-planta-baja-pasillo-central-cajas-tv", [c, d] = [largo + "-izq-01", largo + "-der-02"];
  assert.equal(antes.ref(c), antes.ref(d));
  assert.deepEqual([refDefecto(c), refDefecto(d)], ["kv:default:" + c, "kv:default:" + d]);
  assert.deepEqual([idDefecto(c), idDefecto(d)], ["defecto-alcampo-centro-comercial-la-gavia-planta-ba-4dc8cf88", "defecto-alcampo-centro-comercial-la-gavia-planta-ba-57dc4eae"]);
  // Vivas largas con el mismo principio.
  const v = "promociones-de-otono-para-los-hipermercados-de-la-comunidad";
  assert.equal(antes.viva(v + "-a"), antes.viva(v + "-b"));
  assert.deepEqual([idViva(v + "-a"), idViva(v + "-b")], ["viva-promociones-de-otono-para-los-hipermercados-de-bd821714", "viva-promociones-de-otono-para-los-hipermercados-de-bfff8418"]);
  // El plan: las cuatro pantallas y las dos vivas se importan todas, sin ref_duplicada ni id_duplicado.
  const live = { playlists: [v + "-a", v + "-b"].map(id => ({ id, name: id, content: { any: ["oferta"] }, target: { any: ["todas"] } })), circuits: [] };
  const plan = planificar({ live, borradores: [a, b, c, d].map(p => ({ pantalla: p, valor: borrador(p, ["s-" + p.slice(-3)]) })), d1: {} });
  assert.deepEqual([plan.omitidas, plan.resumen.playlist.crear, plan.resumen.asignacion.crear], [[], 6, 6]);
  assert.deepEqual(new Set(plan.operaciones.map(o => o.id)).size, 6);
  assert.deepEqual(plan.operaciones.filter(o => o.entidad === "asignacion").map(o => o.datos.ref_externa).slice(2), [a, b, c, d].map(refDefecto));
});

// ── POST /api/programacion/importar ─────────────────────────────────────────────────────────────────────────────
prueba("simulación (por defecto): el plan con cuentas y muestra, sin escribir nada en la D1 ni en el KV", async () => {
  const { db, d, kv, env } = await mundo(legadoMixto());
  const r = await importar(env);
  assert.equal(r.status, 200);
  assert.match(r.headers.get("Cache-Control"), /no-store/);
  assert.deepEqual([r.body.ok, r.body.modo, r.body.version, r.body.completo, r.body.siguiente, r.body.huerfanos_borradores], [true, "simulacion", 0, true, null, "comprobados"]);
  assert.deepEqual(r.body.tramo, { vivas: "leidas", borradores: 4, continuacion: false });
  assert.deepEqual([r.body.resumen.escrituras, r.body.resumen.playlist.crear, r.body.resumen.asignacion.crear, r.body.resumen.circuito.crear], [9, 4, 4, 1]);
  assert.equal(r.body.muestra.length, 9);
  assert.ok(r.body.muestra.every(o => !("datos" in o)), "la muestra no lleva los datos que se escribirían");
  assert.deepEqual(r.body.omitidas.map(o => o.motivo).sort(), ["borrador_vacio", "sintetico"]);
  assert.equal((await importar(env, "muestra=2")).body.muestra.length, 2);
  // Nada escrito: sólo SELECT en la D1, ni put ni delete en el KV.
  assert.ok(d.sql.length > 0 && d.sql.every(s => /^\s*select\b/i.test(s)), d.sql.find(s => !/^\s*select\b/i.test(s)));
  assert.deepEqual(kv.escrituras, []);
  assert.deepEqual([await version(db), await cuenta(db, "playlist"), await cuenta(db, "auditoria")], [0, 0, 0]);
});

prueba("aplicar: escribe por almacen.js como importador:<email>, y la segunda pasada sale toda igual", async () => {
  const { db, kv, env } = await mundo(legadoMixto());
  const r = await importar(env, "aplicar=1");
  assert.equal(r.status, 200);
  assert.deepEqual([r.body.ok, r.body.modo, r.body.version_antes, r.body.version, r.body.aplicadas, r.body.fallidas, r.body.pendientes, r.body.completo],
    [true, "aplicado", 0, 9, { crear: 9, actualizar: 0, archivar: 0 }, [], 0, true]);
  assert.ok(r.body.muestra.every(o => o.resultado && o.resultado.status === 201 && o.resultado.rev === 1));
  assert.deepEqual([await cuenta(db, "playlist"), await cuenta(db, "asignacion"), await cuenta(db, "circuito")], [4, 4, 1]);
  const auditoria = await A.auditoria(db);
  assert.ok(auditoria.every(e => e.actor === "importador:" + DUENO && e.accion === "crear"));
  assert.deepEqual((await A.historial(db, "playlist", "defecto-alcampo-alcala")).map(h => [h.rev, h.autor, h.motivo]), [[1, "importador:" + DUENO, "importador E5 · kv:default:alcampo-alcala"]]);
  const playlist = await A.leerPlaylist(db, "defecto-alcampo-alcala");
  assert.deepEqual([playlist.origen, playlist.items.map(i => i.stockId), playlist.creado_por], ["legado:kv-default", ["m1", "m2"], "importador:" + DUENO]);
  assert.equal((await A.leerAsignacion(db, "viva-marca")).estado, "pausada");
  assert.equal((await A.leerCircuito(db, "madrid")).creado_por, "importador:" + DUENO);
  // Idempotente: otra simulación y otra aplicación no tienen nada que escribir.
  for (const query of ["", "aplicar=1"]) {
    const otra = await importar(env, query);
    assert.deepEqual([otra.body.resumen.escrituras, otra.body.resumen.playlist.igual, otra.body.resumen.asignacion.igual, otra.body.resumen.circuito.igual], [0, 4, 4, 1], query);
    assert.ok(otra.body.muestra.every(o => o.accion === "igual" && o.motivo === "identica"));
  }
  assert.equal(await version(db), 9, "la pasada igual no sube la versión");
  assert.deepEqual(kv.escrituras, [], "el KV nunca se escribe");
});

prueba("un cambio en el legado: actualizar sólo lo que cambió, con la rev de la fila", async () => {
  const { db, kv, env } = await mundo(legadoMixto());
  await importar(env, "aplicar=1");
  kv.store.set(DRAFT_PREFIX + "alcampo-alcala", borrador("alcampo-alcala", ["m1", "m2", "m3"]));
  const sim = await importar(env);
  assert.equal(sim.body.resumen.escrituras, 1);
  assert.deepEqual(sim.body.muestra[0], { entidad: "playlist", id: "defecto-alcampo-alcala", ref: "kv:default:alcampo-alcala", accion: "actualizar",
    motivo: "contenido_cambiado", rev: 1, cambios: ["items", "duracion_s"] });
  assert.equal(operacion(sim.body, "asignacion", "defecto-alcampo-alcala").accion, "igual");
  const ap = await importar(env, "aplicar=1");
  assert.deepEqual([ap.body.aplicadas, ap.body.muestra[0].resultado, ap.body.version], [{ crear: 0, actualizar: 1, archivar: 0 }, { status: 200, rev: 2 }, 10]);
  assert.deepEqual((await A.leerPlaylist(db, "defecto-alcampo-alcala")).items.map(i => i.stockId), ["m1", "m2", "m3"]);
  // Lo que reescribió el propio importador sigue siendo suyo: otro cambio en el legado se aplica sin más (rev 2 → 3).
  kv.store.set(DRAFT_PREFIX + "alcampo-alcala", borrador("alcampo-alcala", ["m1"]));
  const otra = await importar(env, "aplicar=1");
  assert.deepEqual([otra.body.muestra[0].accion, otra.body.muestra[0].rev, otra.body.muestra[0].cambios, otra.body.muestra[0].resultado.rev], ["actualizar", 2, ["items", "duracion_s"], 3]);
  // Reordenar las vivas cambia su peso (el orden K conserva el del documento): se actualizan las asignaciones.
  kv.store.set(LIVE_KEY, JSON.stringify({ ...LIVE, playlists: [VIVAS[1], VIVAS[0]] }));
  const orden = await importar(env, "aplicar=1");
  assert.deepEqual(orden.body.muestra.filter(o => o.accion !== "igual").map(o => [o.id, o.rev, o.cambios, o.resultado.rev]),
    [["viva-marca", 1, ["peso"], 2], ["viva-ofertas-madrid", 1, ["peso"], 2]]);
  assert.deepEqual([(await A.leerAsignacion(db, "viva-marca")).peso, (await A.leerAsignacion(db, "viva-ofertas-madrid")).peso], [2, 1]);
});

/** PATCH por la API de E4 con la sesión de la editora: «editar fuera» del importador. */
const parche = (env, ruta, cuerpo) => onRequest({ request: new Request("https://admira.tv/api/programacion/" + ruta, { method: "PATCH",
  headers: { Cookie: "__Host-atv_session=" + T.editora, "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) }), env });

prueba("lo editado fuera del importador no se pisa (omitir · editado_fuera) salvo con ?pisar=1, al simular y al aplicar", async () => {
  const { db, d, env } = await mundo(legadoMixto());
  await importar(env, "aplicar=1");
  // La editora retoca por la API de E4 la playlist importada de alcalá y la asignación de la viva «Ofertas Madrid».
  assert.equal((await parche(env, "playlists/defecto-alcampo-alcala", { rev: 1, nombre: "Retocada" })).status, 200);
  assert.equal((await parche(env, "asignaciones/viva-ofertas-madrid", { rev: 1, peso: 7 })).status, 200);
  const v0 = await version(db), editadas = r => r.body.muestra.filter(o => o.accion !== "igual");
  // Por defecto no se tocan, ni al simular ni al aplicar: se omiten con quién las editó.
  for (const query of ["", "aplicar=1"]) {
    const r = await importar(env, query);
    assert.deepEqual([r.body.opciones, r.body.resumen.escrituras, r.body.resumen.playlist.omitir, r.body.resumen.asignacion.omitir], [{ pisar: false, archivar: false }, 0, 1, 1], query);
    assert.deepEqual(editadas(r).map(o => [o.entidad, o.id, o.accion, o.motivo, o.actualizado_por, o.rev, o.cambios, "pisa" in o]), [
      ["asignacion", "viva-ofertas-madrid", "omitir", "editado_fuera", EDITORA, 2, ["peso"], false],
      ["playlist", "defecto-alcampo-alcala", "omitir", "editado_fuera", EDITORA, 2, ["nombre"], false]], query);
  }
  assert.equal(await version(db), v0);
  assert.equal((await A.leerPlaylist(db, "defecto-alcampo-alcala")).nombre, "Retocada");
  // Con ?pisar=1, la simulación lo anuncia (sin escribir) y la aplicación lo pisa, con el aviso `pisa`.
  const antes = d.sql.length, sim = await importar(env, "pisar=1");
  assert.deepEqual(editadas(sim).map(o => [o.id, o.accion, o.motivo, o.pisa, o.rev]), [["viva-ofertas-madrid", "actualizar", "contenido_cambiado", EDITORA, 2], ["defecto-alcampo-alcala", "actualizar", "contenido_cambiado", EDITORA, 2]]);
  assert.ok(d.sql.slice(antes).every(q => /^\s*select\b/i.test(q)), "la simulación con pisar tampoco escribe");
  assert.equal(await version(db), v0);
  const ap = await importar(env, "pisar=1&aplicar=1");
  assert.deepEqual([ap.body.opciones, ap.body.aplicadas, editadas(ap).map(o => o.resultado.rev)], [{ pisar: true, archivar: false }, { crear: 0, actualizar: 2, archivar: 0 }, [3, 3]]);
  assert.deepEqual([(await A.leerPlaylist(db, "defecto-alcampo-alcala")).nombre, (await A.leerAsignacion(db, "viva-ofertas-madrid")).peso], ["Por defecto", 2]);
  // Ya las escribió el importador: la pasada siguiente, sin pisar, sale toda igual.
  const tras = await importar(env);
  assert.deepEqual([tras.body.resumen.escrituras, tras.body.resumen.playlist.omitir + tras.body.resumen.asignacion.omitir], [0, 0]);
  // Lo idéntico no cuenta como editado: si la edición coincide con el legado, sale igual aunque la hiciera otro.
  assert.equal((await parche(env, "playlists/viva-marca", { rev: 1, nombre: "Marca" })).status, 200);
  assert.equal(operacion((await importar(env, "muestra=50")).body, "playlist", "viva-marca").accion, "igual");
});

prueba("huérfanos: lo que ya no está en el KV se informa y no se borra", async () => {
  const { db, kv, env } = await mundo(legadoMixto());
  await importar(env, "aplicar=1");
  const antes = { playlist: await cuenta(db, "playlist"), asignacion: await cuenta(db, "asignacion"), circuito: await cuenta(db, "circuito") };
  kv.store.set(LIVE_KEY, JSON.stringify({ ...LIVE, playlists: [VIVAS[0]], circuits: [] }));       // fuera la viva «Marca» y el circuito
  kv.store.set(DRAFT_PREFIX + "alcampo-alcala", borrador("alcampo-alcala", []));                    // vaciado: hoy no manda nada
  kv.store.delete(DRAFT_PREFIX + "alcampo-leganes");                                                // clave borrada
  for (const query of ["", "aplicar=1"]) {
    const r = await importar(env, query);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.huerfanos.map(h => [h.entidad, h.id, h.motivo]).sort(), [
      ["asignacion", "defecto-alcampo-alcala", "borrador_vacio"], ["asignacion", "defecto-alcampo-leganes", "sin_clave_kv"], ["asignacion", "viva-marca", "viva_eliminada"],
      ["circuito", "madrid", "circuito_eliminado"],
      ["playlist", "defecto-alcampo-alcala", "borrador_vacio"], ["playlist", "defecto-alcampo-leganes", "sin_clave_kv"], ["playlist", "viva-marca", "viva_eliminada"]].sort());
    assert.deepEqual([r.body.resumen.huerfanos, r.body.resumen.escrituras, r.body.huerfanos_borradores], [7, 1, "comprobados"]);
  }
  // La única escritura fue la de la viva que queda (su peso pasa de 2 a 1). Nada borrado: ni filas, ni auditoría de borrado.
  assert.deepEqual({ playlist: await cuenta(db, "playlist"), asignacion: await cuenta(db, "asignacion"), circuito: await cuenta(db, "circuito") }, antes);
  assert.equal((await A.auditoria(db, { accion: "borrar" })).length, 0);
  assert.equal((await A.leerAsignacion(db, "viva-marca")).estado, "pausada", "ni se archiva: sólo se informa");
});

prueba("?archivar=1 archiva (nunca borra) sólo las asignaciones huérfanas del importador no editadas fuera, y apaga sus circuitos; con ?pisar=1, también ésas", async () => {
  const { db, d, kv, env } = await mundo(legadoMixto());
  await importar(env, "aplicar=1");
  const alta = cuerpo => onRequest({ request: new Request("https://admira.tv/api/programacion/asignaciones", { method: "POST",
    headers: { Cookie: "__Host-atv_session=" + T.editora, "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) }), env });
  // No son del importador: una que reclama una viva que no existe (con su ref) y una manual sin ref.
  assert.equal((await alta({ id: "ajena", playlist_id: "viva-marca", destino: { all: ["todas"] }, ref_externa: "kv:viva:fantasma" })).status, 201);
  assert.equal((await alta({ id: "manual", playlist_id: "viva-marca", destino: { all: ["todas"] } })).status, 201);
  // El legado cambia: fuera la viva «Marca» y el circuito; alcalá se vacía; leganés desaparece y la editora lo retocó.
  kv.store.set(LIVE_KEY, JSON.stringify({ ...LIVE, playlists: [VIVAS[0]], circuits: [] }));
  kv.store.set(DRAFT_PREFIX + "alcampo-alcala", borrador("alcampo-alcala", []));
  kv.store.delete(DRAFT_PREFIX + "alcampo-leganes");
  assert.equal((await parche(env, "asignaciones/defecto-alcampo-leganes", { rev: 1, nombre: "Retocada" })).status, 200);
  const huerfanas = r => r.body.muestra.filter(o => o.entidad === "asignacion" && o.id !== "viva-ofertas-madrid").map(o => [o.id, o.accion, o.motivo]);
  const estados = async () => Object.fromEntries((await A.listarAsignaciones(db)).map(a => [a.id, a.estado]));
  const v0 = await version(db), filas = { asignacion: await cuenta(db, "asignacion"), playlist: await cuenta(db, "playlist") };
  // Sin la opción, como siempre: sólo se informan (y la viva que queda se reordena: peso 2 → 1).
  const informe = await importar(env);
  assert.deepEqual([informe.body.resumen.asignacion.archivar, informe.body.resumen.escrituras, informe.body.huerfanos.length], [0, 1, 8]);
  // Con archivar=1, la simulación lo anuncia sin escribir: dos se archivan; la ajena y la retocada se omiten.
  const antes = d.sql.length, sim = await importar(env, "archivar=1&muestra=50");
  assert.deepEqual(sim.body.opciones, { pisar: false, archivar: true });
  assert.deepEqual(huerfanas(sim), [["ajena", "omitir", "ajena"], ["viva-marca", "archivar", "viva_eliminada"],
    ["defecto-alcampo-alcala", "archivar", "borrador_vacio"], ["defecto-alcampo-leganes", "omitir", "editado_fuera"]]);
  assert.deepEqual([sim.body.resumen.asignacion.archivar, sim.body.resumen.circuito.archivar, sim.body.resumen.escrituras], [2, 1, 4]);
  assert.deepEqual(operacion(sim.body, "circuito", "madrid"), { entidad: "circuito", id: "madrid", ref: "kv:circuito:madrid", rev: 1, accion: "archivar", motivo: "circuito_eliminado", cambios: ["activo"] });
  assert.equal(operacion(sim.body, "asignacion", "defecto-alcampo-leganes").actualizado_por, EDITORA);
  assert.ok(d.sql.slice(antes).every(q => /^\s*select\b/i.test(q)), "la simulación con archivar no escribe");
  assert.equal(await version(db), v0);
  // Aplicar: archivadas, no borradas; las demás, intactas. Las playlists sólo se informan; el circuito se apaga (decisión
  // de Carlos, 9-oct-2026: la misma regla que el espejo de E7).
  const ap = await importar(env, "archivar=1&aplicar=1");
  assert.deepEqual(ap.body.aplicadas, { crear: 0, actualizar: 1, archivar: 3 });
  assert.deepEqual(await estados(), { ajena: "activa", "defecto-alcampo-alcala": "archivada", "defecto-alcampo-leganes": "activa", manual: "activa",
    "viva-marca": "archivada", "viva-ofertas-madrid": "activa" });
  assert.deepEqual({ asignacion: await cuenta(db, "asignacion"), playlist: await cuenta(db, "playlist") }, filas);
  assert.equal(await cuenta(db, "circuito"), 1);
  assert.deepEqual([(await A.leerCircuito(db, "madrid")).activo, (await A.auditoria(db, { entidad: "circuito", id: "madrid" }))[0].detalle.motivo],
    [false, "importador E5 · kv:circuito:madrid · apagado: circuito_eliminado"]);
  assert.equal((await A.auditoria(db, { accion: "borrar" })).length, 0);
  assert.deepEqual((await A.historial(db, "asignacion", "viva-marca"))[0].motivo, "importador E5 · kv:viva:marca · archivada: viva_eliminada");
  // Segunda pasada: nada que escribir (las archivadas salen igual · ya_archivada).
  const otra = await importar(env, "archivar=1&aplicar=1&muestra=50");
  assert.deepEqual([otra.body.resumen.escrituras, huerfanas(otra).filter(h => h[1] === "igual").map(h => h[2])], [0, ["ya_archivada", "ya_archivada"]]);
  assert.deepEqual([operacion(otra.body, "circuito", "madrid").accion, operacion(otra.body, "circuito", "madrid").motivo], ["igual", "ya_apagado"]);
  // Con pisar=1 se archiva también la retocada (con el aviso), pero la ajena nunca: no es del importador.
  const pisando = await importar(env, "archivar=1&pisar=1&aplicar=1&muestra=50");
  assert.deepEqual([pisando.body.aplicadas.archivar, operacion(pisando.body, "asignacion", "defecto-alcampo-leganes").pisa, operacion(pisando.body, "asignacion", "ajena").motivo],
    [1, EDITORA, "ajena"]);
  assert.deepEqual([(await estados())["defecto-alcampo-leganes"], (await estados()).ajena, (await estados()).manual], ["archivada", "activa", "activa"]);
  assert.equal((await importar(env, "archivar=1&pisar=1")).body.resumen.escrituras, 0, "y la pasada siguiente, toda igual");
  // Si la viva vuelve al KV, su asignación archivada se reactiva (es del importador): el legado sigue mandando.
  kv.store.set(LIVE_KEY, JSON.stringify(LIVE));
  const vuelve = await importar(env, "aplicar=1&muestra=50");
  assert.deepEqual([operacion(vuelve.body, "asignacion", "viva-marca").accion, operacion(vuelve.body, "asignacion", "viva-marca").cambios], ["actualizar", ["estado"]]);
  assert.equal((await estados())["viva-marca"], "pausada");
  // Y el circuito, que vuelve con el documento, se enciende otra vez.
  assert.deepEqual([operacion(vuelve.body, "circuito", "madrid").accion, operacion(vuelve.body, "circuito", "madrid").cambios, (await A.leerCircuito(db, "madrid")).activo],
    ["actualizar", ["activo"], true]);
});

prueba("?archivar=1 con circuitos: sólo los del importador; lo editado fuera no se apaga salvo con ?pisar=1 (con el aviso)", async () => {
  const { db, kv, env } = await mundo(legadoMixto());
  await importar(env, "aplicar=1");
  // Un circuito puesto a mano por la API (no es del importador) y el del legado, retocado por la editora.
  const alta = cuerpo => onRequest({ request: new Request("https://admira.tv/api/programacion/circuitos", { method: "POST",
    headers: { Cookie: "__Host-atv_session=" + T.editora, "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) }), env });
  assert.equal((await alta({ nombre: "A mano", destino: { all: ["pantalla:alcampo-alcala"] } })).status, 201);
  assert.equal((await parche(env, "circuitos/madrid", { rev: 1, nombre: "Madrid centro" })).status, 200);
  kv.store.set(LIVE_KEY, JSON.stringify({ ...LIVE, circuits: [] }));
  const v0 = await version(db);
  const sim = await importar(env, "archivar=1&muestra=50");
  assert.deepEqual(sim.body.huerfanos.filter(h => h.entidad === "circuito").map(h => [h.id, h.motivo]), [["madrid", "circuito_eliminado"]], "el ajeno ni es huérfano");
  assert.deepEqual([operacion(sim.body, "circuito", "madrid").accion, operacion(sim.body, "circuito", "madrid").motivo, operacion(sim.body, "circuito", "madrid").actualizado_por,
    operacion(sim.body, "circuito", "madrid").cambios, sim.body.resumen.circuito.archivar], ["omitir", "editado_fuera", EDITORA, ["activo"], 0]);
  assert.equal((await importar(env, "archivar=1&aplicar=1")).body.aplicadas.archivar, 0);
  assert.equal(await version(db), v0);
  const ap = await importar(env, "archivar=1&pisar=1&aplicar=1&muestra=50");
  assert.deepEqual([ap.body.aplicadas.archivar, operacion(ap.body, "circuito", "madrid").pisa, ap.body.resumen.circuito.archivar], [1, EDITORA, 1]);
  assert.deepEqual([(await A.leerCircuito(db, "madrid")).activo, (await A.leerCircuito(db, "a-mano")).activo], [false, true]);
  assert.equal((await importar(env, "archivar=1")).body.resumen.escrituras, 0, "la pasada siguiente, toda igual");
});

prueba("acceso: sólo la sesión del portal con digitalsignage-player; ni el visor, ni la clave de servicio", async () => {
  const { db, env } = await mundo(legadoMixto(), { PROGRAMACION_SERVICE_KEY: CLAVE });
  const casos = [
    [{ token: null }, 401, "unauthorized"],
    [{ token: "tok-inventado" }, 401, "unauthorized"],
    [{ token: T.sinPermiso }, 403, "forbidden"],
    [{ token: T.visor }, 403, "solo_lectura"],
    [{ token: null, cabeceras: { "X-Programacion-Key": CLAVE } }, 403, "importador_solo_sesion"],
    [{ token: null, cabeceras: { Authorization: "Bearer " + CLAVE } }, 403, "importador_solo_sesion"],
    [{ token: null, cabeceras: { "X-Programacion-Key": CLAVE + "x" } }, 401, "unauthorized"],
  ];
  for (const query of ["", "aplicar=1"]) {
    for (const [opciones, status, error] of casos) {
      const r = await importar(env, query, opciones);
      assert.deepEqual([r.status, r.body], [status, { ok: false, error }], JSON.stringify([query, opciones]));
    }
  }
  assert.equal(await version(db), 0, "nadie de ésos escribe");
  // Quien tiene el permiso (sin ser dueña) importa con su email.
  const editora = await importar(env, "aplicar=1", { token: T.editora });
  assert.deepEqual([editora.status, editora.body.aplicadas.crear], [200, 9]);
  assert.ok((await A.auditoria(db)).every(e => e.actor === "importador:" + EDITORA));
  // Sólo POST; el resto de la API de E4 sigue igual.
  const get = await importar(env, "", { metodo: "GET" });
  assert.deepEqual([get.status, get.headers.get("Allow")], [405, "POST"]);
  assert.equal((await onRequest({ request: new Request("https://admira.tv/api/programacion/importar/x", { method: "POST" }), env })).status, 404);
});

prueba("503 sin el binding o sin la migración (después del acceso), 503 sin KV y 400 con un cursor que no es nuestro", async () => {
  const sinD1 = { ACCESS: kvLegado(legadoMixto()) };
  assert.deepEqual((await importar(sinD1)).body, { ok: false, error: "programacion_db_no_configurada" });
  assert.equal((await importar(sinD1, "", { token: null })).status, 401);
  const error = console.error, log = [];
  console.error = (...a) => log.push(a);
  try {
    const sinEsquema = await importar({ ACCESS: kvLegado(), PROGRAMACION_DB: await d1Memoria("") });
    assert.deepEqual([sinEsquema.status, sinEsquema.body.error], [503, "programacion_db_sin_esquema"]);
  } finally { console.error = error; }
  const { env } = await mundo(legadoMixto());
  const sinList = { ...env, ACCESS: { get: env.ACCESS.get, getWithMetadata: env.ACCESS.getWithMetadata } };
  assert.deepEqual((await importar(sinList)).body, { ok: false, error: "kv_no_disponible" }, "un KV sin list no sirve para importar");
  for (const cursor of ["no-es-base64-json", Buffer.from(JSON.stringify({ v: 2 })).toString("base64url")]) {
    assert.deepEqual((await importar(env, "cursor=" + cursor)).body, { ok: false, error: "cursor_invalido" });
  }
});

prueba("tramos: los borradores por páginas con cursor; las vivas, en el primero; los huérfanos de borradores, en el último", async () => {
  const extra = {};
  for (const s of ["a-1", "a-2", "a-3"]) extra[DRAFT_PREFIX + "alcampo-" + s] = borrador("alcampo-" + s, ["p-" + s]);
  const { db, kv, env } = await mundo(legadoMixto(extra));
  const sim = await pasada(env, "limite=2");
  assert.equal(sim.length, 4, "7 borradores de 2 en 2");
  assert.deepEqual(sim.map(t => [t.tramo.vivas, t.tramo.borradores, t.tramo.continuacion, t.completo, t.huerfanos_borradores]), [
    ["leidas", 2, false, false, "en_el_ultimo_tramo"], ["fuera_del_tramo", 2, true, false, "en_el_ultimo_tramo"],
    ["fuera_del_tramo", 2, true, false, "en_el_ultimo_tramo"], ["fuera_del_tramo", 1, true, true, "comprobados"]]);
  assert.equal(sim.reduce((n, t) => n + t.resumen.escrituras, 0), 15, "circuito + 2 vivas × 2 + 5 borradores × 2");
  const ap = await pasada(env, "limite=2&aplicar=1");
  assert.equal(ap.reduce((n, t) => n + t.aplicadas.crear, 0), 15);
  assert.equal(await version(db), 15);
  assert.deepEqual((await pasada(env, "limite=3")).map(t => t.resumen.escrituras), [0, 0, 0], "otra pasada: todo igual");
  // Una clave borrada a mitad: se informa en el último tramo, aunque su página ya pasó.
  kv.store.delete(DRAFT_PREFIX + "alcampo-a-1");
  const tras = await pasada(env, "limite=2");
  assert.deepEqual(tras.map(t => t.huerfanos.map(h => [h.entidad, h.id, h.motivo])), [[], [],
    [["asignacion", "defecto-alcampo-a-1", "sin_clave_kv"], ["playlist", "defecto-alcampo-a-1", "sin_clave_kv"]]]);
});

prueba(`tope de ${MAX_ESCRITURAS} escrituras por petición: \`siguiente\` repite el tramo y lo ya escrito sale igual`, async () => {
  const N = 30;   // 60 escrituras: más que el tope, menos que dos topes
  assert.ok(MAX_ESCRITURAS < 2 * N && 2 * N <= 2 * MAX_ESCRITURAS && MAX_ESCRITURAS % 2 === 0);
  const vivas = Array.from({ length: N }, (_, i) => cleanLive({ name: "Viva " + i, content: { any: ["oferta"] }, target: { any: ["todas"] } }, DUENO, i));
  const { db, env } = await mundo({ [LIVE_KEY]: JSON.stringify({ rev: 1, playlists: vivas, circuits: [] }) });
  const primera = await importar(env, "aplicar=1");
  assert.deepEqual([primera.body.aplicadas.crear, primera.body.pendientes, primera.body.completo], [MAX_ESCRITURAS, 2 * N - MAX_ESCRITURAS, false]);
  assert.equal(await version(db), MAX_ESCRITURAS);
  const segunda = await importar(env, "aplicar=1&cursor=" + encodeURIComponent(primera.body.siguiente));
  assert.deepEqual([segunda.body.tramo.vivas, segunda.body.aplicadas.crear, segunda.body.pendientes, segunda.body.completo, segunda.body.resumen.playlist.igual],
    ["leidas", 2 * N - MAX_ESCRITURAS, 0, true, MAX_ESCRITURAS / 2], "el mismo tramo: lo ya escrito sale igual y sigue lo que faltaba");
  assert.deepEqual([await cuenta(db, "playlist"), await cuenta(db, "asignacion")], [N, N]);
  assert.equal((await importar(env)).body.resumen.escrituras, 0);
});

prueba("tras aplicar, GET /api/programacion sirve lo mismo que hoy y lo que espera la paridad de legado.js", async () => {
  const entradas = legadoMixto(), { env } = await mundo(entradas);
  assert.equal((await importar(env, "aplicar=1")).body.ok, true);
  const AT = Date.parse("2026-10-14T08:00:00.000Z");
  const leer = async screen => (await programacionGet({ request: new Request(`https://admira.tv/api/programacion?screen=${screen}&at=${AT}`,
    { headers: { Cookie: "__Host-atv_session=" + T.dueno } }), env })).json();
  const huella = lista => lista.map(i => [i.stockId, i.seconds, i.asset]);
  const draft = JSON.parse(entradas[DRAFT_PREFIX + "alcampo-alcala"]);
  for (const screen of ["alcampo-alcala", "alcampo-getafe"]) {
    const r = await leer(screen);
    assert.equal(r.ok, true, JSON.stringify(r));
    // La identidad que completa E3 (circuito y proyecto de la parrilla) más el circuito definido, ya desde la D1.
    const facts = { screen, circuit: "alcampo", project: "alcampo" }, tags = applyCircuits(deduceScreenTags(facts), LIVE.circuits);
    assert.deepEqual(r.screenTags, tags);
    assert.ok(tags.includes("circuito:madrid"));
    // Hoy (playlist.js): lo puesto a mano o, si no hay, las vivas activas que le tocan, fundidas.
    const hoy = screen === "alcampo-alcala" ? draft.items : resolveForScreen(LIVE.playlists, tags, STOCK, facts).items;
    // La paridad de legado.js: el resolver sobre la traducción en memoria.
    const paridad = resolver({ ahora: AT, facts, screenTags: tags, stock: STOCK, ...desdeLegado({ borradores: [draft], live: LIVE }) });
    assert.deepEqual(huella(r.items), huella(hoy), screen);
    assert.deepEqual(huella(r.items), huella(paridad.items), screen);
    assert.deepEqual([r.capa, r.base], [paridad.capa, paridad.base], screen);
  }
  assert.deepEqual((await leer("alcampo-alcala")).items.map(i => i.stockId), ["m1", "m2"]);
  assert.deepEqual((await leer("alcampo-getafe")).items.map(i => i.stockId), ["o2", "o1"], "la viva por el circuito; la pausada no sale");
});
