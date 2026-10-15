// Interfaz cuadrática de AdmiraNeXT en la portada (encargos #5136 · #5142 · #5152).
// Carlos (4-oct-2026, 23:01): admira.tv no la tenía. Guardián de lo mínimo: barra fija con el
// logotipo oficial, ☰ Opciones · ▤ Avanzado con su rótulo en el HTML, el armazón canónico de
// admiranext.com (copia en /admiranext-frame.*) y la portada intacta debajo.
// Desde el 15-oct-2026 la portada NO tiene ⌘ Experto (Carlos: «la primera página no tiene
// modo Experto»): en su hueco va la píldora de idioma ENG/ESP (portada-idioma.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const home = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const js = readFileSync(new URL('./admiranext-frame.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('./admiranext-frame.css', import.meta.url), 'utf8');

test('la portada monta el armazón cuadrático en modo cabecera', () => {
  assert.match(home, /<body data-yk-frame="cabecera" data-yk-auto="on" data-yk-experto="off"/);
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

test('☰ Opciones y ▤ Avanzado llevan su rótulo en el HTML y el armazón los reutiliza', () => {
  for (const [id, glifo, rotulo] of [['ykOptionsToggle', '☰', 'Opciones'], ['ykAdvancedToggle', '▤', 'Avanzado']]) {
    assert.match(home, new RegExp(`id="${id}"[^>]*><span aria-hidden="true">${glifo}</span><span class="yk-ico-lbl">${rotulo}</span>`));
  }
  assert.match(js, /doc\.getElementById\(IDS\[lado\]\.toggle\)/);
});

test('la portada no tiene ⌘ Experto: en su hueco, la píldora de idioma', () => {
  assert.doesNotMatch(home, /ykExpertToggle|ykExpertRail|ADMIRA_FRAME_VERBS|experto-verbos-suite|suite\/loader\.js/);
  // La píldora va en la cabecera, justo detrás de ▤ (el sitio de ⌘), y empieza en «ENG».
  const cabecera = home.match(/<header class="yk-head" data-yk-head>[\s\S]*?<\/header>/)[0];
  assert.doesNotMatch(cabecera, /⌘|Experto/);
  assert.match(cabecera, /id="ykAdvancedToggle"[^\n]*<\/button>\n\s*<button type="button" class="yk-ico yk-lang" id="ykLangToggle"[^>]*>ENG<\/button>\n\s*<\/header>/);
  // El armazón: sin ⌘ no crea ni reutiliza su botón, ni la franja, ni el CLI, ni carga la suite.
  assert.match(js, /var sinExperto = body\.dataset\.ykExperto === 'off';/);
  assert.match(js, /var LADOS = sinExperto \? \['left', 'right'\] : \['left', 'right', 'bottom'\];/);
  assert.match(js, /var btnAbajo = sinExperto \? null : icono\('bottom', nomAbajo\);/);
  assert.match(js, /var hayCli = !sinExperto && /);
  assert.match(js, /var hayAbajo = !sinExperto && /);
  assert.match(js, /if \(btnAbajo\) btnAbajo\.addEventListener\('click'/);
  assert.match(js, /document\.body\.dataset\.ykExperto==="off"\)return;var s=document\.createElement\("script"\);s\.src="https:\/\/www\.admiranext\.com\/suite\/loader\.js/);
  assert.match(js, /doc\.querySelector\('\[data-yk-hueco-experto\]'\)/);
});

test('paneles superpuestos y redimensionables; el armazón conserva el CLI del canon (/help)', () => {
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
