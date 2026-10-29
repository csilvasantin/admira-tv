/* ?ids= · piezas concretas del Stock para un player (Carlos, 29-oct-2026 · misión DCL-fb1c7a60).
   El mapa de admiranext.com fija una lista de 3 piezas por Xperiencia. Se comprueba el código
   REAL del canal: cómo se leen los ids, que entran en seg.ids desde el arranque, que el motor
   condicional no los borra al parar y que la red de seguridad cubre también este caso. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const canal = await readFile(new URL("./canal.html", import.meta.url), "utf8");
const linea = canal.slice(canal.indexOf("const URL_IDS="), canal.indexOf("\n", canal.indexOf("const URL_IDS=")));

function urlIds(search) {
  return JSON.parse(vm.runInNewContext(linea + ";JSON.stringify(URL_IDS)", {qs: new URLSearchParams(search), String, Set, JSON}));
}

test("?ids= admite ids del Stock, sin repetir y como mucho 12", () => {
  assert.deepEqual(urlIds("?ids=1793136648124-yvy6vk,auto-66123b7f442db76aff1a"), ["1793136648124-yvy6vk", "auto-66123b7f442db76aff1a"]);
  assert.deepEqual(urlIds("?ids= a , a ,b"), ["a", "b"]);
  assert.deepEqual(urlIds("?ids=ok,<script>,../x,c%20d,e"), ["ok", "e"], "solo letras, números y guiones");
  assert.equal(urlIds("?ids=" + Array.from({length: 20}, (_, i) => "p" + i).join(",")).length, 12);
  assert.deepEqual(urlIds("?tag=negocio"), [], "sin ?ids= el player sigue como siempre");
});

test("los ids de la URL entran en seg.ids desde el arranque y el condicional no los borra al parar", () => {
  assert.match(canal, /const seg = \{\n  ids: URL_IDS\.length \? URL_IDS\.slice\(\) : null,/);
  assert.match(canal, /seg\.ids=URL_IDS\.length\?URL_IDS\.slice\(\):null; \}/);
  assert.doesNotMatch(canal, /seg\.ids\)\{ seg\.ids=null; \}/, "parar el motor ya no deja el player sin sus piezas");
});

test("si ninguna pieza fijada está en el catálogo, cae a su tag y busca las que faltan en el índice completo", () => {
  assert.match(canal, /\(playoutMode==='conditional'\|\|URL_IDS\.length\) && seg\.ids && seg\.ids\.length && !playlist\.length/);
  assert.match(canal, /if\(URL_IDS\.length\) resolveMatrixAssets\(URL_IDS\)/);
  assert.match(canal, /precacheIds\(ids\); if\(playoutMode==='conditional'\|\|URL_IDS\.length\)\{ seenSig=''; rebuild\(false\); \}/);
});
