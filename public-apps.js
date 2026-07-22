(function () {
  "use strict";
  var CATALOG = "/apps/public-catalog.json";
  var grid = document.getElementById("publicApps");
  var status = document.getElementById("appsStatus");
  var dialog = document.getElementById("appVideoDialog");
  var video = document.getElementById("appVideo");
  var title = document.getElementById("appVideoTitle");
  var close = document.getElementById("appVideoClose");
  var previousFocus = null;

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
    var videoUrl = safeMediaUrl(app.video, app.slug, "video");
    var pdfUrl = safeMediaUrl(app.pdf, app.slug, "pdf");
    if (videoUrl) {
      var play = mediaButton("▶ Vídeo", "app-video");
      play.setAttribute("aria-label", "Ver vídeo de " + app.name_es);
      play.addEventListener("click", function () { openVideo(app, videoUrl, play); });
      actions.appendChild(play);
    }
    if (pdfUrl) {
      var pdf = document.createElement("a");
      pdf.className = "app-action app-pdf";
      pdf.href = pdfUrl;
      pdf.download = "";
      pdf.textContent = "↓ PDF";
      pdf.setAttribute("aria-label", "Descargar PDF de " + app.name_es);
      actions.appendChild(pdf);
    }
    if (!videoUrl && !pdfUrl) {
      var noMedia = document.createElement("span");
      noMedia.className = "app-no-media";
      noMedia.textContent = "Ficha pública disponible próximamente";
      actions.appendChild(noMedia);
    }
    article.append(head, heading, englishName, spanish, english, actions);
    return article;
  }

  function openVideo(app, src, trigger) {
    previousFocus = trigger || document.activeElement;
    title.textContent = app.name_es + " · " + app.name_en;
    video.src = src;
    dialog.hidden = false;
    document.body.classList.add("dialog-open");
    close.focus();
  }

  function closeVideo() {
    if (dialog.hidden) return;
    try { video.pause(); } catch (_) {}
    video.removeAttribute("src");
    video.load();
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
