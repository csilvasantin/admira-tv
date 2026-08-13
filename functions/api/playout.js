import { accessFor, authHeaders, sessionEmail } from "../_auth-session.js";

const UPSTREAM = "https://api.admira.store/playout/state";

function json(value, status = 200) {
  return Response.json(value, { status, headers: authHeaders() });
}

async function actorWithAccess(request, env) {
  const actor = await sessionEmail(request, env);
  if (!actor) return null;
  const access = await accessFor(env, actor, "digitalsignage-player", false);
  return access.allowed ? actor : null;
}

async function proxy(upstream) {
  return new Response(await upstream.arrayBuffer(), {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") || "application/json; charset=utf-8",
      ...authHeaders(),
    },
  });
}

export async function onRequestGet({ request, env }) {
  if (!await actorWithAccess(request, env)) return json({ ok: false, error: "unauthorized" }, 401);
  try {
    return proxy(await fetch(UPSTREAM, { headers: { Accept: "application/json" }, cache: "no-store" }));
  } catch (error) {
    return json({ ok: false, error: "upstream_unreachable", detail: String(error && error.message || error).slice(0, 160) }, 502);
  }
}

export async function onRequestPost({ request, env }) {
  if (!await actorWithAccess(request, env)) return json({ ok: false, error: "unauthorized" }, 401);
  const adminToken = String(env.ADMIN_TOKEN || "").trim();
  if (!adminToken) return json({ ok: false, error: "service_not_configured" }, 503);
  const body = await request.text();
  if (!body || body.length > 65536) return json({ ok: false, error: "bad_body" }, 400);
  try { JSON.parse(body); } catch (_) { return json({ ok: false, error: "bad_json" }, 400); }
  try {
    return proxy(await fetch(UPSTREAM, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + adminToken },
      body,
    }));
  } catch (error) {
    return json({ ok: false, error: "upstream_unreachable", detail: String(error && error.message || error).slice(0, 160) }, 502);
  }
}
