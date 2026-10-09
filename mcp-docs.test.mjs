// Cobertura de la documentación para agentes (MCP) y personas (help) — 9-oct-2026.
//
// Cada documento de mcp/ que se anuncia tiene que existir, estar enlazado desde el hub (mcp/index.html), listado en
// llms.txt y descrito en manifest.json; y cada enlace de admira.tv que citan (help, mcp, docs, páginas) tiene que
// resolver a un fichero o a un ancla de verdad en este repo.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const leer = ruta => readFileSync(new URL("./" + ruta, import.meta.url), "utf8");
const existe = ruta => existsSync(new URL("./" + ruta, import.meta.url));

const manifestTexto = leer("mcp/manifest.json");
const manifest = JSON.parse(manifestTexto);
const hub = leer("mcp/index.html");
const llms = leer("mcp/llms.txt");
const help = leer("help/index.html");
const anclasHelp = new Set([...help.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
const anclasHub = new Set([...hub.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));

// Los documentos del 8-9 de octubre: fichero, clave del manifiesto y ancla del hub.
const NUEVOS = [
  { md: "programacion.md", clave: "programacion", hub: "programacion", help: "programacion" },
  { md: "emision.md", clave: "emision", hub: "emision", help: "que-emite" },
  { md: "ipad-nativo.md", clave: "ipad_nativo", hub: "ipad-nativo", help: "ipad-nativo" },
  { md: "ipad-pruebas.md", clave: "ipad_pruebas", hub: "ipad-pruebas", help: null },
  { md: "acceso-paginas.md", clave: "acceso_paginas", hub: "acceso-paginas", help: "paginas-acceso" },
  { md: "cambios-2026-10-09.md", clave: "cambios_2026_10_09", hub: "cambios-2026-10-09", help: "novedades-2026-10-09" },
];

/** Una URL de admira.tv (absoluta o «/ruta») → fichero del repo, o null si no es un fichero estático comprobable. */
function ficheroDe(url) {
  let ruta = url.replace(/^https:\/\/(www\.)?admira\.tv/, "");
  if (!ruta.startsWith("/") || ruta.startsWith("//")) return null;
  ruta = ruta.replace(/[?#].*$/, "");
  if (/^\/(api|auth|users\/api)\//.test(ruta)) return null;          // funciones, no ficheros
  ruta = ruta.slice(1);
  if (ruta === "" || ruta.endsWith("/")) ruta += "index.html";
  return decodeURIComponent(ruta);
}
function compruebaEnlace(url, donde) {
  const fichero = ficheroDe(url);
  if (fichero) assert.ok(existe(fichero), `${donde}: ${url} → ${fichero} no existe`);
  const ancla = /^(?:https:\/\/(?:www\.)?admira\.tv)?\/help\/#([^"'\s)]+)/.exec(url);
  if (ancla) assert.ok(anclasHelp.has(ancla[1]), `${donde}: ${url} → falta id="${ancla[1]}" en help/index.html`);
  const anclaHub = /^(?:https:\/\/(?:www\.)?admira\.tv)?\/mcp\/#([^"'\s)]+)/.exec(url);
  if (anclaHub) assert.ok(anclasHub.has(anclaHub[1]), `${donde}: ${url} → falta id="${anclaHub[1]}" en mcp/index.html`);
}
const urlsAdmira = texto => [...texto.matchAll(/https:\/\/(?:www\.)?admira\.tv\/[^\s"'<>)`|\]]*/g)].map(m => m[0].replace(/[.,;:»]+$/, ""));

test("manifest.json es JSON válido, conserva su esquema y está en el formato del repo (2 espacios)", () => {
  for (const k of ["name", "title", "version", "site", "hub", "llms_txt", "help_humans", "repo", "mcp_server", "http_api", "trampas", "federation"]) {
    assert.ok(k in manifest, `falta la clave ${k}`);
  }
  assert.equal(manifest.hub, "https://admira.tv/mcp/");
  assert.equal(manifestTexto, JSON.stringify(manifest, null, 2) + "\n", "manifest.json con sangría de 2 espacios y salto final");
});

test("cada documento nuevo existe, está en el hub, en llms.txt y en el manifiesto", () => {
  for (const n of NUEVOS) {
    assert.ok(existe("mcp/" + n.md), `falta mcp/${n.md}`);
    const doc = leer("mcp/" + n.md);
    assert.match(doc, /^# /, `${n.md} empieza con un título`);
    assert.match(doc, /^## EN · summary$/m, `${n.md} lleva su resumen en inglés`);
    assert.ok(hub.includes(`href="/mcp/${n.md}"`), `el hub no enlaza /mcp/${n.md}`);
    assert.ok(anclasHub.has(n.hub), `el hub no tiene id="${n.hub}"`);
    assert.ok(llms.includes(`https://admira.tv/mcp/${n.md}`), `llms.txt no lista ${n.md}`);
    const seccion = manifest[n.clave];
    assert.ok(seccion && typeof seccion === "object", `el manifiesto no tiene la sección ${n.clave}`);
    assert.equal(seccion.doc, `https://admira.tv/mcp/${n.md}`, `${n.clave}.doc`);
    if (n.help) {
      assert.ok(anclasHelp.has(n.help), `help/index.html no tiene id="${n.help}"`);
      assert.ok(help.includes(`href="#${n.help}"`), `el índice del help no enlaza #${n.help}`);
    }
  }
});

test("los enlaces de admira.tv del manifiesto, del hub, del help y de los documentos nuevos resuelven", () => {
  for (const url of urlsAdmira(manifestTexto)) compruebaEnlace(url, "manifest.json");
  for (const n of NUEVOS) for (const url of urlsAdmira(leer("mcp/" + n.md))) compruebaEnlace(url, n.md);
  for (const [nombre, html] of [["mcp/index.html", hub], ["help/index.html", help]]) {
    for (const m of html.matchAll(/href="(\/(?:mcp|docs|help|emision|programacion|parrilla|playlists)\/[^"]*)"/g)) compruebaEnlace(m[1].replace(/&amp;/g, "&"), nombre);
    if (nombre === "help/index.html") {
      for (const m of html.matchAll(/href="#([^"]+)"/g)) assert.ok(anclasHelp.has(m[1]), `help/index.html enlaza #${m[1]} sin sección`);
    }
  }
});

test("el registro del 8-9 de octubre describe y enlaza cada PR", () => {
  const cambios = leer("mcp/cambios-2026-10-09.md");
  for (const pr of manifest.cambios_2026_10_09.admira_tv_prs) {
    const fila = cambios.split("\n").find(l => l.startsWith(`| [#${pr}](https://github.com/csilvasantin/admira-tv/pull/${pr})`));
    assert.ok(fila, `falta la fila de admira.tv #${pr}`);
    const descripcion = fila.split("|")[2].trim();
    const palabras = descripcion.split(/\s+/).filter(Boolean).length;
    assert.ok(palabras >= 3 && palabras <= 8, `#${pr}: la descripción corta tiene ${palabras} palabras («${descripcion}»)`);
  }
  for (const url of manifest.cambios_2026_10_09.related) assert.ok(cambios.includes(`](${url})`), `falta ${url} en el registro`);
});

test("programacion.md deja claro que el motor no se enciende y que hoy manda el KV", () => {
  const doc = leer("mcp/programacion.md");
  assert.match(doc, /motor_bloqueado_hasta_E13/);
  assert.match(doc, /No encender `motor`/);
  assert.match(doc, /manda el KV de siempre/);
  assert.match(doc, /PROGRAMACION_SERVICE_KEY` \*\*no está puesta\*\*/);
  assert.equal(manifest.programacion.status.flags.motor, "apagado");
  for (const ruta of ["/api/programacion/importar", "/api/programacion/banderas", "/api/programacion/sombra", "/api/programacion/auditoria"]) {
    assert.ok(doc.includes(ruta), `programacion.md no documenta ${ruta}`);
  }
});

test("acceso-paginas.md documenta el contrato real de auth-gate.js", () => {
  const gate = leer("auth-gate.js"), doc = leer("mcp/acceso-paginas.md");
  assert.match(gate, /ready: function \(\)/);
  assert.match(gate, /expired: function \(\)/);
  assert.match(doc, /AdmiraTvAuth\.ready\(\)/);
  assert.match(doc, /AdmiraTvAuth\.expired\(\)/);
  assert.match(doc, /una vez por minuto/);
});
