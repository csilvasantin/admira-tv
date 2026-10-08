// e2e de /emision/ con Playwright y todas las APIs simuladas. /api/emision es el handler REAL
// (functions/api/emision.js) con un KV en memoria y las APIs de arriba (parrilla, Stock, modo…) simuladas.
// Se prueba a 1440×900 y en iPad (1180×820 y 820×1180), que es donde lo va a mirar Carlos.
//
// Playwright no es dependencia del repo: se carga de PLAYWRIGHT_PATH (carpeta node_modules/playwright),
// PLAYWRIGHT_MODULE (ruta a playwright/index.mjs) o un `playwright` resoluble; si no hay, la prueba se salta.
// Con EMISION_SHOTS=<carpeta> deja las capturas allí.
//   PLAYWRIGHT_PATH=…/node_modules/playwright node --test emision-e2e.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { onRequestGet } from "./functions/api/emision.js";
import { forgetMemo } from "./functions/api/playlist.js";
import { madridClock } from "./functions/api/_emision.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
// Mismo convenio que parrilla-por-defecto.e2e.test.mjs (PLAYWRIGHT_PATH) o la ruta al módulo (PLAYWRIGHT_MODULE).
let pw = null;
try {
  pw = process.env.PLAYWRIGHT_PATH ? createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH) : await import(process.env.PLAYWRIGHT_MODULE || "playwright");
} catch (_) { pw = null; }
const SHOTS = process.env.EMISION_SHOTS || "";

// ── Mundo simulado: una pantalla de Alcampo con «Por defecto» y una reserva pagada heredada AHORA ──────────
const hoy = madridClock(Date.now());
const hh = Math.floor(hoy.min / 60);
const hhmm = h => String(((h % 24) + 24) % 24).padStart(2, "0") + ":00";
const BANDA_AHORA = { id: "ahora", label: "Ahora", from: hhmm(hh - 1), to: hhmm(hh + 1) };
const BANDA_DESPUES = { id: "despues", label: "Después", from: hhmm(hh + 1), to: hhmm(hh + 3) };
const iso = d => new Date(Date.parse("2026-10-01T10:00:00Z") + d * 3600_000).toISOString();
const SVG = "<svg xmlns='http://www.w3.org/2000/svg' width='160' height='90'><rect width='160' height='90' fill='#17345a'/><circle cx='80' cy='45' r='22' fill='#3df08a'/></svg>";
const STOCK = Array.from({ length: 14 }, (_, i) => ({ id: `s${i + 1}`, num: 200 + i, type: i % 4 === 1 ? "video" : "image", url: `https://cdn.test/s${i + 1}.jpg`,
  title: `Pieza de prueba ${i + 1}`, category: "marca", createdAt: iso(i), motor: "grok-imagine-image", tags: i < 6 ? ["default"] : ["oferta"], thumbnail: `https://cdn.test/t${i + 1}.svg` }));
const reserva = { kind: "paid", status: "sold", bookingId: "def-alcampo-41", advertiser: "Alcampo", title: "Oferta de otoño", stockId: "s3", creative: { type: "image", url: "https://cdn.test/oferta.jpg" } };
const DIA = { ok: true, screen: "alcampo-alcala", date: hoy.date, config: { name: "Alcampo Supermercado Alcalá", circuit: "alcampo", slotSeconds: 15 },
  bands: [{ ...BANDA_AHORA, capacity: 6, own: 0, paid: 1, slots: [reserva] }, { ...BANDA_DESPUES, capacity: 6, own: 0, paid: 0, slots: [] }] };
const DRAFT = JSON.stringify({ screen: "alcampo-alcala", name: "Por defecto", rev: 4, items: [
  { id: "a", stockId: "s9", title: "Cartel municipal", seconds: 12, asset: "https://cdn.test/s9.jpg", assetType: "image", lane: "municipal" },
  { id: "b", stockId: "s10", title: "Promo panadería", seconds: 8, asset: "https://cdn.test/s10.jpg", assetType: "image", lane: "publicidad" }] });
const KV = new Map([["admira-tv:auth:session:e2e", JSON.stringify({ email: "csilvasantin@gmail.com", expiresAt: Date.now() + 3600e3 })],
  ["admira-tv:playlist:default:v1:alcampo-alcala", DRAFT],
  ["admira-tv:playout:v1", JSON.stringify({ configured: true, mode: "autonomous", screens: [], revision: 1 })]]);
const writes = [];
const kv = { get: async k => KV.get(k) ?? null, getWithMetadata: async k => ({ value: KV.get(k) ?? null, metadata: k.endsWith("alcampo-alcala") && k.includes(":tags:") ? { tags: ["orientacion:horizontal", "idioma:es"], w: 1920, h: 1080 } : null }),
  list: async () => ({ keys: [], list_complete: true }), put: async k => { writes.push(k); }, delete: async k => { writes.push(k); } };
const upstream = url => {
  if (url.includes("/grid/day")) return DIA;
  if (url.includes("/stock/list")) return { items: STOCK };
  if (url.includes("/stock/index.json")) return { items: STOCK };
  if (url.includes("/locations/mode")) return { mode: "conditional" };
  if (url.includes("/signage/now")) return { ok: true, item: { id: "s3", title: "Pieza de prueba 3", type: "image", startedAt: Date.now() - 4000, dur: 9, sinc: { on: 0, modo: "local" } }, lastSeen: Date.now() - 3000 };
  if (url.includes("/screen/cache")) return { ok: true, cache: null };
  if (url.includes("/grid/config")) return { ok: true, config: { circuit: "alcampo" } };
  if (url.includes("/grid/projects")) return PROJECTS;
  return null;
};
const PROJECTS = { ok: true, projects: [{ id: "alcampo", name: "Canal Alcampo", circuits: ["alcampo"] }, { id: "xtanco", name: "Canal Xtanco", circuits: ["xtanco"] }] };
const SCREENS = { ok: true, screens: [{ screen: "alcampo-alcala", name: "Alcampo Supermercado Alcalá", circuit: "alcampo" }, { screen: "alcampo-arenal", name: "Alcampo Arenal", circuit: "alcampo" },
  { screen: "xtanco-led-frontal", name: "LED Frontal", circuit: "xtanco" }] };

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };
function servidor() {
  return new Promise(resolve => {
    const srv = http.createServer(async (req, res) => {
      let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (p.endsWith("/")) p += "index.html";
      const file = path.join(ROOT, p);
      const st = file.startsWith(ROOT) ? await stat(file).catch(() => null) : null;
      if (!st || !st.isFile()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
      res.end(await readFile(file));
    }).listen(0, "127.0.0.1", () => resolve(srv));
  });
}

async function abrir(browser, base, viewport, qs) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: viewport.width < 1300, locale: "es-ES" });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", e => errores.push(String(e)));
  await ctx.route("**/*", async route => {
    const url = route.request().url();
    if (url.startsWith(base)) {
      const u = new URL(url);
      if (u.pathname === "/auth/session") return route.fulfill({ json: { ok: true, allowed: true, role: "owner" } });
      if (u.pathname === "/version.json") return route.fulfill({ json: { version: "v.e2e" } });
      if (u.pathname === "/api/emision") {
        forgetMemo();
        const real = globalThis.fetch;
        globalThis.fetch = async input => { const body = upstream(String(input && input.url || input)); return new Response(JSON.stringify(body), { status: body ? 200 : 404 }); };
        try {
          const r = await onRequestGet({ request: new Request(url, { headers: { Cookie: "__Host-atv_session=e2e" } }), env: { ACCESS: kv } });
          return route.fulfill({ status: r.status, contentType: "application/json", body: await r.text() });
        } finally { globalThis.fetch = real; }
      }
      return route.continue();
    }
    if (url.includes("/grid/projects")) return route.fulfill({ json: PROJECTS });
    if (url.includes("/grid/screens")) return route.fulfill({ json: SCREENS });
    if (url.includes("virtual-players")) return route.fulfill({ json: { ok: true, players: [] } });
    if (/\.(svg|jpg|png)(\?|$)/.test(url)) return route.fulfill({ contentType: "image/svg+xml", body: SVG });
    if (/\.(css)(\?|$)/.test(url)) return route.fulfill({ contentType: "text/css", body: "" });
    if (/\.(js)(\?|$)/.test(url)) return route.fulfill({ contentType: "text/javascript", body: "" });
    return route.fulfill({ json: {} });
  });
  await page.goto(base + "/emision/?" + qs);
  await page.waitForFunction(() => document.getElementById("hero").getAttribute("aria-busy") === "false" && document.getElementById("fuente").textContent !== "—", null, { timeout: 15000 });
  return { ctx, page, errores };
}
const sinScrollLateral = page => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const shot = async (page, nombre) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, nombre), fullPage: false }); };

test("/emision/ en escritorio e iPad, con las APIs simuladas", { skip: !pw && "Playwright no disponible (PLAYWRIGHT_MODULE)" }, async t => {
  const srv = await servidor();
  const base = "http://127.0.0.1:" + srv.address().port;
  const browser = await pw.chromium.launch();
  try {
    await t.test("1440×900: dice qué emite, quién anula «Por defecto» y con la barra del sitio", async () => {
      const { ctx, page, errores } = await abrir(browser, base, { width: 1440, height: 900 }, "screen=alcampo-alcala&lang=es");
      assert.equal(await page.textContent("#fuente"), "Stock");
      assert.match(await page.textContent("#motivo"), /^La reserva pagada de la franja \d+-\d+ de Alcampo, heredada del canal alcampo, anula «Por defecto»/);
      const defecto = page.locator('#capas li[data-capa="defecto"]');
      assert.match(await defecto.getAttribute("class"), /anulada/);
      assert.match(await defecto.locator(".chip").textContent(), /ANULADA por PARRILLA/);
      assert.match(await page.locator('#capas li[data-capa="stock"]').getAttribute("class"), /activa/);
      // Piezas: con parrilla ya hay algo decidido, así que entra el Stock entero (14) y la reserva cada 4 piezas
      assert.equal(await page.locator("#piezas .pc").count(), 17);
      assert.match(await page.locator('#piezas .pc[data-pos="5"]').textContent(), /Oferta de otoño.*reserva pagada.*heredada de alcampo/);
      // Lo que la pantalla dice que emite
      assert.match(await page.textContent("#obs"), /La pantalla dice que emite «Pieza de prueba 3»/);
      // La barra es la del sitio (admira-nav): marca, conmutador Parrilla · Flota · Planificar · Calendario y Acceso
      assert.equal(await page.locator("header.admtop").count(), 1);
      assert.deepEqual(await page.locator("header.admtop .admseg a .lbl").allTextContents(), ["Parrilla", "Flota", "Planificar", "Calendario"]);
      assert.equal(await page.locator("header.admtop .admtR-acceso").count(), 1);
      assert.ok(await sinScrollLateral(page));
      await shot(page, "e2e-1440x900.png");
      // Inglés
      await page.click("#langEn");
      assert.match(await page.textContent("#motivo"), /^The paid booking in the \d+-\d+ slot by Alcampo, inherited from channel alcampo, overrides the default playlist/);
      assert.equal(await page.textContent("#fuente"), "Stock");
      await page.click("#langEs");
      assert.deepEqual(errores, []);
      assert.deepEqual(writes, [], "la vista no escribe en KV");
      await ctx.close();
    });

    await t.test("otra franja de hoy: sin reservas vuelve «Por defecto»", async () => {
      const { ctx, page } = await abrir(browser, base, { width: 1440, height: 900 }, "screen=alcampo-alcala&lang=es");
      await page.click('#franjas .band[data-from="' + BANDA_DESPUES.from + '"]');
      await page.waitForFunction(() => document.getElementById("fuente").textContent === "Por defecto");
      assert.match(await page.textContent("#heroEyebrow"), new RegExp("A las " + BANDA_DESPUES.from));
      assert.equal(await page.locator("#piezas .pc").count(), 2);
      assert.match(new URL(page.url()).search, new RegExp("at=" + encodeURIComponent(BANDA_DESPUES.from).replace("%3A", "(%3A|:)")));
      assert.equal(await page.getAttribute("#horaBtn", "aria-pressed"), "true");
      await page.click("#ahoraBtn");
      await page.waitForFunction(() => document.getElementById("fuente").textContent === "Stock");
      await ctx.close();
    });

    await t.test("Ver en canal avisa de que canal.html no es de solo lectura; el previo local no emite", async () => {
      const { ctx, page } = await abrir(browser, base, { width: 1440, height: 900 }, "screen=alcampo-alcala&lang=es");
      await page.evaluate(() => { window.__abiertas = []; window.open = u => { window.__abiertas.push(u); return null; }; });
      await page.click("#verCanal");
      assert.ok(await page.locator("#avisoCanal").isVisible());
      assert.match(await page.textContent("#avisoCanal"), /no tiene un modo de solo lectura/);
      await page.click("#avisoCancelar");
      assert.deepEqual(await page.evaluate(() => window.__abiertas), []);
      await page.click("#verCanal");
      await page.click("#avisoAbrir");
      assert.deepEqual(await page.evaluate(() => window.__abiertas), ["/canal.html?screen=alcampo-alcala"]);
      await page.click("#previoBtn");
      assert.ok(await page.locator("#previo").isVisible());
      assert.match(await page.textContent("#stage .badge"), /PREVIO LOCAL/);
      assert.match(await page.textContent("#stageNow"), /^1\/17 · /);
      await page.click("#stNext");
      assert.match(await page.textContent("#stageNow"), /^2\/17 · /);
      await shot(page, "e2e-previo-local.png");
      await page.click("#stClose");
      await ctx.close();
    });

    await t.test("iPad apaisado 1180×820 y vertical 820×1180: sin scroll lateral y todo a mano", async () => {
      for (const vp of [{ width: 1180, height: 820 }, { width: 820, height: 1180 }]) {
        const { ctx, page, errores } = await abrir(browser, base, vp, "screen=alcampo-alcala&lang=es");
        assert.ok(await sinScrollLateral(page), `scroll lateral a ${vp.width}`);
        for (const sel of ["#proyecto", "#pantalla", "#ahoraBtn", "#previoBtn", "#verCanal"]) {
          const box = await page.locator(sel).boundingBox();
          assert.ok(box && box.x >= 0 && box.x + box.width <= vp.width + 0.5, `${sel} fuera de la pantalla a ${vp.width}`);
          assert.ok(box.height >= 40, `${sel} demasiado pequeño para el dedo (${box.height}px)`);
        }
        // El motivo se lee en el primer pantallazo, sin desplazarse
        const m = await page.locator("#motivo").boundingBox();
        assert.ok(m.y + m.height <= vp.height, `el motivo no cabe en el primer pantallazo a ${vp.width}×${vp.height}`);
        const cols = await page.evaluate(() => getComputedStyle(document.getElementById("piezas")).gridTemplateColumns.split(" ").length);
        assert.ok(cols >= 3, `sólo ${cols} columnas de piezas a ${vp.width}`);
        // Cambiar de pantalla desde el selector
        await page.selectOption("#pantalla", "alcampo-arenal");
        await page.waitForFunction(() => /alcampo-arenal/.test(document.getElementById("quien").textContent));
        assert.match(new URL(page.url()).search, /screen=alcampo-arenal/);
        await page.selectOption("#pantalla", "alcampo-alcala");
        await page.waitForFunction(() => document.getElementById("fuente").textContent === "Stock" && /alcampo-alcala/.test(document.getElementById("quien").textContent));
        await shot(page, `e2e-ipad-${vp.width}x${vp.height}.png`);
        assert.deepEqual(errores, []);
        await ctx.close();
      }
    });

    await t.test("la parrilla avisa cuando «Por defecto» está anulada y enlaza al dispositivo activo", async () => {
      // Banco mínimo con lo que el script espera de /parrilla/: el selector de contexto y el enlace.
      const html = '<!doctype html><meta charset="utf-8"><main><section class="context-picker">ctx</section><a id="emisionLink" href="/emision/">¿Qué emite ahora? ↗</a></main><script src="/emision/aviso-parrilla.js"></script>';
      const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 } });
      await ctx.route("**/*", async route => {
        const url = route.request().url();
        if (url.includes("/__parrilla")) return route.fulfill({ contentType: "text/html", body: html });
        if (url.includes("/api/emision")) {
          const screen = new URL(url).searchParams.get("screen");
          assert.equal(new URL(url).searchParams.get("resumen"), "1");
          const anulada = screen === "alcampo-alcala";
          return route.fulfill({ json: { ok: true, screen, capas: [{ id: "defecto", estado: anulada ? "anulada" : "activa", anuladaPor: "parrilla", detalle: { es: "La reserva pagada de la franja 10-14 de Alcampo anula «Por defecto»." } }] } });
        }
        return route.continue();
      });
      const page = await ctx.newPage();
      await page.goto(base + "/__parrilla/?playlist=default&device=alcampo-alcala");
      await page.waitForSelector("#emisionAviso:not([hidden])");
      assert.match(await page.textContent("#emisionAviso"), /«Por defecto» no se está emitiendo ahora.*una reserva de la parrilla.*La reserva pagada de la franja 10-14 de Alcampo/);
      assert.equal(await page.getAttribute("#emisionLink", "href"), "/emision/?screen=alcampo-alcala");
      // Otro dispositivo (la parrilla cambia ?device= con replaceState): el aviso se va
      await page.evaluate(() => history.replaceState(null, "", "?playlist=default&device=alcampo-arenal"));
      await page.waitForSelector("#emisionAviso[hidden]", { state: "attached", timeout: 8000 });
      assert.equal(await page.getAttribute("#emisionLink", "href"), "/emision/?screen=alcampo-arenal");
      await ctx.close();
    });

    await t.test("cambiar de proyecto rellena sus pantallas", async () => {
      const { ctx, page } = await abrir(browser, base, { width: 1180, height: 820 }, "screen=alcampo-alcala&lang=es");
      await page.selectOption("#proyecto", "xtanco");
      await page.waitForFunction(() => document.getElementById("pantalla").value === "xtanco-led-frontal");
      assert.deepEqual(await page.locator("#pantalla option").evaluateAll(o => o.map(x => x.value)), ["xtanco-led-frontal"]);
      await ctx.close();
    });
  } finally {
    await browser.close();
    srv.close();
  }
});
