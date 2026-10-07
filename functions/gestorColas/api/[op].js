// /gestorColas/api/<op>?sala=… — estado | listar | pedido (públicas) · crear | avanzar | llamar | reiniciar
// (sesión Admira o clave de sala) · clave (solo sesión Admira: entrega la clave de la sala para el staff).
import { salaDe, operar, ESCRIBE, autoriza, claveDe, urls, json } from "../_lib.js";

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
    if (ESCRIBE.has(op)) {
      if (request.method !== "POST") return json({ ok: false, error: "usa POST" }, 405);
      const a = await autoriza(request, env, sala, body.clave || u.searchParams.get("clave"));
      if (!a.ok) return json({ ok: false, error: "falta la clave de la sala o la sesión Admira" }, 401);
    }
    return json({ ok: true, ...(await operar(env, op, sala, { ...Object.fromEntries(u.searchParams), ...body })) });
  } catch (e) { return json({ ok: false, error: String(e.message || e) }, /desconocida/.test(e.message) ? 404 : 400); }
}
