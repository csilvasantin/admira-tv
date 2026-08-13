import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const cms = await readFile(new URL("./cms.html", import.meta.url), "utf8");

test("EN EMISIÓN resuelve el título vivo y usa Stock como respaldo", () => {
  assert.match(cms, /NOW\s+: 'https:\/\/api\.admira\.store\/signage\/now\?screen='/);
  assert.match(cms, /STOCK\s+: 'https:\/\/api\.admira\.store\/stock\/list\?limit=200'/);
  assert.match(cms, /EB_STOCK\?Promise\.resolve\(\{data:\{items:EB_STOCK\}\}\):grab\(EB\.STOCK,8000\)/);
  assert.match(cms, /const id=String\(\(live&&live\.id\)\|\|p\.showing_id\|\|''\)/);
  assert.match(cms, /String\(\(live&&live\.title\)\|\|\(stockById\[id\]&&stockById\[id\]\.title\)\|\|''\)\.trim\(\)/);
});

test("el identificador técnico no vuelve a ser el rótulo visible", () => {
  assert.doesNotMatch(cms, /esc\(String\(p\.showing_id\)\.slice\(0,22\)\)/);
  assert.match(cms, /title="ID técnico: '\+esc\(info\.id\)\+'"/);
  assert.match(cms, /esc\(info\.title\)/);
  assert.match(cms, /title:title\|\|'Contenido sin título'/);
});

test("la columna se ordena por el nombre que ve una persona", () => {
  assert.match(cms, /emision:\s+p => pieceInfo\(p\)\.title\.toLowerCase\(\)/);
});
