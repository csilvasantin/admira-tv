(function () {
  const STORAGE_KEY = 'pixer-brief-v.2026.05.02-r22';
  const KEYS_STORE = 'pixer-keys';
  const VERSION = 'v.2026.05.02-r22';
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
    cliente: 'Demo Pixer.ai',
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
    if (!store.cliente) { store.cliente = DEFAULTS.cliente; changed = true; }
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
      { id: 'musicgen',  nombre: 'MusicGen (Meta)',  tipo: 'free', coste: 'gratis · open weights',     desc: 'self-host, hasta 30s' },
      { id: 'suno-v4',   nombre: 'Suno v4',          tipo: 'pro',  coste: '$8/mes · ~500 canciones',   desc: 'voces + instrumental' },
      { id: 'udio',      nombre: 'Udio Standard',    tipo: 'pro',  coste: '$10/mes · ~1200 créditos',  desc: 'piezas largas + control' },
    ],
    imagenes: [
      { id: 'flux-schnell',           nombre: 'FLUX.1 [schnell]',       tipo: 'free', coste: 'gratis · Pollinations', desc: 'open weights, rápido' },
      { id: 'grok-imagine-image',     nombre: 'Grok Imagine (xAI)',     tipo: 'pro',  coste: '$0.02 / imagen',        desc: 'vía worker · sin key cliente' },
      { id: 'grok-imagine-image-pro', nombre: 'Grok Imagine Pro (xAI)', tipo: 'pro',  coste: '$0.07 / imagen',        desc: 'mayor calidad · vía worker' },
    ],
    video: [
      { id: 'pixer-storyboard',   nombre: 'Pixer Storyboard',     tipo: 'free', coste: 'gratis · navegador',     desc: '3 escenas + crossfade + voz' },
      { id: 'grok-imagine-video', nombre: 'Grok Imagine (xAI)',   tipo: 'pro',  coste: 'vía worker · sin key cliente', desc: 'video 720p · 1-15s · async' },
      { id: 'runway-gen3',        nombre: 'Runway Gen-3 Alpha',   tipo: 'pro',  coste: '$0.05 / segundo',         desc: 'video 1080p · sin CORS' },
      { id: 'sora-openai',        nombre: 'Sora (OpenAI)',        tipo: 'pro',  coste: 'Plus $20/mes · Pro $200', desc: 'narrativa larga · sin CORS' },
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
      host.querySelectorAll('input[type=radio]').forEach(r => {
        r.addEventListener('change', () => {
          if (!r.checked) return;
          const s = loadStore();
          setNested(s, `${seccion}.motor`, r.value);
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
        showPlayer(`
          <div class="player-card">
            <div class="player-head">▶ AUDIO · ElevenLabs v2 · voice ${voiceId}</div>
            <pre class="player-body">"${text.replace(/</g,'&lt;')}"</pre>
            <audio controls autoplay src="${url}" style="width:100%;"></audio>
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
  function playMusica() {
    const s = loadStore().musica || {};
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

  async function playImagenes() {
    const s = loadStore().imagenes || {};
    const motor = s.motor || 'flux-schnell';
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
        showPlayer(`
          <div class="player-card">
            <div class="player-head">▶ IMAGEN · ${label} (xAI)</div>
            <div class="player-img-wrap">
              <img class="player-img" src="${url}" alt="generada">
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
    showPlayer(`
      <div class="player-card">
        <div class="player-head">▶ IMAGEN · Pollinations · ${w}×${h} · seed ${seed}</div>
        <div class="player-img-wrap">
          <div class="player-loading">// generando imagen...</div>
          <img class="player-img" src="${url}" alt="generada" onload="this.previousElementSibling.style.display='none'">
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
          showPlayer(`
            <div class="player-card">
              <div class="player-head">▶ VIDEO · Grok Imagine · ${aspect} · ${poll.video.duration || duration}s · 720p</div>
              <video controls autoplay src="${poll.video.url}" style="width:100%; max-height:55vh; border:1px solid var(--matrix); box-shadow:0 0 24px rgba(0,255,65,.30);"></video>
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

  function playVideo() {
    const s = loadStore().video || {};
    const motor = s.motor || 'pixer-storyboard';

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

  // Init por página
  document.addEventListener('DOMContentLoaded', () => {
    applyDefaults();
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

      const demoBtn = document.getElementById('loadDemo');
      if (demoBtn && window.PIXER_DEMO) {
        demoBtn.addEventListener('click', () => loadDemo(window.PIXER_DEMO.fields, window.PIXER_DEMO.chips));
      }
    }
  });

  window.PIXER = { loadStore, saveStore, buildBrief, showToast, MOTORES };
})();
