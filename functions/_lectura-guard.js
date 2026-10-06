import { readSession } from "./_auth-session.js";

const API = "https://data.yokup.com";

function supplied(request) {
  const header = String(request.headers.get("X-Admira-Machine-Key") || "").trim();
  if (header.startsWith("mbl_")) return header.slice(0, 200);
  const match = /^Bearer\s+(mbl_\S+)$/i.exec(String(request.headers.get("Authorization") || ""));
  return match ? match[1].slice(0, 200) : "";
}

/** true cuando la petición de escritura trae la sesión visor o la clave mbl_. */
export async function lecturaBlocksWrite(request, env, fetchImpl = fetch) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return false;
  const session = await readSession(request, env).catch(() => null);
  if (session && session.lectura) return true;
  const key = supplied(request);
  if (!key) return false;
  const seen = await fetchImpl(API + "/api/lectura/reconocer", {
    headers: { Accept: "application/json", "X-Admira-Machine-Key": key },
  }).catch(() => null);
  const body = seen && seen.ok ? await seen.json().catch(() => null) : null;
  return !!(body && body.lectura === true);
}

export async function lecturaStillLive(session, fetchImpl = fetch) {
  if (!session || !session.lectura || !session.sid) return false;
  const live = await fetchImpl(API + "/api/lectura/sesion?sid=" + encodeURIComponent(session.sid), {
    headers: { Accept: "application/json" },
  }).catch(() => null);
  if (!live || !live.ok) return false;
  const body = await live.json().catch(() => null);
  return !!(body && body.ok && body.site === "tv");
}
