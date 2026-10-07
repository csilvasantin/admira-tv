// Playlists vivas por metatags (Carlos, 7-oct-2026): una regla de contenido + etiquetas de pantalla deducidas solas.
import test from "node:test";
import assert from "node:assert/strict";
import { onRequestGet, onRequestPost } from "./functions/api/playlist.js";
import { applyCircuits, buildXpaceIndex, cleanCircuit, cleanIdIot, cleanLive, completeFacts, deduceScreenTags, idIotOfScreen, norm, resolveContent, targetMatches, LIVE_KEY, TAGS_PREFIX } from "./functions/api/_playlist-live.js";

const sessionToken = "session-token", sessionKey = `admira-tv:auth:session:${sessionToken}`;
const cookie = { Cookie: `__Host-atv_session=${sessionToken}`, "Content-Type": "application/json" };
function mundo(stock) {
  const data = new Map([[sessionKey, JSON.stringify({ email: "csilvasantin@gmail.com", expiresAt: Date.now() + 60000 })]]), meta = new Map();
  const ACCESS = {
    get: async k => data.get(k) ?? null,
    put: async (k, v, o) => { data.set(k, v); if (o && o.metadata) meta.set(k, o.metadata); },
    getWithMetadata: async k => ({ value: data.get(k) ?? null, metadata: meta.get(k) ?? null }),
    list: async ({ prefix }) => ({ keys: [...data.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name, metadata: meta.get(name) })), list_complete: true }),
  };
  const pedidas = [], real = globalThis.fetch;
  globalThis.fetch = async url => { url = String(url); pedidas.push(url);
    if (url.includes("/stock/index.json")) return Response.json({ items: stock.items });
    if (url.includes("/grid/config")) return Response.json({ ok: true, config: { circuit: "gracia" } });
    if (url.includes("/grid/projects")) return Response.json({ ok: true, projects: [{ id: "kiosk", circuits: ["kiosko", "gracia"] }] });
    return new Response("no", { status: 404 }); };
  return { env: { ACCESS }, data, meta, pedidas, fin: () => { globalThis.fetch = real; } };
}
const pieza = (id, tags, extra = {}) => ({ id, type: "video", title: "Pieza " + id, tags, url: `https://stock.admira.store/stock/${id}/asset.mp4`, createdAt: 1000 + Number(id.replace(/\D/g, "")), ...extra });
const get = (env, qs) => onRequestGet({ request: new Request("https://admira.tv/api/playlist?" + qs), env });
const post = (env, body, headers = cookie) => onRequestPost({ request: new Request("https://admira.tv/api/playlist", { method: "POST", headers, body: JSON.stringify(body) }), env });
const regla = (extra = {}) => ({ name: "Cafés verticales", content: { any: ["#café"], limit: 10, seconds: 12 }, target: { all: ["circuito:gracia", "orientacion:vertical"] }, ...extra });

test("la pantalla se deduce sola sus etiquetas: circuito, proyecto, orientación e idioma", () => {
  assert.deepEqual(deduceScreenTags({ screen: "Sim-Gracia-Kiosko", circuit: "Gràcia", project: "kiosk", w: 1080, h: 1920, lang: "es-ES" }),
    ["circuito:gracia", "idioma:es", "orientacion:vertical", "pantalla:sim-gracia-kiosko", "proyecto:kiosk", "todas"]);
  assert.deepEqual(deduceScreenTags({ screen: "x1", w: 1920, h: 1080 }), ["orientacion:horizontal", "pantalla:x1", "todas"]);
  assert.equal(targetMatches({ all: ["circuito:gracia"], any: [] }, ["circuito:gracia", "todas"]), true);
  assert.equal(targetMatches({ all: [], any: [] }, ["todas"]), false, "sin destino no va a ninguna pantalla");
});

test("el contenido casa por tag sin tildes ni almohadilla, respeta exclusiones, vigencia, orientación y límite", () => {
  const stock = [pieza("p1", ["Café", "otoño"]), pieza("p2", ["cafe", "interno"]), pieza("p3", ["té"]), pieza("p4", ["café"], { orientacion: "horizontal" }),
    pieza("p5", ["café"], { catalogo: { hasta: "2020-01-01" } }), pieza("p6", ["café"], { type: "audio" }), pieza("p7", ["café"], { url: "http://inseguro/x.mp4" }), pieza("p8", ["listas café"])];
  const c = cleanLive(regla({ content: { any: ["#Café"], none: ["interno"], limit: 10, seconds: 12 } })).content;
  const out = resolveContent(c, stock, { w: 1080, h: 1920 });
  assert.deepEqual(out.map(i => i.stockId), ["p8", "p1"], "más nuevas primero; fuera interno, horizontal, caducada, audio y no-https");
  assert.equal(out[0].seconds, 12); assert.equal(out[0].assetType, "video"); assert.equal(norm("#Música_Chill"), "musica chill");
  assert.deepEqual(resolveContent({ ...c, limit: 1 }, stock, {}).map(i => i.stockId), ["p8"]);
  assert.throws(() => cleanLive({ name: "x", content: { any: ["a"] }, target: {} }), /live_target_required/);
  assert.throws(() => cleanLive({ name: "x", content: {}, target: { all: ["todas"] } }), /live_content_required/);
});

test("guardar exige sesión; la pantalla que cumple recibe las piezas y la que no, nada", async () => {
  const stock = { items: [pieza("a1", ["café"]), pieza("a2", ["zumo"])] }, m = mundo(stock);
  try {
    assert.equal((await post(m.env, { action: "live-save", playlist: regla() }, { "Content-Type": "application/json" })).status, 401);
    const saved = await post(m.env, { action: "live-save", playlist: regla() });
    assert.equal(saved.status, 200);
    const live = (await saved.json()).live;
    assert.equal(live.playlists[0].id, "cafes-verticales"); assert.equal(live.playlists[0].updatedBy, "csilvasantin@gmail.com");
    const si = await (await get(m.env, "screen=sim-gracia-kiosko&w=1080&h=1920&lang=es")).json();
    assert.deepEqual(si.draft.items.map(i => i.stockId), ["a1"]);
    assert.equal(si.draft.name, "Cafés verticales"); assert.deepEqual(si.draft.live, [{ id: "cafes-verticales", name: "Cafés verticales" }]);
    assert.ok(si.screenTags.includes("circuito:gracia") && si.screenTags.includes("proyecto:kiosk") && si.screenTags.includes("orientacion:vertical"));
    const no = await (await get(m.env, "screen=sim-gracia-kiosko&w=1920&h=1080")).json();
    assert.deepEqual(no.draft.items, [], "horizontal no cumple el destino"); assert.equal(no.draft.name, "Por defecto");
  } finally { m.fin(); }
});

test("es VIVA: al etiquetar otra pieza entra sola, y al pausar la regla deja de salir", async () => {
  const stock = { items: [pieza("a1", ["café"])] }, m = mundo(stock);
  try {
    const { live } = await (await post(m.env, { action: "live-save", playlist: regla() })).json();
    const q = "screen=sim-gracia-kiosko&w=1080&h=1920";
    const uno = await (await get(m.env, q)).json();
    stock.items.push(pieza("a9", ["Café"]));
    const dos = await (await get(m.env, q)).json();
    assert.deepEqual(dos.draft.items.map(i => i.stockId), ["a9", "a1"]);
    assert.notEqual(dos.draft.rev, uno.draft.rev, "la revisión cambia cuando cambia lo que sale");
    stock.items.pop();
    assert.equal((await (await get(m.env, q)).json()).draft.rev, uno.draft.rev, "y vuelve a la de antes si la pieza pierde el tag");
    assert.equal((await post(m.env, { action: "live-save", playlist: regla({ enabled: false }), rev: live.rev })).status, 200);
    assert.deepEqual((await (await get(m.env, q)).json()).draft.items, []);
    assert.equal((await post(m.env, { action: "live-save", playlist: regla(), rev: 1 })).status, 409, "revisión vieja no pisa");
  } finally { m.fin(); }
});

test("lo puesto a mano en la pantalla manda sobre las playlists vivas", async () => {
  const m = mundo({ items: [pieza("a1", ["café"])] });
  try {
    await post(m.env, { action: "live-save", playlist: regla() });
    await post(m.env, { screen: "sim-gracia-kiosko", items: [{ id: "manual", asset: "https://cdn.example/manual.mp4", assetType: "video" }] });
    const d = await (await get(m.env, "screen=sim-gracia-kiosko&w=1080&h=1920")).json();
    assert.deepEqual(d.draft.items.map(i => i.id), ["manual"]); assert.equal(d.draft.live, undefined);
  } finally { m.fin(); }
});

test("sin playlists vivas no se consulta nada fuera, y el registro de etiquetas sólo se escribe si cambian", async () => {
  const m = mundo({ items: [] });
  try {
    await get(m.env, "screen=tienda-1&circuit=xtanco&w=1080&h=1920&lang=ca");
    assert.deepEqual(m.pedidas, [], "ni Stock ni parrilla mientras no haya reglas");
    assert.deepEqual(m.meta.get(TAGS_PREFIX + "tienda-1").tags, ["circuito:xtanco", "idioma:ca", "orientacion:vertical", "pantalla:tienda-1", "todas"]);
    const visto = m.meta.get(TAGS_PREFIX + "tienda-1").seenAt;
    await get(m.env, "screen=tienda-1&circuit=xtanco&w=1080&h=1920&lang=ca");
    assert.equal(m.meta.get(TAGS_PREFIX + "tienda-1").seenAt, visto, "misma pantalla, mismas etiquetas: no reescribe");
    await get(m.env, "screen=tienda-1&circuit=xtanco&w=1920&h=1080&lang=ca");
    assert.ok(m.meta.get(TAGS_PREFIX + "tienda-1").tags.includes("orientacion:horizontal"));
  } finally { m.fin(); }
});

test("el editor ve reglas, pantallas conocidas y el previo de una regla; sin sesión, 401", async () => {
  const m = mundo({ items: [pieza("a1", ["café"]), pieza("a2", ["café"])] });
  try {
    await get(m.env, "screen=k1&circuit=gracia&w=1080&h=1920"); await get(m.env, "screen=k2&circuit=gracia&w=1920&h=1080"); await get(m.env, "screen=x9&circuit=xtanco&w=1080&h=1920");
    await post(m.env, { screen: "k1", items: [{ id: "manual", asset: "https://cdn.example/m.mp4" }] });
    assert.equal((await get(m.env, "live=1")).status, 401);
    const admin = r => onRequestGet({ request: new Request("https://admira.tv/api/playlist?" + r, { headers: cookie }), env: m.env });
    const lista = await (await admin("live=1")).json();
    assert.deepEqual(lista.screens.map(s => s.screen), ["k1", "k2", "x9"]);
    const previo = await (await admin("preview=1&rule=" + encodeURIComponent(JSON.stringify(regla())))).json();
    assert.equal(previo.total, 2); assert.deepEqual(previo.screens, ["k1"]); assert.deepEqual(previo.manual, ["k1"], "avisa de la que tiene playlist a mano");
    assert.equal(m.data.has(LIVE_KEY), false, "previsualizar no guarda");
    assert.equal((await post(m.env, { action: "live-delete", id: "no-existe" })).status, 404);
  } finally { m.fin(); }
});

test("el player manda sus datos al pedir la playlist y el editor guarda la regla, no una lista", async () => {
  const { readFileSync } = await import("node:fs");
  const canal = readFileSync(new URL("./canal.html", import.meta.url), "utf8"), parrilla = readFileSync(new URL("./parrilla/index.html", import.meta.url), "utf8");
  assert.match(canal, /'\/api\/playlist\?screen='\+encodeURIComponent\(screen\)\+defaultDraftHints\+'&_='/);
  assert.match(canal, /'&circuit='\+encodeURIComponent\(c\)/); assert.match(canal, /'&w='\+w\+'&h='\+h/);
  assert.match(parrilla, /id="plViva"/);
  assert.match(parrilla, /content:\{any:\[\.\.\.plTagSel\],limit:[^}]+\},target:\{all:\[\.\.\.plVivaSel\]\}/);
  assert.match(parrilla, /action:accion\|\|'live-save'/);
});

// ── Identificadores únicos (Carlos, 7-oct-2026: «lo más importante») ─────────────────────────────
test("cada proyecto, Xpacio y pantalla tiene su etiqueta única, y el destino se lee por facetas", () => {
  const tags = deduceScreenTags({ screen: "sbux-pg103-p1", project: "starbucks", xpace: "alsea-sbux-021", circuit: "alsea_starbucks", w: 1080, h: 1920 });
  for (const t of ["proyecto:starbucks", "xpacio:alsea-sbux-021", "pantalla:sbux-pg103-p1", "orientacion:vertical"]) assert.ok(tags.includes(t), t);
  assert.equal(targetMatches({ all: ["pantalla:sbux-pg103-p1"] }, tags), true, "una pantalla concreta");
  assert.equal(targetMatches({ all: ["pantalla:otra", "pantalla:sbux-pg103-p1"] }, tags), true, "dos pantallas marcadas: vale cualquiera de las dos");
  assert.equal(targetMatches({ all: ["xpacio:alsea-sbux-021", "orientacion:horizontal"] }, tags), false, "entre claves distintas tienen que cumplirse todas");
  assert.equal(targetMatches({ all: ["proyecto:starbucks", "xpacio:alsea-sbux-021", "orientacion:vertical"] }, tags), true);
  assert.equal(targetMatches({ all: ["proyecto:365"] }, tags), false);
});

test("el catálogo de Xpacios da el Xpacio de una pantalla y su marca hace de proyecto si nadie dice otra cosa", () => {
  const index = buildXpaceIndex([{ id: "alsea-sbux-021", name: "Starbucks Paseo de Gracia", circuit: "alsea_starbucks", external: { brand: "Starbucks" }, surfaces: [{ name: "Menu board", screen: "SBUX-PG103-P1" }, { name: "sin pantalla" }] },
    { id: "tienda-x", name: "Tienda X", screen: "ipad-admin-mupi" }, { name: "sin id", screen: "nada" }]);
  assert.deepEqual(Object.keys(index).sort(), ["ipad-admin-mupi", "sbux-pg103-p1"]);
  const f = completeFacts({ screen: "sbux-pg103-p1" }, { xpaceIndex: index, projects: [{ id: "kiosk", circuits: ["kiosko"] }] });
  assert.equal(f.xpace, "alsea-sbux-021"); assert.equal(f.circuit, "alsea_starbucks"); assert.equal(f.project, "Starbucks");
  const declarado = completeFacts({ screen: "sbux-pg103-p1", project: "alsea", xpace: "otro" }, { xpaceIndex: index, registry: { "sbux-pg103-p1": { p: "starbucks", x: "alsea-sbux-021" } } });
  assert.equal(declarado.project, "alsea"); assert.equal(declarado.xpace, "otro", "lo que declara el propio player manda");
  const registrado = completeFacts({ screen: "sim-gracia-kiosko", circuit: "gracia" }, { registry: { "sim-gracia-kiosko": { p: "kiosk", x: "gracia" } }, projects: [{ id: "otro", circuits: ["gracia"] }] });
  assert.equal(registrado.project, "kiosk", "el registro de identidad va antes que la parrilla por circuito"); assert.equal(registrado.xpace, "gracia");
});

test("una playlist enviada al identificador único de una pantalla llega sólo a esa pantalla, cada vez que se conecta", async () => {
  const m = mundo({ items: [pieza("a1", ["café"])] });
  try {
    const destino = { all: ["proyecto:starbucks", "xpacio:alsea-sbux-021", "pantalla:sbux-pg103-p1"] };
    assert.equal((await post(m.env, { action: "live-save", playlist: regla({ name: "Pantalla 1", target: destino }) })).status, 200);
    const yo = await (await get(m.env, "screen=sbux-pg103-p1&project=starbucks&xpace=alsea-sbux-021&w=1080&h=1920")).json();
    assert.deepEqual(yo.draft.items.map(i => i.stockId), ["a1"]);
    assert.ok(yo.screenTags.includes("xpacio:alsea-sbux-021") && yo.screenTags.includes("proyecto:starbucks"));
    const vecina = await (await get(m.env, "screen=sbux-pg103-p2&project=starbucks&xpace=alsea-sbux-021&w=1080&h=1920")).json();
    assert.deepEqual(vecina.draft.items, [], "la pantalla 2 del mismo Xpacio no la recibe");
    const otra = await (await get(m.env, "screen=sbux-pg103-p1&project=starbucks&xpace=otro-centro")).json();
    assert.deepEqual(otra.draft.items, [], "ni una pantalla con ese id en otro Xpacio");
  } finally { m.fin(); }
});

test("la jerarquía de la parrilla se registra como identidad y da proyecto y Xpacio a las pantallas", async () => {
  const m = mundo({ items: [pieza("a1", ["café"])] });
  try {
    const sync = { action: "identity-sync", screens: [{ screen: "sim-gracia-kiosko", name: "Canal Kiosk Plaça Vila", project: "kiosk", xpace: "gracia", xpaceName: "CanalKiosk Gràcia" }, { screen: "mala pantalla!", project: "x" }] };
    assert.equal((await post(m.env, sync, { "Content-Type": "application/json" })).status, 401, "sin sesión no se registra nada");
    const r = await (await post(m.env, sync)).json();
    assert.equal(r.ok, true); assert.equal(r.changed, 1); assert.equal(r.total, 1);
    assert.equal((await (await post(m.env, sync)).json()).changed, 0, "repetirlo no reescribe");
    await post(m.env, { action: "live-save", playlist: regla({ target: { all: ["xpacio:gracia"] } }) });
    const d = await (await get(m.env, "screen=sim-gracia-kiosko&w=1080&h=1920")).json();
    assert.ok(d.screenTags.includes("proyecto:kiosk") && d.screenTags.includes("xpacio:gracia"));
    assert.deepEqual(d.draft.items.map(i => i.stockId), ["a1"]);
    const lista = await (await onRequestGet({ request: new Request("https://admira.tv/api/playlist?live=1", { headers: cookie }), env: m.env })).json();
    const k = lista.screens.find(s => s.screen === "sim-gracia-kiosko");
    assert.equal(k.name, "Canal Kiosk Plaça Vila"); assert.equal(lista.xpaces.gracia, "CanalKiosk Gràcia");
  } finally { m.fin(); }
});

test("una pantalla que sólo declara su Xpacio recibe de su ficha el circuito y el proyecto (Starbucks Pg. Gràcia 103)", () => {
  const ficha = { id: "alsea-sbux-021", name: "Starbucks Paseo de Gracia", circuit: "alsea_starbucks", external: { brand: "Starbucks" } };
  const facts = completeFacts({ screen: "sbux-pg103-p1", xpace: "alsea-sbux-021", w: 1080, h: 1920 }, { xpaceRecord: ficha });
  const tags = deduceScreenTags(facts);
  for (const t of ["proyecto:starbucks", "xpacio:alsea-sbux-021", "pantalla:sbux-pg103-p1", "circuito:alsea-starbucks", "orientacion:vertical"]) assert.ok(tags.includes(t), t + " en " + tags.join(" "));
  assert.equal(completeFacts({ screen: "sbux-pg103-p1", xpace: "alsea-sbux-021" }, { xpaceRecord: ficha, gridCircuit: "sbux" }).circuit, "alsea_starbucks", "la ficha declarada gana al circuito supuesto");
  // La ficha de OTRO Xpacio no se le pega a esta pantalla, y lo que el player declara manda sobre la ficha.
  assert.equal(completeFacts({ screen: "x", xpace: "otro" }, { xpaceRecord: ficha }).project, undefined);
  assert.equal(completeFacts({ screen: "x", xpace: "alsea-sbux-021", project: "alsea" }, { xpaceRecord: ficha }).project, "alsea");
  // «La pantalla 1, vertical, del Starbucks de Pg. Gràcia 103»: casa ella y no su vecina ni una horizontal.
  const destino = { all: ["proyecto:starbucks", "xpacio:alsea-sbux-021", "pantalla:sbux-pg103-p1", "orientacion:vertical"], any: [] };
  assert.equal(targetMatches(destino, tags), true);
  assert.equal(targetMatches(destino, deduceScreenTags(completeFacts({ screen: "sbux-pg103-p2", xpace: "alsea-sbux-021", w: 1080, h: 1920 }, { xpaceRecord: ficha }))), false);
  assert.equal(targetMatches(destino, deduceScreenTags(completeFacts({ screen: "sbux-pg103-p1", xpace: "alsea-sbux-021", w: 1920, h: 1080 }, { xpaceRecord: ficha }))), false);
});

test("sin ninguna playlist viva, la pantalla que declara su Xpacio ya queda registrada con proyecto y circuito", async () => {
  const src = (await import("node:fs")).readFileSync(new URL("./functions/api/playlist.js", import.meta.url), "utf8");
  assert.match(src, /if \(activas\.length \|\| facts\.xpace \|\| facts\.iotDeclared\) await enrichFacts\(facts, env, waitUntil\)/);
});

// ── idIoT como destino (Carlos, 7-oct-2026: «guárdalo en la ficha y que admira.tv lo acepte como destino») ──
const PG103 = { id: "alsea-sbux-021", name: "Starbucks Paseo de Gracia", circuit: "alsea_starbucks", external: { brand: "Starbucks" }, surfaces: [{ name: "Menu board", surface: "pantalla" }],
  iot: [{ idIoT: "Starbucks_PaseodeGracia_103_Pantalla_1", type: "Pantalla", n: 1, player: "sbux-pg103-p1" }, { idIoT: "Starbucks_PaseodeGracia_103_Pantalla_2", type: "Pantalla", n: 2, player: "" }] };
// El catálogo simulado: resuelve un idIoT (como GET /locations/iot/<idIoT>) y la ficha de su Xpacio.
function conCatalogo(m) {
  const prev = globalThis.fetch;
  globalThis.fetch = async url => { url = String(url);
    const iot = /\/locations\/iot\/([^/?]+)$/.exec(url);
    if (iot) { const e = PG103.iot.find(x => x.idIoT.toLowerCase() === decodeURIComponent(iot[1]).toLowerCase());
      return e ? Response.json({ idIoT: e.idIoT, element: e, location: { id: PG103.id, name: PG103.name, circuit: PG103.circuit, brand: "Starbucks" } }) : new Response("{}", { status: 404 }); }
    if (url.endsWith("/locations/alsea-sbux-021")) return Response.json({ location: PG103 });
    if (url.endsWith("/locations")) return Response.json({ locations: [PG103] });
    return prev(url); };
  return m;
}

test("el idIoT guardado en la ficha es otro identificador de la misma pantalla", () => {
  assert.equal(cleanIdIot(" Starbucks_PaseodeGracia_103_Pantalla_1 "), "Starbucks_PaseodeGracia_103_Pantalla_1");
  assert.equal(cleanIdIot("pantalla 1"), ""); assert.equal(cleanIdIot("a_b"), "");
  assert.equal(idIotOfScreen(PG103, "SBUX-PG103-P1"), "Starbucks_PaseodeGracia_103_Pantalla_1");
  assert.equal(idIotOfScreen({ screen: "x-mupi", surfaces: [{ screen: "x-mupi", idIoT: "AdmiraNeXT_X_1_Pantalla_1" }] }, "x-mupi"), "AdmiraNeXT_X_1_Pantalla_1");
  const index = buildXpaceIndex([PG103]);
  assert.equal(index["sbux-pg103-p1"].i, "Starbucks_PaseodeGracia_103_Pantalla_1");
  const tags = deduceScreenTags(completeFacts({ screen: "sbux-pg103-p1", w: 1080, h: 1920 }, { xpaceIndex: index }));
  for (const t of ["pantalla:sbux-pg103-p1", "pantalla:starbucks-paseodegracia-103-pantalla-1", "xpacio:alsea-sbux-021", "proyecto:starbucks"]) assert.ok(tags.includes(t), t);
  assert.equal(targetMatches({ all: ["pantalla:starbucks-paseodegracia-103-pantalla-1"], any: [] }, tags), true);
});

test("un player que declara su idIoT (?iot=) recibe la playlist enviada a ese nombre, con su Xpacio y su proyecto", async () => {
  const m = conCatalogo(mundo({ items: [pieza("a1", ["café"])] }));
  try {
    const destino = { all: ["pantalla:Starbucks_PaseodeGracia_103_Pantalla_2"] };
    const guardada = await (await post(m.env, { action: "live-save", playlist: regla({ name: "Pared 2", target: destino }) })).json();
    assert.deepEqual(guardada.live.playlists[0].target.all, ["pantalla:starbucks-paseodegracia-103-pantalla-2"]);
    const yo = await (await get(m.env, "screen=tablet-nueva&iot=Starbucks_PaseodeGracia_103_Pantalla_2&w=1080&h=1920")).json();
    assert.deepEqual(yo.draft.items.map(i => i.stockId), ["a1"]);
    for (const t of ["pantalla:starbucks-paseodegracia-103-pantalla-2", "pantalla:tablet-nueva", "xpacio:alsea-sbux-021", "proyecto:starbucks", "circuito:alsea-starbucks"]) assert.ok(yo.screenTags.includes(t), t);
    const inventado = await (await get(m.env, "screen=intruso&iot=Starbucks_PaseodeGracia_103_Pantalla_99")).json();
    assert.deepEqual(inventado.draft.items, []); assert.ok(!inventado.screenTags.some(t => /pantalla-99|xpacio:/.test(t)), "un idIoT que el catálogo no conoce no da identidad");
    const contradice = await (await get(m.env, "screen=otro&iot=Starbucks_PaseodeGracia_103_Pantalla_2&loc=otro-centro")).json();
    assert.deepEqual(contradice.draft.items, [], "ni uno real declarado desde otro Xpacio");
  } finally { m.fin(); }
});

// ── Circuitos definidos (Carlos, 7-oct-2026: «definir circuitos para distribuir los contenidos con los metatags») ──
test("un circuito es un grupo con nombre: toda pantalla que cumple su definición gana circuito:<id>", () => {
  const c = cleanCircuit({ name: "Starbucks Verticales", target: { all: ["proyecto:Starbucks", "orientacion:vertical", "circuito:starbucks-verticales"] } }, "yo");
  assert.equal(c.id, "starbucks-verticales"); assert.deepEqual(c.target.all, ["proyecto:starbucks", "orientacion:vertical"], "no se define consigo mismo");
  assert.throws(() => cleanCircuit({ name: "Vacío", target: {} }), /circuit_target_required/); assert.throws(() => cleanCircuit({ target: { all: ["todas"] } }), /circuit_name_required/);
  const vertical = ["orientacion:vertical", "pantalla:a", "proyecto:starbucks", "todas"], horizontal = ["orientacion:horizontal", "pantalla:b", "proyecto:starbucks", "todas"];
  assert.ok(applyCircuits(vertical, [c]).includes("circuito:starbucks-verticales")); assert.ok(!applyCircuits(horizontal, [c]).includes("circuito:starbucks-verticales"));
  assert.ok(!applyCircuits(vertical, [{ ...c, enabled: false }]).includes("circuito:starbucks-verticales"));
  const lista = cleanCircuit({ name: "Tres pantallas", target: { all: ["pantalla:a", "pantalla:b", "pantalla:c"] } });
  assert.ok(applyCircuits(horizontal, [lista]).includes("circuito:tres-pantallas"), "una lista de pantallas también es un circuito");
});

test("se define un circuito, se le envía una playlist por su etiqueta y llega a sus pantallas; al borrarlo dejan de recibirla", async () => {
  const m = mundo({ items: [pieza("a1", ["café"])] });
  try {
    const circuit = { name: "Kioskos verticales", target: { all: ["proyecto:kiosk", "orientacion:vertical"] } };
    assert.equal((await post(m.env, { action: "circuit-save", circuit }, { "Content-Type": "application/json" })).status, 401, "sin sesión no se define");
    const alta = await (await post(m.env, { action: "circuit-save", circuit })).json();
    assert.equal(alta.ok, true); assert.equal(alta.live.circuits[0].id, "kioskos-verticales"); assert.deepEqual(alta.live.playlists, []);
    const conRegla = await (await post(m.env, { action: "live-save", playlist: regla({ target: { all: ["circuito:kioskos-verticales"] } }) })).json();
    assert.equal(conRegla.live.circuits.length, 1, "guardar una playlist no pierde los circuitos");
    const dentro = await (await get(m.env, "screen=sim-gracia-kiosko&circuit=gracia&w=1080&h=1920")).json();
    assert.ok(dentro.screenTags.includes("circuito:kioskos-verticales")); assert.deepEqual(dentro.draft.items.map(i => i.stockId), ["a1"]);
    const fuera = await (await get(m.env, "screen=sim-gracia-led&circuit=gracia&w=1920&h=1080")).json();
    assert.ok(!fuera.screenTags.includes("circuito:kioskos-verticales")); assert.deepEqual(fuera.draft.items, []);
    assert.ok(!m.meta.get(TAGS_PREFIX + "sim-gracia-kiosko").tags.includes("circuito:kioskos-verticales"), "se recuerdan las etiquetas propias, no las del circuito definido");
    const admin = await (await onRequestGet({ request: new Request("https://admira.tv/api/playlist?live=1", { headers: cookie }), env: m.env })).json();
    assert.equal(admin.circuits.length, 1); assert.ok(admin.screens.find(x => x.screen === "sim-gracia-kiosko").tags.includes("circuito:kioskos-verticales"));
    const baja = await (await post(m.env, { action: "circuit-delete", id: "kioskos-verticales" })).json();
    assert.deepEqual(baja.live.circuits, []); assert.equal(baja.live.playlists.length, 1);
    assert.deepEqual((await (await get(m.env, "screen=sim-gracia-kiosko&circuit=gracia&w=1080&h=1920")).json()).draft.items, []);
    assert.equal((await post(m.env, { action: "circuit-delete", id: "no-existe" })).status, 404);
  } finally { m.fin(); }
});

test("el proyecto que el alta guarda en la ficha de un equipo es su proyecto en admira.tv", () => {
  const ficha = { id: "tablet-barra", name: "Tablet barra", project: "starbucks", screen: "tablet-barra-mupi", surfaces: [{ screen: "tablet-barra-mupi", idIoT: "Starbucks_RambladeCatalunya_5_Pantalla_1" }] };
  const tags = deduceScreenTags(completeFacts({ screen: "tablet-barra-mupi" }, { xpaceIndex: buildXpaceIndex([ficha]) }));
  for (const t of ["proyecto:starbucks", "xpacio:tablet-barra", "pantalla:starbucks-rambladecatalunya-5-pantalla-1"]) assert.ok(tags.includes(t), t);
});
