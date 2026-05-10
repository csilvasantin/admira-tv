(function () {
  const STORAGE_KEY = 'pixer-brief-v.2026.05.02-r8';
  const VERSION = 'v.2026.05.02-r8';
  const COSTES_FECHA = '2026-05-02';

  // Catálogo de motores IA por sección.
  // Default = primer elemento (siempre el gratuito).
  const MOTORES = {
    audio: [
      { id: 'web-speech',    nombre: 'Web Speech API',     tipo: 'free', coste: 'gratis · navegador',     desc: 'TTS del sistema operativo' },
      { id: 'elevenlabs-v2', nombre: 'ElevenLabs v2',      tipo: 'pro',  coste: '$300 / 1M caracteres',   desc: 'voces ultrarrealistas, multilingüe' },
      { id: 'openai-tts-hd', nombre: 'OpenAI TTS HD',      tipo: 'pro',  coste: '$30 / 1M caracteres',    desc: 'multi-idioma, baja latencia' },
    ],
    musica: [
      { id: 'musicgen',  nombre: 'MusicGen (Meta)',  tipo: 'free', coste: 'gratis · open weights',     desc: 'self-host, hasta 30s' },
      { id: 'suno-v4',   nombre: 'Suno v4',          tipo: 'pro',  coste: '$8/mes · ~500 canciones',   desc: 'voces + instrumental' },
      { id: 'udio',      nombre: 'Udio Standard',    tipo: 'pro',  coste: '$10/mes · ~1200 créditos',  desc: 'piezas largas + control' },
    ],
    imagenes: [
      { id: 'flux-schnell', nombre: 'FLUX.1 [schnell]', tipo: 'free', coste: 'gratis · Pollinations', desc: 'open weights, rápido' },
      { id: 'midjourney-v6', nombre: 'Midjourney v6',   tipo: 'pro',  coste: '$30/mes · ~$0.05/img',   desc: 'estética editorial' },
      { id: 'dalle-3-hd',   nombre: 'DALL·E 3 HD',      tipo: 'pro',  coste: '$0.08 / imagen 1024px',  desc: 'control de prompt fino' },
    ],
    video: [
      { id: 'svd',           nombre: 'Stable Video Diffusion', tipo: 'free', coste: 'gratis · open weights',  desc: 'self-host, clips cortos' },
      { id: 'runway-gen3',   nombre: 'Runway Gen-3 Alpha',     tipo: 'pro',  coste: '$0.05 / segundo',         desc: 'video 1080p, 5–10s' },
      { id: 'sora-openai',   nombre: 'Sora (OpenAI)',          tipo: 'pro',  coste: 'Plus $20/mes · Pro $200', desc: 'narrativa larga, hasta 1min' },
    ],
  };

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

  // Render del selector de motor IA en placeholders [data-motor-section="<seccion>"]
  function renderMotorSelectors() {
    document.querySelectorAll('[data-motor-section]').forEach(host => {
      const seccion = host.dataset.motorSection;
      const opciones = MOTORES[seccion];
      if (!opciones) return;
      const store = loadStore();
      const selectedId = (store[seccion] && store[seccion].motor) || opciones[0].id;
      const groupName = `motor-${seccion}-${Math.random().toString(36).slice(2, 8)}`;
      const opts = opciones.map(o => `
        <div class="motor-opt">
          <input type="radio" id="${groupName}-${o.id}" name="${groupName}" value="${o.id}" ${o.id === selectedId ? 'checked' : ''}>
          <label for="${groupName}-${o.id}">
            <span class="motor-name">${o.nombre}<span class="motor-tag ${o.tipo}">${o.tipo}</span></span>
            <span class="motor-cost">${o.coste}</span>
            <span class="motor-desc">${o.desc}</span>
          </label>
        </div>`).join('');
      host.innerHTML = `
        <div class="motor-section" data-section="${seccion}">
          <div class="motor-head">
            <span class="motor-title">Motor IA · ${seccion}</span>
            <span class="motor-disclaimer">Costes orientativos a ${COSTES_FECHA}</span>
          </div>
          <div class="motor-grid">${opts}</div>
        </div>`;
      host.querySelectorAll('input[type=radio]').forEach(r => {
        r.addEventListener('change', () => {
          if (!r.checked) return;
          const s = loadStore();
          setNested(s, `${seccion}.motor`, r.value);
          saveStore(s);
        });
      });
      // Asegurar que el motor por defecto queda en store si no había nada
      if (!store[seccion] || !store[seccion].motor) {
        const s = loadStore();
        setNested(s, `${seccion}.motor`, opciones[0].id);
        saveStore(s);
      }
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

  // Render del catálogo de motores en placeholder [data-motor-catalog]
  function renderMotorCatalog() {
    document.querySelectorAll('[data-motor-catalog]').forEach(host => {
      const labels = { audio: 'Audio', musica: 'Música', imagenes: 'Imágenes', video: 'Video' };
      const html = Object.entries(MOTORES).map(([sec, opts]) => `
        <article class="module" style="padding: 18px;">
          <div class="module-head"><h3 style="margin:0;">${labels[sec] || sec}</h3><small>3 opciones</small></div>
          ${opts.map(o => `
            <div style="display:grid; grid-template-columns: auto 1fr auto; gap:10px; padding:8px 0; border-top:1px solid var(--line);">
              <span class="motor-tag ${o.tipo}" style="align-self:center;">${o.tipo}</span>
              <div>
                <div style="font-weight:700;">${o.nombre}</div>
                <div style="color:var(--muted); font-size:13px;">${o.desc}</div>
              </div>
              <span class="motor-cost" style="align-self:center; white-space:nowrap;">${o.coste}</span>
            </div>`).join('')}
        </article>`).join('');
      host.innerHTML = html;
    });
  }

  // Init por página
  document.addEventListener('DOMContentLoaded', () => {
    renderMotorSelectors();
    renderMotorCatalog();
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

  window.PIXER = { loadStore, saveStore, buildBrief, showToast, MOTORES };
})();
