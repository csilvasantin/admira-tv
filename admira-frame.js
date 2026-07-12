/*
 * admira-frame.js — UX CUADRÁTICA canónica de AdmiraNeXT para admira.tv.
 *
 * Monta, sobre la BARRA SUPERIOR EXISTENTE, tres ICONOS-VENTANA cuadrados que
 * despliegan tres PANELES OVERLAY (patrón heredado de FleetControl / admira-bar.js,
 * pero con la piel propia de admira.tv):
 *   · OPCIONES → panel IZQUIERDO   · icono arriba-izquierda (solo)
 *   · AVANZADO → panel DERECHO     · icono arriba-derecha (interior)
 *   · EXPERTO  → panel INFERIOR    · icono arriba-derecha (extremo)
 *
 * API por slots: mueve (no clona) los nodos [data-af-slot="left|right|bottom"] al
 * cuerpo del panel correspondiente. Panel sin contenido → «— sin opciones en esta vista».
 * Iconos vía data-af-icon="<clave>" se rellenan con window.AdmiraIcon si está disponible.
 *
 * Overlay (position:fixed, translate ±103%): NO empujan el contenido. Plegados por
 * defecto; estado en localStorage (af_left/af_right/af_bottom); cierre por toggle,
 * botón ✕, clic en el velo o Escape. Breakpoint móvil sólo ≤520px (en la hoja CSS).
 *
 * Reutilizable: script clásico, autónomo. Se puede llevar a más páginas de admira.tv.
 * La barra objetivo se localiza por [data-af-bar] o, por defecto, .admtop (admira-nav).
 */
(function () {
  if (window.__admframe) return;
  window.__admframe = true;

  // Definición de los tres lados. El SVG dibuja un marco (af-fr) + una franja de panel
  // (af-pn) en el borde correspondiente → el icono «dice» dónde se abre el panel.
  var SIDES = [
    { key: "left", ls: "af_left", title: "Opciones", cls: "af-left-open", edge: "left",
      icoCls: "af-ico-left", label: "Opciones · panel izquierdo",
      svg: '<rect class="af-fr" x="1" y="1" width="14" height="12" rx="1.5"/><rect class="af-pn" x="1.6" y="1.6" width="4.4" height="10.8" rx="1"/>' },
    { key: "right", ls: "af_right", title: "Avanzado", cls: "af-right-open", edge: "right",
      icoCls: "af-ico-right", label: "Avanzado · panel derecho",
      svg: '<rect class="af-fr" x="1" y="1" width="14" height="12" rx="1.5"/><rect class="af-pn" x="10" y="1.6" width="4.4" height="10.8" rx="1"/>' },
    { key: "bottom", ls: "af_bottom", title: "Experto", cls: "af-bottom-open", edge: "right",
      icoCls: "af-ico-right", label: "Experto · panel inferior",
      svg: '<rect class="af-fr" x="1" y="1" width="14" height="12" rx="1.5"/><rect class="af-pn" x="1.6" y="8.4" width="12.8" height="4" rx="1"/>' }
  ];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[<>&"]/g, function (c) {
      return { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c];
    });
  }

  // Localiza la barra superior. Espera a que exista (admira-nav la monta al ejecutarse
  // su script defer; admira-frame va después). Reintenta unos frames por robustez.
  function waitForBar(cb) {
    var tries = 0;
    (function look() {
      var bar = document.querySelector("[data-af-bar]") || document.querySelector(".admtop");
      if (bar) return cb(bar);
      if (tries++ > 240) return; // ~4 s a 60fps; si no hay barra, no montamos
      requestAnimationFrame(look);
    })();
  }

  // Construye el raíl de OPCIONES (navegación) desde window.AdmiraNav (fuente única de
  // admira-nav). Se usa cuando la página no trae su propio [data-af-slot="left"].
  function defaultNav() {
    var nav = document.createElement("nav");
    nav.className = "af-nav";
    nav.setAttribute("aria-label", "Opciones de navegación");
    var N = window.AdmiraNav;
    var icon = (typeof window.AdmiraIcon === "function") ? window.AdmiraIcon : function () { return ""; };
    if (!N || !N.items || !N.items.length) {
      var e = document.createElement("div");
      e.className = "af-empty";
      e.textContent = "— sin opciones en esta vista";
      nav.appendChild(e);
      return nav;
    }
    function link(it) {
      var a = document.createElement("a");
      a.href = it.h;
      if (it.blank) { a.target = "_blank"; a.rel = "noopener"; }
      if (it.k && it.k === N.active) { a.className = "on"; a.setAttribute("aria-current", "page"); }
      a.innerHTML = '<span class="af-ic">' + (icon(it.k || it.ic) || "") + "</span><span>" + esc(it.t) + "</span>";
      return a;
    }
    N.items.forEach(function (it) { nav.appendChild(link(it)); });
    if (N.control) {
      var sep = document.createElement("div");
      sep.className = "af-sep";
      nav.appendChild(sep);
      nav.appendChild(link(N.control));
    }
    return nav;
  }

  function build(bar) {
    var body = document.body;
    document.documentElement.classList.add("af-on");

    // Velo compartido (clic = cerrar todo).
    var scrim = document.createElement("div");
    scrim.className = "af-scrim";
    scrim.setAttribute("aria-hidden", "true");
    body.appendChild(scrim);

    // Construye los tres paneles + sus iconos.
    SIDES.forEach(function (side) {
      // Panel
      var panel = document.createElement("aside");
      panel.className = "af-panel af-" + side.key;
      panel.id = "af-panel-" + side.key;
      panel.setAttribute("aria-label", side.title);
      panel.setAttribute("role", "region");

      var hd = document.createElement("div");
      hd.className = "af-hd";
      hd.innerHTML = '<span class="af-ttl"><b>' + esc(side.title) + "</b></span>";
      var x = document.createElement("button");
      x.type = "button";
      x.className = "af-x";
      x.setAttribute("aria-label", "Cerrar " + side.title);
      x.innerHTML = "&#10005;"; // ✕
      hd.appendChild(x);

      var bd = document.createElement("div");
      bd.className = "af-bd";

      panel.appendChild(hd);
      panel.appendChild(bd);
      body.appendChild(panel);
      side.panel = panel;
      side.bd = bd;

      // Mueve (no clona) el contenido del slot a este panel.
      var slots = document.querySelectorAll('[data-af-slot="' + side.key + '"]');
      if (slots.length) {
        Array.prototype.forEach.call(slots, function (n) { bd.appendChild(n); });
      } else if (side.key === "left") {
        // Sin slot propio → OPCIONES recupera el RAÍL de navegación (que af-on oculta de
        // admira-nav) a partir de window.AdmiraNav. Así toda página del perímetro conserva su
        // navegación en el canon cuadrático sin duplicar el bloque en cada HTML.
        bd.appendChild(defaultNav());
      } else {
        var empty = document.createElement("div");
        empty.className = "af-empty";
        empty.textContent = "— sin opciones en esta vista";
        bd.appendChild(empty);
      }

      // Icono-ventana en la barra.
      var ico = document.createElement("button");
      ico.type = "button";
      ico.className = "af-ico " + side.icoCls;
      ico.id = "af-ico-" + side.key;
      ico.title = side.label;
      ico.setAttribute("aria-label", side.label);
      ico.setAttribute("aria-controls", panel.id);
      ico.setAttribute("aria-expanded", "false");
      ico.innerHTML = '<svg viewBox="0 0 16 14" aria-hidden="true" focusable="false">' + side.svg + "</svg>";
      side.icon = ico;

      // Colocación: OPCIONES al principio de la barra (esquina izquierda, solo).
      // AVANZADO y EXPERTO al final (derecha); el orden del array deja EXPERTO en el extremo.
      if (side.key === "left") bar.insertBefore(ico, bar.firstChild);
      else bar.appendChild(ico);

      ico.addEventListener("click", function () { setOpen(side, !isOpen(side)); });
      x.addEventListener("click", function () { setOpen(side, false); });
    });

    // Rellena iconos declarativos (data-af-icon) con el set de admira-nav si existe.
    if (typeof window.AdmiraIcon === "function") {
      Array.prototype.forEach.call(document.querySelectorAll("[data-af-icon]"), function (el) {
        if (el.__afIconDone) return;
        var svg = window.AdmiraIcon(el.getAttribute("data-af-icon"));
        if (svg) { el.innerHTML = svg; el.__afIconDone = true; }
      });
    }

    function isOpen(side) { return body.classList.contains(side.cls); }
    function anyOpen() { return SIDES.some(isOpen); }
    function setOpen(side, open) {
      body.classList.toggle(side.cls, open);
      side.icon.classList.toggle("on", open);
      side.icon.setAttribute("aria-expanded", open ? "true" : "false");
      try { localStorage.setItem(side.ls, open ? "1" : "0"); } catch (e) {}
      body.classList.toggle("af-any-open", anyOpen());
    }
    function closeAll() { SIDES.forEach(function (s) { if (isOpen(s)) setOpen(s, false); }); }

    scrim.addEventListener("click", closeAll);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && anyOpen()) { e.preventDefault(); closeAll(); }
    });

    // Restaura estado persistido (plegado por defecto: sólo abre si guardado === "1").
    SIDES.forEach(function (side) {
      var v = null;
      try { v = localStorage.getItem(side.ls); } catch (e) {}
      if (v === "1") setOpen(side, true);
    });

    // API mínima por si alguna página quiere abrir/cerrar por programa.
    window.AdmiraFrame = {
      open: function (k) { var s = byKey(k); if (s) setOpen(s, true); },
      close: function (k) { var s = byKey(k); if (s) setOpen(s, false); },
      toggle: function (k) { var s = byKey(k); if (s) setOpen(s, !isOpen(s)); },
      closeAll: closeAll
    };
    function byKey(k) { for (var i = 0; i < SIDES.length; i++) if (SIDES[i].key === k) return SIDES[i]; return null; }
  }

  waitForBar(build);
})();
