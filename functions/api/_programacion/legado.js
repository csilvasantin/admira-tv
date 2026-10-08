// PUENTE CON EL LEGADO EN KV (modelo único de playlists, E2 · 8-oct-2026). Puro.
//
// Traduce lo que hoy guarda playlist.js en el KV ACCESS al modelo único, sin perder lo que sale por antena:
//   · admira-tv:playlist:default:v1:<pantalla>  (piezas puestas a mano)  → playlist fija + asignación DIRECTA a
//     pantalla:<id>, por_defecto · sustituye. Un borrador vacío no se traduce: hoy no manda nada.
//   · admira-tv:playlist:live:v1                (playlists vivas)        → playlist viva + asignación por su destino,
//     por_defecto · fusiona. El documento las guarda en orden y hoy se funden en ese orden; para que el orden K lo
//     conserve, la primera recibe más `peso` (N, N-1, …). Es el uso previsto del peso como válvula de escape.
//   · sus circuitos definidos pasan tal cual (mismo formato que cleanCircuit).
// Lo usan las pruebas de paridad; lo usarán el importador (E5) y el modo sombra (E6).

import { limpiarAsignacion, limpiarPlaylist, slugId } from "./modelo.js";

export function desdeBorrador(draft) {
  const screen = slugId(draft && draft.screen), items = Array.isArray(draft && draft.items) ? draft.items : [];
  if (!screen || !items.length) return null;
  const id = "defecto-" + screen;
  const playlist = limpiarPlaylist({ id, nombre: String(draft.name || "Por defecto"), tipo: "fija", items, origen: "legado:kv-default" });
  const asignacion = limpiarAsignacion({ id, playlist_id: id, nombre: playlist.nombre, destino: { all: ["pantalla:" + screen] },
    capa: "por_defecto", mezcla: "sustituye", ref_externa: "kv:default:" + screen });
  return { playlist: { ...playlist, actualizado_en: Number(draft.updatedAt) || 0 }, asignacion: { ...asignacion, actualizado_en: Number(draft.updatedAt) || 0 } };
}

export function desdeVivas(live) {
  const lista = Array.isArray(live && live.playlists) ? live.playlists.filter(p => p && p.id) : [];
  const playlists = [], asignaciones = [];
  lista.forEach((p, i) => {
    const id = slugId("viva-" + p.id);
    playlists.push({ ...limpiarPlaylist({ id, nombre: p.name || p.id, tipo: "viva", reglas: [p.content], origen: "legado:kv-viva" }), actualizado_en: Number(p.updatedAt) || 0 });
    asignaciones.push({ ...limpiarAsignacion({ id, playlist_id: id, nombre: p.name || p.id, destino: p.target, capa: "por_defecto", mezcla: "fusiona",
      peso: lista.length - i, estado: p.enabled === false ? "pausada" : "activa", ref_externa: "kv:viva:" + p.id }), actualizado_en: Number(p.updatedAt) || 0 });
  });
  return { playlists, asignaciones, circuitos: Array.isArray(live && live.circuits) ? live.circuits : [] };
}

/** Todo el legado de golpe: {borradores: [draft…], live} → {playlists, asignaciones, circuitos}. */
export function desdeLegado({ borradores = [], live = null } = {}) {
  const vivas = desdeVivas(live), playlists = [...vivas.playlists], asignaciones = [...vivas.asignaciones];
  for (const d of borradores) { const r = desdeBorrador(d); if (r) { playlists.push(r.playlist); asignaciones.push(r.asignacion); } }
  return { playlists, asignaciones, circuitos: vivas.circuitos };
}
