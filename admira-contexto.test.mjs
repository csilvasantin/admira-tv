// admira-contexto.js (encargo #5979): /marca y /proyecto con el módulo común en admira.tv.
// Ejecuta el pegamento de admira.tv y el shared/contexto.js de verdad en un vm, con una API simulada que
// aplica las reglas del servidor de #5934: /proyecto exige superusuario y filtra por locationId alsea-sbux-*.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const GLUE = await readFile(new URL("./admira-contexto.js", import.meta.url), "utf8");
const CONTEXTO = await readFile(new URL("./shared/contexto.js", import.meta.url), "utf8");
const SANDBOX = "https://pixer-ctx-5934-preview.csilvasantin.workers.dev";
const PROD = "https://api.admira.store";
const PANTALLAS = [
  { screen: "alsea-sbux-021", name: "Starbucks PG103", locationId: "alsea-sbux-021" },
  { screen: "alsea-sbux-030", name: "Starbucks Madrid", locationId: "alsea-sbux-030" },
  { screen: "sim-gracia-kiosko", name: "Canal Kiosk", circuit: "gracia" },
  { screen: "xtanco-led-frontal", name: "LED Frontal", circuit: "xtanco" },
];

function memoria(inicial = {}) {
  const m = new Map(Object.entries(inicial));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}

class Nodo {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.attrs = {}; this.style = { cssText: "" }; this.dataset = {}; this.textContent = ""; this.classList = clases(); }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === "id") this.id = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  appendChild(n) { this.children.push(n); n.parentNode = this; if (this.onAppend) this.onAppend(n); return n; }
  remove() {}
}
function clases(...ini) { const s = new Set(ini); return { contains: (c) => s.has(c), add: (c) => s.add(c), remove: (c) => s.delete(c) }; }

/* Un navegador mínimo: carga de scripts (shared/contexto.js de verdad, AdmiraMarca simulado), eventos y fetch. */
function navegador({ href = "https://morfeo-5979-contexto.admira-tv.pages.dev/parrilla/", local = {}, rolServidor = {}, guardado = {}, experto = true, tokenCaido = 0 } = {}) {
  const llamadas = [];
  const servidor = { ctx: new Map(Object.entries(guardado)) }; // email → {marca, proyecto}
  const emailDe = (auth) => ({ "Bearer tok-superuser": "csilvasantin@gmail.com", "Bearer tok-reader": "reader@preview.invalid", "Bearer tok-prod": "csilvasantin@gmail.com" })[auth || ""] || "";
  const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { "Content-Type": "application/json" } });
  async function fetchFalso(input, init = {}) {
    const url = new URL(typeof input === "string" ? input : input.url, href);
    const headers = new Headers(init.headers);
    llamadas.push({ url: url.href, method: init.method || "GET", auth: headers.get("Authorization") || "", body: init.body || "" });
    if (url.pathname === "/preview/session") return json({ ok: true, token: "tok-" + url.searchParams.get("role"), exp: Math.floor(Date.now() / 1000) + 900 });
    if (url.pathname === "/auth/api-token") return tokenCaido ? json({ ok: false, error: "api-token-unconfigured" }, tokenCaido) : json({ ok: true, token: "tok-prod", exp: Math.floor(Date.now() / 1000) + 900 });
    const email = emailDe(headers.get("Authorization"));
    const superusuario = email === "csilvasantin@gmail.com" && rolServidor[email] !== "lector";
    if (url.pathname === "/ctx") {
      if (!email) return json({ error: "session-required" }, 401);
      const actual = servidor.ctx.get(email) || { marca: null, proyecto: null };
      if ((init.method || "GET") === "POST") {
        const cambio = JSON.parse(init.body);
        if ("proyecto" in cambio && !superusuario) return json({ error: "superuser-required" }, 403);
        Object.assign(actual, cambio);
        servidor.ctx.set(email, actual);
      }
      return json({ ok: true, marca: actual.marca, proyecto: superusuario ? actual.proyecto : null, superusuario });
    }
    if (/\/(grid|signage)\/screens$/.test(url.pathname)) {
      const proyecto = url.searchParams.get("proyecto");
      if (proyecto && !superusuario) return json({ error: "superuser-required" }, 403);
      const lista = proyecto === "starbucks" ? PANTALLAS.filter((p) => String(p.locationId || "").startsWith("alsea-sbux-")) : PANTALLAS;
      return json({ ok: true, screens: lista });
    }
    if (url.pathname === "/stock/list" || url.pathname === "/stock/index.json") return json({ items: [], total: 0 });
    return json({ error: "not-found" }, 404);
  }

  const u = new URL(href);
  const html = new Nodo("html");
  html.lang = "es";
  if (experto) html.dataset.mode = "expert";
  const head = new Nodo("head"), body = new Nodo("body");
  const oyentes = {};
  const document = {
    documentElement: html, head, body, currentScript: null,
    createElement: (t) => new Nodo(t),
    querySelector: () => null, querySelectorAll: () => [],
    getElementById: (id) => [...head.children, ...body.children].find((n) => n.id === id) || null,
    addEventListener: (t, f) => (oyentes[t] = oyentes[t] || []).push(f),
    dispatchEvent: (e) => { (oyentes[e.type] || []).forEach((f) => f(e)); return true; },
  };
  const window = {
    document, location: { href: u.href, hostname: u.hostname, search: u.search, origin: u.origin, reload: () => { window.__recargas++; } },
    history: { state: null, replaceState: (_s, _t, h) => { const n = new URL(h, window.location.href); window.location.href = n.href; window.location.search = n.search; } },
    localStorage: memoria(local), sessionStorage: memoria(),
    fetch: fetchFalso, URL, URLSearchParams, Headers, Response, Promise, CustomEvent: class extends Event { constructor(t, o = {}) { super(t); this.detail = o.detail; } },
    setTimeout, clearTimeout, console, __recargas: 0, addEventListener: () => {},
  };
  window.window = window; window.self = window; window.top = window;
  // Carga de scripts: el contexto común se ejecuta de verdad; la marca se simula (es solo aspecto).
  head.onAppend = (n) => {
    if (n.tagName !== "SCRIPT") return;
    setTimeout(() => {
      if (n.src.startsWith("/shared/contexto.js")) {
        document.currentScript = n; vm.runInContext(CONTEXTO, ctx); document.currentScript = null;
      } else if (n.src.startsWith("/shared/marca-blanca.js")) {
        window.AdmiraMarca = { activar: async (id) => ({ ok: true, id, nombre: id }), desactivar: () => ({ ok: true }), parseArg: (v) => ({ kind: "id", id: v }), listar: async () => [{ id: "starbucks" }, { id: "lumbre" }] };
      }
      n.onload && n.onload();
    }, 0);
  };
  const ctx = vm.createContext(window);
  vm.runInContext(GLUE, ctx);
  return { window, llamadas, servidor };
}
const salida = () => { const lineas = []; const f = (t, c) => lineas.push((c ? "[" + c + "] " : "") + t); f.lineas = lineas; return f; };
const leer = (r) => r.json();
const plano = (x) => JSON.parse(JSON.stringify(x)); // los valores del vm son de otro reino

test("sin cliente activo las lecturas públicas no esperan ni llevan sesión", async () => {
  const { window, llamadas } = navegador();
  const datos = await window.fetch("https://api.admira.store/grid/screens", { cache: "no-store" }).then(leer);
  assert.equal(datos.screens.length, 4);
  const lectura = llamadas.find((c) => c.url === PROD + "/grid/screens");
  assert.ok(lectura, "va directa a la API pública");
  assert.equal(lectura.auth, "");
});

test("/proyecto starbucks de un superusuario: POST /ctx con su sesión, aviso y pista guardada", async () => {
  const { window, llamadas } = navegador();
  const out = salida();
  const r = await window.AdmiraContextoTv.ejecutar("/proyecto starbucks", out);
  assert.equal(r.ok, true);
  const post = llamadas.find((c) => c.url === SANDBOX + "/ctx" && c.method === "POST");
  assert.ok(post, "lo decide el servidor");
  assert.equal(post.auth, "Bearer tok-superuser");
  assert.deepEqual(JSON.parse(post.body), { proyecto: "starbucks" });
  assert.match(out.lineas.join("\n"), /proyecto: starbucks/);
  assert.equal(window.localStorage.getItem("admira_ctx_proyecto"), "starbucks");
  assert.equal(window.AdmiraContextoTv.proyecto(), "starbucks");
});

test("/proyecto de un usuario normal: el servidor lo rechaza y no cambia nada", async () => {
  const { window } = navegador({ href: "https://morfeo-5979-contexto.admira-tv.pages.dev/parrilla/?rol=lector" });
  const out = salida();
  const r = await window.AdmiraContextoTv.ejecutar("/proyecto starbucks", out);
  assert.equal(r.ok, false);
  assert.match(out.lineas.join("\n"), /\[err\] Solo un superusuario puede usar \/proyecto\./);
  assert.equal(window.AdmiraContextoTv.proyecto(), null);
  assert.equal(window.localStorage.getItem("admira_ctx_proyecto"), null);
});

test("con cliente activo las pantallas llegan filtradas y el selector se queda en ese cliente", async () => {
  const { window, llamadas } = navegador({ local: { admira_ctx_proyecto: "starbucks" }, guardado: { "csilvasantin@gmail.com": { marca: null, proyecto: "starbucks" } } });
  const datos = await window.fetch("https://api.admira.store/grid/screens", { cache: "no-store" }).then(leer);
  assert.deepEqual(plano(datos.screens.map((s) => s.screen)), ["alsea-sbux-021", "alsea-sbux-030"]);
  const lectura = llamadas.find((c) => c.url.startsWith(SANDBOX + "/grid/screens"));
  assert.equal(new URL(lectura.url).searchParams.get("proyecto"), "starbucks");
  assert.equal(lectura.auth, "Bearer tok-superuser");
  // Las fuentes locales (Xtancos, players virtuales) no pasan: solo lo que devolvió la API filtrada.
  const vista = window.AdmiraContextoTv.recortar([{ id: "kiosk" }, { id: "xtanco" }], PANTALLAS.concat([{ screen: "player-virtual-1" }]));
  assert.deepEqual(plano(vista.projects.map((p) => p.id)), ["starbucks"]);
  assert.deepEqual(plano(vista.screens.map((s) => s.screen)), ["alsea-sbux-021", "alsea-sbux-030"]);
  assert.ok(vista.screens.every((s) => s.projectId === "starbucks"));
});

test("?proyecto= de alguien sin permiso: se quita de la dirección y la lectura falla (nunca sin filtrar)", async () => {
  const { window, llamadas } = navegador({ href: "https://morfeo-5979-contexto.admira-tv.pages.dev/parrilla/?proyecto=starbucks&rol=lector" });
  await assert.rejects(window.fetch("https://api.admira.store/grid/screens"), /project-not-authorized/);
  assert.ok(!llamadas.some((c) => c.url.startsWith(PROD + "/grid/screens") || c.url.startsWith(SANDBOX + "/grid/screens")), "no se pide la lista");
  assert.ok(!new URL(window.location.href).searchParams.has("proyecto"));
});

test("en producción usa api.admira.store y /auth/api-token, y la lectura filtrada no vuelve a pasar por el filtro", async () => {
  const { window, llamadas } = navegador({ href: "https://admira.tv/parrilla/", local: { admira_ctx_proyecto: "starbucks" }, guardado: { "csilvasantin@gmail.com": { marca: null, proyecto: "starbucks" } } });
  assert.equal(window.AdmiraContextoTv.api, PROD);
  assert.equal(window.AdmiraContextoTv.preview, false);
  const datos = await window.fetch("https://api.admira.store/signage/screens").then(leer);
  assert.equal(datos.screens.length, 2);
  assert.ok(llamadas.some((c) => c.url.endsWith("/auth/api-token")), "token de la sesión de admira.tv");
  const lecturas = llamadas.filter((c) => c.url.startsWith(PROD + "/signage/screens"));
  assert.equal(lecturas.length, 1, "una sola lectura, sin bucle");
  assert.equal(new URL(lecturas[0].url).searchParams.get("proyecto"), "starbucks");
  assert.ok(!llamadas.some((c) => c.url.startsWith(SANDBOX)), "nada del sandbox en producción");
});

test("en producción, sin la API configurada (503), /proyecto explica que aún no está activo y /marca funciona", async () => {
  const { window } = navegador({ href: "https://admira.tv/parrilla/", tokenCaido: 503 });
  const out = salida();
  assert.equal((await window.AdmiraContextoTv.ejecutar("/proyecto starbucks", out)).ok, false);
  assert.match(out.lineas.join("\n"), /todavía no está activo en producción/);
  assert.equal((await window.AdmiraContextoTv.ejecutar("/marca lumbre", out)).ok, true);
  assert.match(out.lineas.join("\n"), /Marca: lumbre/);
});

test("solo se filtran lecturas GET de pantallas, playlists y contenidos", () => {
  const { window } = navegador();
  const f = window.AdmiraContextoTv._destinoFiltrable;
  assert.equal(f("https://api.admira.store/grid/screens?x=1"), "/grid/screens?x=1");
  assert.equal(f("https://api.admira.store/grid/draft?screen=a", { method: "GET" }), "/grid/draft?screen=a");
  assert.equal(f("https://api.admira.store/grid/draft", { method: "POST" }), null, "las escrituras no se tocan");
  assert.equal(f("https://stock.admira.store/stock/index.json"), "/stock/list?limit=2000");
  assert.equal(f("https://api.admira.store/grid/projects"), null);
  assert.equal(f("/api/playlist?screen=a"), null);
  assert.equal(f("https://evil.example/grid/screens"), null);
});

test("/marca cambia el aspecto sin tocar el proyecto, y /marca lista enseña el catálogo", async () => {
  const { window } = navegador();
  const out = salida();
  assert.equal((await window.AdmiraContextoTv.ejecutar("/marca lumbre", out)).ok, true);
  assert.match(out.lineas.join("\n"), /Marca: lumbre · proyecto: todos/);
  await window.AdmiraContextoTv.ejecutar("/marca lista", out);
  assert.match(out.lineas.join("\n"), /Marcas: starbucks, lumbre/);
});

test("fuera del modo experto los comandos se rechazan", async () => {
  const { window } = navegador({ experto: false });
  const out = salida();
  assert.equal((await window.AdmiraContextoTv.ejecutar("/proyecto starbucks", out)).ok, false);
  assert.match(out.lineas.join("\n"), /Abre el modo experto/);
});

test("registra /marca y /proyecto en el motor de comandos de la suite", () => {
  const { window } = navegador();
  const registrados = [];
  window.AdmiraCommandAdapters.forEach((conectar) => conectar({ registerAdapter: (def) => registrados.push(def) }));
  const def = registrados.find((d) => d.id === "tv-contexto");
  assert.ok(def);
  assert.deepEqual(plano(def.verbs.map((v) => v.name)), ["marca", "proyecto"]);
  assert.deepEqual(plano(def.verbs[1].alias), ["project"]);
  assert.ok(def.verbs.every((v) => Array.isArray(v.desc) && v.desc.length === 2), "ayuda en castellano e inglés");
});
