import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const canal = await readFile(new URL("./canal.html", import.meta.url), "utf8");

test("el MUPI evita el zoom y conserva la ficha dentro del modo clean", () => {
  assert.match(canal, /#mupi\{[^}]*touch-action:manipulation/);
  assert.match(canal, /<aside id="localInfo"[^>]*hidden/);
  assert.doesNotMatch(canal, /\.clean\s+#localInfo\s*\{[^}]*display:none/);
});

test("doble clic y doble toque abren la misma ficha viva", () => {
  assert.match(canal, /addEventListener\('dblclick',localInfoDoubleClick\)/);
  assert.match(canal, /addEventListener\('pointerup',localInfoPointerUp,\{passive:false\}\)/);
  assert.match(canal, /now-_localInfoTapAt<=420/);
  assert.match(canal, /Math\.hypot\(dx,dy\)<=56/);
  assert.match(canal, /_localInfoIgnoreDblUntil=now\+550/);
  assert.match(canal, /window\.ADMIRA_TOGGLE_LOCAL_INFO=localInfoToggle/);
});

test("el gesto no secuestra controles y la ficha ofrece metadatos reales", () => {
  assert.match(canal, /closest\('button,input,select,textarea,a,#seg,#tap'\)/);
  for (const label of [
    "estado local", "tipo", "posición", "progreso", "resolución",
    "tamaño", "origen", "pantalla"
  ]) assert.match(canal, new RegExp(`row\\('${label}'`));
  assert.doesNotMatch(canal, /row\('id'/);
  assert.match(canal, /function localInfoStock\(it\)/);
  assert.match(canal, /String\(x\.id\)===String\(it\.id\)/);
  assert.match(canal, /li-primary-tag/);
  assert.match(canal, /'#'\+String\(meta\.num\)/);
  assert.match(canal, /testTags\(meta\)/);
  assert.match(canal, /setInterval\(localInfoRender,1000\)/);
});
