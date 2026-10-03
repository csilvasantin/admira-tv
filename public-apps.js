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

  function cleanFailedVideo(player, announcer, reason) {
    var message = reason === "timeout" ? "El vídeo está tardando demasiado y se ha detenido." : "El vídeo no está disponible temporalmente.";
    try { player.pause(); player.removeAttribute("src"); player.load(); } catch (_) {}
    player.hidden = true;
    player.setAttribute("aria-hidden", "true");
    announcer.textContent = message + " Puedes cerrar esta ventana y seguir explorando.";
    return message;
  }

  // El hueco de aviso de cada tarjeta; lo pone el generador junto a los botones.
  function mediaStatusOf(card) {
    return card ? card.querySelector(".app-media-status") : null;
  }

  function bindVideo(button) {
    var card = button.closest(".app-card");
    var src = button.getAttribute("data-app-video");
    var name = (card && card.getAttribute("data-app-title")) || "Vídeo";
    button.addEventListener("click", function () { openVideo(name, src, button); });
  }

  function bindPdf(button) {
    var card = button.closest(".app-card");
    var src = button.getAttribute("data-app-pdf");
    var feedback = mediaStatusOf(card);
    button.addEventListener("click", async function () {
      button.disabled = true;
      button.textContent = "Comprobando…";
      if (feedback) feedback.textContent = "Comprobando disponibilidad del PDF.";
      var available = await probePublicMedia(src, fetch, 8000);
      if (!available) {
        button.disabled = false;
        button.textContent = "Reintentar PDF";
        if (feedback) feedback.textContent = "El PDF no está disponible temporalmente. La página permanece abierta.";
        return;
      }
      if (feedback) feedback.textContent = "PDF disponible. Iniciando descarga.";
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
    videoStatus.textContent = "Cargando vídeo…";
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
  video.addEventListener("canplay", function () { if (video.hidden) return; clearTimeout(videoTimer); videoTimer = null; videoStatus.textContent = "Vídeo listo para reproducir."; });
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
    if (estado) {
      estado.textContent = todas
        ? total + " soluciones · " + total + " solutions"
        : nombreDe(activo) + " · " + visibles + " de " + total + " soluciones · " + visibles + " of " + total + " solutions";
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
})();
