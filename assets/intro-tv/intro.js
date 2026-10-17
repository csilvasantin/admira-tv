/* admira.tv · intro de la portada / homepage intro (NeoMacStudio, 17-oct-2026).
   La intro «Todo en orden» con el look de admira.tv y su propia historia (Carlos: «Pantallas que responden»):
   antes de abrir fallan pantallas, vídeowalls, tótems y escaparates; pasa Admira.tv y todo queda emitiendo.
   Cierra con «Espacios que responden.» / «Spaces that respond.». 15 s a pantalla completa.
   - Una vez por sesión y por idioma (sessionStorage 'admiratv_intro_a' = idiomas vistos, «es,en»).
   - En el idioma de la portada, como assets/portada-idioma.js: ?lang=es|en → admtv-lang → español. Al cambiar de
     idioma (píldora ESP/ENG; evento 'admira:languagechange'), sale en el idioma nuevo si aún no se ha visto en él;
     si la intro está en marcha, el vídeo y la música cambian en el mismo segundo.
   - Se salta con «Saltar intro» o Esc; se cierra sola al terminar o si el vídeo no arranca en 4 s.
   - No sale con «reducir movimiento» ni con una marca blanca activa (?marca=, ?project=, mb:marca); ?marca=admira
     es el modo por defecto. ?intro=0 la quita; ?intro=1 la fuerza.
   - 1080p desde 1600 píxeles reales de ancho; 720p en el resto.
   - Música: una por idioma (castellano «Tic-tac y campanas», inglés «Pulso»). Intenta sonar; si el navegador no
     deja, queda el botón «Activar sonido». ?musica=campanas|pulso|0. Va en .mp4: Cloudflare no sirve .m4a por rangos.
   Contrato / contract: docs/intro-tv.md */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root && root.document) api.start(root);
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const SEEN_KEY = 'admiratv_intro_a';
  const SOURCES = {
    es: {1080: '/assets/intro-tv/intro-tv-a-es-1080.mp4', 720: '/assets/intro-tv/intro-tv-a-es-720.mp4'},
    en: {1080: '/assets/intro-tv/intro-tv-a-en-1080.mp4', 720: '/assets/intro-tv/intro-tv-a-en-720.mp4'}
  };
  // .mp4 y no .m4a: admira.store está en Cloudflare, que no guarda .m4a en caché ni lo sirve por rangos (206);
  // sin rangos, la música no se puede poner en el segundo del vídeo. Mismo audio AAC.
  const MUSIC = {campanas: '/assets/intro-tv/musica-campanas.mp4', pulso: '/assets/intro-tv/musica-pulso.mp4'};
  const BRAND_KEY = 'mb:marca';
  const BRAND_OFF = ['off', 'admira', 'ninguna', 'ninguno', 'none', 'default', 'apagar', 'quitar', 'reset'];
  const LANG_KEY = 'admtv-lang';
  // Como assets/portada-idioma.js: ?lang=es|en → la preferencia guardada (admtv-lang) → español.
  function resolveLang(search, stored) {
    let q = '';
    try { q = String(new URLSearchParams(String(search || '')).get('lang') || '').toLowerCase(); } catch (_) {}
    if (q === 'en' || q === 'es') return q;
    return stored === 'en' || stored === 'es' ? stored : 'es';
  }
  const has = lang => Object.prototype.hasOwnProperty.call(SOURCES, lang);
  const LABELS = {
    es: {skip: 'Saltar intro', soundOn: 'Activar sonido', soundOff: 'Silenciar', aria: 'Intro de Admira.tv: antes de abrir fallan pantallas, vídeowalls, tótems y escaparates, y Admira.tv los deja emitiendo. Espacios que responden.'},
    en: {skip: 'Skip intro', soundOn: 'Turn sound on', soundOff: 'Mute', aria: 'Admira.tv intro: before opening, screens, video walls, totems and shop windows fail, and Admira.tv gets them all on air. Spaces that respond.'}
  };

  // Marca blanca activa, con las mismas prioridades que assets/marca-blanca.js: ?marca= > proyecto > recordada.
  function activeBrand(search, stored) {
    const q = new URLSearchParams(search || '');
    const off = v => BRAND_OFF.includes(v);
    const m = q.get('marca');
    if (m != null) { const v = m.trim().toLowerCase(); return !v || off(v) ? '' : v; }
    if (q.get('project')) return q.get('project').trim().toLowerCase();
    if (/^alsea-sbux-/.test(q.get('loc') || '')) return 'starbucks';
    const s = String(stored || '').trim().toLowerCase();
    return s && !off(s) ? s : '';
  }
  // Idiomas en los que ya se vio en esta sesión. El «1» antiguo (antes del 17-oct 20:45) no dice el idioma: cuenta como ninguno.
  function parseSeen(value) { return String(value || '').split(',').map(v => v.trim()).filter(v => has(v)); }

  // Decide si se enseña: ?intro=1 manda sobre todo; ?intro=0, ya vista, menos movimiento, un idioma sin vídeo
  // o una marca blanca activa (la intro es el look por defecto) la quitan.
  function shouldShow(o) {
    const intro = new URLSearchParams(o.search || '').get('intro');
    if (intro === '1') return true;
    if (intro === '0') return false;
    return has(o.lang) && !o.reducedMotion && !o.seen && !o.brand;
  }
  // El vídeo del idioma (español si no hay otro); píxeles reales de ancho: desde 1600 va la de 1080p.
  function pickSource(width, dpr, lang) {
    const set = has(lang) ? SOURCES[lang] : SOURCES.es;
    return (Number(width) || 0) * (Number(dpr) || 1) >= 1600 ? set[1080] : set[720];
  }

  // Una música por idioma: castellano «Tic-tac y campanas», inglés «Pulso». ?musica=campanas|pulso la fija; ?musica=0 la quita.
  const MUSIC_BY_LANG = {es: 'campanas', en: 'pulso'};
  function pickMusic(search, lang) {
    const forced = new URLSearchParams(search || '').get('musica');
    if (forced === '0') return '';
    if (forced && Object.prototype.hasOwnProperty.call(MUSIC, forced)) return forced;
    return MUSIC_BY_LANG[lang] || MUSIC_BY_LANG.es;
  }

  // Por encima del marco de admira.tv (cabecera 2147483010, raíles 2147483002, aviso de contexto 2147483000):
  // si no, tapan los botones de la intro. Solo el enlace «Saltar al contenido» (2147483647) queda encima.
  const CSS = `
.tv-intro{position:fixed;inset:0;z-index:2147483646;background:#070a10;display:flex;align-items:center;justify-content:center;opacity:1;transition:opacity .6s ease}
.tv-intro.is-closing{opacity:0}
.tv-intro video{width:100%;height:100%;object-fit:contain;background:#070a10}
.tv-intro-actions{position:absolute;right:max(20px,env(safe-area-inset-right,0px));bottom:max(24px,env(safe-area-inset-bottom,0px));display:flex;flex-wrap:wrap;justify-content:flex-end;gap:10px}
.tv-intro-skip,.tv-intro-sound{padding:11px 18px;border:1px solid #223047;border-radius:999px;background:rgba(12,18,28,.82);color:#e8eef6;font:700 13px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:.02em;cursor:pointer}
.tv-intro-skip:hover,.tv-intro-sound:hover{border-color:#3df08a}
.tv-intro-skip:focus-visible,.tv-intro-sound:focus-visible{outline:2px solid #3df08a;outline-offset:3px}
.tv-intro-sound[aria-pressed="false"]{background:#3df08a;border-color:#3df08a;color:#04140a}
.tv-intro-bar{position:absolute;left:0;bottom:0;height:3px;width:0;background:#3df08a}`;

  function storage(win, kind) { try { return win[kind]; } catch (_) { return null; } }

  function start(win) {
    const session = storage(win, 'sessionStorage');
    const read = key => { try { return (session && session.getItem(key)) || ''; } catch (_) { return ''; } };
    const reducedMotion = !!(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const seenNow = () => parseSeen(read(SEEN_KEY));
    const markSeen = langs => { const all = seenNow(); for (const l of langs) if (has(l) && !all.includes(l)) all.push(l); try { session && session.setItem(SEEN_KEY, all.join(',')); } catch (_) {} };
    let current = null;
    const tryOpen = lang => {
      if (current) return;
      if (!shouldShow({search: win.location.search, lang, reducedMotion, seen: seenNow().includes(lang), brand: activeBrand(win.location.search, read(BRAND_KEY))})) return;
      current = open(win, lang, shown => { markSeen(shown); current = null; });
    };
    tryOpen(resolveLang(win.location.search, (() => { try { return storage(win, 'localStorage').getItem(LANG_KEY); } catch (_) { return ''; } })()));
    // Al pasar a otro idioma: con la intro en marcha cambia el vídeo; si no, sale en ese idioma si aún no se ha visto en él.
    win.addEventListener('admira:languagechange', ev => {
      const next = String((ev && ev.detail && ev.detail.lang) || '').toLowerCase();
      if (!has(next)) return;
      if (current) current.setLang(next); else tryOpen(next);
    });
  }

  function open(win, lang, onClosed) {
    const doc = win.document;
    const shown = [lang];
    let t = LABELS[lang] || LABELS.es;

    const style = doc.createElement('style');
    style.textContent = CSS;
    const box = doc.createElement('div');
    box.className = 'tv-intro';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', t.aria);
    const video = doc.createElement('video');
    video.muted = true; video.defaultMuted = true; video.playsInline = true; video.autoplay = true;
    video.setAttribute('muted', ''); video.setAttribute('playsinline', ''); video.preload = 'auto';
    video.src = pickSource(win.innerWidth, win.devicePixelRatio, lang);
    const skip = doc.createElement('button');
    skip.type = 'button'; skip.className = 'tv-intro-skip'; skip.textContent = t.skip + ' ✕';
    const bar = doc.createElement('div');
    bar.className = 'tv-intro-bar';
    const actions = doc.createElement('div');
    actions.className = 'tv-intro-actions';

    // Música aparte del vídeo: la del idioma, ajustada al tiempo del vídeo.
    let track = pickMusic(win.location.search, lang);
    let audio = null, soundOn = false, triedAuto = false;
    const sound = doc.createElement('button');
    sound.type = 'button'; sound.className = 'tv-intro-sound';
    const paintSound = () => { sound.textContent = soundOn ? '🔇 ' + t.soundOff : '🔊 ' + t.soundOn; sound.setAttribute('aria-pressed', String(soundOn)); };
    const syncPlay = () => { try { audio.currentTime = video.currentTime; } catch (_) {} return audio.play(); };
    const tryOn = () => { soundOn = true; paintSound(); const p = syncPlay(); if (p && p.catch) p.catch(() => { soundOn = false; paintSound(); }); };
    if (track) {
      audio = new win.Audio(MUSIC[track]);
      audio.preload = 'auto';
      // Primero intenta con sonido; si el navegador no deja, se queda en silencio con el botón a la vista.
      video.addEventListener('playing', () => { if (!triedAuto) { triedAuto = true; tryOn(); } else if (soundOn) syncPlay(); });
      video.addEventListener('pause', () => audio.pause());
      video.addEventListener('timeupdate', () => { if (soundOn && !audio.paused && Math.abs(audio.currentTime - video.currentTime) > 0.25) audio.currentTime = video.currentTime; });
      sound.addEventListener('click', () => { if (soundOn) { soundOn = false; audio.pause(); paintSound(); } else tryOn(); });
      paintSound();
      actions.append(sound);
    }
    actions.append(skip);
    box.append(video, actions, bar);

    const html = doc.documentElement, overflow = html.style.overflow;
    let closed = false, watchdog = 0;
    function close() {
      if (closed) return;
      closed = true;
      clearTimeout(watchdog);
      if (audio) { try { audio.pause(); } catch (_) {} }
      onClosed(shown);
      win.removeEventListener('keydown', onKey);
      html.style.overflow = overflow;
      box.classList.add('is-closing');
      win.setTimeout(() => { try { video.pause(); } catch (_) {} box.remove(); style.remove(); }, 650);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }

    skip.addEventListener('click', close);
    win.addEventListener('keydown', onKey);
    video.addEventListener('ended', close);
    video.addEventListener('error', close);
    video.addEventListener('timeupdate', () => { if (video.duration) bar.style.width = (100 * video.currentTime / video.duration) + '%'; });
    // Si en 4 s no ha empezado (red lenta, autoplay bloqueado), no tapa la portada.
    watchdog = win.setTimeout(() => { if (!(video.currentTime > 0)) close(); }, 4000);

    (doc.head || html).appendChild(style);
    const mount = () => {
      doc.body.appendChild(box);
      html.style.overflow = 'hidden';
      const p = video.play();
      if (p && p.catch) p.catch(close);
      try { skip.focus({preventScroll: true}); } catch (_) {}
    };
    if (doc.body) mount(); else doc.addEventListener('DOMContentLoaded', mount, {once: true});

    // Cambio de idioma con la intro en marcha: el vídeo del otro idioma, en el mismo segundo; la música sigue.
    function setLang(next) {
      if (closed || next === lang || !has(next)) return;
      lang = next; t = LABELS[next] || LABELS.es;
      if (!shown.includes(next)) shown.push(next);
      const at = video.currentTime;
      video.addEventListener('loadedmetadata', () => { try { video.currentTime = at; } catch (_) {} const p = video.play(); if (p && p.catch) p.catch(() => {}); }, {once: true});
      video.src = pickSource(win.innerWidth, win.devicePixelRatio, next);
      // Y la música del otro idioma, en el mismo punto, si suena.
      const nextTrack = pickMusic(win.location.search, next);
      if (audio && nextTrack && nextTrack !== track) {
        track = nextTrack;
        audio.pause();
        audio.src = MUSIC[nextTrack];
        if (soundOn) audio.addEventListener('canplay', () => { if (!closed && soundOn) syncPlay(); }, {once: true});
      }
      skip.textContent = t.skip + ' ✕'; box.setAttribute('aria-label', t.aria); paintSound();
    }
    return {setLang, get lang() { return lang; }};
  }

  return {SEEN_KEY, LANG_KEY, SOURCES, MUSIC, MUSIC_BY_LANG, resolveLang, activeBrand, parseSeen, shouldShow, pickSource, pickMusic, start};
});
