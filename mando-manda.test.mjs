/* El mando tiene que MANDAR. Carlos, 12-ago-2026: «el mando a distancia tiene que
   mandar, es decir si le pongo el tag de un contenido en concreto se tiene que
   emitir». No lo hacía, y el motivo era una junta mal hecha entre dos piezas que
   por separado funcionaban:

     · el canal SOLO acepta  tag-<lista>   (applyCtrlCmd, regex estricta)
     · el mando enviaba      tag <lista>   (con ESPACIO)

   Nunca casaban, así que aplicar un metatag no producía ningún cambio en pantalla
   NI ningún error: el canal devuelve 'ignored' en silencio. Encima el operador
   escribe la etiqueta con almohadilla (#666) y los tags reales del Stock llevan
   tilde (música), y el regex no admite ni una cosa ni la otra.

   Este test no copia el regex: lo EXTRAE de canal.html, para que si alguien lo
   cambia allí, aquí salte. Es el único modo de que las dos piezas no se vuelvan
   a separar sin que nadie se entere. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const canal = await readFile(new URL("./canal.html", import.meta.url), "utf8");
const mando = await readFile(new URL("./mando.html", import.meta.url), "utf8");

// El regex vivo del canal, tal cual está escrito allí.
const fuenteRegex = /const t=(\/\^tag-.*?\/)\.exec\(cmd\)/.exec(canal);
assert.ok(fuenteRegex, "no encuentro el regex de tag- en canal.html: ¿lo han movido?");
const RE_CANAL = new RegExp(fuenteRegex[1].slice(1, -1));

// Y la función real del mando, extraída del HTML y ejecutada de verdad.
function extrae(src, nombre) {
  const i = src.indexOf(`function ${nombre}(`);
  assert.notEqual(i, -1, `falta ${nombre}`);
  let j = src.indexOf("{", i), lv = 0, f = j;
  for (; f < src.length; f++) {
    if (src[f] === "{") lv++;
    else if (src[f] === "}") { lv--; if (!lv) { f++; break; } }
  }
  return src.slice(i, f);
}
const ctx = vm.createContext({ String });
vm.runInContext(extrae(mando, "canonTag"), ctx);
const canon = (v) => vm.runInContext(`canonTag(${JSON.stringify(v)})`, ctx);
const comando = (v) => "tag-" + canon(v);

test("lo que emite el mando lo entiende el canal, siempre", () => {
  const casos = [
    "666", "#666",                    // lo que Carlos escribió en la captura
    "musica", "música", "MÚSICA",     // el tag real del Stock lleva tilde
    "#navidad", " oferta ", "oferta 2x1",
    "xtanco-valencia", "bcn-prensa",
    "musica,vertical", "musica+vertical",   // tags anidados (AND)
    "Tecnología Creativa",
  ];
  for (const c of casos) {
    assert.match(comando(c), RE_CANAL, `el canal ignoraría «${comando(c)}» (entrada: ${c})`);
  }
});

test("quitar el filtro también tiene que casar: es `tag-`, no `tag`", () => {
  assert.equal(comando(""), "tag-");
  assert.match("tag-", RE_CANAL);
  // Ésta era la forma vieja, y el canal la ignora en silencio.
  assert.doesNotMatch("tag", RE_CANAL);
  assert.doesNotMatch("tag musica", RE_CANAL);
});

test("la canonización es la misma que la del canal", () => {
  assert.equal(canon("#666"), "666");
  assert.equal(canon("MÚSICA"), "musica");
  assert.equal(canon("oferta 2x1"), "oferta-2x1");
  assert.equal(canon("  #Navidad  "), "navidad");
  assert.equal(canon("musica,vertical"), "musica,vertical");
  // Nada de basura que el regex rechace ni guiones colgando.
  assert.equal(canon("¡oferta!! 3x2"), "oferta-3x2");
  assert.equal(canon("---"), "");
});

test("el mando ya no envía la forma con espacio", () => {
  assert.doesNotMatch(mando, /sendRemote\(t\?\s*\('tag '/);
  assert.match(mando, /sendRemote\('tag-'\+limpio\)/);
});

test("el canal enciende la línea verde solo, sin tocar nada", () => {
  // La descarga en caliente ya existe (r52): si nada del segmento pedido está en
  // disco y hay algo en antena, la emisión NO se corta y sale la línea de 3px.
  assert.match(canal, /function warmSwitchWait\(\)/);
  assert.match(canal, /else if\(stage\.querySelector\('video,img,audio'\)\)\{ warmSwitchWait\(\); return; \}/);
  assert.match(canal, /if\(_warmWaiting\) dlLine\(frac\)/);
  // El cssText va partido en dos literales concatenados: se comprueban por separado.
  assert.match(canal, /id='admDlLine'|_dlLineEl\.id='admDlLine'/);
  assert.match(canal, /bottom:0;height:3px/);
  assert.match(canal, /background:linear-gradient\(90deg,#39d353,#3df08a\)/);
  // Y se apaga al terminar el cambio.
  assert.match(canal, /if\(_warmWaiting\)\{ _warmWaiting=false; dlLine\(null\); \}/);
});
