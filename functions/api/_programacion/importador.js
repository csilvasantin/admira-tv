// IMPORTADOR DEL LEGADO (E5 · modelo único de playlists, docs/playlists-modelo-unico.md). Puro: sin red, sin KV, sin D1.
//
// Recibe lo ya leído —el documento de vivas (con sus circuitos), un tramo de borradores «Por defecto» y el estado de la
// D1— y devuelve un PLAN: por cada entidad, crear, actualizar (sólo si cambia su contenido), igual (idéntica: no se
// toca) u omitir, siempre con el motivo. La traducción es la de legado.js, la misma de las pruebas de paridad.
//
// IDEMPOTENTE POR ref_externa. Cada fuente del KV tiene una referencia estable:
//   · kv:default:<pantalla>  borrador «Por defecto»  → playlist defecto-<pantalla> + asignación directa
//   · kv:viva:<id>           playlist viva           → playlist viva-<id> + asignación por su destino
//   · kv:circuito:<id>       circuito definido       → circuito <id> (la tabla circuito no tiene ref_externa: sólo se
//                                                       usa en el plan y en los huérfanos)
// La asignación se busca por su ref_externa (índice único de 0001.sql); su playlist y el circuito, por el id que da la
// traducción. Se compara el contenido —las columnas que escribe almacen.js, saneadas por modelo.js en los dos lados—:
// si coincide, `igual`; si no, `actualizar` con la `rev` que tiene la fila. Aplicado un plan, el siguiente sale todo
// `igual`.
//
// NO PISA LO AJENO. Una fila con el mismo id que no salió del legado (una playlist sin origen «legado:…», un circuito
// que no creó el importador, una asignación con otra ref_externa) y distinta de lo traducido se `omite` con motivo
// `id_ocupado`; su asignación, con `playlist_omitida`. Lo que sí salió del legado se actualiza aunque alguien lo haya
// editado después por la API: la operación lo avisa en `pisa` (el último actor) para revisarlo en la simulación.
//
// NUNCA BORRA. Lo que está en la D1 y ya no en el KV se informa en `huerfanos`:
//   · viva_eliminada / circuito_eliminado: con el documento de vivas en el tramo;
//   · borrador_vacio, sintetico, ilegible, sin_valor: el borrador del tramo existe, pero hoy no manda nada;
//   · sin_clave_kv: en el último tramo, con la lista completa de pantallas que tienen borrador en el KV.
// Los borradores sintéticos (synthetic: true) no se importan: los compone playlist.js en cada consulta, no se guardan.
import { screenTag } from "../_playlist-live.js";
import { COLUMNAS, limpiarCircuito } from "./almacen.js";
import { circuitoDesdeLegado, desdeBorrador, desdeViva, vivasDe } from "./legado.js";
import { limpiarAsignacion, limpiarPlaylist, slugId } from "./modelo.js";

export const ACTOR = "importador:";
const ORIGEN_LEGADO = "legado:";
export const refBorrador = pantalla => "kv:default:" + slugId(pantalla);
export const refViva = id => "kv:viva:" + id;
export const refCircuito = id => "kv:circuito:" + id;
const REF_BORRADOR = "kv:default:", REF_VIVA = "kv:viva:";
// El id que legado.js da a la playlist de un borrador (slugId recorta a 60: una pantalla larga no cabe entera).
const idDefecto = pantalla => slugId("defecto-" + pantalla);
const ENTIDADES = ["circuito", "playlist", "asignacion"];
const LIMPIAR = { playlist: limpiarPlaylist, asignacion: limpiarAsignacion, circuito: limpiarCircuito };

const deImportador = actor => String(actor || "").startsWith(ACTOR);
const codigo = e => String((e && e.message) || e || "error");
/** JSON con las claves ordenadas: dos contenidos iguales dan el mismo texto aunque se hayan escrito en otro orden. */
function canonico(v) {
  if (Array.isArray(v)) return "[" + v.map(canonico).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + canonico(v[k])).join(",") + "}";
  return JSON.stringify(v === undefined ? null : v);
}
/** Lo comparable de una entidad: sus columnas de contenido, saneadas igual que las guarda el almacén. */
export function contenido(entidad, raw) {
  const limpio = LIMPIAR[entidad](raw);
  return Object.fromEntries(COLUMNAS[entidad].map(c => [c, limpio[c] === undefined ? null : limpio[c]]));
}
function diferencias(entidad, nuevo, fila) {
  let actual;
  try { actual = contenido(entidad, fila); } catch (_) { return [...COLUMNAS[entidad]]; }   // una fila que ya no valida: cambia entera
  return COLUMNAS[entidad].filter(c => canonico(nuevo[c]) !== canonico(actual[c]));
}
const leerJson = v => {
  if (v == null || typeof v === "object") return { valor: v ?? null };
  try { return { valor: JSON.parse(String(v)) }; } catch (_) { return { ilegible: true }; }
};

// ── Traducción ──────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Lo leído del KV → unidades que importar y fuentes omitidas.
 *   live: undefined = este tramo no trae el documento de vivas; null = no hay documento (ni vivas ni circuitos); el
 *         texto del KV o el objeto ya leído. Vale si trae `playlists` como lista (la regla de readLive de playlist.js).
 *   borradores: [{pantalla, clave?, valor}] con `valor` = el texto del KV, el objeto ya leído o null si ya no está.
 */
export function traducir({ live = undefined, borradores = [] } = {}) {
  const unidades = [], omitidas = [], vistas = { ref: new Set(), id: new Set() };
  const omite = (ref, motivo, extra = {}) => omitidas.push({ ref, motivo, ...extra });
  // Una referencia o un id repetidos (dos pantallas que dan el mismo slug, dos vivas largas recortadas a 60…) no se
  // importan dos veces: la segunda se omite.
  const alta = unidad => {
    const ids = ENTIDADES.filter(e => unidad[e]).map(e => e + ":" + unidad[e].id);
    if (vistas.ref.has(unidad.ref)) return omite(unidad.ref, "ref_duplicada", { clave: unidad.clave });
    if (ids.some(i => vistas.id.has(i))) return omite(unidad.ref, "id_duplicado", { clave: unidad.clave });
    vistas.ref.add(unidad.ref); ids.forEach(i => vistas.id.add(i));
    unidades.push(unidad);
  };

  let vivas = "fuera_del_tramo", doc = null;
  if (live !== undefined) {
    const leido = leerJson(live);
    if (leido.ilegible || (leido.valor !== null && !(leido.valor && Array.isArray(leido.valor.playlists)))) vivas = "ilegible";
    else { vivas = leido.valor ? "leidas" : "sin_documento"; doc = leido.valor || { playlists: [], circuits: [] }; }
  }
  if (doc) {
    for (const c of Array.isArray(doc.circuits) ? doc.circuits : []) {
      let circuito;
      try { circuito = limpiarCircuito(circuitoDesdeLegado(c)); } catch (e) { omite(refCircuito((c && c.id) || "?"), "invalido", { error: codigo(e) }); continue; }
      const ref = refCircuito(circuito.id);
      // Ninguna pantalla se pierde por el camino: si el destino no cabe en el modelo (ni pasando una faceta a `any`),
      // el circuito no se importa y se dice por qué.
      const t = (c && c.target) || {}, propias = new Set([...(t.all || []), ...(t.any || [])].map(screenTag).filter(Boolean));
      propias.delete("circuito:" + circuito.id);
      if (circuito.destino.all.length + circuito.destino.any.length < propias.size) { omite(ref, "destino_excede_limite", { error: `${propias.size} etiquetas` }); continue; }
      alta({ tipo: "circuito", ref, circuito });
    }
    const lista = vivasDe(doc);
    lista.forEach((p, i) => {
      const ref = refViva(p.id);
      try { alta({ tipo: "viva", ref, ...desdeViva(p, i, lista.length) }); } catch (e) { omite(ref, "invalido", { error: codigo(e) }); }
    });
  }

  for (const b of Array.isArray(borradores) ? borradores : []) {
    const pantalla = String((b && b.pantalla) || ""), ref = refBorrador(pantalla), clave = b && b.clave;
    if (!slugId(pantalla)) { omite(ref, "pantalla_invalida", { clave }); continue; }
    if (b.valor == null) { omite(ref, "sin_valor", { clave }); continue; }
    const leido = leerJson(b.valor), draft = leido.valor;
    // La misma regla que readDraft de playlist.js: sin `items` como lista, para la pantalla no hay borrador.
    if (leido.ilegible || !draft || typeof draft !== "object" || !Array.isArray(draft.items)) { omite(ref, "ilegible", { clave }); continue; }
    if (draft.synthetic === true) { omite(ref, "sintetico", { clave }); continue; }
    if (!draft.items.length) { omite(ref, "borrador_vacio", { clave }); continue; }
    let r;
    // La pantalla es la de la clave del KV (la que lee playlist.js), no la que diga el valor.
    try { r = desdeBorrador({ ...draft, screen: pantalla }); } catch (e) { omite(ref, "invalido", { clave, error: codigo(e) }); continue; }
    if (!r) { omite(ref, "borrador_vacio", { clave }); continue; }
    alta({ tipo: "borrador", ref, clave, pantalla, playlist: r.playlist, asignacion: r.asignacion });
  }
  return { unidades, omitidas, vivas, doc };
}

/** Los ids que tocará el tramo: el endpoint lee de la D1 sólo esas playlists enteras (las piezas pesan). */
export function idsNecesarios(traduccion) {
  const ids = e => traduccion.unidades.filter(u => u[e]).map(u => u[e].id);
  return { playlists: ids("playlist"), asignaciones: ids("asignacion"), circuitos: ids("circuito") };
}

// ── Plan ────────────────────────────────────────────────────────────────────────────────────────────────────────
function operacion(entidad, ref, nuevo, fila, propia) {
  const base = { entidad, id: nuevo.id, ref };
  if (!fila) return { ...base, accion: "crear", motivo: "nueva", datos: nuevo };
  const cambios = diferencias(entidad, contenido(entidad, nuevo), fila), id = fila.id, rev = Number(fila.rev);
  if (!cambios.length) return { ...base, id, accion: "igual", motivo: "identica", rev };
  if (!propia) return { ...base, id, accion: "omitir", motivo: "id_ocupado", rev, cambios, actualizado_por: fila.actualizado_por || "" };
  const op = { ...base, id, accion: "actualizar", motivo: "contenido_cambiado", rev, cambios, datos: { ...nuevo, id } };
  if (fila.actualizado_por && !deImportador(fila.actualizado_por)) op.pisa = fila.actualizado_por;
  return op;
}

/**
 * El plan de un tramo.
 *   live, borradores: como en traducir() (o `traduccion` ya hecha);
 *   pantallas: sólo en el último tramo, TODAS las pantallas con clave de borrador en el KV (null si no se sabe);
 *   d1: {playlists, asignaciones, circuitos, legado: {playlists: [{id, origen}]}}, como lo da leerParaImportar().
 * → {operaciones (en orden de aplicación, con `datos` para escribir), omitidas, huerfanos, vivas, resumen}.
 */
export function planificar({ live = undefined, borradores = [], pantallas = null, d1 = {}, traduccion = null } = {}) {
  const t = traduccion || traducir({ live, borradores });
  const asignaciones = Array.isArray(d1.asignaciones) ? d1.asignaciones : [], circuitos = Array.isArray(d1.circuitos) ? d1.circuitos : [];
  const legadoPl = (d1.legado && Array.isArray(d1.legado.playlists) ? d1.legado.playlists : []).filter(p => String(p.origen || "").startsWith(ORIGEN_LEGADO));
  const porRef = new Map(asignaciones.filter(a => a.ref_externa).map(a => [a.ref_externa, a]));
  const asigPorId = new Map(asignaciones.map(a => [a.id, a]));
  const plPorId = new Map((Array.isArray(d1.playlists) ? d1.playlists : []).map(p => [p.id, p]));
  const circPorId = new Map(circuitos.map(c => [c.id, c]));

  const operaciones = [];
  for (const u of t.unidades) {
    if (u.circuito) {
      const fila = circPorId.get(u.circuito.id);
      operaciones.push(operacion("circuito", u.ref, u.circuito, fila, !!fila && deImportador(fila.creado_por)));
      continue;
    }
    const filaPl = plPorId.get(u.playlist.id);
    const opPl = operacion("playlist", u.ref, u.playlist, filaPl, !!filaPl && String(filaPl.origen || "").startsWith(ORIGEN_LEGADO));
    const deRef = porRef.get(u.ref), filaAs = deRef || asigPorId.get(u.asignacion.id);
    let opAs = operacion("asignacion", u.ref, u.asignacion, filaAs, !!deRef);
    // Sin su playlist, la asignación tampoco se escribe: apuntaría a la de otro.
    if (opPl.accion === "omitir" && (opAs.accion === "crear" || opAs.accion === "actualizar")) {
      const { datos, pisa, ...resto } = opAs;
      opAs = { ...resto, accion: "omitir", motivo: "playlist_omitida" };
    }
    operaciones.push(opPl, opAs);
  }

  // Huérfanos: sólo se informan; el importador no borra nada.
  const huerfanos = [], vistos = new Set();
  const anota = (entidad, fila, ref, motivo) => {
    if (!fila || vistos.has(entidad + ":" + fila.id)) return;
    vistos.add(entidad + ":" + fila.id);
    huerfanos.push({ entidad, id: fila.id, ref: ref || null, motivo, actualizado_por: fila.actualizado_por || "" });
  };
  if (t.doc) {
    const presentes = vivasDe(t.doc), refs = new Set(presentes.map(p => refViva(p.id))), ids = new Set(presentes.map(p => slugId("viva-" + p.id)));
    for (const a of asignaciones) if (String(a.ref_externa || "").startsWith(REF_VIVA) && !refs.has(a.ref_externa)) anota("asignacion", a, a.ref_externa, "viva_eliminada");
    for (const p of legadoPl) if (p.origen === "legado:kv-viva" && !ids.has(p.id)) anota("playlist", p, null, "viva_eliminada");
    const enKV = new Set((Array.isArray(t.doc.circuits) ? t.doc.circuits : []).filter(c => c && c.id).map(c => slugId(c.id)));
    for (const c of circuitos) if (deImportador(c.creado_por) && !enKV.has(c.id)) anota("circuito", c, refCircuito(c.id), "circuito_eliminado");
  }
  // El borrador está, pero hoy no manda nada: lo importado antes ya no se corresponde con lo que se emite.
  const sinBorrador = new Set(["borrador_vacio", "sintetico", "ilegible", "sin_valor"]);
  for (const o of t.omitidas) {
    if (!o.ref.startsWith(REF_BORRADOR) || !sinBorrador.has(o.motivo)) continue;
    anota("asignacion", porRef.get(o.ref), o.ref, o.motivo);
    const id = idDefecto(o.ref.slice(REF_BORRADOR.length));
    anota("playlist", legadoPl.find(p => p.id === id && p.origen === "legado:kv-default"), null, o.motivo);
  }
  if (Array.isArray(pantallas)) {
    const conClave = new Set(pantallas.map(s => slugId(s)).filter(Boolean)), suyas = new Set([...conClave].map(idDefecto));
    for (const a of asignaciones) {
      const ref = String(a.ref_externa || "");
      if (ref.startsWith(REF_BORRADOR) && !conClave.has(ref.slice(REF_BORRADOR.length))) anota("asignacion", a, ref, "sin_clave_kv");
    }
    for (const p of legadoPl) if (p.origen === "legado:kv-default" && !suyas.has(p.id)) anota("playlist", p, null, "sin_clave_kv");
  }

  const resumen = { escrituras: 0, omitidas: t.omitidas.length, huerfanos: huerfanos.length };
  for (const e of ENTIDADES) resumen[e] = { crear: 0, actualizar: 0, igual: 0, omitir: 0 };
  for (const op of operaciones) { resumen[op.entidad][op.accion] += 1; if (op.accion === "crear" || op.accion === "actualizar") resumen.escrituras += 1; }
  return { operaciones, omitidas: t.omitidas, huerfanos, vivas: t.vivas, resumen };
}

/** Una operación tal como se enseña (sin los datos que se escribirían). */
export const sinDatos = ({ datos, ...op }) => op;
