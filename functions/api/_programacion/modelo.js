// MODELO ÚNICO DE PLAYLISTS (E1–E2 · 8-oct-2026): vocabulario, validación y el orden K. Puro.
//
//   Playlist   = QUÉ se emite: fija (piezas a mano), viva (reglas contra el Stock) o mixta (piezas y huecos).
//   Asignación = A DÓNDE y CUÁNDO: destino por etiquetas de pantalla, programación en hora de Madrid, capa y mezcla.
//
// Capas, de más a menos fuerza: emergencia 500 > pagada 400 > propia 300 > por_defecto 200 > relleno 100.
// Mezclas: sustituye (es la base, sola) · fusiona (es la base, junto a las demás que fusionan) · anade (se pega
// detrás de la base si su capa es igual o mayor) · intercala (spot: se teje cada `cadencia` piezas de la base).
// `anade` se guarda sin eñe para no depender de la codificación en SQL y en URLs; se acepta «añade» al entrar.

import { cleanLive, screenTag } from "../_playlist-live.js";
import { limpiarProgramacion, rangoUtc } from "./horario.js";

export const CAPAS = Object.freeze({ emergencia: 500, pagada: 400, propia: 300, por_defecto: 200, relleno: 100 });
export const MEZCLAS = Object.freeze(["sustituye", "fusiona", "anade", "intercala"]);
export const TIPOS = Object.freeze(["fija", "viva", "mixta"]);
export const ESTADOS = Object.freeze(["borrador", "activa", "pausada", "archivada"]);
export const MAX_ITEMS = 200, MAX_REGLAS = 12, MAX_REVISIONES = 50, CADENCIA_DEFECTO = 4;
export const MAX_DESTINO_ALL = 48, MAX_DESTINO_ANY = 500;

const texto = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
const entero = (v, min, max, def) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def; };
/**
 * Identificador estable en minúsculas y guiones (la misma forma que las etiquetas de pantalla). El guion final que
 * deja el recorte a 60 se quita: sin eso, un nombre largo daba un id acabado en «-» que slugId no reproducía al
 * actualizar (slugId(slugId(x)) !== slugId(x)) y la fila ya no se podía guardar.
 */
export const slugId = v => screenTag(String(v == null ? "" : v).replace(/:/g, "-")).slice(0, 60).replace(/-+$/, "");
const nuevoId = prefijo => prefijo + "-" + (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Date.now().toString(36));

// ── Destino ─────────────────────────────────────────────────────────────────────────────────────────────────────
const tagList = (raw, max) => [...new Set((Array.isArray(raw) ? raw : []).map(screenTag).filter(Boolean))].slice(0, max);
/** Destino con la sintaxis de targetMatches: OR dentro de cada faceta de `all`, AND entre facetas, y `any` aparte. */
export function limpiarDestino(raw) {
  const destino = { all: tagList(raw && raw.all, MAX_DESTINO_ALL), any: tagList(raw && raw.any, MAX_DESTINO_ANY) };
  if (!destino.all.length && !destino.any.length) throw new Error("destino_requerido");
  return destino;
}
/** Directa = el destino nombra sólo pantallas concretas (pantalla:…): es lo puesto a mano a esa pantalla. */
export function esDirecta(destino) {
  const tags = [...((destino && destino.all) || []), ...((destino && destino.any) || [])];
  return tags.length > 0 && tags.every(t => String(t).startsWith("pantalla:"));
}

// ── Playlist ────────────────────────────────────────────────────────────────────────────────────────────────────
/** Regla de contenido viva: la MISMA forma y los mismos límites que cleanLive (_playlist-live.js). */
export function limpiarRegla(raw) {
  try { return cleanLive({ name: "regla", content: raw || {}, target: { any: ["todas"] } }).content; }
  catch (_) { throw new Error("regla_sin_contenido"); }
}
/** Pieza fija: el mismo saneado que la playlist «Por defecto» de hoy (cleanItem de playlist.js). */
export function limpiarPieza(raw, index = 0) {
  if (!raw || typeof raw !== "object") return null;
  const asset = texto(raw.asset || raw.url, 1000);
  if (!/^https:\/\//i.test(asset)) return null;
  const tipoFuente = String(raw.assetType || raw.type || "image").toLowerCase();
  const assetType = ["video", "animation"].includes(tipoFuente) ? "video" : ["audio", "music", "locucion"].includes(tipoFuente) ? "audio" : "image";
  const tags = Array.isArray(raw.tags) ? raw.tags.map(t => texto(t, 80)).filter(Boolean).slice(0, 32) : [];
  return { tipo: "pieza", id: texto(raw.id || raw.stockId || `item-${index + 1}`, 160), stockId: texto(raw.stockId, 160),
    title: texto(raw.title || `Contenido ${index + 1}`, 240), sub: texto(raw.sub, 300), lane: raw.lane === "municipal" ? "municipal" : "publicidad",
    seconds: Math.max(2, Math.min(600, Number(raw.seconds) || 10)), asset, assetType, tags };
}
function limpiarHueco(raw, reglas) {
  const cuantas = entero(raw.cuantas, 1, 50, 1);
  if (raw.regla == null && reglas.length) return { tipo: "hueco", regla: 0, cuantas };   // sin decir cuál: la primera
  if (typeof raw.regla === "number") {
    if (!Number.isInteger(raw.regla) || raw.regla < 0 || raw.regla >= reglas.length) throw new Error("hueco_regla_inexistente");
    return { tipo: "hueco", regla: raw.regla, cuantas };
  }
  return { tipo: "hueco", regla: limpiarRegla(raw.regla), cuantas };
}
/** Playlist saneada (sin rev ni sellos: los pone el almacén). Lanza Error con el código del problema. */
export function limpiarPlaylist(raw) {
  if (!raw || typeof raw !== "object") throw new Error("playlist_invalida");
  const nombre = texto(raw.nombre || raw.name, 80);
  if (!nombre) throw new Error("nombre_requerido");
  const id = slugId(raw.id || nombre);
  if (!id) throw new Error("id_invalido");
  const tipo = raw.tipo == null ? "fija" : String(raw.tipo);
  if (!TIPOS.includes(tipo)) throw new Error("tipo_invalido");
  const reglasRaw = raw.reglas == null ? [] : raw.reglas;
  if (!Array.isArray(reglasRaw) || reglasRaw.length > MAX_REGLAS) throw new Error("reglas_invalidas");
  const reglas = reglasRaw.map(limpiarRegla);
  const itemsRaw = raw.items == null ? [] : raw.items;
  if (!Array.isArray(itemsRaw)) throw new Error("items_invalidos");
  if (itemsRaw.length > MAX_ITEMS) throw new Error("demasiados_items");
  if (tipo === "fija" && itemsRaw.some(it => it && it.tipo === "hueco")) throw new Error("hueco_en_fija");
  const items = itemsRaw.map((it, i) => {
    if (it && it.tipo === "hueco") return limpiarHueco(it, reglas);
    const p = limpiarPieza(it, i);
    if (!p) throw new Error("pieza_invalida");
    return p;
  });
  const huecos = items.filter(i => i.tipo === "hueco").length;
  if (tipo === "fija" && (huecos || reglas.length)) throw new Error(huecos ? "hueco_en_fija" : "reglas_en_fija");
  if (tipo === "viva" && !reglas.length) throw new Error("viva_sin_reglas");
  if (tipo === "viva" && items.length) throw new Error("items_en_viva");
  const o = raw.opciones && typeof raw.opciones === "object" ? raw.opciones : {};
  const opciones = { exacta: o.exacta === true, segundos: entero(o.segundos, 2, 600, 10) };
  const reglaDe = h => (typeof h.regla === "number" ? reglas[h.regla] : h.regla);
  const duracion_s = items.reduce((s, it) => s + (it.tipo === "pieza" ? it.seconds : it.cuantas * reglaDe(it).seconds), 0);
  return { id, nombre, proyecto: slugId(raw.proyecto), tipo, items, reglas, opciones, duracion_s, origen: texto(raw.origen || "manual", 80) };
}

// ── Asignación ──────────────────────────────────────────────────────────────────────────────────────────────────
export function normalizarMezcla(v) {
  const m = String(v || "").trim().toLowerCase().replace("ñ", "n");
  return MEZCLAS.includes(m) ? m : "";
}
/** Asignación saneada, con directa, prioridad e inicio_utc/fin_utc ya calculados. Lanza Error con el código. */
export function limpiarAsignacion(raw) {
  if (!raw || typeof raw !== "object") throw new Error("asignacion_invalida");
  const playlist_id = slugId(raw.playlist_id || raw.playlist);
  if (!playlist_id) throw new Error("playlist_requerida");
  const destino = limpiarDestino(raw.destino), directa = esDirecta(destino);
  const capa = raw.capa == null ? "por_defecto" : String(raw.capa);
  if (!(capa in CAPAS)) throw new Error("capa_invalida");
  // Sin mezcla dicha: lo puesto a una pantalla sustituye; lo que llega por grupos se fusiona (decisión 3 de Carlos).
  const mezcla = raw.mezcla == null ? (directa ? "sustituye" : "fusiona") : normalizarMezcla(raw.mezcla);
  if (!mezcla) throw new Error("mezcla_invalida");
  const estado = raw.estado == null ? "activa" : String(raw.estado);
  if (!ESTADOS.includes(estado)) throw new Error("estado_invalido");
  const prog = limpiarProgramacion(raw);
  return {
    id: slugId(raw.id) || nuevoId("asg"), playlist_id, nombre: texto(raw.nombre, 80), proyecto: slugId(raw.proyecto),
    destino, directa, ...prog, ...rangoUtc(prog),
    capa, prioridad: CAPAS[capa], peso: entero(raw.peso, -1000, 1000, 0), mezcla,
    cadencia: mezcla === "intercala" && raw.cadencia != null ? entero(raw.cadencia, 1, 50, CADENCIA_DEFECTO) : null,
    estado, ref_externa: texto(raw.ref_externa, 160) || null,
  };
}

// ── Orden K ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Desempate dentro de una capa (decisión 3 de Carlos): directa primero; sustituye antes que fusiona; más peso; la
// que empieza más tarde (más específica; sin fecha_desde = la más antigua); la editada más recientemente; id.
const rangoMezcla = m => (m === "sustituye" ? 0 : m === "fusiona" ? 1 : 2);
export function ordenK(a, b) {
  return (Number(!!b.directa) - Number(!!a.directa))
    || (rangoMezcla(a.mezcla) - rangoMezcla(b.mezcla))
    || ((Number(b.peso) || 0) - (Number(a.peso) || 0))
    || String(b.fecha_desde || "").localeCompare(String(a.fecha_desde || ""))
    || ((Number(b.actualizado_en) || 0) - (Number(a.actualizado_en) || 0))
    || String(a.id).localeCompare(String(b.id));
}
