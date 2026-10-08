// GET /api/programacion?screen=<id>[&at=<ISO|ms>][&tag=<hashtag>]
//
// MODELO ÚNICO DE PLAYLISTS · E3 (docs/playlists-modelo-unico.md): ¿qué emite la pantalla X en el instante T según el
// motor nuevo? Sirve la salida del resolver (functions/api/_programacion/resolver.js) con todo leído:
//   · de la D1 «admira-programacion» (PROGRAMACION_DB), con almacen.js: las asignaciones candidatas, sus playlists y
//     los circuitos definidos;
//   · la parrilla de /grid/day (api.admira.store, lectura pública, sin GRID_KEY) del día de T, igual que /api/emision,
//     más la víspera y el día siguiente: la franja nocturna de ayer sigue viva de madrugada y los bordes de mañana
//     cuentan para validoHasta y siguiente;
//   · el Stock (stock.admira.store/stock/index.json) con loadStock de playlist.js, el mismo índice que las vivas de hoy;
//   · la identidad de la pantalla con hintFacts + enrichFacts de playlist.js. Si quien pregunta no es el player (sin
//     w/h/lang ni player=1), las pistas que falten (tamaño, idioma, Xpacio, proyecto, circuito) salen de lo que la
//     pantalla dejó registrado al pedir su playlist, como en /api/emision.
// ?tag= simula el mando en vivo por hashtag desde T (decisión 2: caduca a las 2 h o en el siguiente borde de franja).
//
// SIN EFECTOS. Ni KV (ACCESS de solo lectura: ni censo de etiquetas ni índice de Xpacios), ni D1 (sólo SELECT), ni
// nada que no sea un GET. Todavía no la consume nadie: el player llegará en E9, detrás de bandera.
//
// MEMORIA POR INSTANCIA. Lo leído de la D1 se guarda con la clave meta.version, que sube con cada escritura: cada
// consulta lee sólo la fila de meta y, mientras la versión no cambie, reutiliza los circuitos y las candidatas (por
// etiquetas de la pantalla y hora de T). Si la versión cambia, se olvida todo lo anterior. La parrilla y lo que la
// pantalla dejó registrado se recuerdan 60 s; el Stock, 45 s (la memoria de playlist.js).
//
// LECTURA: la misma postura que /api/emision (autorizar de emision.js). Pública para pantallas virtuales; para el resto,
// la sesión del portal con permiso digitalsignage-player o la sesión de lectura viva.
//
// Sin el binding PROGRAMACION_DB (lo normal en producción hasta que Carlos cree la D1) → 503 programacion_db_no_configurada.
import { authHeaders } from "../_auth-session.js";
import { autorizar, soloLectura } from "./emision.js";
import { enrichFacts, fromPlayer, hintFacts, loadStock } from "./playlist.js";
import { TAGS_PREFIX } from "./_playlist-live.js";
import { madridClock } from "./_emision.js";
import { candidatas, leerMeta, listarCircuitos } from "./_programacion/almacen.js";
import { HORA_MS, HORIZONTE_MS, sumarDias } from "./_programacion/horario.js";
import { MANDO_MAX_MS, etiquetasDe, resolver } from "./_programacion/resolver.js";

const API = "https://api.admira.store";
const BREVE_MS = 60_000;
const MAX_ENTRADAS = 500;

const json = (value, status = 200) => Response.json(value, { status, headers: authHeaders() });
const cleanScreen = value => { const s = String(value || "").trim().toLowerCase(); return /^[a-z0-9][a-z0-9-]{1,79}$/.test(s) ? s : ""; };
const tagVal = (tags, k) => { const t = (tags || []).find(x => String(x).startsWith(k + ":")); return t ? String(t).slice(k.length + 1) : ""; };
const getJson = (url, ms = 4500) => fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(ms) })
  .then(r => r.ok ? r.json() : null).catch(() => null);
// Tope de entradas: se olvidan las más antiguas, salvo la que se pida conservar (los circuitos, que valen para todas).
const recorta = (mapa, conserva = "") => { for (const k of mapa.keys()) { if (mapa.size <= MAX_ENTRADAS) break; if (k !== conserva) mapa.delete(k); } };

// ── Memoria por instancia ───────────────────────────────────────────────────────────────────────────────────────
// Lo de la D1, por meta.version. Se guardan las promesas para que dos consultas simultáneas lean una sola vez.
const d1 = { version: null, mapa: new Map() };
async function deVersion(version, clave, cargar) {
  if (d1.version === null || version > d1.version) { d1.version = version; d1.mapa.clear(); }
  if (version < d1.version) return { valor: await cargar(), acierto: false };   // lectura rezagada: no pisa lo nuevo
  let p = d1.mapa.get(clave);
  const acierto = !!p;
  if (!p) {
    p = cargar();
    d1.mapa.set(clave, p);
    recorta(d1.mapa, "circuitos");
    p.catch(() => { if (d1.mapa.get(clave) === p) d1.mapa.delete(clave); });
  }
  return { valor: await p, acierto };
}
// Lo de fuera (parrilla, autorretrato), con caducidad corta. Un fallo (null) no se recuerda.
const breve = new Map();
async function recordar(clave, cargar, ms = BREVE_MS) {
  const hit = breve.get(clave);
  if (hit && Date.now() - hit.en < ms) return hit.valor;
  const valor = await cargar();
  if (valor != null) { breve.set(clave, { en: Date.now(), valor }); recorta(breve); }
  return valor;
}
/** Para las pruebas: olvida lo recordado en esta instancia. */
export function olvidarMemoria() { d1.version = null; d1.mapa.clear(); breve.clear(); }

// ── Lecturas ────────────────────────────────────────────────────────────────────────────────────────────────────
/** /grid/day de un día, como lo pide /api/emision: sin &date= si es hoy. Se le pone la fecha si no la trae. */
function diaDeParrilla(screen, fecha, hoy) {
  return recordar(`parrilla:${screen}:${fecha}`, async () => {
    const d = await getJson(API + "/grid/day?screen=" + encodeURIComponent(screen) + (fecha !== hoy ? "&date=" + fecha.replace(/-/g, "") : ""));
    return d && d.ok && Array.isArray(d.bands) ? { ...d, date: d.date || fecha } : null;
  });
}
/** Víspera, día y siguiente; sin días repetidos (por si el worker no atiende &date=). */
async function parrillaDe(screen, at) {
  const fecha = madridClock(at).date, hoy = madridClock(Date.now()).date;
  const dias = await Promise.all([sumarDias(fecha, -1), fecha, sumarDias(fecha, 1)].map(f => diaDeParrilla(screen, f, hoy)));
  const vistos = new Set();
  return dias.filter(d => d && !vistos.has(d.date) && vistos.add(d.date));
}
/** Lo que la pantalla dejó dicho de sí misma la última vez que pidió su playlist (sólo lectura). */
function autorretrato(env, screen) {
  return recordar("autorretrato:" + screen, async () => {
    try {
      if (!env.ACCESS || typeof env.ACCESS.getWithMetadata !== "function") return { meta: null };
      const r = await env.ACCESS.getWithMetadata(TAGS_PREFIX + screen);
      return { meta: r && r.metadata ? r.metadata : null };
    } catch (_) { return null; }
  }).then(x => (x && x.meta) || null);
}
/** Identidad completa: hintFacts + enrichFacts de playlist.js, con un ACCESS que descarta cualquier escritura. */
async function identidad(env, screen, q, swallow) {
  const pistas = new URLSearchParams();
  for (const k of ["circuit", "project", "xpace", "xpacio", "loc", "iot", "idiot", "w", "h", "o", "lang"]) if (q.get(k)) pistas.set(k, q.get(k));
  // El player habla por sí mismo (igual que en /api/playlist); el resto lee lo que la pantalla registró (/api/emision).
  const meta = fromPlayer(q) ? null : await autorretrato(env, screen);
  if (meta) {
    const tags = Array.isArray(meta.tags) ? meta.tags : [];
    if (!(pistas.get("w") && pistas.get("h")) && Number(meta.w) && Number(meta.h)) { pistas.set("w", String(meta.w)); pistas.set("h", String(meta.h)); }
    if (!pistas.get("lang") && tagVal(tags, "idioma")) pistas.set("lang", tagVal(tags, "idioma"));
    const xpaceDado = pistas.get("xpace") || pistas.get("xpacio") || pistas.get("loc");
    for (const [k, tk] of [["xpace", "xpacio"], ["project", "proyecto"], ["circuit", "circuito"]]) {
      const v = tagVal(tags, tk);
      if (v && v !== screen && !pistas.get(k) && !(k === "xpace" && xpaceDado)) pistas.set(k, v);
    }
  }
  const facts = hintFacts(screen, pistas);
  await enrichFacts(facts, { ...env, ACCESS: soloLectura(env.ACCESS) }, swallow);
  return { facts, autorretrato: !!meta };
}

// ── Ruta ────────────────────────────────────────────────────────────────────────────────────────────────────────
export async function onRequestGet({ request, env = {}, waitUntil }) {
  const q = new URL(request.url).searchParams;
  const screen = cleanScreen(q.get("screen"));
  if (!screen) return json({ ok: false, error: "bad_screen" }, 400);
  let at = Date.now();
  if (q.get("at")) {
    const raw = q.get("at"), parsed = /^\d{10,14}$/.test(raw) ? Number(raw) : Date.parse(raw);
    if (!Number.isFinite(parsed)) return json({ ok: false, error: "bad_at" }, 400);
    at = parsed;
  }
  const auth = await autorizar(request, env, screen);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
  const db = env.PROGRAMACION_DB;
  if (!db || typeof db.prepare !== "function" || typeof db.batch !== "function") return json({ ok: false, error: "programacion_db_no_configurada" }, 503);

  // La única lectura de la D1 en cada consulta: la versión. Sin esquema (migración sin aplicar) no hay nada que servir.
  let meta;
  try { meta = await leerMeta(db); } catch (e) { console.error("programacion: meta", e); meta = null; }
  if (!meta) return json({ ok: false, error: "programacion_db_sin_esquema" }, 503);

  const swallow = p => { try { if (typeof waitUntil === "function") waitUntil(Promise.resolve(p).catch(() => {})); } catch (_) {} };
  let circuitos, cand, yo, parrilla, stock;
  try {
    [circuitos, yo, parrilla, stock] = await Promise.all([
      deVersion(meta.version, "circuitos", () => listarCircuitos(db)),
      identidad(env, screen, q, swallow),
      parrillaDe(screen, at),
      loadStock().catch(() => []),
    ]);
    // Candidatas por etiquetas y por hora: pedidas desde el inicio de la hora con una hora más de horizonte, valen para
    // cualquier T de esa hora (el resolver filtra lo que de verdad cubre T).
    const screenTags = etiquetasDe(yo.facts, circuitos.valor), tramo = Math.floor(at / HORA_MS) * HORA_MS;
    cand = await deVersion(meta.version, `candidatas:${tramo}:${screenTags.join(",")}`,
      () => candidatas(db, screenTags, { ahora: tramo, horizonteMs: HORIZONTE_MS + HORA_MS, atrasMs: MANDO_MAX_MS }));
    cand.screenTags = screenTags;
  } catch (e) {
    console.error("programacion: lectura", e);
    return json({ ok: false, error: "programacion_lectura_fallida" }, 503);
  }

  const tag = String(q.get("tag") || "").trim().slice(0, 80);
  const r = resolver({
    ahora: at, facts: yo.facts, screenTags: cand.screenTags, circuitos: circuitos.valor,
    asignaciones: cand.valor.asignaciones, playlists: cand.valor.playlists, stock, parrilla,
    mando: tag ? { tipo: "hashtag", valor: tag, desde: at } : null,
  });
  return json({
    ok: true, screen, at: new Date(at).toISOString(), ahora: Math.abs(at - Date.now()) < 120_000, publico: !!auth.publico,
    version: meta.version, motor: String((meta.banderas && meta.banderas.motor) || "apagado"),
    memoria: circuitos.acierto && cand.acierto ? "acierto" : "fallo",
    ...r,
    lecturas: { parrilla: parrilla.map(d => d.date), stock: stock.length, autorretrato: yo.autorretrato },
  });
}

// Mismo patrón que /api/emision: GET lo atiende onRequestGet; cualquier otro método, 405.
export function onRequest() {
  return new Response(null, { status: 405, headers: authHeaders({ Allow: "GET" }) });
}
