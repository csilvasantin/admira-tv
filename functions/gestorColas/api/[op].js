// /gestorColas/api/<op>?sala=… — estado | listar | pedido (públicas; con sesión o clave, con detalle) · crear | avanzar | llamar | reiniciar
// (sesión Admira o clave de sala) · clave (solo sesión Admira: entrega la clave de la sala para el staff).
import { salaDe, operar, ESCRIBE, autoriza, claveDe, urls, json } from "../_lib.js";

// Memoria por instancia de la lectura pública. `ahora` (el reloj del relé, con el que la pantalla calcula el
// avance) se adelanta lo que lleve guardada la respuesta, para que la barra de «recibido» no dé saltos.
export const ESTADO_TTL = 1500;
const memoria = new Map();
const pendientes = new Map();
export function olvidaEstado(sala) {
  if (sala) { memoria.delete(sala); pendientes.delete(sala); }
  else { memoria.clear(); pendientes.clear(); }
}
async function estadoPublico(env, sala) {
  const m = memoria.get(sala), edad = m ? Date.now() - m.t : Infinity;
  if (m && edad < ESTADO_TTL) { const t = Date.parse(m.d.ahora); return t ? { ...m.d, ahora: new Date(t + edad).toISOString() } : m.d; }
  if (pendientes.has(sala)) return pendientes.get(sala);
  const lectura = operar(env, "estado", sala, {}, { auth: false }).then(d => {
    // An earlier read must not repopulate the cache after a successful write.
    if (pendientes.get(sala) === lectura) {
      if (memoria.size > 200) memoria.clear();
      memoria.set(sala, { t: Date.now(), d });
    }
    return d;
  }).finally(() => { if (pendientes.get(sala) === lectura) pendientes.delete(sala); });
  pendientes.set(sala, lectura);
  return lectura;
}

export async function onRequest({ request, env, params }) {
  if (request.method === "OPTIONS") return json({ ok: true });
  const u = new URL(request.url), op = String(params.op || "");
  const body = request.method === "POST" ? await request.json().catch(() => ({})) : {};
  let sala; try { sala = salaDe(body.sala || u.searchParams.get("sala") || u.searchParams.get("store"), body.marca || u.searchParams.get("marca")); } catch (e) { return json({ ok: false, error: e.message }, 400); }
  try {
    if (op === "clave") {
      const a = await autoriza(request, env, sala, "");
      if (!a.ok || a.via !== "sesion") return json({ ok: false, error: "inicia sesión en Admira para ver la clave" }, 401);
      return json({ ok: true, sala, clave: await claveDe(env, sala), urls: urls(sala) });
    }
    // Escrituras: sesión Admira o clave de sala. Lecturas: públicas, pero solo con esa misma autorización
    // viaja la clave de barra al relé y vuelve el detalle (líneas, nombre completo).
    const a = await autoriza(request, env, sala, body.clave || u.searchParams.get("clave"));
    if (ESCRIBE.has(op)) {
      if (request.method !== "POST") return json({ ok: false, error: "usa POST" }, 405);
      if (!a.ok) return json({ ok: false, error: "falta la clave de la sala o la sesión Admira" }, 401);
    }
    // ?publico=1 (la pantalla pública): nunca detalle, aunque el navegador tenga sesión Admira.
    const publico = u.searchParams.get("publico") === "1" && !ESCRIBE.has(op);
    const args = { ...Object.fromEntries(u.searchParams), ...body }; delete args.clave; delete args.publico;
    // Lectura de la pantalla pública (?publico=1): cada pantalla pregunta cada pocos segundos y todas reciben
    // lo mismo, así que la respuesta del relé se recuerda 1,5 s por sala. Una escritura la olvida al momento.
    if (publico && op === "estado" && request.method === "GET") return json({ ok: true, ...(await estadoPublico(env, sala)) });
    const r = await operar(env, op, sala, args, { auth: a.ok && !publico });
    if (ESCRIBE.has(op)) olvidaEstado(sala);
    return json({ ok: true, ...r });
  } catch (e) { return json({ ok: false, error: String(e.message || e) }, /desconocida/.test(e.message) ? 404 : 400); }
}
