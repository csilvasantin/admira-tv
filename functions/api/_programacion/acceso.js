// ACCESO A LA API DE PROGRAMACIÓN (E4 · modelo único de playlists, docs/playlists-modelo-unico.md).
//
// LECTURA. La misma postura que /api/emision y GET /api/programacion (autorizar de emision.js), sin la puerta pública
// de las pantallas virtuales (aquí no hay pantalla): la sesión del portal con permiso digitalsignage-player o la
// sesión de lectura viva (el visor, que /auth/session admite en digitalsignage-player). Devuelve `lectura: true` para
// el visor, y la ruta le cierra lo que lleva emails de actores (historial y auditoría).
//
// ESCRITURA. La sesión del portal con permiso digitalsignage-player (actor = su email) o la clave de servicio de
// Pixeria (actor = servicio:<X-Actor o «pixeria»), server to server:
//   · va en X-Programacion-Key (la recomendada) o en Authorization: Bearer <clave>; nunca en la URL ni en el body;
//   · se compara en tiempo constante con env.PROGRAMACION_SERVICE_KEY (un secreto de Pages: lo pone Carlos);
//   · sin ese secreto, la clave de servicio está apagada (no es un error: sólo vale la sesión).
// La sesión de lectura (visor) no escribe: 403 solo_lectura, igual que el guarda global de functions/_middleware.js.
//
// SÓLO SESIÓN (autorizarSesion, E6). Para lo que decide una persona y queda a su nombre, como las banderas de
// despliegue: la sesión del portal con permiso; ni el visor ni la clave de servicio, ni siquiera para leer.
import { accessFor, readSession } from "../../_auth-session.js";
import { lecturaStillLive } from "../../_lectura-guard.js";

export const PROYECTO = "digitalsignage-player";
export const CABECERA_CLAVE = "X-Programacion-Key";
const ACTOR_SERVICIO = "pixeria";

const norm = v => String(v == null ? "" : v).trim().toLowerCase();
const sin = (status, error) => ({ ok: false, status, error });

/** Lectura: sesión del portal con permiso, o sesión de lectura viva. 401 sin sesión; 403 sin permiso. */
export async function autorizarLectura(request, env) {
  const session = await readSession(request, env).catch(() => null);
  if (!session) return sin(401, "unauthorized");
  if (session.lectura) return (await lecturaStillLive(session)) ? { ok: true, actor: norm(session.email), lectura: true } : sin(401, "unauthorized");
  const access = await accessFor(env, session.email, PROYECTO, false);
  return access.allowed ? { ok: true, actor: norm(session.email) } : sin(403, "forbidden");
}

/** Escritura: clave de servicio válida, o sesión del portal con permiso. 401 sin ninguna; 403 sin permiso o visor. */
export async function autorizarEscritura(request, env) {
  const servicio = await actorDeServicio(request, env);
  if (servicio) return { ok: true, actor: servicio, servicio: true };
  const session = await readSession(request, env).catch(() => null);
  if (!session) return sin(401, "unauthorized");
  if (session.lectura) return sin(403, "solo_lectura");
  const access = await accessFor(env, session.email, PROYECTO, false);
  return access.allowed ? { ok: true, actor: norm(session.email) } : sin(403, "forbidden");
}

/**
 * Sólo la sesión del portal con permiso: ni el visor (403 solo_lectura) ni la clave de servicio (403 `codigoServicio`).
 * Para lo que decide una persona y queda a su nombre, como las banderas de despliegue (E6). 401 sin nada.
 */
export async function autorizarSesion(request, env, codigoServicio = "solo_sesion") {
  const session = await readSession(request, env).catch(() => null);
  if (!session) return (await actorDeServicio(request, env)) ? sin(403, codigoServicio) : sin(401, "unauthorized");
  if (session.lectura) return sin(403, "solo_lectura");
  const access = await accessFor(env, session.email, PROYECTO, false);
  return access.allowed ? { ok: true, actor: norm(session.email) } : sin(403, "forbidden");
}

/** La clave que trae la petición: X-Programacion-Key o Authorization: Bearer. */
function claveDada(request) {
  const propia = String(request.headers.get(CABECERA_CLAVE) || "").trim();
  if (propia) return propia.slice(0, 512);
  const m = /^Bearer\s+(\S+)$/i.exec(String(request.headers.get("Authorization") || "").trim());
  return m ? m[1].slice(0, 512) : "";
}

/** servicio:<X-Actor o «pixeria»> si la clave es la buena; null si no hay clave, no casa o el secreto no está puesto. */
export async function actorDeServicio(request, env) {
  const esperada = env && typeof env.PROGRAMACION_SERVICE_KEY === "string" ? env.PROGRAMACION_SERVICE_KEY : "";
  const dada = claveDada(request);
  if (!esperada || !dada || !(await mismaClave(dada, esperada))) return null;
  const quien = norm(request.headers.get("X-Actor")).replace(/\s+/g, "-").replace(/[^a-z0-9._@#-]/g, "").slice(0, 60);
  return "servicio:" + (quien || ACTOR_SERVICIO);
}

/**
 * Comparación en tiempo constante: se comparan los SHA-256 de las dos (siempre 32 bytes), así que ni el contenido ni
 * la longitud de la clave esperada se filtran por el tiempo de respuesta.
 */
export async function mismaClave(dada, esperada) {
  if (!dada || !esperada) return false;
  const resumen = async s => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(s))));
  const [a, b] = await Promise.all([resumen(dada), resumen(esperada)]);
  let diferencia = 0;
  for (let i = 0; i < a.length; i += 1) diferencia |= a[i] ^ b[i];
  return diferencia === 0;
}
