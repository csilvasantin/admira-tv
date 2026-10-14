// POST /auth/verify {token} — la API común comprueba aquí los tokens que firma admira.tv (encargo #5979).
// Responde {ok, email, exp} solo si el token es de admira.tv, está bien firmado y no ha caducado. No dice
// nada del rol: quién es superusuario lo decide la API con la whitelist. Mismo contrato que /auth/verify
// de Pixeria y admira.studio.
import { authHeaders } from "../_auth-session.js";
import { verifyApiToken } from "../_api-token.js";

export async function onRequestPost({ request, env }) {
  let body = {};
  try { body = await request.json(); } catch (_) {}
  const session = await verifyApiToken(env.ADMIRA_TV_API_KEY, String(body && body.token || ""));
  return Response.json(session ? { ok: true, email: session.email, exp: session.exp } : { ok: false },
    { status: session ? 200 : 401, headers: authHeaders() });
}

export function onRequest() {
  return new Response(null, { status: 405, headers: authHeaders({ Allow: "POST" }) });
}
