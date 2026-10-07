// Gestor de colas de admira.tv (Carlos, 7-oct-2026). Fachada de control, ayuda y MCP sobre el relé de
// pedidos del quiosco (Durable Object por tienda en mcp-ainimation.admira.store/cola/*), que es el que
// alimenta ainimation.studio/starbucks. Lecturas públicas; escrituras con sesión Admira o clave de sala.
import { sessionEmail, hasAnyAccess } from "../_auth-session.js";

export const RELE = "https://mcp-ainimation.admira.store";
export const ORIGEN = "https://admira.tv";
export const SALA = /^[a-z0-9-]{2,80}$/;
export const MARCAS = { starbucks: "starbucks-paseo-de-gracia", "365": "365-demo", admiranext: "admiranext-demo" };
export const ESTADOS = ["pendiente", "recibido", "preparando", "listo", "recogido"];

export function salaDe(v, marca) {
  const s = String(v || MARCAS[String(marca || "").toLowerCase()] || MARCAS.starbucks).toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 80);
  if (!SALA.test(s)) throw new Error("sala inválida (slug a-z0-9-)");
  return s;
}

async function hmacHex(secret, msg) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg)));
  return [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
}
/** Clave de una sala (estable, derivada del secreto COLAS_SEED; nunca se guarda). */
export async function claveDe(env, sala) {
  if (!env.COLAS_SEED) throw new Error("COLAS_SEED sin configurar");
  return "gc_" + (await hmacHex(env.COLAS_SEED, "gestorColas:sala:" + sala)).slice(0, 24);
}
function igual(a, b) { a = String(a || ""); b = String(b || ""); if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }

/** ¿Puede escribir? Sesión Admira (cualquier acceso) o la clave de la sala. */
export async function autoriza(request, env, sala, clave) {
  const h = request.headers.get("authorization") || "";
  const c = clave || (h.startsWith("Bearer ") ? h.slice(7) : "") || request.headers.get("x-clave-sala") || "";
  if (c && env.COLAS_SEED && igual(c, await claveDe(env, sala))) return { ok: true, via: "clave" };
  try { const email = await sessionEmail(request, env); if (email && await hasAnyAccess(env, email)) return { ok: true, via: "sesion", email }; } catch (_) {}
  return { ok: false };
}

export async function rele(env, op, sala, { query = "", body } = {}) {
  const headers = { "content-type": "application/json" };
  if (env.COLA_ADMIN) headers["x-cola-admin"] = env.COLA_ADMIN;
  const r = await fetch(`${RELE}/cola/${op}?store=${encodeURIComponent(sala)}${query}`, body ? { method: "POST", headers, body: JSON.stringify(body) } : { headers });
  const d = await r.json().catch(() => ({ ok: false, error: "relé sin respuesta" }));
  if (!r.ok || d.ok === false) throw new Error(d.error || "relé HTTP " + r.status);
  return d;
}

export const urls = (sala) => ({
  control: `${ORIGEN}/gestorColas/?sala=${sala}`,
  pantalla: `${ORIGEN}/gestorColas/pantalla/?sala=${sala}`,
  pantalla_en: `${ORIGEN}/gestorColas/pantalla/?sala=${sala}&lang=en`,
  quiosco: sala === MARCAS.starbucks ? "https://www.ainimation.studio/starbucks/" : `https://www.ainimation.studio/xperiencias/kiosko-pedido/?store=${sala}`,
  ayuda: `${ORIGEN}/gestorColas/help/`, mcp: `${ORIGEN}/gestorColas/mcp`,
});

/** Operaciones comunes de API y MCP. */
export async function operar(env, op, sala, a = {}) {
  if (op === "estado") return { sala, ...(await rele(env, "estado", sala)), urls: urls(sala) };
  if (op === "listar") {
    const d = await rele(env, "estado", sala);
    let l = [...(d.recibido || []), ...(d.preparando || []), ...(d.listo || [])];
    if (a.estado) l = l.filter((p) => p.estado === a.estado);
    return { sala, total: l.length, pedidos: l, pendientes_de_pago: d.pendientes, recogidos_recientes: d.recogidos };
  }
  if (op === "pedido") return await rele(env, "pedido", sala, { query: "&pedido=" + encodeURIComponent(a.pedido || "") });
  if (op === "crear") {
    // Idempotente: el mismo «idem» (un toque, un reintento de red o del MCP) devuelve el MISMO pedido.
    const idem = String(a.idem || "").replace(/[^A-Za-z0-9._-]/g, "").slice(0, 48);
    const id = idem.length >= 6 ? "gc-" + idem : "gc-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
    await rele(env, "pedido", sala, { body: { id, nombre: a.nombre || "", total: 0, prefijo: a.prefijo || "A" } });
    return await rele(env, "pagar", sala, { body: { id, via: "caja" } });
  }
  if (op === "avanzar") { if (a.a && !ESTADOS.includes(a.a)) throw new Error("estado inválido: " + a.a); return await rele(env, "avanzar", sala, { body: { numero: a.pedido, id: a.pedido, a: a.a } }); }
  if (op === "llamar") return await rele(env, "llamar", sala, { body: { numero: a.pedido, id: a.pedido } });
  if (op === "reiniciar") { if (a.confirmar !== true && a.confirmar !== "true") throw new Error("reiniciar exige confirmar:true"); return { sala, ...(await rele(env, "reiniciar", sala, { body: {} })) }; }
  throw new Error("operación desconocida: " + op);
}
export const ESCRIBE = new Set(["crear", "avanzar", "llamar", "reiniciar"]);
export const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*", "access-control-allow-headers": "content-type, authorization, x-clave-sala, mcp-session-id, mcp-protocol-version", "access-control-allow-methods": "GET, POST, OPTIONS" } });
