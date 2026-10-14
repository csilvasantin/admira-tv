/* AdmiraNeXT shared context. /marca changes look; /proyecto changes a server-authorized view.
 * Load before marca-blanca.js. No browser flag, saved email or local role grants project access.
 */
(function (root) {
  'use strict';
  const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
  const OFF = new Set(['', 'off', 'admira', 'all', 'todos', 'todas', 'none', 'default']);
  const PLATFORMS = new Set(['admira.studio', 'admira.store', 'admira.tv', 'admira.app', 'admira.biz']);
  function id(value) {
    if (value === null) return null;
    if (typeof value !== 'string') throw new Error('invalid-context-id');
    const v = value.trim().toLowerCase();
    if (OFF.has(v)) return null;
    if (!ID.test(v)) throw new Error('invalid-context-id');
    return v;
  }
  function createContext(options) {
    const win = options.window;
    const doc = win.document;
    const request = options.fetch || win.fetch.bind(win);
    const api = String(options.api || 'https://api.admira.store').replace(/\/+$/, '');
    let state = { marca: null, proyecto: null, superusuario: false, synced: false };
    let token = '', tokenExp = 0, denied = false, queue = Promise.resolve();
    let ownBrandEvent = false;
    const parsed = new URL(win.location.href);
    const supplied = {};
    for (const key of ['marca', 'proyecto']) if (parsed.searchParams.has(key)) supplied[key] = id(parsed.searchParams.get(key));
    // Never pass an unverified project to another surface during startup.
    if ('proyecto' in supplied) {
      parsed.searchParams.delete('proyecto');
      win.history.replaceState(win.history.state, '', parsed.href);
    }
    if ('marca' in supplied) state.marca = supplied.marca;
    const snapshot = () => ({ ...state });
    const expert = () => options.expert ? options.expert() === true : doc.documentElement.dataset.mode === 'expert' || doc.documentElement.dataset.expert === 'true' || doc.body?.classList.contains('expert-mode') === true;
    async function sessionToken() {
      if (token && tokenExp > Date.now() / 1000 + 30) return token;
      const data = options.tokenProvider ? await options.tokenProvider() : await request('/auth/api-token', { credentials: 'include', cache: 'no-store' }).then(r => r.ok ? r.json() : null);
      if (!data?.ok || !data.token) { token = ''; tokenExp = 0; return ''; }
      token = data.token;
      tokenExp = Number(data.exp) || Date.now() / 1000 + 60;
      return token;
    }
    async function remote(method, patch) {
      const bearer = await sessionToken();
      if (!bearer) throw new Error('session-required');
      const r = await request(api + '/ctx', { method, cache: 'no-store', headers: { Authorization: 'Bearer ' + bearer, ...(patch ? { 'Content-Type': 'application/json' } : {}) }, ...(patch ? { body: JSON.stringify(patch) } : {}) });
      const data = await r.json();
      if (!r.ok || !data.ok) throw Object.assign(new Error(data.error || 'context-unavailable'), {status:r.status});
      return data;
    }
    function link(value) {
      const u = new URL(value, win.location.href);
      if (!['https:', 'http:'].includes(u.protocol)) return u.href;
      const host = u.hostname.replace(/^www\./, '');
      if ((!PLATFORMS.has(host) && u.origin !== win.location.origin) || u.pathname.startsWith('/auth/')) return u.href;
      for (const k of ['marca', 'proyecto']) {
        if (state[k]) u.searchParams.set(k, state[k]); else u.searchParams.delete(k);
      }
      return u.href;
    }
    function links() {
      for (const a of doc.querySelectorAll('a[href]')) {
        const original = a.getAttribute('href');
        if (!original || original.startsWith('#')) continue;
        const next = link(original);
        if (new URL(original, win.location.href).href !== next) a.setAttribute('href', next);
      }
    }
    function announce() {
      const u = new URL(win.location.href);
      for (const k of ['marca', 'proyecto']) if (state[k]) u.searchParams.set(k, state[k]); else u.searchParams.delete(k);
      win.history.replaceState(win.history.state, '', u.href);
      links();
      doc.dispatchEvent(new win.CustomEvent('admira:contexto', { detail: snapshot() }));
    }
    async function paint(marca = state.marca) {
      if (!win.AdmiraMarca) return {ok:true};
      ownBrandEvent = true;
      try {
        const r = marca ? await win.AdmiraMarca.activar(marca) : win.AdmiraMarca.desactivar();
        if (r && !r.ok) doc.dispatchEvent(new win.CustomEvent('admira:contexto-error', {detail:r}));
        return r || {ok:true};
      } finally { ownBrandEvent = false; }
    }
    const ready = (async () => {
      try {
        const data = await remote('GET');
        state = { marca: id(data.marca), proyecto: id(data.proyecto), superusuario: data.superusuario === true, synced: true };
        const patch = { ...supplied };
        if ('proyecto' in patch && !state.superusuario) {
          delete patch.proyecto; denied = true;
          doc.dispatchEvent(new win.CustomEvent('admira:contexto-error', {detail:{error:'superuser-required'}}));
        }
        if (Object.keys(patch).length) {
          const updated = await remote('POST', patch);
          state = { ...state, marca: id(updated.marca), proyecto: id(updated.proyecto), superusuario: updated.superusuario === true };
        }
      } catch (error) {
        state.proyecto = null; state.superusuario = false; state.synced = false;
        denied = 'proyecto' in supplied;
        doc.dispatchEvent(new win.CustomEvent('admira:contexto-error', {detail:{error:error.message}}));
      }
      announce(); await paint(); return snapshot();
    })();
    async function update(patch) {
      await ready;
      for (const k of Object.keys(patch)) if (!['marca', 'proyecto'].includes(k)) throw new Error('bad-context-fields');
      const clean = Object.fromEntries(Object.entries(patch).map(([k,v]) => [k,id(v)]));
      const previousMarca = state.marca;
      if ('marca' in clean) {
        const visual = await paint(clean.marca);
        if (!visual.ok) throw new Error('brand-' + (visual.reason || 'unavailable'));
      }
      if ('proyecto' in clean) {
        // Recheck at server on every project change; browser state alone never authorizes.
        let data;
        try { data = await remote('POST', clean); } catch (error) {
          if ('marca' in clean) await paint(previousMarca);
          throw error;
        }
        state = {marca:id(data.marca), proyecto:id(data.proyecto), superusuario:data.superusuario === true, synced:true};
        denied = false;
      } else {
        state.marca = clean.marca;
        try {
          const data = await remote('POST', clean);
          state = {marca:id(data.marca), proyecto:id(data.proyecto), superusuario:data.superusuario === true, synced:true};
        } catch { state.synced = false; }
      }
      announce(); return snapshot();
    }
    function set(patch) {
      const job = queue.then(() => update(patch)); queue = job.catch(() => {}); return job;
    }
    async function filteredRequest(path, init = {}) {
      await ready;
      if (denied) throw new Error('project-not-authorized');
      const u = new URL(path, api + '/');
      // Session tokens only go to the configured API, never arbitrary links.
      if (u.origin !== new URL(api).origin) throw new Error('untrusted-api-origin');
      if (state.proyecto) u.searchParams.set('proyecto', state.proyecto);
      const headers = new Headers(init.headers);
      const bearer = await sessionToken();
      if (bearer) headers.set('Authorization', 'Bearer ' + bearer);
      return request(u.href, {...init, cache:'no-store', headers});
    }
    function command(line) {
      if (!expert()) return Promise.reject(new Error('expert-mode-required'));
      const m = /^\/(marca|brand|proyecto|project)(?:\s+(.*))?$/.exec(String(line).trim());
      if (!m) return Promise.reject(new Error('unknown-context-command'));
      if (m[2] === undefined) return ready.then(snapshot);
      const brand = /^(marca|brand)$/.test(m[1]);
      const parsed = brand && win.AdmiraMarca?.parseArg(m[2]);
      if (parsed?.kind === 'web') return Promise.resolve(win.AdmiraMarca.analizar(parsed.url));
      return set({[brand ? 'marca' : 'proyecto']: parsed?.kind === 'id' ? parsed.id : m[2]});
    }
    // Host brand UI also synchronizes through context. No project change is implied.
    doc.addEventListener('admira:marca', e => {
      const marca = e.detail?.id || null;
      if (!ownBrandEvent && marca !== state.marca) set({marca}).catch(() => {});
    });
    if (win.MutationObserver) new win.MutationObserver(links).observe(doc.documentElement, {childList:true, subtree:true, attributes:true, attributeFilter:['href']});
    return Object.freeze({ready, actual:snapshot, fijar:set, comando:command, enlace:link, enlaces:links, request:filteredRequest});
  }
  const exported = {createContext, contextId:id};
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  if (!root.document || root.AdmiraContexto) return;
  const script = root.document.currentScript;
  const options = root.ADMIRA_CONTEXT_OPTIONS || {};
  root.AdmiraContexto = createContext({...options, window:root, api:options.api || script?.dataset.api});
})(typeof window === 'undefined' ? globalThis : window);
