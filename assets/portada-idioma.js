/* portada-idioma.js — la portada de admira.tv en español o en inglés (Carlos, 15-oct-2026).
 *
 * La portada ya no tiene ⌘ Experto: en su hueco va la píldora #ykLangToggle, del mismo
 * tamaño. «ENG» pasa la portada a inglés y entonces dice «ESP» para volver al español.
 *
 * Qué idioma: ?lang=en|es en la URL → la preferencia guardada (admtv-lang, la misma clave
 * que las páginas de solución, p. ej. /radioanalytics/) → español.
 * Qué cambia:
 *   - <html lang>. Con lang="en", el CSS de la portada deja sólo la mitad inglesa de los
 *     pares ES/EN que pinta tools/gen-apps-grid.py (ese HTML generado no se toca).
 *   - El texto de cada [data-es]/[data-en], y los atributos [data-es-aria-label] y
 *     [data-es-title] (con su data-en-…).
 *   - La navegación de la barra, por su href (pilares.test.mjs fija esos enlaces tal
 *     cual), y su copia en ☰.
 *   - Los rótulos que pinta el armazón: ☰ Opciones, ▤ Avanzado y sus paneles.
 * Al cambiar: guarda admtv-lang, actualiza ?lang si la URL ya lo traía y avisa con
 * «admira:languagechange» ({detail: {lang}}) en document, que burbujea a window.
 *
 * Va aparte de index.html a propósito: public-showcase.test.mjs vigila que la home no
 * nombre el almacenamiento del navegador. Se carga (defer) ANTES que admiranext-frame.js,
 * para que el armazón copie en ☰ la navegación ya traducida.
 */
(function (G) {
  'use strict';
  var doc = G.document;
  if (!doc || G.AdmiraPortadaIdioma) return;
  var root = doc.documentElement;
  var CLAVE = 'admtv-lang';

  // ?lang=en|es → admtv-lang → español. No toca el DOM (la prueba la llama suelta).
  function resolver(search, guardado) {
    var q = '';
    try { q = String(new URLSearchParams(String(search || '')).get('lang') || '').toLowerCase(); } catch (_) { q = ''; }
    if (q === 'en' || q === 'es') return q;
    return guardado === 'en' || guardado === 'es' ? guardado : 'es';
  }
  function deLaUrl() {
    var q = '';
    try { q = String(new URLSearchParams(G.location.search).get('lang') || '').toLowerCase(); } catch (_) { q = ''; }
    return q === 'en' || q === 'es';
  }
  function leer() { try { return G.localStorage.getItem(CLAVE); } catch (_) { return null; } }
  function guardar(l) { try { G.localStorage.setItem(CLAVE, l); } catch (_) { /* sin almacenamiento */ } }

  // La navegación de la barra (y su copia en ☰), por href: [es, en].
  var NAV = {
    '#soluciones': ['20 soluciones', '20 solutions'],
    '#ecosistema': ['Ecosistema', 'Ecosystem'],
    '/player/': ['Player', 'Player'],
    '/canal.html': ['Ver canal', 'Watch channel']
  };
  // Lo que escribe admiranext-frame.js en la barra y en los paneles, tal cual: [es, en].
  var MARCO = [
    ['Opciones', 'Options'], ['Avanzado', 'Advanced'],
    ['☰ Opciones', '☰ Options'], ['▤ Avanzado', '▤ Advanced'],
    ['OPCIONES', 'OPTIONS'], ['AVANZADO', 'ADVANCED'],
    ['☰ OPCIONES', '☰ OPTIONS'], ['▤ AVANZADO', '▤ ADVANCED'],
    ['Navegación del grupo', 'Site navigation'], ['Filtrar por pilar', 'Filter by pillar'],
    ['Los cinco pilares', 'The five pillars'], ['Ecosistema', 'Ecosystem'], ['Ir a', 'Go to'],
    ['Redimensionar Opciones', 'Resize Options'], ['Redimensionar Avanzado', 'Resize Advanced'],
    ['Arrastra para cambiar el tamaño · doble clic: tamaño por defecto', 'Drag to resize · double-click: default size']
  ];
  // La píldora dice el idioma AL QUE lleva, en ese idioma.
  var PILDORA = {
    es: {texto: 'ENG', lang: 'en', label: 'ENG · Switch to English', title: 'Switch to English'},
    en: {texto: 'ESP', lang: 'es', label: 'ESP · Cambiar a español', title: 'Cambiar a español'}
  };

  function cada(sel, fn) { Array.prototype.forEach.call(doc.querySelectorAll(sel), fn); }
  function enMarco(valor, l) {
    var v = String(valor == null ? '' : valor).trim(), de = l === 'en' ? 0 : 1;
    for (var i = 0; i < MARCO.length; i++) if (MARCO[i][de] === v) return MARCO[i][1 - de];
    return null;
  }

  function traducirPagina(l) {
    cada('[data-es]', function (n) {
      var v = n.getAttribute('data-' + l);
      if (v != null) n.textContent = v;
    });
    ['aria-label', 'title'].forEach(function (a) {
      cada('[data-es-' + a + ']', function (n) {
        var v = n.getAttribute('data-' + l + '-' + a);
        if (v != null) n.setAttribute(a, v);
      });
    });
  }
  // La clave de un enlace de la barra: su #sección o su ruta. La marca blanca reescribe
  // /canal.html, después de cargar, como URL completa con ?marca=…&proyecto=….
  function claveNav(h) {
    h = String(h || '');
    if (h.charAt(0) === '#') return h;
    try {
      var u = new URL(h, G.location.href);
      if (u.origin === G.location.origin) return u.hash && u.pathname === G.location.pathname ? u.hash : u.pathname;
    } catch (_) { /* href raro: se queda como está */ }
    return h.split(/[?#]/)[0];
  }
  function traducirNav(l) {
    cada('header.yk-head nav a[href], .yk-rail-group a[href]', function (a) {
      var par = NAV[claveNav(a.getAttribute('href'))];
      if (par) a.textContent = par[l === 'en' ? 1 : 0];
    });
  }
  function traducirMarco(l) {
    cada('header.yk-head .yk-ico-lbl, .yk-rail-navhd, .yk-rail-sub, .yk-auto-hd', function (n) {
      var v = enMarco(n.textContent, l);
      if (v != null) n.textContent = v;
    });
    cada('header.yk-head .yk-ico, .yk-rail, .yk-rail nav, .yk-resize', function (n) {
      ['aria-label', 'title'].forEach(function (a) {
        var v = n.hasAttribute(a) ? enMarco(n.getAttribute(a), l) : null;
        if (v != null) n.setAttribute(a, v);
      });
    });
  }
  function pintarPildora(l) {
    var b = doc.getElementById('ykLangToggle');
    if (!b) return;
    var p = PILDORA[l];
    b.textContent = p.texto;
    b.setAttribute('lang', p.lang);
    b.setAttribute('aria-label', p.label);
    b.setAttribute('title', p.title);
  }
  // Si la URL ya trae ?lang, se deja dicha la elección (recargar no la deshace). Si no lo
  // trae, no se añade: la preferencia ya va en admtv-lang.
  function anotarUrl(l) {
    try {
      var u = new URL(G.location.href);
      if (!u.searchParams.has('lang') || u.searchParams.get('lang') === l) return;
      u.searchParams.set('lang', l);
      G.history.replaceState(G.history.state, '', u.pathname + u.search + u.hash);
    } catch (_) { /* sin history: se queda la URL */ }
  }

  var actual = null;
  function aplicar(l, como) {
    l = l === 'en' ? 'en' : 'es';
    como = como || {};
    var antes = String(root.getAttribute('lang') || 'es').toLowerCase().slice(0, 2);
    root.setAttribute('lang', l);
    traducirPagina(l);
    traducirNav(l);
    traducirMarco(l);
    pintarPildora(l);
    var montado = actual !== null;
    actual = l;
    if (como.guardar) guardar(l);
    if (como.url) anotarUrl(l);
    if (antes === l) return l;
    // El armazón repliega la navegación de la barra si ya no cabe; lo mira al redimensionar.
    if (montado) { try { G.dispatchEvent(new Event('resize')); } catch (_) { /* nada */ } }
    try { doc.dispatchEvent(new CustomEvent('admira:languagechange', {bubbles: true, detail: {lang: l}})); } catch (_) { /* nada */ }
    return l;
  }
  function alternar() { return aplicar(actual === 'en' ? 'es' : 'en', {guardar: true, url: true}); }

  function iniciar() {
    // La elección que llega en la URL se guarda: el resto del sitio (admtv-lang) la sigue.
    aplicar(resolver(G.location && G.location.search, leer()), {guardar: deLaUrl()});
    var b = doc.getElementById('ykLangToggle');
    if (b) b.addEventListener('click', alternar);
    // El armazón monta después (también defer): sus rótulos se traducen al estar listo.
    doc.addEventListener('admira-frame:ready', function () { if (actual === 'en') { traducirNav('en'); traducirMarco('en'); } });
  }

  G.AdmiraPortadaIdioma = {resolver: resolver, aplicar: aplicar, alternar: alternar, idioma: function () { return actual; }};
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})(window);
