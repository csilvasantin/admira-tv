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
 * Overlay (position:fixed, translate ±103%): NO empujan el contenido. Plegados
 * SIEMPRE al cargar — el estado NO se persiste (antes iba en localStorage
 * af_left/af_right/af_bottom y reabría los paneles en cada página). Cierre por
 * toggle, botón ✕, clic en el velo o Escape. Móvil sólo ≤520px (en la hoja CSS).
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
    // Versión abajo del todo, justo debajo de «Control ↗» — misma jerarquía que el raíl
    // heredado .admside (Control ↗ + admfoot con VER). Discreta, sin romper el layout.
    if (N.ver) {
      var foot = document.createElement("div");
      foot.className = "af-foot";
      foot.textContent = N.ver;
      nav.appendChild(foot);
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
      // Sin cruz (Carlos, 12-ago-2026): el MISMO icono que abre el panel lo cierra
      // — ya lo hacía, era un toggle. Dos formas de cerrar lo mismo es una de más,
      // y la cruz robaba ancho en la cabecera justo donde el panel tiene que ser
      // estrecho. Siguen quedando el velo y Escape.

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
      body.classList.toggle("af-any-open", anyOpen());
    }
    function closeAll() { SIDES.forEach(function (s) { if (isOpen(s)) setOpen(s, false); }); }

    scrim.addEventListener("click", closeAll);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && anyOpen()) { e.preventDefault(); closeAll(); }
    });

    // SIEMPRE plegados al cargar (Carlos, 2026-08-04). Antes se restauraba el
    // estado guardado, así que un panel abierto una vez reaparecía abierto en
    // CADA página: se entraba con el contenido tapado y el velo puesto sin
    // haber pedido nada. Son overlays de consulta, no una barra fija — se
    // despliegan al pulsar y se olvidan. Se limpian las claves ya guardadas
    // para no dejar datos muertos en los navegadores que las tengan.
    SIDES.forEach(function (side) {
      try { localStorage.removeItem(side.ls); } catch (e) {}
    });

    /* ── ANCHO AJUSTABLE, CON MEMORIA ──────────────────────────────────────────
     * El panel mide por defecto lo que mide su contenido (width:max-content en la
     * hoja): lo más estrecho que quepa el texto, que es lo que pidió Carlos. Pero
     * «lo que mide el texto» cambia con el idioma, con un item nuevo o con la
     * pantalla de cada uno, así que además se puede arrastrar el borde interior.
     * Lo elegido se recuerda por panel; un doble clic en el tirador devuelve al
     * ancho del contenido, para que ajustarlo no sea un billete de ida.
     * ------------------------------------------------------------------------ */
    SIDES.forEach(function (side) {
      // El de abajo se ajusta en ALTO, no en ancho, pero se ajusta igual: desde que
      // vive ahí el mando, 320 px se quedan cortos y quien lo use querrá subirlo.
      var vertical = side.key === "bottom";
      var izq = side.key === "left";
      var tirador = document.createElement("div");
      tirador.className = "af-grip af-grip-" + side.key;
      tirador.setAttribute("role", "separator");
      tirador.setAttribute("aria-orientation", vertical ? "horizontal" : "vertical");
      tirador.title = vertical
        ? "Arrastra para ajustar el alto · doble clic para volver al de casa"
        : "Arrastra para ajustar el ancho · doble clic para volver al del contenido";
      side.panel.appendChild(tirador);

      var CLAVE = "af-ancho-" + side.key;
      function aplica(px) {
        var prop = vertical ? "height" : "width";
        if (px) side.panel.style[prop] = px + "px";
        else side.panel.style.removeProperty(prop);
      }
      try { var g = parseInt(localStorage.getItem(CLAVE) || "", 10); if (g > 0) aplica(g); } catch (e) {}

      var arrastrando = false;
      tirador.addEventListener("pointerdown", function (ev) {
        arrastrando = true;
        try { tirador.setPointerCapture(ev.pointerId); } catch (e) {}
        document.body.classList.add("af-ajustando");
        ev.preventDefault();
      });
      tirador.addEventListener("pointermove", function (ev) {
        if (!arrastrando) return;
        var r = side.panel.getBoundingClientRect();
        // Se mide desde el borde EXTERNO de cada panel: el izquierdo crece hacia la
        // derecha, el derecho hacia la izquierda y el de abajo hacia arriba.
        var medida = vertical ? (r.bottom - ev.clientY)
                   : izq ? (ev.clientX - r.left) : (r.right - ev.clientX);
        var tope = vertical ? Math.round(window.innerHeight * 0.9) : Math.round(window.innerWidth * 0.9);
        medida = Math.max(vertical ? 160 : 150, Math.min(medida, tope));
        aplica(Math.round(medida));
      });
      function suelta() {
        if (!arrastrando) return;
        arrastrando = false;
        document.body.classList.remove("af-ajustando");
        try { var rr = side.panel.getBoundingClientRect();
              localStorage.setItem(CLAVE, String(Math.round(vertical ? rr.height : rr.width))); } catch (e) {}
      }
      tirador.addEventListener("pointerup", suelta);
      tirador.addEventListener("pointercancel", suelta);
      tirador.addEventListener("dblclick", function () {
        aplica(0);
        try { localStorage.removeItem(CLAVE); } catch (e) {}
      });
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
