/* admira-contexto.js — filtro por marca y por cliente en admira.tv (encargo #5979 · fase 2 del paraguas global).
 *
 * Integra en admira.tv el módulo común de admira-design (shared/contexto.js + shared/marca-blanca.js):
 *   /marca <id>    cambia solo el aspecto (cualquier usuario, en el ⌘ Experto). /marca off vuelve a Admira.
 *   /proyecto <id> filtra pantallas, playlists y contenidos por cliente. Solo superusuario, y lo comprueba
 *                  el servidor (GET/POST /ctx de la API). /proyecto off quita el filtro (también superusuario).
 * Con /proyecto starbucks la API devuelve solo las pantallas alsea-sbux-*, sus playlists y sus contenidos.
 *
 * Sustituye a la marca blanca propia de admira.tv (assets/marca-blanca.js) y a la lista de proyectos que
 * admira-context-picker.js y la parrilla sacaban de /grid/projects cuando hay un cliente activo.
 *
 * Cómo filtra: las páginas leen la API con fetch directo. Con un cliente activo, las lecturas GET de
 * /grid/screens, /signage/screens, /stock, /stock/list, /grid/playlist y /grid/draft (y el índice público
 * del Stock) pasan por AdmiraContexto.request, que añade ?proyecto= y la sesión. Sin cliente activo no se
 * toca nada: las lecturas públicas siguen como estaban y no esperan a nadie.
 *
 * Se carga síncrono en el <head> de las páginas que leen datos (para estar antes de su primer fetch);
 * admira-nav.js y admiranext-frame.js lo cargan en las demás.
 */
(function (G) {
  'use strict';
  if (G.AdmiraContextoTv || !G.document) return;
  var doc = G.document;
  var html = doc.documentElement;
  var CFG = G.ADMIRA_CONTEXTO_TV || {};

  // El fetch de verdad: el módulo común lo usa para /ctx y para sus lecturas, así nunca vuelve a pasar por el filtro.
  var fetchOriginal = G.fetch ? G.fetch.bind(G) : null;

  // ── Entorno: producción (API real y sesión de admira.tv) o preview aislada (sandbox de #5934) ──
  var SANDBOX_API = 'https://pixer-ctx-5934-preview.csilvasantin.workers.dev';
  var host = location.hostname;
  var esPreview = host === 'localhost' || host === '127.0.0.1' || (/\.admira-tv\.pages\.dev$/.test(host));
  var rolPrueba = 'superuser';
  if (esPreview) {
    try {
      var q = new URLSearchParams(location.search).get('rol');
      if (q === 'lector' || q === 'reader') sessionStorage.setItem('admira_ctx_rol', 'reader');
      else if (q === 'superusuario' || q === 'superuser') sessionStorage.removeItem('admira_ctx_rol');
      if (sessionStorage.getItem('admira_ctx_rol') === 'reader') rolPrueba = 'reader';
    } catch (_) {}
  }
  var API = CFG.api || (esPreview ? SANDBOX_API : 'https://api.admira.store');

  function lang() { return /^en/i.test(html.lang || '') ? 'en' : 'es'; }
  function T(es, en) { return lang() === 'en' ? en : es; }

  function expertoAbierto() {
    var b = doc.body;
    return html.dataset.mode === 'expert' ||
      html.classList.contains('yk-open-bottom') ||      // home · admiranext-frame
      html.classList.contains('admnav-exp') ||          // parrilla · CLI de admira-nav
      !!(b && b.classList.contains('af-bottom-open')) || // páginas con admira-frame
      !!(G.AdmiraExperto && typeof G.AdmiraExperto.isOpen === 'function' && G.AdmiraExperto.isOpen());
  }

  var opciones = {api: API, expert: expertoAbierto, fetch: fetchOriginal};
  // Producción: token de la sesión de admira.tv. Si el servidor aún no está configurado (503), se recuerda para
  // explicar que el filtro por cliente no está activo, en vez de pedir un inicio de sesión que ya existe.
  var tokenNoConfigurado = false;
  if (!esPreview) {
    opciones.tokenProvider = function () {
      return fetchOriginal('/auth/api-token', {credentials: 'include', cache: 'no-store'}).then(function (r) {
        tokenNoConfigurado = r.status === 503;
        return r.ok ? r.json() : {ok: false};
      }, function () { return {ok: false}; });
    };
  }
  if (esPreview) {
    // Sesión sintética del sandbox (firma exclusiva de la preview): el rol se consulta en la whitelist real.
    opciones.tokenProvider = function () {
      return fetchOriginal(API + '/preview/session?role=' + rolPrueba, {cache: 'no-store'}).then(function (r) { return r.json(); });
    };
  }
  G.ADMIRA_CONTEXT_OPTIONS = Object.assign({}, opciones, G.ADMIRA_CONTEXT_OPTIONS || {});

  // ── Pista local: ¿había un cliente activo? Solo decide si esperar al contexto antes de leer; no autoriza nada ──
  var PISTA = 'admira_ctx_proyecto';
  function leerPista() { try { return localStorage.getItem(PISTA) || ''; } catch (_) { return ''; } }
  function guardarPista(p) { try { if (p) localStorage.setItem(PISTA, p); else localStorage.removeItem(PISTA); } catch (_) {} }
  var pidioProyecto = false;
  try { pidioProyecto = new URLSearchParams(location.search).has('proyecto'); } catch (_) {}
  var esperar = pidioProyecto || !!leerPista();

  // ── Carga del módulo común (mismo commit de admira-design#1 para los dos ficheros) ──
  // Mismo sello que este fichero (?v= lo pone tools/sella-versiones.py en el <script> de cada página).
  var yo = doc.currentScript && doc.currentScript.src || '';
  var V = yo.indexOf('?v=') > 0 ? yo.slice(yo.indexOf('?v=')) : '?v=' + encodeURIComponent(G.ADMIRA_VERSION || 'contexto-1');
  var resolverModulo;
  var modulo = new Promise(function (res) { resolverModulo = res; });
  function cargar(src, extra) {
    return new Promise(function (res) {
      var s = doc.createElement('script');
      s.src = src; s.async = false;
      if (extra) Object.keys(extra).forEach(function (k) { s.setAttribute(k, extra[k]); });
      s.onload = function () { res(true); };
      s.onerror = function () { res(false); };
      (doc.head || html).appendChild(s);
    });
  }
  var cargaContexto = G.AdmiraContexto ? Promise.resolve(true) : cargar('/shared/contexto.js' + V);
  var cargaMarca = G.AdmiraMarca ? Promise.resolve(true) : cargar('/shared/marca-blanca.js' + V, {'data-plataforma': 'tv'});
  Promise.all([cargaContexto, cargaMarca]).then(function () { resolverModulo(G.AdmiraContexto || null); });

  // Estado verificado del contexto (o null si el módulo o la API no están).
  var listoPromesa = modulo.then(function (C) {
    if (!C) return null;
    return C.ready.then(function (s) { return s; }, function () { return null; });
  });
  function listo(ms) { return ms ? conPlazo(listoPromesa, ms).then(function (s) { return s || null; }) : listoPromesa; }
  function actual() { return G.AdmiraContexto ? G.AdmiraContexto.actual() : null; }
  function proyecto() { var s = actual(); return s && s.proyecto || null; }

  // ── Lecturas filtradas ──
  var FILTRABLES = /^\/(grid\/screens|signage\/screens|stock|stock\/list|grid\/playlist|grid\/draft)$/;
  var lecturasVistas = 0;
  var permitidas = null; // pantallas que la API devolvió con el filtro (para recortar las fuentes locales)
  function destinoFiltrable(input, init) {
    var metodo = String((init && init.method) || (input && typeof input === 'object' && input.method) || 'GET').toUpperCase();
    if (metodo !== 'GET') return null;
    var u;
    try { u = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url, location.href); } catch (_) { return null; }
    if (u.origin === 'https://api.admira.store' && FILTRABLES.test(u.pathname)) return u.pathname + u.search;
    if (u.origin === 'https://stock.admira.store' && u.pathname === '/stock/index.json') return '/stock/list?limit=2000';
    return null;
  }
  function anotarPantallas(ruta, r) {
    if (!r.ok || !/screens/.test(ruta)) return r;
    return r.clone().json().then(function (d) {
      permitidas = permitidas || new Set();
      (d && d.screens || []).forEach(function (s) { if (s && s.screen) permitidas.add(String(s.screen)); });
      return r;
    }, function () { return r; });
  }
  function conPlazo(p, ms) {
    return Promise.race([p, new Promise(function (res) { setTimeout(function () { res(undefined); }, ms); })]);
  }
  if (fetchOriginal) {
    G.fetch = function (input, init) {
      var ruta = destinoFiltrable(input, init);
      if (!ruta) return fetchOriginal(input, init);
      lecturasVistas++;
      if (!esperar) return fetchOriginal(input, init);
      return conPlazo(listo(), 8000).then(function (estado) {
        if (estado === undefined && !pidioProyecto) return fetchOriginal(input, init); // contexto lento: sin filtro
        if (estado && estado.proyecto || pidioProyecto) {
          if (!G.AdmiraContexto) return Promise.reject(new Error('project-context-unavailable'));
          // Si el proyecto de la URL se rechazó, request falla: nunca se enseña la lista sin filtrar.
          var limpio = {}; if (init && init.headers) limpio.headers = init.headers;
          return G.AdmiraContexto.request(ruta, limpio).then(function (r) { return anotarPantallas(ruta, r); });
        }
        return fetchOriginal(input, init);
      });
    };
  }

  /* Con un cliente activo, deja la lista de proyectos en ese cliente y quita las pantallas que no vinieron
   * filtradas de la API (Xtancos de locations.js, players virtuales, destinos de la URL…). Sin cliente: tal cual. */
  function recortar(projects, screens) {
    var p = proyecto();
    if (!p) return {projects: projects, screens: screens};
    var nombre = T('Proyecto ', 'Project ') + p;
    var kept = (screens || []).filter(function (s) { return s && permitidas && permitidas.has(String(s.screen)); })
      .map(function (s) { return Object.assign({}, s, {projectId: p, locationId: s.locationId || s.loc || s.circuit || s.screen}); });
    if (!kept.length) kept = [{screen: 'sin-pantallas-' + p, name: T('Sin pantallas en este proyecto', 'No screens in this project'), circuit: p, locationId: p, bands: 4, pixerScreens: [], projectId: p, programmable: false}];
    return {projects: [{id: p, name: nombre, circuits: []}], screens: kept};
  }

  // ── Comandos /marca y /proyecto (los tres CLI de admira.tv) ──
  var ERRORES = {
    'superuser-required': ['Solo un superusuario puede usar /proyecto.', 'Only a superuser can use /project.'],
    'session-required': ['Inicia sesión para usar /proyecto.', 'Sign in to use /project.'],
    'invalid-session': ['La sesión no es válida. Vuelve a iniciar sesión.', 'Invalid session. Sign in again.'],
    'expert-mode-required': ['Abre el modo experto para usar este comando.', 'Open expert mode to use this command.'],
    'invalid-context-id': ['Identificador no válido: usa minúsculas, números y guiones.', 'Invalid id: use lowercase letters, digits and hyphens.'],
    'whitelist-unavailable': ['No se ha podido comprobar el permiso. Inténtalo en un momento.', 'Could not check permissions. Try again shortly.'],
    'project-not-authorized': ['Proyecto no autorizado.', 'Project not authorized.']
  };
  function textoError(e) {
    var m = String(e && e.message || e || 'error');
    if (e && e.status === 403 && !ERRORES[m]) m = 'superuser-required';
    // Sin clave en admira.tv (503) o sin /ctx en la API (404): el filtro aún no está activo, no es un fallo de sesión.
    if ((m === 'session-required' && tokenNoConfigurado) || (e && e.status === 404)) return T('El filtro por cliente todavía no está activo en producción.', 'The client filter is not active in production yet.');
    if (/^brand-/.test(m)) return T('No se pudo aplicar esa marca (', 'Could not apply that brand (') + m.slice(6) + ').';
    var t = ERRORES[m];
    return t ? T(t[0], t[1]) : T('No se pudo cambiar el contexto: ', 'Could not change the context: ') + m;
  }
  function resumen(s) {
    return T('Marca: ', 'Brand: ') + (s.marca || 'Admira') + ' · ' + T('proyecto: ', 'project: ') + (s.proyecto || T('todos', 'all'));
  }
  function recargarSiHayDatos() {
    if (CFG.recargar === false || !lecturasVistas) return;
    setTimeout(function () { location.reload(); }, 700);
  }
  function ejecutar(linea, escribir) {
    escribir = escribir || function () {};
    var m = /^\/?(marca|brand|marcablanca|proyecto|project)(?:\s+([\s\S]*))?$/i.exec(String(linea || '').trim());
    if (!m) return Promise.resolve({ok: false, error: 'unknown-context-command'});
    var esMarca = /^(marca|brand|marcablanca)$/i.test(m[1]);
    var arg = (m[2] || '').trim();
    return modulo.then(function (C) {
      if (!C) { escribir(T('El filtro de marca y proyecto no está disponible.', 'Brand and project filter unavailable.'), 'err'); return {ok: false, error: 'context-unavailable'}; }
      if (esMarca && /^(lista|list)$/i.test(arg)) {
        if (!G.AdmiraMarca || !G.AdmiraMarca.listar) { escribir(T('Catálogo no disponible.', 'Catalogue unavailable.'), 'err'); return {ok: false}; }
        return G.AdmiraMarca.listar().then(function (lista) {
          escribir(T('Marcas: ', 'Brands: ') + (lista || []).map(function (x) { return x.id; }).join(', '));
          return {ok: true};
        });
      }
      var antes = proyecto();
      return C.comando('/' + (esMarca ? 'marca' : 'proyecto') + (arg ? ' ' + arg : '')).then(function (s) {
        if (s && s.ok && s.href) { escribir(T('Analizador de marca abierto en otra pestaña.', 'Brand analyzer opened in another tab.')); return {ok: true}; }
        escribir(resumen(s || {}));
        if (!esMarca && arg && (s && s.proyecto || null) !== antes) {
          escribir(s.proyecto ? T('Filtrando por ', 'Filtering by ') + s.proyecto + '…' : T('Sin filtro de proyecto.', 'Project filter removed.'));
          recargarSiHayDatos();
        }
        return {ok: true, contexto: s};
      }, function (e) {
        escribir(textoError(e), 'err');
        avisoTemporal(textoError(e));
        return {ok: false, error: String(e && e.message || e)};
      });
    });
  }

  // CLI de la suite común (admira-frame.js y la home): los verbos del adaptador sustituyen al /marca de serie.
  function escritorDe(log) {
    return function (texto, cls) {
      if (!log) return;
      String(texto).split('\n').forEach(function (linea) {
        var fila = doc.createElement(/^(OL|UL)$/.test(log.tagName) ? 'li' : 'div');
        fila.className = cls || '';
        fila.textContent = linea;
        log.appendChild(fila);
      });
      log.scrollTop = log.scrollHeight;
    };
  }
  function conectarSuite(engine) {
    if (!engine || typeof engine.registerAdapter !== 'function') return;
    try {
      engine.registerAdapter({id: 'tv-contexto', verbs: [
        {name: 'marca', alias: ['brand', 'marcablanca'], args: '<id>|off|lista',
          desc: ['cambia el aspecto con una marca del catálogo; no filtra datos', 'changes the look with a catalogue brand; no data filter'],
          run: function (args, log) { return ejecutar('/marca ' + [].concat(args || []).join(' '), escritorDe(log)); }},
        {name: 'proyecto', alias: ['project'], args: '<id>|off',
          desc: ['filtra pantallas, playlists y contenidos por cliente (solo superusuario)', 'filters screens, playlists and content by client (superuser only)'],
          run: function (args, log) { return ejecutar('/proyecto ' + [].concat(args || []).join(' '), escritorDe(log)); }}
      ]});
    } catch (_) {}
  }
  (G.AdmiraCommandAdapters = G.AdmiraCommandAdapters || []).push(conectarSuite);
  if (G.AdmiraExperto) conectarSuite(G.AdmiraExperto);
  G.addEventListener('admira:commands-ready', function () { conectarSuite(G.AdmiraExperto); });

  // ── Lo que se ve: aviso de cliente activo, rechazos y logo de la marca en la barra de admira.tv ──
  function aviso(texto, tipo) {
    var el = doc.getElementById('admira-ctx-aviso');
    if (!el) {
      el = doc.createElement('div');
      el.id = 'admira-ctx-aviso'; el.setAttribute('role', 'status');
      el.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:2147483000;max-width:min(92vw,420px);padding:8px 12px;border-radius:8px;font:600 12px/1.35 system-ui,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.35)';
      (doc.body || html).appendChild(el);
    }
    el.textContent = texto;
    el.style.background = tipo === 'err' ? '#5a1620' : '#0f2c3d';
    el.style.color = '#fff';
    el.style.border = '1px solid ' + (tipo === 'err' ? '#ff6b7f' : '#70cff4');
    el.hidden = !texto;
  }
  function avisoTemporal(texto) {
    aviso(texto, 'err');
    var el = doc.getElementById('admira-ctx-aviso');
    if (!el) return;
    clearTimeout(el._t);
    el._t = setTimeout(function () { pintarEstado(actual()); }, 8000);
  }
  function pintarEstado(s) {
    var p = s && s.proyecto;
    guardarPista(p || '');
    if (p) aviso((esPreview ? 'PREVIEW · ' : '') + T('Proyecto: ', 'Project: ') + p + ' · ' + T('/proyecto off para quitarlo', '/project off to clear it'));
    else if (doc.getElementById('admira-ctx-aviso') && !doc.getElementById('admira-ctx-aviso').dataset.error) aviso('');
  }
  doc.addEventListener('admira:contexto', function (e) { pintarEstado(e.detail); });
  doc.addEventListener('admira:contexto-error', function (e) {
    var err = e.detail && e.detail.error;
    if (!pidioProyecto || !err || /^brand-/.test(err)) return; // sin proyecto pedido, un fallo de /ctx no se enseña
    aviso(textoError({message: err}) + ' ' + T('Se ha quitado de la dirección.', 'It was removed from the address.'), 'err');
    var el = doc.getElementById('admira-ctx-aviso'); if (el) el.dataset.error = '1';
  });
  // Cliente activo guardado en el servidor que esta página no conocía: se recarga una vez para leer filtrado.
  listo().then(function (s) {
    var p = s && s.proyecto;
    if (!p || esperar || !lecturasVistas || CFG.recargar === false) return;
    try { if (sessionStorage.getItem('admira_ctx_recarga') === p) return; sessionStorage.setItem('admira_ctx_recarga', p); } catch (_) { return; }
    location.reload();
  });

  G.AdmiraContextoTv = Object.freeze({
    ejecutar: ejecutar, recortar: recortar, proyecto: proyecto, listo: listo, api: API, preview: esPreview,
    _destinoFiltrable: destinoFiltrable
  });
})(window);
