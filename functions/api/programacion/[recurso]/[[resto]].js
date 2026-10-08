// /api/programacion/… — API de escritura del modelo único de playlists (E4 · docs/playlists-modelo-unico.md).
//
//   GET    /api/programacion/<recurso>[?filtros]            lista (playlists ?proyecto= · asignaciones ?playlist_id=&estado=)
//   POST   /api/programacion/<recurso>                      crea → 201 (409 ya_existe si el id está cogido)
//   GET    /api/programacion/<recurso>/<id>                 lee una
//   PUT    /api/programacion/<recurso>/<id>   {…, rev}      la sustituye entera
//   PATCH  /api/programacion/<recurso>/<id>   {…, rev}      cambia sólo los campos que llegan (fusión superficial)
//   DELETE /api/programacion/<recurso>/<id>?rev=N           la borra (la copia final queda en la auditoría)
//   GET    /api/programacion/historial/<tipo>/<id>          sus revisiones (las 50 últimas) y cómo está ahora
//   GET    /api/programacion/auditoria[?entidad=&id=&actor=&accion=&antes=&limite=]   paginada por `antes`
//   POST   /api/programacion/importar[?aplicar=1&cursor=&limite=]   importador del legado (E5): simula o aplica
// con <recurso> = playlists · asignaciones · circuitos.
//
// Todo pasa por almacen.js (E1): un solo db.batch con bloqueo optimista por `rev` (409 revision_conflict con la
// fila actual, sin rastro en historial, auditoría ni versión), revisiones, auditoría y meta.version + 1 en cada
// escritura aceptada, así que la memoria de GET /api/programacion se invalida sola. La validación es la de modelo.js;
// aquí sólo se traduce a 422 con el campo culpable. Sin `rev` en PUT, PATCH o DELETE → 428 rev_requerida.
//
// ACCESO (acceso.js): leer, con la sesión del portal y permiso digitalsignage-player (o la sesión de lectura viva);
// escribir, con esa misma sesión (actor = su email) o con la clave de servicio de Pixeria (X-Programacion-Key o
// Authorization: Bearer; actor = servicio:<X-Actor o «pixeria»>). Sin CORS: la clave es sólo server to server.
// El visor (sesión de lectura) no ve quién escribió: historial y auditoría le dan 403 solo_lectura, y en las listas y
// lecturas sueltas no lleva creado_por ni actualizado_por.
//
// RUTA [recurso]/[[resto]] y no [[ruta]]: en Pages un comodín [[ruta]] también casa con la base (/api/programacion) y,
// como el router ordena las rutas por número de tramos, le ganaría a functions/api/programacion.js. Con [recurso]
// delante hace falta al menos un tramo, así que GET /api/programacion?screen= (E3) sigue yendo a programacion.js.
// Sin el binding PROGRAMACION_DB → 503 programacion_db_no_configurada; sin la migración → 503
// programacion_db_sin_esquema, igual que E3.
import { authHeaders } from "../../../_auth-session.js";
import * as A from "../../_programacion/almacen.js";
import { autorizarEscritura, autorizarLectura } from "../../_programacion/acceso.js";
import { importar } from "../../_programacion/importar.js";
import { ESTADOS, MAX_ITEMS, MAX_REGLAS, slugId } from "../../_programacion/modelo.js";
import { MAX_FRANJAS } from "../../_programacion/horario.js";

const BASE = "/api/programacion";
const MAX_CUERPO = 2_000_000;                       // caracteres; D1 no guarda filas de más de 2 MB
const LIMITE_AUDITORIA = 50, MAX_LIMITE_AUDITORIA = 200;
const ID_RE = /^[a-z0-9][a-z0-9-]{0,59}$/;

const json = (value, status = 200, extra = {}) => Response.json(value, { status, headers: authHeaders(extra) });
const metodoNoPermitido = permitidos => new Response(null, { status: 405, headers: authHeaders({ Allow: permitidos.join(", ") }) });
// ── Recursos ────────────────────────────────────────────────────────────────────────────────────────────────────
const RECURSOS = {
  playlists: {
    entidad: "playlist", leer: A.leerPlaylist, guardar: A.guardarPlaylist, borrar: A.borrarPlaylist,
    listar: (db, q) => A.listarPlaylists(db, { proyecto: q.get("proyecto"), limite: q.get("limite") }),
  },
  asignaciones: {
    entidad: "asignacion", leer: A.leerAsignacion, guardar: A.guardarAsignacion, borrar: A.borrarAsignacion,
    listar: (db, q) => A.listarAsignaciones(db, { playlist_id: q.get("playlist_id") || q.get("playlist"), estado: q.get("estado"), limite: q.get("limite") }),
    filtros: q => (q.get("estado") && !ESTADOS.includes(q.get("estado")) ? "estado_invalido" : ""),
  },
  circuitos: {
    entidad: "circuito", leer: A.leerCircuito, guardar: A.guardarCircuito, borrar: A.borrarCircuito,
    listar: db => A.listarCircuitos(db),
  },
};
// historial/<tipo>/<id> y auditoria?entidad= aceptan el singular y el plural.
const TIPOS = { playlist: "playlists", playlists: "playlists", asignacion: "asignaciones", asignaciones: "asignaciones", circuito: "circuitos", circuitos: "circuitos" };
const ENTIDADES_AUDITADAS = { ...Object.fromEntries(Object.entries(TIPOS).map(([k, v]) => [k, RECURSOS[v].entidad])), meta: "meta" };

// ── Errores de validación → 422 con el campo culpable ───────────────────────────────────────────────────────────
const ERRORES = {
  playlist_invalida: [null, "Se espera la playlist como objeto JSON."],
  asignacion_invalida: [null, "Se espera la asignación como objeto JSON."],
  nombre_requerido: ["nombre", "Falta el nombre."],
  id_invalido: ["id", "El id no es válido: minúsculas, números y guiones."],
  id_no_coincide: ["id", "El id del cuerpo no coincide con el de la URL."],
  tipo_invalido: ["tipo", "El tipo debe ser fija, viva o mixta."],
  reglas_invalidas: ["reglas", `Las reglas deben ser una lista de ${MAX_REGLAS} como mucho.`],
  regla_sin_contenido: ["reglas", "Una regla no dice qué contenido buscar."],
  reglas_en_fija: ["reglas", "Una playlist fija no lleva reglas."],
  viva_sin_reglas: ["reglas", "Una playlist viva necesita al menos una regla."],
  items_invalidos: ["items", "Las piezas deben ser una lista."],
  demasiados_items: ["items", `Como mucho ${MAX_ITEMS} piezas.`],
  pieza_invalida: ["items", "Una pieza no tiene un asset https:// válido."],
  hueco_en_fija: ["items", "Una playlist fija no lleva huecos."],
  items_en_viva: ["items", "Una playlist viva no lleva piezas, sólo reglas."],
  hueco_regla_inexistente: ["items", "Un hueco apunta a una regla que no existe."],
  playlist_requerida: ["playlist_id", "Falta la playlist (playlist_id)."],
  playlist_inexistente: ["playlist_id", "La playlist indicada no existe."],
  destino_requerido: ["destino", "El destino necesita al menos una etiqueta en all o en any."],
  capa_invalida: ["capa", "Capa no válida: emergencia, pagada, propia, por_defecto o relleno."],
  mezcla_invalida: ["mezcla", "Mezcla no válida: sustituye, fusiona, anade o intercala."],
  estado_invalido: ["estado", "Estado no válido: borrador, activa, pausada o archivada."],
  fecha_desde_invalida: ["fecha_desde", "fecha_desde debe ser una fecha AAAA-MM-DD."],
  fecha_hasta_invalida: ["fecha_hasta", "fecha_hasta debe ser una fecha AAAA-MM-DD."],
  fechas_invertidas: ["fecha_hasta", "fecha_hasta es anterior a fecha_desde."],
  dias_invalidos: ["dias", "dias debe ser una máscara de 1 a 127 o una lista de días (L, M, X, J, V, S, D)."],
  franja_invalida: ["franjas", "Una franja no es válida: «HH:MM-HH:MM» o {desde, hasta}."],
  franjas_invalidas: ["franjas", `Las franjas deben ser una lista de ${MAX_FRANJAS} como mucho.`],
  recurrencia_invalida: ["recurrencia", "Recurrencia no válida: {tipo:'semanal', cada, ancla} o {tipo:'fechas', fechas}."],
  recurrencia_sin_ancla: ["recurrencia", "Una recurrencia de cada N semanas necesita ancla o fecha_desde."],
  excepcion_invalida: ["excepciones", "Una excepción debe ser una fecha AAAA-MM-DD o un rango {desde, hasta}."],
  excepciones_invalidas: ["excepciones", "Las excepciones deben ser una lista."],
};
function invalido(codigo) {
  const [campo, mensaje] = ERRORES[codigo] || [null, "Datos no válidos."];
  return json({ ok: false, error: codigo, campo, mensaje }, 422);
}
/** Lo que devuelve el almacén, en HTTP. Sus 400 son de validación (modelo.js) y aquí son 422. */
function responder(r, recurso, id) {
  if (!r.ok && (r.status === 400 || r.status === 422)) return invalido(r.error);
  const { status, ...cuerpo } = r;
  const entidad = r.ok && r[RECURSOS[recurso].entidad];
  return json(cuerpo, status, status === 201 && entidad ? { Location: `${BASE}/${recurso}/${encodeURIComponent(entidad.id || id)}` } : {});
}

// ── Petición ────────────────────────────────────────────────────────────────────────────────────────────────────
/** Los tramos tras /api/programacion/, sacados de la propia URL (y descodificados una sola vez). */
function tramos(url) {
  const crudo = url.pathname.startsWith(BASE + "/") ? url.pathname.slice(BASE.length + 1).split("/") : [];
  try { return crudo.filter(Boolean).map(t => decodeURIComponent(t)); } catch (_) { return null; }
}
function enrutar(t) {
  if (!t) return null;
  if (t.length === 1 && t[0] === "auditoria") return { tipo: "auditoria", metodos: ["GET"] };
  if (t.length === 1 && t[0] === "importar") return { tipo: "importar", metodos: ["POST"] };
  if (t.length === 3 && t[0] === "historial" && TIPOS[t[1]]) return { tipo: "historial", recurso: TIPOS[t[1]], id: t[2], metodos: ["GET"] };
  if (!RECURSOS[t[0]]) return null;
  if (t.length === 1) return { tipo: "coleccion", recurso: t[0], metodos: ["GET", "POST"] };
  if (t.length === 2) return { tipo: "entidad", recurso: t[0], id: t[1], metodos: ["GET", "PUT", "PATCH", "DELETE"] };
  return null;
}
/** Cuerpo JSON (un objeto). Opcional en DELETE, donde puede traer rev y motivo. */
async function cuerpo(request, obligatorio = true) {
  let texto;
  try { texto = await request.text(); } catch (_) { return { error: "json_invalido", status: 400 }; }
  if (texto.length > MAX_CUERPO) return { error: "cuerpo_demasiado_grande", status: 413 };
  if (!texto.trim()) return obligatorio ? { error: "json_invalido", status: 400 } : { valor: {} };
  try {
    const v = JSON.parse(texto);
    return v && typeof v === "object" && !Array.isArray(v) ? { valor: v } : { error: "json_invalido", status: 400 };
  } catch (_) { return { error: "json_invalido", status: 400 }; }
}
/** La revisión que el cliente dice tener: del cuerpo, de ?rev= o de If-Match. 0 si no hay una válida. */
function revDe(request, q, b) {
  let v = b && b.rev != null && b.rev !== "" ? b.rev : q.get("rev");
  if (v == null || v === "") { const im = request.headers.get("If-Match"); if (im) v = im.replace(/^W\//, "").replace(/"/g, "").trim(); }
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : 0;
}
const motivoDe = (b, q) => String((b && b.motivo) || q.get("motivo") || "").slice(0, 300);
const entero = (v, min, max, def) => { const n = Math.floor(Number(v)); return v != null && v !== "" && Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def; };

// ── Ruta ────────────────────────────────────────────────────────────────────────────────────────────────────────
export async function onRequest({ request, env = {} }) {
  const url = new URL(request.url), q = url.searchParams, metodo = String(request.method || "GET").toUpperCase();
  const ruta = enrutar(tramos(url));
  if (!ruta) return json({ ok: false, error: "ruta_desconocida" }, 404);
  if (!ruta.metodos.includes(metodo)) return metodoNoPermitido(ruta.metodos);
  // El importador (E5) tiene su propio acceso (sólo la sesión del portal) y su propia lectura del KV: importar.js.
  if (ruta.tipo === "importar") return importar({ request, env });
  const escribe = metodo !== "GET";
  const auth = escribe ? await autorizarEscritura(request, env) : await autorizarLectura(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
  // Historial y auditoría llevan los emails de los actores: el visor no los ve (antes de tocar la D1).
  if (auth.lectura && (ruta.tipo === "auditoria" || ruta.tipo === "historial")) return json({ ok: false, error: "solo_lectura" }, 403);

  const db = env.PROGRAMACION_DB;
  if (!db || typeof db.prepare !== "function" || typeof db.batch !== "function") return json({ ok: false, error: "programacion_db_no_configurada" }, 503);
  let meta;
  try { meta = await A.leerMeta(db); } catch (e) { console.error("programacion: meta", e); meta = null; }
  if (!meta) return json({ ok: false, error: "programacion_db_sin_esquema" }, 503);

  try {
    if (ruta.tipo === "auditoria") return await verAuditoria(db, q, meta);
    if (ruta.tipo === "historial") return await verHistorial(db, ruta, meta);
    if (ruta.tipo === "coleccion") return metodo === "GET" ? await listar(db, ruta, q, meta, auth) : await crear(db, ruta, request, q, auth);
    if (!ID_RE.test(ruta.id)) return json({ ok: false, error: "no_existe" }, 404);
    if (metodo === "GET") return await leerUna(db, ruta, meta, auth);
    if (metodo === "DELETE") return await borrar(db, ruta, request, q, auth);
    return await actualizar(db, ruta, request, q, auth, metodo === "PATCH");
  } catch (e) {
    console.error("programacion: " + (escribe ? "escritura" : "lectura"), e);
    return json({ ok: false, error: escribe ? "programacion_escritura_fallida" : "programacion_lectura_fallida" }, 503);
  }
}

/** Lo que ve el visor: la fila sin quién la creó ni quién la cambió por última vez. */
const sinActores = ({ creado_por, actualizado_por, ...resto }) => resto;
const vista = auth => (auth.lectura ? sinActores : fila => fila);

async function listar(db, { recurso }, q, meta, auth) {
  const R = RECURSOS[recurso], malo = R.filtros && R.filtros(q);
  if (malo) return json({ ok: false, error: malo }, 400);
  return json({ ok: true, version: meta.version, [recurso]: (await R.listar(db, q)).map(vista(auth)) });
}

async function leerUna(db, { recurso, id }, meta, auth) {
  const R = RECURSOS[recurso], fila = await R.leer(db, id);
  return fila ? json({ ok: true, version: meta.version, [R.entidad]: vista(auth)(fila) }) : json({ ok: false, error: "no_existe" }, 404);
}

async function crear(db, { recurso }, request, q, auth) {
  const R = RECURSOS[recurso], b = await cuerpo(request);
  if (b.error) return json({ ok: false, error: b.error }, b.status);
  // rev 0: el almacén crea (INSERT); un id ya cogido es 409 ya_existe con la fila que hay. Sin id, lo pone el modelo
  // (del nombre en playlists y circuitos; asg-xxxxxxxx en asignaciones).
  return responder(await R.guardar(db, b.valor, { actor: auth.actor, rev: 0, motivo: motivoDe(b.valor, q) }), recurso);
}

async function actualizar(db, { recurso, id }, request, q, auth, parcial) {
  const R = RECURSOS[recurso], b = await cuerpo(request);
  if (b.error) return json({ ok: false, error: b.error }, b.status);
  const rev = revDe(request, q, b.valor);
  // Sin rev el almacén CREARÍA: una actualización sin rev no se intenta.
  if (!rev) return json({ ok: false, error: "rev_requerida" }, 428);
  const dado = b.valor.id;
  if (dado != null && dado !== "" && slugId(dado) !== id) return invalido("id_no_coincide");
  let datos = { ...b.valor, id };
  if (parcial) {
    // PATCH: lo que llega se pone encima de la fila actual (los campos de primer nivel se sustituyen enteros). Si
    // otro ha escrito entretanto, el UPDATE … WHERE rev = ? del almacén lo detecta igual: 409 sin rastro.
    const actual = await R.leer(db, id);
    if (!actual) return json({ ok: false, error: "no_existe" }, 404);
    datos = { ...actual, ...b.valor, id };
  }
  return responder(await R.guardar(db, datos, { actor: auth.actor, rev, motivo: motivoDe(b.valor, q) }), recurso, id);
}

async function borrar(db, { recurso, id }, request, q, auth) {
  const R = RECURSOS[recurso], b = await cuerpo(request, false);
  if (b.error) return json({ ok: false, error: b.error }, b.status);
  const rev = revDe(request, q, b.valor);
  if (!rev) return json({ ok: false, error: "rev_requerida" }, 428);
  return responder(await R.borrar(db, id, { actor: auth.actor, rev, motivo: motivoDe(b.valor, q) }), recurso, id);
}

async function verHistorial(db, { recurso, id }, meta) {
  const R = RECURSOS[recurso];
  if (!ID_RE.test(id)) return json({ ok: false, error: "no_existe" }, 404);
  const [revisiones, actual] = await Promise.all([A.historial(db, R.entidad, id), R.leer(db, id)]);
  if (!revisiones.length && !actual) return json({ ok: false, error: "no_existe" }, 404);
  const out = { ok: true, version: meta.version, tipo: R.entidad, id, actual, revisiones };
  if (R.entidad === "circuito") out.nota = `Los circuitos no guardan revisiones: su rastro está en ${BASE}/auditoria?entidad=circuito&id=${id}`;
  return json(out);
}

async function verAuditoria(db, q, meta) {
  const crudo = q.get("entidad"), entidad = crudo ? ENTIDADES_AUDITADAS[crudo] : null;
  if (crudo && !entidad) return json({ ok: false, error: "entidad_invalida" }, 400);
  const antes = q.get("antes");
  if (antes != null && antes !== "" && !(Number.isInteger(Number(antes)) && Number(antes) > 0)) return json({ ok: false, error: "antes_invalido" }, 400);
  const limite = entero(q.get("limite"), 1, MAX_LIMITE_AUDITORIA, LIMITE_AUDITORIA);
  // Se pide una de más para saber si hay otra página sin contar la tabla.
  const filas = await A.auditoria(db, { entidad, id: q.get("id") || null, actor: q.get("actor") ? q.get("actor").trim().toLowerCase() : null,
    accion: q.get("accion") || null, antes: antes ? Number(antes) : null, limite: limite + 1 });
  const entradas = filas.slice(0, limite);
  return json({ ok: true, version: meta.version, entradas, siguiente: filas.length > limite ? entradas[entradas.length - 1].id : null });
}
