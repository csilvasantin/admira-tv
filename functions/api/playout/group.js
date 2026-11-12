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

async function actorWithAccess(request, env) {
  const actor = await sessionEmail(request, env);
  if (!actor) return null;
  const access = await accessFor(env, actor, "digitalsignage-player", false);
  return access.allowed ? actor : null;
}

export async function readGroupState(env) {
  try {
    const raw = env.ACCESS && await env.ACCESS.get(GROUP_STATE_KEY);
    const state = raw && JSON.parse(raw);
    if (state && typeof state === "object") {
      return {
        shiftMs: Number(state.shiftMs) || 0,
        pausedAt: state.pausedAt == null ? null : Number(state.pausedAt),
        revision: Number(state.revision) || 0,
        updatedAt: Number(state.updatedAt) || 0,
        events: Array.isArray(state.events) ? state.events : []
      };
    }
  } catch (_) {}
  return defaultState();
}

export async function onRequestGet({ env }) {
  const state = await readGroupState(env);
  return json({ ok: true, state, serverNow: Date.now() });
}

export async function onRequestPost({ request, env }) {
  const actor = await actorWithAccess(request, env);
  if (!actor) return json({ ok: false, error: "unauthorized" }, 401);
  if (!env.ACCESS) return json({ ok: false, error: "storage_unavailable" }, 503);
  let body;
  try { body = await request.json(); } catch (_) { return json({ ok: false, error: "invalid_json" }, 400); }
  const action = String(body && body.action || "").toLowerCase();
  const previous = await readGroupState(env);
  const state = applyGroupAction(previous, action, Date.now(), body && body.durations);
  if (!state) return json({ ok: false, error: "bad_action" }, 400);
  state.updatedBy = actor;
  // Solo la clave de grupo. Nunca PLAYOUT_STATE_KEY (admira-tv:playout:v1).
  if (GROUP_STATE_KEY === PLAYOUT_STATE_KEY) return json({ ok: false, error: "key_collision" }, 500);
  await env.ACCESS.put(GROUP_STATE_KEY, JSON.stringify(state));
  return json({ ok: true, state, serverNow: Date.now() });
}

export { GROUP_STATE_KEY, PLAYOUT_STATE_KEY };
