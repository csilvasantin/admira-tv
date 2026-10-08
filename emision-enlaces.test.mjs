import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// /emision/ tiene que estar a mano desde donde se edita (parrilla y Flota), con la misma barra que el resto del
// sitio y protegida con el mismo permiso que /api/emision.
const leer = f => readFile(new URL(f, import.meta.url), "utf8");
const [pagina, parrilla, cms, gate, censo] = await Promise.all(["./emision/index.html", "./parrilla/index.html", "./cms.html", "./auth-gate.js", "./subapps.json"].map(leer));

test("la parrilla enlaza «¿Qué emite ahora?» y carga el aviso de «Por defecto» anulada", () => {
  assert.match(parrilla, /<a class="btn" id="emisionLink" href="\/emision\/"[^>]*>¿Qué emite ahora\? ↗<\/a>/);
  assert.match(parrilla, /<script src="\/emision\/aviso-parrilla\.js\?v=[^"]+" defer><\/script>\n<\/body>/);
});

test("Flota enlaza /emision/ con el mismo dispositivo que edita «Por defecto»", () => {
  assert.match(cms, /const emisionLink='<a class="ebPlaylistLink" href="\/emision\/\?screen='\+encodeURIComponent\(parrillaDevice\)/);
  assert.equal((cms.match(/chanCell = '<div>'\+parrillaLink\+' · '\+emisionLink\+'<\/div>/g) || []).length, 2);
});

test("misma barra del sitio, sin controles propios en ella", () => {
  assert.match(pagina, /<script src="\/admira-nav\.js\?v=[^"]+"><\/script>/);
  assert.match(pagina, /<script src="\/admira-frame\.js\?v=[^"]+" defer><\/script>/);
  const nav = /window\.ADMIRA_NAV=(\{[^;]*\});/.exec(pagina);
  assert.ok(nav, "falta window.ADMIRA_NAV");
  assert.doesNotMatch(nav[1], /topRight/, "lo propio de la vista va a los paneles, no a la barra");
});

test("protegida como /api/emision: digitalsignage-player, gate versionado y en el censo", () => {
  assert.match(gate, /"emision":"digitalsignage-player"/);
  assert.match(pagina, /<script src="\/auth-gate\.js\?v=[^"]+"><\/script>/);
  const e = JSON.parse(censo).find(x => x.slug === "emision");
  assert.equal(e && e.ruta, "/emision/");
});

test("«Ver en canal» abre canal.html sólo tras avisar, y el previo local no llama a la red", () => {
  assert.match(pagina, /id="avisoCanal"/);
  assert.match(pagina, /window\.open\('\/canal\.html\?screen='\+encodeURIComponent\(state\.screen\),'_blank','noopener'\)/);
  const previo = pagina.slice(pagina.indexOf("// ── Previo local"), pagina.indexOf("// ── Eventos"));
  assert.ok(previo.length > 200);
  assert.doesNotMatch(previo, /fetch\(|XMLHttpRequest|sendBeacon/);
});
