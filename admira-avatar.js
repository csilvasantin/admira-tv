/* admira.tv/cms · Avatar copiloto Admira — MISMO componente que Yokup (fuente única
 * digitalavatar.ai/embed.js), cerebro de incidencias de la flota (api.yokup.com /copilot).
 * Mismo host que yokup-site/avatar-widget.js: nunca *.workers.dev (los ISP españoles
 * lo bloquean y la burbuja se queda muda). El cms ya está tras auth-gate.js
 * (Google + whitelist): reutilizamos esa credencial (localStorage.admira_gate.cred),
 * la canjeamos por una sesión Yokup (12h) y el avatar habla autenticado. */
(function () {
  var WORKER = "https://api.yokup.com";
  var SKEY = "yk_session";
  var rawFetch = window.fetch.bind(window);

  function sessionValid() {
    try {
      return !!(typeof AdmiraSession !== "undefined" && AdmiraSession.valid(localStorage.getItem(SKEY)));
    } catch (e) { return false; }
  }

  // El fetch a api.yokup.com espera a que haya sesión y añade el Bearer (solo a ese host).
  var resolveReady; var sessionReady = new Promise(function (r) { resolveReady = r; });
  window.fetch = function (input, init) {
    var u = typeof input === "string" ? input : (input && input.url) || "";
    if (u.indexOf(WORKER) !== 0 && !/\/api\/copilot(?:\?|$)/.test(u)) return rawFetch(input, init);
    return sessionReady.then(function () {
      init = init || {};
      var h = new Headers(init.headers || {});
      var t = localStorage.getItem(SKEY); if (t) h.set("Authorization", "Bearer " + t);
      init.headers = h;
      return rawFetch(u, init);
    });
  };

  // Canjea la credencial de Google del gate por una sesión Yokup (una vez; la sesión dura 12h).
  function ensureSession() {
    if (sessionValid()) { resolveReady(); return; }
    var tries = 0;
    (function wait() {
      var g = null; try { g = JSON.parse(localStorage.getItem("admira_gate") || "null"); } catch (e) {}
      if (g && g.cred) {
        rawFetch(WORKER + "/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ credential: g.cred }) })
          .then(function (r) { return r.json().then(function (d) { return { s: r.status, d: d }; }); })
          .then(function (o) { if (o.s === 200 && o.d.token) { try { localStorage.setItem(SKEY, o.d.token); } catch (e) {} } resolveReady(); })
          .catch(function () { resolveReady(); });
      } else if (tries++ < 1200) { setTimeout(wait, 250); } else { resolveReady(); }
    })();
  }

  function go() {
    ensureSession();
    import("https://digitalavatar.ai/embed.js").then(function (m) {
      m.mount({
        // Same-origin: no workers.dev, y las preguntas de flota se responden
        // aunque la sesión Yokup no haya cuajado. El resto exige Bearer.
        brainUrl: (typeof location !== "undefined" ? location.origin : "") + "/api/copilot",
        title: "Admira · copiloto",
        greeting: "Hola, soy Admira. Pregúntame por las pantallas en emisión o las incidencias de la flota.",
        placeholder: "Escribe o pulsa el micro…",
        lang: "es-ES",
        accent: "#78f3ff",
      });
    }).catch(function () {});
  }
  if (document.readyState !== "loading") go(); else document.addEventListener("DOMContentLoaded", go);
})();
