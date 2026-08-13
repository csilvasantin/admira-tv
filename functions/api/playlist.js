import { accessFor, authHeaders, sessionEmail } from "../_auth-session.js";

const PREFIX = "admira-tv:playlist:default:v1:";

function json(value, status = 200) {
  return Response.json(value, { status, headers: authHeaders() });
}

const cleanScreen = value => {
  const screen = String(value || "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{1,79}$/.test(screen) ? screen : "";
};

async function actorWithAccess(request, env) {
  const actor = await sessionEmail(request, env);
  if (!actor) return null;
  const access = await accessFor(env, actor, "digitalsignage-player", false);
  return access.allowed ? actor : null;
}

function cleanItem(raw, index) {
  if (!raw || typeof raw !== "object") return null;
  const asset = String(raw.asset || raw.url || "").trim().slice(0, 1000);
  if (!/^https:\/\//i.test(asset)) return null;
  const sourceType = String(raw.assetType || raw.type || "image").toLowerCase();
  const assetType = ["video", "animation"].includes(sourceType) ? "video" :
    ["audio", "music", "locucion"].includes(sourceType) ? "audio" : "image";
  const id = String(raw.id || raw.stockId || `item-${index + 1}`).trim().slice(0, 160);
  const tags = Array.isArray(raw.tags) ? raw.tags.map(tag => String(tag || "").trim().slice(0, 80)).filter(Boolean).slice(0, 32) : [];
  return { id, stockId: String(raw.stockId || "").trim().slice(0, 160), title: String(raw.title || `Contenido ${index + 1}`).trim().slice(0, 240),
    sub: String(raw.sub || "").trim().slice(0, 300), lane: raw.lane === "municipal" ? "municipal" : "publicidad",
    seconds: Math.max(2, Math.min(600, Number(raw.seconds) || 10)), asset, assetType, tags };
}

async function readDraft(env, screen) {
  try {
    const raw = env.ACCESS && await env.ACCESS.get(PREFIX + screen);
    const draft = raw && JSON.parse(raw);
    if (draft && Array.isArray(draft.items)) return draft;
  } catch (_) {}
  return { screen, playlist: "default", name: "Por defecto", items: [], rev: 0, updatedAt: 0 };
}

export async function onRequestGet({ request, env }) {
  const screen = cleanScreen(new URL(request.url).searchParams.get("screen"));
  if (!screen) return json({ ok: false, error: "bad_screen" }, 400);
  return json({ ok: true, draft: await readDraft(env, screen) });
}

export async function onRequestPost({ request, env }) {
  const actor = await actorWithAccess(request, env);
  if (!actor) return json({ ok: false, error: "unauthorized" }, 401);
  if (!env.ACCESS) return json({ ok: false, error: "storage_unavailable" }, 503);
  let body;
  try { body = await request.json(); } catch (_) { return json({ ok: false, error: "invalid_json" }, 400); }
  const screen = cleanScreen(body && body.screen);
  if (!screen || !Array.isArray(body && body.items) || body.items.length > 200) return json({ ok: false, error: "invalid_playlist" }, 400);
  const items = body.items.map(cleanItem).filter(Boolean);
  if (items.length !== body.items.length) return json({ ok: false, error: "invalid_item" }, 400);
  const previous = await readDraft(env, screen), expected = Number(body.rev) || 0;
  if (expected && expected !== Number(previous.rev || 0)) return json({ ok: false, error: "revision_conflict", draft: previous }, 409);
  const updatedAt = Date.now(), rev = Math.max(Number(previous.rev) || 0, updatedAt - 1) + 1;
  const draft = { screen, playlist: "default", name: "Por defecto", items, rev, updatedAt, updatedBy: actor };
  await env.ACCESS.put(PREFIX + screen, JSON.stringify(draft));
  return json({ ok: true, draft, rev, updatedAt });
}
