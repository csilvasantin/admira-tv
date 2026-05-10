(function () {
  const STORAGE_KEY = 'pixer-brief-v.2026.05.02-r7';
  const VERSION = 'v.2026.05.02-r7';

  function loadStore() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch { return {}; }
  }
  function saveStore(data) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
    catch {}
  }
  function setNested(obj, path, value) {
    const keys = path.split('.');
    let ref = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      ref[keys[i]] = ref[keys[i]] || {};
      ref = ref[keys[i]];
    }
    if (value === undefined || value === null || value === '' ||
        (Array.isArray(value) && value.length === 0)) {
      delete ref[keys[keys.length - 1]];
    } else {
      ref[keys[keys.length - 1]] = value;
    }
  }
  function getNested(obj, path) {
    return path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
  }
  function pruneEmpty(obj) {
    if (Array.isArray(obj)) return obj;
    if (obj && typeof obj === 'object') {
      const out = {};
      for (const k of Object.keys(obj)) {
        const v = pruneEmpty(obj[k]);
        if (v === undefined) continue;
        if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) continue;
        if (Array.isArray(v) && v.length === 0) continue;
        out[k] = v;
      }
      return out;
    }
    return obj;
  }

  // Hidratar inputs desde localStorage
  function hydrate(scope) {
    const store = loadStore();
    scope.querySelectorAll('input[type=text], select, textarea').forEach(el => {
      if (!el.name) return;
      const v = getNested(store, el.name);
      if (v !== undefined) el.value = v;
    });
    scope.querySelectorAll('.chips[data-name]').forEach(group => {
      const arr = getNested(store, group.dataset.name) || [];
      group.querySelectorAll('input').forEach(i => {
        i.checked = arr.includes(i.value);
        const chip = i.closest('.chip');
        if (chip) chip.classList.toggle('active', i.checked);
      });
    });
  }

  // Persistir cambios
  function bindPersistence(scope) {
    function persistFromInput(el) {
      const store = loadStore();
      setNested(store, el.name, el.value.trim());
      saveStore(store);
    }
    scope.querySelectorAll('input[type=text], select, textarea').forEach(el => {
      if (!el.name) return;
      el.addEventListener('input', () => persistFromInput(el));
      el.addEventListener('change', () => persistFromInput(el));
    });
    scope.querySelectorAll('.chips[data-name]').forEach(group => {
      const name = group.dataset.name;
      group.querySelectorAll('input').forEach(i => {
        i.addEventListener('change', () => {
          const chip = i.closest('.chip');
          if (chip) chip.classList.toggle('active', i.checked);
          const values = Array.from(group.querySelectorAll('input:checked')).map(x => x.value);
          const store = loadStore();
          setNested(store, name, values);
          saveStore(store);
        });
      });
    });
  }

  function buildBrief(scopeKeys) {
    const store = loadStore();
    const data = { meta: { version: VERSION, generado: new Date().toISOString() } };
    if (store.cliente) data.cliente = store.cliente;
    const sections = scopeKeys || ['audio', 'musica', 'imagenes', 'video'];
    for (const k of sections) {
      if (store[k]) data[k] = store[k];
    }
    return pruneEmpty(data);
  }

  function toMarkdown(d) {
    const lines = [];
    lines.push('# Brief Pixer.ai x Admira.xp');
    if (d.cliente) lines.push(`**Cliente / proyecto:** ${d.cliente}`);
    lines.push(`**Version:** ${d.meta.version}  ·  **Generado:** ${d.meta.generado}`);
    const sections = [
      ['audio', 'Audio'],
      ['musica', 'Musica'],
      ['imagenes', 'Imagenes'],
      ['video', 'Video'],
    ];
    for (const [key, title] of sections) {
      if (!d[key]) continue;
      lines.push('', `## ${title}`);
      for (const [k, v] of Object.entries(d[key])) {
        const val = Array.isArray(v) ? v.join(', ') : v;
        lines.push(`- **${k}:** ${val}`);
      }
    }
    return lines.join('\n');
  }

  function showToast(msg) {
    let t = document.querySelector('.toast');
    if (!t) {
      t = document.createElement('div');
      t.className = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => t.classList.remove('show'), 1400);
  }

  function bindBriefActions(out, scopeKeys) {
    function current() { return buildBrief(scopeKeys); }
    const map = {
      genBrief: () => { out.textContent = JSON.stringify(current(), null, 2); },
      copyBrief: async () => { await navigator.clipboard.writeText(JSON.stringify(current(), null, 2)); showToast('JSON copiado'); },
      copyMd: async () => { await navigator.clipboard.writeText(toMarkdown(current())); showToast('Markdown copiado'); },
      dlBrief: () => {
        const d = current();
        const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const slug = (d.cliente || (scopeKeys && scopeKeys[0]) || 'brief').toLowerCase()
          .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'brief';
        a.href = url;
        a.download = `${slug}-pixer-admira-${d.meta.version}.json`;
        a.click();
        URL.revokeObjectURL(url);
      },
      clearAll: () => {
        const store = loadStore();
        if (scopeKeys && scopeKeys.length === 1 && scopeKeys[0] !== 'all') {
          delete store[scopeKeys[0]];
        } else {
          for (const k of (scopeKeys || ['audio', 'musica', 'imagenes', 'video', 'cliente'])) {
            delete store[k];
          }
        }
        saveStore(store);
        document.querySelectorAll('input[type=text], select, textarea').forEach(el => { if (el.name) el.value = ''; });
        document.querySelectorAll('.chip input').forEach(i => { i.checked = false; i.closest('.chip')?.classList.remove('active'); });
        if (out) out.textContent = '// Rellena los campos y pulsa "Generar brief".';
        showToast('Limpiado');
      },
    };
    for (const [id, fn] of Object.entries(map)) {
      const btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', fn);
    }
  }

  function loadDemo(demo, chipDemo) {
    const store = loadStore();
    Object.entries(demo).forEach(([name, value]) => setNested(store, name, value));
    if (chipDemo) Object.entries(chipDemo).forEach(([name, vals]) => setNested(store, name, vals));
    saveStore(store);
    location.reload();
  }

  // Cliente field (compartido)
  function bindCliente() {
    const el = document.getElementById('proj-cliente');
    if (!el) return;
    const store = loadStore();
    if (store.cliente) el.value = store.cliente;
    el.addEventListener('input', () => {
      const s = loadStore();
      if (el.value.trim()) s.cliente = el.value.trim(); else delete s.cliente;
      saveStore(s);
    });
  }

  // Init por página
  document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('briefForm');
    if (form) {
      hydrate(form);
      bindPersistence(form);
      bindCliente();
      const out = document.getElementById('briefOut');
      const page = document.body.dataset.page;
      const scopeMap = {
        audio: ['audio'],
        musica: ['musica'],
        imagenes: ['imagenes'],
        video: ['video'],
        plataforma: ['audio', 'musica', 'imagenes', 'video'],
      };
      const scope = scopeMap[page] || null;
      if (out) bindBriefActions(out, scope);

      const demoBtn = document.getElementById('loadDemo');
      if (demoBtn && window.PIXER_DEMO) {
        demoBtn.addEventListener('click', () => loadDemo(window.PIXER_DEMO.fields, window.PIXER_DEMO.chips));
      }
    }
  });

  window.PIXER = { loadStore, saveStore, buildBrief, showToast };
})();
