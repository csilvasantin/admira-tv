/* admira.tv/cms · Avatar copiloto Admira — MISMO componente que Yokup (fuente única
 * digitalavatar.ai/embed.js), cerebro de incidencias de la flota (api.yokup.com /copilot).
 * Mismo host que yokup-site/avatar-widget.js: nunca *.workers.dev (los ISP españoles
 * lo bloquean y la burbuja se queda muda). El cms ya está tras auth-gate.js
 * (Google + whitelist): reutilizamos esa credencial (localStorage.admira_gate.cred),
 * la canjeamos por una sesión Yokup (12h) y el avatar habla autenticado. */
(function () {
  var WORKER = "https://api.yokup.com";
  // Apex: www.admira.tv hace 301 a admira.tv y el POST del chat pierde el cuerpo.
  var COPILOT = "https://admira.tv/api/copilot";
  var SCREENS = "https://api.admira.store/signage/screens";
  var SKEY = "yk_session";
  var rawFetch = window.fetch.bind(window);

  function sessionValid() {
    try {
      return !!(typeof AdmiraSession !== "undefined" && AdmiraSession.valid(localStorage.getItem(SKEY)));
    } catch (e) { return false; }
  }

  function looksLikePlayers(q) {
    var s = String(q || "").toLowerCase();
    if (!s.trim()) return false;
    if (/equipo|maquina|máquina|flota|ordenador|macbook/.test(s)) return false;
    var about = /player|reproductor|emitiend|en antena|pantalla|screen|mupi|totem|señal|senal|plataforma/;
    var asking = /cu[aá]ntos|cuantas|cuántas|cuantos|n[uú]mero|hay|emitiend|online|antena|ahora|conectad/;
    return about.test(s) && asking.test(s);
  }

  function questionFrom(init) {
    try {
      var b = JSON.parse((init && init.body) || "{}");
      return String((b && (b.question || b.text)) || "");
    } catch (e) { return ""; }
  }

  function playersResponse() {
    return rawFetch(SCREENS, { headers: { accept: "application/json" } })
      .then(function (r) { if (!r.ok) throw new Error("screens"); return r.json(); })
      .then(function (d) {
        var screens = (d && d.screens) || [];
        var live = screens.filter(function (s) { return s && s.online; })
          .map(function (s) { return s.screen || s.id || "player"; });
        var n = Number(d && d.online_count) || live.length;
        var tot = Number(d && d.total_count) || screens.length;
        var text;
        if (!tot) text = "Ahora mismo no veo ningún player en el censo de la plataforma.";
        else if (!n) text = "Ningún player está conectado a la plataforma ahora. En el censo hay " + tot + ".";
        else {
          var names = live.slice(0, 8).join(", ");
          var extra = live.length > 8 ? " y más" : "";
          text = "Hay " + n + " player" + (n === 1 ? "" : "s") + " conectado" + (n === 1 ? "" : "s") + " a la plataforma: " + names + extra + ".";
        }
        return new Response(JSON.stringify({ ok: true, text: text, source: "screens" }), {
          status: 200,
          headers: { "content-type": "application/json; charset=utf-8" },
        });
      })
      .catch(function () {
        return new Response(JSON.stringify({
          ok: false, error: "screens",
          text: "No pude leer los players conectados a la plataforma ahora mismo.",
        }), { status: 502, headers: { "content-type": "application/json; charset=utf-8" } });
      });
  }

  // Yokup espera sesión. Las preguntas de players van al censo de antena
  // (mismo que la tabla del CMS) y no se quedan mudas si el login no cuaja.
  var resolveReady; var sessionReady = new Promise(function (r) { resolveReady = r; });
  window.fetch = function (input, init) {
    var u = typeof input === "string" ? input : (input && input.url) || "";
    var isCopilot = /\/api\/copilot(?:\?|$)/.test(u) || /\/\/api\.yokup\.com\/copilot(?:\?|$)/.test(u);
    if (isCopilot) {
      if (looksLikePlayers(questionFrom(init))) return playersResponse();
      init = init || {};
      var h = new Headers(init.headers || {});
      var t = null; try { t = localStorage.getItem(SKEY); } catch (e) {}
      if (t) h.set("Authorization", "Bearer " + t);
      init.headers = h;
      return rawFetch(COPILOT, init);
    }
    if (u.indexOf(WORKER) !== 0) return rawFetch(input, init);
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
        brainUrl: COPILOT,
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
