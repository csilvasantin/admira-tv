// ALMACÉN DEL MODELO ÚNICO DE PLAYLISTS (E1 · 8-oct-2026): acceso a la D1 «admira-programacion» (PROGRAMACION_DB).
//
// Toda escritura es UN db.batch (una transacción en D1) con bloqueo optimista:
//   1. INSERT, o UPDATE … WHERE id = ? AND rev = ?, que deja en la fila una ficha de escritura única;
//   2. revisión (copia exacta de la fila, sacada con json_object de la propia fila) y poda a las 50 últimas;
//   3. índice invertido del destino (asignaciones);
//   4. auditoría;
//   5. meta.version + 1;
//   6. lectura de la versión y de la fila escrita.
// Los pasos 2–5 llevan «WHERE EXISTS (fila con MI ficha)»: si el UPDATE no tocó nada (changes = 0) no hacen nada, y
// la respuesta es 409 sin rastro en historial, auditoría ni versión. Un INSERT duplicado aborta el batch entero.
//
// Las funciones devuelven {ok:true, status, <entidad>, version} o {ok:false, status, error, actual?}; nunca lanzan
// por un conflicto de datos (sí por un fallo de la propia base, que debe llegar al log).

import { MAX_REVISIONES, limpiarAsignacion, limpiarDestino, limpiarPlaylist, slugId } from "./modelo.js";
import { HORIZONTE_MS } from "./horario.js";
import { MANDO_MAX_MS } from "./resolver.js";

const ENTIDADES = {
  playlist: {
    tabla: "playlist", revisiones: "playlist_revision", fk: "playlist_id",
    columnas: ["nombre", "proyecto", "tipo", "items", "reglas", "opciones", "duracion_s", "origen"],
    json: ["items", "reglas", "opciones"], bool: [],
    // No se borra una playlist a la que todavía apunta una asignación sin archivar.
    guardaBorrado: { sql: "NOT EXISTS (SELECT 1 FROM asignacion WHERE playlist_id = ? AND estado != 'archivada')", binds: id => [id], error: "playlist_en_uso" },
  },
  asignacion: {
    tabla: "asignacion", revisiones: "asignacion_revision", fk: "asignacion_id",
    columnas: ["playlist_id", "nombre", "proyecto", "destino", "directa", "fecha_desde", "fecha_hasta", "dias", "franjas", "recurrencia",
      "excepciones", "inicio_utc", "fin_utc", "capa", "prioridad", "peso", "mezcla", "cadencia", "estado", "ref_externa"],
    json: ["destino", "franjas", "recurrencia", "excepciones"], bool: ["directa"],
    // Una asignación sólo puede apuntar a una playlist que exista.
    guardaEscritura: { sql: "EXISTS (SELECT 1 FROM playlist WHERE id = ?)", binds: d => [d.playlist_id], error: "playlist_inexistente", status: 422 },
  },
  circuito: {
    tabla: "circuito", revisiones: null, fk: null,
    columnas: ["nombre", "destino", "activo"], json: ["destino"], bool: ["activo"],
  },
};

/** Las columnas de contenido que escribe cada entidad (sin id, rev ni sellos): lo que compara el importador (E5). */
export const COLUMNAS = Object.freeze(Object.fromEntries(Object.entries(ENTIDADES).map(([k, E]) => [k, Object.freeze([...E.columnas])])));

const valorSql = v => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v !== null && typeof v === "object" ? JSON.stringify(v) : v);
const ficha = () => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
function deFila(E, fila) {
  if (!fila) return null;
  const o = { ...fila };
  for (const k of E.json) if (k in o) o[k] = o[k] == null ? null : JSON.parse(o[k]);
  for (const k of E.bool) if (k in o) o[k] = !!o[k];
  delete o.escritura;
  return o;
}
const filas = r => (r && Array.isArray(r.results) ? r.results : []);
const cambios = r => Number((r && r.meta && r.meta.changes) || 0);
// Copia exacta de la fila, hecha por la propia base (lo guardado es lo que se versiona).
const instantanea = E => "json_object('id', id, " + [...E.columnas, "rev", "creado_en", "creado_por", "actualizado_en", "actualizado_por"]
  .map(c => `'${c}', ${E.json.includes(c) ? `json(${c})` : c}`).join(", ") + ")";

async function leer(db, E, id) {
  return deFila(E, await db.prepare(`SELECT * FROM ${E.tabla} WHERE id = ?`).bind(id).first());
}

/** Escritura genérica con bloqueo optimista. rev 0/ausente = crear; rev > 0 = actualizar esa revisión. */
async function escribir(db, entidad, datos, { actor = "", rev = 0, ahora = Date.now(), motivo = "" } = {}) {
  const E = ENTIDADES[entidad], id = datos.id, tok = ficha(), crear = !(Number(rev) > 0), nuevo = crear ? 1 : Number(rev) + 1;
  const vals = E.columnas.map(c => valorSql(datos[c]));
  const guarda = E.guardaEscritura, gSql = guarda ? guarda.sql : "1", gBinds = guarda ? guarda.binds(datos) : [];
  const mia = `EXISTS (SELECT 1 FROM ${E.tabla} WHERE id = ? AND escritura = ?)`, yo = [id, tok];
  const stmts = [crear
    ? db.prepare(`INSERT INTO ${E.tabla} (id, ${E.columnas.join(", ")}, rev, escritura, creado_en, creado_por, actualizado_en, actualizado_por) `
        + `SELECT ?, ${E.columnas.map(() => "?").join(", ")}, 1, ?, ?, ?, ?, ? WHERE ${gSql}`).bind(id, ...vals, tok, ahora, actor, ahora, actor, ...gBinds)
    : db.prepare(`UPDATE ${E.tabla} SET ${E.columnas.map(c => c + " = ?").join(", ")}, rev = ?, escritura = ?, actualizado_en = ?, actualizado_por = ? `
        + `WHERE id = ? AND rev = ? AND ${gSql}`).bind(...vals, nuevo, tok, ahora, actor, id, Number(rev), ...gBinds)];
  if (E.revisiones) {
    // Al crear, el historial de una entidad borrada con el mismo id se descarta (su copia final queda en auditoría).
    if (crear) stmts.push(db.prepare(`DELETE FROM ${E.revisiones} WHERE ${E.fk} = ? AND ${mia}`).bind(id, ...yo));
    stmts.push(db.prepare(`INSERT INTO ${E.revisiones} (${E.fk}, rev, datos, autor, en, motivo) SELECT id, rev, ${instantanea(E)}, ?, ?, ? FROM ${E.tabla} WHERE id = ? AND escritura = ?`)
      .bind(actor, ahora, String(motivo).slice(0, 300), ...yo));
    stmts.push(db.prepare(`DELETE FROM ${E.revisiones} WHERE ${E.fk} = ? AND rev <= ? AND ${mia}`).bind(id, nuevo - MAX_REVISIONES, ...yo));
  }
  if (entidad === "asignacion") {
    const pares = [...datos.destino.all.map(t => [t, "all"]), ...datos.destino.any.map(t => [t, "any"])];
    stmts.push(db.prepare(`DELETE FROM asignacion_destino WHERE asignacion_id = ? AND ${mia}`).bind(id, ...yo));
    stmts.push(db.prepare(`INSERT OR IGNORE INTO asignacion_destino (etiqueta, asignacion_id, modo) SELECT json_extract(value, '$[0]'), ?, json_extract(value, '$[1]') FROM json_each(?) WHERE ${mia}`)
      .bind(id, JSON.stringify(pares), ...yo));
  }
  stmts.push(...cierre(db, { ahora, actor, accion: crear ? "crear" : "actualizar", entidad, id, rev: nuevo, detalle: { motivo: String(motivo).slice(0, 300), nombre: datos.nombre || "" } }, mia, yo));
  stmts.push(db.prepare(`SELECT * FROM ${E.tabla} WHERE id = ? AND escritura = ?`).bind(...yo));
  let res;
  try { res = await db.batch(stmts); }
  catch (e) {
    if (crear && /unique|primary key|constraint/i.test(String((e && e.message) || e))) return { ok: false, status: 409, error: "ya_existe", actual: await leer(db, E, id) };
    throw e;
  }
  if (!cambios(res[0])) {
    if (crear) return { ok: false, status: (guarda && guarda.status) || 409, error: (guarda && guarda.error) || "conflicto" };
    const actual = await leer(db, E, id);
    if (!actual) return { ok: false, status: 404, error: "no_existe" };
    if (Number(actual.rev) !== Number(rev)) return { ok: false, status: 409, error: "revision_conflict", actual };
    return { ok: false, status: (guarda && guarda.status) || 409, error: (guarda && guarda.error) || "conflicto", actual };
  }
  return { ok: true, status: crear ? 201 : 200, [entidad]: deFila(E, filas(res[res.length - 1])[0]), version: Number(filas(res[res.length - 2])[0].version) };
}
// Auditoría + versión global + lectura de la versión: el final común de toda escritura (condicionado a MI ficha).
function cierre(db, { ahora, actor, accion, entidad, id, rev, detalle }, mia, yo) {
  return [
    db.prepare(`INSERT INTO auditoria (en, actor, accion, entidad, entidad_id, rev, version, detalle) SELECT ?, ?, ?, ?, ?, ?, (SELECT version + 1 FROM meta WHERE id = 1), ? WHERE ${mia}`)
      .bind(ahora, actor, accion, entidad, id, rev, JSON.stringify(detalle), ...yo),
    db.prepare(`UPDATE meta SET version = version + 1, actualizado_en = ? WHERE id = 1 AND ${mia}`).bind(ahora, ...yo),
    db.prepare("SELECT version FROM meta WHERE id = 1"),
  ];
}

async function borrar(db, entidad, id, { actor = "", rev, ahora = Date.now(), motivo = "" } = {}) {
  const E = ENTIDADES[entidad], tok = ficha(), guarda = E.guardaBorrado;
  if (!(Number(rev) > 0)) return { ok: false, status: 428, error: "rev_requerida" };
  // La copia final viaja en la auditoría: es lo que permite deshacer un borrado.
  const ultima = await leer(db, E, id);
  if (!ultima) return { ok: false, status: 404, error: "no_existe" };
  if (Number(ultima.rev) !== Number(rev)) return { ok: false, status: 409, error: "revision_conflict", actual: ultima };
  const mia = `EXISTS (SELECT 1 FROM ${E.tabla} WHERE id = ? AND escritura = ?)`, yo = [id, tok];
  const stmts = [db.prepare(`UPDATE ${E.tabla} SET escritura = ? WHERE id = ? AND rev = ?${guarda ? " AND " + guarda.sql : ""}`)
    .bind(tok, id, Number(rev), ...(guarda ? guarda.binds(id) : []))];
  if (entidad === "asignacion") stmts.push(db.prepare(`DELETE FROM asignacion_destino WHERE asignacion_id = ? AND ${mia}`).bind(id, ...yo));
  stmts.push(...cierre(db, { ahora, actor, accion: "borrar", entidad, id, rev: Number(rev), detalle: { motivo: String(motivo).slice(0, 300), datos: ultima } }, mia, yo));
  stmts.push(db.prepare(`DELETE FROM ${E.tabla} WHERE id = ? AND escritura = ?`).bind(...yo));
  const res = await db.batch(stmts);
  if (!cambios(res[0])) {
    const actual = await leer(db, E, id);
    if (!actual) return { ok: false, status: 404, error: "no_existe" };
    if (Number(actual.rev) !== Number(rev)) return { ok: false, status: 409, error: "revision_conflict", actual };
    return { ok: false, status: 409, error: (guarda && guarda.error) || "conflicto", actual };
  }
  return { ok: true, status: 200, borrado: id, version: Number(filas(res[res.length - 2])[0].version) };
}
// Envoltorio: valida con el modelo y traduce el error de validación a 400.
const validado = async (fn, limpiar, raw) => { let d; try { d = limpiar(raw); } catch (e) { return { ok: false, status: 400, error: String((e && e.message) || e) }; } return fn(d); };

// ── Playlists ───────────────────────────────────────────────────────────────────────────────────────────────────
export const leerPlaylist = (db, id) => leer(db, ENTIDADES.playlist, id);
export const guardarPlaylist = (db, raw, opciones = {}) => validado(d => escribir(db, "playlist", d, opciones), limpiarPlaylist, raw);
export const borrarPlaylist = (db, id, opciones = {}) => borrar(db, "playlist", id, opciones);
export async function listarPlaylists(db, { proyecto = null, limite = 100 } = {}) {
  const n = Math.max(1, Math.min(500, Number(limite) || 100));
  const st = proyecto == null ? db.prepare("SELECT * FROM playlist ORDER BY actualizado_en DESC, id LIMIT ?").bind(n)
    : db.prepare("SELECT * FROM playlist WHERE proyecto = ? ORDER BY actualizado_en DESC, id LIMIT ?").bind(slugId(proyecto), n);
  return filas(await st.all()).map(f => deFila(ENTIDADES.playlist, f));
}

// ── Asignaciones ────────────────────────────────────────────────────────────────────────────────────────────────
export const leerAsignacion = (db, id) => leer(db, ENTIDADES.asignacion, id);
export const guardarAsignacion = (db, raw, opciones = {}) => validado(d => escribir(db, "asignacion", d, opciones), limpiarAsignacion, raw);
export const borrarAsignacion = (db, id, opciones = {}) => borrar(db, "asignacion", id, opciones);
export async function listarAsignaciones(db, { playlist_id = null, estado = null, limite = 200 } = {}) {
  const where = [], binds = [];
  if (playlist_id) { where.push("playlist_id = ?"); binds.push(playlist_id); }
  if (estado) { where.push("estado = ?"); binds.push(estado); }
  const sql = "SELECT * FROM asignacion" + (where.length ? " WHERE " + where.join(" AND ") : "") + " ORDER BY prioridad DESC, actualizado_en DESC, id LIMIT ?";
  return filas(await db.prepare(sql).bind(...binds, Math.max(1, Math.min(1000, Number(limite) || 200))).all()).map(f => deFila(ENTIDADES.asignacion, f));
}

/**
 * Lo que le puede tocar a una pantalla en [ahora − 2 h, ahora + 48 h]: asignaciones activas cuyo destino nombra alguna
 * de sus etiquetas (índice invertido), sus playlists y la versión, en una sola ida (batch = lectura coherente).
 * Desde 2 h antes para que el resolver vea el borde de franja que caduca un mando en vivo.
 */
export async function candidatas(db, screenTags, { ahora = Date.now(), horizonteMs = HORIZONTE_MS, atrasMs = MANDO_MAX_MS } = {}) {
  const tags = JSON.stringify([...new Set((screenTags || []).map(String))]);
  const filtro = "a.estado = 'activa' AND a.fin_utc > ? AND a.inicio_utc <= ? AND a.id IN (SELECT asignacion_id FROM asignacion_destino WHERE etiqueta IN (SELECT value FROM json_each(?)))";
  const b = [ahora - atrasMs, ahora + horizonteMs, tags];
  const [as, ps, meta] = await db.batch([
    db.prepare(`SELECT a.* FROM asignacion a WHERE ${filtro} ORDER BY a.prioridad DESC, a.id`).bind(...b),
    db.prepare(`SELECT p.* FROM playlist p WHERE p.id IN (SELECT a.playlist_id FROM asignacion a WHERE ${filtro})`).bind(...b),
    db.prepare("SELECT version, banderas FROM meta WHERE id = 1"),
  ]);
  const m = filas(meta)[0] || { version: 0, banderas: "{}" };
  return { asignaciones: filas(as).map(f => deFila(ENTIDADES.asignacion, f)), playlists: filas(ps).map(f => deFila(ENTIDADES.playlist, f)),
    version: Number(m.version), banderas: JSON.parse(m.banderas || "{}") };
}

// ── Circuitos ───────────────────────────────────────────────────────────────────────────────────────────────────
export function limpiarCircuito(raw) {
  const nombre = String((raw && (raw.nombre || raw.name)) || "").trim().slice(0, 60);
  if (!nombre) throw new Error("nombre_requerido");
  const id = slugId(raw.id || nombre), destino = limpiarDestino(raw.destino || raw.target);
  // Un circuito no se define con su propia etiqueta (igual que cleanCircuit).
  destino.all = destino.all.filter(t => t !== "circuito:" + id); destino.any = destino.any.filter(t => t !== "circuito:" + id);
  if (!destino.all.length && !destino.any.length) throw new Error("destino_requerido");
  return { id, nombre, destino, activo: (raw.activo ?? raw.enabled) !== false };
}
export const leerCircuito = (db, id) => leer(db, ENTIDADES.circuito, id);
export const guardarCircuito = (db, raw, opciones = {}) => validado(d => escribir(db, "circuito", d, opciones), limpiarCircuito, raw);
export const borrarCircuito = (db, id, opciones = {}) => borrar(db, "circuito", id, opciones);
export async function listarCircuitos(db) {
  return filas(await db.prepare("SELECT * FROM circuito ORDER BY id").all()).map(f => deFila(ENTIDADES.circuito, f));
}

// ── Importador del legado (E5) ──────────────────────────────────────────────────────────────────────────────────
/**
 * Lo que el importador necesita de la D1 para un tramo, en una sola ida (batch = lectura coherente):
 *   · las asignaciones del legado (ref_externa «kv:…») y las de los ids que el tramo va a escribir;
 *   · las playlists de esos ids, enteras;
 *   · el índice ligero (id y origen) de las playlists del legado, para los huérfanos, sin leer sus piezas;
 *   · todos los circuitos y la versión.
 * Sólo SELECT. Los ids viajan en un único parámetro JSON (D1 admite 100 parámetros por sentencia).
 */
export async function leerParaImportar(db, { playlists = [], asignaciones = [] } = {}) {
  const ids = lista => JSON.stringify([...new Set((lista || []).map(String))]);
  const [as, ps, legado, cs, meta] = await db.batch([
    db.prepare("SELECT * FROM asignacion WHERE (ref_externa >= 'kv:' AND ref_externa < 'kv;') OR id IN (SELECT value FROM json_each(?)) ORDER BY id").bind(ids(asignaciones)),
    db.prepare("SELECT * FROM playlist WHERE id IN (SELECT value FROM json_each(?)) ORDER BY id").bind(ids(playlists)),
    db.prepare("SELECT id, origen, actualizado_por FROM playlist WHERE origen >= 'legado:' AND origen < 'legado;' ORDER BY id"),
    db.prepare("SELECT * FROM circuito ORDER BY id"),
    db.prepare("SELECT version FROM meta WHERE id = 1"),
  ]);
  return {
    asignaciones: filas(as).map(f => deFila(ENTIDADES.asignacion, f)), playlists: filas(ps).map(f => deFila(ENTIDADES.playlist, f)),
    legado: { playlists: filas(legado).map(f => ({ id: f.id, origen: f.origen, actualizado_por: f.actualizado_por })) },
    circuitos: filas(cs).map(f => deFila(ENTIDADES.circuito, f)), version: Number((filas(meta)[0] || { version: 0 }).version),
  };
}

// ── Doble escritura (E7) ────────────────────────────────────────────────────────────────────────────────────────
/**
 * Una bandera de meta.banderas (lo que devuelve leerMeta), o `defecto` si no está o si no hay meta. Tolera que el campo
 * falte: las banderas nuevas (espejo, …) no existen en la fila hasta que alguien las fija.
 */
export function bandera(meta, nombre, defecto = false) {
  const b = meta && meta.banderas;
  return b && typeof b === "object" && Object.prototype.hasOwnProperty.call(b, nombre) ? b[nombre] : defecto;
}
/**
 * Lo que necesita el espejo de UNA escritura del legado, en una sola ida (batch = lectura coherente). Es lo mismo que
 * leerParaImportar, pero acotado a lo que toca esa escritura:
 *   · las asignaciones de esas ref_externa y de esos ids (con `vivas`, además todas las «kv:viva:…», para archivar las
 *     de las vivas que ya no están);
 *   · las playlists de esos ids, enteras;
 *   · con `vivas`, todos los circuitos (sin `vivas`, ninguno);
 *   · meta (versión y banderas): el espejo vuelve a mirar su bandera con la misma lectura.
 * Sólo SELECT. Los ids viajan en un único parámetro JSON.
 */
export async function leerParaEspejo(db, { refs = [], asignaciones = [], playlists = [], vivas = false } = {}) {
  const ids = lista => JSON.stringify([...new Set((lista || []).map(String))]);
  const deVivas = vivas ? " OR (ref_externa >= 'kv:viva:' AND ref_externa < 'kv:viva;')" : "";
  const [as, ps, cs, meta] = await db.batch([
    db.prepare(`SELECT * FROM asignacion WHERE ref_externa IN (SELECT value FROM json_each(?)) OR id IN (SELECT value FROM json_each(?))${deVivas} ORDER BY id`)
      .bind(ids(refs), ids(asignaciones)),
    db.prepare("SELECT * FROM playlist WHERE id IN (SELECT value FROM json_each(?)) ORDER BY id").bind(ids(playlists)),
    db.prepare(vivas ? "SELECT * FROM circuito ORDER BY id" : "SELECT * FROM circuito WHERE 0"),
    db.prepare("SELECT version, banderas FROM meta WHERE id = 1"),
  ]);
  const m = filas(meta)[0];
  return {
    asignaciones: filas(as).map(f => deFila(ENTIDADES.asignacion, f)), playlists: filas(ps).map(f => deFila(ENTIDADES.playlist, f)),
    circuitos: filas(cs).map(f => deFila(ENTIDADES.circuito, f)), legado: { playlists: [] },
    meta: m ? { version: Number(m.version), banderas: JSON.parse(m.banderas || "{}") } : null,
  };
}
/**
 * Marcas del espejo en la auditoría (espejo_fallido, espejo_omitido): [{actor, accion, entidad, id, rev, detalle, ahora}].
 * No son escrituras del modelo: no suben meta.version (no invalidan la memoria de lectura) y llevan la versión actual.
 */
export async function anotarAuditoria(db, marcas = []) {
  const lista = (Array.isArray(marcas) ? marcas : [marcas]).filter(Boolean);
  if (!lista.length) return { ok: true, anotadas: 0 };
  await db.batch(lista.map(m => db.prepare("INSERT INTO auditoria (en, actor, accion, entidad, entidad_id, rev, version, detalle) SELECT ?, ?, ?, ?, ?, ?, version, ? FROM meta WHERE id = 1")
    .bind(Number(m.ahora) || Date.now(), String(m.actor || ""), String(m.accion), String(m.entidad), String(m.id), m.rev == null ? null : Number(m.rev), JSON.stringify(m.detalle || {}))));
  return { ok: true, anotadas: lista.length };
}
/** Cuántas marcas del espejo hay desde `desde`, por acción y motivo, y la última. Sólo SELECT (lo usa la simulación). */
export async function resumenEspejo(db, { desde = 0 } = {}) {
  const rs = filas(await db.prepare("SELECT accion, json_extract(detalle, '$.motivo') AS motivo, COUNT(*) AS n, MAX(en) AS ultima FROM auditoria "
    + "WHERE en >= ? AND accion IN ('espejo_fallido', 'espejo_omitido') GROUP BY accion, motivo ORDER BY accion, motivo").bind(Number(desde) || 0).all());
  const out = { fallidos: 0, omitidos: 0, editado_fuera: 0, motivos: { fallido: {}, omitido: {} }, ultima: null };
  for (const r of rs) {
    const n = Number(r.n) || 0, clase = r.accion === "espejo_fallido" ? "fallido" : "omitido", motivo = String(r.motivo || "sin_motivo");
    out[clase === "fallido" ? "fallidos" : "omitidos"] += n;
    out.motivos[clase][motivo] = (out.motivos[clase][motivo] || 0) + n;
    if (clase === "omitido" && motivo === "editado_fuera") out.editado_fuera += n;
    out.ultima = Math.max(out.ultima || 0, Number(r.ultima) || 0) || null;
  }
  return out;
}

// ── Historial, auditoría, meta y sombra ─────────────────────────────────────────────────────────────────────────
export async function historial(db, entidad, id, { limite = MAX_REVISIONES } = {}) {
  const E = ENTIDADES[entidad];
  if (!E || !E.revisiones) return [];
  const rs = filas(await db.prepare(`SELECT rev, datos, autor, en, motivo FROM ${E.revisiones} WHERE ${E.fk} = ? ORDER BY rev DESC LIMIT ?`).bind(id, Math.max(1, Math.min(MAX_REVISIONES, Number(limite) || MAX_REVISIONES))).all());
  return rs.map(r => ({ ...r, datos: JSON.parse(r.datos) }));
}
/** Auditoría, de la más reciente a la más antigua. `antes` (un id de auditoría) pagina: sólo las anteriores a ésa. */
export async function auditoria(db, { entidad = null, id = null, actor = null, accion = null, antes = null, limite = 100 } = {}) {
  const where = [], binds = [];
  if (entidad) { where.push("entidad = ?"); binds.push(entidad); }
  if (id) { where.push("entidad_id = ?"); binds.push(id); }
  if (actor) { where.push("actor = ?"); binds.push(String(actor)); }
  if (accion) { where.push("accion = ?"); binds.push(String(accion)); }
  if (Number(antes) > 0) { where.push("id < ?"); binds.push(Math.floor(Number(antes))); }
  const sql = "SELECT * FROM auditoria" + (where.length ? " WHERE " + where.join(" AND ") : "") + " ORDER BY id DESC LIMIT ?";
  return filas(await db.prepare(sql).bind(...binds, Math.max(1, Math.min(1000, Number(limite) || 100))).all()).map(r => ({ ...r, detalle: JSON.parse(r.detalle || "{}") }));
}
export async function leerMeta(db) {
  const m = await db.prepare("SELECT version, esquema, banderas, actualizado_en FROM meta WHERE id = 1").first();
  return m ? { version: Number(m.version), esquema: Number(m.esquema), banderas: JSON.parse(m.banderas || "{}"), actualizado_en: Number(m.actualizado_en) } : null;
}
/** Banderas de despliegue (motor: apagado · sombra · encendido, …): se funden con las que hay. Auditado. */
export async function fijarBanderas(db, cambios, { actor = "", ahora = Date.now() } = {}) {
  const limpias = {};
  for (const [k, v] of Object.entries(cambios || {})) if (/^[a-z_]{1,40}$/.test(k) && ["string", "number", "boolean"].includes(typeof v)) limpias[k] = typeof v === "string" ? v.slice(0, 80) : v;
  const actual = await leerMeta(db), banderas = { ...((actual && actual.banderas) || {}), ...limpias };
  const res = await db.batch([
    db.prepare("INSERT INTO auditoria (en, actor, accion, entidad, entidad_id, rev, version, detalle) SELECT ?, ?, 'banderas', 'meta', 'banderas', NULL, version + 1, ? FROM meta WHERE id = 1").bind(ahora, actor, JSON.stringify(limpias)),
    db.prepare("UPDATE meta SET banderas = ?, version = version + 1, actualizado_en = ? WHERE id = 1").bind(JSON.stringify(banderas), ahora),
    db.prepare("SELECT version FROM meta WHERE id = 1"),
  ]);
  return { ok: true, status: 200, banderas, version: Number(filas(res[2])[0].version) };
}
export async function registrarSombra(db, { pantalla, en = Date.now(), version = 0, firma_legado = "", firma_nueva = "", capa = "", detalle = {} }) {
  await db.prepare("INSERT OR REPLACE INTO sombra (pantalla, en, version, firma_legado, firma_nueva, coincide, capa, detalle) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(String(pantalla), en, version, String(firma_legado), String(firma_nueva), firma_legado === firma_nueva ? 1 : 0, String(capa), JSON.stringify(detalle)).run();
  return { ok: true };
}
