/* ⌘ Experto de admira.tv · verbos comunes de la Suite Admira (Carlos, 9-oct-2026).
 * La portada usa el marco canónico de admiranext.com (/admiranext-frame.js), cuyo CLI no traía
 * /idioma ni /arquitectura. Se registran aquí, sin tocar la copia del marco, vía ADMIRA_FRAME_VERBS:
 *   /idioma · /language        sin argumento alterna ESP ↔ ENG; con ESP|ENG (o es|en) lo fija.
 *   /arquitectura              abre https://www.admiranext.com/arquitectura en castellano.
 *   /architecture              la abre en inglés. Misma pestaña, como /demo.
 * El idioma se guarda en las mismas claves que la piel compartida (admiranext_expert_lang,
 * xtanco_lang, omnip-lang) y se avisa con admiranext:lang y admira:languagechange.
 * Nota: la portada de admira.tv es bilingüe en paralelo (ES con su EN debajo); no tiene capa de
 * traducción, así que /idioma cambia el idioma de la Suite (lang, preferencia, otras webs) y no el texto. */
(function (G) {
  'use strict';
  if (!G || !G.document) return;
  var ARQ_URL = 'https://www.admiranext.com/arquitectura';
  var CLAVES = ['admiranext_expert_lang', 'xtanco_lang', 'omnip-lang'];
  function actual() { return /^en/i.test(G.document.documentElement.lang || '') ? 'en' : 'es'; }
  function token(s) {
    var n = String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, '');
    if (!n) return '';
    if (/^(en|eng|english|ingles)$/.test(n)) return 'en';
    if (/^(es|esp|spa|spanish|espanol|castellano)$/.test(n)) return 'es';
    return null;
  }
  function guardar(l) { CLAVES.forEach(function (k) { try { G.localStorage.setItem(k, l); } catch (_) {} }); }
  function poner(l) {
    G.document.documentElement.lang = l;
    guardar(l);
    try {
      var u = new URL(G.location.href);
      if (u.searchParams.has('lang') && u.searchParams.get('lang') !== l) {
        u.searchParams.set('lang', l);
        G.history.replaceState(G.history.state, '', u.pathname + u.search + u.hash);
      }
    } catch (_) {}
    try { G.document.dispatchEvent(new CustomEvent('admiranext:lang', {detail: {lang: l}})); } catch (_) {}
    try { G.dispatchEvent(new CustomEvent('admira:languagechange', {detail: {lang: l, source: 'admira-tv-experto'}})); } catch (_) {}
  }
  function irArquitectura(l, ctx) {
    guardar(l);
    if (ctx) ctx.imprimir(l === 'en' ? 'Opening the technology org chart · ' + ARQ_URL : 'Abriendo el organigrama tecnológico · ' + ARQ_URL);
    G.setTimeout(function () { G.location.assign(ARQ_URL + '?lang=' + l); }, 250);
  }
  var verbos = [
    {id: 'idioma', aliases: ['language', 'languague', 'lang'], uso: '[ESP|ENG]',
      ayuda: 'Alterna castellano ↔ inglés (o lo fija con ESP|ENG) · Toggles Spanish ↔ English',
      run: function (args, ctx) {
        var t = token((args || []).join(''));
        if (t === null) { ctx.error('Uso: /idioma o /language (alterna), /idioma ESP|ENG'); return; }
        var next = t || (actual() === 'en' ? 'es' : 'en');
        poner(next);
        ctx.imprimir(next === 'en' ? 'Language: English' : 'Idioma: castellano');
      }},
    {id: 'arquitectura', aliases: ['organigrama-tecnologico'],
      ayuda: 'Abre el organigrama tecnológico de la Suite (admiranext.com/arquitectura)',
      run: function (args, ctx) { irArquitectura('es', ctx); }},
    {id: 'architecture', aliases: ['tech-chart'],
      ayuda: 'Opens the Suite technology org chart in English (admiranext.com/arquitectura)',
      run: function (args, ctx) { irArquitectura('en', ctx); }}
  ];
  G.ADMIRA_FRAME_VERBS = (Array.isArray(G.ADMIRA_FRAME_VERBS) ? G.ADMIRA_FRAME_VERBS : []).concat(verbos);
  // Si el marco ya arrancó (orden de carga distinto), registra directamente.
  if (G.AdmiraFrame && typeof G.AdmiraFrame.verbo === 'function') verbos.forEach(G.AdmiraFrame.verbo);
  G.AdmiraTvVerbos = {token: token, actual: actual};
})(typeof window !== 'undefined' ? window : null);
