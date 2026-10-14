// Editor de la parrilla en un navegador de verdad (Playwright), con la API real (functions/api/playlist.js) sobre
// un KV simulado y api.admira.store / el Stock simulados. Carlos, 8-oct-2026, fase 1 de playlists (B1, B2, B7).
// Si Playwright no está instalado se salta: PLAYWRIGHT_PATH=/ruta/a/node_modules/playwright node --test …
// Con SHOTS_DIR=/carpeta guarda las capturas a 1440 y a tamaño iPad (1180×820).
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { readFile, mkdir } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { forgetMemo, onRequestGet, onRequestPost } from "./functions/api/playlist.js";

let pw = null;
try { pw = process.env.PLAYWRIGHT_PATH ? createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH) : await import("playwright"); } catch (_) { pw = null; }
const SKIP = pw ? false : "Playwright no disponible (PLAYWRIGHT_PATH)";
const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url))), ORIGIN = "http://localhost:8790", SHOTS = process.env.SHOTS_DIR || "";

const PROYECTOS = [
  { id: "admiranext", name: "Canal AdmiraNeXT", circuits: ["admira", "robot"] }, { id: "kiosk", name: "CanalKiosk", circuits: ["kiosko"] },
  { id: "metro", name: "CanalMetro", circuits: ["metro"] }, { id: "xtanco", name: "Canal Xtanco", circuits: ["xtanco"] },
  { id: "grandegracia", name: "GrandeGracia", circuits: ["admiranext", "samsung"] }, { id: "alcampo", name: "Canal Alcampo", circuits: ["alcampo"] },
  { id: "altadis", name: "Canal Altadis", circuits: ["altadis_bcn"] }, { id: "admira-etiqueta-digital", name: "admira-etiqueta-digital", circuits: ["etiqueta_digital"] },
];
const PANTALLAS = [
  { screen: "sim-gracia-kiosko", name: "Canal Kiosk Plaça Vila", circuit: "gracia", bands: 4, pixerScreens: [] },
  { screen: "alcampo-12-de-octubre", name: "Alcampo Doce de Octubre", circuit: "alcampo", bands: 4, pixerScreens: [] },
  { screen: "alcampo-esplugues", name: "Alcampo Esplugues", circuit: "alcampo", bands: 4, pixerScreens: [] },
  { screen: "alcampo-sant-boi", name: "Alcampo Sant Boi", circuit: "alcampo", bands: 4, pixerScreens: [] },
  { screen: "xtanco-led-frontal", name: "LED Frontal", circuit: "xtanco", bands: 4, pixerScreens: [] },
];
const IMG = { c1: "og-canal.png", c2: "og-player.png", c3: "og-calendar.png", p1: "og-admira.png", p2: "og-mcp.png" };
const pieza = (id, title, tags) => ({ id, type: "image", title, tags, url: `https://stock.admira.store/stock/${id}/asset.png`, createdAt: 1000 + Number(id.replace(/\D/g, "")) });
const STOCK = [pieza("c1", "Café de temporada", ["café"]), pieza("c2", "Desayuno completo", ["café"]), pieza("c3", "Merienda en la plaza", ["café"]),
  pieza("p1", "Oferta semanal", ["promo"]), pieza("p2", "Nuevo horario", ["promo"])];
const REGLA = { name: "Cafés de temporada", content: { any: ["café"], limit: 10, seconds: 12 }, target: { all: ["circuito:gracia"] } };

const token = "session-token", cookie = { Cookie: `__Host-atv_session=${token}` };
function api(url, stock = STOCK) {
  const u = new URL(url), json = v => Response.json(v);
  if (u.pathname === "/grid/projects") return json({ ok: true, projects: structuredClone(PROYECTOS) });
  if (u.pathname === "/grid/screens") return json({ ok: true, screens: structuredClone(PANTALLAS) });
  if (u.pathname === "/grid/config") { const s = PANTALLAS.find(x => x.screen === u.searchParams.get("screen")); return json({ ok: true, config: { circuit: s ? s.circuit : "" } }); }
  if (u.pathname === "/signage/screens") return json({ screens: [] });
  if (u.pathname === "/grid/tag-sync") return json({ targets: [] });
  if (u.pathname === "/grid/day") return json({ bands: [] });
  if (u.pathname.endsWith("/stock/index.json")) return json({ items: stock });
  return new Response("", { status: 404 });
}
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json" };

async function escena(viewport, stock = STOCK) {
  forgetMemo();
  const data = new Map([[`admira-tv:auth:session:${token}`, JSON.stringify({ email: "csilvasantin@gmail.com", expiresAt: Date.now() + 3600_000 })]]), meta = new Map();
  const ACCESS = { get: async k => data.get(k) ?? null, put: async (k, v, o) => { data.set(k, v); if (o && o.metadata) meta.set(k, o.metadata); },
    getWithMetadata: async k => ({ value: data.get(k) ?? null, metadata: meta.get(k) ?? null }),
    list: async ({ prefix }) => ({ keys: [...data.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name, metadata: meta.get(name) })), list_complete: true }) };
  const real = globalThis.fetch; globalThis.fetch = async url => api(String(url), stock);
  const escritas = [], env = { ACCESS };
  const llama = async (method, path, body) => {
    const r = await (method === "POST" ? onRequestPost : onRequestGet)({ request: new Request("https://admira.tv" + path, { method, headers: { ...cookie, "Content-Type": "application/json" }, body: method === "POST" ? body : undefined }), env });
    return { status: r.status, body: await r.text() };
  };
  const browser = await pw.chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined }), context = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: "es-ES" });
  await context.route("**/*", async route => {
    const req = route.request(), u = new URL(req.url());
    if (u.origin === ORIGIN && u.pathname === "/api/playlist") {
      const body = req.postData() || "";
      if (req.method() === "POST") escritas.push(JSON.parse(body));
      const r = await llama(req.method(), u.pathname + u.search, body);
      return route.fulfill({ status: r.status, contentType: "application/json", body: r.body });
    }
    if (u.origin === ORIGIN) {
      const file = join(ROOT, decodeURIComponent(u.pathname.endsWith("/") ? u.pathname + "index.html" : u.pathname));
      if (!file.startsWith(ROOT) || !existsSync(file)) return route.fulfill({ status: 404, body: "" });
      return route.fulfill({ status: 200, contentType: TIPOS[extname(file)] || "application/octet-stream", body: await readFile(file) });
    }
    if (u.hostname === "stock.admira.store" && /\/stock\/([^/]+)\/asset\./.test(u.pathname)) {
      const id = u.pathname.split("/")[2]; return route.fulfill({ status: 200, contentType: "image/png", body: await readFile(join(ROOT, IMG[id] || "og-admira.png")) });
    }
    if (u.hostname === "api.admira.store" || u.hostname === "stock.admira.store") { const r = api(u.href, stock); return route.fulfill({ status: r.status, contentType: "application/json", body: await r.text() }); }
    return route.fulfill({ status: 404, body: "" });   // nada sale a la red
  });
  const page = await context.newPage();
  const dialogos = []; let acepta = true;
  page.on("dialog", d => { dialogos.push(d.message()); acepta ? d.accept() : d.dismiss(); });
  return { page, escritas, dialogos, setAcepta: v => { acepta = v; }, llama,
    fin: async () => { await browser.close(); globalThis.fetch = real; } };
}
const captura = async (page, nombre, opciones = {}) => {
  if (!SHOTS) return; await mkdir(SHOTS, { recursive: true });
  if (opciones.fullPage) await page.evaluate(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); window.scrollTo(0, 0); });
  await page.screenshot({ path: join(SHOTS, nombre + ".png"), ...opciones });
};
const POR_DEFECTO = "/parrilla/?project=kiosk&xpace=gracia&device=sim-gracia-kiosko&playlist=default";

for (const [tam, viewport] of [["1440", { width: 1440, height: 900 }], ["ipad", { width: 1180, height: 820 }]]) {
  test(`B2 · ${tam}: la pantalla con playlist viva se ve en lectura y «Fijar a mano» la pasa a manual`, { skip: SKIP }, async () => {
    const e = await escena(viewport);
    try {
      assert.equal((await e.llama("POST", "/api/playlist", JSON.stringify({ action: "live-save", playlist: REGLA }))).status, 200);
      await e.page.goto(ORIGIN + POR_DEFECTO);
      await e.page.waitForSelector("#followNote:not([hidden])");
      assert.match(await e.page.textContent("#followText"), /Esta pantalla sigue la playlist viva «Cafés de temporada»/);
      assert.equal(await e.page.locator("#rundown .slot").count(), 3);
      assert.equal(await e.page.locator("#rundown [data-duration], #rundown [data-move], #rundown [data-edit-title]").count(), 0, "sin controles de edición");
      assert.equal(await e.page.locator("#rundown .slot .lane").first().isVisible(), false, "sin carril en Por defecto");
      assert.equal(await e.page.textContent("#draftStatus"), "Sigue reglas vivas");
      await e.page.click("#plClose");
      await captura(e.page, `editor-playlist-viva-${tam}`, { fullPage: true });
      await e.page.hover("#pinManual");
      await captura(e.page, `fijar-a-mano-boton-${tam}`, { clip: { x: 0, y: 0, width: viewport.width, height: Math.min(viewport.height, 820) } });
      // Cancelar no toca nada.
      e.setAcepta(false); await e.page.click("#pinManual");
      assert.equal(e.escritas.length, 0); assert.equal(await e.page.isVisible("#followNote"), true);
      e.setAcepta(true); await e.page.click("#pinManual");
      await e.page.waitForSelector("#followNote", { state: "hidden" });
      assert.match(e.dialogos.at(-1), /DEJA de seguir esas reglas/);
      const [w] = e.escritas.filter(x => !x.action);
      assert.equal(w.rev, 0); assert.equal(w.name, "Fijada a mano · Cafés de temporada"); assert.equal(w.items.length, 3);
      await e.page.waitForSelector("#rundown [data-duration]");
      assert.equal(await e.page.getAttribute("#rundown [data-duration]", "max"), "600");
      assert.match(await e.page.textContent("#feedback"), /Fijada a mano: 3 piezas/);
      await captura(e.page, `fijar-a-mano-hecho-${tam}`, { fullPage: true });
    } finally { await e.fin(); }
  });

  test(`B7 · ${tam}: el selector de proyectos trae Alcampo y el resto desde /grid/projects`, { skip: SKIP }, async () => {
    const e = await escena(viewport);
    try {
      await e.page.goto(ORIGIN + "/parrilla/?project=alcampo&xpace=alcampo&device=alcampo-12-de-octubre");
      await e.page.waitForFunction(() => document.querySelector("#projectSelect").options.length > 3);
      const opciones = await e.page.$$eval("#projectSelect option", os => os.map(o => ({ t: o.textContent, off: o.disabled })));
      assert.deepEqual(opciones.filter(o => !o.off).map(o => o.t).sort(), ["Canal Alcampo", "Canal Xtanco", "CanalKiosk"].sort());
      for (const n of ["CanalMetro", "Canal Altadis", "Canal AdmiraNeXT", "GrandeGracia"]) assert.ok(opciones.some(o => o.off && o.t.startsWith(n + " · sin pantallas")), n);
      assert.ok(opciones.some(o => o.off && /^CanalMetro · sin pantallas/.test(o.t)) && opciones.some(o => o.off && /^Canal Altadis · sin pantallas/.test(o.t)));
      assert.equal(await e.page.inputValue("#projectSelect"), "alcampo");
      // Sólo para la captura: se despliega la lista (un <select> abierto no sale en una captura sin cabeza).
      await e.page.$eval("#projectSelect", s => { s.size = s.options.length; s.style.paddingRight = "12px"; });
      await captura(e.page, `selector-proyectos-${tam}`, { clip: { x: 0, y: 0, width: viewport.width, height: 520 } });
    } finally { await e.fin(); }
  });
}

test("B1 · «Crear y asignar» en la parrilla escribe «Por defecto» de las pantallas elegidas y avisa de lo que tienen", { skip: SKIP }, async () => {
  const e = await escena({ width: 1440, height: 900 });
  try {
    await e.llama("POST", "/api/playlist", JSON.stringify({ action: "live-save", playlist: { ...REGLA, target: { all: ["pantalla:alcampo-esplugues"] } } }));
    await e.page.goto(ORIGIN + "/parrilla/?project=alcampo&xpace=alcampo&device=alcampo-12-de-octubre");
    await e.page.waitForFunction(() => document.querySelector("#projectSelect").value === "alcampo");
    await e.page.click("#plOpen");
    await e.page.waitForSelector('[data-pl-tag="promo"]');
    await e.page.click('[data-pl-tag="promo"]');
    await e.page.fill("#plName", "Mañanas Alcampo");
    await e.page.check('[data-pl-dev="alcampo-12-de-octubre"]'); await e.page.check('[data-pl-dev="alcampo-esplugues"]');
    assert.equal(await e.page.textContent("#plCreate"), "Crear y asignar a Por defecto");
    await captura(e.page, "crear-y-asignar-1440", { fullPage: true });
    await e.page.click("#plCreate");
    await e.page.waitForFunction(() => /dispositivos con «Mañanas Alcampo»/.test(document.querySelector("#feedback").textContent));
    assert.match(e.dialogos.at(-1), /Alcampo Esplugues — ahora: sigue la playlist viva «Cafés de temporada»/);
    const escritas = e.escritas.filter(x => !x.action);
    assert.deepEqual(escritas.map(x => x.screen).sort(), ["alcampo-12-de-octubre", "alcampo-esplugues"]);
    for (const screen of ["alcampo-12-de-octubre", "alcampo-esplugues"]) {
      const emite = JSON.parse((await e.llama("GET", "/api/playlist?screen=" + screen + "&w=1920&h=1080")).body).draft;
      assert.deepEqual(emite.items.map(i => i.stockId), ["p1", "p2"]); assert.equal(emite.name, "Mañanas Alcampo");
    }
    assert.match(await e.page.textContent("#feedback"), /^2 de 2 dispositivos/);
  } finally { await e.fin(); }
});

for (const [tam, viewport] of [["1440", { width: 1440, height: 900 }], ["ipad", { width: 1180, height: 820 }]]) {
  test(`Starbucks · ${tam}: búsqueda, catálogo completo y selección conservada hasta asignar`, { skip: SKIP }, async () => {
    const stock = Array.from({ length: 205 }, (_, i) => ({ ...pieza('s'+i, 'Campaña '+i, ['campaña']), num: i+1 }));
    stock.push({ ...pieza('sb', 'Starbucks · Café de otoño', ['starbucks', 'cafetería']), num: 1457 });
    stock.push({ ...pieza('audio', 'Starbucks · ambiente', ['starbucks']), num: 1458, type: 'music', url: 'https://stock.admira.store/stock/audio/asset.mp3' });
    stock.push({ ...pieza('guion', 'Starbucks · guion sin producir', ['starbucks']), num: 1459, type: 'guion' });
    const e = await escena(viewport, stock);
    try {
      await e.page.goto(ORIGIN + '/parrilla/?project=starbucks&xpace=sbux-pg103&device=sbux-pg103-p1');
      await e.page.waitForFunction(() => document.querySelector('#projectSelect').value === 'starbucks');
      await e.page.click('#plOpen');
      await e.page.waitForSelector('[data-pl-tag="starbucks"]');
      await e.page.click('#plModeManual');
      assert.equal(await e.page.locator('#plTagWrap').isVisible(), true, 'tags disponibles también a mano');
      assert.equal(await e.page.locator('[data-pl-item]').count(), 60);
      for (const n of [120, 180, 207]) { await e.page.click('#plItemsMore'); assert.equal(await e.page.locator('[data-pl-item]').count(), n); }
      assert.equal(await e.page.locator('#plItemsMore').isVisible(), false);
      await e.page.check('[data-pl-item="stock-s204"]');
      await e.page.fill('#plItemQuery', 'starbucks cafe');
      assert.equal(await e.page.locator('[data-pl-item]').count(), 1, 'sin acento, todas las palabras, pieza después de la 200');
      await e.page.check('[data-pl-item="stock-sb"]');
      await e.page.focus('[data-pl-item="stock-sb"]');
      await e.page.press('[data-pl-item="stock-sb"]', 'Space');
      assert.equal(await e.page.evaluate(() => document.activeElement.dataset.plItem), 'stock-sb', 'conserva el foco al marcar con teclado');
      await e.page.press('[data-pl-item="stock-sb"]', 'Space');
      assert.match(await e.page.textContent('#plItemsCount'), /2 seleccionadas · 1 fuera de esta búsqueda/);
      await e.page.fill('#plItemQuery', 'starbucks');
      await e.page.selectOption('#plItemType', 'audio');
      assert.equal(await e.page.locator('[data-pl-item]').count(), 1);
      assert.equal(await e.page.locator('[data-pl-item="stock-audio"]').count(), 1);
      await e.page.selectOption('#plItemType', '');
      await e.page.fill('#plItemQuery', '#1457');
      assert.equal(await e.page.locator('[data-pl-item]').count(), 1);
      assert.equal(await e.page.isChecked('[data-pl-item="stock-sb"]'), true);
      await e.page.fill('#plItemQuery', 'no existe');
      assert.match(await e.page.textContent('#plItems'), /No hay piezas reproducibles/);
      assert.match(await e.page.textContent('#plItemsCount'), /2 seleccionadas · 2 fuera de esta búsqueda/);
      await e.page.fill('#plItemQuery', 'starbucks');
      await e.page.fill('#plName', 'Starbucks · Café de otoño');
      await e.page.check('[data-pl-dev="sbux-pg103-p1"]');
      assert.equal(await e.page.locator('#plCreate').isEnabled(), true);
      await captura(e.page, `starbucks-selector-${tam}`, { fullPage: true });
      await e.page.click('#plCreate');
      await e.page.waitForFunction(() => /1 de 1 dispositivos/.test(document.querySelector('#feedback').textContent));
      const escritura = e.escritas.find(x => x.screen === 'sbux-pg103-p1' && !x.action);
      assert.deepEqual(escritura.items.map(x => x.stockId), ['s204', 'sb']);
      assert.match(e.dialogos.at(-1), /Se SUSTITUYE la playlist «Por defecto»/);
    } finally { await e.fin(); }
  });
}

test('cambiar proyecto con el creador abierto refresca destinos y descarta selecciones del proyecto anterior', { skip: SKIP }, async () => {
  const e = await escena({ width: 1440, height: 900 });
  try {
    await e.page.goto(ORIGIN + '/parrilla/?project=kiosk&xpace=gracia&device=sim-gracia-kiosko');
    await e.page.waitForFunction(() => document.querySelector('#projectSelect').value === 'kiosk');
    await e.page.click('#plOpen'); await e.page.check('[data-pl-dev="sim-gracia-kiosko"]');
    await e.page.selectOption('#projectSelect', 'alcampo');
    assert.equal(await e.page.locator('[data-pl-dev="sim-gracia-kiosko"]').count(), 0);
    assert.equal(await e.page.locator('[data-pl-dev]').count(), 3);
    assert.equal(await e.page.locator('[data-pl-dev]:checked').count(), 0);
    assert.equal(await e.page.locator('#plCreate').isEnabled(), false);
    assert.equal(await e.page.textContent('#plDevScope'), 'Canal Alcampo');
  } finally { await e.fin(); }
});
