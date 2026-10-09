// GET/POST /api/programacion/banderas — banderas de despliegue del modelo único (E6 · docs/playlists-modelo-unico.md).
// Lo enruta la API de E4 (functions/api/programacion/[recurso]/[[resto]].js).
//
//   GET                                                     {ok, version, banderas: {motor, sombra, espejo}, editables, bloqueadas}
//   POST {"sombra"?: true|false, "espejo"?: true|false, "motivo"}  enciende o apaga (auditado: accion «banderas»)
//
// · Editables: `sombra` y `espejo` (al menos una por POST; sólo se escriben las que cambian).
//   - `sombra` (E6): el GET del player compara por detrás con el motor nuevo y registra en la tabla `sombra`
//     (gancho-sombra.js, sombra.js).
//   - `espejo` (E7): cada escritura del legado en el KV se refleja también en la D1 (espejo.js). Las demás instancias
//     la releen en menos de 30 s.
// · `motor` sólo se lee: cualquier POST que lo traiga es 409 motor_bloqueado_hasta_E13, sin escribir nada. Encender
//   el motor nuevo es el corte (E13).
// · Poner el valor que ya tiene no escribe (ni auditoría ni versión): {cambiado: false}.
// · Escribir sube meta.version (fijarBanderas de almacen.js): la memoria de GET /api/programacion se renueva una vez.
//
// ACCESO: sólo la sesión del portal con permiso digitalsignage-player, también para leer. Ni el visor (403
// solo_lectura) ni la clave de servicio de Pixeria (403 banderas_solo_sesion): una bandera la decide una persona y la
// auditoría queda a su email. Sin el binding o sin la migración, 503 como en E3 y E4 (después del acceso).
import { authHeaders } from "../../_auth-session.js";
import { autorizarSesion } from "./acceso.js";
import * as A from "./almacen.js";
import { olvidarBandera } from "./gancho-sombra.js";
import { espejoDe, olvidarBanderas as olvidarEspejo } from "./espejo.js";

export const EDITABLES = Object.freeze(["sombra", "espejo"]);
export const BLOQUEADAS = Object.freeze({ motor: "motor_bloqueado_hasta_E13" });
const MAX_CUERPO = 10_000;

const json = (value, status = 200) => Response.json(value, { status, headers: authHeaders() });
const vista = banderas => ({ motor: String((banderas && banderas.motor) || "apagado"), sombra: !!(banderas && banderas.sombra === true),
  espejo: espejoDe({ banderas }) });
const invalido = (error, campo, mensaje) => json({ ok: false, error, campo, mensaje }, 422);

async function cuerpo(request) {
  let texto;
  try { texto = await request.text(); } catch (_) { return null; }
  if (!texto.trim() || texto.length > MAX_CUERPO) return null;
  try { const v = JSON.parse(texto); return v && typeof v === "object" && !Array.isArray(v) ? v : null; } catch (_) { return null; }
}

export async function banderas({ request, env = {} }) {
  const metodo = String(request.method || "GET").toUpperCase();
  const auth = await autorizarSesion(request, env, "banderas_solo_sesion");
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
  const db = env.PROGRAMACION_DB;
  if (!db || typeof db.prepare !== "function" || typeof db.batch !== "function") return json({ ok: false, error: "programacion_db_no_configurada" }, 503);
  let meta;
  try { meta = await A.leerMeta(db); } catch (e) { console.error("programacion: meta", e); meta = null; }
  if (!meta) return json({ ok: false, error: "programacion_db_sin_esquema" }, 503);
  if (metodo === "GET") return json({ ok: true, version: meta.version, banderas: vista(meta.banderas), editables: EDITABLES, bloqueadas: BLOQUEADAS });

  const b = await cuerpo(request);
  if (!b) return json({ ok: false, error: "json_invalido" }, 400);
  if ("motor" in b) return json({ ok: false, error: BLOQUEADAS.motor, banderas: vista(meta.banderas) }, 409);
  const otra = Object.keys(b).find(k => k !== "motivo" && !EDITABLES.includes(k));
  if (otra) return invalido("bandera_desconocida", otra, `Sólo se puede cambiar: ${EDITABLES.join(", ")}.`);
  const pedidas = EDITABLES.filter(k => k in b);
  if (!pedidas.length) return invalido("bandera_requerida", "sombra", `Falta la bandera: ${EDITABLES.map(k => `{"${k}": true}`).join(" o ")}.`);
  const mala = pedidas.find(k => typeof b[k] !== "boolean");
  if (mala) return invalido("bandera_invalida", mala, `${mala} debe ser true o false.`);
  const actual = vista(meta.banderas), cambios = {};
  for (const k of pedidas) if (actual[k] !== b[k]) cambios[k] = b[k];
  if (!Object.keys(cambios).length) return json({ ok: true, cambiado: false, version: meta.version, banderas: actual });
  let r;
  try { r = await A.fijarBanderas(db, cambios, { actor: auth.actor, motivo: String(b.motivo || "") }); }
  catch (e) { console.error("programacion: banderas", e); return json({ ok: false, error: "programacion_escritura_fallida" }, 503); }
  // En esta instancia, el gancho de la sombra y el espejo las releen ya; en las demás, en menos de un minuto / 30 s.
  if ("sombra" in cambios) olvidarBandera();
  if ("espejo" in cambios) olvidarEspejo();
  return json({ ok: true, cambiado: true, version: r.version, banderas: vista(r.banderas) });
}
