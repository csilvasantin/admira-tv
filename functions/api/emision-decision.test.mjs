// node --test functions/api/emision-decision.test.mjs — decide() con casos fijos: qué fuente gana, por qué y qué
// capas quedan anuladas. La equivalencia con el player real está en emision-canal-equivalencia.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, bandAt, herencia, bandLabel, gridWeave } from "./_emision.js";

const AT = Date.parse("2026-10-08T11:15:00+02:00");     // 11:15 en Madrid → franja 10-14
const iso = d => new Date(Date.parse("2026-10-01T10:00:00Z") + d * 3600_000).toISOString();
const STOCK = Array.from({ length: 9 }, (_, i) => ({ id: `s${i + 1}`, num: i + 1, type: "image", url: `https://cdn/s${i + 1}.jpg`, title: `S${i + 1}`,
  category: "marca", createdAt: iso(i), motor: "grok-imagine-image", tags: i < 2 ? ["default"] : ["promo"] }));
const day = slots => ({ ok: true, date: "2026-10-08", config: { circuit: "alcampo", slotSeconds: 12 },
  bands: [{ id: "a", label: "Mañana", from: "06:00", to: "10:00", slots: [] }, { id: "b", label: "Mediodía", from: "10:00", to: "14:00", slots }, { id: "c", label: "Noche", from: "22:00", to: "02:00", slots: [] }] });
const draft = { ok: true, draft: { items: [{ id: "d1", stockId: "s9", title: "Mía", seconds: 6, asset: "https://cdn/s9.jpg", assetType: "image", lane: "municipal" }], live: [] }, auto: [] };
const capa = (r, id) => r.capas.find(c => c.id === id);
const base = over => decide({ screen: "alcampo-alcala", at: AT, circuit: "alcampo", stock: STOCK, ...over });

test("franjas: la que contiene la hora de Madrid, también cruzando la medianoche; otro día no cuenta", () => {
  assert.equal(bandAt(day([]), AT).id, "b");
  assert.equal(bandAt(day([]), Date.parse("2026-10-08T23:30:00+02:00")).id, "c");
  assert.equal(bandAt(day([]), Date.parse("2026-10-08T03:00:00+02:00")), null);
  assert.equal(bandAt({ ...day([]), date: "2026-10-07" }, AT), null);
  assert.equal(bandLabel({ from: "10:00", to: "14:30" }), "10-14:30");
  assert.equal(herencia("def-alcampo-77", "alcampo"), "alcampo");
  assert.equal(herencia("def-global-3", "alcampo"), "global");
  assert.equal(herencia("b-123", "alcampo"), "");
});

test("«Por defecto» gana cuando no hay sincro ni reservas con creatividad", () => {
  const r = base({ draft, grid: day([]) });
  assert.equal(r.fuente, "defecto");
  assert.equal(r.motivo.es, "Emite su playlist «Por defecto»: 1 pieza en bucle. No hay sincro ni reservas own/paid en la franja 10-14.");
  assert.equal(capa(r, "defecto").estado, "activa");
  assert.equal(capa(r, "stock").estado, "anulada");
  assert.equal(capa(r, "stock").anuladaPor, "defecto");
  assert.deepEqual(r.piezas.map(p => [p.id, p.duracion, p.carril]), [["default:s9", 6, "municipal"]]);
});

test("una reserva own heredada anula «Por defecto» aunque no sea de la pantalla", () => {
  const r = base({ draft, grid: day([{ kind: "own", status: "own", bookingId: "def-alcampo-1", advertiser: "Alcampo", creative: { type: "image", url: "https://cdn/own.jpg" } }]) });
  assert.equal(r.fuente, "stock");
  assert.equal(capa(r, "defecto").estado, "anulada");
  assert.equal(capa(r, "defecto").detalle.es, "La reserva propia de la franja 10-14 de Alcampo, heredada del canal alcampo, anula «Por defecto».");
  assert.equal(capa(r, "parrilla").estado, "activa");
  // Con parrilla ya hay algo decidido: el Stock entra entero (sin el filtro #default) y la reserva cada 4 piezas.
  assert.deepEqual(r.piezas.map(p => p.id).slice(0, 5), ["s9", "s8", "s7", "s6", "grid:def-alcampo-1"]);
  assert.equal(r.piezas[4].duracion, 12, "la ranura editorial de la parrilla (slotSeconds)");
});

test("la reserva pagada de la pantalla anula y dice que es pagada; sin creatividad no anula", () => {
  const pagada = base({ draft, grid: day([{ kind: "paid", status: "sold", bookingId: "b-9", advertiser: "Coca-Cola", creative: { type: "video", url: "https://cdn/cc.mp4" } }]) });
  assert.match(capa(pagada, "defecto").detalle.es, /^La reserva pagada de la franja 10-14 de Coca-Cola anula «Por defecto»\.$/);
  assert.match(capa(pagada, "defecto").detalle.en, /^The paid booking in the 10-14 slot by Coca-Cola overrides the default playlist\.$/);
  const vacia = base({ draft, grid: day([{ kind: "paid", status: "sold", bookingId: "b-9", advertiser: "Coca-Cola", creative: null }]) });
  assert.equal(vacia.fuente, "defecto");
  assert.ok(vacia.avisos.some(a => /sin creatividad/.test(a.es)));
});

test("el hashtag del mando manda sobre «Por defecto», la parrilla y la sincro", () => {
  const r = base({ draft, grid: day([{ kind: "paid", bookingId: "x", creative: { type: "image", url: "https://cdn/x.jpg" } }]), liveTag: "#Promo", sync: { on: true, why: "remoto" } });
  assert.equal(r.fuente, "hashtag");
  assert.equal(r.piezas.length, 7);
  for (const id of ["defecto", "sincro", "parrilla", "stock"]) assert.equal(capa(r, id).anuladaPor, "hashtag", id);
  assert.equal(capa(r, "hashtag").tag, "promo");
});

test("sincro: anula «Por defecto» y no entrelaza la parrilla", () => {
  const r = base({ draft, grid: day([{ kind: "paid", bookingId: "x", creative: { type: "image", url: "https://cdn/x.jpg" } }]),
    sync: { on: true, why: "grupo", leader: "kiosko-a", remote: { items: [{ id: "m1", url: "https://cdn/m1.mp4", type: "video", _dur: 22 }], slotMs: 20000 } } });
  assert.equal(r.fuente, "sincro");
  assert.equal(r.motivo.es, "En sincro porque está en el grupo de sincro de kiosko-a: emite el máster global y anula «Por defecto» (1 pieza) y la parrilla de la franja.");
  assert.deepEqual(r.piezas.map(p => [p.id, p.duracion]), [["m1", 22]]);
  assert.equal(capa(r, "defecto").anuladaPor, "sincro");
  assert.equal(capa(r, "parrilla").anuladaPor, "sincro");
});

test("Stock con #default cuando nadie ha decidido nada", () => {
  const r = base({ grid: day([]) });
  assert.equal(r.fuente, "stock");
  assert.deepEqual(r.piezas.map(p => p.id), ["s2", "s1"]);
  assert.match(r.motivo.es, /lo etiquetado #default \(2 piezas\)/);
  assert.equal(capa(r, "defecto").estado, "vacia");
  assert.equal(r.duracionTotal.segundos, 18);
});

test("mural extendido y música de Xtore ganan a todo lo demás", () => {
  const playout = { configured: true, mode: "extended", item: { id: "w", url: "https://cdn/w.mp4", type: "video", title: "Mural" }, tile: { index: 0, total: 2, cols: 2, rows: 1 } };
  const mural = base({ draft, playout, liveTag: "promo" });
  assert.equal(mural.fuente, "mural");
  assert.equal(capa(mural, "hashtag").anuladaPor, "mural");
  const xtore = base({ screen: "xtore-virtual-zapatillas", xtoreMusic: true, playout, draft: { ok: true, draft: { items: [{ id: "a", stockId: "s1", asset: "https://cdn/a.mp3", assetType: "audio", seconds: 30 }] } } });
  assert.equal(xtore.fuente, "xtore");
  assert.equal(capa(xtore, "mural").estado, "anulada");
});

test("gridWeave: sin Stock la parrilla sale sola; con pocas piezas va al final", () => {
  const g = [{ id: "g1" }, { id: "g2" }];
  assert.deepEqual(gridWeave([], g).map(x => x.id), ["g1", "g2"]);
  assert.deepEqual(gridWeave([{ id: "a" }, { id: "b" }], g).map(x => x.id), ["a", "b", "g1", "g2"]);
});
