(function () {
  const STORAGE_KEY = 'pixer-brief-v.2026.05.02-r35';
  const KEYS_STORE = 'pixer-keys';
  const VERSION = 'v.2026.05.02-r35';
  const COSTES_FECHA = '2026-05-02';
  const ELEVEN_WORKER_URL = 'https://pixer-eleven.csilvasantin.workers.dev';
  const XAI_WORKER_URL    = 'https://pixer-eleven.csilvasantin.workers.dev';

  // ─── API keys (localStorage) ───────────────────────────────────────
  function loadKeys() {
    try { return JSON.parse(localStorage.getItem(KEYS_STORE) || '{}'); }
    catch { return {}; }
  }
  function saveKeys(k) {
    try { localStorage.setItem(KEYS_STORE, JSON.stringify(k)); } catch {}
  }
  function hasKeyFor(motorId) {
    const k = loadKeys();
    if (motorId === 'elevenlabs-v2') return true; // proxied vía worker pixer-eleven
    if (motorId === 'grok-imagine-image' || motorId === 'grok-imagine-image-pro' || motorId === 'grok-imagine-video') return true; // proxied vía worker
    if (motorId === 'imagen-4.0-generate-001' || motorId === 'imagen-4.0-ultra-generate-001') return true; // Gemini API key
    if (motorId === 'all-images') return true; // composite, llama a varios motores
    if (motorId === 'veo-3.0-fast-generate-001' || motorId === 'veo-3.0-generate-001') return true; // Gemini API key
    if (motorId === 'suno-local' || motorId === 'suno-local-v45') return true; // depende del proxy local, se chequea aparte
    if (motorId === 'lyria-002' || motorId === 'lyria-3' || motorId === 'lyria-3-pro' || motorId === 'lyria-3-clip-preview' || motorId === 'lyria-3-pro-preview') return true; // proxied vía worker
    if (motorId === 'runway-gen3' || motorId === 'sora-openai' || motorId === 'openai-tts-hd' || motorId === 'dalle-3-hd') return false;
    return true;
  }
  function bindSettingsModal() {
    const dlg = document.getElementById('keysModal');
    const open = document.getElementById('openSettings');
    if (!dlg || !open) return;
    const inEL = document.getElementById('key-elevenlabs');
    const inELV = document.getElementById('key-elevenlabs-voice');
    const inX = document.getElementById('key-xai');
    function refresh() {
      const k = loadKeys();
      if (inEL) inEL.value = k.elevenlabs || '';
      if (inELV) inELV.value = k.elevenlabs_voice || '';
      if (inX) inX.value = k.xai || '';
    }
    open.addEventListener('click', () => { refresh(); dlg.showModal(); });
    document.getElementById('closeKeys')?.addEventListener('click', () => dlg.close());
    document.getElementById('saveKeys')?.addEventListener('click', () => {
      const k = {
        elevenlabs: inEL?.value.trim() || undefined,
        elevenlabs_voice: inELV?.value.trim() || undefined,
        xai: inX?.value.trim() || undefined,
      };
      saveKeys(k);
      showToast('Keys guardadas');
      dlg.close();
      renderMotorSelectors();
    });
    document.getElementById('clearKeys')?.addEventListener('click', () => {
      if (!confirm('¿Borrar todas las API keys de este navegador?')) return;
      localStorage.removeItem(KEYS_STORE);
      refresh();
      showToast('Keys borradas');
      renderMotorSelectors();
    });
  }

  // Defaults por sección. Se aplican solo si la sección está vacía en localStorage.
  const DEFAULTS = {
    cliente: 'AdmiraNext',
    audio: {
      personaje: 'Voz adulta cálida',
      idioma: 'Espanol (ES)',
      tono: 'Cercano',
      ritmo: '8s, ritmo medio',
      guion: 'Esto es una prueba',
      cta: 'Visita admira.xp',
    },
    musica: {
      bpm: '92',
      tonalidad: 'C menor',
      versiones: 'Loop 8s · Stinger 2s',
      uso: 'Bed de menú + stinger de cierre',
      emocion: ['Calma', 'Marca'],
      capas: ['Base', 'Pad'],
    },
    imagenes: {
      paleta: 'Verde fósforo + negro profundo',
      encuadre: 'Cuadrado 1:1',
      luz: 'Atardecer suave, contraste medio',
      realismo: 'Foto realista',
      prompt: 'Una pantalla de terminal vintage estilo Matrix con código verde cayendo, luz cinematográfica',
      assets: '1 imagen 1024x1024',
    },
    video: {
      hook: 'Una pregunta directa al espectador en 3 segundos',
      desarrollo: 'Mostrar producto con planos cortos y cierre con logo',
      cierre: 'Logo + claim',
      cta: 'Visita admira.xp',
      canal: 'Reel vertical 9:16',
      duracion: '15s',
      reusa: ['audio', 'musica'],
    },
  };

  function applyDefaults() {
    const store = loadStore();
    let changed = false;
    // Migracion: el default antiguo era 'Demo Pixer.ai'. Si nadie lo edito,
    // lo movemos al nuevo default de marca 'AdmiraNext' (el separador "//"
    // se aplica via deriveAssetTitle, no aqui).
    if (!store.cliente || store.cliente === 'Demo Pixer.ai') { store.cliente = DEFAULTS.cliente; changed = true; }
    for (const key of ['audio', 'musica', 'imagenes', 'video']) {
      if (!store[key] || Object.keys(store[key]).length === 0) {
        store[key] = JSON.parse(JSON.stringify(DEFAULTS[key]));
        changed = true;
      }
    }
    if (changed) saveStore(store);
  }

  // Catálogo de motores IA por sección.
  // Default = primer elemento (siempre el gratuito).
  const MOTORES = {
    audio: [
      { id: 'web-speech',    nombre: 'Web Speech API',     tipo: 'free', coste: 'gratis · navegador',     desc: 'TTS del sistema operativo' },
      { id: 'elevenlabs-v2', nombre: 'ElevenLabs v2',      tipo: 'pro',  coste: '$300 / 1M caracteres',   desc: 'voces ultrarrealistas, multilingüe' },
      { id: 'openai-tts-hd', nombre: 'OpenAI TTS HD',      tipo: 'pro',  coste: '$30 / 1M caracteres',    desc: 'multi-idioma, baja latencia' },
    ],
    musica: [
      { id: 'pixer-loop',           nombre: 'Pixer Loop (Web Audio)', tipo: 'free', coste: 'gratis · navegador',  desc: 'pentatónica Cm in-browser' },
      { id: 'lyria-3-pro-preview',  nombre: 'Lyria 3 Pro (Google)',   tipo: 'pro',  coste: 'paid tier Gemini',    desc: '~2min con voz cantando la letra' },
      { id: 'suno-local-v45',       nombre: 'Suno v4.5 (local)',      tipo: 'pro',  coste: '~10 créditos / canción · cuenta loguead.', desc: 'chirp-v4-5 · calidad superior · vía proxy suno-local' },
    ],
    imagenes: [
      { id: 'flux-schnell',                  nombre: 'FLUX.1 [schnell]',        tipo: 'free', badge: 'Good',   coste: 'gratis · Pollinations', desc: 'open weights, rápido' },
      { id: 'imagen-4.0-ultra-generate-001', nombre: 'Imagen 4 Ultra (Google)', tipo: 'pro',  badge: 'Better', coste: '$0.06 / imagen 2K',     desc: 'máxima calidad · hasta 2K' },
      { id: 'grok-imagine-image-pro',        nombre: 'Grok Imagine Pro (xAI)',  tipo: 'pro',  badge: 'Best',   coste: '$0.07 / imagen',        desc: 'mayor calidad · vía worker' },
    ],
    video: [
      { id: 'pixer-storyboard',     nombre: 'Pixer Storyboard',   tipo: 'free', badge: 'Good',   coste: 'gratis · navegador',  desc: '3 escenas + crossfade + voz' },
      { id: 'runway-gen3',          nombre: 'Runway Gen-3 Alpha', tipo: 'pro',  badge: 'Better', coste: '$0.05 / segundo',     desc: 'video 1080p · requiere backend (sin CORS)' },
      { id: 'veo-3.0-generate-001', nombre: 'Veo 3 (Google)',     tipo: 'pro',  badge: 'Best',   coste: '~$0.40 / segundo',    desc: '720p/1080p · audio + diálogos' },
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
      // imagenes admite multi-select: click cada motor para añadir/quitar.
      // Para comparar 2-3 motores en paralelo basta con marcar varias.
      const isMulti = (seccion === 'imagenes');
      const inputType = isMulti ? 'checkbox' : 'radio';
      let selected;
      if (isMulti) {
        const m = store[seccion] && store[seccion].motors;
        if (Array.isArray(m) && m.length) {
          selected = m.filter(id => opciones.some(o => o.id === id));
        }
        if (!selected || !selected.length) {
          const single = (store[seccion] && store[seccion].motor) || opciones[0].id;
          selected = [opciones.some(o => o.id === single) ? single : opciones[0].id];
        }
      } else {
        selected = [(store[seccion] && store[seccion].motor) || opciones[0].id];
      }
      const groupName = `motor-${seccion}-${Math.random().toString(36).slice(2, 8)}`;
      const opts = opciones.map(o => {
        const badgeText = o.badge || o.tipo;
        const badgeCls = (o.badge ? o.badge : o.tipo).toLowerCase();
        return `
        <div class="motor-opt">
          <input type="${inputType}" id="${groupName}-${o.id}" name="${groupName}" value="${o.id}" ${selected.includes(o.id) ? 'checked' : ''}>
          <label for="${groupName}-${o.id}">
            <span class="motor-name">${o.nombre}<span class="motor-tag ${o.tipo} ${badgeCls}">${badgeText}</span></span>
            <span class="motor-cost">${o.coste}</span>
            <span class="motor-desc">${o.desc}</span>
          </label>
        </div>`;
      }).join('');
      const titleHint = isMulti
        ? '<span style="color:#75aab9;font-weight:normal;font-size:11px;margin-left:8px">· multi-click para comparar</span>'
        : '';
      host.innerHTML = `
        <div class="motor-section" data-section="${seccion}">
          <div class="motor-head">
            <span class="motor-title">Motor IA · ${seccion}${titleHint}</span>
            <span class="motor-disclaimer">Costes orientativos a ${COSTES_FECHA}</span>
          </div>
          <div class="motor-grid">${opts}</div>
          <div class="motor-warning" data-warning hidden></div>
        </div>`;
      function renderWarning() {
        const wrap = host.querySelector('[data-warning]');
        if (!wrap) return;
        const motor = opciones.find(o => o.id === ((loadStore()[seccion] && loadStore()[seccion].motor) || opciones[0].id));
        if (!motor || motor.tipo !== 'pro') { wrap.hidden = true; wrap.innerHTML = ''; return; }
        const ok = hasKeyFor(motor.id);
        const keyLabel = motor.id === 'elevenlabs-v2' ? 'WORKER pixer-eleven'
                       : (motor.id === 'grok-imagine-image' || motor.id === 'grok-imagine-image-pro' || motor.id === 'grok-imagine-video') ? 'WORKER pixer-eleven'
                       : (motor.id === 'suno-local' || motor.id === 'suno-local-v45') ? 'PROXY suno-local:3777'
                       : (motor.id === 'lyria-002' || motor.id === 'lyria-3' || motor.id === 'lyria-3-pro' || motor.id === 'lyria-3-clip-preview' || motor.id === 'lyria-3-pro-preview') ? 'WORKER pixer-eleven (GCP)'
                       : (motor.id.startsWith('imagen-') || motor.id.startsWith('veo-')) ? 'WORKER pixer-eleven (Gemini)'
                       : (motor.id === 'runway-gen3' || motor.id === 'sora-openai' || motor.id === 'openai-tts-hd' || motor.id === 'dalle-3-hd') ? 'BACKEND_REQUERIDO'
                       : 'API_KEY';
        wrap.hidden = false;
        wrap.innerHTML = `
          <span class="warn-icon">⚠</span>
          <strong>${motor.nombre}</strong> es de pago — consume tokens (${motor.coste}).
          ${ok
            ? `<span class="warn-ok">[ KEY ${keyLabel} configurada ]</span>`
            : `<span class="warn-missing">[ FALTA ${keyLabel} · pulsa <a href="#" data-open-keys>⚙ KEYS</a> ]</span>`}`;
        wrap.querySelector('[data-open-keys]')?.addEventListener('click', (e) => {
          e.preventDefault();
          document.getElementById('openSettings')?.click();
        });
      }
      host.querySelectorAll('input').forEach(r => {
        r.addEventListener('change', () => {
          const s = loadStore();
          if (isMulti) {
            const all = Array.from(host.querySelectorAll('input:checked')).map(x => x.value);
            // Garantiza al menos 1 seleccionado: si el usuario desmarcó el último, lo re-marcamos.
            if (all.length === 0) { r.checked = true; return; }
            setNested(s, `${seccion}.motors`, all);
            // Mantener s.motor como el primero seleccionado para back-compat con paths
            // antiguos del store (briefs persistidos antes de la multi-select).
            setNested(s, `${seccion}.motor`, all[0]);
          } else {
            if (!r.checked) return;
            setNested(s, `${seccion}.motor`, r.value);
          }
          saveStore(s);
          renderWarning();
        });
      });
      renderWarning();
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
    lines.push('# Brief Pixer.ia x Admira.xp');
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

  // ─── Reproductores por sección ─────────────────────────────────────
  function getPlayer() {
    return document.getElementById('player');
  }
  function showPlayer(html) {
    const p = getPlayer();
    if (!p) return;
    p.hidden = false;
    p.innerHTML = html;
  }

  // Genera el HTML de una barra de progreso (indeterminada por defecto).
  // expectedMs: opcional; si lo pasas, ETA = max(0, expectedMs - elapsed).
  function progressHtml(label, id, expectedMs) {
    return `
      <div class="pixer-progress" data-progress-id="${id}" ${expectedMs ? `data-expected="${expectedMs}"` : ''}>
        <div class="pixer-progress-bar"><div class="pixer-progress-fill"></div></div>
        <div class="pixer-progress-status">
          <span class="left" data-progress-label>${label}</span>
          <span class="right" data-progress-time>0s</span>
        </div>
      </div>`;
  }
  function startProgress(id) {
    const el = document.querySelector(`[data-progress-id="${id}"]`);
    if (!el) return () => {};
    const t0 = Date.now();
    const expected = parseInt(el.dataset.expected || '0', 10);
    const fill = el.querySelector('.pixer-progress-fill');
    const bar = el.querySelector('.pixer-progress-bar');
    const time = el.querySelector('[data-progress-time]');
    if (expected) bar.classList.add('determinate');
    const tick = setInterval(() => {
      const elapsed = (Date.now() - t0) / 1000;
      if (time) time.textContent = `${elapsed.toFixed(0)}s`;
      if (expected && fill) {
        const pct = Math.min(95, (elapsed * 1000 / expected) * 100);
        fill.style.width = pct + '%';
      }
    }, 250);
    return function stop(success = true) {
      clearInterval(tick);
      if (fill && success) fill.style.width = '100%';
    };
  }
  function setProgressLabel(id, text) {
    const el = document.querySelector(`[data-progress-id="${id}"] [data-progress-label]`);
    if (el) el.textContent = text;
  }

  const LANG_MAP = {
    'Espanol (ES)': 'es-ES',
    'Espanol (LATAM)': 'es-MX',
    'Catalan': 'ca-ES',
    'Ingles (UK)': 'en-GB',
    'Ingles (US)': 'en-US',
    'Frances': 'fr-FR',
    'Aleman': 'de-DE',
    'Portugues': 'pt-PT',
  };

  function confirmPro(motor, coste) {
    return confirm(`⚠ ${motor} es DE PAGO y consumirá tokens (${coste}).\n\n¿Continuar con la reproducción real?`);
  }

  async function playAudio() {
    const s = loadStore().audio || {};
    const text = (s.guion || 'Esto es una prueba').trim();
    const motor = s.motor || 'web-speech';
    const keys = loadKeys();

    if (motor === 'elevenlabs-v2') {
      if (!confirmPro('ElevenLabs v2', '$300 / 1M caracteres · vía worker pixer-eleven')) return;
      const voiceId = keys.elevenlabs_voice || 'EXAVITQu4vr4xnSDxMaL';
      showPlayer(`
        <div class="player-card">
          <div class="player-head">▶ AUDIO · ElevenLabs v2 · voice ${voiceId}</div>
          ${progressHtml('Generando audio en ElevenLabs...', 'eleven', 8000)}
        </div>`);
      const stopElevenProg = startProgress('eleven');
      try {
        const r = await fetch(ELEVEN_WORKER_URL + '/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            voice_id: voiceId,
            model_id: 'eleven_multilingual_v2',
            voice_settings: { stability: 0.5, similarity_boost: 0.75 },
          }),
        });
        if (!r.ok) {
          stopElevenProg(false);
          let err = '';
          try { err = JSON.stringify(await r.json()); } catch { err = await r.text(); }
          showPlayer(`<div class="player-card"><div class="player-head">▶ AUDIO · ElevenLabs · ERROR ${r.status}</div><pre class="player-body">${err.replace(/</g,'&lt;').slice(0,400)}</pre></div>`);
          return;
        }
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        stopElevenProg(true);
        const audioTitle = deriveAssetTitle('audio', loadStore());
        const audioCover = pollinationsCoverFor('audio', loadStore());
        showPlayer(`
          <div class="player-card">
            <div class="player-head">▶ AUDIO · ElevenLabs v2 · voice ${voiceId}</div>
            <pre class="player-body">"${text.replace(/</g,'&lt;')}"</pre>
            ${audioCover ? `<img src="${escAttr(audioCover)}" style="width:100%;max-height:240px;object-fit:cover;border:1px solid var(--matrix);box-shadow:0 0 12px rgba(0,255,65,.3);">` : ''}
            <audio controls autoplay src="${url}" data-pixer-title="${escAttr(audioTitle)}"${audioCover ? ` data-pixer-cover="${escAttr(audioCover)}"` : ''} style="width:100%;"></audio>
            <small class="player-foot">// ${text.length} caracteres · ~$${(text.length * 0.0003).toFixed(4)} · vía worker</small>
          </div>`);
      } catch (e) {
        stopElevenProg(false);
        showPlayer(`<div class="player-card"><div class="player-head">▶ AUDIO · ERROR</div><pre class="player-body">${String(e).replace(/</g,'&lt;')}</pre></div>`);
      }
      return;
    }

    if (motor === 'openai-tts-hd') {
      showPlayer('<p class="player-msg">⚠ OpenAI TTS HD requiere backend (no permite CORS desde navegador). Usa ElevenLabs o el motor gratuito.</p>');
      return;
    }

    // Default: web-speech (gratis)
    if (!('speechSynthesis' in window)) {
      showPlayer('<p class="player-msg">⚠ Tu navegador no soporta speechSynthesis.</p>');
      return;
    }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = LANG_MAP[s.idioma] || 'es-ES';
    u.rate = 1.0; u.pitch = 1.0; u.volume = 1.0;
    const voices = speechSynthesis.getVoices();
    const v = voices.find(v => v.lang === u.lang) || voices.find(v => v.lang.startsWith(u.lang.split('-')[0]));
    if (v) u.voice = v;
    showPlayer(`
      <div class="player-card">
        <div class="player-head">▶ AUDIO · Web Speech · ${u.lang}${v ? ' · ' + v.name : ''}</div>
        <pre class="player-body">"${text.replace(/</g,'&lt;')}"</pre>
        <small class="player-foot">// Reproducción local con Web Speech API · gratis · sin red</small>
      </div>`);
    speechSynthesis.speak(u);
  }

  let _musicCtx = null, _musicNodes = [];
  function stopMusic() {
    _musicNodes.forEach(n => { try { n.stop(); } catch {} try { n.disconnect(); } catch {} });
    _musicNodes = [];
  }
  // suno-local: localhost cuando la pagina sirve por http://, o Funnel publica
  // (https://macmini.tail48b61c.ts.net/suno) cuando vivimos en GitHub Pages — el
  // navegador bloquea fetch http://localhost desde paginas https:// por mixed-content.
  const SUNO_LOCAL_URL = (location.protocol === 'http:'
      || location.hostname === 'localhost'
      || location.hostname === '127.0.0.1')
    ? 'http://127.0.0.1:3777'
    : 'https://macmini.tail48b61c.ts.net/suno';

  async function sunoLocalAlive() {
    try {
      const r = await fetch(SUNO_LOCAL_URL + '/healthz', { method: 'GET' });
      if (!r.ok) return { ok: false, error: 'http ' + r.status };
      return await r.json();
    } catch (e) {
      return { ok: false, error: 'unreachable: arranca suno-local en el Mac Mini (./suno-local/start-suno-local.sh)' };
    }
  }

  async function playSunoLocal(s, model) {
    const guion = [
      s.uso, s.tonalidad && `tonalidad ${s.tonalidad}`, s.bpm && `${s.bpm}bpm`,
      ...(Array.isArray(s.emocion) ? s.emocion : []),
      ...(Array.isArray(s.capas) ? s.capas : []),
    ].filter(Boolean).join(', ');
    const prompt = guion || 'matrix synthwave, ambient, electronic';
    const lyrics = (s.letra || '').trim();
    // Si hay letra escrita la enviamos en custom mode (Suno usa el campo prompt
    // como letra y tags como estilo). Sin letra, instrumental segun "versiones".
    const isInstrumental = lyrics ? false : (!s.versiones || /instrumental|loop|bed/i.test(s.versiones));
    const titleHint = (s.cliente || s.uso || '').slice(0, 60);

    const health = await sunoLocalAlive();
    if (!health.ok) {
      showPlayer(`<div class="player-card"><div class="player-head">▶ MÚSICA · Suno · proxy NO responde (${SUNO_LOCAL_URL})</div><pre class="player-body">${health.error}\n\nArranca en el Mac Mini:\n  cd ~/GitHub/01.-AdmiraXperience-Game/suno-local\n  ./start-suno-local.sh</pre></div>`);
      return;
    }
    if (!confirmPro('Suno (local)', `~2 canciones · créditos restantes: ${health.total_credits_left}`)) return;

    showPlayer(`
      <div class="player-card">
        <div class="player-head">▶ MÚSICA · Suno ${model.replace('chirp-','')} · ${prompt.slice(0,60)}</div>
        ${progressHtml('Enviando prompt a Suno...', 'suno', 60000)}
      </div>`);
    const stop = startProgress('suno');
    try {
      const r = await fetch(SUNO_LOCAL_URL + '/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, lyrics, title: titleHint, instrumental: isInstrumental, model }),
      });
      if (!r.ok) {
        stop(false);
        const err = await r.text();
        showPlayer(`<div class="player-card"><div class="player-head">▶ MÚSICA · Suno · ERROR ${r.status}</div><pre class="player-body">${err.slice(0,500)}</pre></div>`);
        return;
      }
      const data = await r.json();
      const clipIds = (data.clips || []).map(c => c.id).filter(Boolean);
      if (!clipIds.length) {
        stop(false);
        showPlayer(`<div class="player-card"><div class="player-head">▶ MÚSICA · Suno · sin clips</div><pre class="player-body">${JSON.stringify(data).slice(0,400)}</pre></div>`);
        return;
      }
      setProgressLabel('suno', `Generando · clips ${clipIds.map(id=>id.slice(0,6)).join(', ')}`);
      // Polling
      let attempt = 0;
      while (true) {
        await new Promise(r => setTimeout(r, 5000));
        attempt++;
        const pollR = await fetch(`${SUNO_LOCAL_URL}/status?ids=${clipIds.join(',')}`);
        const clips = await pollR.json();
        const ready = clips.filter(c => c.audio_url && c.status === 'streaming' || c.status === 'complete');
        setProgressLabel('suno', `Suno · intento ${attempt} · ${ready.length}/${clips.length} listos`);
        if (ready.length >= 1) {
          stop(true);
          const briefTitle = deriveAssetTitle('musica', loadStore());
          showPlayer(`
            <div class="player-card">
              <div class="player-head">▶ MÚSICA · Suno (${model.replace('chirp-','')}) · ${ready.length}/${clips.length} clips</div>
              ${ready.map((c, i) => {
                const cTitle = (c.title && c.title.trim()) || briefTitle || `Suno ${i + 1}`;
                const cover = c.image_large_url || c.image_url || '';
                const dur = (c.metadata && (c.metadata.duration_formatted || c.metadata.duration)) || '';
                // Suno devuelve video_url (mp4 con cover estatico + audio embebido):
                // lo preferimos porque al enviarlo a Pixer Feed lleva caratula sin
                // depender del worker. Si solo hay audio_url, fallback a audio + img.
                if (c.video_url) {
                  return `
                <div style="display:grid;gap:6px;margin-bottom:10px;">
                  <strong style="color:var(--matrix);text-shadow:var(--glow);">[${i + 1}] ${escAttr(cTitle)} · ${dur}</strong>
                  <video controls src="${c.video_url}"${cover ? ` poster="${escAttr(cover)}"` : ''} data-pixer-title="${escAttr(cTitle)}"${cover ? ` data-pixer-cover="${escAttr(cover)}"` : ''} style="width:100%;max-height:55vh;border:1px solid var(--matrix);box-shadow:0 0 12px rgba(0,255,65,.3);"></video>
                </div>`;
                }
                return `
                <div style="display:grid;gap:6px;margin-bottom:10px;">
                  <strong style="color:var(--matrix);text-shadow:var(--glow);">[${i + 1}] ${escAttr(cTitle)} · ${dur}</strong>
                  ${cover ? `<img src="${escAttr(cover)}" style="width:100%;max-height:240px;object-fit:cover;border:1px solid var(--matrix);box-shadow:0 0 12px rgba(0,255,65,.3);">` : ''}
                  <audio controls src="${c.audio_url}" data-pixer-title="${escAttr(cTitle)}"${cover ? ` data-pixer-cover="${escAttr(cover)}"` : ''} style="width:100%;"></audio>
                </div>`;
              }).join('')}
              <small class="player-foot">// Suno · ${prompt.slice(0,80)}</small>
            </div>`);
          return;
        }
        if (attempt > 60) { // 5 min cap
          stop(false);
          showPlayer(`<div class="player-card"><div class="player-head">▶ MÚSICA · Suno · TIMEOUT</div><pre class="player-body">clips: ${clipIds.join(', ')}</pre></div>`);
          return;
        }
      }
    } catch (e) {
      stop(false);
      showPlayer(`<div class="player-card"><div class="player-head">▶ MÚSICA · Suno · ERROR</div><pre class="player-body">${String(e)}</pre></div>`);
    }
  }

  // Traducciones ES→EN para Lyria (que solo acepta inglés)
  const EMO_EN = { Calma:'calm', Tension:'tense', Descubrimiento:'discovery', Celebracion:'celebratory', Marca:'brand identity', Transicion:'transition' };
  const CAPA_EN = { Base:'bass', Percusion:'percussion', Melodia:'melody', Stinger:'stinger', Pad:'pad', Bed:'bed' };

  // Categorías de tempo abstractas (Lyria rechaza bpm exactos por recitation checks)
  function tempoLabel(bpm) {
    const n = parseInt(bpm, 10);
    if (!n) return 'medium tempo';
    if (n < 70) return 'slow tempo';
    if (n < 100) return 'relaxed tempo';
    if (n < 130) return 'moderate tempo';
    return 'energetic tempo';
  }

  async function playLyria(s, model) {
    const moods = (Array.isArray(s.emocion) ? s.emocion.map(e => EMO_EN[e] || e.toLowerCase()) : []);
    const layers = (Array.isArray(s.capas) ? s.capas.map(c => CAPA_EN[c] || c.toLowerCase()) : []);
    const parts = [
      'instrumental ambient soundscape',
      tempoLabel(s.bpm),
      ...moods,
      layers.length ? `featuring ${layers.join(' and ')}` : '',
      'evolving textures, atmospheric',
    ].filter(Boolean);
    const prompt = parts.join(', ');

    if (!confirmPro('Lyria 2 (Google)', '~$0.06 por sample · vía worker pixer-eleven (GCP)')) return;
    showPlayer(`
      <div class="player-card">
        <div class="player-head">▶ MÚSICA · Lyria 2 (Google) · ${prompt.slice(0, 60)}</div>
        ${progressHtml('Generando música con Lyria 2...', 'lyria', 12000)}
      </div>`);
    const stop = startProgress('lyria');
    try {
      const r = await fetch(ELEVEN_WORKER_URL + '/lyria/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, model }),
      });
      if (!r.ok) {
        stop(false);
        const err = await r.text();
        showPlayer(`<div class="player-card"><div class="player-head">▶ MÚSICA · Lyria · ERROR ${r.status}</div><pre class="player-body">${err.replace(/</g,'&lt;').slice(0,500)}</pre></div>`);
        return;
      }
      const data = await r.json();
      const b64 = data?.predictions?.[0]?.bytesBase64Encoded;
      if (!b64) {
        stop(false);
        showPlayer(`<div class="player-card"><div class="player-head">▶ MÚSICA · Lyria · sin audio</div><pre class="player-body">${JSON.stringify(data).replace(/</g,'&lt;').slice(0,400)}</pre></div>`);
        return;
      }
      // Convertir base64 a Blob WAV
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      stop(true);
      const lyriaTitle = deriveAssetTitle('musica', loadStore());
      const lyriaCover = pollinationsCoverFor('musica', loadStore());
      showPlayer(`
        <div class="player-card">
          <div class="player-head">▶ MÚSICA · Lyria 2 (Google) · WAV 48kHz estéreo</div>
          ${lyriaCover ? `<img src="${escAttr(lyriaCover)}" style="width:100%;max-height:240px;object-fit:cover;border:1px solid var(--matrix);box-shadow:0 0 12px rgba(0,255,65,.3);">` : ''}
          <audio controls autoplay src="${url}" data-pixer-title="${escAttr(lyriaTitle)}"${lyriaCover ? ` data-pixer-cover="${escAttr(lyriaCover)}"` : ''} style="width:100%;"></audio>
          <pre class="player-body">${prompt.replace(/</g,'&lt;')}</pre>
          <a class="btn" download="lyria-${Date.now()}.wav" href="${url}">⬇ Descargar WAV</a>
          <small class="player-foot">// Vertex AI · ${(bytes.length / 1024 / 1024).toFixed(1)} MB · vía worker</small>
        </div>`);
    } catch (e) {
      stop(false);
      showPlayer(`<div class="player-card"><div class="player-head">▶ MÚSICA · Lyria · ERROR</div><pre class="player-body">${String(e)}</pre></div>`);
    }
  }

  async function playLyria3(s, model) {
    const moods = (Array.isArray(s.emocion) ? s.emocion.map(e => EMO_EN[e] || e.toLowerCase()) : []);
    const layers = (Array.isArray(s.capas) ? s.capas.map(c => CAPA_EN[c] || c.toLowerCase()) : []);
    const styleParts = [
      'electronic music with vocals',
      tempoLabel(s.bpm),
      ...moods,
      layers.length ? `featuring ${layers.join(' and ')}` : '',
    ].filter(Boolean);
    const prompt = styleParts.join(', ');
    const lyrics = (s.letra || '').trim();
    const isPro = model === 'lyria-3-pro-preview';
    const label = isPro ? 'Lyria 3 Pro' : 'Lyria 3 Clip';

    if (!lyrics) {
      const ok = confirm(`No has generado letra todavía. ${label} CON letra suena cantando; sin letra cantará improvisando.\n\n¿Continuar igual?`);
      if (!ok) return;
    }
    if (!confirmPro(label + ' (Google)', `paid tier Gemini · vía worker pixer-eleven`)) return;

    showPlayer(`
      <div class="player-card">
        <div class="player-head">▶ MÚSICA · ${label} (Google) · ${prompt.slice(0, 60)}</div>
        ${progressHtml('Generando música con voz...', 'lyria3', isPro ? 60000 : 25000)}
      </div>`);
    const stop = startProgress('lyria3');
    try {
      const r = await fetch(ELEVEN_WORKER_URL + '/lyria3/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, lyrics, model }),
      });
      if (!r.ok) {
        stop(false);
        const err = await r.text();
        showPlayer(`<div class="player-card"><div class="player-head">▶ MÚSICA · ${label} · ERROR ${r.status}</div><pre class="player-body">${err.replace(/</g,'&lt;').slice(0,500)}</pre></div>`);
        return;
      }
      const data = await r.json();
      const b64 = data?.audio;
      if (!b64) {
        stop(false);
        showPlayer(`<div class="player-card"><div class="player-head">▶ MÚSICA · ${label} · sin audio</div><pre class="player-body">${JSON.stringify(data).slice(0,400)}</pre></div>`);
        return;
      }
      // base64 → Blob MP3
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: data.mimeType || 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      stop(true);
      const captionText = (data.text || '').replace(/</g,'&lt;');
      const l3Title = deriveAssetTitle('musica', loadStore());
      const l3Cover = pollinationsCoverFor('musica', loadStore());
      showPlayer(`
        <div class="player-card">
          <div class="player-head">▶ MÚSICA · ${label} (Google) · MP3 ${(bytes.length / 1024 / 1024).toFixed(1)} MB</div>
          ${l3Cover ? `<img src="${escAttr(l3Cover)}" style="width:100%;max-height:240px;object-fit:cover;border:1px solid var(--matrix);box-shadow:0 0 12px rgba(0,255,65,.3);">` : ''}
          <audio controls autoplay src="${url}" data-pixer-title="${escAttr(l3Title)}"${l3Cover ? ` data-pixer-cover="${escAttr(l3Cover)}"` : ''} style="width:100%;"></audio>
          ${captionText ? `<pre class="player-body">${captionText}</pre>` : ''}
          <a class="btn" download="lyria3-${Date.now()}.mp3" href="${url}">⬇ Descargar MP3</a>
          <small class="player-foot">// Vertex Gemini · ${model} · ${bytes.length} bytes</small>
        </div>`);
    } catch (e) {
      stop(false);
      showPlayer(`<div class="player-card"><div class="player-head">▶ MÚSICA · ${label} · ERROR</div><pre class="player-body">${String(e)}</pre></div>`);
    }
  }

  function playMusica() {
    const s = loadStore().musica || {};
    const motor = s.motor || 'pixer-loop';
    if (motor === 'suno-local')           return playSunoLocal(s, 'chirp-v4');
    if (motor === 'suno-local-v45')       return playSunoLocal(s, 'chirp-v4-5');
    if (motor === 'lyria-3-clip-preview') return playLyria3(s, 'lyria-3-clip-preview');
    if (motor === 'lyria-3-pro-preview')  return playLyria3(s, 'lyria-3-pro-preview');
    if (motor === 'lyria-002')            return playLyria(s, 'lyria-002');
    if (motor === 'lyria-3')              return playLyria(s, 'lyria-3');
    if (motor === 'lyria-3-pro')          return playLyria(s, 'lyria-3-pro');
    // default: Pixer Loop (Web Audio)
    const bpm = parseInt(s.bpm, 10) || 92;
    stopMusic();
    if (!window.AudioContext && !window.webkitAudioContext) {
      showPlayer('<p class="player-msg">⚠ AudioContext no disponible.</p>');
      return;
    }
    if (!_musicCtx) _musicCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = _musicCtx;
    const now = ctx.currentTime;
    // Cmin pentatonic: C Eb F G Bb (Hz)
    const notes = [261.63, 311.13, 349.23, 392.00, 466.16, 523.25];
    const beat = 60 / bpm;
    const totalBeats = 16;
    const master = ctx.createGain();
    master.gain.value = 0.18;
    master.connect(ctx.destination);
    _musicNodes.push(master);
    // Pad sostenido
    const pad = ctx.createOscillator();
    pad.type = 'sine'; pad.frequency.value = 130.81;
    const padG = ctx.createGain(); padG.gain.value = 0;
    padG.gain.linearRampToValueAtTime(0.10, now + 0.4);
    padG.gain.linearRampToValueAtTime(0, now + beat * totalBeats);
    pad.connect(padG).connect(master);
    pad.start(now); pad.stop(now + beat * totalBeats + 0.1);
    _musicNodes.push(pad, padG);
    // Melodía
    for (let i = 0; i < totalBeats; i++) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = notes[Math.floor(Math.random() * notes.length)];
      const g = ctx.createGain();
      const t0 = now + i * beat;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.25, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + beat * 0.9);
      o.connect(g).connect(master);
      o.start(t0); o.stop(t0 + beat);
      _musicNodes.push(o, g);
    }
    showPlayer(`
      <div class="player-card">
        <div class="player-head">▶ MÚSICA · ${bpm} bpm · ${s.tonalidad || 'C menor'}</div>
        <pre class="player-body">// Loop generado in-browser con Web Audio API
// Pentatónica Cm · ${totalBeats} beats · ${(beat * totalBeats).toFixed(1)}s</pre>
        <button type="button" class="btn" id="stopMusic">■ Parar</button>
        <small class="player-foot">// Preview gratis · motores PRO requieren API key</small>
      </div>`);
    document.getElementById('stopMusic')?.addEventListener('click', stopMusic);
  }

  const ASPECT_IMAGEN = {
    'Vertical 9:16': '9:16',
    'Cuadrado 1:1': '1:1',
    'Horizontal 16:9': '16:9',
    'Banner 3:1': '16:9',
    'Mixto': '1:1',
  };

  async function playImagen(s, model, fullPrompt) {
    const isUltra = model === 'imagen-4.0-ultra-generate-001';
    const label = isUltra ? 'Imagen 4 Ultra' : 'Imagen 4';
    const cost = isUltra ? '$0.06 / imagen 2K' : '$0.04 / imagen';
    if (!confirmPro(label + ' (Google)', cost + ' · paid tier Gemini')) return;
    const aspectRatio = ASPECT_IMAGEN[s.encuadre] || '1:1';
    showPlayer(`
      <div class="player-card">
        <div class="player-head">▶ IMAGEN · ${label} (Google) · ${aspectRatio}</div>
        ${progressHtml(`Generando con ${label}...`, 'imagen', isUltra ? 12000 : 8000)}
      </div>`);
    const stop = startProgress('imagen');
    try {
      const r = await fetch(ELEVEN_WORKER_URL + '/imagen/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: fullPrompt, aspectRatio, numberOfImages: 1, model, ...(isUltra ? { imageSize: '2K' } : {}) }),
      });
      if (!r.ok) {
        stop(false);
        const err = await r.text();
        showPlayer(`<div class="player-card"><div class="player-head">▶ IMAGEN · ${label} · ERROR ${r.status}</div><pre class="player-body">${err.replace(/</g,'&lt;').slice(0,500)}</pre></div>`);
        return;
      }
      const data = await r.json();
      const b64 = data?.predictions?.[0]?.bytesBase64Encoded;
      if (!b64) {
        stop(false);
        showPlayer(`<div class="player-card"><div class="player-head">▶ IMAGEN · ${label} · sin imagen</div><pre class="player-body">${JSON.stringify(data).slice(0,400)}</pre></div>`);
        return;
      }
      stop(true);
      const url = `data:${data.predictions[0].mimeType || 'image/png'};base64,${b64}`;
      const imgTitle = deriveAssetTitle('imagenes', loadStore());
      showPlayer(`
        <div class="player-card">
          <div class="player-head">▶ IMAGEN · ${label} (Google) · ${aspectRatio}</div>
          <div class="player-img-wrap">
            <img class="player-img" src="${url}" alt="generada" data-pixer-title="${escAttr(imgTitle)}">
          </div>
          <pre class="player-body">${fullPrompt.replace(/</g,'&lt;')}</pre>
          <small class="player-foot">// Gemini API · ${cost}</small>
        </div>`);
    } catch (e) {
      stop(false);
      showPlayer(`<div class="player-card"><div class="player-head">▶ IMAGEN · ${label} · ERROR</div><pre class="player-body">${String(e)}</pre></div>`);
    }
  }

  // ─── Generadores atómicos para "comparar todas" ─────────────────
  // Cada uno devuelve {ok, url?, error?} sin renderizar UI.
  function genFluxUrl(fullPrompt, w, h) {
    const seed = Math.floor(Math.random() * 1e9);
    return `https://image.pollinations.ai/prompt/${encodeURIComponent(fullPrompt)}?width=${w}&height=${h}&seed=${seed}&nologo=true`;
  }
  async function genGrokRaw(fullPrompt, model) {
    try {
      const r = await fetch(XAI_WORKER_URL + '/xai/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: fullPrompt, n: 1, model }),
      });
      const data = await r.json();
      const url = data?.data?.[0]?.url;
      if (!r.ok || !url) return { ok: false, error: JSON.stringify(data).slice(0, 200) };
      return { ok: true, url };
    } catch (e) { return { ok: false, error: String(e) }; }
  }
  async function genImagenRaw(fullPrompt, aspectRatio, model) {
    try {
      const isUltra = model === 'imagen-4.0-ultra-generate-001';
      const r = await fetch(ELEVEN_WORKER_URL + '/imagen/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: fullPrompt, aspectRatio, numberOfImages: 1, model, ...(isUltra ? { imageSize: '2K' } : {}) }),
      });
      const data = await r.json();
      const b64 = data?.predictions?.[0]?.bytesBase64Encoded;
      if (!r.ok || !b64) return { ok: false, error: JSON.stringify(data).slice(0, 200) };
      return { ok: true, url: `data:${data.predictions[0].mimeType || 'image/png'};base64,${b64}` };
    } catch (e) { return { ok: false, error: String(e) }; }
  }

  // Compara N motores en paralelo, side-by-side. Recibe la lista de IDs
  // (de MOTORES.imagenes) seleccionados por el usuario via checkbox multi-select.
  async function compareSelectedImages(motorIds, s, fullPrompt, w, h) {
    const aspectRatio = ASPECT_IMAGEN[s.encuadre] || '1:1';
    // Tabla de fabricacion por motor → {label, cost, promise}
    const factory = {
      'flux-schnell':                  () => ({ label: 'FLUX schnell',     cost: 'gratis',  promise: Promise.resolve({ ok: true, url: genFluxUrl(fullPrompt, w, h) }) }),
      'imagen-4.0-ultra-generate-001': () => ({ label: 'Imagen 4 Ultra',   cost: '$0.06',   promise: genImagenRaw(fullPrompt, aspectRatio, 'imagen-4.0-ultra-generate-001') }),
      'grok-imagine-image-pro':        () => ({ label: 'Grok Imagine Pro', cost: '$0.07',   promise: genGrokRaw(fullPrompt, 'grok-imagine-image-pro') }),
      // Fallbacks legacy por si el store conserva IDs antiguos:
      'imagen-4.0-generate-001':       () => ({ label: 'Imagen 4',         cost: '$0.04',   promise: genImagenRaw(fullPrompt, aspectRatio, 'imagen-4.0-generate-001') }),
      'grok-imagine-image':            () => ({ label: 'Grok Imagine',     cost: '$0.02',   promise: genGrokRaw(fullPrompt, 'grok-imagine-image') }),
    };
    const motors = motorIds
      .map(id => factory[id] ? Object.assign({ id }, factory[id]()) : null)
      .filter(Boolean);
    if (!motors.length) return;
    if (motors.some(m => /imagen|grok/i.test(m.label))) {
      const total = motors.reduce((a,m)=>a + (parseFloat((m.cost||'').replace('$','').replace(',','.'))||0), 0);
      if (!confirmPro('COMPARAR motores', motors.map(m=>m.label).join(' + ') + (total>0?(' (~$'+total.toFixed(2)+' total)'):''))) return;
    }
    const headerHint = motors.length>1 ? ' · click la imagen para elegir cual enviar' : '';
    showPlayer(`
      <div class="player-card">
        <div class="player-head">▶ COMPARAR · ${motors.length} motor${motors.length>1?'es':''} · ${aspectRatio}${headerHint}</div>
        <div class="compare-grid">
          ${motors.map(m => `
            <div class="compare-cell" data-cell="${m.id}" data-motor-label="${(typeof escAttr==='function')?escAttr(m.label):String(m.label).replace(/"/g,'&quot;')}">
              <div class="compare-cell-head"><strong>${m.label}</strong> <span style="opacity:.7">${m.cost}</span></div>
              <div class="compare-cell-img"><span class="compare-loading">// generando...</span></div>
            </div>`).join('')}
        </div>
        <pre class="player-body">${fullPrompt.replace(/</g,'&lt;')}</pre>
        <small class="player-foot">// ${motors.length} motor${motors.length>1?'es':''} en paralelo · resultados conforme lleguen</small>
      </div>`);

    // Click en una celda → la marca como seleccionada (única) para que
    // ENVIAR A ADMIRA XP recoja esa imagen via detectLatestAsset.
    document.querySelectorAll('.compare-cell[data-cell]').forEach(cellEl => {
      cellEl.addEventListener('click', () => {
        if (!cellEl.querySelector('.compare-cell-img img[src]')) return;
        document.querySelectorAll('.compare-cell.selected').forEach(c => c.classList.remove('selected'));
        cellEl.classList.add('selected');
      });
    });

    let firstSelected = false;
    motors.forEach(async m => {
      const t0 = Date.now();
      const res = await m.promise;
      const ms = Date.now() - t0;
      const cellWrap = document.querySelector(`[data-cell="${m.id}"]`);
      const cell = cellWrap && cellWrap.querySelector('.compare-cell-img');
      if (!cell) return;
      if (res && res.ok && res.url) {
        const cTitle = (typeof deriveAssetTitle==='function') ? deriveAssetTitle('imagenes', loadStore()) : (m.label);
        const safeTitle = (typeof escAttr==='function') ? escAttr(cTitle) : String(cTitle).replace(/"/g,'&quot;');
        cell.innerHTML = `<img src="${res.url}" alt="${m.label}" data-pixer-title="${safeTitle}" onload="this.parentElement.querySelector('.compare-time')?.remove()"><span class="compare-time">${(ms/1000).toFixed(1)}s</span>`;
        // Auto-selecciona la primera imagen que carga (default seleccionada).
        if (!firstSelected && motors.length > 1) {
          cellWrap.classList.add('selected');
          firstSelected = true;
        }
      } else {
        cell.innerHTML = `<div class="compare-error">⚠ ${(res && res.error || 'error').slice(0,100).replace(/</g,'&lt;')}</div>`;
      }
    });
  }

  async function compareAllImages(s, fullPrompt, w, h) {
    if (!confirmPro('TODAS las imágenes', '~$0.19 total · 5 motores en paralelo (Pollinations gratis + Imagen 4 + Imagen 4 Ultra + Grok + Grok Pro)')) return;
    const aspectRatio = ASPECT_IMAGEN[s.encuadre] || '1:1';
    const motors = [
      { id: 'flux',         label: 'FLUX schnell',     cost: 'gratis',      promise: Promise.resolve({ ok: true, url: genFluxUrl(fullPrompt, w, h) }) },
      { id: 'imagen',       label: 'Imagen 4',         cost: '$0.04',       promise: genImagenRaw(fullPrompt, aspectRatio, 'imagen-4.0-generate-001') },
      { id: 'imagen-ultra', label: 'Imagen 4 Ultra',   cost: '$0.06',       promise: genImagenRaw(fullPrompt, aspectRatio, 'imagen-4.0-ultra-generate-001') },
      { id: 'grok',         label: 'Grok Imagine',     cost: '$0.02',       promise: genGrokRaw(fullPrompt, 'grok-imagine-image') },
      { id: 'grok-pro',     label: 'Grok Imagine Pro', cost: '$0.07',       promise: genGrokRaw(fullPrompt, 'grok-imagine-image-pro') },
    ];
    showPlayer(`
      <div class="player-card">
        <div class="player-head">▶ COMPARAR · 5 motores · ${aspectRatio}</div>
        <div class="compare-grid">
          ${motors.map(m => `
            <div class="compare-cell" data-cell="${m.id}">
              <div class="compare-cell-head"><strong>${m.label}</strong> <span style="opacity:.7">${m.cost}</span></div>
              <div class="compare-cell-img"><span class="compare-loading">// generando...</span></div>
            </div>`).join('')}
        </div>
        <pre class="player-body">${fullPrompt.replace(/</g,'&lt;')}</pre>
        <small class="player-foot">// 5 motores en paralelo · resultados conforme lleguen</small>
      </div>`);
    motors.forEach(async m => {
      const t0 = Date.now();
      const res = await m.promise;
      const ms = Date.now() - t0;
      const cell = document.querySelector(`[data-cell="${m.id}"] .compare-cell-img`);
      if (!cell) return;
      if (res.ok && res.url) {
        cell.innerHTML = `<img src="${res.url}" alt="${m.label}" onload="this.parentElement.querySelector('.compare-time')?.remove()"><span class="compare-time">${(ms/1000).toFixed(1)}s</span>`;
      } else {
        cell.innerHTML = `<div class="compare-error">⚠ ${(res.error || 'error').slice(0,100).replace(/</g,'&lt;')}</div>`;
      }
    });
  }

  async function playImagenes() {
    const s = loadStore().imagenes || {};
    // Multi-select: leer s.motors (array) y caer a [s.motor] solo si no existe.
    const motorsList = Array.isArray(s.motors) && s.motors.length ? s.motors : [s.motor || 'flux-schnell'];
    const motor = motorsList[0]; // primario para single-render path
    const prompt = (s.prompt || 'Matrix terminal screen with green falling code').trim();
    const sizeMap = {
      'Vertical 9:16': [576, 1024],
      'Cuadrado 1:1': [768, 768],
      'Horizontal 16:9': [1024, 576],
      'Banner 3:1': [1200, 400],
      'Mixto': [768, 768],
    };
    const [w, h] = sizeMap[s.encuadre] || [768, 768];
    const styleHints = [s.realismo, s.luz, s.paleta].filter(Boolean).join(', ');
    const fullPrompt = styleHints ? `${prompt}, ${styleHints}` : prompt;
    const keys = loadKeys();

    // 2+ motores seleccionados → grid comparativa.
    if (motorsList.length > 1) {
      return compareSelectedImages(motorsList, s, fullPrompt, w, h);
    }

    // Compat con casos legacy donde el store tenia motor='all-images' antes
    // de eliminar el boton dedicado en r44.
    if (motor === 'all-images') {
      return compareSelectedImages(['flux-schnell','imagen-4.0-ultra-generate-001','grok-imagine-image-pro'], s, fullPrompt, w, h);
    }

    if (motor === 'imagen-4.0-generate-001' || motor === 'imagen-4.0-ultra-generate-001') {
      return playImagen(s, motor, fullPrompt);
    }

    if (motor === 'grok-imagine-image' || motor === 'grok-imagine-image-pro') {
      const isPro = motor === 'grok-imagine-image-pro';
      const label = isPro ? 'Grok Imagine Pro' : 'Grok Imagine';
      const cost = isPro ? '$0.07 / imagen' : '$0.02 / imagen';
      if (!confirmPro(label + ' (xAI)', cost + ' · vía worker pixer-eleven')) return;
      const expectedMs = isPro ? 8000 : 4000;
      showPlayer(`
        <div class="player-card">
          <div class="player-head">▶ IMAGEN · ${label} (xAI)</div>
          ${progressHtml(`Generando imagen con ${label}...`, 'grokimg', expectedMs)}
        </div>`);
      const stopGrokImg = startProgress('grokimg');
      try {
        const r = await fetch(XAI_WORKER_URL + '/xai/image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: fullPrompt, n: 1, model: motor }),
        });
        if (!r.ok) {
          stopGrokImg(false);
          const err = await r.text();
          showPlayer(`<div class="player-card"><div class="player-head">▶ IMAGEN · ${label} · ERROR ${r.status}</div><pre class="player-body">${err.replace(/</g,'&lt;').slice(0,500)}</pre></div>`);
          return;
        }
        const data = await r.json();
        const url = data?.data?.[0]?.url;
        const revised = data?.data?.[0]?.revised_prompt || fullPrompt;
        if (!url) {
          stopGrokImg(false);
          showPlayer(`<div class="player-card"><div class="player-head">▶ IMAGEN · ${label} · sin URL</div><pre class="player-body">${JSON.stringify(data).replace(/</g,'&lt;').slice(0,400)}</pre></div>`);
          return;
        }
        stopGrokImg(true);
        const grokImgTitle = deriveAssetTitle('imagenes', loadStore());
        showPlayer(`
          <div class="player-card">
            <div class="player-head">▶ IMAGEN · ${label} (xAI)</div>
            <div class="player-img-wrap">
              <img class="player-img" src="${url}" alt="generada" data-pixer-title="${escAttr(grokImgTitle)}">
            </div>
            <pre class="player-body">${revised.replace(/</g,'&lt;')}</pre>
            <small class="player-foot">// xAI ${label} · ${cost} · 1 imagen</small>
          </div>`);
      } catch (e) {
        stopGrokImg(false);
        showPlayer(`<div class="player-card"><div class="player-head">▶ IMAGEN · ERROR</div><pre class="player-body">${String(e).replace(/</g,'&lt;')}</pre></div>`);
      }
      return;
    }

    if (motor === 'dalle-3-hd') {
      showPlayer('<p class="player-msg">⚠ DALL·E 3 requiere backend (OpenAI no permite CORS desde navegador). Usa Pollinations o Grok.</p>');
      return;
    }

    // Default: Pollinations (free)
    const seed = Math.floor(Math.random() * 1e9);
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(fullPrompt)}?width=${w}&height=${h}&seed=${seed}&nologo=true`;
    const fluxTitle = deriveAssetTitle('imagenes', loadStore());
    showPlayer(`
      <div class="player-card">
        <div class="player-head">▶ IMAGEN · Pollinations · ${w}×${h} · seed ${seed}</div>
        <div class="player-img-wrap">
          <div class="player-loading">// generando imagen...</div>
          <img class="player-img" src="${url}" alt="generada" data-pixer-title="${escAttr(fluxTitle)}" onload="this.previousElementSibling.style.display='none'">
        </div>
        <pre class="player-body">${fullPrompt.replace(/</g,'&lt;')}</pre>
        <small class="player-foot">// Pollinations.ai · gratis · sin API key</small>
      </div>`);
  }

  function parseSeconds(str) {
    const m = String(str || '').match(/(\d+(?:\.\d+)?)/);
    return m ? Math.max(3, Math.min(60, parseFloat(m[1]))) : 15;
  }

  // Mapa canal → aspect_ratio del API de Grok
  const ASPECT_MAP = {
    'Reel vertical 9:16': '9:16',
    'YouTube 16:9': '16:9',
    'Demo producto 16:9': '16:9',
    'Pantalla evento 16:9': '16:9',
    'Carrusel cuadrado 1:1': '1:1',
  };

  async function playGrokVideo(s) {
    const duration = Math.max(1, Math.min(15, parseSeconds(s.duracion)));
    const aspect = ASPECT_MAP[s.canal] || '16:9';
    const guion = [s.hook, s.desarrollo, s.cierre, s.cta && `CTA: ${s.cta}`].filter(Boolean).join(' · ');
    const palette = (loadStore().imagenes && loadStore().imagenes.paleta) || 'cinematic';
    const prompt = `${guion}, ${palette}, cinematic, 35mm`;
    if (!confirmPro('Grok Imagine (xAI)', `~${duration}s a 720p · vía worker pixer-eleven`)) return;
    // Estimación: ~12s por segundo de video, mínimo 60s
    const expectedMs = Math.max(60000, duration * 12000);
    showPlayer(`
      <div class="player-card">
        <div class="player-head">▶ VIDEO · Grok Imagine · ${aspect} · ${duration}s · 720p</div>
        ${progressHtml('Enviando prompt al worker...', 'grokvid', expectedMs)}
      </div>`);
    const stopProg = startProgress('grokvid');
    try {
      const r = await fetch(XAI_WORKER_URL + '/xai/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, duration, aspect_ratio: aspect, resolution: '720p' }),
      });
      if (!r.ok) {
        stopProg(false);
        const err = await r.text();
        showPlayer(`<div class="player-card"><div class="player-head">▶ VIDEO · Grok · ERROR ${r.status}</div><pre class="player-body">${err.replace(/</g,'&lt;').slice(0,500)}</pre></div>`);
        return;
      }
      const { request_id } = await r.json();
      let attempt = 0;
      setProgressLabel('grokvid', `Generando video · request ${request_id.slice(0,8)}`);
      while (true) {
        await new Promise(res => setTimeout(res, 3000));
        attempt++;
        setProgressLabel('grokvid', `Generando video · intento ${attempt} · request ${request_id.slice(0,8)}`);
        const pollR = await fetch(`${XAI_WORKER_URL}/xai/video/${request_id}`);
        if (!pollR.ok) {
          stopProg(false);
          showPlayer(`<div class="player-card"><div class="player-head">▶ VIDEO · Grok · POLL ERROR ${pollR.status}</div><pre class="player-body">${(await pollR.text()).slice(0,400)}</pre></div>`);
          return;
        }
        const poll = await pollR.json();
        if (poll.status === 'done' && poll.video?.url) {
          stopProg(true);
          const vidTitle = deriveAssetTitle('video', loadStore());
          showPlayer(`
            <div class="player-card">
              <div class="player-head">▶ VIDEO · Grok Imagine · ${aspect} · ${poll.video.duration || duration}s · 720p</div>
              <video controls autoplay src="${poll.video.url}" data-pixer-title="${escAttr(vidTitle)}" style="width:100%; max-height:55vh; border:1px solid var(--matrix); box-shadow:0 0 24px rgba(0,255,65,.30);"></video>
              <pre class="player-body">${prompt.replace(/</g,'&lt;')}</pre>
              <small class="player-foot">// xAI · ${(poll.video.duration || duration)}s · 720p · ${attempt * 3}s de procesado</small>
            </div>`);
          return;
        }
        if (poll.status === 'failed' || poll.status === 'expired') {
          stopProg(false);
          showPlayer(`<div class="player-card"><div class="player-head">▶ VIDEO · Grok · ${poll.status.toUpperCase()}</div><pre class="player-body">${JSON.stringify(poll).slice(0,400)}</pre></div>`);
          return;
        }
        if (attempt > 100) { // ~5 min cap
          stopProg(false);
          showPlayer(`<div class="player-card"><div class="player-head">▶ VIDEO · Grok · TIMEOUT</div><pre class="player-body">request_id: ${request_id}</pre></div>`);
          return;
        }
      }
    } catch (e) {
      showPlayer(`<div class="player-card"><div class="player-head">▶ VIDEO · ERROR</div><pre class="player-body">${String(e).replace(/</g,'&lt;')}</pre></div>`);
    }
  }

  const ASPECT_VEO = {
    'Reel vertical 9:16': '9:16',
    'YouTube 16:9': '16:9',
    'Demo producto 16:9': '16:9',
    'Pantalla evento 16:9': '16:9',
    'Carrusel cuadrado 1:1': '16:9', // Veo 3 no soporta 1:1
  };

  async function playVeo(s, model) {
    const isFast = model === 'veo-3.0-fast-generate-001';
    const label = isFast ? 'Veo 3 Fast' : 'Veo 3';
    const costPerSec = isFast ? 0.10 : 0.40;
    const aspect = ASPECT_VEO[s.canal] || '16:9';
    const dur = Math.max(4, Math.min(8, parseSeconds(s.duracion)));
    const dur4or6or8 = dur <= 4 ? 4 : dur <= 6 ? 6 : 8;
    const guion = [s.hook, s.desarrollo, s.cierre, s.cta && `CTA: ${s.cta}`].filter(Boolean).join(' · ');
    const palette = (loadStore().imagenes && loadStore().imagenes.paleta) || 'cinematic';
    const prompt = `${guion}, ${palette}, cinematic, with appropriate ambient sound and music`;
    const cost = `~$${(dur4or6or8 * costPerSec).toFixed(2)} (${dur4or6or8}s × $${costPerSec})`;
    if (!confirmPro(label + ' (Google)', cost + ' · paid tier Gemini · audio nativo')) return;

    showPlayer(`
      <div class="player-card">
        <div class="player-head">▶ VIDEO · ${label} (Google) · ${aspect} · ${dur4or6or8}s · 720p</div>
        ${progressHtml('Enviando a Veo...', 'veo', isFast ? 60000 : 180000)}
      </div>`);
    const stop = startProgress('veo');
    try {
      const r = await fetch(ELEVEN_WORKER_URL + '/veo/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, aspectRatio: aspect, durationSeconds: dur4or6or8, resolution: '720p', model }),
      });
      if (!r.ok) {
        stop(false);
        const err = await r.text();
        showPlayer(`<div class="player-card"><div class="player-head">▶ VIDEO · ${label} · ERROR ${r.status}</div><pre class="player-body">${err.replace(/</g,'&lt;').slice(0,500)}</pre></div>`);
        return;
      }
      const startData = await r.json();
      const opName = startData.name;
      if (!opName) {
        stop(false);
        showPlayer(`<div class="player-card"><div class="player-head">▶ VIDEO · ${label} · sin operation</div><pre class="player-body">${JSON.stringify(startData).slice(0,400)}</pre></div>`);
        return;
      }
      setProgressLabel('veo', `Generando · ${opName.slice(-12)}`);
      const t0 = Date.now();
      let attempt = 0;
      while (true) {
        await new Promise(res => setTimeout(res, 5000));
        attempt++;
        const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
        setProgressLabel('veo', `Generando · ${elapsed}s · intento ${attempt}`);
        const pollR = await fetch(`${ELEVEN_WORKER_URL}/veo/status/${opName}`);
        if (!pollR.ok) {
          stop(false);
          showPlayer(`<div class="player-card"><div class="player-head">▶ VIDEO · ${label} · POLL ERROR ${pollR.status}</div><pre class="player-body">${(await pollR.text()).slice(0,400)}</pre></div>`);
          return;
        }
        const poll = await pollR.json();
        if (poll.done) {
          const uri = poll?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
          if (!uri) {
            stop(false);
            showPlayer(`<div class="player-card"><div class="player-head">▶ VIDEO · ${label} · sin URI</div><pre class="player-body">${JSON.stringify(poll).slice(0,400)}</pre></div>`);
            return;
          }
          stop(true);
          const proxyUrl = `${ELEVEN_WORKER_URL}/veo/download?uri=${encodeURIComponent(uri)}`;
          const veoTitle = deriveAssetTitle('video', loadStore());
          showPlayer(`
            <div class="player-card">
              <div class="player-head">▶ VIDEO · ${label} (Google) · ${aspect} · ${dur4or6or8}s · 720p · audio nativo</div>
              <video controls autoplay src="${proxyUrl}" data-pixer-title="${escAttr(veoTitle)}" style="width:100%; max-height:55vh; border:1px solid var(--matrix); box-shadow:0 0 24px rgba(0,255,65,.30);"></video>
              <pre class="player-body">${prompt.replace(/</g,'&lt;')}</pre>
              <a class="btn" download="veo3-${Date.now()}.mp4" href="${proxyUrl}">⬇ Descargar MP4</a>
              <small class="player-foot">// Gemini Veo · ${cost} · ${elapsed}s de procesado</small>
            </div>`);
          return;
        }
        if (attempt > 60) {
          stop(false);
          showPlayer(`<div class="player-card"><div class="player-head">▶ VIDEO · ${label} · TIMEOUT</div><pre class="player-body">operation: ${opName}</pre></div>`);
          return;
        }
      }
    } catch (e) {
      stop(false);
      showPlayer(`<div class="player-card"><div class="player-head">▶ VIDEO · ${label} · ERROR</div><pre class="player-body">${String(e)}</pre></div>`);
    }
  }

  function playVideo() {
    const s = loadStore().video || {};
    const motor = s.motor || 'pixer-storyboard';

    if (motor === 'veo-3.0-fast-generate-001' || motor === 'veo-3.0-generate-001') {
      return playVeo(s, motor);
    }

    // PRO: Grok Imagine (xAI) — async con polling
    if (motor === 'grok-imagine-video') {
      playGrokVideo(s);
      return;
    }

    // PRO: Runway / Sora — sin CORS público, abrir tab
    if (motor === 'runway-gen3' || motor === 'sora-openai') {
      const guion = [s.hook, s.desarrollo, s.cierre, s.cta && `CTA: ${s.cta}`].filter(Boolean).join('\n\n');
      const link = motor === 'runway-gen3' ? 'https://app.runwayml.com/' : 'https://sora.com/';
      showPlayer(`
        <div class="player-card">
          <div class="player-head">▶ VIDEO · ${motor}</div>
          <pre class="player-body">${guion.replace(/</g,'&lt;') || '// (sin guion)'}</pre>
          <a class="btn primary" href="${link}" target="_blank" rel="noopener">Abrir ${motor === 'runway-gen3' ? 'Runway' : 'Sora'}</a>
          <small class="player-foot">// Estos motores no permiten CORS desde navegador. Cambia a "Pixer Storyboard" para ver la previsualización.</small>
        </div>`);
      return;
    }

    // FREE: storyboard generado in-browser
    const sizeMap = {
      'Reel vertical 9:16': [432, 768],
      'YouTube 16:9': [768, 432],
      'Demo producto 16:9': [768, 432],
      'Pantalla evento 16:9': [768, 432],
      'Carrusel cuadrado 1:1': [640, 640],
    };
    const [w, h] = sizeMap[s.canal] || [768, 432];
    const totalSec = parseSeconds(s.duracion);
    const scenes = [
      { label: 'HOOK',       text: s.hook       || 'Una pregunta directa al espectador en 3 segundos' },
      { label: 'DESARROLLO', text: s.desarrollo || 'Mostrar producto con planos cortos' },
      { label: 'CIERRE',     text: [s.cierre, s.cta && `CTA: ${s.cta}`].filter(Boolean).join(' · ') || 'Logo + claim' },
    ];
    const stylePalette = (loadStore().imagenes && loadStore().imagenes.paleta) || 'cinematic film grade, dramatic light';
    const sceneSec = totalSec / scenes.length;
    const baseSeed = Math.floor(Math.random() * 1e9);
    const urls = scenes.map((sc, i) =>
      `https://image.pollinations.ai/prompt/${encodeURIComponent(sc.text + ', ' + stylePalette + ', cinematic still, 35mm')}?width=${w}&height=${h}&seed=${baseSeed + i}&nologo=true`
    );

    showPlayer(`
      <div class="player-card">
        <div class="player-head">▶ VIDEO · Pixer Storyboard · ${w}×${h} · ${totalSec.toFixed(0)}s</div>
        <div class="sb-stage" data-w="${w}" data-h="${h}" style="--ar:${w}/${h};">
          ${scenes.map((sc, i) => `
            <div class="sb-frame" data-frame="${i}">
              <img src="${urls[i]}" alt="${sc.label}">
              <div class="sb-caption"><strong>[${i + 1}/${scenes.length}] ${sc.label}</strong><span>${sc.text.replace(/</g,'&lt;')}</span></div>
            </div>`).join('')}
          <div class="sb-progress"><div class="sb-bar"></div></div>
        </div>
        <div class="brief-actions" style="margin-top:10px;">
          <button type="button" class="btn primary" id="sbStart">▶ Reproducir storyboard</button>
          <button type="button" class="btn" id="sbStop">■ Parar</button>
        </div>
        <small class="player-foot">// 3 escenas Pollinations · ${sceneSec.toFixed(1)}s/escena · TTS como voz en off · gratis</small>
      </div>`);

    const stage = getPlayer().querySelector('.sb-stage');
    const frames = stage.querySelectorAll('.sb-frame');
    const bar = stage.querySelector('.sb-bar');
    let timer = null;

    function stop() {
      clearInterval(timer); timer = null;
      try { speechSynthesis.cancel(); } catch {}
      frames.forEach(f => f.classList.remove('active'));
      bar.style.width = '0%';
    }
    function start() {
      stop();
      const startTs = performance.now();
      const totalMs = totalSec * 1000;
      // Voz en off encadenando las 3 escenas
      if ('speechSynthesis' in window) {
        scenes.forEach((sc, i) => {
          const u = new SpeechSynthesisUtterance(sc.text);
          const lang = (loadStore().audio && LANG_MAP[loadStore().audio.idioma]) || 'es-ES';
          u.lang = lang;
          u.rate = 1.05;
          speechSynthesis.speak(u);
        });
      }
      timer = setInterval(() => {
        const t = performance.now() - startTs;
        const pct = Math.min(100, (t / totalMs) * 100);
        bar.style.width = pct + '%';
        const idx = Math.min(scenes.length - 1, Math.floor(t / (totalMs / scenes.length)));
        frames.forEach((f, i) => f.classList.toggle('active', i === idx));
        if (t >= totalMs) stop();
      }, 60);
      frames[0].classList.add('active');
    }
    document.getElementById('sbStart')?.addEventListener('click', start);
    document.getElementById('sbStop')?.addEventListener('click', stop);
    // Auto-arranca
    setTimeout(start, 250);
  }

  function playPlataforma() {
    showPlayer(`
      <div class="player-card">
        <div class="player-head">▶ PLATAFORMA · reproducir todo</div>
        <pre class="player-body">// Lanzando Audio + Música + Imagen + Video en secuencia...</pre>
      </div>`);
    playAudio();
    setTimeout(playMusica, 300);
    setTimeout(playImagenes, 600);
    setTimeout(playVideo, 900);
  }

  function bindPlay(page) {
    const btn = document.getElementById('playOutput');
    if (!btn) return;
    const map = {
      audio: playAudio,
      musica: playMusica,
      imagenes: playImagenes,
      video: playVideo,
      plataforma: playPlataforma,
    };
    const fn = map[page];
    if (!fn) { btn.hidden = true; return; }
    const labels = {
      audio: '▶ REPRODUCIR DE NUEVO',
      musica: '▶ REPRODUCIR DE NUEVO',
      imagenes: '✨ GENERAR OTRA',
      video: '▶ REPRODUCIR DE NUEVO',
      plataforma: '▶ REPRODUCIR TODO DE NUEVO',
    };
    btn.addEventListener('click', () => {
      fn();
      const lbl = btn.querySelector('.play-label');
      if (lbl) lbl.textContent = labels[page] || '▶ REPRODUCIR DE NUEVO';
    });
  }

  // Genera letras con Gemini 2.5 Flash vía worker
  function bindGenLyrics() {
    const btn = document.getElementById('genLyrics');
    const ta = document.getElementById('m-letra');
    if (!btn || !ta) return;
    btn.addEventListener('click', async () => {
      const store = loadStore();
      const brief = { ...(store.musica || {}), cliente: store.cliente };
      const idioma = (store.audio && store.audio.idioma) ? (LANG_MAP[store.audio.idioma] || 'es-ES').split('-')[0] : 'es';
      const oldLabel = btn.textContent;
      btn.textContent = '⏳ generando...';
      btn.disabled = true;
      ta.value = '// generando letra con Gemini 2.5 Flash...';
      try {
        const r = await fetch(ELEVEN_WORKER_URL + '/llm/lyrics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brief, idioma }),
        });
        const data = await r.json();
        if (!r.ok || !data.text) {
          ta.value = '// ERROR: ' + JSON.stringify(data).slice(0, 400);
        } else {
          ta.value = data.text;
          // Persistir
          const s = loadStore();
          setNested(s, 'musica.letra', data.text);
          saveStore(s);
          showToast('Letra generada');
        }
      } catch (e) {
        ta.value = '// ERROR: ' + String(e);
      } finally {
        btn.textContent = oldLabel;
        btn.disabled = false;
      }
    });
  }

  // ─── Enviar al feed de Admira XP (KV vía worker) ────────────────
  const SIGNAGE_URL = ELEVEN_WORKER_URL + '/signage';

  async function urlToBase64(url) {
    if (url.startsWith('data:')) {
      const [meta, b64] = url.split(',');
      const mime = (meta.match(/data:([^;]+)/) || [, 'application/octet-stream'])[1];
      return { mime, base64: b64 };
    }
    const r = await fetch(url);
    if (!r.ok) throw new Error(`fetch ${r.status}`);
    const blob = await r.blob();
    const buf = await blob.arrayBuffer();
    let bin = '';
    const u8 = new Uint8Array(buf);
    for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
    return { mime: blob.type || 'application/octet-stream', base64: btoa(bin) };
  }

  // ─── Helpers para titular y portada del asset enviado a Pixer Feed ────
  function escAttr(v) {
    return String(v || '')
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  // Construye un titulo identificativo del asset desde el brief actual.
  // section: 'musica' | 'imagenes' | 'video' | 'audio'.
  // store: loadStore() actual (con .cliente y .{section}).
  function deriveAssetTitle(section, store) {
    const s = (store && store[section]) || {};
    const cliente = String((store && store.cliente) || '').trim();
    let core = '';
    if (section === 'musica') {
      if (s.letra) {
        const first = String(s.letra).split(/\r?\n/).map(l => l.trim()).find(l => l && !/^\[/.test(l));
        if (first) core = first;
      }
      core = core || s.uso || '';
    } else if (section === 'imagenes' || section === 'video') {
      core = s.prompt || s.uso || '';
    } else if (section === 'audio') {
      if (s.guion) {
        const first = String(s.guion).split(/\r?\n/).map(l => l.trim()).filter(Boolean)[0];
        if (first) core = first;
      }
      core = core || s.uso || '';
    }
    core = String(core).replace(/\s+/g, ' ').trim().slice(0, 60);
    // Separador "//" (mismo que el header del overlay Pixer Feed) en lugar de "·"
    // para que el item se lea como marca + descripcion: "AdmiraNext // una moto Top Gun"
    if (cliente && core) return `${cliente} // ${core}`;
    return core || cliente || section;
  }
  // Genera URL Pollinations (FLUX schnell, gratis, deterministica) para usar
  // como caratula de musica/audio cuando el motor no devuelve image_url propia
  // (Suno si la trae; Lyria y TTS no).
  function pollinationsCoverFor(section, store) {
    const s = (store && store[section]) || {};
    const parts = [];
    if (section === 'musica') {
      parts.push(s.uso || 'music album cover');
      if (Array.isArray(s.emocion)) parts.push(...s.emocion);
      parts.push('square album art, neon green matrix style, cinematic');
    } else if (section === 'audio') {
      parts.push(s.uso || 'podcast cover');
      parts.push('square art, microphone, neon green matrix style');
    } else {
      return '';
    }
    const prompt = parts.filter(Boolean).join(', ').slice(0, 200);
    const seedSrc = String((s.uso || '') + (s.tonalidad || '') + ((store && store.cliente) || '') || 'pixer');
    let seed = 0;
    for (let i = 0; i < seedSrc.length; i++) seed = (seed * 31 + seedSrc.charCodeAt(i)) >>> 0;
    return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=512&height=512&seed=${seed % 100000}&nologo=true`;
  }

  function detectLatestAsset() {
    const player = document.getElementById('player');
    if (!player || player.hidden) return null;
    // Compare grid: si el usuario marcó una celda como seleccionada
    // (.compare-cell.selected), la imagen de esa celda gana sobre el resto.
    // Por defecto auto-selecciona la primera tras la generacion (compareSelectedImages).
    const selectedCellImg = player.querySelector('.compare-cell.selected .compare-cell-img img[src]');
    if (selectedCellImg) {
      return {
        kind: 'image',
        src: selectedCellImg.getAttribute('src') || selectedCellImg.src,
        title: (selectedCellImg.dataset && selectedCellImg.dataset.pixerTitle) || '',
        cover: (selectedCellImg.dataset && selectedCellImg.dataset.pixerCover) || '',
      };
    }
    const pick = (sel, kind) => {
      const el = player.querySelector(sel);
      if (!el) return null;
      const src = el.getAttribute('src') || el.querySelector('source')?.src || '';
      if (!src) return null;
      return {
        kind, src,
        title: (el.dataset && el.dataset.pixerTitle) || '',
        cover: (el.dataset && el.dataset.pixerCover) || '',
      };
    };
    return pick('video[src]', 'video') || pick('audio[src]', 'audio') || pick('img[src]', 'image');
  }

  function setSignageStatus({ thumb, stage, log, pct, indeterminate, id, mode }) {
    const panel = document.getElementById('signageStatus');
    if (!panel) return;
    panel.hidden = false;
    if (mode === 'reset') panel.classList.remove('error', 'done');
    if (mode === 'error') { panel.classList.add('error'); panel.classList.remove('done'); }
    if (mode === 'done')  { panel.classList.add('done'); panel.classList.remove('error'); }
    if (thumb !== undefined) {
      const img = panel.querySelector('.signage-thumb');
      if (thumb) img.src = thumb; else img.removeAttribute('src');
    }
    if (stage !== undefined) panel.querySelector('.signage-stage').textContent = stage;
    if (log !== undefined) panel.querySelector('.signage-log').textContent = log;
    if (id !== undefined) panel.querySelector('.signage-id').textContent = id ? `id ${id.slice(-8)}` : '';
    const bar = panel.querySelector('.signage-bar');
    const fill = panel.querySelector('.signage-bar-fill');
    if (indeterminate) {
      bar.classList.add('indeterminate');
    } else if (pct !== undefined) {
      bar.classList.remove('indeterminate');
      fill.style.width = pct + '%';
    }
  }

  function bindSendToAdmiraXP() {
    const btn = document.getElementById('sendToAdmiraXP');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const asset = detectLatestAsset();
      if (!asset) {
        showToast('Genera primero contenido (✨ CREAR)');
        return;
      }
      const cliente = (loadStore().cliente || 'sin cliente').slice(0, 80);
      const page = document.body.dataset.page || 'pixer';
      // El titulo viene del propio asset cuando los renders dejan data-pixer-title;
      // si no, fallback al generico "<page> · <cliente>".
      const title = (asset.title && asset.title.trim()) || `${page} · ${cliente}`;
      const cover = (asset.cover && asset.cover.trim()) || '';
      const oldText = btn.textContent;
      btn.disabled = true;
      btn.textContent = '📤 enviando...';

      // Stage 0 — preview en el panel
      const thumbUrl = asset.kind === 'image' ? asset.src : (cover || '');
      setSignageStatus({
        thumb: thumbUrl,
        stage: '📤 Detectando contenido',
        log: `${asset.kind.toUpperCase()} · "${title.slice(0, 80)}"`,
        pct: 5,
        indeterminate: false,
        id: '',
        mode: 'reset',
      });

      try {
        let payload = { kind: asset.kind, title };
        if (cover) payload.cover_url = cover; // worker quizas no lo persiste aun; harmless si lo descarta
        const isExternal = asset.src.startsWith('http://') || asset.src.startsWith('https://');

        if (isExternal) {
          payload.src = asset.src;
          setSignageStatus({ stage: '📤 Preparando URL externa', log: asset.src.slice(0, 100), pct: 30 });
        } else {
          setSignageStatus({ stage: '⚙ Convirtiendo asset a base64', log: 'puede tardar unos segundos en videos largos...', indeterminate: true });
          const t0 = Date.now();
          const { mime, base64 } = await urlToBase64(asset.src);
          payload.mime = mime;
          payload.base64 = base64;
          const sizeMB = (base64.length / 1024 / 1024 * 0.75).toFixed(2);
          setSignageStatus({ stage: '📤 Subiendo al worker', log: `${mime} · ${sizeMB} MB · convertido en ${((Date.now() - t0) / 1000).toFixed(1)}s`, pct: 50, indeterminate: false });
        }

        const r = await fetch(SIGNAGE_URL + '/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        setSignageStatus({ stage: '💾 Guardado en Cloudflare KV', pct: 80 });
        const data = await r.json();
        if (!r.ok || !data.ok) {
          setSignageStatus({ stage: '❌ Error del worker', log: (data.error || ('HTTP ' + r.status)).slice(0, 200), pct: 100, mode: 'error' });
          return;
        }

        // Stage 5 — esperar ack REAL de la pantalla
        setSignageStatus({
          stage: '⏳ Esperando ack de la pantalla',
          log: 'la pantalla debe estar abierta en signage.html · poleo cada 2s (max 25s)',
          pct: 90,
          id: data.id,
          indeterminate: true,
        });
        const t0 = Date.now();
        const TIMEOUT_MS = 25000;
        let acked = null;
        while (Date.now() - t0 < TIMEOUT_MS) {
          await new Promise(r => setTimeout(r, 2000));
          try {
            const fr = await fetch(SIGNAGE_URL + '/feed?limit=10');
            const fd = await fr.json();
            const item = (fd.items || []).find(i => i.id === data.id);
            if (item && item.acked_at) { acked = item; break; }
          } catch {}
        }
        if (acked) {
          const screen = acked.screen || 'pantalla';
          setSignageStatus({
            stage: '▶ REPRODUCIENDO en pantalla',
            log: `${screen} confirmó ack hace ${((Date.now() - acked.acked_at) / 1000).toFixed(0)}s · LIVE`,
            pct: 100,
            id: data.id,
            mode: 'done',
          });
        } else {
          setSignageStatus({
            stage: '⚠ Sin ack de pantalla en 25s',
            log: 'subido al feed pero ninguna signage.html acuso recibo · abre la pantalla con el botón ↗',
            pct: 100,
            id: data.id,
            mode: 'error',
          });
        }
      } catch (e) {
        setSignageStatus({ stage: '❌ Error', log: String(e).slice(0, 200), pct: 100, mode: 'error' });
      } finally {
        btn.disabled = false;
        btn.textContent = oldText;
      }
    });
  }

  // ─── Badge de estado Xtore (signage live) ───────────────────────
  async function refreshXtoreStatus() {
    const el = document.getElementById('xtoreStatus');
    if (!el) return;
    try {
      const r = await fetch(SIGNAGE_URL + '/screens');
      if (!r.ok) throw new Error('http ' + r.status);
      const data = await r.json();
      const online = data.online_count || 0;
      const total = data.total_count || 0;
      el.classList.remove('online', 'stale', 'offline');
      if (online > 0) {
        el.classList.add('online');
        const onlineScreens = (data.screens || []).filter(s => s.online).sort((a, b) => a.age_seconds - b.age_seconds);
        const youngest = onlineScreens[0];
        // Identifica preferentemente la Xtore (game) frente a signage genérico
        const xtore = onlineScreens.find(s => s.role === 'xtore-game') || youngest;
        const verLabel = xtore?.version ? ` ${xtore.version.split(' ')[0]}` : '';
        const roleLabel = xtore?.role === 'xtore-game' ? 'XTORE' : 'SIGNAGE';
        el.textContent = `${roleLabel}${verLabel} · LIVE`;
        el.title = `${online}/${total} pantallas activas · última señal hace ${youngest?.age_seconds ?? 0}s\n\n` +
          (data.screens || []).map(s => {
            const v = s.version ? ` ${s.version}` : '';
            const r = s.role || 'signage';
            return `${s.online ? '🟢' : '🔴'} [${r}]${v} · ${s.screen} · ${s.age_seconds}s · feed:${s.feed_count}`;
          }).join('\n');
      } else if (total > 0) {
        const stale = (data.screens || [])[0];
        el.classList.add('stale');
        el.textContent = `XTORE · stale ${stale?.age_seconds || '?'}s`;
        el.title = `Sin pantallas activas. Última señal hace ${stale?.age_seconds || '?'}s.\nAbre signage.html para reactivar.`;
      } else {
        el.classList.add('offline');
        el.textContent = 'XTORE · offline';
        el.title = 'Ninguna pantalla signage.html abierta.\nClick para abrir la pantalla en otra ventana.';
      }
    } catch (e) {
      el.classList.remove('online', 'stale');
      el.classList.add('offline');
      el.textContent = 'XTORE · sin red';
      el.title = String(e);
    }
  }

  function bindXtoreBadge() {
    const el = document.getElementById('xtoreStatus');
    if (!el) return;
    el.style.cursor = 'pointer';
    el.addEventListener('click', () => {
      window.open('../signage.html', '_blank');
    });
    refreshXtoreStatus();
    setInterval(refreshXtoreStatus, 10000);
  }

  // ─── Importar desde URL (yt-dlp) ─────────────────────────────────
  // Dos backends posibles segun como se sirva la pagina:
  //   - localhost (suno-local :3777)  → audio mp3 + video mp4 (preferente cuando esta arriba)
  //   - HTTPS publico (admira-tube Funnel) → audio mp3 + video mp4
  // Whitelist de hosts en ambos: YouTube, Vimeo, Twitter/X, TikTok, Instagram.
  // Desde GitHub Pages (https://...) el browser bloquea fetch a http://localhost
  // por mixed-content, asi que routeamos al Funnel.
  function pickImportEndpoint() {
    const isLocalOrigin = location.protocol === 'http:'
      || location.hostname === 'localhost'
      || location.hostname === '127.0.0.1';
    if (isLocalOrigin) {
      return {
        kind: 'suno-local',
        url: 'http://127.0.0.1:3777/yt/import',
        bodyFor: (u, fmt) => ({ url: u, format: fmt }),
      };
    }
    return {
      kind: 'admira-tube',
      url: 'https://macmini.tail48b61c.ts.net/admira/tube/download',
      bodyFor: (u, fmt) => ({ url: u, format: fmt }),
    };
  }

  function bindImportModal() {
    const dlg = document.getElementById('importModal');
    const open = document.getElementById('openImport');
    if (!dlg || !open) return;
    open.addEventListener('click', () => {
      const stat = document.getElementById('importStatus');
      if (stat) { stat.style.display = 'none'; stat.textContent = ''; }
      dlg.showModal();
    });
    document.getElementById('closeImport')?.addEventListener('click', () => dlg.close());
    document.getElementById('doImport')?.addEventListener('click', async () => {
      const url = document.getElementById('import-url').value.trim();
      const fmt = document.querySelector('input[name="import-fmt"]:checked')?.value || 'audio';
      if (!url) return;
      const stat = document.getElementById('importStatus');
      stat.style.display = 'block';
      const ep = pickImportEndpoint();
      stat.textContent = `// llamando a ${ep.kind} (${fmt})...\n// puede tardar 10-60s según media`;
      const t0 = Date.now();
      try {
        const r = await fetch(ep.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ep.bodyFor(url, fmt)),
        });
        if (!r.ok) {
          let err = '';
          try { err = JSON.stringify(await r.json()); } catch { err = await r.text(); }
          stat.textContent = `// ERROR ${r.status}\n${err.slice(0, 400)}`;
          return;
        }
        const blob = await r.blob();
        const sec = ((Date.now() - t0) / 1000).toFixed(1);
        const sizeMB = (blob.size / 1024 / 1024).toFixed(2);
        const blobUrl = URL.createObjectURL(blob);
        const kind = fmt === 'video' ? 'video' : 'audio';
        const elTag = kind;
        const player = document.getElementById('player');
        if (player) {
          player.hidden = false;
          player.innerHTML = `
            <div class="player-card">
              <div class="player-head">📥 IMPORTADO · ${kind.toUpperCase()} · ${sizeMB} MB · ${sec}s · ${ep.kind}</div>
              <${elTag} controls autoplay src="${blobUrl}" style="width:100%;${kind === 'video' ? 'max-height:55vh;' : ''}"></${elTag}>
              <pre class="player-body">${url.replace(/</g, '&lt;')}</pre>
              <a class="btn" download="import-${Date.now()}.${fmt === 'video' ? 'mp4' : 'mp3'}" href="${blobUrl}">⬇ Descargar</a>
              <small class="player-foot">// vía yt-dlp (${ep.kind}) · ahora puedes pulsar 📺 ENVIAR A ADMIRA XP</small>
            </div>`;
        }
        stat.textContent = `✓ Importado (${sizeMB} MB en ${sec}s vía ${ep.kind}) · listo en el player`;
        setTimeout(() => dlg.close(), 1500);
      } catch (e) {
        if (ep.kind === 'admira-tube') {
          stat.textContent = `// ERROR: ${String(e)}\n// El proxy admira-tube (Funnel) no responde.\n// En el Mac Mini: cd ~/GitHub/01.-AdmiraXperience-Game && ./start-admira-tube.sh`;
        } else {
          stat.textContent = `// ERROR: ${String(e)}\n// ¿está suno-local arrancado en localhost:3777?\n//   cd ~/Documents/New\\ project/csilvasantin-repos/suno-local && node server.js`;
        }
      }
    });
  }

  // Init por página
  document.addEventListener('DOMContentLoaded', () => {
    applyDefaults();
    bindImportModal();
    bindXtoreBadge();
    bindSettingsModal();
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
      bindPlay(page);
      bindGenLyrics();
      bindSendToAdmiraXP();

      const demoBtn = document.getElementById('loadDemo');
      if (demoBtn && window.PIXER_DEMO) {
        demoBtn.addEventListener('click', () => loadDemo(window.PIXER_DEMO.fields, window.PIXER_DEMO.chips));
      }
    }
  });

  window.PIXER = { loadStore, saveStore, buildBrief, showToast, MOTORES };
})();
