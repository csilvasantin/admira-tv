// admira.tv/gestorColas/mcp — MCP (Streamable HTTP, JSON-RPC 2.0, respuestas JSON sin sesión).
// GET desde un navegador → página humana (/gestorColas/mcp/). Escrituras: «clave» de la sala
// (argumento, Authorization: Bearer o X-Clave-Sala) o sesión Admira.
import { salaDe, operar, ESCRIBE, autoriza, urls, json, ESTADOS } from "./_lib.js";

const VERSION = "v.07.10.2026.r4.taza-demo";
const S = { type: "string" };
const base = { sala: { ...S, description: "Slug de la tienda/sala (por defecto starbucks-paseo-de-gracia)" }, marca: { ...S, description: "starbucks | 365 | admiranext (atajo de sala)" } };
const conClave = { ...base, clave: { ...S, description: "Clave de la sala (gc_…); no hace falta con sesión Admira" } };
const TOOLS = [
  { name: "cola_estado", op: "estado", description: "Pedidos «En preparación» y «Listo para recoger» de la sala, con las URL de control, pantalla iPad, quiosco y ayuda. Solo lectura.", inputSchema: { type: "object", properties: base } },
  { name: "cola_listar", op: "listar", description: "Lista los pedidos abiertos; filtra por estado (preparando | listo). Solo lectura.", inputSchema: { type: "object", properties: { ...base, estado: { type: "string", enum: ["preparando", "listo"] } } } },
  { name: "cola_crear_pedido", op: "crear", description: "Crea un pedido en barra (pago simulado en caja) y devuelve su número (A001…). Requiere clave. Sin precios: el total es 0.", inputSchema: { type: "object", properties: { ...conClave, nombre: { ...S, description: "Nombre de pila para llamar al cliente (opcional)" }, idem: { ...S, description: "Clave de idempotencia (6-48 caracteres): repetir la llamada con la misma devuelve el mismo pedido" } } } },
  { name: "cola_avanzar", op: "avanzar", description: "Avanza un pedido al siguiente estado (recibido→en preparación→listo→recogido) o al estado «a». Requiere clave.", inputSchema: { type: "object", required: ["pedido"], properties: { ...conClave, pedido: { ...S, description: "Número (A001) o id" }, a: { type: "string", enum: ESTADOS } } } },
  { name: "cola_llamar", op: "llamar", description: "Vuelve a llamar a un pedido: lo pone «listo» y la pantalla iPad lo anuncia otra vez (Admirito, voz es-ES). Requiere clave.", inputSchema: { type: "object", required: ["pedido"], properties: { ...conClave, pedido: S } } },
  { name: "cola_reiniciar", op: "reiniciar", description: "Vacía la cola de la sala y vuelve a numerar desde A001. Requiere clave y confirmar:true.", inputSchema: { type: "object", required: ["confirmar"], properties: { ...conClave, confirmar: { type: "boolean" } } } },
  { name: "cola_urls", op: "urls", description: "URL de control, pantalla iPad (ES/EN), quiosco, ayuda y MCP de la sala.", inputSchema: { type: "object", properties: base } },
];

const ok = (id, result) => json({ jsonrpc: "2.0", id, result });
const err = (id, code, message) => json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

async function uno(msg, request, env) {
  const { id, method, params = {} } = msg || {};
  if (method === "initialize") return { id, result: { protocolVersion: params.protocolVersion || "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "admira-tv-gestor-colas", version: VERSION }, instructions: "Gestor de colas de pedidos de admira.tv (demo Starbucks, pago siempre simulado). Lecturas libres; crear/avanzar/llamar/reiniciar con la clave de la sala. Ayuda: https://admira.tv/gestorColas/help/" } };
  if (method === "ping") return { id, result: {} };
  if (method === "tools/list") return { id, result: { tools: TOOLS.map(({ op, ...t }) => t) } };
  if (method === "tools/call") {
    const t = TOOLS.find((x) => x.name === params.name);
    if (!t) return { id, error: { code: -32602, message: "herramienta desconocida: " + params.name } };
    const a = params.arguments || {};
    try {
      const sala = salaDe(a.sala, a.marca);
      if (ESCRIBE.has(t.op) && !(await autoriza(request, env, sala, a.clave)).ok) return { id, result: { isError: true, content: [{ type: "text", text: "Falta la clave de la sala (gc_…) o la sesión Admira. La entrega admira.tv/gestorColas/ con sesión iniciada." }] } };
      const r = t.op === "urls" ? { sala, urls: urls(sala) } : await operar(env, t.op, sala, a);
      return { id, result: { content: [{ type: "text", text: JSON.stringify(r, null, 2) }], structuredContent: r } };
    } catch (e) { return { id, result: { isError: true, content: [{ type: "text", text: String(e.message || e) }] } }; }
  }
  if (typeof method === "string" && method.startsWith("notifications/")) return null;
  return { id, error: { code: -32601, message: "método no soportado: " + method } };
}

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return json({ ok: true });
  if (request.method === "GET") {
    const acc = request.headers.get("accept") || "";
    if (acc.includes("text/event-stream") && !acc.includes("text/html")) return new Response(null, { status: 405, headers: { allow: "POST" } });
    if (acc.includes("text/html") || !acc.includes("json")) return env.ASSETS.fetch(new URL("/gestorColas/mcp/", request.url));
    return json({ name: "admira-tv-gestor-colas", version: VERSION, transport: "streamable-http (POST JSON-RPC)", tools: TOOLS.map((t) => t.name), help: "https://admira.tv/gestorColas/help/" });
  }
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { allow: "GET, POST" } });
  let msg; try { msg = await request.json(); } catch { return err(null, -32700, "JSON inválido"); }
  if (Array.isArray(msg)) { const out = (await Promise.all(msg.map((m) => uno(m, request, env)))).filter(Boolean).map((r) => ({ jsonrpc: "2.0", ...r })); return out.length ? json(out) : new Response(null, { status: 202 }); }
  const r = await uno(msg, request, env);
  if (!r) return new Response(null, { status: 202 });
  return r.error ? err(r.id, r.error.code, r.error.message) : ok(r.id, r.result);
}
