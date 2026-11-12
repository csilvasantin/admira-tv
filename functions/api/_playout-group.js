/* ESM del transporte de grupo. Misma lógica que /playout-group-math.js (UMD del player). */
const api = (function () {
  var GROUP_STATE_KEY = "admira-tv:playout:group:v1";
  var PLAYOUT_STATE_KEY = "admira-tv:playout:v1";
  var ACTIONS = ["next", "prev", "first", "last", "pause", "play", "reset"];

  function defaultState() {
    return { shiftMs: 0, pausedAt: null, revision: 0, updatedAt: 0, events: [] };
  }

  function cleanDurations(raw) {
    if (!Array.isArray(raw) || !raw.length || raw.length > 200) return null;
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var n = Number(raw[i]);
      if (!Number.isFinite(n) || n < 1) return null;
      out.push(Math.max(1, Math.round(n)));
    }
    return out;
  }

  function totalOf(durations) {
    var t = 0;
    for (var i = 0; i < durations.length; i++) t += durations[i];
    return t || 1;
  }

  function posAt(shiftMs, pausedAt, now, total) {
    var t = pausedAt != null ? pausedAt : now;
    return (((t + shiftMs) % total) + total) % total;
  }

  function indexAt(pos, durations) {
    var start = 0, index = durations.length - 1;
    for (var i = 0; i < durations.length; i++) {
      if (pos < start + durations[i]) { index = i; break; }
      start += durations[i];
    }
    return { index: index, start: start, duration: durations[index] };
  }

  function itemStarts(durations) {
    var s = [0];
    for (var i = 0; i < durations.length - 1; i++) s.push(s[i] + durations[i]);
    return s;
  }

  function shiftTo(target, pausedAt, now, total) {
    var effective = pausedAt != null ? pausedAt : now;
    return target - effective;
  }

  function applyAction(current, action, now, durations) {
    var shiftMs = Number(current.shiftMs) || 0;
    var pausedAt = current.pausedAt == null ? null : Number(current.pausedAt);
    if (action === "reset") return { shiftMs: 0, pausedAt: null };
    if (action === "pause") {
      if (pausedAt != null) return { shiftMs: shiftMs, pausedAt: pausedAt };
      return { shiftMs: shiftMs, pausedAt: now };
    }
    if (action === "play") {
      if (pausedAt == null) return { shiftMs: shiftMs, pausedAt: null };
      return { shiftMs: shiftMs + pausedAt - now, pausedAt: null };
    }
    var total = totalOf(durations);
    var pos = posAt(shiftMs, pausedAt, now, total);
    var info = indexAt(pos, durations);
    var starts = itemStarts(durations);
    var target = 0;
    if (action === "first") target = 0;
    else if (action === "last") target = starts[starts.length - 1];
    else if (action === "next") target = starts[(info.index + 1) % durations.length];
    else if (action === "prev") target = starts[(info.index - 1 + durations.length) % durations.length];
    else return { shiftMs: shiftMs, pausedAt: pausedAt };
    return { shiftMs: shiftTo(target, pausedAt, now, total), pausedAt: pausedAt };
  }

  function foldEvents(state, durations) {
    var cur = {
      shiftMs: Number(state && state.shiftMs) || 0,
      pausedAt: state && state.pausedAt == null ? null : Number(state.pausedAt)
    };
    var events = Array.isArray(state && state.events) ? state.events : [];
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      cur = applyAction(cur, ev.action, Number(ev.at) || 0, durations);
    }
    return cur;
  }

  function applyGroupAction(state, action, now, durations) {
    var act = String(action || "").toLowerCase();
    if (ACTIONS.indexOf(act) < 0) return null;
    now = Number(now) || 0;
    var base = {
      shiftMs: Number(state && state.shiftMs) || 0,
      pausedAt: state && state.pausedAt == null ? null : Number(state.pausedAt),
      events: Array.isArray(state && state.events) ? state.events.slice() : [],
      revision: Number(state && state.revision) || 0,
      updatedAt: Number(state && state.updatedAt) || 0,
      paused: state && state.paused != null ? !!state.paused : !!(state && state.pausedAt != null)
    };
    if (act === "reset") {
      return { shiftMs: 0, pausedAt: null, events: [], revision: base.revision + 1, updatedAt: now, paused: false };
    }
    var clean = cleanDurations(durations);
    var needDurations = act === "next" || act === "prev" || act === "first" || act === "last";
    if (clean) {
      var folded = foldEvents(base, clean);
      var next = applyAction(folded, act, now, clean);
      return { shiftMs: next.shiftMs, pausedAt: next.pausedAt, events: [], revision: base.revision + 1, updatedAt: now, paused: next.pausedAt != null };
    }
    if (needDurations) {
      base.events.push({ action: act, at: now });
      return { shiftMs: base.shiftMs, pausedAt: base.pausedAt, events: base.events, revision: base.revision + 1, updatedAt: now };
    }
    if (base.events.length) {
      // Hay «next/prev…» sin resolver (se resuelven con las duraciones de cada player): pause/play
      // también van a la cola, en orden. Aplicarlos a la base y re-jugar luego los eventos
      // contra pausedAt movía la línea de tiempo (12-nov-2026: la pausa saltaba a otra pieza).
      // `paused` dice el estado final para quien no pueda resolver la cola.
      base.events.push({ action: act, at: now });
      return { shiftMs: base.shiftMs, pausedAt: base.pausedAt, events: base.events, revision: base.revision + 1, updatedAt: now,
        paused: act === "pause" ? true : act === "play" ? false : !!base.paused };
    }
    var next2 = applyAction(base, act, now, null);
    return { shiftMs: next2.shiftMs, pausedAt: next2.pausedAt, events: base.events, revision: base.revision + 1, updatedAt: now, paused: next2.pausedAt != null };
  }

  function resolveState(state, durations) {
    var clean = cleanDurations(durations);
    if (!clean || !state || !state.events || !state.events.length) {
      return {
        shiftMs: Number(state && state.shiftMs) || 0,
        pausedAt: state && state.pausedAt == null ? null : Number(state.pausedAt)
      };
    }
    return foldEvents(state, clean);
  }

  function clockMs(state, now, durations, epochMs) {
    var raw = Number(now) - (Number(epochMs) || 0);
    var g = resolveState(state, durations);
    var t = g.pausedAt != null ? g.pausedAt : raw;
    return t + (Number(g.shiftMs) || 0);
  }

  function timeline(durations, state, now, epochMs) {
    var clean = cleanDurations(durations);
    if (!clean) return { index: 0, duration: 1, elapsed: 0, remaining: 1, total: 1, pos: 0 };
    var total = totalOf(clean);
    var pos = ((clockMs(state, now, clean, epochMs) % total) + total) % total;
    var info = indexAt(pos, clean);
    return {
      index: info.index,
      duration: info.duration,
      elapsed: pos - info.start,
      remaining: info.duration - (pos - info.start),
      total: total,
      pos: pos
    };
  }

  return {
    GROUP_STATE_KEY: GROUP_STATE_KEY,
    PLAYOUT_STATE_KEY: PLAYOUT_STATE_KEY,
    ACTIONS: ACTIONS,
    defaultState: defaultState,
    cleanDurations: cleanDurations,
    applyGroupAction: applyGroupAction,
    resolveState: resolveState,
    clockMs: clockMs,
    timeline: timeline
  };
})();

export const GROUP_STATE_KEY = api.GROUP_STATE_KEY;
export const PLAYOUT_STATE_KEY = api.PLAYOUT_STATE_KEY;
export const ACTIONS = api.ACTIONS;
export const defaultState = api.defaultState;
export const cleanDurations = api.cleanDurations;
export const applyGroupAction = api.applyGroupAction;
export const resolveState = api.resolveState;
export const clockMs = api.clockMs;
export const timeline = api.timeline;
