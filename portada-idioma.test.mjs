// La portada en español o en inglés (Carlos, 15-oct-2026): sin ⌘ Experto, y en su hueco una
// píldora del mismo tamaño que ☰ y ▤. «ENG» pasa la portada a inglés y entonces dice «ESP».
// El idioma lo decide /assets/portada-idioma.js: ?lang=en|es → admtv-lang → español.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const home = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const src = readFileSync(new URL('./assets/portada-idioma.js', import.meta.url), 'utf8');

// Un DOM mínimo: lo justo para que el script resuelva el idioma, traduzca y pinte la píldora.
class Nodo {
  constructor(attrs = {}, texto = '') { this.attrs = {...attrs}; this.textContent = texto; this.oyentes = {}; }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  hasAttribute(k) { return k in this.attrs; }
  addEventListener(t, fn) { (this.oyentes[t] ||= []).push(fn); }
  dispatchEvent(e) { (this.oyentes[e.type] || []).forEach((fn) => fn(e)); return true; }
  click() { this.dispatchEvent({type: 'click'}); }
}

function montar({url = 'https://admira.tv/', guardado = null} = {}) {
  const almacen = new Map(guardado ? [['admtv-lang', guardado]] : []);
  const html = new Nodo({lang: 'es'});
  const pildora = new Nodo({id: 'ykLangToggle', lang: 'en'}, 'ENG');
  const titulo = new Nodo({'data-es': 'Espacios que ', 'data-en': 'Spaces that '}, 'Espacios que ');
  const cerrar = new Nodo({'aria-label': 'Cerrar vídeo', 'data-es-aria-label': 'Cerrar vídeo', 'data-en-aria-label': 'Close video'});
  const nav = ['#soluciones', '#ecosistema', '/player/', '/canal.html'].map((href) => new Nodo({href}, {'#soluciones': '20 soluciones', '#ecosistema': 'Ecosistema', '/player/': 'Player', '/canal.html': 'Ver canal'}[href]));
  // La marca blanca reescribe /canal.html como URL completa con ?marca=…: se traduce igual.
  nav[3].setAttribute('href', 'https://admira.tv/canal.html?marca=lumbre&proyecto=starbucks');
  const rotulo = new Nodo({}, 'Opciones');
  const todos = [titulo, cerrar];
  const eventos = [], urls = [];
  const document = new Nodo();
  Object.assign(document, {
    readyState: 'interactive',
    documentElement: html,
    getElementById: (id) => (id === 'ykLangToggle' ? pildora : null),
    querySelectorAll(sel) {
      const attr = /^\[([\w-]+)\]$/.exec(sel);
      if (attr) return todos.filter((n) => n.hasAttribute(attr[1]));
      if (sel.includes('nav a[href]')) return nav;
      if (sel.includes('.yk-ico-lbl')) return [rotulo];
      return [];
    },
  });
  document.addEventListener('admira:languagechange', (e) => eventos.push(e.detail.lang));
  const window = {
    document,
    location: new URL(url),
    localStorage: {getItem: (k) => (almacen.has(k) ? almacen.get(k) : null), setItem: (k, v) => almacen.set(k, String(v))},
    history: {state: null, replaceState: (_s, _t, u) => urls.push(u)},
    dispatchEvent() { return true; },
  };
  vm.runInNewContext(src, {window, URL, URLSearchParams, CustomEvent, Event});
  return {api: window.AdmiraPortadaIdioma, html, pildora, titulo, cerrar, nav, rotulo, almacen, eventos, urls};
}

test('el idioma sale de ?lang, después de admtv-lang y, si no, es español', () => {
  const {resolver} = montar().api;
  assert.equal(resolver('?lang=en', null), 'en');
  assert.equal(resolver('?lang=EN', 'es'), 'en');
  assert.equal(resolver('?lang=es', 'en'), 'es', 'la URL manda sobre lo guardado');
  assert.equal(resolver('', 'en'), 'en');
  assert.equal(resolver('?lang=fr', 'en'), 'en', 'un ?lang raro no cuenta');
  assert.equal(resolver('?lang=fr', 'xx'), 'es');
  assert.equal(resolver('', null), 'es');
});

test('sin elección la portada queda en español, con «ENG», y no guarda nada', () => {
  const p = montar();
  assert.equal(p.html.getAttribute('lang'), 'es');
  assert.equal(p.pildora.textContent, 'ENG');
  assert.equal(p.pildora.getAttribute('lang'), 'en');
  assert.match(p.pildora.getAttribute('aria-label'), /^ENG · /);
  assert.equal(p.titulo.textContent, 'Espacios que ');
  assert.equal(p.almacen.size, 0);
  assert.deepEqual(p.eventos, []);
});

test('ENG pasa a inglés (texto, atributos, navegación, armazón) y entonces la píldora dice ESP', () => {
  const p = montar();
  p.pildora.click();
  assert.equal(p.html.getAttribute('lang'), 'en');
  assert.equal(p.titulo.textContent, 'Spaces that ');
  assert.equal(p.cerrar.getAttribute('aria-label'), 'Close video');
  assert.deepEqual(p.nav.map((a) => a.textContent), ['20 solutions', 'Ecosystem', 'Player', 'Watch channel']);
  assert.equal(p.rotulo.textContent, 'Options');
  assert.equal(p.pildora.textContent, 'ESP');
  assert.equal(p.pildora.getAttribute('lang'), 'es');
  assert.match(p.pildora.getAttribute('aria-label'), /^ESP · Cambiar a español$/);
  assert.equal(p.almacen.get('admtv-lang'), 'en');
  assert.deepEqual(p.eventos, ['en']);
  assert.deepEqual(p.urls, [], 'sin ?lang en la URL no se añade');
  // ESP vuelve al español tal cual estaba.
  p.pildora.click();
  assert.equal(p.html.getAttribute('lang'), 'es');
  assert.equal(p.titulo.textContent, 'Espacios que ');
  assert.equal(p.cerrar.getAttribute('aria-label'), 'Cerrar vídeo');
  assert.deepEqual(p.nav.map((a) => a.textContent), ['20 soluciones', 'Ecosistema', 'Player', 'Ver canal']);
  assert.equal(p.rotulo.textContent, 'Opciones');
  assert.equal(p.pildora.textContent, 'ENG');
  assert.equal(p.almacen.get('admtv-lang'), 'es');
  assert.deepEqual(p.eventos, ['en', 'es']);
});

test('?lang=en entra en inglés, lo guarda y, al cambiar, la URL dice el idioma nuevo', () => {
  const p = montar({url: 'https://admira.tv/?lang=en#soluciones', guardado: 'es'});
  assert.equal(p.html.getAttribute('lang'), 'en');
  assert.equal(p.pildora.textContent, 'ESP');
  assert.equal(p.almacen.get('admtv-lang'), 'en');
  assert.deepEqual(p.eventos, ['en']);
  p.pildora.click();
  assert.deepEqual(p.urls, ['/?lang=es#soluciones']);
});

test('lo guardado (admtv-lang=en) abre la portada en inglés sin tocar la URL', () => {
  const p = montar({guardado: 'en'});
  assert.equal(p.html.getAttribute('lang'), 'en');
  assert.equal(p.pildora.textContent, 'ESP');
  assert.deepEqual(p.urls, []);
});

test('la píldora: en el hueco de ⌘, del tamaño de ☰ y ▤, y el script va antes que el armazón', () => {
  assert.match(home, /<button type="button" class="yk-ico yk-lang" id="ykLangToggle" data-yk-hueco-experto data-admira-compact-control lang="en" aria-label="ENG · Switch to English" title="Switch to English">ENG<\/button>/);
  assert.match(home, /html\.yk-head-mode header\.yk-head \.yk-ico\.yk-lang\{width:36px;min-width:36px;padding:0;font:700 12px\/1 var\(--yk-mono\)/);
  assert.match(home, /@media\(max-width:720px\)\{html\.yk-head-mode header\.yk-head \.yk-ico\.yk-lang\{width:40px;min-width:40px\}\}/);
  const idioma = home.indexOf('<script defer src="/assets/portada-idioma.js?v=');
  assert.ok(idioma > 0, 'la portada carga portada-idioma.js con su token de versión');
  assert.ok(idioma < home.indexOf('<script defer src="/admiranext-frame.js?v='), 'antes que el armazón');
  // El almacenamiento vive en el script, nunca en la home (public-showcase.test.mjs).
  assert.match(src, /admtv-lang/);
  assert.match(src, /admira:languagechange/);
});

test('cada texto traducible lleva su par ES/EN y el español es el texto de siempre', () => {
  const pares = [...home.matchAll(/data-es="([^"]*)" data-en="([^"]*)"[^>]*>([^<]*)</g)];
  assert.ok(pares.length >= 20, `pares encontrados: ${pares.length}`);
  for (const [, es, en, texto] of pares) {
    assert.equal(texto, es, `el HTML dice «${texto}» y data-es «${es}»`);
    assert.ok(en.trim() && en !== es, `falta el inglés de «${es}»`);
  }
  assert.equal((home.match(/ data-es="/g) || []).length, (home.match(/ data-en="/g) || []).length);
  assert.equal((home.match(/ data-es-aria-label="/g) || []).length, (home.match(/ data-en-aria-label="/g) || []).length);
  assert.equal((home.match(/ data-es-title="/g) || []).length, (home.match(/ data-en-title="/g) || []).length);
  // El CSS deja sólo la mitad inglesa de los pares generados; el HTML generado no lleva data-es.
  assert.match(home, /html\[lang="en"\] \.app-description:not\(\.app-description-en\)\{display:none\}/);
  const generado = home.match(/<!-- apps:generado[\s\S]*?<!-- \/apps:generado -->/)[0] + home.match(/<!-- pilares:generado[\s\S]*?<!-- \/pilares:generado -->/)[0];
  assert.doesNotMatch(generado, /data-es/);
});
