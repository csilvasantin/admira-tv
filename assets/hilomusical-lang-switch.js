/*! hilomusical-lang-switch.js — Opciones EN↔ES for cliente.xpacio.hilomusical
 * Preference key: adtv_hilomusical_lang_<brand> = en|es
 * Broadcast: window event admira:hilomusical-lang {brand,lang,playlist}
 * Playlist convention: name exactly "<brand>.xpacio.hilomusical"
 */
(function () {
  'use strict';
  if (window.AdmiraHiloMusicalLang && window.AdmiraHiloMusicalLang.__on) return;

  var FEED = 'https://api.admira.store/hilomusical/next';
  var KEY = function (brand) { return 'adtv_hilomusical_lang_' + brand; };

  function brandFromUrl() {
    try {
      var q = new URLSearchParams(location.search).get('marca');
      if (q && /^[a-z0-9][a-z0-9-]{0,40}$/i.test(q) && q.toLowerCase() !== 'admira') return q.toLowerCase();
    } catch (_) {}
    try {
      var s = sessionStorage.getItem('admira_marca') || localStorage.getItem('admira_marca');
      if (s && /^[a-z0-9][a-z0-9-]{0,40}$/i.test(s) && s.toLowerCase() !== 'admira') return s.toLowerCase();
    } catch (_) {}
    return '';
  }

  function getLang(brand) {
    try {
      var v = localStorage.getItem(KEY(brand));
      if (v === 'en' || v === 'es') return v;
    } catch (_) {}
    return 'en';
  }

  function setLang(brand, lang) {
    lang = lang === 'es' ? 'es' : 'en';
    try { localStorage.setItem(KEY(brand), lang); } catch (_) {}
    var detail = { brand: brand, lang: lang, playlist: brand + '.xpacio.hilomusical' };
    try { window.dispatchEvent(new CustomEvent('admira:hilomusical-lang', { detail: detail })); } catch (_) {}
    try {
      if (window.XpaceStarbucksMusic && typeof window.XpaceStarbucksMusic.setActiveLang === 'function' && brand === 'starbucks') {
        window.XpaceStarbucksMusic.setActiveLang(lang);
      }
    } catch (_) {}
    return detail;
  }

  function classify(title) {
    var t = String(title || '');
    if (/\bES\b|español|spanish|Nyla|Prioridad|Flagship Tarde/i.test(t)) return 'es';
    if (/\bEN\b|english|Deep House|Retail Morning|Soft Retail/i.test(t)) return 'en';
    return '';
  }

  function pickActive(playlist, lang) {
    var items = Array.isArray(playlist) ? playlist.slice() : [];
    var tagged = items.filter(function (it) { return classify(it.title) === lang; });
    return (tagged.length ? tagged : items)[0] || null;
  }

  function mountOptions(brand) {
    brand = brand || brandFromUrl();
    if (!brand) return null;
    var host = document.querySelector('[data-af-slot="left"][data-hilomusical-lang]') ||
      document.getElementById('hiloLangSwitch');
    if (!host) {
      host = document.createElement('div');
      host.id = 'hiloLangSwitch';
      host.className = 'afSlotHidden';
      host.setAttribute('data-af-slot', 'left');
      host.setAttribute('data-hilomusical-lang', brand);
      host.setAttribute('aria-label', 'Hilo musical · idioma activo');
      (document.body || document.documentElement).appendChild(host);
    }
    var lang = getLang(brand);
    host.innerHTML =
      '<div style="padding:10px 12px;border:1px solid rgba(170,136,255,.28);border-radius:10px;margin:8px 10px;background:rgba(20,24,38,.55)">' +
      '<div style="font:600 11px/1.2 ui-sans-serif,system-ui;letter-spacing:.08em;text-transform:uppercase;opacity:.75;margin-bottom:8px">♪ Hilo musical</div>' +
      '<div style="font:500 12px/1.35 ui-sans-serif,system-ui;margin-bottom:8px;opacity:.9">' + brand + '.xpacio.hilomusical</div>' +
      '<div role="group" aria-label="Idioma activo del hilo" style="display:flex;gap:6px">' +
      '<button type="button" data-hilo-lang="en" style="flex:1;padding:8px 10px;border-radius:8px;border:1px solid ' + (lang === 'en' ? '#76b900' : 'rgba(255,255,255,.18)') + ';background:' + (lang === 'en' ? 'rgba(118,185,0,.22)' : 'transparent') + ';color:inherit;font-weight:700;cursor:pointer">EN</button>' +
      '<button type="button" data-hilo-lang="es" style="flex:1;padding:8px 10px;border-radius:8px;border:1px solid ' + (lang === 'es' ? '#76b900' : 'rgba(255,255,255,.18)') + ';background:' + (lang === 'es' ? 'rgba(118,185,0,.22)' : 'transparent') + ';color:inherit;font-weight:700;cursor:pointer">ES</button>' +
      '</div>' +
      '<div data-hilo-now style="margin-top:8px;font:12px/1.35 ui-monospace,Menlo,monospace;opacity:.8">Cargando…</div>' +
      '</div>';
    host.onclick = function (e) {
      var btn = e.target.closest('[data-hilo-lang]');
      if (!btn) return;
      setLang(brand, btn.getAttribute('data-hilo-lang'));
      mountOptions(brand);
      refreshNow(brand);
    };
    refreshNow(brand);
    return host;
  }

  function refreshNow(brand) {
    var el = document.querySelector('[data-hilo-now]');
    if (!el) return;
    var lang = getLang(brand);
    fetch(FEED + '?store=' + encodeURIComponent(brand) + '&since=0', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var active = pickActive((d && d.playlist) || [], lang);
        el.textContent = active
          ? ('Activa (' + lang.toUpperCase() + '): ' + (active.title || active.id))
          : ('Sin pistas ' + lang.toUpperCase() + ' en el feed');
      })
      .catch(function () { el.textContent = 'Feed no disponible'; });
  }

  window.AdmiraHiloMusicalLang = {
    __on: true,
    brandFromUrl: brandFromUrl,
    getLang: getLang,
    setLang: setLang,
    playlistName: function (brand) { return (brand || brandFromUrl() || 'cliente') + '.xpacio.hilomusical'; },
    mountOptions: mountOptions,
    pickActive: pickActive
  };

  function boot() {
    var brand = brandFromUrl();
    if (brand) mountOptions(brand);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
