/* ============================================================================
   cms-pacman.js — Celebración Pac-Man cuando una pantalla caída VUELVE a antena.
   admira.tv/cms · MEJORA 3/3, encargo de Carlos (2026-07-12).

   En el cms, el ciclo de emisión trae los players de
   api.admira.store/signage/screens con `p.online` true/false. Cuando una
   pantalla que ESTABA caída (offline, o desaparecida del feed → caída dura)
   VUELVE a estar online, por la LÍNEA INFERIOR de la pantalla cruza un Pac-Man
   (canvas, boca abriendo/cerrando) comiéndose una hilera de puntos, arrastrando
   una PANCARTA:
       «📡 <screen> DE VUELTA EN ANTENA — <circuito/sitio si se sabe>»
   con el waka-waka típico EMULADO por síntesis WebAudio (sin assets externos).

   Autónomo: NO invade el IIFE de emisión del cms. Hace su propio fetch de
   /signage/screens (endpoint público, el cms ya lo machaca) cada 40 s y
   diffea `online` por `screen`. Estado persistido en localStorage
   (cmspacman.seen.v1); la 1ª pasada SIEMBRA sin celebrar (no re-celebra tras
   recargar). Anti-spam: máx. 1 celebración por pantalla / 10 min (flapping).
   Respeta prefers-reduced-motion y la política de autoplay (silencio hasta la
   primera interacción). Deja libre la esquina inf-dcha (burbuja del avatar).

   Debug: window.cmsPacmanTest("pantalla-x")  → dispara una vuelta de mentira.
   ========================================================================== */
(function () {
  "use strict";

  var SCREENS_URL = "https://api.admira.store/signage/screens";
  var POLL_MS   = 40000;                      // mismo ritmo que ebLoad del cms
  var LS_KEY    = "cmspacman.seen.v1";        // último estado online conocido por screen
  var ANTISPAM_MS = 10 * 60 * 1000;           // 1 celebración por pantalla / 10 min
  var DUR_MS    = 7000;                       // duración del recorrido
  var AVATAR_SAFE = 132;                      // px libres a la dcha (burbuja avatar), como yk-frame

  var reduced = false;
  try {
    reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) {}

  /* ---- estado persistido: último online conocido por screen -------------- */
  //   { "<screen>": true|false }
  function loadSeen() {
    try { var o = JSON.parse(localStorage.getItem(LS_KEY) || "null"); return (o && typeof o === "object") ? o : null; }
    catch (e) { return null; }
  }
  function saveSeen(map) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(map)); } catch (e) {}
  }
  var seen = loadSeen();                       // null ⇒ aún sin sembrar
  var lastCelebAt = {};                        // screen → ts (anti-flapping, en memoria)

  /* ---- cola de celebraciones -------------------------------------------- */
  var queue = [];
  var busy = false;

  /* ---- audio: waka-waka emulado (WebAudio, sin archivos) ----------------- */
  var actx = null, audioReady = false;
  function ensureAudio() {
    if (actx) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      actx = new AC();
    } catch (e) { actx = null; }
  }
  function unlockAudio() {
    ensureAudio();
    if (actx && actx.state === "suspended") {
      actx.resume().then(function () { audioReady = true; }).catch(function () {});
    } else if (actx) {
      audioReady = true;
    }
  }
  ["pointerdown", "keydown", "touchstart"].forEach(function (ev) {
    window.addEventListener(ev, unlockAudio, { once: false, passive: true });
  });

  // Un "waka": blip de onda cuadrada con glissando; `down` alterna el sentido.
  function chomp(down) {
    if (!actx || actx.state !== "running") return;
    var t = actx.currentTime;
    var osc = actx.createOscillator();
    var g = actx.createGain();
    osc.type = "square";
    var hi = 620, lo = 300;
    osc.frequency.setValueAtTime(down ? hi : lo, t);
    osc.frequency.exponentialRampToValueAtTime(down ? lo : hi, t + 0.085);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.045, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    osc.connect(g); g.connect(actx.destination);
    osc.start(t); osc.stop(t + 0.12);
  }

  /* ---- CSS inyectado (autocontenido) ------------------------------------- */
  function injectCss() {
    if (document.getElementById("cmspm-css")) return;
    var st = document.createElement("style");
    st.id = "cmspm-css";
    st.textContent =
      "#cmspm-band{position:fixed;left:0;right:" + AVATAR_SAFE + "px;bottom:0;height:60px;z-index:70;" +
        "pointer-events:none;display:none;overflow:hidden;" +
        "background:linear-gradient(180deg,rgba(4,8,13,0) 0%,rgba(4,8,13,.72) 40%,rgba(4,8,13,.94) 100%);}" +
      "#cmspm-canvas{position:absolute;left:0;bottom:0;width:100%;height:100%;}" +
      "#cmspm-banner{position:absolute;bottom:12px;left:0;transform:translateX(-999px);" +
        "display:flex;align-items:center;height:30px;padding:0 14px;white-space:nowrap;" +
        "font-family:'Orbitron','JetBrains Mono',ui-monospace,monospace;" +
        "font-size:12px;letter-spacing:.11em;text-transform:uppercase;" +
        "color:#04120c;background:#39d98a;border:2px solid #78f3ff;border-radius:5px;" +
        "box-shadow:0 0 15px rgba(57,217,138,.55),0 0 8px rgba(120,243,255,.5),0 3px 10px rgba(1,4,10,.6);" +
        "text-shadow:0 1px 0 rgba(255,255,255,.28);will-change:transform;}" +
      "@media(max-width:640px){#cmspm-band{right:0}}";
    (document.head || document.documentElement).appendChild(st);
  }

  /* ---- DOM: banda + canvas + pancarta ----------------------------------- */
  var band, canvas, ctx, banner, bannerText;
  function buildDom() {
    if (band) return;
    injectCss();
    band = document.createElement("div");
    band.id = "cmspm-band";
    band.setAttribute("aria-hidden", "true");

    canvas = document.createElement("canvas");
    canvas.id = "cmspm-canvas";
    band.appendChild(canvas);
    ctx = canvas.getContext("2d");

    banner = document.createElement("div");
    banner.id = "cmspm-banner";
    bannerText = document.createElement("span");
    banner.appendChild(bannerText);
    band.appendChild(banner);

    (document.body || document.documentElement).appendChild(band);
  }

  function fitCanvas() {
    var dpr = window.devicePixelRatio || 1;
    var w = band.clientWidth, h = band.clientHeight;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: w, h: h };
  }

  /* ---- una celebración --------------------------------------------------- */
  function clip(text, max) {
    var t = (text || "").replace(/\s+/g, " ").trim();
    if (t.length <= max) return t;
    var cut = t.slice(0, max), sp = cut.lastIndexOf(" ");
    if (sp > max * 0.5) cut = cut.slice(0, sp);
    return cut + "…";
  }

  function celebrate(item) {
    buildDom();
    var screen = (item.screen || "?").toString();
    var where  = clip(item.where || "", 40);
    var label = "📡 " + clip(screen, 40) + " DE VUELTA EN ANTENA" + (where ? " — " + where : "");
    bannerText.textContent = label;

    band.style.display = "block";
    var dim = fitCanvas();
    var W = dim.w, H = dim.h;
    var cy = H - 26;                            // línea de la boca / puntos
    var R = 15;                                 // radio de Pac-Man

    var dots = [];
    var gap = 34, start = 40;
    for (var x = start; x < W - 20; x += gap) dots.push({ x: x, eaten: false });

    var bw = Math.min(banner.offsetWidth || 260, W - 20);
    var t0 = null;
    var lastChompAt = -1, chompFlip = false;

    if (reduced) {
      var bx0 = Math.max(8, (W - bw) / 2);
      banner.style.transform = "translateX(" + bx0 + "px)";
      var px = bx0 - 30;
      unlockAudio();
      var frames = 0;
      var iv = setInterval(function () {
        ctx.clearRect(0, 0, W, H);
        drawPac(px < 20 ? 30 : px, cy, R, (frames % 20) / 20);
        if (frames % 12 === 0) { chomp(chompFlip); chompFlip = !chompFlip; }
        frames++;
      }, 60);
      setTimeout(function () { clearInterval(iv); finishCelebration(); }, 5000);
      return;
    }

    unlockAudio();
    function step(ts) {
      if (t0 == null) t0 = ts;
      var p = (ts - t0) / DUR_MS;
      if (p > 1) { finishCelebration(); return; }

      var pacX = -R + p * (W + 2 * R);
      var mouth = Math.abs(Math.sin((ts - t0) / 1000 * Math.PI * 4));

      ctx.clearRect(0, 0, W, H);

      ctx.fillStyle = "#9dfbd0";               // puntos verde fósforo claro
      for (var i = 0; i < dots.length; i++) {
        var d = dots[i];
        if (!d.eaten && d.x <= pacX - R * 0.3) {
          d.eaten = true;
          if (lastChompAt < 0 || ts - lastChompAt > 90) {
            chomp(chompFlip); chompFlip = !chompFlip; lastChompAt = ts;
          }
        }
        if (!d.eaten) { ctx.beginPath(); ctx.arc(d.x, cy, 3, 0, Math.PI * 2); ctx.fill(); }
      }

      drawPac(pacX, cy, R, mouth);

      var bx = pacX - R - bw - 6;
      banner.style.transform = "translateX(" + bx + "px)";

      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // Pac-Man mirando a la derecha. `mouth` 0 (cerrada) .. 1 (abierta ~45º).
  function drawPac(x, y, r, mouth) {
    var open = mouth * 0.62;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, r, open, Math.PI * 2 - open, false);
    ctx.closePath();
    var grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r);
    grad.addColorStop(0, "#ffe27a");
    grad.addColorStop(1, "#ffcf3f");
    ctx.fillStyle = grad;
    ctx.shadowColor = "rgba(255,207,63,.7)";
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#1a1200";
    ctx.beginPath();
    ctx.arc(x + r * 0.15, y - r * 0.45, r * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function finishCelebration() {
    if (banner) banner.style.transform = "translateX(-999px)";
    if (ctx && band) ctx.clearRect(0, 0, band.clientWidth, band.clientHeight);
    if (band) band.style.display = "none";
    busy = false;
    setTimeout(pump, 350);
  }

  function pump() {
    if (busy) return;
    var next = queue.shift();
    if (!next) return;
    busy = true;
    celebrate(next);
  }

  function enqueue(item) {
    var now = Date.now();
    var key = String(item.screen || "?");
    if (lastCelebAt[key] && now - lastCelebAt[key] < ANTISPAM_MS) return;  // flapping
    lastCelebAt[key] = now;
    queue.push(item);
    pump();
  }

  /* ---- diff del feed: detectar transición offline→online ----------------- */
  //   Regla: pantalla conocida cuyo último estado era offline (o que había
  //   DESAPARECIDO del feed = caída dura) y ahora está online → celebrar.
  //   Pantalla vista POR PRIMERA VEZ → solo se siembra, no se celebra.
  function scan(players) {
    // estado actual: online real de las presentes; las conocidas AUSENTES del
    // feed cuentan como offline (caída dura) para que su vuelta dispare false→true.
    var current = {};
    var present = {};
    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      if (!p || p.screen == null) continue;
      var k = String(p.screen);
      present[k] = true;
      current[k] = !!p.online;
    }

    if (seen === null) {
      // 1ª pasada: siembra sin celebrar. Las ausentes aún no existen para nosotros.
      saveSeen(current);
      seen = current;
      return;
    }

    // pantallas conocidas ausentes del feed → offline en el estado actual
    for (var kk in seen) {
      if (Object.prototype.hasOwnProperty.call(seen, kk) && !present[kk]) current[kk] = false;
    }

    var backs = [];
    for (var s in current) {
      if (!Object.prototype.hasOwnProperty.call(current, s)) continue;
      var was = seen[s];                        // undefined ⇒ nueva (no celebrar)
      if (was === false && current[s] === true) {
        var pl = null;
        for (var j = 0; j < players.length; j++) { if (players[j] && String(players[j].screen) === s) { pl = players[j]; break; } }
        backs.push({ screen: s, where: pl ? (pl.locName || pl.loc || "") : "" });
      }
    }

    saveSeen(current);
    seen = current;

    backs.forEach(enqueue);
  }

  function poll() {
    if (document.hidden) return;
    fetch(SCREENS_URL, { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var players = (d && d.screens && Array.isArray(d.screens)) ? d.screens
                    : (d && Array.isArray(d) ? d : []);
        if (players) scan(players);
      })
      .catch(function () {});
  }

  /* ---- hook de debug ----------------------------------------------------- */
  window.cmsPacmanTest = function (screen, where) {
    enqueue({ screen: screen || "pantalla-demo", where: where || "Circuito Demo · Sala Norte" });
    return "🟡 waka waka — vuelta-en-antena de prueba encolada";
  };

  /* ---- arranque ---------------------------------------------------------- */
  function start() {
    poll();                                     // 1ª pasada: siembra (no celebra)
    setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) poll(); });
    window.addEventListener("resize", function () { if (band && band.style.display === "block") fitCanvas(); });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
