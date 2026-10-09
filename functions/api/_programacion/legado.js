// PUENTE CON EL LEGADO EN KV (modelo único de playlists, E2 · 8-oct-2026). Puro.
//
// Traduce lo que hoy guarda playlist.js en el KV ACCESS al modelo único, sin perder lo que sale por antena:
//   · admira-tv:playlist:default:v1:<pantalla>  (piezas puestas a mano)  → playlist fija + asignación DIRECTA a
//     pantalla:<id>, por_defecto · sustituye. Un borrador vacío no se traduce: hoy no manda nada.
//   · admira-tv:playlist:live:v1                (playlists vivas)        → playlist viva + asignación por su destino,
//     por_defecto · fusiona. El documento las guarda en orden y hoy se funden en ese orden; para que el orden K lo
//     conserve, la primera recibe más `peso` (N, N-1, …). Es el uso previsto del peso como válvula de escape.
//   · sus circuitos definidos pasan tal cual (mismo formato que cleanCircuit).
// Lo usan las pruebas de paridad, el importador (E5, importador.js) y el espejo (E7, espejo.js); lo usará el modo
// sombra (E6).
//
// IDS DE LAS FUENTES LARGAS (E7, decisión de Carlos del 9-oct-2026). Un id del modelo tiene 60 caracteres como mucho
// (slugId). defecto-<pantalla> y viva-<id> se pasan de 60 con pantallas de más de 52 caracteres (cleanScreen admite 80)
// o vivas de más de 55, y el recorte daba el mismo id a dos fuentes con el mismo principio. idLegado() lo evita: si el
// id entero cabe, es el de siempre (los ids cortos no cambian); si no, se recorta y se le añade «-» + 8 hexadecimales
// del SHA-256 del id entero, que no cambia de una pasada a otra. La ref_externa de un borrador lleva la pantalla entera
// por lo mismo (con más de 60 caracteres, la recortada coincidía). Importador y espejo usan las mismas funciones.

import { sha256Hex } from "./huella.js";
import { MAX_DESTINO_ALL, limpiarAsignacion, limpiarPlaylist, slugId } from "./modelo.js";

export const MAX_ID = 60, HUELLA = 8;
/**
 * slugId sin el recorte a 60: la misma forma (sin tildes, minúsculas, lo que no es [a-z0-9] → «-», sin guiones en los
 * bordes). Si cabe en 60, es exactamente slugId (lo comprueban las pruebas).
 */
export const slugEntero = v => String(v == null ? "" : v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
/** El id de una fuente del legado (prefijo + fuente): el de slugId si cabe; si no, recortado + «-» + huella estable. */
export function idLegado(prefijo, fuente) {
  const entero = slugEntero(String(prefijo) + String(fuente == null ? "" : fuente));
  if (entero.length <= MAX_ID) return slugId(String(prefijo) + String(fuente == null ? "" : fuente));
  return entero.slice(0, MAX_ID - HUELLA - 1).replace(/-+$/, "") + "-" + sha256Hex(entero).slice(0, HUELLA);
}
/** Playlist y asignación del borrador «Por defecto» de una pantalla. */
export const idDefecto = pantalla => idLegado("defecto-", pantalla);
/** Playlist y asignación de una viva. */
export const idViva = id => idLegado("viva-", id);
/** ref_externa del borrador de una pantalla, con la pantalla entera. */
export const refDefecto = pantalla => "kv:default:" + slugEntero(pantalla);

export function desdeBorrador(draft) {
  const screen = slugId(draft && draft.screen), items = Array.isArray(draft && draft.items) ? draft.items : [];
  if (!screen || !items.length) return null;
  const id = idDefecto(draft.screen);
  const playlist = limpiarPlaylist({ id, nombre: String(draft.name || "Por defecto"), tipo: "fija", items, origen: "legado:kv-default" });
  // El destino es la etiqueta de pantalla de hoy (screenTag, que recorta a 60); la identidad (id y ref), la entera.
  const asignacion = limpiarAsignacion({ id, playlist_id: id, nombre: playlist.nombre, destino: { all: ["pantalla:" + screen] },
    capa: "por_defecto", mezcla: "sustituye", ref_externa: refDefecto(draft.screen) });
  return { playlist: { ...playlist, actualizado_en: Number(draft.updatedAt) || 0 }, asignacion: { ...asignacion, actualizado_en: Number(draft.updatedAt) || 0 } };
}

/** Las vivas que cuentan, en el orden del documento (las que no tienen id no se guardan ni se traducen). */
export const vivasDe = live => (Array.isArray(live && live.playlists) ? live.playlists.filter(p => p && p.id) : []);

/** Una viva (la i-ésima de `total`) → {playlist, asignacion}. Lanza Error con el código si no es traducible. */
export function desdeViva(p, i, total) {
  const id = idViva(p.id);
  const playlist = { ...limpiarPlaylist({ id, nombre: p.name || p.id, tipo: "viva", reglas: [p.content], origen: "legado:kv-viva" }), actualizado_en: Number(p.updatedAt) || 0 };
  const asignacion = { ...limpiarAsignacion({ id, playlist_id: id, nombre: p.name || p.id, destino: p.target, capa: "por_defecto", mezcla: "fusiona",
    peso: total - i, estado: p.enabled === false ? "pausada" : "activa", ref_externa: "kv:viva:" + p.id }), actualizado_en: Number(p.updatedAt) || 0 };
  return { playlist, asignacion };
}

export function desdeVivas(live) {
  const lista = vivasDe(live), playlists = [], asignaciones = [];
  lista.forEach((p, i) => { const r = desdeViva(p, i, lista.length); playlists.push(r.playlist); asignaciones.push(r.asignacion); });
  return { playlists, asignaciones, circuitos: Array.isArray(live && live.circuits) ? live.circuits : [] };
}

/**
 * Un circuito definido del KV (forma de cleanCircuit: {id, name, enabled, target}) → la forma del almacén
 * ({id, nombre, destino, activo}), sin perder pantallas. El editor de hoy (/parrilla/) guarda el destino entero en
 * `target.all` y cleanCircuit admite 200, pero el modelo acota `all` a MAX_DESTINO_ALL (48). Con `any` vacío, la
 * faceta más larga de `all` se pasa a `any`, que significa lo mismo: «una de estas» y, aparte, todas las demás
 * facetas. Si aun así no cabe, se devuelve tal cual y el importador lo detecta (ver importador.js) en vez de recortarlo.
 */
export function circuitoDesdeLegado(c) {
  const t = (c && c.target) || {}, all = Array.isArray(t.all) ? [...t.all] : [], any = Array.isArray(t.any) ? [...t.any] : [];
  let destino = { all, any };
  if (all.length > MAX_DESTINO_ALL && !any.length) {
    const facetas = new Map();
    for (const tag of all) { const k = String(tag).split(":")[0]; facetas.set(k, [...(facetas.get(k) || []), tag]); }
    const [mayor] = [...facetas.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    destino = { all: all.filter(tag => String(tag).split(":")[0] !== mayor), any: facetas.get(mayor) };
  }
  return { id: c && c.id, nombre: (c && (c.name || c.nombre)) || "", destino, activo: !!c && (c.enabled ?? c.activo) !== false };
}

/** Todo el legado de golpe: {borradores: [draft…], live} → {playlists, asignaciones, circuitos}. */
export function desdeLegado({ borradores = [], live = null } = {}) {
  const vivas = desdeVivas(live), playlists = [...vivas.playlists], asignaciones = [...vivas.asignaciones];
  for (const d of borradores) { const r = desdeBorrador(d); if (r) { playlists.push(r.playlist); asignaciones.push(r.asignacion); } }
  return { playlists, asignaciones, circuitos: vivas.circuitos };
}
