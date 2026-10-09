// MODO SOMBRA (E6 · modelo único de playlists, docs/playlists-modelo-unico.md): evaluar, registrar y consultar.
//
// EVALUAR. Para una pantalla, ahora, con lo que acaba de recibir su player (la respuesta de /api/playlist):
//   · el motor nuevo: lecturasDe + resolverCon de programacion.js, las mismas lecturas y la misma memoria que
//     GET /api/programacion, con las pistas del propio player (w, h, lang…);
//   · el legado: decide() de _emision.js con la misma foto que /api/emision —orquestación (/api/playout en proceso,
//     KV de solo lectura), modo remoto, lo que la pantalla informa, sincro y /stock/list—, pero con el «Por defecto»
//     que de verdad recibió el player y con el MISMO día de /grid/day que leyó el motor nuevo: los dos lados miran la
//     misma parrilla y no aparecen diferencias por leerla en momentos distintos;
//   · comparador.js decide el veredicto.
// Lo de fuera que es igual para todas las pantallas (/stock/list, la sincro, el estado de orquestación) se recuerda
// 60 s en esta instancia.
//
// REGISTRAR. Una fila por pantalla en la tabla `sombra` (0001.sql). Su clave es (pantalla, en), con `en` = desde
// cuándo dura el veredicto actual, y se mantiene una sola fila por pantalla (borrar + insertar en un db.batch):
//   · primera vez o cambio de veredicto, de motivo o de una firma → se reescribe (2 sentencias; la anterior queda
//     resumida en detalle.anterior y se cuentan los cambios);
//   · sin cambios → nada, salvo renovar detalle.ultima (la última comprobación) si tiene más de una hora (1 sentencia);
//   · además, un fusible por instancia: como mucho MAX_ESCRITURAS_HORA sentencias de escritura por hora.
// Columnas: coincide 1 igual · 2 equivalente · 0 distinta (comparador.COINCIDE), capa = la del motor nuevo, version =
// meta.version al cambiar, firma_legado / firma_nueva = las firmas cortas, detalle = el resto (sin emails).
//
// CONSULTAR. listarSombra y cuentasSombra, para GET /api/programacion/sombra y el panel /programacion/sombra/.
import { onRequestGet as playoutGet } from "../playout.js";
import { modoDe, soloLectura } from "../emision.js";
import { XTORE_MUSIC_SCREEN, decide, madridClock } from "../_emision.js";
import { lecturasDe, resolverCon } from "../programacion.js";
import { leerMeta } from "./almacen.js";
import { COINCIDE, VEREDICTO_DE, comparar } from "./comparador.js";

const API = "https://api.admira.store";
const STOCK_LIST = API + "/stock/list?limit=300";   // el MISMO índice que lee canal.html (y /api/emision)
export const LATIDO_MS = 3_600_000;                  // la última comprobación se renueva como mucho una vez por hora
export const MEMORIA_MS = 60_000;
export const MAX_ESCRITURAS_HORA = 240;              // fusible por instancia (sentencias de escritura)
const MAX_MEMORIA = 500;

// ── Memoria corta de lo de fuera ────────────────────────────────────────────────────────────────────────────────
const memoria = new Map();
const recorta = mapa => { for (const k of mapa.keys()) { if (mapa.size <= MAX_MEMORIA) break; mapa.delete(k); } };
/** GET JSON con memoria de 60 s por URL. Un fallo (null) no se recuerda. */
function leer(url, ms = 4500) {
  const hit = memoria.get(url);
  if (hit && Date.now() - hit.en < MEMORIA_MS) return hit.p;
  const p = fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(ms) })
    .then(r => (r.ok ? r.json() : null)).catch(() => null);
  const entrada = { en: Date.now(), p };
  memoria.set(url, entrada); recorta(memoria);
  p.then(v => { if (v == null && memoria.get(url) === entrada) memoria.delete(url); });
  return p;
}
/** KV de solo lectura con la misma memoria: el estado de orquestación es uno para toda la flota. */
function kvSombra(kv) {
  const ro = soloLectura(kv);
  if (!ro) return ro;
  return { ...ro, get: (k, ...a) => {
    const clave = "kv:" + k, hit = memoria.get(clave);
    if (hit && Date.now() - hit.en < MEMORIA_MS) return hit.p;
    const p = Promise.resolve(ro.get(k, ...a)).catch(() => null), entrada = { en: Date.now(), p };
    memoria.set(clave, entrada); recorta(memoria);
    return p;
  } };
}
let presupuesto = { hora: -1, usadas: 0 };
/** Para las pruebas: olvida la memoria de lo de fuera y el fusible de escrituras. */
export function olvidarMemoriaSombra() { memoria.clear(); presupuesto = { hora: -1, usadas: 0 }; }
function gastar(n, ahora) {
  const hora = Math.floor(ahora / 3_600_000);
  if (presupuesto.hora !== hora) presupuesto = { hora, usadas: 0 };
  if (presupuesto.usadas + n > MAX_ESCRITURAS_HORA) return false;
  presupuesto.usadas += n;
  return true;
}

// ── Evaluar ─────────────────────────────────────────────────────────────────────────────────────────────────────
const tagVal = (tags, k) => { const t = (tags || []).find(x => String(x).startsWith(k + ":")); return t ? String(t).slice(k.length + 1) : ""; };

/** La decisión del legado para la pantalla, como /api/emision, con el «Por defecto» que recibió el player y su `dia`. */
export async function decisionLegado({ env = {}, screen, at, q, borrador, dia }) {
  const ro = { ...env, ACCESS: kvSombra(env.ACCESS) };
  const [plan, stockResp, now] = await Promise.all([
    playoutGet({ request: new Request("https://admira.tv/api/playout?screen=" + encodeURIComponent(screen)), env: ro })
      .then(r => (r && typeof r.json === "function" ? r.json() : null)).catch(() => null),
    leer(STOCK_LIST, 6000),
    leer(API + "/signage/now?screen=" + encodeURIComponent(screen)),
  ]);
  const { mode, sync } = await modoDe({ screen, q, plan, now, ahora: true, leer });
  const tags = Array.isArray(borrador && borrador.screenTags) ? borrador.screenTags : [];
  const w = Number(q.get("w")) || 0, h = Number(q.get("h")) || 0;
  return decide({
    screen, at, circuit: String((dia && dia.config && dia.config.circuit) || tagVal(tags, "circuito") || ""),
    xtoreMusic: screen === XTORE_MUSIC_SCREEN, playout: plan, liveTag: "", liveTagSource: "desconocido",
    draft: borrador && borrador.ok ? borrador : null, grid: dia && dia.ok ? dia : null,
    stock: (stockResp && (stockResp.items || stockResp)) || [], sync, mode, tech: {}, screenDims: w && h ? { w, h, source: "player" } : {},
  });
}

/** Los dos lados y el veredicto para una pantalla en `at` (sin escribir nada). */
export async function evaluarSombra({ env = {}, db, meta, screen, q, borrador, at = Date.now(), waitUntil }) {
  const l = await lecturasDe({ env, db, meta, screen, at, q, waitUntil });
  const hoy = madridClock(at).date, dia = l.parrilla.find(d => d && d.date === hoy) || null;
  const legado = await decisionLegado({ env, screen, at, q, borrador, dia });
  const res = comparar({ at, nuevo: resolverCon(l, at), legado, borrador, dia, parrilla: l.parrilla });
  res.detalle.lecturas = { parrilla: l.parrilla.map(d => d.date), stock: l.stock.length };
  return res;
}

/** Lo que encarga el gancho: relee la bandera (fresca), evalúa y registra. */
export async function evaluarYGuardar({ env = {}, db, waitUntil, screen, q, borrador, at = Date.now() }) {
  const meta = await leerMeta(db);
  if (!(meta && meta.banderas && meta.banderas.sombra === true)) return { hecho: "apagada" };
  const res = await evaluarSombra({ env, db, meta, screen, q, borrador, at, waitUntil });
  const g = await guardarSombra(db, screen, res, { ahora: at, version: meta.version });
  return { hecho: g.accion, veredicto: res.veredicto, motivo: res.motivo };
}

// ── Registrar ───────────────────────────────────────────────────────────────────────────────────────────────────
const leerJson = t => { try { const v = JSON.parse(t || "{}"); return v && typeof v === "object" ? v : {}; } catch (_) { return {}; } };

/**
 * Registra el resultado de comparar() para la pantalla. Devuelve {accion}: primera · cambio · latido · nada ·
 * sin_presupuesto (el fusible de esta instancia está agotado: no se escribe y se vuelve a intentar en otra evaluación).
 */
export async function guardarSombra(db, pantalla, res, { ahora = Date.now(), version = 0 } = {}) {
  const fila = await db.prepare("SELECT pantalla, en, version, firma_legado, firma_nueva, coincide, capa, detalle FROM sombra WHERE pantalla = ? ORDER BY en DESC LIMIT 1")
    .bind(pantalla).first();
  const antes = fila ? leerJson(fila.detalle) : null;
  if (fila && fila.firma_legado === res.firmaLegado && fila.firma_nueva === res.firmaNueva && Number(fila.coincide) === res.coincide && antes.motivo === res.motivo) {
    if (ahora - (Number(antes.ultima) || Number(fila.en) || 0) < LATIDO_MS) return { accion: "nada" };
    if (!gastar(1, ahora)) return { accion: "sin_presupuesto" };
    await db.prepare("UPDATE sombra SET detalle = json_set(detalle, '$.ultima', ?) WHERE pantalla = ? AND en = ?").bind(ahora, pantalla, fila.en).run();
    return { accion: "latido" };
  }
  if (!gastar(2, ahora)) return { accion: "sin_presupuesto" };
  const detalle = {
    ...res.detalle, primera: fila ? (Number(antes.primera) || Number(fila.en)) : ahora, ultima: ahora,
    cambios: fila ? (Number(antes.cambios) || 0) + 1 : 0,
    anterior: fila ? { veredicto: VEREDICTO_DE[Number(fila.coincide)] || "distinta", motivo: String(antes.motivo || ""), capa: fila.capa,
      firmas: { legado: fila.firma_legado, nuevo: fila.firma_nueva }, desde: Number(fila.en), hasta: ahora } : null,
  };
  // Una sola fila por pantalla: si dos instancias escriben a la vez, la última deja la suya y ninguna se duplica.
  await db.batch([
    db.prepare("DELETE FROM sombra WHERE pantalla = ?").bind(pantalla),
    db.prepare("INSERT OR REPLACE INTO sombra (pantalla, en, version, firma_legado, firma_nueva, coincide, capa, detalle) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(pantalla, ahora, Number(version) || 0, res.firmaLegado, res.firmaNueva, res.coincide, String(res.capa || ""), JSON.stringify(detalle)),
  ]);
  return { accion: fila ? "cambio" : "primera" };
}

// ── Consultar ───────────────────────────────────────────────────────────────────────────────────────────────────
const filas = r => (r && Array.isArray(r.results) ? r.results : []);
/** Una fila de `sombra` como la sirve la API (sin nada que identifique a una persona). */
export function filaSombra(f) {
  const d = leerJson(f.detalle);
  return {
    pantalla: f.pantalla, veredicto: VEREDICTO_DE[Number(f.coincide)] || "distinta", motivo: String(d.motivo || ""), capa: f.capa,
    version: Number(f.version) || 0, firmas: { legado: f.firma_legado, nuevo: f.firma_nueva },
    desde: Number(f.en), primera: Number(d.primera) || Number(f.en), ultima: Number(d.ultima) || Number(f.en), cambios: Number(d.cambios) || 0,
    legado: d.legado || null, nuevo: d.nuevo || null, diferencia: d.diferencia || null, anterior: d.anterior || null, lecturas: d.lecturas || null,
  };
}
/** Filas de la más reciente (por `en`, desde cuándo dura su veredicto) a la más antigua. `antes` = {en, pantalla}. */
export async function listarSombra(db, { veredicto = null, motivo = null, pantalla = null, antes = null, limite = 50 } = {}) {
  const where = [], binds = [];
  if (veredicto) { where.push("coincide = ?"); binds.push(COINCIDE[veredicto]); }
  if (motivo) { where.push("json_extract(detalle, '$.motivo') = ?"); binds.push(motivo); }
  if (pantalla) { where.push("pantalla = ?"); binds.push(pantalla); }
  if (antes) { where.push("(en < ? OR (en = ? AND pantalla > ?))"); binds.push(antes.en, antes.en, antes.pantalla); }
  const sql = "SELECT * FROM sombra" + (where.length ? " WHERE " + where.join(" AND ") : "") + " ORDER BY en DESC, pantalla LIMIT ?";
  return filas(await db.prepare(sql).bind(...binds, Math.max(1, Math.min(1000, Number(limite) || 50))).all()).map(filaSombra);
}
/** Cuántas pantallas hay en cada veredicto y en cada motivo. */
export async function cuentasSombra(db) {
  const rs = filas(await db.prepare("SELECT coincide, json_extract(detalle, '$.motivo') AS motivo, COUNT(*) AS n FROM sombra GROUP BY coincide, motivo ORDER BY coincide, n DESC").all());
  const cuentas = { igual: 0, equivalente: 0, distinta: 0, total: 0 }, motivos = [];
  for (const r of rs) {
    const v = VEREDICTO_DE[Number(r.coincide)] || "distinta", n = Number(r.n) || 0;
    cuentas[v] += n; cuentas.total += n;
    motivos.push({ veredicto: v, motivo: String(r.motivo || ""), n });
  }
  return { cuentas, motivos };
}
