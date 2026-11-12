/* Transporte del grupo sincronizado (next/prev/first/last/pause/play).
 *
 * Elección: el estado autoritativo vive en una clave KV aparte
 * (admira-tv:playout:group:v1) como {shiftMs, pausedAt, revision, updatedAt, events}.
 * NUNCA se escribe admira-tv:playout:v1 ni se toca su revision: las Functions de
 * preview comparten el KV de producción y los players reales siguen con el canal
 * de producción, que no lee esta clave.
 *
 * La línea de tiempo del grupo es (now - epoch + shiftMs) mód total, congelada
 * en pausedAt mientras está en pausa. Si el POST trae `durations` (ms de cada
 * pieza, el mismo orden que la playlist de sincro), el servidor calcula el nuevo
 * shiftMs y deja events vacío: todos los clients idénticos leen el mismo estado.
 * Si no hay duraciones (p.ej. el mando aún no tiene la lista), se guarda la
 * acción con el timestamp del servidor en `events` y cada player la resuelve
 * de forma determinista con su playlist. Pause y play no necesitan duraciones.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AdmiraPlayoutGroup = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
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
      updatedAt: Number(state && state.updatedAt) || 0
    };
    if (act === "reset") {
      return { shiftMs: 0, pausedAt: null, events: [], revision: base.revision + 1, updatedAt: now };
    }
    var clean = cleanDurations(durations);
    var needDurations = act === "next" || act === "prev" || act === "first" || act === "last";
    if (clean) {
      var folded = foldEvents(base, clean);
      var next = applyAction(folded, act, now, clean);
      return { shiftMs: next.shiftMs, pausedAt: next.pausedAt, events: [], revision: base.revision + 1, updatedAt: now };
    }
    if (needDurations) {
      base.events.push({ action: act, at: now });
      return { shiftMs: base.shiftMs, pausedAt: base.pausedAt, events: base.events, revision: base.revision + 1, updatedAt: now };
    }
    var next2 = applyAction(base, act, now, null);
    return { shiftMs: next2.shiftMs, pausedAt: next2.pausedAt, events: base.events, revision: base.revision + 1, updatedAt: now };
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
});
