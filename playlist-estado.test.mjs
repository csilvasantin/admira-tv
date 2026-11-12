import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const canal=fs.readFileSync(new URL('./canal.html',import.meta.url),'utf8');
const mando=fs.readFileSync(new URL('./mando.html',import.meta.url),'utf8');
test('el player informa nombre, total real y segmentos de descarga de su playlist',()=>{
  assert.match(canal,/function playlistInfo\(\)/);
  assert.match(canal,/_plPool=pool\?pool\.length:0/);
  assert.match(canal,/item\.playlist=playlistInfo\(\)/);
  assert.match(canal,/id="li-plbar"/);
  assert.match(canal,/row\('playlist',pli\.name/);
});
test('la línea de estado del player sólo vive dentro de la ficha Informar (pantalla sagrada)',()=>{
  const at=canal.indexOf('id="li-plbar"'), box=canal.lastIndexOf('id="localInfo"',at);
  assert.ok(box>0&&at-box<4000,'la barra está dentro de #localInfo');
});
test('el mando pinta siempre la línea de la playlist con verde/amarillo/rojo',()=>{
  assert.match(mando,/id="plBar"/); assert.match(mando,/function paintPlaylistStatus\(\)/);
  assert.match(mando,/\.pl-bar i\.g\{background:#2fd27a\}/); assert.match(mando,/\.pl-bar i\.y\{background:#ffd23f\}/);
  assert.match(mando,/window\._nowPlaylist=\(it&&it\.playlist\)/);
});
test('#ID fuera del feed de 300 se resuelve contra el índice completo (player y mando) y el botón dice Importar',()=>{
  assert.match(canal,/const ext=await stockItemByNum\(Number\(wanted\)\)/);
  assert.match(canal,/function ensureTaggedExtras\(\)/);
  assert.match(mando,/<button id="tagApply"[^>]*>Importar<\/button>/);
  assert.match(mando,/stock\.admira\.store\/stock\/index\.json/);
  assert.match(mando,/remotePlaylistData\(screen\),taggedNow\(screen\)/);
  assert.doesNotMatch(mando,/doneLabel='Sin confirmar'/);
  assert.match(mando,/Esperando descarga/);
});
