import { accessFor, authHeaders, sessionEmail } from "../../_auth-session.js";
import {
  GROUP_STATE_KEY,
  PLAYOUT_STATE_KEY,
  defaultState,
  applyGroupAction
} from "../_playout-group.js";

function json(value, status = 200) {
  return Response.json(value, { status, headers: authHeaders() });
}

// Clave de servicio del relé de voz (secreto de Pages RELE_SERVICE_KEY).
// Authorization: Bearer <clave>. La cookie __Host-atv_session sigue valiendo.
async function digest(value) {
  const bytes = new TextEncoder().encode(String(value));
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

export async function serviceKeyMatches(request, env) {
  const expected = String(env && env.RELE_SERVICE_KEY || "");
  if (expected.length < 32) return false;
  const header = String(request.headers.get("Authorization") || "");
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!m) return false;
  // Comparación de tiempo constante sobre los hashes (misma longitud siempre).
  const [a, b] = await Promise.all([digest(m[1].trim()), digest(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function actorWithAccess(request, env) {
  if (await serviceKeyMatches(request, env)) return "service:rele-voz";
  const actor = await sessionEmail(request, env);
  if (!actor) return null;
  const access = await accessFor(env, actor, "digitalsignage-player", false);
  return access.allowed ? actor : null;
}

// 12-nov-2026: el estado de grupo vive en D1 (PROGRAMACION_DB, consistencia fuerte: una sola
// primaria, sin caché de borde). En KV la lectura desde el borde de Madrid tardó 30,7 s en ver
// un «play» (medido desde el PC 03): «continúa» no despausaba y cada pantalla veía la pausa en
// un instante distinto. KV queda solo como copia de respaldo si D1 no está disponible.
const GROUP_D1_ID = "main";
let _groupTableReady = null;
function groupDb(env) { return env && env.PROGRAMACION_DB && typeof env.PROGRAMACION_DB.prepare === "function" ? env.PROGRAMACION_DB : null; }
async function ensureGroupTable(db) {
  if (!_groupTableReady) {
    _groupTableReady = db.prepare("CREATE TABLE IF NOT EXISTS playout_group_state (id TEXT PRIMARY KEY, state TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0)").run()
      .catch(e => { _groupTableReady = null; throw e; });
  }
  return _groupTableReady;
}
function normalizeGroupState(state) {
  if (!state || typeof state !== "object") return null;
  return {
    shiftMs: Number(state.shiftMs) || 0,
    pausedAt: state.pausedAt == null ? null : Number(state.pausedAt),
    revision: Number(state.revision) || 0,
    updatedAt: Number(state.updatedAt) || 0,
    events: Array.isArray(state.events) ? state.events : []
  };
}
async function readGroupStateD1(env) {
  const db = groupDb(env);
  if (!db) return null;
  try {
    await ensureGroupTable(db);
    const row = await db.prepare("SELECT state FROM playout_group_state WHERE id = ?").bind(GROUP_D1_ID).first();
    return row && row.state ? normalizeGroupState(JSON.parse(row.state)) : null;
  } catch (_) { return null; }
}
async function readGroupStateKV(env) {
  try {
    const raw = env.ACCESS && await env.ACCESS.get(GROUP_STATE_KEY);
    return normalizeGroupState(raw && JSON.parse(raw));
  } catch (_) { return null; }
}

export async function readGroupState(env) {
  // KV puede ir atrasada (caché de borde) pero nunca adelantada, salvo que una escritura en D1
  // fallara: se sirve la de mayor revisión.
  const [d1, kv] = await Promise.all([readGroupStateD1(env), readGroupStateKV(env)]);
  if (d1 && kv) return kv.revision > d1.revision ? kv : d1;
  return d1 || kv || defaultState();
}

export async function writeGroupState(env, state) {
  const body = JSON.stringify(state);
  let stored = null;
  const db = groupDb(env);
  if (db) {
    try {
      await ensureGroupTable(db);
      await db.prepare("INSERT INTO playout_group_state (id, state, revision, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET state = excluded.state, revision = excluded.revision, updated_at = excluded.updated_at")
        .bind(GROUP_D1_ID, body, Number(state.revision) || 0, Number(state.updatedAt) || 0).run();
      stored = "d1";
    } catch (_) {}
  }
  // Copia en KV (respaldo y lectores antiguos). Solo la clave de grupo, nunca PLAYOUT_STATE_KEY.
  if (env.ACCESS) { try { await env.ACCESS.put(GROUP_STATE_KEY, body); stored = stored || "kv"; } catch (_) {} }
  return stored;
}

export async function onRequestGet({ env }) {
  const state = await readGroupState(env);
  return json({ ok: true, state, serverNow: Date.now() });
}

export async function onRequestPost({ request, env }) {
  const actor = await actorWithAccess(request, env);
  if (!actor) return json({ ok: false, error: "unauthorized" }, 401);
  if (!env.ACCESS && !groupDb(env)) return json({ ok: false, error: "storage_unavailable" }, 503);
  let body;
  try { body = await request.json(); } catch (_) { return json({ ok: false, error: "invalid_json" }, 400); }
  const action = String(body && body.action || "").toLowerCase();
  const previous = await readGroupState(env);
  const state = applyGroupAction(previous, action, Date.now(), body && body.durations);
  if (!state) return json({ ok: false, error: "bad_action" }, 400);
  state.updatedBy = actor;
  // Solo la clave de grupo. Nunca PLAYOUT_STATE_KEY (admira-tv:playout:v1).
  if (GROUP_STATE_KEY === PLAYOUT_STATE_KEY) return json({ ok: false, error: "key_collision" }, 500);
  const store = await writeGroupState(env, state);
  if (!store) return json({ ok: false, error: "storage_unavailable" }, 503);
  return json({ ok: true, state, serverNow: Date.now(), store });
}

export { GROUP_STATE_KEY, PLAYOUT_STATE_KEY };
