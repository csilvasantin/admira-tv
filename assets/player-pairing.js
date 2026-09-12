(function (root) {
  'use strict';
  const qs = new URLSearchParams(location.search);
  let screen = qs.get('screen') || '';
  try { screen ||= localStorage.getItem('adtv_screen') || ''; } catch (_) {}
  const enabled = /^[a-z0-9][a-z0-9_-]{1,79}$/.test(screen) && !/^(?:xtore-)?virtual-/.test(screen) && !qs.has('rundown') && qs.get('xtoreParent') !== '1';
  const key = 'adtv_pairing:' + screen;
  let pairing = { source: null, revision: 0 }, busy = false, initialized = false, rules = null;
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (saved && saved.screen === screen && (saved.source === null || /^(?:xtore-)?virtual-[a-z0-9-]+$/.test(saved.source?.screen))) pairing = saved;
  } catch (_) {}
  async function refresh() {
    if (!enabled || busy) return;
    busy = true;
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch('/api/virtual-players?device=' + encodeURIComponent(screen), { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('Assignment unavailable');
      const data = await response.json();
      if (data.ok !== true || !data.pairing || !Number.isSafeInteger(data.pairing.revision)) throw new Error('Invalid assignment');
      const changed = pairing.revision !== data.pairing.revision;
      pairing = { ...data.pairing, screen };
      try { localStorage.setItem(key, JSON.stringify(pairing)); } catch (_) {}
      if (initialized && changed) location.reload();
    } catch (_) {
      // Keep the last confirmed assignment and cached content through outages.
      console.warn('[Player virtual] Asociación no disponible; se conserva la última confirmada.');
    } finally { clearTimeout(timer); busy = false; initialized = true; }
  }
  root.AdmiraPlayerPairing = {
    get source() { return enabled ? pairing.source : null; },
    get rules() { return rules; },
    ready: refresh().then(async()=>{
      if(enabled && pairing.source?.screen==='xtore-virtual-zapatillas'){
        try { const music=await import('/videoanalytics/xtore/conditional-music.mjs'); rules=music.xtoreMusicRules(pairing.source.screen); }
        catch(_){ console.warn('[Player virtual] Reglas musicales no disponibles.'); }
      }
    })
  };
  if (enabled) setInterval(refresh, 15000);
})(window);
