import { accessFor, authHeaders, sessionEmail } from "../_auth-session.js";

const PREFIX = "admira-tv:playlist:default:v1:";

// Escritura server-to-server desde el Stock de Pixeria (Yokup #3183, NeoMBA16, 12-sep-2026):
// pixeria.com/stock.html «Asignar al circuito…» escribe la playlist por defecto de cada
// pantalla de un circuito con las piezas de un catálogo. La sesión del portal (cookie
// __Host-atv_session, SameSite=Lax) no viaja entre orígenes, así que desde pixeria.com se
// autentica con la MISMA clave que ya usa el Stock para borrar (NOTIFY_KEY de
// api.admira.store), instalada aquí como secreto STOCK_NOTIFY_KEY. Va en el body {secret}
// o en X-Notify-Key; nunca en la URL. Solo estos orígenes reciben CORS (sin credenciales).
const STOCK_ORIGINS = new Set(["https://www.pixeria.com", "https://pixeria.com", "https://pixeria.pages.dev"]);
const isStockOrigin = origin => STOCK_ORIGINS.has(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || "");
function corsFor(request) {
  const origin = request.headers.get("Origin") || "";
  if (!isStockOrigin(origin)) return {};
  return { "Access-Control-Allow-Origin": origin, "Vary": "Origin", "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Notify-Key", "Access-Control-Max-Age": "600" };
}
function sameSecret(left, right) {
  const a = String(left || ""), b = String(right || "");
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function stockActor(request, env, body) {
  if (!env.STOCK_NOTIFY_KEY) return null;
  const secret = request.headers.get("X-Notify-Key") || (body && body.secret) || "";
  if (!sameSecret(secret, env.STOCK_NOTIFY_KEY)) return null;
  const source = String((body && body.source) || "").replace(/[^a-z0-9._:#\- ]/gi, "").trim().slice(0, 80);
  return "pixeria-stock" + (source ? " · " + source : "");
}

function json(value, status = 200, cors = {}) {
  return Response.json(value, { status, headers: authHeaders(cors) });
}

export async function onRequestOptions({ request }) {
  const cors = corsFor(request);
  if (!cors["Access-Control-Allow-Origin"]) return new Response(null, { status: 204, headers: authHeaders() });
  return new Response(null, { status: 204, headers: authHeaders(cors) });
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
  const cors = corsFor(request);
  const screen = cleanScreen(new URL(request.url).searchParams.get("screen"));
  if (!screen) return json({ ok: false, error: "bad_screen" }, 400, cors);
  // Public virtual playlists are also read by Xtore on www/localhost through
  // its bounded parent bridge. Never enable cross-origin credentialed writes.
  if (/^(?:xtore-)?virtual-[a-z0-9-]+$/.test(screen)) {
    const draft = await readDraft(env, screen);
    return Response.json({ ok: true, draft: { screen, playlist: 'default', items: draft.items, rev: draft.rev } }, {
      headers: authHeaders({ 'Access-Control-Allow-Origin': '*' }),
    });
  }
  return json({ ok: true, draft: await readDraft(env, screen) }, 200, cors);
}

export async function onRequestPost({ request, env }) {
  const cors = corsFor(request);
  let body;
  try { body = await request.json(); } catch (_) { return json({ ok: false, error: "invalid_json" }, 400, cors); }
  // Sesión del portal (admira.tv) o clave del Stock (pixeria.com, server-to-server).
  const actor = await actorWithAccess(request, env) || stockActor(request, env, body);
  if (!actor) return json({ ok: false, error: "unauthorized" }, 401, cors);
  if (!env.ACCESS) return json({ ok: false, error: "storage_unavailable" }, 503, cors);
  const screen = cleanScreen(body && body.screen);
  if (!screen || !Array.isArray(body && body.items) || body.items.length > 200) return json({ ok: false, error: "invalid_playlist" }, 400, cors);
  const items = body.items.map(cleanItem).filter(Boolean);
  if (items.length !== body.items.length) return json({ ok: false, error: "invalid_item" }, 400, cors);
  const previous = await readDraft(env, screen), expected = Number(body.rev) || 0;
  if (expected && expected !== Number(previous.rev || 0)) return json({ ok: false, error: "revision_conflict", draft: previous }, 409, cors);
  const updatedAt = Date.now(), rev = Math.max(Number(previous.rev) || 0, updatedAt - 1) + 1;
  const name = String((body && body.name) || "").trim().slice(0, 80) || "Por defecto";
  const draft = { screen, playlist: "default", name, items, rev, updatedAt, updatedBy: actor };
  await env.ACCESS.put(PREFIX + screen, JSON.stringify(draft));
  return json({ ok: true, draft, rev, updatedAt }, 200, cors);
}
