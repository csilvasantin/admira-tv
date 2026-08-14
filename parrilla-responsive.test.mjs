import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Ley de la casa: cero barras de scroll horizontal en responsive.
// admira-nav.js impone body{overflow-x:hidden} en todo admira.tv, así que una
// barra nunca llega a verse: lo que se sale se RECORTA en silencio. Por eso la
// parrilla no puede confiar en la barra como aviso y estas pruebas vigilan las
// causas —los suelos de anchura— en vez del síntoma.
const html = await readFile(new URL("./parrilla/index.html", import.meta.url), "utf8");

// Un mismo ancho puede tener VARIOS bloques @media repartidos por la hoja
// (850px tiene dos), así que se devuelven todos juntos: mirar sólo el primero
// dejaba media hoja sin vigilar.
const bloqueMedia = (max) => {
  const marca = `@media(max-width:${max}px){`;
  const trozos = [];
  let desde = 0;
  for (;;) {
    const i = html.indexOf(marca, desde);
    if (i === -1) break;
    let nivel = 0;
    let fin = -1;
    for (let j = i + marca.length - 1; j < html.length; j++) {
      if (html[j] === "{") nivel++;
      else if (html[j] === "}" && --nivel === 0) { fin = j + 1; break; }
    }
    assert.notEqual(fin, -1, `bloque @media(max-width:${max}px) sin cerrar`);
    trozos.push(html.slice(i, fin));
    desde = fin;
  }
  assert.notEqual(trozos.length, 0, `falta el bloque @media(max-width:${max}px)`);
  return trozos.join("\n");
};

// Un item de rejilla o de flex arrastra `min-width:auto`, cuyo suelo es su
// min-content: la columna crece por debajo y empuja el bloque fuera del
// viewport. `1fr` es `minmax(auto,1fr)` y hereda ese mismo suelo; la forma
// segura es `minmax(0,1fr)`. Esto es lo que sacaba .editor/.preview 14px a
// 320px antes del arreglo.
test("ninguna rejilla estrecha usa 1fr pelado, que hereda el suelo min-content", () => {
  for (const max of [850, 600]) {
    const bloque = bloqueMedia(max);
    const pelados = [...bloque.matchAll(/grid-template-columns:([^;}]+)/g)]
      .map((m) => m[1].trim())
      .filter((v) => /(^|\s)1fr(\s|$)/.test(v.replace(/minmax\([^)]*\)/g, "")));
    assert.deepEqual(
      pelados,
      [],
      `en @media(max-width:${max}px) hay columnas 1fr sin minmax(0,…): ${pelados.join(" | ")}`,
    );
  }
});

test("los dos paneles grandes pueden encoger dentro de su columna", () => {
  assert.match(html, /\.editor,\.preview\{padding:18px;min-width:0\}/);
  assert.match(bloqueMedia(850), /\.hero,\.layout\{grid-template-columns:minmax\(0,1fr\)\}/);
});

test("el selector de contexto no lo ensancha el nombre del Xpacio", () => {
  // .context-field es item de rejilla Y rejilla a su vez: hacen falta las dos.
  assert.match(html, /\.context-field\{display:grid;grid-template-columns:minmax\(0,1fr\);gap:6px;min-width:0\}/);
  assert.match(html, /\.context-field label\{display:block;min-width:0;overflow:hidden;/);
  // El contador no rompe línea, así que si no se recorta, empuja.
  const count = html.match(/\.context-count\{[^}]*\}/)[0];
  assert.match(count, /white-space:nowrap/);
  assert.match(count, /display:inline-block/);
  assert.match(count, /max-width:100%/);
  assert.match(count, /text-overflow:ellipsis/);
});

test("la pastilla de balance encoge en vez de empujar", () => {
  const top = html.match(/\.balance-top\{[^}]*\}/)[0];
  assert.match(top, /min-width:0/);
  assert.match(html, /\.balance-top span\{[^}]*min-width:0/);
  assert.match(html, /\.legend b\{min-width:0;overflow-wrap:anywhere\}/);
  // La leyenda NO lleva flex-wrap: a 1024px partía en dos líneas y eso movía
  // el escritorio, que es justo lo que no puede tocarse.
  assert.doesNotMatch(html.match(/\.legend\{[^}]*\}/)[0], /flex-wrap/);
});

test("editar el título de un slot no impone un suelo que a 320px no cabe", () => {
  const input = html.match(/\.slot-title-input\{[^}]*\}/)[0];
  assert.match(input, /min-width:0/);
  assert.doesNotMatch(input, /min-width:\s*\d+px/);
});

// Presupuesto real de la escaleta al ancho más estrecho que soportamos.
// Se leen los números DEL CSS, no se copian: si alguien engorda la miniatura o
// los botones, la cuenta deja de cuadrar y el test lo canta.
test("las columnas de .slot caben en la escaleta a 320px", () => {
  const movil = bloqueMedia(600);
  const cols = movil.match(/\.slot\{grid-template-columns:([^}]+)\}/)[1].trim();
  const gap = Number(movil.match(/\.slot\{[^}]*gap:(\d+)px/)[1]);
  const thumb = Number(movil.match(/\.slot-thumb\{width:(\d+)px/)[1]);
  const pistas = cols.split(/\s+/);
  assert.equal(pistas.length, 5, `esperaba 5 columnas en móvil, hay ${pistas.length}: ${cols}`);
  assert.match(pistas[3], /^minmax\(0,/, "la columna del título debe poder encoger a 0");
  assert.equal(Number(pistas[2].replace("px", "")), thumb, "la columna 3 y .slot-thumb deben medir lo mismo");

  const fijas = [pistas[0], pistas[1], pistas[2]].map((p) => Number(p.replace("px", "")));
  const moves = html.match(/\.moves button\{width:(\d+)px/)[1];
  const movesGap = html.match(/\.moves\{display:flex;gap:(\d+)px\}/)[1];
  const anchoMoves = Number(moves) * 2 + Number(movesGap); // dos botones y su hueco
  const padSlot = Number(movil.match(/\.slot\{[^}]*padding:\d+px (\d+)px/)?.[1] ?? html.match(/\.slot\{[^}]*padding:9px (\d+)px/)[1]);

  const pagePad = Number(movil.match(/\.page\{padding:\d+px (\d+)px/)[1]);
  const editorPad = Number(html.match(/\.editor,\.preview\{padding:(\d+)px/)[1]);

  const viewport = 320;
  const anchoEscaleta = viewport - pagePad * 2 - editorPad * 2 - 2; // 2 = borde del panel
  const minimoSlot =
    fijas.reduce((a, b) => a + b, 0) + anchoMoves + gap * 4 + padSlot * 2 + 2; // 2 = borde del slot

  assert.ok(
    minimoSlot <= anchoEscaleta,
    `un .slot necesita ${minimoSlot}px y la escaleta sólo tiene ${anchoEscaleta}px a 320px`,
  );
  // Y que quede sitio real para el título, no cero justo.
  assert.ok(
    anchoEscaleta - minimoSlot >= 20,
    `al título le quedan ${anchoEscaleta - minimoSlot}px a 320px: demasiado apurado`,
  );
});
