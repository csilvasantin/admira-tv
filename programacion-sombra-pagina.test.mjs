import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// /programacion/sombra/ (E6 · modelo único de playlists): el panel de discrepancias del modo sombra. La misma barra que
// el resto del sitio, protegido con el mismo permiso que /api/programacion y /api/emision, y cada fila enlaza a lo que
// emite hoy la pantalla y a lo que resolvería el motor nuevo.
const leer = f => readFile(new URL(f, import.meta.url), "utf8");
const [pagina, gate, index] = await Promise.all(["./programacion/sombra/index.html", "./auth-gate.js", "./index.html"].map(leer));

test("misma barra del sitio, sin controles propios en ella; lo suyo va a los paneles ▤ y ⌘", () => {
  assert.match(pagina, /<script src="\/admira-nav\.js\?v=[^"]+"><\/script>/);
  assert.match(pagina, /<script src="\/admira-frame\.js\?v=[^"]+" defer><\/script>/);
  const nav = /window\.ADMIRA_NAV=(\{[^;]*\});/.exec(pagina);
  assert.ok(nav, "falta window.ADMIRA_NAV");
  assert.doesNotMatch(nav[1], /topRight/, "lo propio de la vista va a los paneles, no a la barra");
  assert.match(pagina, /data-af-slot="right"[\s\S]*id="bandera"/, "la bandera, en ▤ Avanzado");
  assert.match(pagina, /data-af-slot="bottom"[\s\S]*id="raw"/, "la respuesta cruda, en ⌘ Experto");
});

test("protegida como /api/programacion: digitalsignage-player y gate con el token de la versión canónica", () => {
  assert.match(gate, /"programacion":"digitalsignage-player"/);
  const version = /admiranext-version" content="([^"]+)/.exec(index)[1], token = version.replace(/^v\./, "").replaceAll(":", "");
  assert.ok(pagina.includes(`/auth-gate.js?v=${token}`), "el gate con el token de index.html");
  assert.ok(pagina.indexOf("/auth-gate.js") < pagina.indexOf("<style>"), "lo más arriba posible");
});

test("lee /api/programacion/sombra, filtra por veredicto y cada fila enlaza a /emision/ y a /api/programacion", () => {
  assert.match(pagina, /var API='\/api\/programacion\/sombra'/);
  for (const v of ["distinta", "equivalente", "igual"]) assert.match(pagina, new RegExp(`'${v}'`));
  assert.match(pagina, /href="\/emision\/\?screen='\+s\+'"/);
  assert.match(pagina, /href="\/api\/programacion\?screen='\+s\+'"/);
  assert.match(pagina, /credentials:'same-origin'/);
});

test("bilingüe ES/EN, con el mismo vocabulario de motivos que el comparador", async () => {
  const { MOTIVOS } = await import("./functions/api/_programacion/comparador.js");
  const bloque = lang => pagina.slice(pagina.indexOf(`    ${lang}:{eyebrow:`), pagina.indexOf(lang === "es" ? "    en:{eyebrow:" : "  var ORDEN="));
  for (const lang of ["es", "en"]) {
    const b = bloque(lang);
    for (const m of Object.values(MOTIVOS).flat()) assert.match(b, new RegExp(`\\b${m}:'`), `${lang} · ${m}`);
  }
  assert.match(pagina, /id="langEs"[\s\S]*id="langEn"/);
});

test("la bandera se cambia sólo con confirmación y nunca el motor", () => {
  const f = pagina.slice(pagina.indexOf("function cambiarBandera"), pagina.indexOf("// ── Eventos"));
  assert.match(f, /window\.confirm\(/);
  assert.match(f, /JSON\.stringify\(\{sombra:on,/);
  assert.doesNotMatch(pagina, /motor:\s*['"]?encendido/);
});
