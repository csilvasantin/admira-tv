(function () {
  "use strict";
  var CATALOG = "/apps/public-catalog.json";
  var grid = document.getElementById("publicApps");
  var status = document.getElementById("appsStatus");
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

  function safeMediaUrl(value, slug, kind) {
    var ext = kind === "video" ? "mp4" : "pdf";
    var expected = "/apps/" + kind + "/" + slug + "." + ext;
    return value === expected ? value : "";
  }

  function mediaButton(label, className) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "app-action " + className;
    button.textContent = label;
    return button;
  }

  function renderCard(app) {
    var article = document.createElement("article");
    article.className = "app-card";
    article.dataset.publicAppCard = app.slug;

    var head = document.createElement("div");
    head.className = "app-card-head";
    var icon = document.createElement("span");
    icon.className = "app-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = app.icon;
    var state = document.createElement("span");
    state.className = "app-state";
    state.textContent = app.status === "available" ? "Disponible · Available" : "Próximamente · Coming soon";
    head.append(icon, state);

    var heading = document.createElement("h3");
    heading.textContent = app.name_es;
    var englishName = document.createElement("p");
    englishName.className = "app-name-en";
    englishName.lang = "en";
    englishName.textContent = app.name_en;
    var spanish = document.createElement("p");
    spanish.className = "app-description";
    spanish.textContent = app.description_es;
    var english = document.createElement("p");
    english.className = "app-description app-description-en";
    english.lang = "en";
    english.textContent = app.description_en;

    var actions = document.createElement("div");
    actions.className = "app-actions";
    var feedback = document.createElement("span");
    feedback.className = "app-media-status";
    feedback.setAttribute("role", "status");
    feedback.setAttribute("aria-live", "polite");
    var videoUrl = safeMediaUrl(app.video, app.slug, "video");
    var pdfUrl = safeMediaUrl(app.pdf, app.slug, "pdf");
    if (videoUrl) {
      var play = mediaButton("▶ Vídeo", "app-video");
      play.setAttribute("aria-label", "Ver vídeo de " + app.name_es);
      play.addEventListener("click", function () { openVideo(app, videoUrl, play); });
      actions.appendChild(play);
    }
    if (pdfUrl) {
      var pdf = mediaButton("↓ PDF", "app-pdf");
      pdf.setAttribute("aria-label", "Descargar PDF de " + app.name_es);
      pdf.addEventListener("click", async function () {
        pdf.disabled = true;
        pdf.textContent = "Comprobando…";
        feedback.textContent = "Comprobando disponibilidad del PDF.";
        var available = await probePublicMedia(pdfUrl, fetch, 8000);
        if (!available) {
          pdf.disabled = false;
          pdf.textContent = "Reintentar PDF";
          feedback.textContent = "El PDF no está disponible temporalmente. La página permanece abierta.";
          return;
        }
        feedback.textContent = "PDF disponible. Iniciando descarga.";
        var download = document.createElement("a");
        download.href = pdfUrl;
        download.download = "";
        document.body.appendChild(download);
        download.click();
        download.remove();
        pdf.disabled = false;
        pdf.textContent = "↓ PDF";
      });
      actions.appendChild(pdf);
    }
    if (!videoUrl && !pdfUrl) {
      var noMedia = document.createElement("span");
      noMedia.className = "app-no-media";
      noMedia.textContent = "Ficha pública disponible próximamente";
      actions.appendChild(noMedia);
    }
    actions.appendChild(feedback);
    article.append(head, heading, englishName, spanish, english, actions);
    return article;
  }

  function openVideo(app, src, trigger) {
    previousFocus = trigger || document.activeElement;
    title.textContent = app.name_es + " · " + app.name_en;
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

  fetch(CATALOG, { cache: "force-cache", credentials: "omit" })
    .then(function (response) { if (!response.ok) throw new Error("catalog"); return response.json(); })
    .then(function (apps) {
      if (!Array.isArray(apps) || apps.length !== 20) throw new Error("catalog-contract");
      var fragment = document.createDocumentFragment();
      apps.forEach(function (app) { fragment.appendChild(renderCard(app)); });
      grid.replaceChildren(fragment);
      grid.setAttribute("aria-busy", "false");
      status.textContent = "20 soluciones · 20 solutions";
    })
    .catch(function () {
      status.textContent = "El catálogo no está disponible temporalmente.";
      grid.setAttribute("aria-busy", "false");
      grid.innerHTML = '<p class="apps-error" role="status">Vuelve a intentarlo en unos minutos.</p>';
    });
})();
