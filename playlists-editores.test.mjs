// Arreglos de los editores de playlists (Carlos, 8-oct-2026, fase 1). Se ejecuta el JavaScript REAL de
// /parrilla/ y /playlists/ en un DOM mínimo, contra la API de verdad (functions/api/playlist.js) con un KV
// simulado; lo de api.admira.store y xpl-store se simula. No basta con buscar texto en el HTML: aquí se pulsa.
//   B1 · «Crear y asignar» escribe «Por defecto» de cada pantalla (lo que el player emite), no /grid/draft.
//   B2 · una pantalla que sigue playlists vivas se ve en solo lectura y sólo pasa a manual con «Fijar a mano».
//   B6 · «Borrar la copia local» no borra la flota; borrar la flota es otra acción, con confirmación fuerte.
//   B7 · proyectos de /grid/projects, duración 2-600 s, nombre conservado y sin carriles en «Por defecto».
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { forgetMemo, onRequestGet, onRequestPost } from "./functions/api/playlist.js";

const PARRILLA = await readFile(new URL("./parrilla/index.html", import.meta.url), "utf8");
const PLAYLISTS = await readFile(new URL("./playlists/index.html", import.meta.url), "utf8");

// ── Datos: los proyectos tal como los da hoy api.admira.store/grid/projects y unas pantallas de la parrilla ──
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
  { screen: "xtanco-led-frontal", name: "LED Frontal", circuit: "xtanco", bands: 4, pixerScreens: [] },
];
const pieza = (id, tags, type = "video") => ({ id, type, title: "Pieza " + id, tags, url: `https://stock.admira.store/stock/${id}/asset.${type === "image" ? "png" : "mp4"}`, createdAt: 1000 + Number(id.replace(/\D/g, "")) });
const STOCK = [pieza("c1", ["café"]), pieza("c2", ["café"]), pieza("p1", ["promo"], "image"), pieza("p2", ["promo"]), { id: "k1", type: "capsula", title: "Cápsula", tags: ["promo"], url: "https://x.example/c.html" }];

// ── El servidor: la API de verdad con un KV simulado y una sesión de editor ──
const sessionToken = "session-token", cookie = { Cookie: `__Host-atv_session=${sessionToken}` };
function servidor(stock = STOCK) {
  forgetMemo();
  const data = new Map([[`admira-tv:auth:session:${sessionToken}`, JSON.stringify({ email: "csilvasantin@gmail.com", expiresAt: Date.now() + 3600_000 })]]), meta = new Map();
  const ACCESS = {
    get: async k => data.get(k) ?? null,
    put: async (k, v, o) => { data.set(k, v); if (o && o.metadata) meta.set(k, o.metadata); },
    getWithMetadata: async k => ({ value: data.get(k) ?? null, metadata: meta.get(k) ?? null }),
    list: async ({ prefix }) => ({ keys: [...data.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name, metadata: meta.get(name) })), list_complete: true }),
  };
  const llamadas = [], json = v => Response.json(v);
  async function red(url, opts = {}) {
    url = String(url); const method = String(opts.method || "GET").toUpperCase(), body = opts.body ? JSON.parse(opts.body) : null;
    llamadas.push({ url, method, body });
    if (url.startsWith("/api/playlist")) {
      const request = new Request("https://admira.tv" + url, { method, headers: { ...cookie, "Content-Type": "application/json" }, body: method === "POST" ? opts.body : undefined });
      return (method === "POST" ? onRequestPost : onRequestGet)({ request, env: { ACCESS } });
    }
    const u = new URL(url);
    if (u.pathname === "/grid/projects") return json({ ok: true, projects: structuredClone(PROYECTOS) });
    if (u.pathname === "/grid/screens") return json({ ok: true, screens: structuredClone(PANTALLAS) });
    if (u.pathname === "/grid/config") { const s = PANTALLAS.find(x => x.screen === u.searchParams.get("screen")); return json({ ok: true, config: { circuit: s ? s.circuit : "" } }); }
    if (u.pathname === "/signage/screens") return json({ screens: [] });
    if (u.pathname === "/grid/tag-sync") return json({ targets: [] });
    if (u.pathname === "/grid/day") return json({ bands: [] });
    if (u.pathname === "/grid/draft") return json({ ok: true });
    if (u.pathname.endsWith("/stock/index.json")) return json({ items: stock });
    return new Response("no", { status: 404 });
  }
  const real = globalThis.fetch; globalThis.fetch = red;   // las consultas que hace el propio servidor
  const escribe = (body) => onRequestPost({ request: new Request("https://admira.tv/api/playlist", { method: "POST", headers: { ...cookie, "Content-Type": "application/json" }, body: JSON.stringify(body) }), env: { ACCESS } });
  const lee = async qs => (await onRequestGet({ request: new Request("https://admira.tv/api/playlist?" + qs), env: { ACCESS } })).json();
  return { ACCESS, data, red, llamadas, escribe, lee, fin: () => { globalThis.fetch = real; } };
}

// ── Un navegador mínimo: lo justo para que corran los scripts de las páginas ──
function clases() { const s = new Set(); return { add: (...c) => c.forEach(x => s.add(x)), remove: (...c) => c.forEach(x => s.delete(x)), toggle: (c, f) => { const on = f === undefined ? !s.has(c) : !!f; if (on) s.add(c); else s.delete(c); return on; }, contains: c => s.has(c) }; }
function elemento(id, extra = {}) {
  return Object.assign({
    id, textContent: "", value: "", className: "", hidden: false, disabled: false, checked: false, src: "", currentTime: 0, onclick: null, onchange: null,
    style: {}, dataset: {}, attrs: {}, listeners: {}, classList: clases(), _html: "", _padre: null,
    get innerHTML() { return this._html; }, set innerHTML(v) { this._html = String(v); },
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }, removeAttribute(k) { delete this.attrs[k]; },
    addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }, querySelectorAll: () => [], querySelector: () => null,
    closest() { return this._padre ||= elemento(id + "^"); }, focus() {}, select() {}, pause() {}, play: () => Promise.resolve(),
    click() { return this.onclick && this.onclick({ target: this, preventDefault() {} }); },
  }, extra);
}
function navegador({ url, red, confirma = () => true, pregunta = () => null, inicial = {}, storage = {}, globals = {} }) {
  const els = new Map(), $ = id => { if (!els.has(id)) els.set(id, elemento(id, inicial[id])); return els.get(id); };
  const ls = new Map(Object.entries(storage)), timers = new Map(), dialogos = [], avisos = [];
  let n = 0; const loc = new URL(url);
  const ctx = {
    document: { getElementById: $, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, title: "", body: { classList: clases() }, createElement: () => elemento("nuevo"), write() {} },
    location: { href: loc.href, search: loc.search, origin: loc.origin, hostname: loc.hostname, pathname: loc.pathname }, history: { replaceState() {} },
    localStorage: { getItem: k => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: k => ls.delete(k) },
    fetch: red, confirm: m => { dialogos.push(String(m)); return confirma(String(m)); }, prompt: m => { dialogos.push(String(m)); return pregunta(String(m)); }, alert: m => avisos.push(String(m)),
    setTimeout: f => { timers.set(++n, f); return n; }, clearTimeout: id => timers.delete(id), setInterval: () => 0, clearInterval() {},
    requestAnimationFrame: () => 0, cancelAnimationFrame() {}, performance: { now: () => Date.now() }, open: () => null,
    URL, URLSearchParams, console, structuredClone, navigator: { clipboard: { writeText() {} } },
    AdmiraVirtualPlayers: { list: async () => [], isVirtual: () => false, merge: (a, b) => a.concat(b), label: () => "" },
    ...globals,
  };
  ctx.window = ctx; vm.createContext(ctx);
  const temporizadores = () => { const fs = [...timers.values()]; timers.clear(); fs.forEach(f => f()); };
  return { ctx, $, ls, dialogos, avisos, temporizadores };
}
const plano = x => JSON.parse(JSON.stringify(x));   // lo que viene del script de la página es de otro «realm»
const reposa = async () => { for (let i = 0; i < 60; i++) await new Promise(r => setImmediate(r)); };

// El IIFE de /parrilla/ con un gancho para mirar su estado desde la prueba (no cambia su lógica).
const GANCHO = "globalThis.__p={get items(){return items},get synthetic(){return syntheticDraft},readOnlyReason,get draftRev(){return draftRev},get draftName(){return draftName},get projects(){return projects},get screens(){return screens},get activeScreenId(){return activeScreenId},get activeProjectId(){return activeProjectId},pinManual,runPush,loadRemoteDraft,clampSecs,plSeleccion,plResumen,plDevicesProyecto,save:()=>save(),switchScreen:id=>switchScreen(id),switchProject:id=>switchProject(id),get plTagSel(){return plTagSel},set plDevSel(v){plDevSel=v}};";
function abreParrilla(srv, qs, opciones = {}) {
  const ini = PARRILLA.indexOf("(function(){\n    'use strict';"), fin = PARRILLA.indexOf("  })();\n  </script>", ini);
  assert.ok(ini > 0 && fin > ini, "encuentro el script de la parrilla");
  const codigo = PARRILLA.slice(ini, fin) + GANCHO + "\n  })();";
  const b = navegador({ url: "http://localhost/parrilla/?" + qs, red: srv.red, inicial: { plPanel: { hidden: true }, followNote: { hidden: true }, stockPreview: { hidden: true }, plVivaBody: { hidden: true }, plManualWrap: { hidden: true } }, ...opciones });
  vm.runInContext(codigo, b.ctx);
  return { ...b, p: b.ctx.__p };
}
const REGLA = { name: "Cafés", content: { any: ["café"], limit: 10, seconds: 12 }, target: { all: ["circuito:gracia"] } };
const POR_DEFECTO_KIOSK = "project=kiosk&xpace=gracia&device=sim-gracia-kiosko&playlist=default";
const escrituras = (srv, screen) => srv.llamadas.filter(c => c.method === "POST" && c.url === "/api/playlist" && c.body && c.body.screen === (screen || c.body.screen) && !c.body.action);

test("B2 · una pantalla que sigue una playlist viva se ve en solo lectura y nada la convierte en manual en silencio", async () => {
  const srv = servidor();
  try {
    assert.equal((await srv.escribe({ action: "live-save", playlist: REGLA })).status, 200);
    const b = abreParrilla(srv, POR_DEFECTO_KIOSK);
    await reposa();
    assert.equal(b.p.readOnlyReason(), "following");
    assert.deepEqual(plano(b.p.items.map(i => i.stockId)), ["c2", "c1"], "se ven las piezas que emite");
    assert.equal(b.$("followNote").hidden, false);
    assert.match(b.$("followText").innerHTML, /sigue la playlist viva <b>«Cafés»<\/b>/);
    assert.match(b.$("draftStatus").textContent, /Sigue reglas vivas/);
    assert.match(b.$("rundown").innerHTML, /class="dur-ro">12</, "duración en lectura");
    assert.doesNotMatch(b.$("rundown").innerHTML, /data-move=|data-duration=|data-edit-title=/, "ni mover, ni duración, ni título");
    assert.equal(b.$("removeCurrent").disabled, true);
    assert.equal(b.$("plCreate").textContent, "Fijar a mano y añadir");
    // Lo que antes la convertía en manual: guardar, el botón de guardar, cambiar de pantalla y volver.
    assert.equal(b.p.save(), false);
    b.$("saveBtn").onclick(); assert.match(b.$("feedback").textContent, /Fijar a mano/);
    b.p.switchScreen("xtanco-led-frontal"); await reposa(); b.p.switchScreen("sim-gracia-kiosko"); await reposa();
    b.temporizadores(); await reposa();
    assert.equal(escrituras(srv, "sim-gracia-kiosko").length, 0, "ninguna escritura sobre la pantalla que sigue reglas");
    assert.equal((await srv.lee("screen=sim-gracia-kiosko")).draft.synthetic, true, "y sigue siguiendo la regla");
  } finally { srv.fin(); }
});

test("B2 · «Fijar a mano» pregunta, guarda la lista con la rev de lo guardado y desde ahí se edita", async () => {
  const srv = servidor();
  try {
    await srv.escribe({ action: "live-save", playlist: REGLA });
    let acepta = false;
    const b = abreParrilla(srv, POR_DEFECTO_KIOSK, { confirma: () => acepta });
    await reposa();
    assert.equal(await b.p.pinManual(), false, "si no se confirma, no pasa nada");
    assert.equal(b.p.readOnlyReason(), "following"); assert.equal(escrituras(srv).length, 0);
    assert.match(b.dialogos.at(-1), /sigue la playlist viva «Cafés»[\s\S]*DEJA de seguir esas reglas/);
    acepta = true;
    assert.equal(await b.p.pinManual(), true);
    const [w] = escrituras(srv, "sim-gracia-kiosko");
    assert.equal(w.body.rev, 0, "la rev de lo guardado: nada → 0");
    assert.equal(w.body.name, "Fijada a mano · Cafés");
    assert.deepEqual(w.body.items.map(i => i.stockId), ["c2", "c1"]);
    assert.equal(b.p.readOnlyReason(), "", "ya se edita");
    assert.match(b.$("rundown").innerHTML, /data-duration=/);
    const emite = (await srv.lee("screen=sim-gracia-kiosko&w=1080&h=1920")).draft;
    assert.equal(emite.synthetic, false); assert.equal(emite.name, "Fijada a mano · Cafés");
  } finally { srv.fin(); }
});

test("B2 · añadir piezas a una pantalla que sigue reglas pasa por «Fijar a mano» y respeta el tope", async () => {
  const srv = servidor();
  try {
    await srv.escribe({ action: "live-save", playlist: REGLA });
    const b = abreParrilla(srv, POR_DEFECTO_KIOSK);
    await reposa();
    b.p.plTagSel.add("promo"); b.p.plResumen();
    assert.match(b.$("plSummary").innerHTML, /<b>2<\/b> piezas/, "la cápsula sin archivo reproducible no cuenta");
    await b.$("plCreate").onclick();
    assert.match(b.dialogos.at(-1), /Fijar a mano[\s\S]*las 2 que añades/);
    const [w] = escrituras(srv, "sim-gracia-kiosko");
    assert.deepEqual(w.body.items.map(i => i.stockId), ["c2", "c1", "p1", "p2"]);
    assert.equal(w.body.rev, 0);
  } finally { srv.fin(); }
});

test("B7 · «Por defecto» conserva el nombre que le puso Pixeria al editarla aquí, sin carriles ni 409", async () => {
  const srv = servidor();
  try {
    const pix = [pieza("x1", ["catalogo"]), pieza("x2", ["catalogo"])].map(p => ({ id: p.id, stockId: p.id, title: p.title, asset: p.url, assetType: "video", seconds: 15 }));
    await srv.escribe({ screen: "sim-gracia-kiosko", name: "Catálogo Alcampo", items: pix });
    const b = abreParrilla(srv, POR_DEFECTO_KIOSK);
    await reposa();
    assert.equal(b.p.readOnlyReason(), ""); assert.equal(b.p.draftName, "Catálogo Alcampo");
    assert.match(b.$("draftName").textContent, /Catálogo Alcampo/);
    assert.ok(b.ctx.document.body.classList.contains("is-default"), "en Por defecto no se enseñan carriles");
    assert.match(b.$("contractNote").innerHTML, /no hay carriles/);
    assert.match(b.$("rundown").innerHTML, /min="2" max="600" step="1"/, "la duración admite lo mismo que la API");
    b.$("removeCurrent").onclick(); b.temporizadores(); await reposa();
    const w = escrituras(srv, "sim-gracia-kiosko").at(-1);
    assert.equal(w.body.name, "Catálogo Alcampo", "el nombre viaja con el guardado");
    const guardada = (await srv.lee("screen=sim-gracia-kiosko")).draft;
    assert.equal(guardada.name, "Catálogo Alcampo"); assert.equal(guardada.items.length, 1);
    assert.equal(b.p.clampSecs(1), 2); assert.equal(b.p.clampSecs(700), 600); assert.equal(b.p.clampSecs(45), 45); assert.equal(b.p.clampSecs("x"), 10);
  } finally { srv.fin(); }
});

test("B7 · el selector de proyectos lee /grid/projects: aparecen Alcampo y el resto, y los que no tienen pantallas no se eligen", async () => {
  const srv = servidor();
  try {
    // Con el catálogo de Xtancos cargado (locations.js) la parrilla rehace la flota: Alcampo no puede perderse.
    const xtanco = { id: "xtanco", name: "Xtanco Gràcia", surfaces: [{ surface: "pantalla", name: "LED Frontal", screen: "xtanco-led-frontal" }] };
    const b = abreParrilla(srv, "project=alcampo&xpace=alcampo&device=alcampo-esplugues", { globals: { OMNIP_LOCATIONS_DEFAULT: [xtanco] } });
    await reposa();
    const opciones = b.$("projectSelect").innerHTML;
    for (const nombre of ["Canal Alcampo", "CanalKiosk", "Canal Xtanco"]) assert.match(opciones, new RegExp(">" + nombre + "</option>"), nombre + " elegible");
    for (const nombre of ["CanalMetro", "Canal Altadis"]) assert.match(opciones, new RegExp('disabled>' + nombre + " · sin pantallas en la parrilla"), nombre + " visible pero no elegible");
    assert.equal(b.p.activeProjectId, "alcampo"); assert.equal(b.p.activeScreenId, "alcampo-esplugues", "el enlace de Flota abre la pantalla exacta");
    assert.match(b.$("projectCount").textContent, /de 8/);
    assert.deepEqual(plano(b.p.plDevicesProyecto().map(s => s.screen)), ["alcampo-12-de-octubre", "alcampo-esplugues"]);
  } finally { srv.fin(); }
});

test("B1 · «Crear y asignar» escribe «Por defecto» de cada pantalla elegida y cada player la emite; nunca /grid/draft", async () => {
  const srv = servidor();
  try {
    // Una de las dos pantallas sigue una playlist viva: antes, cualquier escritura con su rev daba 409.
    await srv.escribe({ action: "live-save", playlist: { ...REGLA, target: { all: ["pantalla:alcampo-esplugues"] } } });
    const b = abreParrilla(srv, "project=alcampo&xpace=alcampo&device=alcampo-12-de-octubre");
    await reposa();
    b.$("plOpen").click(); await reposa();
    b.p.plTagSel.add("promo"); b.p.plDevSel = new Set(["alcampo-12-de-octubre", "alcampo-esplugues"]); b.$("plName").value = "Mañanas Alcampo";
    b.p.plResumen();
    assert.equal(b.$("plCreate").textContent, "Crear y asignar a Por defecto");
    assert.equal(b.$("plCreate").disabled, false);
    await b.$("plCreate").onclick(); await reposa();
    const aviso = b.dialogos.at(-1);
    assert.match(aviso, /Alcampo Doce de Octubre — ahora: vacía/);
    assert.match(aviso, /Alcampo Esplugues — ahora: sigue la playlist viva «Cafés»/);
    assert.match(aviso, /Se SUSTITUYE la playlist «Por defecto»/);
    assert.equal(srv.llamadas.filter(c => c.method === "POST" && c.url.includes("/grid/draft")).length, 0, "/grid/draft sólo lo lee el previo: no se escribe");
    for (const screen of ["alcampo-12-de-octubre", "alcampo-esplugues"]) {
      const [w] = escrituras(srv, screen);
      assert.equal(w.body.name, "Mañanas Alcampo"); assert.equal(w.body.rev, 0);
      const emite = (await srv.lee("screen=" + screen + "&w=1920&h=1080")).draft;
      assert.deepEqual(emite.items.map(i => i.stockId), ["p1", "p2"], screen + " emite la playlist");
      assert.equal(emite.synthetic, false);
    }
    assert.match(b.$("feedback").textContent, /^2 de 2 dispositivos con «Mañanas Alcampo» en Por defecto/);
  } finally { srv.fin(); }
});

test("B1 · un editor que se adelanta cuenta como fallo, y más de 200 piezas no se crean ni se recortan en silencio", async () => {
  const srv = servidor([...Array.from({ length: 205 }, (_, i) => pieza("m" + i, ["masivo"])), pieza("p1", ["promo"], "image")]);
  try {
    const b = abreParrilla(srv, "project=alcampo&xpace=alcampo&device=alcampo-12-de-octubre", {
      // Mientras se confirma, otra persona guarda en una de las pantallas.
      confirma: () => { srv.escribe({ screen: "alcampo-esplugues", items: [] }); return true; },
    });
    await reposa();
    // Ya había algo guardado: la rev que se lee antes de confirmar queda vieja al guardar el otro.
    await srv.escribe({ screen: "alcampo-esplugues", items: [] });
    b.$("plOpen").click(); await reposa();
    b.p.plTagSel.add("promo"); b.p.plDevSel = new Set(["alcampo-12-de-octubre", "alcampo-esplugues"]); b.$("plName").value = "Promo";
    await b.$("plCreate").onclick(); await reposa();
    assert.match(b.$("feedback").textContent, /^1 de 2 dispositivos[\s\S]*Alcampo Esplugues \(otro editor se adelantó\)/);
    b.p.plTagSel.clear(); b.p.plTagSel.add("masivo"); b.p.plResumen();
    assert.equal(b.$("plCreate").disabled, true);
    assert.match(b.$("plSummary").innerHTML, /Demasiadas piezas:<\/b> «Por defecto» admite 200 por pantalla/);
  } finally { srv.fin(); }
});

// ── /playlists/: borrar la copia local no toca la flota ──
function abrePlaylists({ flota, confirma = () => true, pregunta = () => null, xplCae = false }) {
  const posts = [];
  const red = async (url, opts = {}) => {
    url = String(url); const method = String(opts.method || "GET").toUpperCase();
    if (url.startsWith("https://xpl.admira.store/playlists")) {
      if (xplCae) throw new Error("sin red");
      if (method === "POST") { const body = JSON.parse(opts.body); posts.push(body); flota.splice(0, flota.length, ...body.playlists); return Response.json({ ok: true }); }
      return Response.json({ ok: true, playlists: structuredClone(flota) });
    }
    if (url.includes("/stock/list")) return Response.json({ items: [] });
    if (url.includes("/signage/screens") || url.includes("/grid/screens")) return Response.json({ screens: [] });
    return new Response("no", { status: 404 });
  };
  const local = [{ id: "pl_local", name: "Sólo mía", items: [] }, ...structuredClone(flota)];
  const b = navegador({ url: "http://localhost/playlists/", red, confirma, pregunta, storage: { adtv_playlists: JSON.stringify(local), adtv_pl_key: "clave-xpl" } });
  const ini = PLAYLISTS.indexOf("<script>\n'use strict';"), fin = PLAYLISTS.indexOf("</script>", ini);
  vm.runInContext(PLAYLISTS.slice(ini + 8, fin), b.ctx);
  return { ...b, posts, lista: () => vm.runInContext("PLAYLISTS", b.ctx) };
}
const FLOTA = () => [{ id: "pl_a", name: "Escaparate mañana", items: [] }, { id: "pl_b", name: "Promo verano", items: [] }];

test("B6 · «Borrar la copia local» vacía este navegador y no publica nada en la flota", async () => {
  const flota = FLOTA(), b = abrePlaylists({ flota });
  await reposa();
  const antes = b.posts.length;
  await b.$("advDeleteAll").onclick(); b.temporizadores();
  assert.equal(b.posts.length, antes, "ni un POST a xpl-store");
  assert.deepEqual(flota.map(p => p.id), ["pl_a", "pl_b"], "la flota conserva sus plantillas");
  assert.deepEqual(plano(b.lista().map(p => p.id)), ["pl_a", "pl_b"], "vuelven a cargarse de la flota; la sólo-local desaparece");
  assert.match(b.dialogos.at(-1), /copia local[\s\S]*No toca las plantillas compartidas en la flota/);
  assert.match(b.avisos.at(-1), /La flota conserva 2 plantillas/);
  // Sin red tampoco escribe: se queda vacío.
  const sinRed = abrePlaylists({ flota: FLOTA(), xplCae: true });
  await reposa(); await sinRed.$("advDeleteAll").onclick();
  assert.equal(sinRed.posts.length, 0); assert.deepEqual(plano(sinRed.lista()), []); assert.equal(sinRed.ls.get("adtv_playlists"), undefined);
});

test("B6 · borrar de la flota es otra acción y exige escribir BORRAR", async () => {
  const flota = FLOTA();
  let respuesta = "borrar";
  const b = abrePlaylists({ flota, pregunta: () => respuesta });
  await reposa();
  const antes = b.posts.length;
  await b.$("advDeleteFleet").onclick();
  assert.equal(b.posts.length, antes, "con otra palabra no se borra nada"); assert.equal(flota.length, 2);
  assert.match(b.dialogos.at(-1), /2 plantillas compartidas en la FLOTA[\s\S]*Escribe BORRAR/);
  respuesta = "BORRAR";
  await b.$("advDeleteFleet").onclick();
  assert.deepEqual(plano(b.posts.at(-1).playlists), []); assert.equal(flota.length, 0);
  assert.match(b.avisos.at(-1), /Plantillas de la flota borradas/);
});
