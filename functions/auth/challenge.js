import { authHeaders, challengeCookie, issueChallenge, PUBLIC_ORIGIN } from "../_auth-session.js";

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get("Origin");
  if (origin && origin !== PUBLIC_ORIGIN) return Response.json({ error: "bad_origin" }, { status: 403, headers: authHeaders() });
  let body;
  try { body = await request.json(); } catch (_) { body = {}; }
  try {
    const challenge = await issueChallenge(env, body && body.return_to);
    return Response.json({ ok: true, state: challenge.state, nonce: challenge.nonce, login_uri: `${PUBLIC_ORIGIN}/auth/callback`, expires_at: challenge.expiresAt }, {
      headers: authHeaders({ "Set-Cookie": challengeCookie(challenge.state) }),
    });
  } catch (_) {
    return Response.json({ error: "challenge_unavailable" }, { status: 503, headers: authHeaders() });
  }
}

export function onRequest() {
  return new Response(null, { status: 405, headers: authHeaders({ Allow: "POST" }) });
}
