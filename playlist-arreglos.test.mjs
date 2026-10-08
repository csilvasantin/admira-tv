// Arreglos de la creación de playlists (Carlos, 8-oct-2026, fase 1): la API con un KV simulado, de verdad.
//   B2 · un borrador que componen las playlists vivas o el hashtag se marca como sintético y no da 409 falsos.
//   B3 · leer la playlist (parrilla, Pixeria, Adaptador) no reescribe el censo de etiquetas; sólo el player.
//   B1 · lo que se escribe en «Por defecto» es lo que el player recibe (y conserva su nombre).
import test from "node:test";
import assert from "node:assert/strict";
import { forgetMemo, fromPlayer, onRequestGet, onRequestPost } from "./functions/api/playlist.js";
import { TAGS_PREFIX } from "./functions/api/_playlist-live.js";

const sessionToken = "session-token", sessionKey = `admira-tv:auth:session:${sessionToken}`;
const cookie = { Cookie: `__Host-atv_session=${sessionToken}`, "Content-Type": "application/json" };
function mundo(stock = { items: [] }) {
  forgetMemo();
  const data = new Map([[sessionKey, JSON.stringify({ email: "csilvasantin@gmail.com", expiresAt: Date.now() + 60000 })]]), meta = new Map(), escritas = [];
  const ACCESS = {
    get: async k => data.get(k) ?? null,
    put: async (k, v, o) => { escritas.push(k); data.set(k, v); if (o && o.metadata) meta.set(k, o.metadata); },
    getWithMetadata: async k => ({ value: data.get(k) ?? null, metadata: meta.get(k) ?? null }),
    list: async ({ prefix }) => ({ keys: [...data.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name, metadata: meta.get(name) })), list_complete: true }),
  };
  const real = globalThis.fetch;
  globalThis.fetch = async url => { url = String(url);
    if (url.includes("/stock/index.json")) return Response.json({ items: stock.items });
    if (url.includes("/grid/config")) return Response.json({ ok: true, config: { circuit: "gracia" } });
    if (url.includes("/grid/projects")) return Response.json({ ok: true, projects: [{ id: "kiosk", circuits: ["kiosko", "gracia"] }] });
    return new Response("no", { status: 404 }); };
  return { env: { ACCESS, STOCK_NOTIFY_KEY: "clave-del-stock" }, data, meta, escritas, fin: () => { globalThis.fetch = real; } };
}
const pieza = (id, tags) => ({ id, type: "video", title: "Pieza " + id, tags, url: `https://stock.admira.store/stock/${id}/asset.mp4`, createdAt: 1000 + Number(id.replace(/\D/g, "")) });
const get = async (env, qs, headers = {}) => (await onRequestGet({ request: new Request("https://admira.tv/api/playlist?" + qs, { headers }), env })).json();
const post = (env, body, headers = cookie) => onRequestPost({ request: new Request("https://admira.tv/api/playlist", { method: "POST", headers, body: JSON.stringify(body) }), env });
const regla = { name: "Cafés", content: { any: ["café"], limit: 10, seconds: 12 }, target: { all: ["circuito:gracia"] } };
const manual = [{ id: "m1", title: "Mano", asset: "https://cdn.example/m1.mp4", assetType: "video", seconds: 8 }];
const PANTALLA = "screen=sim-gracia-kiosko";                    // como la leen la parrilla, Pixeria y el Adaptador
const PLAYER = PANTALLA + "&w=1080&h=1920&lang=es";             // como la pide canal.html

test("B2 · el borrador de una playlist viva se marca sintético, con su origen y la rev de lo guardado (0)", async () => {
  const m = mundo({ items: [pieza("a1", ["café"])] });
  try {
    assert.equal((await post(m.env, { action: "live-save", playlist: regla })).status, 200);
    const { draft } = await get(m.env, PANTALLA);
    assert.equal(draft.synthetic, true);
    assert.deepEqual(draft.origin, { live: [{ id: "cafes", name: "Cafés" }], hashtag: 0 });
    assert.equal(draft.rev, 0, "nada guardado → rev 0");
    assert.equal(typeof draft.liveRev, "number"); assert.ok(draft.liveRev > 0);
    assert.deepEqual(draft.items.map(i => i.stockId), ["a1"]);
    const vacia = (await get(mundo().env, "screen=otra-pantalla")).draft;
    assert.equal(vacia.synthetic, false, "una lista vacía de verdad no es sintética");
  } finally { m.fin(); }
});

test("B2 · el borrador dirigido por #hashtag también es sintético y dice de dónde viene", async () => {
  const m = mundo({ items: [pieza("h1", ["Starbucks_PG103_P1"]), pieza("h2", ["otra_cosa_distinta"])] });
  try {
    const { draft } = await get(m.env, "screen=starbucks-pg103-p1");
    assert.equal(draft.synthetic, true);
    assert.deepEqual(draft.origin, { live: [], hashtag: 1 });
    assert.equal(draft.rev, 0);
    assert.equal(draft.name, "Dirigido por hashtag");
  } finally { m.fin(); }
});

test("B2 · guardar sobre una pantalla que sigue reglas vivas ya no da 409: ni con la rev nueva, ni con el hash antiguo, ni con basura", async () => {
  const m = mundo({ items: [pieza("a1", ["café"])] });
  try {
    await post(m.env, { action: "live-save", playlist: regla });
    const { draft } = await get(m.env, PANTALLA);
    for (const rev of [draft.liveRev, "no-es-un-numero", draft.rev]) {
      m.data.delete("admira-tv:playlist:default:v1:sim-gracia-kiosko");
      const r = await post(m.env, { screen: "sim-gracia-kiosko", name: "Fijada a mano · Cafés", items: draft.items, rev });
      assert.equal(r.status, 200, "rev " + rev);
    }
    const fijada = (await get(m.env, PLAYER)).draft;
    assert.equal(fijada.synthetic, false, "fijada a mano: ya no sigue la regla");
    assert.equal(fijada.name, "Fijada a mano · Cafés");
    assert.ok(fijada.rev > 0);
  } finally { m.fin(); }
});

test("B2 · con algo guardado la protección sigue: dos editores con la misma rev → el segundo recibe 409", async () => {
  const m = mundo({ items: [pieza("a1", ["café"])] });
  try {
    await post(m.env, { action: "live-save", playlist: regla });
    // Alguien dejó «Por defecto» vacía a propósito (rev > 0): se ve la regla viva, con la rev de lo guardado.
    const vaciada = await (await post(m.env, { screen: "sim-gracia-kiosko", items: [] })).json();
    const { draft } = await get(m.env, PANTALLA);
    assert.equal(draft.synthetic, true); assert.equal(draft.rev, vaciada.rev, "la rev que vale para escribir es la guardada");
    const uno = await post(m.env, { screen: "sim-gracia-kiosko", items: manual, rev: draft.rev });
    assert.equal(uno.status, 200);
    const dos = await post(m.env, { screen: "sim-gracia-kiosko", items: [], rev: draft.rev });
    assert.equal(dos.status, 409, "el segundo editor no pisa al primero");
    const hashViejo = await post(m.env, { screen: "sim-gracia-kiosko", items: [], rev: draft.liveRev });
    assert.equal(hashViejo.status, 409, "con algo guardado, una rev ajena sigue siendo conflicto");
  } finally { m.fin(); }
});

// El Adaptador de Pixeria (functions/players-programar.js · inspect + bucle real) hace exactamente esto:
// lee ?screen= sin pistas, toma Number(draft.rev)||0 y la manda sólo si no es 0, con X-Notify-Key.
async function adaptador(env, screen, items) {
  const live = await get(env, "screen=" + encodeURIComponent(screen));
  const rev = live && live.ok && live.draft ? Number(live.draft.rev) || 0 : 0;
  const payload = { screen, name: "Altadis · Estanco 1", source: "adaptador altadis", items };
  const r = await onRequestPost({ request: new Request("https://admira.tv/api/playlist", { method: "POST", headers: { "Content-Type": "application/json", "X-Notify-Key": "clave-del-stock" }, body: JSON.stringify(rev ? { ...payload, rev } : payload) }), env });
  return { status: r.status, body: await r.json() };
}

test("B2 · el Adaptador de Pixeria deja de recibir 409 en pantallas con playlist viva o con #hashtag", async () => {
  const m = mundo({ items: [pieza("a1", ["café"]), pieza("h1", ["Starbucks_PG103_P1"])] });
  try {
    await post(m.env, { action: "live-save", playlist: regla });
    for (const screen of ["sim-gracia-kiosko", "starbucks-pg103-p1"]) {
      assert.equal((await get(m.env, "screen=" + screen)).draft.synthetic, true, screen + " sigue reglas");
      const r = await adaptador(m.env, screen, manual);
      assert.equal(r.status, 200, screen + ": " + JSON.stringify(r.body));
      assert.equal(r.body.draft.name, "Altadis · Estanco 1");
    }
    // Y repetido sobre lo ya guardado, con su rev, también entra.
    assert.equal((await adaptador(m.env, "sim-gracia-kiosko", manual)).status, 200);
  } finally { m.fin(); }
});

test("B3 · la lectura de la parrilla, Pixeria o el Adaptador no graba el censo; la del player sí", async () => {
  assert.equal(fromPlayer(new URLSearchParams("screen=x")), false);
  assert.equal(fromPlayer(new URLSearchParams("screen=x&_=123")), false);
  for (const qs of ["screen=x&w=1080&h=1920", "screen=x&w=0&h=0", "screen=x&lang=ca", "screen=x&player=1"]) assert.equal(fromPlayer(new URLSearchParams(qs)), true, qs);
  const m = mundo();
  try {
    await get(m.env, PANTALLA, { Origin: "https://www.pixeria.com" });
    await get(m.env, PANTALLA + "&_=" + Date.now());
    assert.equal(m.escritas.filter(k => k.startsWith(TAGS_PREFIX)).length, 0, "GET sin pistas no tiene efectos");
    await get(m.env, PLAYER);
    const censo = m.meta.get(TAGS_PREFIX + "sim-gracia-kiosko");
    assert.ok(censo.tags.includes("orientacion:vertical") && censo.tags.includes("idioma:es"));
    // Pasan horas: el registro caduca y vuelve a leerlo la parrilla. Antes lo reescribía sin orientación ni idioma.
    m.meta.set(TAGS_PREFIX + "sim-gracia-kiosko", { ...censo, seenAt: Date.now() - 7 * 3600_000 });
    const antes = m.escritas.length;
    await get(m.env, PANTALLA);
    assert.equal(m.escritas.length, antes, "la parrilla no reescribe");
    assert.ok(m.meta.get(TAGS_PREFIX + "sim-gracia-kiosko").tags.includes("orientacion:vertical"), "el censo conserva lo que dijo el player");
    await get(m.env, "screen=sim-gracia-kiosko&player=1");
    assert.ok(m.escritas.length > antes, "un player que se declara con player=1 sí registra");
  } finally { m.fin(); }
});

test("B1 · lo que el editor escribe en «Por defecto» de varias pantallas es lo que cada player recibe, con su nombre", async () => {
  const m = mundo({ items: [pieza("a1", ["café"])] });
  try {
    await post(m.env, { action: "live-save", playlist: regla });
    const piezas = [{ id: "stock-z1", stockId: "z1", title: "Z1", asset: "https://stock.admira.store/stock/z1/asset.mp4", assetType: "video", seconds: 15, tags: ["promo"] }];
    for (const screen of ["sim-gracia-kiosko", "sim-gracia-led"]) {
      const actual = (await get(m.env, "screen=" + screen)).draft;
      assert.equal((await post(m.env, { screen, name: "Mañanas Xtanco", items: piezas, rev: actual.rev })).status, 200);
      const emite = (await get(m.env, "screen=" + screen + "&w=1080&h=1920")).draft;
      assert.deepEqual(emite.items.map(i => i.stockId), ["z1"], screen + " emite la playlist creada");
      assert.equal(emite.name, "Mañanas Xtanco"); assert.equal(emite.synthetic, false);
    }
    const largas = Array.from({ length: 201 }, (_, i) => ({ ...piezas[0], id: "p" + i }));
    assert.equal((await post(m.env, { screen: "sim-gracia-led", items: largas })).status, 400, "más de 200 piezas no caben en Por defecto");
  } finally { m.fin(); }
});
