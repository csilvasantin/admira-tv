// Intro en vídeo de la portada de admira.tv (17-oct-2026): «Espacios que responden», una vez por sesión y por
// idioma, sigue la píldora ESP/ENG, una música por idioma y solo con el look por defecto. Contrato: docs/intro-tv.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync, statSync} from 'node:fs';

const require = createRequire(import.meta.url);
const intro = require('./assets/intro-tv/intro.js');
const read = path => readFileSync(new URL('./' + path, import.meta.url), 'utf8');

test('la portada carga la intro después de la píldora de idioma', () => {
  const html = read('index.html');
  const tag = html.match(/<script defer src="\/assets\/intro-tv\/intro\.js\?v=[^"]+"><\/script>/);
  assert.ok(tag, 'carga /assets/intro-tv/intro.js con versión y defer');
  assert.ok(html.indexOf('/assets/portada-idioma.js') < html.indexOf(tag[0]), 'el idioma se resuelve antes');
  assert.doesNotMatch(html.slice(html.indexOf('<!-- Intro en vídeo'), html.indexOf(tag[0])), /localStorage|sessionStorage/, 'la home no nombra el almacenamiento');
});

test('el idioma, como portada-idioma.js: ?lang → admtv-lang → español', () => {
  assert.equal(intro.LANG_KEY, 'admtv-lang');
  assert.equal(intro.resolveLang('?lang=en', 'es'), 'en');
  assert.equal(intro.resolveLang('', 'en'), 'en');
  assert.equal(intro.resolveLang('?lang=fr', ''), 'es');
});

test('una vez por idioma, sin «reducir movimiento», sin marca blanca; ?intro=0|1', () => {
  const base = {search: '', lang: 'es', reducedMotion: false, seen: false, brand: ''};
  assert.equal(intro.shouldShow(base), true);
  assert.equal(intro.shouldShow({...base, seen: true}), false);
  assert.equal(intro.shouldShow({...base, reducedMotion: true}), false);
  assert.equal(intro.shouldShow({...base, brand: 'starbucks'}), false);
  assert.equal(intro.shouldShow({...base, search: '?intro=0'}), false);
  assert.equal(intro.shouldShow({...base, seen: true, search: '?intro=1'}), true);
  assert.deepEqual(intro.parseSeen('es,en'), ['es', 'en']);
  assert.equal(intro.activeBrand('?marca=admira', 'altadis'), '');
});

test('vídeo y música del idioma; 1080p desde 1600 píxeles reales', () => {
  assert.equal(intro.pickSource(1920, 1, 'es'), '/assets/intro-tv/intro-tv-a-es-1080.mp4');
  assert.equal(intro.pickSource(1280, 1, 'en'), '/assets/intro-tv/intro-tv-a-en-720.mp4');
  assert.equal(intro.pickMusic('', 'es'), 'campanas');
  assert.equal(intro.pickMusic('', 'en'), 'pulso');
  assert.equal(intro.pickMusic('?musica=0', 'es'), '');
});

test('los vídeos y las músicas existen, en .mp4 y con un peso razonable', () => {
  for (const src of Object.values(intro.SOURCES).flatMap(set => Object.values(set))) {
    const size = statSync(new URL('.' + src, import.meta.url)).size;
    assert.ok(size > 500_000 && size < 12_000_000, src + ' pesa ' + size);
  }
  for (const src of Object.values(intro.MUSIC)) {
    assert.match(src, /\.mp4$/, 'Cloudflare no sirve .m4a por rangos');
    const size = statSync(new URL('.' + src, import.meta.url)).size;
    assert.ok(size > 50_000 && size < 1_000_000, src + ' pesa ' + size);
  }
});

test('se salta con botón o Esc, sigue el cambio de idioma y para la música al cerrar', () => {
  const src = read('assets/intro-tv/intro.js');
  for (const text of ['Saltar intro', 'Skip intro', 'Activar sonido', 'Turn sound on']) assert.ok(src.includes(text), text);
  assert.match(src, /e\.key === 'Escape'/);
  assert.match(src, /addEventListener\('admira:languagechange'/);
  assert.match(src, /const nextTrack = pickMusic\(win\.location\.search, next\);/);
  assert.match(src, /if \(audio\) \{ try \{ audio\.pause\(\); \} catch \(_\) \{\} \}/);
});

test('la intro queda por encima del marco de admira.tv (cabecera, raíles y aviso de contexto)', () => {
  const src = read('assets/intro-tv/intro.js');
  const z = Number((src.match(/\.tv-intro\{[^}]*z-index:(\d+)/) || [])[1]);
  assert.ok(z > 2147483010, 'z-index ' + z + ' por encima de la cabecera');
});
