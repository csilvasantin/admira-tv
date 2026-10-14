// GET /auth/api-token — token de sesión de admira.tv para la API común (api.admira.store), encargo #5979.
//
// El filtro por cliente (/proyecto) se comprueba en el servidor: GET/POST /ctx de la API lee el email del
// token y consulta la whitelist. Este endpoint cambia la sesión HttpOnly de admira.tv por un token corto
// (15 min) con el mismo formato y la misma firma que el de Pixeria (/auth/api-token): {v:1, aud, email, iat, exp}
// firmado con PIXERIA_SIGNING_KEY. El email sale siempre de la sesión del servidor, nunca de la petición.
//
// Sin PIXERIA_SIGNING_KEY en el proyecto de Pages contesta 503 y el contexto se queda sin /proyecto
// (/marca sigue funcionando: es solo aspecto). Las sesiones de solo lectura no reciben token.
import { authHeaders, hasAnyAccess, readSession } from "../_auth-session.js";

const API_TOKEN_TTL_SECONDS = 15 * 60;
const encoder = new TextEncoder();

function base64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64url(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

export async function createApiToken(secret, email, now = Math.floor(Date.now() / 1000)) {
  const exp = now + API_TOKEN_TTL_SECONDS;
  const payload = base64url(encoder.encode(JSON.stringify({ v: 1, aud: "api.admira.store", email, iat: now, exp })));
  return { token: `${payload}.${await hmac(secret, `api:${payload}`)}`, exp };
}

export async function onRequestGet({ request, env }) {
  const session = await readSession(request, env);
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401, headers: authHeaders() });
  if (session.lectura) return Response.json({ ok: false, error: "lectura" }, { status: 403, headers: authHeaders() });
  if (!(await hasAnyAccess(env, session.email))) return Response.json({ ok: false, error: "forbidden" }, { status: 403, headers: authHeaders() });
  if (!env.PIXERIA_SIGNING_KEY) return Response.json({ ok: false, error: "api-token-unconfigured" }, { status: 503, headers: authHeaders() });
  const minted = await createApiToken(env.PIXERIA_SIGNING_KEY, String(session.email).trim().toLowerCase());
  return Response.json({ ok: true, token: minted.token, exp: minted.exp }, { headers: authHeaders() });
}

export function onRequest() {
  return new Response(null, { status: 405, headers: authHeaders({ Allow: "GET" }) });
}
