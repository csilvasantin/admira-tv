/* Proyectos de dispositivos (12-nov-2026). Lo comparten /mando y /players:
   - load(): GET /api/proyectos con la cookie de sesión de admira.tv.
   - projectOf(screen): mismo algoritmo que functions/api/proyectos.js (asignación > devices > prefijo).
   - current()/setCurrent(id): filtro elegido, persistido en localStorage (clave común a las dos páginas).
   Sin sesión o sin proyectos visibles el filtro queda en «todos» y nada se oculta (comportamiento de antes). */
(function (root) {
  'use strict';
  var KEY = 'admira.tv.proyecto';
  var ENDPOINT = '/api/proyectos';
  var NONE = 'sin-proyecto', ALL = 'todos';
  var data = null;
  function clean(s) { s = String(s == null ? '' : s).trim().toLowerCase(); return /^[a-z0-9][a-z0-9-]{0,79}$/.test(s) ? s : ''; }
  function projectOf(screen, doc) {
    doc = doc || data; var s = clean(screen);
    if (!doc || !s) return '';
    var assign = doc.assign || {};
    if (Object.prototype.hasOwnProperty.call(assign, s)) {
      var id = assign[s]; return id && doc.projects.some(function (p) { return p.id === id; }) ? id : '';
    }
    for (var i = 0; i < doc.projects.length; i++) if ((doc.projects[i].devices || []).indexOf(s) >= 0) return doc.projects[i].id;
    var best = '', len = 0;
    doc.projects.forEach(function (p) { (p.match || []).forEach(function (m) { if (s.indexOf(m) === 0 && m.length > len) { best = p.id; len = m.length; } }); });
    return best;
  }
  function storedRaw() { try { return localStorage.getItem(KEY) || ''; } catch (_) { return ''; } }
  function current() {
    if (!data || !data.ok) return ALL;
    var id = storedRaw();
    var ids = data.projects.map(function (p) { return p.id; });
    if (data.allowAll && (id === ALL || id === NONE)) return id;
    if (ids.indexOf(id) >= 0) return id;
    return data.allowAll ? ALL : (ids[0] || ALL);
  }
  function setCurrent(id) { try { localStorage.setItem(KEY, String(id || ALL)); } catch (_) {} emit(); }
  function visible(screen, filter) {
    filter = filter || current();
    if (!data || !data.ok) return true;
    // Transición: un usuario sin ningún proyecto asignado sigue viendo todo, como antes de Proyectos.
    // Cuando Dios le asigne proyectos (members), pasará a ver solo los suyos.
    if (!data.allowAll && !data.projects.length) return true;
    if (filter === ALL) return data.allowAll ? true : !!projectOf(screen);
    var p = projectOf(screen);
    return filter === NONE ? !p : p === filter;
  }
  function project(id) { return data && data.projects.find(function (p) { return p.id === id; }) || null; }
  function label(id) {
    if (id === ALL) return 'Todos'; if (id === NONE) return 'Sin proyecto';
    var p = project(id); return p ? (p.icon ? p.icon + ' ' : '') + p.name : id;
  }
  var listeners = [];
  function onChange(fn) { listeners.push(fn); }
  function emit() { listeners.forEach(function (fn) { try { fn(current()); } catch (_) {} }); }
  async function load() {
    try {
      var r = await fetch(ENDPOINT + '?_=' + Date.now(), { credentials: 'same-origin', cache: 'no-store' });
      var d = await r.json().catch(function () { return null; });
      data = r.ok && d && d.ok ? d : { ok: false, status: r.status, error: d && d.error || ('HTTP ' + r.status) };
    } catch (e) { data = { ok: false, status: 0, error: e.message || 'sin red' }; }
    emit(); return data;
  }
  async function post(body) {
    var r = await fetch(ENDPOINT, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ revision: data && data.revision }, body)) });
    var d = await r.json().catch(function () { return null; });
    if (!r.ok || !d || !d.ok) { var err = new Error(d && d.error || ('HTTP ' + r.status)); err.status = r.status; throw err; }
    data = d; emit(); return d;
  }
  function assign(screen, projectId) { return post({ action: 'assign', screen: screen, project: projectId || '' }); }
  function upsert(p) { return post({ action: 'upsert', project: p }); }
  function counts(screens) {
    var c = {}; c[ALL] = 0; c[NONE] = 0;
    (screens || []).forEach(function (s) { var p = projectOf(s); c[ALL]++; c[p || NONE] = (c[p || NONE] || 0) + 1; });
    return c;
  }
  root.AdmiraProyectos = Object.freeze({ KEY: KEY, ALL: ALL, NONE: NONE, load: load, data: function () { return data; }, projectOf: projectOf,
    current: current, setCurrent: setCurrent, visible: visible, label: label, project: project, onChange: onChange, assign: assign, upsert: upsert, counts: counts });
})(typeof window !== 'undefined' ? window : globalThis);
