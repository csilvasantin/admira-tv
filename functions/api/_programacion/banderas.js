// GET/POST /api/programacion/banderas — banderas de despliegue del modelo único (E6 · docs/playlists-modelo-unico.md).
// Lo enruta la API de E4 (functions/api/programacion/[recurso]/[[resto]].js).
//
//   GET                                   {ok, version, banderas: {motor, sombra}, editables, bloqueadas}
//   POST {"sombra": true|false, "motivo"}  enciende o apaga el modo sombra (auditado: accion «banderas»)
//
// · `sombra` es la única editable. Con ella encendida, el GET del player compara por detrás con el motor nuevo y
//   registra en la tabla `sombra` (gancho-sombra.js, sombra.js).
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

export const EDITABLES = Object.freeze(["sombra"]);
export const BLOQUEADAS = Object.freeze({ motor: "motor_bloqueado_hasta_E13" });
const MAX_CUERPO = 10_000;

const json = (value, status = 200) => Response.json(value, { status, headers: authHeaders() });
const vista = banderas => ({ motor: String((banderas && banderas.motor) || "apagado"), sombra: !!(banderas && banderas.sombra === true) });
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
  if (!("sombra" in b)) return invalido("bandera_requerida", "sombra", "Falta la bandera: {\"sombra\": true} o {\"sombra\": false}.");
  if (typeof b.sombra !== "boolean") return invalido("bandera_invalida", "sombra", "sombra debe ser true o false.");
  if (vista(meta.banderas).sombra === b.sombra) return json({ ok: true, cambiado: false, version: meta.version, banderas: vista(meta.banderas) });
  let r;
  try { r = await A.fijarBanderas(db, { sombra: b.sombra }, { actor: auth.actor, motivo: String(b.motivo || "") }); }
  catch (e) { console.error("programacion: banderas", e); return json({ ok: false, error: "programacion_escritura_fallida" }, 503); }
  olvidarBandera();   // en esta instancia, el gancho la relee ya; en las demás, en menos de un minuto
  return json({ ok: true, cambiado: true, version: r.version, banderas: vista(r.banderas) });
}
