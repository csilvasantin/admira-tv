// DOBLE ESCRITURA (E7 · modelo único de playlists, docs/playlists-modelo-unico.md). Lo que hoy se guarda en el KV por
// POST /api/playlist —la parrilla, /parrilla/ en modo playlists, el Stock y players-programar de Pixeria— se escribe
// también en la D1 «admira-programacion» hasta el corte (E13).
//
//   · EL KV VA PRIMERO Y SIGUE MANDANDO. playlist.js guarda en el KV y, justo antes de devolver su respuesta, llama a
//     espejar(). Ésta sólo mira si hay binding: el trabajo empieza en una microtarea y queda en waitUntil, así que la
//     respuesta del legado es la misma (ni un campo ni una cabecera de más) y su latencia no cambia. espejar() no lanza
//     nunca; un fallo de la D1 sólo llega al log y a la auditoría.
//   · LA MISMA TRADUCCIÓN QUE EL IMPORTADOR. traducir() + planificar() de importador.js (con legado.js debajo), con
//     `archivar` y sin `pisar`, acotado a lo que toca la escritura:
//       - un borrador «Por defecto» → playlist defecto-<pantalla> + su asignación directa; vaciado → se ARCHIVA la
//         asignación (nunca se borra), como ?archivar=1;
//       - el documento de vivas (live-save, live-delete, circuit-save, circuit-delete) → TODAS sus vivas, con el peso
//         N, N−1, … del importador, y todos sus circuitos (destino_excede_limite incluido: se omite, no se recorta). Las
//         asignaciones de las vivas que ya no están se archivan; los circuitos que ya no están se APAGAN (activo:
//         false, nunca se borran: desviación 41), con la misma regla que el importador con ?archivar=1.
//     Lo escrito es lo que escribiría una importación completa del mismo KV: la simulación del importador sale `igual`.
//   · EL ACTOR es importador:espejo:<email o servicio>, así el importador sigue tomando esas filas por suyas (desviación
//     33). Quién guardó en el KV va en el motivo («espejo E7 · <ref> · <acción> · por <quien>»).
//   · NO PISA LO DE OTROS. Lo editado fuera (API de E4: `actualizado_por` que no es importador:…) no se escribe y queda
//     `espejo_omitido` · editado_fuera en la auditoría, como el importador sin ?pisar=1. Igual con lo ajeno (id_ocupado,
//     ajena) y con lo que llega tarde: si la fila de la D1 es más nueva que la escritura del KV (otro espejo o el
//     importador ya escribieron algo posterior), `espejo_omitido` · obsoleto. Las escrituras van con `ahora` = la hora
//     del KV (updatedAt), así que actualizado_en en la D1 es la del legado; un 409 se reintenta releyendo.
//   · UN FALLO NO SE PIERDE. Si la D1 falla (o tarda más de PLAZO_MS), queda `espejo_fallido` en la auditoría (si la D1
//     aún acepta esa fila; si no, sólo el log). La reconciliación es el importador: simular y, si hay escrituras,
//     ?aplicar=1. Es idempotente.
//   · BANDERA meta.banderas.espejo, apagada por defecto. Se recuerda por instancia MEMORIA_MS y por meta.version: con la
//     memoria caliente y la bandera apagada, el espejo no toca la D1; en frío, una sola lectura de la fila de meta. Con
//     la bandera encendida no hay lectura de más: la de los datos trae también meta y vuelve a mirar la bandera.
//   · LOS BORRADORES SINTÉTICOS NUNCA SE REFLEJAN: no son datos guardados (los compone el GET en cada consulta).
import * as A from "./almacen.js";
import { idDefecto, idViva, vivasDe } from "./legado.js";
import { ACTOR, ESCRIBEN, idsNecesarios, planificar, refBorrador, refCircuito, refViva, traducir } from "./importador.js";
import { slugId } from "./modelo.js";

export const ACTOR_ESPEJO = ACTOR + "espejo:";
export const BANDERA = "espejo";
export const MEMORIA_MS = 30_000;          // cuánto se fía una instancia de la bandera que leyó
export const PLAZO_MS = 15_000;            // tope del espejo entero (waitUntil da 30 s tras la respuesta)
const PLAZO_MARCA_MS = 5_000, INTENTOS = 3;
const GUARDAR = { playlist: A.guardarPlaylist, asignacion: A.guardarAsignacion, circuito: A.guardarCircuito };
// Lo que la traducción omite y merece marca: lo normal (sintético, vacío, ilegible) no la lleva.
const OMISIONES_RARAS = new Set(["invalido", "destino_excede_limite", "ref_duplicada", "id_duplicado", "pantalla_invalida"]);

const codigo = e => String((e && e.message) || e || "error").slice(0, 200);

// ── Bandera ─────────────────────────────────────────────────────────────────────────────────────────────────────
/** ¿La bandera dice «encendido»? Tolera booleano, número o texto (true, 1, "1", "on", "si", "encendido"). */
export const encendida = v => v === true || v === 1 || /^(1|true|on|si|sí|encendid[oa])$/i.test(String(v == null ? "" : v).trim());
/** La bandera espejo de una fila de meta (la de leerMeta); apagada si falta. */
export const espejoDe = meta => encendida(A.bandera(meta, BANDERA, false));
let memoria = null;   // {en, version, encendido}
function recuerda(meta, ahora = Date.now()) {
  if (!meta) return false;
  const version = Number(meta.version) || 0, encendido = espejoDe(meta);
  // Una lectura rezagada (versión anterior a la recordada) no pisa lo más nuevo.
  if (!memoria || version >= memoria.version) memoria = { en: ahora, version, encendido };
  return encendido;
}
async function espejoEncendido(db) {
  const ahora = Date.now();
  if (memoria && ahora - memoria.en < MEMORIA_MS) return memoria.encendido;
  return recuerda(await A.leerMeta(db), ahora);
}
/** Para las pruebas: olvida la bandera recordada en esta instancia. */
export function olvidarBanderas() { memoria = null; }

// ── Actor y motivo ──────────────────────────────────────────────────────────────────────────────────────────────
/** El actor del legado (un email de sesión o «pixeria-stock · <origen>») → importador:espejo:<email o servicio>. */
export function actorEspejo(legado) {
  const t = String(legado || "").trim().toLowerCase();
  const quien = t.includes("@") ? t.replace(/\s+/g, "") : t.split("·")[0].trim().replace(/[^a-z0-9._#-]+/g, "-").replace(/^-+|-+$/g, "");
  return ACTOR_ESPEJO + (quien || "desconocido").slice(0, 80);
}
const motivoDe = (op, base) => "espejo E7 · " + op.ref
  + (op.accion === "archivar" ? (op.entidad === "circuito" ? " · apagado: " : " · archivada: ") + op.motivo : "")
  + " · " + base.origen + " · por " + (base.por || "?");

// ── El cambio del legado ────────────────────────────────────────────────────────────────────────────────────────
const comoTexto = v => (typeof v === "string" ? v : JSON.stringify(v == null ? null : v));
const leer = texto => { try { return JSON.parse(texto); } catch (_) { return null; } };
/** Huella de cada fuente del documento de vivas: una viva cambia si cambia ella o su posición (su peso). */
function huellas(doc) {
  const m = new Map(), lista = vivasDe(doc);
  lista.forEach((p, i) => m.set(refViva(p.id), JSON.stringify([p, i, lista.length])));
  for (const c of Array.isArray(doc && doc.circuits) ? doc.circuits : []) {
    if (!c || !c.id) continue;
    const h = JSON.stringify(c);
    m.set(refCircuito(c.id), h);
    m.set(refCircuito(slugId(c.id)), h);
  }
  return m;
}
function tocadas(antes, despues) {
  const a = huellas(antes), d = huellas(despues), out = new Set();
  for (const [k, v] of d) if (a.get(k) !== v) out.add(k);
  for (const k of a.keys()) if (!d.has(k)) out.add(k);
  return out;
}
/**
 * {borrador: {pantalla, valor}} o {vivas: {antes, despues, accion}} → lo que hace falta para reflejarlo. `valor` y
 * `despues` son lo que se acaba de guardar en el KV (objeto o el mismo texto).
 */
function preparar(cambio) {
  if (cambio && cambio.borrador) {
    const pantalla = String(cambio.borrador.pantalla || ""), texto = comoTexto(cambio.borrador.valor), draft = leer(texto);
    const ref = refBorrador(pantalla), id = idDefecto(pantalla);
    return { origen: "borrador", ref, marca: { entidad: "asignacion", id: id || "?" }, sintetico: !!(draft && draft.synthetic === true),
      en: Number(draft && draft.updatedAt) || Date.now(), vivas: false, tocadas: new Set([ref]),
      traducir: () => traducir({ borradores: [{ pantalla, valor: texto }] }),
      lectura: () => ({ refs: [ref], asignaciones: [id], playlists: [id] }) };
  }
  if (cambio && cambio.vivas) {
    const texto = comoTexto(cambio.vivas.despues), doc = leer(texto);
    return { origen: String(cambio.vivas.accion || "live-save").slice(0, 40), ref: "kv:live", marca: { entidad: "meta", id: "espejo" }, sintetico: false,
      en: Number(doc && doc.updatedAt) || Date.now(), vivas: true, tocadas: tocadas(cambio.vivas.antes, doc),
      traducir: () => traducir({ live: texto }),
      lectura: t => ({ ...idsNecesarios(t), vivas: true }) };
  }
  return null;
}
const entidadDeRef = ref => {
  const [, tipo, ...resto] = String(ref).split(":"), id = resto.join(":");
  if (tipo === "circuito") return { entidad: "circuito", id: slugId(id) || id };
  if (tipo === "viva") return { entidad: "playlist", id: idViva(id) };
  return { entidad: "playlist", id: idDefecto(id) };
};

// ── Espejo ──────────────────────────────────────────────────────────────────────────────────────────────────────
function conPlazo(promesa, ms) {
  let reloj;
  promesa.catch(() => {});   // si gana el reloj, su rechazo posterior no queda sin atender
  const tope = new Promise((_, no) => { reloj = setTimeout(() => no(Object.assign(new Error("tiempo_agotado"), { tiempo: true })), ms); });
  return Promise.race([promesa, tope]).finally(() => clearTimeout(reloj));
}
async function marcar(db, actor, marcas) {
  if (!marcas.length) return;
  const ahora = Date.now();
  try { await conPlazo(A.anotarAuditoria(db, marcas.map(m => ({ actor, ahora, ...m }))), PLAZO_MARCA_MS); }
  catch (e) { console.error("programacion: espejo sin marca", JSON.stringify(marcas.map(m => [m.accion, m.entidad, m.id, m.detalle && m.detalle.motivo])), e); }
}

async function aplicar(db, c, actor, base) {
  const traduccion = c.traducir(), lectura = c.lectura(traduccion);
  for (let intento = 1; ; intento += 1) {
    const d1 = await A.leerParaEspejo(db, lectura);
    // La misma lectura trae meta: si la bandera se apagó entretanto, no se escribe nada.
    if (!recuerda(d1.meta)) return { estado: "apagado" };
    const plan = planificar({ traduccion, d1, archivar: true }), ops = plan.operaciones;
    const filas = { playlist: new Map(d1.playlists.map(f => [f.id, f])), asignacion: new Map(d1.asignaciones.map(f => [f.id, f])), circuito: new Map(d1.circuitos.map(f => [f.id, f])) };
    const escritas = [], obsoletas = [], fallidas = [];
    let conflicto = false, version = null;
    for (const op of ops) {
      if (!ESCRIBEN.has(op.accion)) continue;
      const fila = filas[op.entidad].get(op.id);
      // Llega tarde: la fila ya tiene algo posterior a esta escritura del KV. No se pisa lo más nuevo con lo viejo.
      if (op.accion !== "crear" && fila && Number(fila.actualizado_en) > c.en) { obsoletas.push(op); continue; }
      const r = await GUARDAR[op.entidad](db, op.datos, { actor, rev: op.accion === "crear" ? 0 : op.rev, ahora: c.en, motivo: motivoDe(op, base) });
      if (r.ok) { escritas.push({ entidad: op.entidad, id: op.id, accion: op.accion, rev: r[op.entidad].rev }); version = r.version; continue; }
      // Otro escribió entretanto: se relee y se vuelve a planificar (lo ya escrito sale igual).
      if (r.status === 409 && intento < INTENTOS) { conflicto = true; break; }
      fallidas.push({ ...op, status: r.status, error: r.error });
    }
    if (conflicto) continue;

    const marcas = [];
    const detalle = (op, extra = {}) => ({ ...base, ref: op.ref, ...extra });
    for (const op of ops) {
      if (op.accion !== "omitir" || !c.tocadas.has(op.ref)) continue;
      marcas.push({ accion: "espejo_omitido", entidad: op.entidad, id: op.id, rev: op.rev ?? null,
        detalle: detalle(op, { motivo: op.motivo, cambios: op.cambios || [], actualizado_por: op.actualizado_por || "" }) });
    }
    for (const o of traduccion.omitidas) {
      if (!OMISIONES_RARAS.has(o.motivo) || !c.tocadas.has(o.ref)) continue;
      marcas.push({ accion: "espejo_omitido", ...entidadDeRef(o.ref), rev: null, detalle: detalle(o, { motivo: o.motivo, error: o.error || "" }) });
    }
    for (const op of obsoletas) marcas.push({ accion: "espejo_omitido", entidad: op.entidad, id: op.id, rev: op.rev ?? null, detalle: detalle(op, { motivo: "obsoleto", cambios: op.cambios || [] }) });
    for (const op of fallidas) marcas.push({ accion: "espejo_fallido", entidad: op.entidad, id: op.id, rev: op.rev ?? null,
      detalle: detalle(op, { motivo: op.status === 409 ? "conflicto" : "rechazada", status: op.status, error: op.error }) });
    if (fallidas.length) console.error("programacion: espejo rechazado", JSON.stringify(fallidas.map(f => [f.entidad, f.id, f.status, f.error])));
    await marcar(db, actor, marcas);
    return { estado: fallidas.length ? "fallido" : "hecho", escritas, omitidas: marcas.filter(m => m.accion === "espejo_omitido").map(m => ({ entidad: m.entidad, id: m.id, motivo: m.detalle.motivo })),
      fallidas: fallidas.map(f => ({ entidad: f.entidad, id: f.id, status: f.status, error: f.error })), intentos: intento, version };
  }
}

/** El espejo de una escritura del legado, de principio a fin. Devuelve lo que pasó; sólo lanza si falla la D1. */
export async function reflejar(db, cambio, { plazoMs = PLAZO_MS } = {}) {
  const c = preparar(cambio);
  if (!c) return { estado: "ignorado" };
  if (c.sintetico) return { estado: "sintetico" };
  if (!(await espejoEncendido(db))) return { estado: "apagado" };
  const actor = actorEspejo(cambio.actor), base = { origen: c.origen, por: String(cambio.actor || "").slice(0, 120) };
  try {
    return await conPlazo(aplicar(db, c, actor, base), plazoMs);
  } catch (e) {
    console.error("programacion: espejo fallido", c.ref, e);
    await marcar(db, actor, [{ accion: "espejo_fallido", ...c.marca, rev: null, detalle: { ...base, ref: c.ref, motivo: e && e.tiempo ? "tiempo_agotado" : "fallo_d1", error: codigo(e) } }]);
    return { estado: "fallido", error: codigo(e) };
  }
}

/**
 * La llamada que hace playlist.js tras guardar en el KV y construir su respuesta:
 *   espejar({env, waitUntil}, {borrador: {pantalla, valor}, actor})
 *   espejar({env, waitUntil}, {vivas: {antes, despues, accion}, actor})
 * Sin PROGRAMACION_DB no hace nada. El trabajo queda en waitUntil (sin él, corre suelto). Nunca lanza: devuelve una
 * promesa que siempre se cumple con lo que pasó (las pruebas la esperan; playlist.js no).
 */
export function espejar({ env, waitUntil } = {}, cambio = {}, opciones = {}) {
  const db = env && env.PROGRAMACION_DB;
  if (!db || typeof db.prepare !== "function" || typeof db.batch !== "function") return Promise.resolve({ estado: "sin_d1" });
  const trabajo = Promise.resolve().then(() => reflejar(db, cambio, opciones)).catch(e => {
    console.error("programacion: espejo", e);
    return { estado: "error", error: codigo(e) };
  });
  if (typeof waitUntil === "function") { try { waitUntil(trabajo); } catch (_) {} }
  return trabajo;
}
