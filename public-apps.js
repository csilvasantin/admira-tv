/* Comportamiento de las fichas públicas: vídeo y PDF.
 *
 * Las 20 tarjetas YA vienen en el HTML — las genera tools/gen-apps-grid.py desde
 * apps/home-catalog.json al preparar la publicación. Este script no pinta
 * contenido: sólo engancha lo que necesita al usuario delante.
 *
 * Antes sí lo pintaba: pedía el catálogo por fetch y exigía EXACTAMENTE 20
 * entradas o tiraba la sección entera. Eso hacía que un fallo de red —o añadir
 * la solución 21— dejara vacío el corazón de la home, y que ningún buscador
 * viera el producto porque sin JS sólo quedaba el <noscript>. Ahora, si este
 * script no llega a ejecutarse, se pierden los botones de vídeo y PDF; las 20
 * soluciones se siguen leyendo enteras.
 */
(function () {
  "use strict";
  var dialog = document.getElementById("appVideoDialog");
  var video = document.getElementById("appVideo");
  var title = document.getElementById("appVideoTitle");
  var close = document.getElementById("appVideoClose");
  var videoStatus = document.getElementById("appVideoStatus");
  var previousFocus = null;
  var videoTimer = null;

  async function probePublicMedia(url, fetcher, timeoutMs) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, timeoutMs || 8000);
    try {
      var response = await fetcher(url, { method: "HEAD", cache: "no-store", credentials: "omit", signal: controller.signal });
      var type = response.headers && response.headers.get ? response.headers.get("content-type") || "" : "";
      return !!(response.ok && (!type || /application\/pdf/i.test(type)));
    } catch (_) { return false; }
    finally { clearTimeout(timer); }
  }

  // La portada en inglés (assets/portada-idioma.js pone <html lang="en">): los avisos también.
  function enIngles() {
    var raiz = typeof document !== "undefined" && document.documentElement;
    return !!(raiz && /^en/i.test(raiz.lang || ""));
  }

  function cleanFailedVideo(player, announcer, reason) {
    var en = typeof document !== "undefined" && !!document.documentElement && /^en/i.test(document.documentElement.lang || "");
    var message = reason === "timeout"
      ? (en ? "The video is taking too long and has been stopped." : "El vídeo está tardando demasiado y se ha detenido.")
      : (en ? "The video is temporarily unavailable." : "El vídeo no está disponible temporalmente.");
    try { player.pause(); player.removeAttribute("src"); player.load(); } catch (_) {}
    player.hidden = true;
    player.setAttribute("aria-hidden", "true");
    announcer.textContent = message + (en ? " You can close this window and keep exploring." : " Puedes cerrar esta ventana y seguir explorando.");
    return message;
  }

  // El hueco de aviso de cada tarjeta; lo pone el generador junto a los botones.
  function mediaStatusOf(card) {
    return card ? card.querySelector(".app-media-status") : null;
  }

  function bindVideo(button) {
    var card = button.closest(".app-card");
    // En inglés, el título del vídeo es el nombre inglés (el que enseña ya la tarjeta).
    function name() {
      var h3 = enIngles() && card && card.querySelector("h3");
      return (h3 && h3.textContent.trim()) || (card && card.getAttribute("data-app-title")) || (enIngles() ? "Video" : "Vídeo");
    }
    function srcDe() {
      var en = button.getAttribute("data-app-video-en");
      return (enIngles() && en) ? en : button.getAttribute("data-app-video");
    }
    button.addEventListener("click", function () { openVideo(name(), srcDe(), button); });
  }

  function bindPdf(button) {
    var card = button.closest(".app-card");
    var src = button.getAttribute("data-app-pdf");
    var feedback = mediaStatusOf(card);
    button.addEventListener("click", async function () {
      button.disabled = true;
      var en = enIngles();
      button.textContent = en ? "Checking…" : "Comprobando…";
      if (feedback) feedback.textContent = en ? "Checking the PDF is available." : "Comprobando disponibilidad del PDF.";
      var available = await probePublicMedia(src, fetch, 8000);
      if (!available) {
        button.disabled = false;
        button.textContent = en ? "Retry PDF" : "Reintentar PDF";
        if (feedback) feedback.textContent = en ? "The PDF is temporarily unavailable. The page stays open." : "El PDF no está disponible temporalmente. La página permanece abierta.";
        return;
      }
      if (feedback) feedback.textContent = en ? "PDF available. Starting the download." : "PDF disponible. Iniciando descarga.";
      var download = document.createElement("a");
      download.href = src;
      download.download = "";
      document.body.appendChild(download);
      download.click();
      download.remove();
      button.disabled = false;
      button.textContent = "↓ PDF";
    });
  }

  function openVideo(name, src, trigger) {
    previousFocus = trigger || document.activeElement;
    title.textContent = name;
    video.hidden = false;
    video.removeAttribute("aria-hidden");
    videoStatus.textContent = enIngles() ? "Loading video…" : "Cargando vídeo…";
    video.src = src;
    video.load();
    clearTimeout(videoTimer);
    videoTimer = setTimeout(function () { videoTimer = null; cleanFailedVideo(video, videoStatus, "timeout"); }, 12000);
    dialog.hidden = false;
    document.body.classList.add("dialog-open");
    close.focus();
  }

  function closeVideo() {
    if (dialog.hidden) return;
    clearTimeout(videoTimer);
    videoTimer = null;
    try { video.pause(); } catch (_) {}
    video.removeAttribute("src");
    video.load();
    video.hidden = false;
    video.removeAttribute("aria-hidden");
    videoStatus.textContent = "";
    dialog.hidden = true;
    document.body.classList.remove("dialog-open");
    if (previousFocus && previousFocus.focus) previousFocus.focus();
    previousFocus = null;
  }

  function onDialogKey(event) {
    if (dialog.hidden) return;
    if (event.key === "Escape") { event.preventDefault(); closeVideo(); return; }
    if (event.key !== "Tab") return;
    var focusable = [close, video].filter(function (node) { return node && !node.disabled; });
    var index = focusable.indexOf(document.activeElement);
    if (event.shiftKey && index <= 0) { event.preventDefault(); focusable[focusable.length - 1].focus(); }
    if (!event.shiftKey && index === focusable.length - 1) { event.preventDefault(); focusable[0].focus(); }
  }

  close.addEventListener("click", closeVideo);
  video.addEventListener("canplay", function () { if (video.hidden) return; clearTimeout(videoTimer); videoTimer = null; videoStatus.textContent = enIngles() ? "Video ready to play." : "Vídeo listo para reproducir."; });
  video.addEventListener("error", function () { if (video.hidden) return; clearTimeout(videoTimer); videoTimer = null; cleanFailedVideo(video, videoStatus, "error"); });
  dialog.addEventListener("click", function (event) { if (event.target === dialog) closeVideo(); });
  document.addEventListener("keydown", onDialogKey, true);

  document.querySelectorAll("[data-app-video]").forEach(bindVideo);
  document.querySelectorAll("[data-app-pdf]").forEach(bindPdf);
})();

/* Filtro de los cinco pilares (digitalsignage.ai · 3-oct-2026).
 *
 * La leyenda y las 20 tarjetas ya vienen en el HTML (tools/gen-apps-grid.py) en el
 * orden de los pilares, y los botones llegan `disabled`: sin JS son una leyenda de
 * colores y se ven todas las soluciones. Aquí sólo se habilitan y se engancha el
 * filtro. Los botones son <button> nativos —Enter y Espacio ya funcionan— y el
 * estado se expone con aria-pressed; el contador (#appsStatus, role=status)
 * anuncia cuántas soluciones quedan a la vista.
 */
(function () {
  "use strict";
  var grupo = document.getElementById("pilares");
  var rejilla = document.getElementById("publicApps");
  if (!grupo || !rejilla) return;
  var botones = Array.prototype.slice.call(grupo.querySelectorAll("[data-pilar-filtro]"));
  var tarjetas = Array.prototype.slice.call(rejilla.querySelectorAll("[data-public-app-card]"));
  var estado = document.getElementById("appsStatus");
  var total = tarjetas.length;
  var actual = "todas";

  // La portada en inglés (assets/portada-idioma.js pone <html lang="en">): el recuento también.
  function enIngles() {
    var raiz = document.documentElement;
    return !!(raiz && /^en/i.test(raiz.lang || ""));
  }

  function nombreDe(boton) {
    var nodo = boton && boton.querySelector(".pilar-btn-nombre");
    return nodo ? nodo.textContent.trim() : "";
  }

  function aplica(pilar) {
    var todas = !pilar || pilar === "todas";
    var visibles = 0;
    tarjetas.forEach(function (tarjeta) {
      var ver = todas || tarjeta.getAttribute("data-pilar") === pilar;
      tarjeta.hidden = !ver;
      if (ver) visibles += 1;
    });
    var activo = null;
    botones.forEach(function (boton) {
      var on = boton.getAttribute("data-pilar-filtro") === (todas ? "todas" : pilar);
      boton.setAttribute("aria-pressed", on ? "true" : "false");
      if (on) activo = boton;
    });
    actual = todas ? "todas" : pilar;
    if (estado) {
      var en = enIngles();
      estado.textContent = todas
        ? (en ? total + " solutions" : total + " soluciones · " + total + " solutions")
        : (en ? nombreDe(activo) + " · " + visibles + " of " + total + " solutions"
          : nombreDe(activo) + " · " + visibles + " de " + total + " soluciones · " + visibles + " of " + total + " solutions");
    }
  }

  botones.forEach(function (boton) {
    boton.disabled = false;
    boton.addEventListener("click", function () {
      var pilar = boton.getAttribute("data-pilar-filtro");
      // Volver a pulsar el pilar activo lo suelta: vuelven las 20.
      if (pilar !== "todas" && boton.getAttribute("aria-pressed") === "true") pilar = "todas";
      aplica(pilar);
    });
  });
  grupo.classList.add("pilares-listo");
  // Al cambiar de idioma (y si la portada ya abre en inglés) el recuento se vuelve a decir.
  if (typeof document.addEventListener === "function") document.addEventListener("admira:languagechange", function () { aplica(actual); });
  if (enIngles()) aplica(actual);
})();

/* #solucion-<slug> abre esa tarjeta y, si tiene vídeo real, el diálogo.
 * El ancla ya hace scroll sin JS (:target). Aquí, si un filtro la escondía,
 * se vuelven a enseñar las 20 y se arranca el vídeo. */
(function () {
  "use strict";
  function abrir() {
    var hash = "";
    try { hash = location.hash || ""; } catch (_) { return; }
    var m = /^#solucion-([a-z0-9-]+)$/.exec(hash);
    if (!m) return;
    var card = document.querySelector('[data-public-app-card="' + m[1] + '"]');
    if (!card || card.id !== "solucion-" + m[1]) return;
    if (card.hidden) {
      var todas = document.querySelector('[data-pilar-filtro="todas"]');
      if (todas && !todas.disabled) todas.click();
    }
    var reduce = false;
    try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (_) {}
    try { card.scrollIntoView({block: "center", behavior: reduce ? "auto" : "smooth"}); } catch (_) {}
    var video = card.querySelector("[data-app-video]");
    if (video) video.click();
  }
  window.addEventListener("hashchange", abrir);
  abrir();
})();
