// node --test functions/api/emision.test.mjs — GET /api/emision con fetch y KV simulados (sin red).
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { onRequestGet, onRequest, soloLectura } from "./emision.js";
import { forgetMemo } from "./playlist.js";
import { LIVE_KEY, TAGS_PREFIX } from "./_playlist-live.js";

const AT = "2026-10-08T12:30:00+02:00";            // franja de mediodía (12-16) en Madrid
const TOKEN = "tok-sesion";

function kv(entries = {}, metas = {}) {
  const store = new Map(Object.entries(entries)), meta = new Map(Object.entries(metas)), writes = [];
  return {
    store, writes,
    get: async k => store.has(k) ? store.get(k) : null,
    getWithMetadata: async k => ({ value: store.get(k) ?? null, metadata: meta.get(k) ?? null }),
    list: async () => ({ keys: [], list_complete: true }),
    put: async (k, v) => { writes.push(["put", k]); store.set(k, v); },
    delete: async k => { writes.push(["delete", k]); store.delete(k); },
  };
}
const session = (email = "csilvasantin@gmail.com", extra = {}) => ({ ["admira-tv:auth:session:" + TOKEN]: JSON.stringify({ email, expiresAt: Date.now() + 3600e3, ...extra }) });
const req = (qs, cookie = true) => new Request("https://admira.tv/api/emision?" + qs, { headers: cookie ? { Cookie: "__Host-atv_session=" + TOKEN } : {} });

// ── Mundo simulado ─────────────────────────────────────────────────────────────────────────────────────────
const iso = d => new Date(Date.parse("2026-10-01T10:00:00Z") + d * 3600_000).toISOString();
const STOCK = Array.from({ length: 12 }, (_, i) => ({ id: `s${i + 1}`, num: i + 1, type: i % 3 ? "video" : "image", url: `https://api.admira.store/stock/asset/s${i + 1}`,
  title: `Pieza ${i + 1}`, category: "marca", createdAt: iso(i), motor: "grok-imagine-video", tags: i < 3 ? ["default", "vertical"] : ["oferta"],
  ancho: i % 2 ? 1920 : 1080, alto: i % 2 ? 1080 : 1920, thumbnail: `https://cdn/t${i + 1}.jpg` }));
const banda = (id, from, to, slots = []) => ({ id, label: id, from, to, capacity: 6, own: 0, paid: slots.length, slots, isNow: false });
const dia = (slots = []) => ({ ok: true, screen: "alcampo-alcala", date: "2026-10-08", config: { name: "Alcampo Alcalá", circuit: "alcampo", slotSeconds: 15 },
  bands: [banda("manana", "08:00", "12:00"), banda("mediodia", "12:00", "16:00", slots), banda("tarde", "16:00", "20:00"), banda("noche", "20:00", "23:59")] });
const heredada = { kind: "paid", status: "sold", bookingId: "def-alcampo-9", advertiser: "Alcampo", title: "Oferta semanal", creative: { type: "video", url: "https://cdn/oferta.mp4" }, stockId: "s7" };

let world, calls;
function mundo(over = {}) {
  world = { day: dia(), stock: { items: STOCK }, mode: { mode: "local" }, now: { ok: true, item: null, lastSeen: null }, mirror: { ok: false, items: [] },
    cache: { ok: true, cache: { contents: [{ id: "s2", duration: 31, width: 1920, height: 1080 }] } }, syncState: null, tema: null, leader: null, lectura: null, ...over };
}
beforeEach(() => {
  forgetMemo();
  calls = [];
  mundo();
  globalThis.__realFetch ??= globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input && input.url || input), method = String(init.method || (input && input.method) || "GET").toUpperCase();
    calls.push({ url, method });
    const ok = body => new Response(JSON.stringify(body), { status: body == null ? 404 : 200, headers: { "Content-Type": "application/json" } });
    if (url.includes("/grid/day")) return ok(world.day);
    if (url.includes("/stock/list")) return ok(world.stock);
    if (url.includes("/stock/index.json")) return ok({ items: STOCK });
    if (url.includes("/locations/mode")) return ok(world.mode);
    if (url.includes("/signage/now")) return ok(world.now);
    if (url.includes("/screen/cache")) return ok(world.cache);
    if (url.includes("/sync/state")) return ok(world.syncState);
    if (url.includes("/control/playlist")) return ok(url.includes("-tema") ? world.tema : url.includes("screen=" + (world.leaderId || "§")) ? world.leader : world.mirror);
    if (url.includes("/grid/config")) return ok({ ok: true, config: { circuit: "alcampo" } });
    if (url.includes("/grid/projects")) return ok({ ok: true, projects: [{ id: "alcampo", name: "Canal Alcampo", circuits: ["alcampo"] }] });
    if (url.includes("/api/lectura/sesion")) return ok(world.lectura);
    return ok(null);
  };
});
afterEach(() => { globalThis.fetch = globalThis.__realFetch; });

async function get(qs, env, cookie = true) {
  const r = await onRequestGet({ request: req(qs, cookie), env });
  return { status: r.status, body: await r.json(), headers: r.headers };
}

// ── Autenticación ──────────────────────────────────────────────────────────────────────────────────────────
test("pantalla mal escrita o instante ilegible → 400", async () => {
  assert.equal((await get("screen=../x", { ACCESS: kv(session()) })).status, 400);
  assert.equal((await get("screen=alcampo-alcala&at=ayer", { ACCESS: kv(session()) })).status, 400);
});

test("pantalla física: sin sesión 401, sin permiso 403, con permiso 200", async () => {
  assert.equal((await get("screen=alcampo-alcala", { ACCESS: kv() }, false)).status, 401);
  const users = { "admira-tv:users:v3": JSON.stringify({ v: 3, projects: [{ id: "admira-tv" }, { id: "digitalsignage-player", parent: "admira-tv" }],
    users: [{ email: "ana@x.com", status: "active", roles: { "digitalsignage-player": "viewer" } }, { email: "bea@x.com", status: "active", roles: { otra: "viewer" } }] }) };
  assert.equal((await get("screen=alcampo-alcala", { ACCESS: kv({ ...users, ...session("bea@x.com") }) })).status, 403);
  const ok = await get("screen=alcampo-alcala&at=" + encodeURIComponent(AT), { ACCESS: kv({ ...users, ...session("ana@x.com") }) });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.ok, true);
  assert.equal(ok.body.publico, false);
  assert.match(ok.headers.get("Cache-Control"), /no-store/);
});

test("la sesión de lectura (visor) entra mientras siga viva", async () => {
  const visor = session("lectura@merovingio.box", { lectura: true, sid: "a".repeat(64) });
  mundo({ lectura: { ok: true, site: "tv" } });
  assert.equal((await get("screen=alcampo-alcala", { ACCESS: kv(visor) })).status, 200);
  world.lectura = { ok: false };
  assert.equal((await get("screen=alcampo-alcala", { ACCESS: kv(visor) })).status, 401);
});

test("una pantalla virtual se lee sin sesión, como su /api/playlist", async () => {
  const draft = { "admira-tv:playlist:default:v1:virtual-xtanco": JSON.stringify({ screen: "virtual-xtanco", items: [{ id: "a", stockId: "s4", title: "Uno", seconds: 7, asset: "https://api.admira.store/stock/asset/s4", assetType: "image" }], rev: 1 }) };
  const r = await get("screen=virtual-xtanco&at=" + encodeURIComponent(AT), { ACCESS: kv(draft) }, false);
  assert.equal(r.status, 200);
  assert.equal(r.body.publico, true);
  assert.equal(r.body.fuente, "defecto");
  assert.deepEqual(r.body.piezas.map(p => [p.id, p.duracion, p.miniatura]), [["default:s4", 7, "https://cdn/t4.jpg"]]);
});

test("POST y demás métodos → 405", () => {
  assert.equal(onRequest().status, 405);
});

// ── Sin efectos ────────────────────────────────────────────────────────────────────────────────────────────
test("no escribe nada: ni etiquetas de la pantalla ni índice de Xpacios, ni POST, ni la cola de órdenes", async () => {
  const live = { [LIVE_KEY]: JSON.stringify({ rev: 1, playlists: [{ id: "vert", name: "Verticales", enabled: true, content: { all: ["oferta"], any: [], none: [], type: "visual", limit: 20, seconds: 10, matchOrientation: true }, target: { all: ["orientacion:vertical"], any: [] } }], circuits: [] }) };
  const store = kv({ ...session(), ...live }, { [TAGS_PREFIX + "alcampo-alcala"]: { tags: ["circuito:alcampo", "idioma:es", "orientacion:vertical", "pantalla:alcampo-alcala", "todas"], w: 1080, h: 1920, seenAt: 1 } });
  const r = await get("screen=alcampo-alcala&at=" + encodeURIComponent(AT), { ACCESS: store });
  assert.equal(r.status, 200);
  assert.deepEqual(store.writes, [], "la consulta ha escrito en KV");
  assert.ok(calls.every(c => c.method === "GET"), "alguna llamada no es GET");
  assert.ok(!calls.some(c => /locations\/cmd/.test(c.url)), "nunca se sondea la cola de órdenes de la pantalla");
  // Con su tamaño (1080×1920) la pantalla es vertical: la playlist viva por orientación le llega igual que al player.
  assert.equal(r.body.fuente, "defecto");
  assert.match(r.body.motivo.es, /viva: Verticales/);
  assert.ok(r.body.piezas.length > 0 && r.body.piezas.every(p => p.procedencia.tipo === "viva"));
  assert.equal(r.body.pantalla.orientacion, "vertical");
  assert.ok(r.body.piezas.every(p => p.orientacion === "vertical" && !p.formato), "la viva sólo trae piezas de su orientación");
});

test("soloLectura descarta put y delete pero lee", async () => {
  const base = kv({ a: "1" });
  const ro = soloLectura(base);
  await ro.put("b", "2"); await ro.delete("a");
  assert.equal(await ro.get("a"), "1");
  assert.deepEqual(base.writes, []);
});

// ── Decisiones ─────────────────────────────────────────────────────────────────────────────────────────────
const conPorDefecto = () => kv({ ...session(), "admira-tv:playlist:default:v1:alcampo-alcala": JSON.stringify({ screen: "alcampo-alcala", name: "Por defecto", rev: 2, items: [
  { id: "m1", stockId: "s5", title: "Manual", seconds: 12, asset: "https://api.admira.store/stock/asset/s5", assetType: "video", lane: "municipal" },
  { id: "m2", stockId: "s4", title: "Imagen", seconds: 8, asset: "https://api.admira.store/stock/asset/s4", assetType: "image", lane: "publicidad" }] }) });

test("«Por defecto» manda sin sincro ni reservas: piezas a mano con su duración", async () => {
  const r = await get("screen=alcampo-alcala&at=" + encodeURIComponent(AT), { ACCESS: conPorDefecto() });
  assert.equal(r.body.fuente, "defecto");
  assert.deepEqual(r.body.piezas.map(p => [p.id, p.duracion, p.carril, p.procedencia.tipo]), [["default:s5", null, "municipal", "manual"], ["default:s4", 8, "publicidad", "manual"]]);
  assert.equal(r.body.capas.find(c => c.id === "defecto").estado, "activa");
  assert.deepEqual(r.body.duracionTotal, { segundos: 8, desconocidas: 1, aproximada: true });
  assert.equal(r.body.franja.id, "mediodia");
  assert.deepEqual(r.body.franjas.map(f => f.activa), [false, true, false, false]);
});

test("una reserva pagada heredada del canal anula «Por defecto» y lo dice con nombre y franja", async () => {
  mundo({ day: dia([heredada]) });
  const r = await get("screen=alcampo-alcala&at=" + encodeURIComponent(AT), { ACCESS: conPorDefecto() });
  assert.equal(r.body.fuente, "stock");
  const defecto = r.body.capas.find(c => c.id === "defecto");
  assert.equal(defecto.estado, "anulada");
  assert.equal(defecto.anuladaPor, "parrilla");
  assert.equal(defecto.detalle.es, "La reserva pagada de la franja 12-16 de Alcampo, heredada del canal alcampo, anula «Por defecto».");
  assert.match(r.body.motivo.es, /^La reserva pagada de la franja 12-16 de Alcampo, heredada del canal alcampo, anula «Por defecto»: emite el Stock entero/);
  assert.match(r.body.motivo.en, /inherited paid booking|paid booking in the 12-16 slot by Alcampo, inherited from channel alcampo/);
  const grid = r.body.piezas.find(p => p.id === "grid:def-alcampo-9");
  assert.equal(grid.procedencia.tipo, "parrilla");
  assert.equal(grid.procedencia.heredada, "alcampo");
  assert.equal(grid.miniatura, "https://cdn/t7.jpg");
  assert.equal(r.body.capas.find(c => c.id === "parrilla").estado, "activa");
  // a las 17:00 la franja de la tarde no tiene reservas: vuelve «Por defecto»
  const tarde = await get("screen=alcampo-alcala&at=" + encodeURIComponent("2026-10-08T17:00:00+02:00"), { ACCESS: conPorDefecto() });
  assert.equal(tarde.body.fuente, "defecto");
});

test("sincro por grupo de /api/playout: emite el tema del kiosko y anula «Por defecto»", async () => {
  const store = conPorDefecto();
  store.store.set("admira-tv:playout:v1", JSON.stringify({ configured: true, mode: "synchronized", screens: ["kiosko-a", "alcampo-alcala"], revision: 1, updatedAt: 1 }));
  mundo({ syncState: { ok: true, slotMs: 20000, items: [{ id: "g1", url: "https://x/g1.mp4", type: "video" }] },
    tema: { ok: true, items: [{ id: "t1", url: "https://x/t1.mp4", type: "video", dur: 14, thumb: "https://cdn/tt.jpg" }, { id: "t2", url: "https://x/t2.jpg", type: "image" }] } });
  const r = await get("screen=alcampo-alcala&at=" + encodeURIComponent(AT), { ACCESS: store });
  assert.equal(r.body.fuente, "sincro");
  assert.match(r.body.motivo.es, /grupo de sincro de kiosko-a/);
  assert.match(r.body.motivo.es, /tema propio del kiosko \(alcampo-alcala-tema\)/);
  assert.deepEqual(r.body.piezas.map(p => [p.id, p.duracion, p.miniatura]), [["t1", 14, "https://cdn/tt.jpg"], ["t2", 9, "https://x/t2.jpg"]]);
  assert.equal(r.body.capas.find(c => c.id === "defecto").anuladaPor, "sincro");
  assert.equal(r.body.lecturas.sincro, "maestro");
});

test("modo remoto sincro del circuito, aunque la orquestación sea autónoma", async () => {
  const store = kv(session());
  store.store.set("admira-tv:playout:v1", JSON.stringify({ configured: true, mode: "autonomous", screens: [], revision: 1 }));
  mundo({ mode: { mode: "sincro" } });
  const r = await get("screen=alcampo-alcala&at=" + encodeURIComponent(AT), { ACCESS: store });
  assert.equal(r.body.fuente, "sincro");
  assert.match(r.body.motivo.es, /modo remoto de su circuito es sincro/);
  assert.equal(r.body.lecturas.sincro, "sin-maestro");
  assert.ok(r.body.avisos.some(a => /máster no responde/.test(a.es)));
  // y con modo condicional no hay sincro (la orquestación autónoma sólo obedece a la sincro remota)
  world.mode = { mode: "conditional" };
  const c = await get("screen=alcampo-alcala&at=" + encodeURIComponent(AT), { ACCESS: store });
  assert.equal(c.body.fuente, "stock");
  assert.equal(c.body.lecturas.modo, "local");
});

test("hashtag del mando simulado con ?tag=: manda sobre «Por defecto» y la parrilla", async () => {
  mundo({ day: dia([heredada]) });
  const r = await get("screen=alcampo-alcala&tag=Oferta&at=" + encodeURIComponent(AT), { ACCESS: conPorDefecto() });
  assert.equal(r.body.fuente, "hashtag");
  assert.equal(r.body.capas.find(c => c.id === "hashtag").origen, "simulado");
  assert.ok(r.body.piezas.length === 9 && r.body.piezas.every(p => p.procedencia.tipo === "hashtag-mando"));
});

test("Stock con #default cuando no hay nada decidido; ?resumen=1 no trae piezas", async () => {
  const vertical = { [TAGS_PREFIX + "alcampo-alcala"]: { tags: ["orientacion:vertical", "todas"], w: 1080, h: 1920 } };
  const r = await get("screen=alcampo-alcala&at=" + encodeURIComponent(AT), { ACCESS: kv(session(), vertical) });
  assert.equal(r.body.fuente, "stock");
  assert.match(r.body.motivo.es, /lo etiquetado #default \(3 piezas\)/);
  assert.deepEqual(r.body.piezas.map(p => p.stockId), ["s3", "s2", "s1"]);
  assert.equal(r.body.piezas[1].duracion, 31, "la duración medida por la propia pantalla (/screen/cache)");
  // s2 mide 1920×1080 en la pantalla vertical de 1080×1920: aviso de formato
  assert.match(r.body.piezas[1].formato.es, /Pieza horizontal en pantalla vertical/);
  assert.ok(r.body.avisos.some(a => a.es === "1 pieza no tiene la orientación de la pantalla (vertical)."));
  const s = await get("screen=alcampo-alcala&resumen=1&at=" + encodeURIComponent(AT), { ACCESS: kv(session()) });
  assert.equal(s.body.piezas, undefined);
  assert.equal(s.body.total, 3);
});

test("otro día: pide la parrilla de esa fecha y no mezcla lo observado ahora", async () => {
  const r = await get("screen=alcampo-alcala&at=" + encodeURIComponent("2026-10-10T10:00:00+02:00"), { ACCESS: kv(session()) });
  assert.equal(r.body.ahora, false);
  assert.equal(r.body.observado, null);
  assert.ok(calls.some(c => /grid\/day\?screen=alcampo-alcala&date=20261010/.test(c.url)));
  assert.ok(!calls.some(c => /signage\/now/.test(c.url)));
});

test("ahora: compara con la lista que la pantalla publicó y avisa si no coincide", async () => {
  mundo({ now: { ok: true, lastSeen: Date.now() - 1000, item: { id: "s9", title: "Pieza 9", type: "video", startedAt: Date.now() - 5000, dur: 20, sinc: { on: 0, modo: "local" } } },
    mirror: { ok: true, items: [{ id: "s9" }, { id: "s8" }] } });
  const r = await get("screen=alcampo-alcala", { ACCESS: kv(session()) });
  assert.equal(r.body.ahora, true);
  assert.equal(r.body.observado.vivo, true);
  assert.equal(r.body.observado.ahora.titulo, "Pieza 9");
  assert.deepEqual(r.body.observado.publicada, { n: 2, parece: "stock-o-hashtag", coincide: false });
  assert.ok(r.body.avisos.some(a => /publicó otra lista/.test(a.es)));
});
