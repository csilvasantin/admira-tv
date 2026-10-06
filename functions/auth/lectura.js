import { authHeaders, createLecturaSession, sessionCookie } from "../_auth-session.js";

const API = "https://data.yokup.com";

function dest(hostname) {
  const host = hostname === "admira.tv" || hostname === "www.admira.tv" ? hostname : "www.admira.tv";
  return "https://" + host + "/playlists/?marca=365";
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const headers = authHeaders();
  if (request.method !== "GET") {
    return Response.json({ ok: false, error: "solo_lectura" }, { status: 403, headers });
  }
  if (!env.ACCESS) return Response.json({ ok: false, error: "storage_unavailable" }, { status: 503, headers });
  const token = String(url.searchParams.get("t") || "");
  if (!/^[A-Za-z0-9_-]{20,2200}\.[A-Za-z0-9_-]{20,200}$/.test(token)) {
    return new Response("Enlace no válido o caducado.", { status: 401, headers: { ...headers, "content-type": "text/plain; charset=utf-8" } });
  }
  const redeemed = await fetch(API + "/api/lectura/canjear?site=tv&t=" + encodeURIComponent(token), {
    headers: { Accept: "application/json" },
  }).catch(() => null);
  if (!redeemed || !redeemed.ok) {
    const status = redeemed && redeemed.status === 410 ? 410 : 401;
    const text = status === 410 ? "Este enlace ya se ha usado." : "Enlace no válido o caducado.";
    return new Response(text, { status, headers: { ...headers, "content-type": "text/plain; charset=utf-8" } });
  }
  const data = await redeemed.json().catch(() => null);
  if (!data || data.site !== "tv" || !/^[a-f0-9]{64}$/.test(data.sid || "")) {
    return new Response("Enlace no válido o caducado.", { status: 401, headers: { ...headers, "content-type": "text/plain; charset=utf-8" } });
  }
  const session = await createLecturaSession(env, { sid: data.sid, exp: Number(data.exp) });
  const maxAge = Math.max(0, Number(data.exp) - Math.floor(Date.now() / 1000));
  return new Response(null, {
    status: 302,
    headers: authHeaders({
      Location: dest(url.hostname),
      "Set-Cookie": sessionCookie(session, maxAge),
    }),
  });
}
