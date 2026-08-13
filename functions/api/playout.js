import { accessFor, authHeaders, sessionEmail } from "../_auth-session.js";

const STATE_KEY = "admira-tv:playout:v1";
const DEFAULT_STATE = Object.freeze({ configured: false, mode: "autonomous", screens: [], item: null, layout: { rows: 1, cols: 1 }, revision: 0, updatedAt: 0 });

function json(value, status = 200) {
  return Response.json(value, { status, headers: authHeaders() });
}

async function actorWithAccess(request, env) {
  const actor = await sessionEmail(request, env);
  if (!actor) return null;
  const access = await accessFor(env, actor, "digitalsignage-player", false);
  return access.allowed ? actor : null;
}

const cleanScreen = value => {
  const screen = String(value || "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{1,79}$/.test(screen) ? screen : "";
};

function cleanItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || "").trim().slice(0, 120);
  const url = String(raw.url || "").trim().slice(0, 900);
  const type = String(raw.type || "").toLowerCase();
  if (!id || !/^https:\/\//i.test(url) || !["image", "video", "animation"].includes(type)) return null;
  return { id, url, type, title: String(raw.title || "Contenido extendido").trim().slice(0, 240),
    thumbnail: String(raw.thumbnail || raw.thumb || "").trim().slice(0, 900),
    num: Number.isFinite(Number(raw.num)) ? Number(raw.num) : null };
}

function layoutFor(count) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, count))));
  return { rows: Math.max(1, Math.ceil(count / cols)), cols };
}

async function readState(env) {
  try {
    const raw = env.ACCESS && await env.ACCESS.get(STATE_KEY);
    const state = raw && JSON.parse(raw);
    if (state && ["autonomous", "synchronized", "extended"].includes(state.mode)) return state;
  } catch (_) {}
  return { ...DEFAULT_STATE, screens: [], layout: { ...DEFAULT_STATE.layout } };
}

function assignmentFor(state, screen) {
  const selected = state.screens.indexOf(screen);
  const active = state.configured && selected >= 0;
  const mode = active ? state.mode : "autonomous";
  const assignment = { ok: true, configured: !!state.configured, screen, mode,
    revision: Number(state.revision) || 0, updatedAt: Number(state.updatedAt) || 0, serverNow: Date.now() };
  if (mode === "synchronized") assignment.group = { id: "synchronized-main", index: selected, total: state.screens.length };
  if (mode === "extended") {
    const layout = state.layout || layoutFor(state.screens.length), cols = Math.max(1, Number(layout.cols) || 1);
    assignment.item = state.item;
    assignment.tile = { index: selected, total: state.screens.length, row: Math.floor(selected / cols), col: selected % cols,
      rows: Math.max(1, Number(layout.rows) || 1), cols };
  }
  return assignment;
}

export async function onRequestGet({ request, env }) {
  const screen = cleanScreen(new URL(request.url).searchParams.get("screen"));
  const state = await readState(env);
  if (screen) return json(assignmentFor(state, screen));
  if (!await actorWithAccess(request, env)) return json({ ok: false, error: "unauthorized" }, 401);
  return json({ ok: true, state, serverNow: Date.now() });
}

export async function onRequestPost({ request, env }) {
  const actor = await actorWithAccess(request, env);
  if (!actor) return json({ ok: false, error: "unauthorized" }, 401);
  if (!env.ACCESS) return json({ ok: false, error: "storage_unavailable" }, 503);
  let body;
  try { body = await request.json(); } catch (_) { return json({ ok: false, error: "invalid_json" }, 400); }
  const mode = String(body && body.mode || "").toLowerCase();
  if (!["autonomous", "synchronized", "extended"].includes(mode)) return json({ ok: false, error: "bad_mode" }, 400);
  const screens = Array.from(new Set((Array.isArray(body && body.screens) ? body.screens : []).map(cleanScreen).filter(Boolean))).slice(0, 36);
  if (mode !== "autonomous" && screens.length < 2) return json({ ok: false, error: "two_screens_required" }, 400);
  const item = mode === "extended" ? cleanItem(body && body.item) : null;
  if (mode === "extended" && !item) return json({ ok: false, error: "playable_item_required" }, 400);
  const previous = await readState(env), updatedAt = Date.now();
  const state = { configured: true, mode, screens: mode === "autonomous" ? [] : screens, item,
    layout: layoutFor(mode === "extended" ? screens.length : 1),
    revision: Math.max(Number(previous.revision) || 0, updatedAt - 1) + 1, updatedAt, updatedBy: actor };
  await env.ACCESS.put(STATE_KEY, JSON.stringify(state));
  return json({ ok: true, state, serverNow: Date.now() });
}
