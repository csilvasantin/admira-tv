import { accessFor, authHeaders, readSession } from "../_auth-session.js";
import { lecturaStillLive } from "../_lectura-guard.js";

const LECTURA_PROJECTS = new Set([
  "digitalsignage-playlists", "digitalsignage-player", "digitalsignage-parrilla",
  "digitalsignage-cms", "digitalsignage-signage", "admira-tv",
]);

export async function onRequestGet({ request, env }) {
  const session = await readSession(request, env);
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401, headers: authHeaders() });
  const url = new URL(request.url);
  if (session.lectura) {
    const project = String(url.searchParams.get("project") || "admira-tv").slice(0, 60);
    const manage = url.searchParams.get("manage") === "1";
    if (!(await lecturaStillLive(session))) {
      return Response.json({ ok: false, error: "unauthorized" }, { status: 401, headers: authHeaders() });
    }
    if (manage || !LECTURA_PROJECTS.has(project)) {
      return Response.json({ ok: true, actor: session.email, project, allowed: false, role: "viewer", lectura: true }, { status: 403, headers: authHeaders() });
    }
    return Response.json({ ok: true, actor: session.email, project, allowed: true, role: "viewer", lectura: true }, { headers: authHeaders() });
  }
  const project = String(url.searchParams.get("project") || "admira-tv").slice(0, 60);
  const access = await accessFor(env, session.email, project, url.searchParams.get("manage") === "1");
  if (!access.allowed) return Response.json({ ok: true, actor: session.email, project, allowed: false, role: access.role }, { status: 403, headers: authHeaders() });
  return Response.json({ ok: true, actor: session.email, project, allowed: true, role: access.role }, { headers: authHeaders() });
}

export function onRequest() {
  return new Response(null, { status: 405, headers: authHeaders({ Allow: "GET" }) });
}
