import { sessionEmail } from "../_auth-session.js";

const PREFIX = "admira-tv:player-profile:";
const FIELD_KEYS = new Set([
  "connection.networkType",
  "identity.machine", "identity.name",
  "display.resolution", "display.logicalResolution", "display.viewport", "display.dpr", "display.colorDepth", "display.orientation",
  "system.os", "system.osVersion", "system.platform", "system.architecture", "system.language", "system.timezone",
  "hardware.cores", "hardware.memory", "hardware.touchPoints",
  "storage.diskTotal", "storage.usage", "storage.quota", "storage.persisted",
  "software.player", "software.playerVersion", "software.webRelease", "software.engine", "software.userAgent",
]);

function json(value, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store, private" } });
}

function screenId(raw) {
  const value = String(raw || "").trim().slice(0, 60);
  return /^[a-z0-9_-]+$/i.test(value) ? value : "";
}

function sanitizeFields(raw) {
  const clean = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return clean;
  for (const [key, value] of Object.entries(raw)) {
    if (!FIELD_KEYS.has(key)) continue;
    const text = String(value == null ? "" : value).trim().slice(0, key === "software.userAgent" ? 300 : 120);
    clean[key] = text;
  }
  return clean;
}

async function authorize(request, env) {
  const actor = await sessionEmail(request, env);
  return actor || "";
}

export async function onRequestGet({ request, env }) {
  const actor = await authorize(request, env);
  if (!actor) return json({ ok: false, error: "unauthorized" }, 401);
  const screen = screenId(new URL(request.url).searchParams.get("screen"));
  if (!screen) return json({ ok: false, error: "bad_screen" }, 400);
  let profile = null;
  try { profile = JSON.parse(await env.ACCESS.get(PREFIX + screen) || "null"); } catch (_) {}
  return json({ ok: true, screen, profile: profile || { fields: {}, updatedAt: 0, updatedBy: "" } });
}

export async function onRequestPut({ request, env }) {
  const actor = await authorize(request, env);
  if (!actor) return json({ ok: false, error: "unauthorized" }, 401);
  let body;
  try { body = await request.json(); } catch (_) { return json({ ok: false, error: "bad_json" }, 400); }
  const screen = screenId(body && body.screen);
  if (!screen) return json({ ok: false, error: "bad_screen" }, 400);
  const update = sanitizeFields(body && body.fields);
  if (!Object.keys(update).length) return json({ ok: false, error: "no_fields" }, 400);
  let previous = null;
  try { previous = JSON.parse(await env.ACCESS.get(PREFIX + screen) || "null"); } catch (_) {}
  const fields = { ...((previous && previous.fields) || {}) };
  for (const [key, value] of Object.entries(update)) {
    if (value) fields[key] = value;
    else delete fields[key];
  }
  const profile = { fields, updatedAt: Date.now(), updatedBy: actor };
  await env.ACCESS.put(PREFIX + screen, JSON.stringify(profile));
  return json({ ok: true, screen, profile });
}

export const onRequestPost = onRequestPut;
