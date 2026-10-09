// POST /api/programacion/importar[?aplicar=1][&pisar=1][&archivar=1][&cursor=…][&limite=N][&muestra=N]
//
// IMPORTADOR DEL LEGADO (E5 · modelo único de playlists, docs/playlists-modelo-unico.md). Lo enruta la API de E4
// (functions/api/programacion/[recurso]/[[resto]].js); el plan lo hace importador.js, que es puro.
//
//   · Por defecto es una SIMULACIÓN: lee el KV y la D1 y devuelve el plan (cuentas por entidad, una muestra de
//     operaciones, fuentes omitidas y huérfanos) sin escribir nada.
//   · Con ?aplicar=1 lo ejecuta con almacen.js —cada escritura es su db.batch con bloqueo optimista, revisión,
//     auditoría y meta.version + 1— y el actor de la auditoría es importador:<email>.
//   · Lo importado que luego se editó por otro camino no se toca (`omitir` · `editado_fuera`) salvo con ?pisar=1. La
//     simulación y la aplicación respetan las mismas opciones: lo que se simula es lo que se aplica.
//   · Los huérfanos sólo se informan; con ?archivar=1, las asignaciones huérfanas del importador se archivan (estado
//     «archivada»). Nada se borra nunca.
//
// LEE EL KV (ACCESS), NUNCA LO ESCRIBE: sólo get y list. El documento de vivas (admira-tv:playlist:live:v1, con sus
// circuitos) va en el primer tramo; los borradores «Por defecto» (admira-tv:playlist:default:v1:<pantalla>) se leen
// por páginas de `limite` claves (50 por defecto, 100 como mucho) con el cursor de KV.list. Cada tramo escribe como
// mucho MAX_ESCRITURAS en la D1; si su plan tiene más, `siguiente` repite el mismo tramo y, como el plan es
// idempotente, lo ya escrito sale `igual` y sigue lo que falta. Se repite con `cursor=<siguiente>` hasta
// `completo: true`. En el último tramo se listan todas las claves de borrador para informar los huérfanos.
//
// ACCESO: sólo la sesión del portal con permiso digitalsignage-player. La clave de servicio de Pixeria no abre el
// importador (403 importador_solo_sesion) y el visor tampoco (403 solo_lectura). Sin el binding o sin la migración,
// 503 como en E3 y E4 (después del acceso).
import { accessFor, authHeaders, readSession } from "../../_auth-session.js";
import { LIVE_KEY } from "../_playlist-live.js";
import { DRAFT_PREFIX } from "../playlist.js";
import { PROYECTO, actorDeServicio } from "./acceso.js";
import * as A from "./almacen.js";
import { ACTOR, ESCRIBEN, idsNecesarios, planificar, sinDatos, traducir } from "./importador.js";
import { espejoDe } from "./espejo.js";

// Escrituras en la D1 por petición: un db.batch de 5 a 10 sentencias cada una (almacen.js). Con 50 se queda lejos del
// tope de 1000 consultas por invocación de Workers, aunque D1 contara cada sentencia del batch por separado.
export const MAX_ESCRITURAS = 50;
const LIMITE_DEFECTO = 50, MAX_LIMITE = 100;       // borradores por tramo (un KV.get cada uno)
const MUESTRA_DEFECTO = 25, MAX_MUESTRA = 500, MAX_LISTA = 500;
const MAX_PAGINAS_CLAVES = 20;                     // 20 × 1000 claves de borrador como mucho para los huérfanos
const DIAS_ESPEJO = 7;                             // ventana de las marcas de la doble escritura (E7) que se cuentan
const GUARDAR = { playlist: A.guardarPlaylist, asignacion: A.guardarAsignacion, circuito: A.guardarCircuito };

const json = (value, status = 200) => Response.json(value, { status, headers: authHeaders() });
const entero = (v, min, max, def) => { const n = Math.floor(Number(v)); return v != null && v !== "" && Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def; };
const sin = (status, error) => ({ ok: false, status, error });

/** Sólo la sesión del portal con digitalsignage-player. 401 sin sesión; 403 al visor, sin permiso o con sólo la clave. */
export async function autorizarImportador(request, env) {
  const session = await readSession(request, env).catch(() => null);
  if (!session) return (await actorDeServicio(request, env)) ? sin(403, "importador_solo_sesion") : sin(401, "unauthorized");
  if (session.lectura) return sin(403, "solo_lectura");
  const email = String(session.email || "").trim().toLowerCase();
  const access = await accessFor(env, email, PROYECTO, false);
  return access.allowed ? { ok: true, actor: ACTOR + email } : sin(403, "forbidden");
}

// ── Cursor: qué tramo toca. {v, vivas: si el tramo lleva el documento de vivas, kv: cursor de KV.list o null} ──────
const aB64url = texto => btoa(String.fromCharCode(...new TextEncoder().encode(texto))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const deB64url = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4)), c => c.charCodeAt(0)));
const aCursor = tramo => aB64url(JSON.stringify({ v: 1, vivas: !!tramo.vivas, kv: tramo.kv || null }));
function deCursor(texto) {
  if (texto == null || texto === "") return { vivas: true, kv: null };
  try {
    const c = JSON.parse(deB64url(String(texto).slice(0, 4096)));
    if (c && c.v === 1 && typeof c.vivas === "boolean" && (c.kv === null || typeof c.kv === "string")) return { vivas: c.vivas, kv: c.kv };
  } catch (_) {}
  return null;
}

// ── Lecturas del KV (sólo get y list) ───────────────────────────────────────────────────────────────────────────
async function leerTramo(kv, tramo, limite) {
  const pagina = await kv.list({ prefix: DRAFT_PREFIX, limit: limite, ...(tramo.kv ? { cursor: tramo.kv } : {}) });
  const claves = ((pagina && pagina.keys) || []).map(k => k.name).filter(n => typeof n === "string" && n.startsWith(DRAFT_PREFIX));
  const valores = await Promise.all(claves.map(c => kv.get(c)));
  const borradores = claves.map((clave, i) => ({ clave, pantalla: clave.slice(DRAFT_PREFIX.length), valor: valores[i] }));
  const live = tramo.vivas ? await kv.get(LIVE_KEY) : undefined;
  const fin = !!(pagina && pagina.list_complete) || !(pagina && pagina.cursor);
  return { borradores, live, fin, siguienteKv: fin ? null : pagina.cursor };
}
/** Todas las pantallas con clave de borrador (para los huérfanos). null si hay más de las que se listan. */
async function todasLasPantallas(kv) {
  const out = [];
  let cursor;
  for (let i = 0; i < MAX_PAGINAS_CLAVES; i += 1) {
    const p = await kv.list({ prefix: DRAFT_PREFIX, limit: 1000, ...(cursor ? { cursor } : {}) });
    for (const k of (p && p.keys) || []) if (String(k.name).startsWith(DRAFT_PREFIX)) out.push(k.name.slice(DRAFT_PREFIX.length));
    if ((p && p.list_complete) || !(p && p.cursor)) return out;
    cursor = p.cursor;
  }
  return null;
}

// ── Ruta ────────────────────────────────────────────────────────────────────────────────────────────────────────
export async function importar({ request, env = {} }) {
  const q = new URL(request.url).searchParams;
  const auth = await autorizarImportador(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
  const db = env.PROGRAMACION_DB;
  if (!db || typeof db.prepare !== "function" || typeof db.batch !== "function") return json({ ok: false, error: "programacion_db_no_configurada" }, 503);
  let meta;
  try { meta = await A.leerMeta(db); } catch (e) { console.error("programacion: importar meta", e); meta = null; }
  if (!meta) return json({ ok: false, error: "programacion_db_sin_esquema" }, 503);
  const kv = env.ACCESS;
  if (!kv || typeof kv.get !== "function" || typeof kv.list !== "function") return json({ ok: false, error: "kv_no_disponible" }, 503);

  const aplicar = q.get("aplicar") === "1", opciones = { pisar: q.get("pisar") === "1", archivar: q.get("archivar") === "1" }, tramo = deCursor(q.get("cursor"));
  if (!tramo) return json({ ok: false, error: "cursor_invalido" }, 400);
  const limite = entero(q.get("limite"), 1, MAX_LIMITE, LIMITE_DEFECTO), muestra = entero(q.get("muestra"), 0, MAX_MUESTRA, MUESTRA_DEFECTO);

  let leido, pantallas = null;
  try {
    leido = await leerTramo(kv, tramo, limite);
    // Último tramo: las claves de todos los borradores, para decir qué hay en la D1 que ya no está en el KV.
    if (leido.fin) pantallas = !tramo.kv ? leido.borradores.map(b => b.pantalla) : await todasLasPantallas(kv);
  } catch (e) {
    console.error("programacion: importar kv", e);
    return json({ ok: false, error: "kv_lectura_fallida" }, 503);
  }

  let plan;
  try {
    const traduccion = traducir({ live: leido.live, borradores: leido.borradores });
    const d1 = await A.leerParaImportar(db, idsNecesarios(traduccion));
    plan = planificar({ traduccion, pantallas, d1, ...opciones });
  } catch (e) {
    console.error("programacion: importar lectura", e);
    return json({ ok: false, error: "programacion_lectura_fallida" }, 503);
  }

  const cuerpo = {
    ok: true, modo: aplicar ? "aplicado" : "simulacion", opciones, version: meta.version,
    tramo: { vivas: tramo.vivas ? plan.vivas : "fuera_del_tramo", borradores: leido.borradores.length, continuacion: !!tramo.kv },
    resumen: plan.resumen,
    // Doble escritura (E7): su bandera y las marcas que dejó en la auditoría (fallos y omisiones: editado_fuera…).
    espejo: await resumenDelEspejo(db, meta),
  };
  let pendientes = 0;
  if (aplicar) {
    const r = await ejecutar(db, plan.operaciones, auth.actor);
    if (r.error) return json({ ok: false, error: "programacion_escritura_fallida", aplicadas: r.aplicadas, fallidas: r.fallidas }, 503);
    pendientes = r.pendientes;
    Object.assign(cuerpo, { ok: !r.fallidas.length, version_antes: meta.version, version: r.version ?? meta.version, aplicadas: r.aplicadas, fallidas: r.fallidas, pendientes });
  }
  // Mismo tramo si quedan escrituras (el plan se rehace: lo ya escrito sale igual); si no, el siguiente; si no, fin.
  const siguiente = pendientes ? aCursor(tramo) : leido.fin ? null : aCursor({ vivas: false, kv: leido.siguienteKv });
  return json({
    ...cuerpo,
    muestra: plan.operaciones.filter(op => op.accion !== "igual").concat(plan.operaciones.filter(op => op.accion === "igual")).slice(0, muestra).map(sinDatos),
    omitidas: plan.omitidas.slice(0, MAX_LISTA), huerfanos: plan.huerfanos.slice(0, MAX_LISTA),
    huerfanos_borradores: leido.fin ? (pantallas ? "comprobados" : "sin_comprobar") : "en_el_ultimo_tramo",
    completo: !siguiente, siguiente,
  });
}

/** La bandera del espejo y sus marcas de los últimos DIAS_ESPEJO días. Sólo SELECT; si falla, null (no tumba el importador). */
async function resumenDelEspejo(db, meta) {
  try { return { bandera: espejoDe(meta), dias: DIAS_ESPEJO, ...(await A.resumenEspejo(db, { desde: Date.now() - DIAS_ESPEJO * 86_400_000 })) }; }
  catch (e) { console.error("programacion: importar espejo", e); return null; }
}

/** Ejecuta las escrituras del plan, en orden y con tope. Nunca borra: sólo guardar* de almacen.js (archivar es guardar con
 *  estado «archivada» y la rev de la fila). */
async function ejecutar(db, operaciones, actor) {
  const aplicadas = { crear: 0, actualizar: 0, archivar: 0 }, fallidas = [];
  let hechas = 0, pendientes = 0, version = null;
  for (const op of operaciones) {
    if (!ESCRIBEN.has(op.accion)) continue;
    if (hechas >= MAX_ESCRITURAS) { pendientes += 1; continue; }
    hechas += 1;
    let r;
    try {
      r = await GUARDAR[op.entidad](db, op.datos, { actor, rev: op.accion === "crear" ? 0 : op.rev, motivo: "importador E5 · " + op.ref + (op.accion === "archivar" ? " · archivada: " + op.motivo : "") });
    } catch (e) {
      console.error("programacion: importar escritura", e);
      return { error: true, aplicadas, fallidas };
    }
    if (r.ok) { aplicadas[op.accion] += 1; version = r.version; op.resultado = { status: r.status, rev: r[op.entidad].rev }; }
    else { op.resultado = { status: r.status, error: r.error }; fallidas.push({ entidad: op.entidad, id: op.id, ref: op.ref, accion: op.accion, status: r.status, error: r.error }); }
  }
  return { aplicadas, fallidas, pendientes, version };
}
