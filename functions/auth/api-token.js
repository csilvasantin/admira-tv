// GET /auth/api-token — token de sesión de admira.tv para la API común (api.admira.store), encargo #5979.
//
// El filtro por cliente (/proyecto) se comprueba en el servidor: GET/POST /ctx de la API lee el email del
// token y consulta la whitelist. Este endpoint cambia la sesión HttpOnly de admira.tv por un token corto
// (15 min) firmado con la clave propia de admira.tv (ADMIRA_TV_API_KEY, ver functions/_api-token.js); la API
// lo comprueba en POST /auth/verify. El email sale siempre de la sesión del servidor, nunca de la petición.
//
// Sin ADMIRA_TV_API_KEY en el proyecto de Pages contesta 503 y el contexto se queda sin /proyecto
// (/marca sigue funcionando: es solo aspecto). Las sesiones de solo lectura no reciben token.
import { authHeaders, hasAnyAccess, readSession } from "../_auth-session.js";
import { createApiToken } from "../_api-token.js";

export { createApiToken };

export async function onRequestGet({ request, env }) {
  const session = await readSession(request, env);
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401, headers: authHeaders() });
  if (session.lectura) return Response.json({ ok: false, error: "lectura" }, { status: 403, headers: authHeaders() });
  if (!(await hasAnyAccess(env, session.email))) return Response.json({ ok: false, error: "forbidden" }, { status: 403, headers: authHeaders() });
  if (!env.ADMIRA_TV_API_KEY) return Response.json({ ok: false, error: "api-token-unconfigured" }, { status: 503, headers: authHeaders() });
  const minted = await createApiToken(env.ADMIRA_TV_API_KEY, String(session.email).trim().toLowerCase());
  return Response.json({ ok: true, token: minted.token, exp: minted.exp }, { headers: authHeaders() });
}

export function onRequest() {
  return new Response(null, { status: 405, headers: authHeaders({ Allow: "GET" }) });
}
