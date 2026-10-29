(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AdmiraPrecisionSync = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const median = a => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  function measurement(t0, t1, t2, t3) {
    if (![t0, t1, t2, t3].every(Number.isFinite) || t2 < t1 || t3 < t0) return null;
    const rtt = (t3 - t0) - (t2 - t1);
    if (rtt < 0 || rtt > 3000) return null;
    return {offset: ((t1 - t0) + (t2 - t3)) / 2, rtt};
  }
  function createClock(options = {}) {
    const wall = options.wallNow || Date.now;
    const mono = options.monoNow || (() => performance.now());
    const anchorWall = wall(), anchorMono = mono();
    let applied = 0, target = 0, lastMono = anchorMono, measuredAt = 0;
    let ready = false, rtt = null, uncertainty = null, restored = false;
    const local = () => anchorWall + mono() - anchorMono;
    function advance() {
      const m = mono(), dt = Math.max(0, m - lastMono); lastMono = m;
      applied += clamp(target - applied, -dt * .02, dt * .02); // Fine corrections: 20 ms/s.
      return anchorWall + m - anchorMono + applied;
    }
    try {
      const saved = options.load && options.load();
      if (saved && Number.isFinite(saved.offset) && Number.isFinite(saved.measuredAt) &&
          wall() >= saved.measuredAt && wall() - saved.measuredAt < 86400000) {
        applied = target = saved.offset; measuredAt = saved.measuredAt; ready = true; restored = true;
        rtt = Number.isFinite(saved.rtt) ? saved.rtt : null;
        uncertainty = Number.isFinite(saved.uncertainty) ? saved.uncertainty : null;
      }
    } catch (_) {}
    function accept(samples) {
      const best = samples.filter(s => s && Number.isFinite(s.offset) && Number.isFinite(s.rtt) && s.rtt >= 0 && s.rtt <= 3000)
        .sort((a, b) => a.rtt - b.rtt).slice(0, 5);
      if (best.length < 3) return false;
      advance(); target = median(best.map(s => s.offset));
      // Some WebViews stop performance.now() during sleep. Reacquire a validated
      // discrepancy over 1 s instead of spending hours slewing a suspended clock.
      if (!ready || Math.abs(target - applied) > 1000) applied = target;
      ready = true; restored = false; measuredAt = wall();
      rtt = median(best.map(s => s.rtt));
      uncertainty = rtt / 2 + Math.max(...best.map(s => Math.abs(s.offset - target))) + 1;
      try { if (options.save) options.save({offset: target + local() - wall(), measuredAt, rtt, uncertainty}); } catch (_) {}
      return true;
    }
    let flight = null;
    function synchronize(fetcher, url) {
      if (flight) return flight;
      flight = (async () => {
        const samples = [];
        for (let i = 0; i < 9; i++) {
          const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 2500);
          try {
            const t0 = local();
            const response = await fetcher(url + '?t=' + Math.round(t0) + '&sample=' + i,
              {cache: 'no-store', credentials: 'omit', signal: controller.signal});
            if (!response.ok) continue;
            const packet = await response.json(), t3 = local();
            if (!packet || packet.ok !== true || packet.protocol !== 'admira-clock-v1') continue;
            const s = measurement(t0, packet.serverReceivedAt, packet.serverSentAt, t3);
            if (s) samples.push(s);
          } catch (_) {} finally { clearTimeout(timeout); }
        }
        return accept(samples);
      })().finally(() => { flight = null; });
      return flight;
    }
    return {now: advance, localNow: local, accept, synchronize,
      get ready() { return ready; },
      status() {
        advance();
        return {protocol: 'admira-clock-v1', ready, source: ready ? (restored ? 'holdover' : 'https') : 'legacy',
          offsetMs: applied, targetOffsetMs: target, rttMs: rtt, uncertaintyMs: uncertainty,
          ageMs: measuredAt ? Math.max(0, wall() - measuredAt) : null, slewing: Math.abs(target - applied) > 1};
      }};
  }
  function createServo() {
    let previous = null, lastSeek = -Infinity, identity = null;
    let state = {mode: 'idle', driftMs: null, rate: 1, seeks: 0};
    function resetRate(media) { if (media) try { media.playbackRate = 1; } catch (_) {} }
    function tick(input) {
      const m = input.media;
      if (previous !== m || identity !== input.identity) {
        resetRate(previous); previous = m; identity = input.identity; lastSeek = -Infinity;
      }
      const active = input.enabled && m && Number.isFinite(input.targetSec) &&
        Number.isFinite(m.currentTime) && Number.isFinite(m.duration) && m.duration > 0 &&
        !m.paused && !m.ended && !m.seeking && m.readyState >= 2;
      if (!active) {
        resetRate(m); state = {...state, mode: 'idle', driftMs: null, rate: 1}; return state;
      }
      const targetSec = clamp(input.targetSec, 0, Math.max(0, m.duration - .02));
      let drift = (m.currentTime - targetSec) * 1000;
      if (input.circular && m.duration > 1) {
        const cycle = m.duration * 1000;
        drift = ((drift + cycle / 2) % cycle + cycle) % cycle - cycle / 2;
      }
      let rate = 1, mode = 'locked';
      if (Math.abs(drift) > 500 && input.nowMs - lastSeek >= 3000) {
        try {
          m.currentTime = clamp(targetSec + .04, 0, Math.max(0, m.duration - .02));
          lastSeek = input.nowMs; state.seeks++; mode = 'seek';
        } catch (_) { mode = 'seek-failed'; }
      } else if (Math.abs(drift) > 15) {
        rate = clamp(1 - drift / 1500, .9, 1.1); mode = 'correcting';
      }
      try { m.preservesPitch = true; m.playbackRate = rate; } catch (_) { mode = 'rate-unsupported'; }
      state = {...state, mode, driftMs: drift, rate}; return state;
    }
    return {tick, status: () => ({...state})};
  }
  return {measurement, createClock, createServo};
});
