/*
 * auth-gate.js — perímetro de seguridad (soft gate) para admira.tv
 *
 * Prehome CRT / fósforo (estética sci-fi 80s/90s, coherente con el canal:
 * cian #7db8ff + verde fósforo #39d353 sobre #05080c, scanlines).
 * Login con Google (Google Identity Services). Solo entran los emails que la app
 * "Acceso" (ACL v2) reconoce como AUTORIZADOS para admira.tv.
 *
 * ⚠️ Es un bloqueo BLANDO: oculta la UI hasta validar, pero el contenido sigue en el
 *    código fuente (sitio estático público). Disuade, no es seguridad fuerte. La
 *    seguridad fuerte vive server-side (functions/, que ya tienen su auth).
 *
 * FUENTE DE VERDAD: GET /users/api/access?project=<id> con Google ID token.
 * El servidor resuelve el permiso directo o heredado dentro del árbol Admira.tv;
 * el navegador nunca descarga el directorio de usuarios para decidir un acceso.
 *
 * Las entradas nuevas usan redirección top-level y una sesión HttpOnly first-party.
 * Durante la migración se siguen aceptando las sesiones antiguas guardadas en
 * localStorage para no expulsar a quien ya está trabajando en la web pública.
 *
 * EXENTOS (no llevan este script): canal.html y el runtime del player (emisión DOOH
 *   siempre libre — si se gatea, la flota se queda en negro), snapshots v.2026.*,
 *   offline/404, service worker y assets.
 *
 * Instalación: en el <head> de cada página humana a proteger, lo más arriba posible:
 *   <script src="/auth-gate.js"></script>
 * Gestión de acceso: en caliente desde admira.tv/users/.
 */
(function () {
  // ===== CONFIG =====
  var CLIENT_ID = "861856772040-e1ri6kpu6maagtb6crdfbb923hsaalgb.apps.googleusercontent.com";
  var LOGIN_URI = "https://admira.tv/auth/callback";

  var ACL_API = "/users/api/access";
  var PATH_PROJECTS = {
    "cms.html":"digitalsignage-cms", "cms":"digitalsignage-cms", "parrilla":"digitalsignage-parrilla",
    "players":"digitalsignage-player", "players.html":"digitalsignage-player",
    "playlists":"digitalsignage-playlists", "player":"digitalsignage-player",
    "remotecontrol":"digitalsignage-remotecontrol", "mando.html":"digitalsignage-remotecontrol",
    "wall":"digitalsignage-wall", "alta.html":"digitalsignage-alta",
    "condicional.html":"digitalsignage-conditional", "signage.html":"digitalsignage-signage",
    "cap-avanzado.html":"digitalsignage-cms", "cap-experto.html":"digitalsignage-cms",
    "cap-folded.html":"digitalsignage-cms",
    "users":"admira-tv", "usuarios":"admira-tv",
    "accesscontrol":"admira-tv"
  };
  var pathKey = (location.pathname.split('/').filter(Boolean)[0] || 'admira-tv').toLowerCase();
  var SOLUTION = PATH_PROJECTS[pathKey] || pathKey;
  var MANAGEMENT_PAGE = ["users", "usuarios", "accesscontrol"].indexOf(pathKey) >= 0;

  var REMEMBER_HOURS = 12;       // recordar una sesión validada
  var CONNECT_SECONDS = 1.4;     // duración de la "conexión" antes de mostrar el login
  var SCANLINES = true;          // overlay CRT

  function norm(e) { return String(e).toLowerCase().trim(); }

  // Contrato mínimo para páginas que necesitan autenticar escrituras reales en
  // un backend. El gate sigue siendo visual, pero nunca obliga a cada pantalla a
  // conocer la forma interna de localStorage ni a duplicar el manejo de sesión.
  function storedCredential() {
    try {
      var session = JSON.parse(localStorage.getItem("admira_tv_gate") || "null");
      if (!session || !session.cred) return "";
      return String(session.cred);
    } catch (e) { return ""; }
  }
  function clearStoredSession() {
    try { localStorage.removeItem("admira_tv_gate"); } catch (e) {}
  }
  window.AdmiraTvAuth = {
    credential: storedCredential,
    authorization: function () {
      var cred = storedCredential();
      return cred ? "Bearer " + cred : "";
    },
    clear: function () {
      clearStoredSession();
      return fetch("/auth/logout", { method: "POST", credentials: "same-origin" }).catch(function () {});
    }
  };

  function serverAccess(credential) {
    var endpoint = credential
      ? ACL_API + "?project=" + encodeURIComponent(SOLUTION) + (MANAGEMENT_PAGE ? "&manage=1" : "")
      : "/auth/session?project=" + encodeURIComponent(SOLUTION) + (MANAGEMENT_PAGE ? "&manage=1" : "");
    var options = {
      cache: "no-store", credentials: "same-origin",
      headers: {}
    };
    if (credential) options.headers.Authorization = "Bearer " + credential;
    return fetch(endpoint, options).then(function (r) {
      if (r.status === 401 || r.status === 403) return { estado: "denegado" };
      if (!r.ok) return { estado: "indisponible", detalle: "HTTP " + r.status };
      return r.json().then(function (d) {
        return { estado: (d && d.allowed) ? "permitido" : "denegado", role: d && d.role };
      }).catch(function () { return { estado: "indisponible", detalle: "respuesta ilegible" }; });
    }).catch(function () { return { estado: "indisponible", detalle: "sin conexión" }; });
  }

  var firstPartySessionAllowed = false;
  serverAccess("").then(function (res) {
    if (res && res.estado === "permitido") {
      firstPartySessionAllowed = true;
      unlock();
    }
  }).catch(function () {});

  // Si ya hay una validación reciente y vigente, no molestar — pero revalida en
  // segundo plano: si al usuario lo han dado de baja en el ACL, se le caduca la
  // sesión local y el siguiente acceso le pedirá login (y será rechazado).
  try {
    var saved = JSON.parse(localStorage.getItem("admira_tv_gate") || "null");
    if (saved && saved.email && saved.cred && Date.now() < saved.exp) {
      // La sesión recordada nunca basta por sí sola: el servidor vuelve a resolver
      // el permiso exacto de esta app antes de quitar el bloqueo visual.
      serverAccess(saved.cred).then(function (res) {
        if (res.estado === "permitido") return unlock();
        // Denegado de verdad: la sesión guardada ya no vale y se tira.
        if (res.estado === "denegado") { try { localStorage.removeItem("admira_tv_gate"); } catch (e) {} return; }
        // Indisponible NO es denegado: no se tira la sesión —el usuario no ha
        // hecho nada mal— pero tampoco se abre la puerta sin haber comprobado.
        // Se dirá al entrar al login, con su motivo.
        pendienteRevalidar = res.detalle || "no se pudo comprobar";
      });
    }
  } catch (e) {}

  // ===== estado =====
  var phase = "connecting"; // connecting | ready | auth | welcome | error
  var gisReady = false;
  var authChallenge = null;
  var pendienteRevalidar = ""; // motivo cuando NO se pudo comprobar el permiso
  var startTime = 0;

  // Ocultar la página de inmediato (antes de que se pinte el contenido).
  document.documentElement.classList.add("gate-locked");
  injectStyle();
  loadFonts();

  function ready(fn) { if (document.body) fn(); else document.addEventListener("DOMContentLoaded", fn); }

  // ===== estilos (todo scoped bajo #admira-tv-gate) =====
  function injectStyle() {
    var css = [
      "html.gate-locked body{visibility:hidden!important}",
      "#admira-tv-gate{position:fixed;inset:0;z-index:2147483647;visibility:visible;",
      "background:radial-gradient(circle at 50% 42%,#0a1018,#04070c 70%);",
      "font-family:ui-monospace,'JetBrains Mono',SFMono-Regular,Menlo,monospace;",
      "display:flex;align-items:center;justify-content:center;padding:24px;color:#39d353}",
      "#admira-tv-gate *{box-sizing:border-box}",
      "@keyframes atv-blink{0%,55%{opacity:1}56%,100%{opacity:.28}}",
      "@keyframes atv-flick{0%,100%{opacity:.05}45%{opacity:.02}70%{opacity:.07}}",
      "@keyframes atv-rise{0%{transform:translateY(10px);opacity:0}100%{transform:translateY(0);opacity:1}}",
      "@keyframes atv-scan{0%{transform:translateY(-100%)}100%{transform:translateY(100%)}}",
      "@keyframes atv-spin{to{transform:rotate(360deg)}}",
      "#admira-tv-gate .frame{position:relative;width:min(92vw,760px);border-radius:18px;overflow:hidden;",
      "background:linear-gradient(160deg,#080d14,#05080c);padding:min(8vw,52px) min(7vw,48px);",
      "box-shadow:0 0 0 1px rgba(125,184,255,.18),0 0 0 8px #0a0f16,0 0 0 10px #04070a,",
      "0 30px 90px rgba(0,0,0,.7),0 0 90px rgba(57,211,83,.07)}",
      "#admira-tv-gate .ov{position:absolute;inset:0;pointer-events:none}",
      "#admira-tv-gate .ov-scan{background:repeating-linear-gradient(0deg,rgba(0,0,0,.28) 0 2px,transparent 2px 4px)}",
      "#admira-tv-gate .ov-flick{background:#7db8ff;mix-blend-mode:overlay;animation:atv-flick .16s steps(2) infinite}",
      "#admira-tv-gate .ov-vig{background:radial-gradient(circle at 50% 44%,transparent 42%,rgba(4,7,12,.72))}",
      "#admira-tv-gate .ov-beam{position:absolute;left:0;right:0;height:34%;top:0;",
      "background:linear-gradient(180deg,transparent,rgba(125,184,255,.05),transparent);animation:atv-scan 5.5s linear infinite}",
      "#admira-tv-gate .content{position:relative;z-index:3;display:flex;flex-direction:column;align-items:center;",
      "gap:22px;text-align:center}",
      "#admira-tv-gate .kicker{font-size:clamp(9px,1.5vw,11px);letter-spacing:.42em;color:#7db8ff;",
      "text-transform:uppercase;opacity:.8}",
      "#admira-tv-gate h1.title{font-size:clamp(30px,7vw,58px);line-height:.95;font-weight:800;letter-spacing:.04em;margin:0;",
      "color:#eafff0;text-shadow:0 0 14px rgba(57,211,83,.45),0 0 40px rgba(57,211,83,.18)}",
      "#admira-tv-gate h1.title .dot{color:#ff4444;text-shadow:0 0 14px rgba(255,68,68,.6)}",
      "#admira-tv-gate h1.title .tv{color:#39d353}",
      "#admira-tv-gate .sub{font-size:clamp(11px,1.8vw,14px);letter-spacing:.34em;color:#7db8ff;text-transform:uppercase;opacity:.9}",
      "#admira-tv-gate .rule{width:min(80%,360px);height:1px;background:linear-gradient(90deg,transparent,rgba(125,184,255,.45),transparent)}",
      "#admira-tv-gate .foot{display:flex;flex-direction:column;align-items:center;gap:18px;width:100%;min-height:118px;justify-content:center}",
      "#admira-tv-gate .status{font-size:clamp(12px,1.9vw,15px);letter-spacing:.28em;color:#39d353;",
      "text-transform:uppercase;animation:atv-blink 1.1s steps(1) infinite;min-height:18px}",
      "#admira-tv-gate .track{position:relative;width:min(78%,440px);height:12px;border-radius:6px;background:#0a1119;",
      "box-shadow:inset 0 0 0 1px rgba(125,184,255,.25);overflow:hidden}",
      "#admira-tv-gate .fill{position:absolute;left:0;top:0;bottom:0;width:0;border-radius:6px;",
      "background:linear-gradient(90deg,#1f8f3a,#39d353);box-shadow:0 0 12px rgba(57,211,83,.6);transition:width .12s linear}",
      "#admira-tv-gate .pct{font-size:clamp(10px,1.5vw,12px);letter-spacing:.2em;color:#7db8ff}",
      "#admira-tv-gate .ready{display:flex;flex-direction:column;align-items:center;gap:16px;animation:atv-rise .34s ease both}",
      "#admira-tv-gate .gwrap{position:relative;display:inline-flex}",
      "#admira-tv-gate .gbtn{display:flex;align-items:center;gap:14px;cursor:pointer;",
      "font-family:inherit;font-size:clamp(12px,1.8vw,15px);font-weight:700;letter-spacing:.16em;text-transform:uppercase;",
      "color:#eafff0;padding:16px 30px;border:none;border-radius:12px;",
      "background:linear-gradient(180deg,#0c1622,#070d15);",
      "box-shadow:inset 0 0 0 1px rgba(57,211,83,.4),0 0 0 1px rgba(4,7,12,.6),0 8px 26px rgba(0,0,0,.5),0 0 22px rgba(57,211,83,.14);",
      "transition:transform .08s,box-shadow .12s}",
      "#admira-tv-gate .gbtn:hover{box-shadow:inset 0 0 0 1px rgba(57,211,83,.75),0 8px 26px rgba(0,0,0,.5),0 0 30px rgba(57,211,83,.3);transform:translateY(-1px)}",
      "#admira-tv-gate .gbtn:active{transform:translateY(1px)}",
      "#admira-tv-gate .gg{font-weight:800;font-size:1.35em;",
      "background:linear-gradient(135deg,#4285F4 0%,#EA4335 38%,#FBBC05 66%,#34A853 100%);",
      "-webkit-background-clip:text;background-clip:text;color:transparent}",
      // Botón oficial de Google visible: el click navega en primer nivel y no abre un popup.
      "#admira-tv-gate .greal{position:static;display:flex;align-items:center;justify-content:center;",
      "opacity:1;z-index:2;overflow:visible}",
      "#admira-tv-gate .greal>div{transform:none}",
      "#admira-tv-gate .prompt{font-size:clamp(11px,1.6vw,13px);letter-spacing:.24em;color:#7db8ff;text-transform:uppercase;",
      "animation:atv-blink 1.2s steps(1) infinite}",
      "#admira-tv-gate .hint{font-size:clamp(9px,1.3vw,11px);letter-spacing:.14em;color:#4d6b57;text-transform:uppercase}",
      "#admira-tv-gate .err{font-size:clamp(11px,1.6vw,13px);letter-spacing:.12em;color:#ff5b45;min-height:16px;text-transform:uppercase}",
      "#admira-tv-gate .spinner{width:26px;height:26px;border-radius:50%;border:3px solid rgba(125,184,255,.2);",
      "border-top-color:#39d353;animation:atv-spin .8s linear infinite}",
      "#admira-tv-gate .granted{font-size:clamp(14px,2.2vw,20px);font-weight:800;letter-spacing:.16em;color:#39d353;",
      "text-transform:uppercase;text-shadow:0 0 14px rgba(57,211,83,.5)}",
      "#admira-tv-gate .granted-sub{font-size:clamp(11px,1.6vw,13px);letter-spacing:.24em;color:#7db8ff;text-transform:uppercase}"
    ].join("");
    var style = document.createElement("style");
    style.id = "admira-tv-gate-style";
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  function loadFonts() { /* usa el stack monoespaciado del sistema; sin dependencias externas */ }

  // ===== montaje del prehome =====
  function mount() {
    if (firstPartySessionAllowed) return unlock();
    var g = document.createElement("div");
    g.id = "admira-tv-gate";
    g.innerHTML =
      '<div class="frame">' +
        '<div class="content">' +
          '<div class="kicker">ADMIRA.TV &middot; Per&iacute;metro de seguridad</div>' +
          '<h1 class="title">ADMIRA<span class="dot">.</span><span class="tv">TV</span></h1>' +
          '<div class="sub">Canal de emisi&oacute;n DOOH</div>' +
          '<div class="rule"></div>' +
          '<div class="foot" id="atv-foot"></div>' +
        '</div>' +
        (SCANLINES ? '<div class="ov ov-scan"></div><div class="ov ov-flick"></div><div class="ov-beam"></div>' : '') +
        '<div class="ov ov-vig"></div>' +
      '</div>';
    document.body.appendChild(g);
    startTime = Date.now();
    renderFoot();
    tickProgress();
    programaEntrada();
  }

  // ===== fases =====
  function foot() { return document.getElementById("atv-foot"); }


  // El avance de fase va por RELOJ, no por fotogramas: requestAnimationFrame se
  // pausa en pestañas de fondo y con él se quedaba bloqueada la única vía hacia
  // el login. Y hay TOPE: si Google no ha cargado en GIS_TIMEOUT_MS, la verja lo
  // dice y ofrece reintentar en lugar de mostrar un porcentaje para siempre.
  var GIS_TIMEOUT_MS = 8000;
  var entradaHecha = false;
  function entraEnLogin() {
    if (entradaHecha || phase !== "connecting") return;
    entradaHecha = true;
    phase = "ready";
    renderFoot();
    var el = document.getElementById("atv-err");
    if (el) {
      var motivo = !gisReady ? "Google tarda en responder."
        : pendienteRevalidar ? "No se ha podido comprobar tu permiso (" + pendienteRevalidar + ")." : "";
      if (motivo) {
        el.textContent = "✖ " + motivo;
        var r = document.getElementById("atv-retry"); if (r) r.hidden = false;
      }
    }
  }
  function programaEntrada() {
    var minimo = CONNECT_SECONDS * 1000;
    // En cuanto Google esté listo se entra; si no, se entra igual al llegar al tope.
    var t0 = Date.now();
    (function espera() {
      var t = Date.now() - t0;
      if (gisReady && t >= minimo) return entraEnLogin();
      if (t >= GIS_TIMEOUT_MS) return entraEnLogin();
      setTimeout(espera, 120);
    })();
  }

  function tickProgress() {
    if (phase !== "connecting") return;
    var t = Date.now() - startTime;
    var p = Math.min(100, (t / (CONNECT_SECONDS * 1000)) * 100);
    var dots = new Array((Math.floor(t / 340) % 4) + 1).join(".");
    var st = foot();
    if (st) {
      var s = st.querySelector(".status"); var f = st.querySelector(".fill"); var pc = st.querySelector(".pct");
      if (s) s.textContent = "Estableciendo enlace" + dots;
      if (f) f.style.width = p + "%";
      if (pc) pc.textContent = ("00" + Math.floor(p)).slice(-3) + "%";
    }
    if (phase !== "connecting") return;
    requestAnimationFrame(tickProgress);
  }

  function renderFoot() {
    var f = foot(); if (!f) return;
    if (phase === "connecting") {
      f.innerHTML =
        '<div class="status">Estableciendo enlace</div>' +
        '<div class="track"><div class="fill"></div></div>' +
        '<div class="pct">000%</div>';
    } else if (phase === "ready") {
      f.innerHTML =
        '<div class="ready">' +
          '<div class="gwrap">' +
            '<div class="greal" id="atv-gbtn"></div>' +
          '</div>' +
          '<div class="prompt">&#9654; Identif&iacute;cate para continuar</div>' +
          '<div class="err" id="atv-err"></div>' +
          '<button class="gbtn" type="button" id="atv-retry" hidden><span>Reintentar</span></button>' +
        '</div>';
      renderGoogleButton();
      var retry = document.getElementById("atv-retry");
      if (retry) retry.addEventListener("click", function () { location.reload(); });
    } else if (phase === "auth") {
      f.innerHTML = '<div class="ready"><div class="spinner"></div><div class="status" id="atv-status">Verificando credenciales</div></div>';
    } else if (phase === "welcome") {
      f.innerHTML = '<div class="ready"><div class="granted">&#9654; Acceso concedido</div><div class="granted-sub">Bienvenido a la emisi&oacute;n</div></div>';
    }
  }

  function renderGoogleButton() {
    var el = document.getElementById("atv-gbtn");
    if (!el || !authChallenge || !window.google || !google.accounts || !google.accounts.id) return;
    try {
      google.accounts.id.renderButton(el, { theme: "filled_black", size: "large", text: "signin_with", shape: "pill", width: 240, state: authChallenge.state });
    } catch (e) {}
  }

  // ===== validación =====
  function onCredential(resp) {
    phase = "auth"; renderFoot();
    var anim = animateDots();
    var email = "";
    try {
      var payload = JSON.parse(
        decodeURIComponent(
          atob(resp.credential.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))
            .split("").map(function (c) { return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2); }).join("")
        )
      );
      if (!payload.email_verified) throw new Error("email no verificado");
      email = norm(payload.email || "");
    } catch (e) {
      clearInterval(anim); failBack("No se pudo validar la cuenta"); return;
    }
    function accept() {
      try { localStorage.setItem("admira_tv_gate", JSON.stringify({ email: email, exp: Date.now() + REMEMBER_HOURS * 3600 * 1000, cred: resp.credential, credAt: Date.now() })); } catch (e) {}
      clearInterval(anim);
      phase = "welcome"; renderFoot();
      setTimeout(unlock, 800);
    }
    function reject() {
      clearInterval(anim);
      try { google.accounts.id.disableAutoSelect(); } catch (e) {}
      failBack("Cuenta no autorizada: " + email);
    }
    serverAccess(resp.credential).then(function (res) {
      if (res.estado === "permitido") return accept();
      if (res.estado === "denegado") return reject();
      // Ni sí ni no: no se ha podido preguntar. Decirlo tal cual, porque tratar
      // esto como «no autorizado» manda a la gente a pedir permisos que ya tiene.
      clearInterval(anim);
      failBack("No se ha podido comprobar tu permiso (" + (res.detalle || "error") + "). Reintenta.");
    });
  }

  function animateDots() {
    var n = 0;
    return setInterval(function () {
      n = (n + 1) % 4;
      var s = document.getElementById("atv-status");
      if (s) s.textContent = "Verificando credenciales" + new Array(n + 1).join(".");
    }, 340);
  }

  function failBack(msg) {
    phase = "ready"; renderFoot();
    var el = document.getElementById("atv-err");
    if (el) el.textContent = "✖ " + msg;
  }

  function unlock() {
    document.documentElement.classList.remove("gate-locked");
    var g = document.getElementById("admira-tv-gate");
    if (g) g.remove();
    var st = document.getElementById("admira-tv-gate-style");
    if (st) st.remove();
  }

  // ===== arranque: GIS + montaje =====
  function initGis() {
    if (!window.google || !google.accounts || !google.accounts.id) return;
    var returnTo = location.pathname + location.search + location.hash;
    fetch("/auth/challenge", {
      method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flow: "redirect", return_to: returnTo })
    }).then(function (response) {
      if (!response.ok) throw new Error("challenge");
      return response.json();
    }).then(function (challenge) {
      authChallenge = challenge;
      google.accounts.id.initialize({
        client_id: CLIENT_ID,
        nonce: challenge.nonce,
        state_cookie_domain: "admira.tv",
        ux_mode: "redirect",
        login_uri: LOGIN_URI,
        auto_select: false,
        cancel_on_tap_outside: false,
        use_fedcm_for_button: false
      });
      gisReady = true;
      if (phase === "ready") renderGoogleButton();
    }).catch(function () {
      gisReady = true;
      pendienteRevalidar = "no se pudo iniciar el acceso seguro";
      if (phase === "ready") renderFoot();
    });
  }

  ready(mount);

  var s = document.createElement("script");
  s.src = "https://accounts.google.com/gsi/client";
  s.async = true; s.defer = true;
  s.onload = function () { ready(initGis); };
  s.onerror = function () {
    ready(function () {
      gisReady = true;
      if (phase === "connecting") { phase = "ready"; renderFoot(); }
      var el = document.getElementById("atv-err");
      if (el) el.textContent = "✖ No se pudo cargar Google. Recarga la página.";
    });
  };
  (document.head || document.documentElement).appendChild(s);
})();
