/* SHOW SYNC (12-nov-2026, Zona 0 · Previa): reloj de sala para comprobar la sincro a ojo.
 * Capa fija en una esquina, grande y legible desde lejos, que NO toca la reproducción:
 * pointer-events:none (elementFromPoint la ignora → no cuenta como capa que tapa la emisión),
 * solo lee mediaEl.currentTime y el título; nunca hace seek/play/pause.
 * Hora del SERVIDOR corregida por el retardo de red (NTP de dos marcas):
 *   offset = serverNow − (t0 + t1)/2, nos quedamos con la muestra de menor RTT de varias,
 *   y se re-mide cada ~30 s. Se pinta con requestAnimationFrame.
 * Mando: showsync-on / showsync-off / showsync-toggle por /locations/cmd; ?showsync=1|0 en la URL.
 * Persiste en localStorage (adtv_showsync) para que un reinicio del player la conserve. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AdmiraShowSync = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const STORAGE_KEY = 'adtv_showsync';

  /** Una muestra NTP de dos marcas: t0/t1 en reloj local, serverNow del servidor. */
  function sample(t0, t1, serverNow) {
    const rtt = t1 - t0, server = Number(serverNow);
    if (!Number.isFinite(rtt) || rtt < 0 || !Number.isFinite(server) || server <= 0) return null;
    return { offset: server - (t0 + t1) / 2, rtt };
  }
  /** La mejor muestra es la de menor RTT (menos asimetría posible). */
  function bestSample(samples) {
    let best = null;
    for (const s of samples || []) if (s && Number.isFinite(s.offset) && Number.isFinite(s.rtt) && (!best || s.rtt < best.rtt)) best = s;
    return best;
  }
  const pad = (n, w) => String(Math.floor(Math.abs(n))).padStart(w, '0');
  /** ms de época → "HH:MM:SS.mmm" con el desfase horario dado (minutos al este de UTC). */
  function formatClock(ms, tzOffsetMin) {
    if (!Number.isFinite(ms)) return '--:--:--.---';
    const local = ms + (Number(tzOffsetMin) || 0) * 60000;
    const day = ((local % 86400000) + 86400000) % 86400000;
    return pad(day / 3600000, 2) + ':' + pad((day % 3600000) / 60000, 2) + ':' + pad((day % 60000) / 1000, 2) + '.' + pad(day % 1000, 3);
  }
  /** Posición del vídeo en ms → "M:SS.mmm" (+ "· 123456 ms"). */
  function formatPosition(ms) {
    if (!Number.isFinite(ms) || ms < 0) return '—';
    const t = Math.floor(ms);
    return Math.floor(t / 60000) + ':' + pad((t % 60000) / 1000, 2) + '.' + pad(t % 1000, 3) + '  ·  ' + t + ' ms';
  }
  /** Desfase de una zona IANA en minutos (Intl); si falla, el del dispositivo. */
  function tzOffsetMinutes(ms, timeZone) {
    try {
      const f = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const p = {}; for (const x of f.formatToParts(new Date(ms))) p[x.type] = x.value;
      const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
      return Math.round((asUTC - Math.floor(ms / 1000) * 1000) / 60000);
    } catch (_) { return -new Date(ms).getTimezoneOffset(); }
  }
  function parseFlag(value) {
    if (value == null) return null;
    return !/^(0|off|false|no)$/i.test(String(value));
  }

  /** Reloj de servidor independiente del player (si la sincro del player falla, éste lo delata). */
  function createServerClock(opts) {
    const o = opts || {};
    const perf = o.perfNow || (() => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()));
    const wall = o.wallNow || (() => Date.now());
    // Base local monotónica: wall en el arranque + performance.now() (inmune a saltos del reloj del SO).
    const base = wall() - perf();
    const local = () => base + perf();
    let offset = null, rtt = null, measuredAt = 0, busy = false, timer = null;
    async function measure() {
      if (busy || !o.fetchServerNow) return false;
      busy = true;
      try {
        const samples = [];
        for (let i = 0; i < (o.samples || 5); i++) {
          const t0 = local();
          let server = null;
          try { server = await o.fetchServerNow(); } catch (_) { server = null; }
          const s = sample(t0, local(), server);
          if (s) samples.push(s);
        }
        const best = bestSample(samples);
        if (!best) return false;
        offset = best.offset; rtt = best.rtt; measuredAt = local();
        return true;
      } finally { busy = false; }
    }
    function start() {
      stop();
      const loop = async () => { const ok = await measure(); timer = setTimeout(loop, ok ? (o.resyncMs || 30000) : 5000); };
      loop();
    }
    function stop() { if (timer) clearTimeout(timer); timer = null; }
    return {
      measure, start, stop,
      now: () => (offset == null ? null : local() + offset),
      get ready() { return offset != null; },
      get offset() { return offset; },
      get rtt() { return rtt; },
      get ageMs() { return offset == null ? null : local() - measuredAt; },
    };
  }

  /** Monta la capa en el documento. getState() → { screen, title, positionMs, mode }. */
  function createOverlay(opts) {
    const o = opts || {};
    const doc = o.document || document, win = o.window || window;
    const timeZone = o.timeZone || 'Europe/Madrid';
    const clock = o.clock || createServerClock({ fetchServerNow: o.fetchServerNow });
    let el = null, raf = 0, on = false, tz = null, tzAt = -1;
    function build() {
      if (el) return el;
      el = doc.createElement('div');
      el.id = 'admShowSync';                 // prefijo adm → whitelist del ALWAYS ON TOP
      el.setAttribute('data-adm-ok', '1');
      el.setAttribute('aria-hidden', 'true');
      el.style.cssText = [
        'position:fixed', 'right:1.2vh', 'bottom:1.2vh', 'z-index:2147483647', 'pointer-events:none',
        'user-select:none', 'box-sizing:border-box', 'padding:1vh 1.6vh', 'border-radius:1vh',
        'background:rgba(0,0,0,.62)', 'color:#fff', 'border:.25vh solid rgba(0,255,140,.85)',
        'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"DejaVu Sans Mono","Liberation Mono",monospace',
        'font-variant-numeric:tabular-nums', 'line-height:1.08', 'text-align:right', 'white-space:nowrap',
        'text-shadow:0 0 .4vh #000', 'contain:layout paint', 'max-width:96vw', 'overflow:hidden'
      ].join(';');
      el.innerHTML = '<div data-k="clock" style="font-size:7vh;font-weight:700;letter-spacing:.02em;color:#3dff9a"></div>' +
        '<div data-k="title" style="font-size:2.6vh;font-weight:600;overflow:hidden;text-overflow:ellipsis;max-width:60vw;margin-left:auto"></div>' +
        '<div data-k="pos" style="font-size:3.4vh;font-weight:700;color:#ffd84a"></div>' +
        '<div data-k="meta" style="font-size:1.6vh;opacity:.8"></div>';
      return el;
    }
    const part = k => el.querySelector('[data-k="' + k + '"]');
    function paint() {
      if (!on) return;
      try {
        const now = clock.now();
        if (now != null && (tz == null || Math.abs(now - tzAt) > 60000)) { tz = tzOffsetMinutes(now, timeZone); tzAt = now; }
        const st = (o.getState && o.getState()) || {};
        part('clock').textContent = now == null ? 'SYNC…' : formatClock(now, tz);
        part('title').textContent = st.title || '—';
        part('pos').textContent = '▶ ' + formatPosition(st.positionMs);
        part('meta').textContent = (st.screen || '') + (st.mode ? ' · ' + st.mode : '') +
          (clock.rtt != null ? ' · rtt ' + Math.round(clock.rtt) + ' ms' : '') + ' · show-sync';
      } catch (_) {}
      raf = win.requestAnimationFrame(paint);
    }
    function set(value) {
      const want = !!value;
      if (want === on) return on;
      on = want;
      try { win.localStorage.setItem(STORAGE_KEY, on ? '1' : '0'); } catch (_) {}
      if (on) {
        build(); if (!el.parentNode) (doc.body || doc.documentElement).appendChild(el);
        el.style.display = '';
        clock.start(); raf = win.requestAnimationFrame(paint);
      } else {
        if (raf) win.cancelAnimationFrame(raf); raf = 0; clock.stop();
        if (el && el.parentNode) el.parentNode.removeChild(el);
      }
      return on;
    }
    function initial(search) {
      let q = null;
      try { q = parseFlag(new URLSearchParams(search || '').get('showsync')); } catch (_) {}
      if (q != null) return q;
      try { return win.localStorage.getItem(STORAGE_KEY) === '1'; } catch (_) { return false; }
    }
    return { set, toggle: () => set(!on), get on() { return on; }, initial, clock, element: () => el };
  }

  /** Comando remoto → true/false/null (null = no es de show-sync). */
  function commandState(cmd, current) {
    const c = String(cmd || '').replace(/^\//, '').trim().toLowerCase();
    if (c === 'showsync-on' || c === 'show-sync-on' || c === 'showsync') return true;
    if (c === 'showsync-off' || c === 'show-sync-off') return false;
    if (c === 'showsync-toggle' || c === 'show-sync-toggle') return !current;
    return null;
  }

  return { STORAGE_KEY, sample, bestSample, formatClock, formatPosition, tzOffsetMinutes, parseFlag, createServerClock, createOverlay, commandState };
});
