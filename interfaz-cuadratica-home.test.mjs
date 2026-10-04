// Interfaz cuadrática de AdmiraNeXT en la portada (encargos #5136 · #5142 · #5152).
// Carlos (4-oct-2026, 23:01): admira.tv no la tenía. Guardián de lo mínimo: barra fija con el
// logotipo oficial, ☰ Opciones · ▤ Avanzado · ⌘ Experto con su rótulo en el HTML, el armazón
// canónico de admiranext.com (copia en /admiranext-frame.*) y la portada intacta debajo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const home = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const js = readFileSync(new URL('./admiranext-frame.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('./admiranext-frame.css', import.meta.url), 'utf8');

test('la portada monta el armazón cuadrático en modo cabecera', () => {
  assert.match(home, /<body data-yk-frame="cabecera" data-yk-auto="on"/);
  assert.match(home, /<header class="yk-head" data-yk-head>/);
  assert.match(home, /href="\/admiranext-frame\.css\?v=/);
  assert.match(home, /<script defer src="\/admiranext-frame\.js\?v=/);
});

test('logotipo oficial ADmiraNeXT con sus cuatro neones', () => {
  assert.match(home, /<a class="brand" href="\/"[^>]*><span class="yk-wm-admira">ADmira<\/span><span class="yk-wm-next"><span class="yk-wm-n">N<\/span><span class="yk-wm-e">e<\/span><span class="yk-wm-x">X<\/span><span class="yk-wm-t">T<\/span><\/span><\/a>/);
  for (const [cls, color] of [['n', '#FF3366'], ['e', '#FFCC00'], ['x', '#33FF99'], ['t', '#FF33CC']]) {
    assert.match(css, new RegExp(`\\.yk-wm-${cls}\\{ color: ${color} \\}`));
  }
});

test('☰ Opciones, ▤ Avanzado y ⌘ Experto llevan su rótulo en el HTML y el armazón los reutiliza', () => {
  for (const [id, glifo, rotulo] of [['ykOptionsToggle', '☰', 'Opciones'], ['ykAdvancedToggle', '▤', 'Avanzado'], ['ykExpertToggle', '⌘', 'Experto']]) {
    assert.match(home, new RegExp(`id="${id}"[^>]*><span aria-hidden="true">${glifo}</span><span class="yk-ico-lbl">${rotulo}</span>`));
  }
  assert.match(js, /doc\.getElementById\(IDS\[lado\]\.toggle\)/);
});

test('paneles superpuestos y redimensionables, CLI con /help', () => {
  assert.match(js, /yk-resize/);
  assert.match(js, /id: 'help'/);
  assert.match(js, /placeholder', '\/help'/);
  assert.doesNotMatch(css, /\.yk-open-(left|right|bottom)[^{]*(body|main)\b[^{]*\{[^}]*(margin|padding|width)/);
});

test('la portada conserva sus funciones: 20 soluciones, Ecosistema, Player y Ver canal', () => {
  for (const enlace of ['href="#soluciones">20 soluciones', 'href="#ecosistema">Ecosistema', 'href="/player/">Player', 'href="/canal.html">Ver canal']) {
    assert.ok(home.includes(enlace), enlace);
  }
  assert.match(home, /id="publicApps"/);
  assert.match(home, /id="ecosistema"/);
  assert.match(home, /id="appVideoDialog"/);
});
