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
  function createRateServo(options = {}) {
    const now = options.now || (() => performance.now());
    let previous = null, lastSeek = -Infinity, identity = null, pending = null, detach = null;
    let settleUntil = -Infinity, seekLatency = null, totalSeeks = 0;
    const initialState = () => ({mode: 'idle', strategy: 'rate', identity, driftMs: null, rate: 1, seeks: 0,
      totalSeeks, seekLatencyMs: null, seekLeadMs: 40, seekInFlight: false, seekFailures: 0});
    let state = initialState();
    function rateOf(media) { return media && Number.isFinite(media.playbackRate) ? media.playbackRate : 1; }
    function setRate(media, rate) {
      // Avoid unnecessary ratechange/pitch work in the media pipeline.
      if (media && Math.abs(rateOf(media) - rate) > (rate === 1 ? .000001 : .002)) media.playbackRate = rate;
      return rateOf(media);
    }
    function resetRate(media) { if (media) try { setRate(media, 1); } catch (_) {} }
    function finishSeek(media, token, at) {
      if (previous !== media || identity !== token || !pending) return;
      const latency = Math.max(0, at - pending.startedAt);
      if (Number.isFinite(latency) && latency <= 10000) {
        seekLatency = seekLatency == null ? latency : seekLatency * .5 + latency * .5;
        state.seekLatencyMs = seekLatency;
      }
      pending = null; lastSeek = at; settleUntil = at + 250;
      state.seekInFlight = false;
    }
    function tick(input) {
      const m = input.media;
      if (previous !== m || identity !== input.identity) {
        if (detach) detach(); detach = null;
        resetRate(previous); previous = m; identity = input.identity; lastSeek = -Infinity;
        pending = null; settleUntil = -Infinity; seekLatency = null; state = initialState();
        if (m) {
          try { if (m.preservesPitch !== true) m.preservesPitch = true; } catch (_) {}
          if (typeof m.addEventListener === 'function') {
            const token = identity, done = () => finishSeek(m, token, now());
            m.addEventListener('seeked', done);
            detach = () => m.removeEventListener('seeked', done);
          }
        }
      }
      const valid = input.enabled && m && Number.isFinite(input.targetSec) &&
        Number.isFinite(m.currentTime) && Number.isFinite(m.duration) && m.duration > 0;
      if (!valid || m.paused || m.ended) {
        resetRate(m); state = {...state, mode: 'idle', driftMs: null, rate: rateOf(m)}; return {...state};
      }
      if (pending && input.nowMs - pending.startedAt > 10000) {
        pending = null; state.seekInFlight = false; state.seekFailures++;
        lastSeek = input.nowMs; settleUntil = input.nowMs + 250;
      }
      // A seek/buffer may pause the media clock. Do not repeatedly change its rate
      // during that transition, or issue another seek against an obsolete position.
      if (pending || m.seeking || m.readyState < 2 || input.nowMs < settleUntil) {
        state = {...state, mode: pending || m.seeking ? 'seeking' : m.readyState < 2 ? 'buffering' : 'settling',
          driftMs: null, rate: rateOf(m), seekInFlight: !!pending}; return {...state};
      }
      const targetSec = clamp(input.targetSec, 0, Math.max(0, m.duration - .02));
      let drift = (m.currentTime - targetSec) * 1000;
      if (input.circular && m.duration > 1) {
        const cycle = m.duration * 1000;
        drift = ((drift + cycle / 2) % cycle + cycle) % cycle - cycle / 2;
      }
      let rate = 1, mode = 'locked';
      const leadMs = clamp(seekLatency == null ? 40 : seekLatency + 40, 40, 2000);
      if (Math.abs(drift) > 500 && input.nowMs - lastSeek >= 3000) {
        try {
          resetRate(m);
          pending = {startedAt: input.nowMs};
          m.currentTime = clamp(targetSec + leadMs / 1000, 0, Math.max(0, m.duration - .02));
          lastSeek = input.nowMs; state.seeks++; totalSeeks++; mode = 'seek';
          // Synchronous test/legacy media without events cannot expose seek latency.
          if (typeof m.addEventListener !== 'function') pending = null;
        } catch (_) { pending = null; state.seekFailures++; mode = 'seek-failed'; }
      } else if (Math.abs(drift) > 15) {
        rate = clamp(1 - drift / 1500, .9, 1.1); mode = 'correcting';
      }
      try { rate = setRate(m, rate); } catch (_) { rate = rateOf(m); mode = 'rate-unsupported'; }
      state = {...state, mode, driftMs: drift, rate, totalSeeks, seekLeadMs: leadMs, seekInFlight: !!pending};
      return {...state};
    }
    return {tick, status: () => ({...state})};
  }

  function createSeekServo(options = {}) {
    const now = options.now || (() => performance.now());
    let previous = null, identity = null, assetKey = null, pending = null, detach = null;
    const learnedAssets = new Map();
    let lastSeek = -Infinity, totalSeeks = 0, nextLead = 40, established = false;
    const tracker = () => ({last: null, points: [], spanMs: 0});
    let warmup = tracker();
    const fresh = () => ({mode: 'idle', strategy: 'seek', identity,
      driftMs: null, rate: 1, seeks: 0, totalSeeks, seekLatencyMs: null,
      settledLatencyMs: null, residualAfterSeekMs: null, seekLeadMs: nextLead,
      nextSeekLeadMs: nextLead, leadSource: assetKey && learnedAssets.has(assetKey) ? 'asset' : 'default', seekInFlight: false, seekFailures: 0});
    let state = fresh();
    const rateOf = m => m && Number.isFinite(m.playbackRate) ? m.playbackRate : 1;
    function unitRate(m) { if (m && Math.abs(rateOf(m) - 1) > .000001) m.playbackRate = 1; }
    function observe(t, input, m, drift) {
      const point = {at: input.nowMs, time: m.currentTime, drift};
      if (t.last) {
        const dt = point.at - t.last.at, advance = (point.time - t.last.time) * 1000;
        const speed = advance / dt;
        if (dt >= 150 && dt <= 1000 && speed >= .85 && speed <= 1.15) {
          t.spanMs += dt; t.points.push(point); t.points = t.points.slice(-3);
        } else { t.spanMs = 0; t.points = []; }
      }
      t.last = point;
      return t.spanMs >= 750 && t.points.length >= 3;
    }
    function tick(input) {
      const m = input.media;
      if (m !== previous || identity !== input.identity || assetKey !== (input.assetKey || null)) {
        if (detach) detach(); detach = null;
        try { unitRate(previous); } catch (_) {}
        previous = m; identity = input.identity; assetKey = input.assetKey || null; pending = null;
        nextLead = assetKey && learnedAssets.has(assetKey) ? learnedAssets.get(assetKey) : 40; lastSeek = -Infinity; established = false; warmup = tracker(); state = fresh();
        if (m && typeof m.addEventListener === 'function') {
          const token = identity, done = () => {
            if (previous !== m || identity !== token || !pending) return;
            pending.seekedAt = now(); pending.observation = tracker();
            state.seekLatencyMs = Math.max(0, pending.seekedAt - pending.startedAt);
          };
          m.addEventListener('seeked', done); detach = () => m.removeEventListener('seeked', done);
        }
      }
      try { unitRate(m); } catch (_) {
        state = {...state, mode: 'rate-unsupported', rate: rateOf(m)}; return {...state};
      }
      const valid = input.enabled && m && Number.isFinite(input.targetSec) &&
        Number.isFinite(m.currentTime) && Number.isFinite(m.duration) && m.duration > 0;
      if (!valid || m.paused || m.ended) {
        warmup = tracker(); if (pending) pending.observation = tracker();
        state = {...state, mode: 'idle', driftMs: null, rate: rateOf(m)}; return {...state};
      }
      const target = clamp(input.targetSec, 0, Math.max(0, m.duration - .02));
      let drift = (m.currentTime - target) * 1000;
      if (input.circular && m.duration > 1) {
        const cycle = m.duration * 1000;
        drift = ((drift + cycle / 2) % cycle + cycle) % cycle - cycle / 2;
      }
      state = {...state, driftMs: drift, rate: rateOf(m), seekInFlight: !!pending};
      if (pending) {
        if (input.nowMs - pending.startedAt > 10000) {
          pending = null; lastSeek = input.nowMs; established = false; warmup = tracker();
          state = {...state, mode: 'seek-timeout', seekFailures: state.seekFailures + 1, seekInFlight: false};
          return {...state};
        }
        if (m.seeking || m.readyState < 2) {
          pending.observation = tracker(); state.mode = 'seeking'; return {...state};
        }
        if (pending.seekedAt == null && typeof m.addEventListener === 'function') {
          state.mode = 'seeking'; return {...state};
        }
        if (!observe(pending.observation, input, m, drift)) {
          state.mode = 'calibrating'; return {...state};
        }
        // Learn from the residual only after three intervals of real 1x advance.
        // seeked alone can precede the decoder/playhead settling by hundreds of ms.
        const residual = median(pending.observation.points.map(p => p.drift));
        nextLead = clamp(pending.usedLead - residual, 0, 2000);
        if (assetKey && Math.abs(residual) <= 35) {
          learnedAssets.delete(assetKey); learnedAssets.set(assetKey, nextLead);
          if (learnedAssets.size > 128) learnedAssets.delete(learnedAssets.keys().next().value);
        }
        state = {...state, mode: 'settled', settledLatencyMs: input.nowMs - pending.startedAt,
          residualAfterSeekMs: residual, nextSeekLeadMs: nextLead, leadSource: 'measured', seekInFlight: false};
        pending = null; lastSeek = input.nowMs; established = true; return {...state};
      }
      if (m.seeking || m.readyState < 2) {
        established = false; warmup = tracker(); state.mode = m.seeking ? 'seeking' : 'buffering'; return {...state};
      }
      if (!established) {
        if (!observe(warmup, input, m, drift)) { state.mode = 'warming'; return {...state}; }
        established = true;
      }
      state.mode = Math.abs(drift) <= 35 ? 'locked' : 'cooldown';
      if (Math.abs(drift) > 35 && input.nowMs - lastSeek >= 3000) {
        try {
          pending = {startedAt: input.nowMs, usedLead: nextLead, seekedAt: null, observation: tracker()};
          m.currentTime = clamp(target + nextLead / 1000, 0, Math.max(0, m.duration - .02));
          lastSeek = input.nowMs; state.seeks++; totalSeeks++;
          state = {...state, mode: 'seek', totalSeeks, seekLeadMs: nextLead, seekInFlight: true};
        } catch (_) {
          pending = null; lastSeek = input.nowMs;
          state = {...state, mode: 'seek-failed', seekFailures: state.seekFailures + 1, seekInFlight: false};
        }
      }
      return {...state};
    }
    return {tick, status: () => ({...state})};
  }
  function strategyForUserAgent(userAgent) {
    const ua = String(userAgent || '');
    // CriOS and FxiOS still use WebKit. Desktop Chromium and Android do not.
    if (/Chrome|Chromium|Edg|Electron|Android/i.test(ua)) return 'rate';
    return /AppleWebKit|Safari|AdmiraMacOSPlayer|AdmiraIOSPlayer/i.test(ua) ? 'seek' : 'rate';
  }
  function createServo(options = {}) {
    const strategy = options.strategy === 'seek' || options.strategy === 'rate' ? options.strategy :
      strategyForUserAgent(options.userAgent == null ? (typeof navigator === 'undefined' ? '' : navigator.userAgent) : options.userAgent);
    return strategy === 'seek' ? createSeekServo(options) : createRateServo(options);
  }
  return {measurement, createClock, createServo, createSeekServo, createRateServo, strategyForUserAgent};
});
