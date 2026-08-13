/* Tabla de flota y modo experto del CMS (Carlos, 12-ago-2026):
   «las columnas de la tabla tienen que ser resizeables y estar más marcadas, y
   Remote, si ya lo hemos pasado a modo experto, no tiene que aparecer» (FLT-1405)
   «Experto del mismo color y tamaño que está ahora pero delante de Mando, y en
   MacBookPro16 podemos escoger entre otros equipos IoT del proyecto con un
   desplegable para controlarlos» (FLT-1406). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const cms = await readFile(new URL("./cms.html", import.meta.url), "utf8");
const nav = await readFile(new URL("./admira-nav.js", import.meta.url), "utf8");

test("cada columna declara su mínimo: sin eso el tirador la deja en nada", () => {
  const colgroup = /<colgroup>([\s\S]*?)<\/colgroup>/.exec(cms);
  assert.ok(colgroup, "la tabla necesita colgroup para poder reajustarse");
  const mins = [...colgroup[1].matchAll(/data-min="(\d+)"/g)].map((m) => Number(m[1]));
  const ths = [...cms.matchAll(/<th data-col="[a-z]+"/g)].length;
  assert.equal(mins.length, ths, "un <col> por columna, o los anchos se descolocan");
  assert.ok(mins.every((m) => m >= 60), "ningún mínimo puede dejar una columna ilegible");
});

test("el tirador se maneja con ratón Y con teclado, y recuerda los anchos", () => {
  assert.match(cms, /tirador\.className='col-resizer'; tirador\.tabIndex=0/);
  assert.match(cms, /setAttribute\('role','separator'\)/);
  assert.match(cms, /aria-label','Reajustar columna '\+nombre/);
  assert.match(cms, /addEventListener\('pointerdown'/);
  assert.match(cms, /ev\.key!=='ArrowLeft'&&ev\.key!=='ArrowRight'/);
  assert.match(cms, /addEventListener\('dblclick'/);      // autoajuste al contenido
  assert.match(cms, /localStorage\.setItem\(CLAVE/);      // persistencia
  // Y nunca por debajo del mínimo, ni arrastrando ni con las flechas.
  assert.equal((cms.match(/Math\.max\(minimoDe\(cols\(\)\[indice\]\)/g) || []).length, 2);
});

test("las columnas se ven: línea entre ellas y cabecera destacada", () => {
  assert.match(cms, /\.ebTable th,\.ebTable td\{border-right:1px solid var\(--line\)/);
  assert.match(cms, /\.ebTable th:last-child,\.ebTable td:last-child\{border-right:0\}/);
  assert.match(cms, /\.ebTable thead th\{border-bottom:2px solid #2c405e;font-weight:800/);
  assert.match(cms, /table-layout:fixed/);
  // El tirador se marca al tocarlo, para saber que se puede arrastrar.
  assert.match(cms, /\.col-resizer:hover::after,\.col-resizer\.dragging::after/);
});

test("Remote ya no ocupa una tercera columna: vive sólo en Experto", () => {
  assert.doesNotMatch(cms, /<th data-col="remote">/);
  assert.doesNotMatch(cms, /data-col="remote"/);
  assert.doesNotMatch(cms, /class="ebBtn ebRemote"/);
  assert.match(cms, /<iframe id="mandoFrame"/);
});

test("EXPERTO va delante de Mando, con el color y tamaño que ya tenía", () => {
  const h4 = /<h4><span class="mandoExp">Experto<\/span> · Mando ·/.exec(cms);
  assert.ok(h4, "el rótulo Experto tiene que ir DELANTE de Mando, en la misma línea");
  // Mismo color y tamaño que el EXPERTO del chrome (.admexp-hd de admira-nav.js).
  const chrome = /\.admexp-hd\{[^}]*font-size:(\d+)px;font-weight:(\d+);color:(#[0-9a-f]+)/.exec(nav);
  assert.ok(chrome, "no encuentro el estilo del EXPERTO del chrome");
  const propio = /\.mandoExp\{font-size:(\d+)px;font-weight:(\d+);color:(#[0-9a-f]+)/.exec(cms);
  assert.ok(propio, "falta el estilo del rótulo del panel");
  assert.deepEqual(propio.slice(1, 4), chrome.slice(1, 4), "no puede inventarse un estilo nuevo");
});

test("el desplegable ofrece equipos del proyecto y gobierna al elegirlos", () => {
  assert.match(cms, /<select id="mandoPick"/);
  assert.match(cms, /function equiposDelProyecto\(\)/);
  // Se leen de la tabla que ya está filtrada por proyecto: una sola fuente.
  assert.match(cms, /querySelectorAll\('#ebBody tr\[data-screen\]'\)/);
  assert.match(cms, /data-screen="'\+esc\(p\.screen\)\+'" data-online=/);
  assert.match(cms, /e\.target\.id==='mandoPick' && e\.target\.value\) abreMando\(e\.target\.value\)/);
  // Se repuebla después de cada refresco y conserva el player activo si sigue vivo.
  assert.match(cms, /refrescaMandoPick\(fr&&fr\.dataset\.screen\)/);
  assert.match(cms, /const elegido=lista\.some\(x=>x\.id===actual\)\?actual/);
  assert.match(cms, /sel\.value=elegido/);
  // La primera apertura de Experto estrena el player seleccionado; cerrar no reabre.
  assert.match(cms, /icon\.getAttribute\('aria-expanded'\)!=='true'/);
  assert.match(cms, /if\(sel&&sel\.value\) abreMando\(sel\.value\)/);
  // Y cambiar de equipo recarga el mando, no la página.
  assert.match(cms, /if\(fr\.dataset\.screen!==s\)\{ fr\.src=url; fr\.dataset\.screen=s; \}/);
});

test("Circuito muestra debajo la playlist efectiva del player", () => {
  assert.match(cms, /<th data-col="circuito" data-sort="text">Circuito · playlist<\/th>/);
  assert.match(cms, /PLAYLIST: 'https:\/\/omnipublicity-api\.csilvasantin\.workers\.dev\/control\/playlist\?screen='/);
  assert.match(cms, /function playlistInfo\(p\)/);
  assert.match(cms, /Playlist activa · '\+n\+' pieza/);
  assert.match(cms, /\(pos\+1\)\+'\/'\+n\+' en antena'/);
  assert.match(cms, /<td data-col="circuito">'\+circuitCell\+'<\/td>/);
  assert.doesNotMatch(cms, /Circuito · sitio/);
});

test("el panel experto va sin franja de título y el mando lo llena entero", async () => {
  const frame = await readFile(new URL("./admira-frame.js", import.meta.url), "utf8");
  const cmsSrc = await readFile(new URL("./cms.html", import.meta.url), "utf8");
  // La franja EXPERTO no se monta en el panel inferior; los laterales la conservan.
  assert.match(frame, /if \(side\.key !== "bottom"\) panel\.appendChild\(hd\);/);
  // El iframe crece con el panel (flex), sin el tope de 560px.
  assert.match(cmsSrc, /\.admando\{ flex:1 1 auto; min-height:0; display:flex; flex-direction:column; \}/);
  assert.doesNotMatch(cmsSrc, /height:min\(560px,52vh\)/);
  // Y al abrir el mando, el panel abre a toda altura (el asa sigue mandando después).
  assert.match(cmsSrc, /pn\.style\.height='min\(88vh,1000px\)'/);
});
