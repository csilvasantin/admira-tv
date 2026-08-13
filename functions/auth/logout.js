import { authHeaders, clearSessionCookie, destroySession, PUBLIC_ORIGIN } from "../_auth-session.js";

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get("Origin");
  if (origin && origin !== PUBLIC_ORIGIN) return Response.json({ error: "bad_origin" }, { status: 403, headers: authHeaders() });
  await destroySession(request, env);
  return Response.json({ ok: true }, { headers: authHeaders({ "Set-Cookie": clearSessionCookie() }) });
}

export function onRequest() {
  return new Response(null, { status: 405, headers: authHeaders({ Allow: "POST" }) });
}
