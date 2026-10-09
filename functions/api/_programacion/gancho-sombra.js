// GANCHO DEL MODO SOMBRA EN EL GET DEL PLAYER (E6 · modelo único de playlists, docs/playlists-modelo-unico.md).
//
// playlist.js lo llama una vez, justo antes de responder al player (sólo si pregunta el player: fromPlayer). Aquí no
// se hace nada que pueda retrasar, cambiar o romper esa respuesta:
//   · la parte síncrona sólo mira memoria de la instancia y, si toca, encarga el trabajo a waitUntil; todo va en
//     try/catch y nunca lanza;
//   · el trabajo empieza en la tarea siguiente (setTimeout 0), cuando la respuesta ya ha salido, y tiene un plazo de
//     PLAZO_MS; un fallo o el plazo sólo dejan una línea en el log;
//   · sin waitUntil, sin el binding PROGRAMACION_DB o con la bandera apagada, no hay efecto ninguno.
//
// MUESTREO, para no gastar las escrituras de la D1 (el plan gratuito da 100.000 filas escritas al día):
//   · la bandera meta.banderas.sombra se relee como mucho una vez por minuto en cada instancia; apagada y sabida, el
//     gancho no encarga nada;
//   · cada pantalla se evalúa como mucho una vez cada 10 minutos en cada instancia (CADA_MS);
//   · la evaluación (sombra.js) sólo escribe si cambia el veredicto o una firma, la primera vez que ve la pantalla y,
//     sin cambios, para renovar la última comprobación como mucho una vez por hora.
// sombra.js se carga con import() dinámico: el GET del player no arrastra el resolver, decide() ni el comparador.
import { leerMeta } from "./almacen.js";

export const CADA_MS = 10 * 60_000;     // una evaluación por pantalla cada 10 min en cada instancia
export const BANDERA_MS = 60_000;       // la bandera se relee como mucho una vez por minuto
export const PLAZO_MS = 10_000;         // tope de una evaluación: lecturas, resolver, decide, comparación y escritura
const MAX_PANTALLAS = 2000;

const vistas = new Map();               // pantalla → instante de su última evaluación en esta instancia
let bandera = { en: 0, p: null, apagada: false }, plazo = PLAZO_MS;

/** Para las pruebas: olvida lo que esta instancia recuerda (pantallas evaluadas y bandera); `plazoMs` acorta el plazo. */
export function olvidarSombra({ plazoMs = PLAZO_MS } = {}) { vistas.clear(); olvidarBandera(); plazo = plazoMs; }
/** La bandera se vuelve a leer en la siguiente petición (la ruta de banderas lo llama al cambiarla). */
export function olvidarBandera() { bandera = { en: 0, p: null, apagada: false }; }

const reciente = (pantalla, t) => { const v = vistas.get(pantalla); return v != null && t - v < CADA_MS; };
/** Comprueba y aparta la pantalla en un solo paso (sin await entre medias: dos peticiones no evalúan dos veces). */
function reservar(pantalla, t) {
  if (reciente(pantalla, t)) return false;
  vistas.delete(pantalla); vistas.set(pantalla, t);
  for (const k of vistas.keys()) { if (vistas.size <= MAX_PANTALLAS) break; vistas.delete(k); }
  return true;
}
function leerBandera(db) {
  const t = Date.now();
  if (bandera.p && t - bandera.en < BANDERA_MS) return bandera.p;
  const actual = { en: t, p: null, apagada: false };
  actual.p = Promise.resolve().then(() => leerMeta(db))
    .then(m => !!(m && m.banderas && m.banderas.sombra === true), () => false)
    .then(activa => { actual.apagada = !activa; return activa; });
  bandera = actual;
  return actual.p;
}
const tareaSiguiente = () => new Promise(r => setTimeout(r, 0));
function conPlazo(p, ms) {
  let t;
  return Promise.race([p, new Promise((_, no) => { t = setTimeout(() => no(new Error("sombra_plazo")), ms); })]).finally(() => clearTimeout(t));
}

async function trabajo({ env, db, waitUntil, screen, q, respuesta }) {
  await tareaSiguiente();                                   // la respuesta del player sale antes de empezar
  if (!(await leerBandera(db))) return { hecho: "apagada" };
  if (!reservar(screen, Date.now())) return { hecho: "reciente" };
  const { evaluarYGuardar } = await import("./sombra.js");
  return conPlazo(evaluarYGuardar({ env, db, waitUntil, screen, q, borrador: respuesta }), plazo);
}

/**
 * Encarga, si toca, la comparación en sombra de lo que acaba de recibir el player. Devuelve true si la encargó. Nunca
 * lanza ni espera: `respuesta` es el objeto que playlist.js serializa ({ok, draft, screenTags, auto}) y aquí sólo se lee.
 */
export function sombraTrasRespuesta({ env, waitUntil, screen, q, respuesta } = {}) {
  try {
    if (typeof waitUntil !== "function" || !screen || !respuesta || respuesta.ok !== true) return false;
    const db = env && env.PROGRAMACION_DB;
    if (!db || typeof db.prepare !== "function" || typeof db.batch !== "function") return false;
    const t = Date.now();
    if (reciente(screen, t)) return false;
    if (bandera.apagada && t - bandera.en < BANDERA_MS) return false;    // apagada, sabido hace menos de un minuto
    // El trabajo sólo arranca si waitUntil lo aceptó: si lanza (contexto cerrado), no queda nada suelto.
    let arrancar;
    const encargo = new Promise(r => { arrancar = r; }).then(() => trabajo({ env, db, waitUntil, screen, q, respuesta })).catch(e => {
      try { console.error("programacion: sombra", screen, String((e && e.message) || e)); } catch (_) {}
      return { hecho: "fallo" };
    });
    waitUntil(encargo);
    arrancar();
    return true;
  } catch (_) { return false; }
}
