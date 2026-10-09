// node --test functions/api/_programacion/ — comparador del modo sombra (E6 · modelo único de playlists).
// Los dos lados salen de las funciones de verdad: decide() de _emision.js (la réplica de canal.html) con la respuesta de
// /api/playlist y el /grid/day del día, y resolver() con lo que el importador (E5) dejaría en la D1 (legado.js).
import test from "node:test";
import assert from "node:assert/strict";
import { cleanLive, deduceScreenTags, resolveForScreen } from "../_playlist-live.js";
import { decide } from "../_emision.js";
import { aMinutos, aUtc } from "./horario.js";
import { desdeBorrador, desdeVivas } from "./legado.js";
import { limpiarAsignacion, limpiarPlaylist } from "./modelo.js";
import { resolver } from "./resolver.js";
import { COINCIDE, MOTIVOS, VEREDICTO_DE, clave, comparar, corta, firmaCorta, franjaNocturna, huella, textoFirma, vistaLegado, vistaNueva } from "./comparador.js";

const M = (fecha, hhmm) => aUtc(fecha, aMinutos(hhmm));
const AYER = "2026-10-13", HOY = "2026-10-14", MANANA = "2026-10-15";
const AT = M(HOY, "10:00"), SCREEN = "alcampo-alcala";
const item = s => ({ id: "stock-" + s, stockId: s, title: "Pieza " + s, asset: `https://stock.admira.store/stock/${s}/asset.mp4`, assetType: "video", seconds: 10 });
const pieza = (id, tags = [], extra = {}) => ({ id, type: "video", title: "Pieza " + id, tags, url: `https://stock.admira.store/stock/${id}/asset.mp4`, createdAt: "2026-10-0" + (1 + (Number(String(id).replace(/\D/g, "")) % 8)), ...extra });
const STOCK = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"].map(id => pieza(id));
const slot = (kind, bookingId, extra = {}) => ({ kind, status: kind === "paid" ? "sold" : kind, bookingId, title: bookingId,
  creative: { type: "image", url: `https://cdn.admira.store/${bookingId}.jpg` }, ...extra });
const banda = (id, from, to, slots = []) => ({ id, label: id, from, to, slots });
const dia = (fecha, bands) => ({ ok: true, screen: SCREEN, date: fecha, config: { circuit: "alcampo", slotSeconds: 10 }, bands });
const borradorDe = (items, extra = {}) => ({ ok: true, draft: { screen: SCREEN, playlist: "default", name: "Por defecto", items, rev: 5, synthetic: false, ...extra }, screenTags: ["pantalla:" + SCREEN, "todas"], auto: [] });
const VACIO = borradorDe([]);
const importado = borrador => { const r = desdeBorrador({ screen: SCREEN, name: "Por defecto", items: borrador.draft.items }); return r ? { asignaciones: [r.asignacion], playlists: [r.playlist] } : { asignaciones: [], playlists: [] }; };

/** Un caso: el legado con decide() y el motor nuevo con resolver(), sobre la misma parrilla. */
function caso({ borrador = VACIO, hoy = dia(HOY, []), ayer = dia(AYER, []), at = AT, d1 = importado(borrador), stock = STOCK, sync = { on: false } } = {}) {
  const legado = decide({ screen: SCREEN, at, draft: borrador, grid: hoy, stock, sync, mode: sync.on ? "sync" : "local", playout: null });
  const parrilla = [ayer, hoy, dia(MANANA, [])];
  const nuevo = resolver({ ahora: at, facts: { screen: SCREEN }, asignaciones: d1.asignaciones, playlists: d1.playlists, stock, parrilla, siguiente: false });
  return { legado, nuevo, r: comparar({ at, nuevo, legado, borrador, dia: hoy, parrilla }) };
}
const veredicto = r => [r.veredicto, r.motivo];

// ── Igual ───────────────────────────────────────────────────────────────────────────────────────────────────────
test("igual: «Por defecto» puesta a mano frente a lo importado (misma lista, misma capa)", () => {
  const { r, legado, nuevo } = caso({ borrador: borradorDe([item("a"), item("b"), item("c")]) });
  assert.equal(legado.fuente, "defecto");
  assert.equal(nuevo.capa, "por_defecto");
  assert.deepEqual(veredicto(r), ["igual", "misma_lista"]);
  assert.equal(r.coincide, COINCIDE.igual);
  assert.equal(r.firmaLegado, r.firmaNueva);
  assert.match(r.firmaNueva, /^por_defecto·3p·[0-9a-f]{8}$/);
  assert.equal(r.capa, "por_defecto");
  assert.deepEqual(r.detalle.nuevo.claves, ["a", "b", "c"]);
  assert.equal("diferencia" in r.detalle, false);
});

test("igual: el rundown municipal 50/50 manda solo y en orden en los dos lados", () => {
  const rundown = (id, position) => slot("own", id, { playlistId: "municipal-50-50", position });
  const hoy = dia(HOY, [banda("manana", "08:00", "12:00", [rundown("R2", 2), rundown("R1", 1)])]);
  const { r, legado, nuevo } = caso({ borrador: borradorDe([item("a")]), hoy });
  assert.deepEqual([legado.fuente, nuevo.capa, nuevo.exacta], ["stock", "propia", true]);
  assert.deepEqual(veredicto(r), ["igual", "misma_lista"]);
  assert.deepEqual(r.detalle.legado.claves, ["grid:R1", "grid:R2"]);
});

// ── Equivalente: lo que el diseño cambia a propósito ────────────────────────────────────────────────────────────
test("equivalente · relleno_del_player: sin lista propia, el Stock del player frente a la capa relleno, con la parrilla", () => {
  const sin = caso();
  assert.deepEqual([sin.legado.fuente, sin.nuevo.capa, sin.nuevo.items.length], ["stock", "relleno", 0]);
  assert.deepEqual(veredicto(sin.r), ["equivalente", "relleno_del_player"]);
  assert.equal(sin.r.coincide, COINCIDE.equivalente);
  assert.match(sin.r.firmaLegado, /^relleno·stock\+0s·/);
  assert.match(sin.r.firmaNueva, /^relleno·player\+0s·/);
  // Con una reserva pagada en la franja: el legado la entrelaza en su Stock; el motor nuevo la da como spot.
  const hoy = dia(HOY, [banda("manana", "08:00", "12:00", [slot("paid", "P1"), slot("own", "O1")])]);
  const con = caso({ hoy });
  assert.deepEqual(veredicto(con.r), ["equivalente", "relleno_del_player"]);
  assert.deepEqual(con.r.detalle.nuevo.claves, ["grid:P1", "grid:O1"]);
  assert.equal(con.r.detalle.nuevo.cadencia, 4);
});

test("la firma del relleno no depende del catálogo: otro Stock, la misma firma (no gasta escrituras)", () => {
  const hoy = dia(HOY, [banda("manana", "08:00", "12:00", [slot("paid", "P1")])]);
  const uno = caso({ hoy }), otro = caso({ hoy, stock: [...STOCK, pieza("s9"), pieza("s10")].reverse() });
  assert.notDeepEqual(uno.legado.piezas.map(p => p.id), otro.legado.piezas.map(p => p.id), "el legado sí emite otra lista");
  assert.equal(uno.r.firmaLegado, otro.r.firmaLegado);
  assert.equal(uno.r.firmaNueva, otro.r.firmaNueva);
});

test("equivalente · parrilla_intercala: la reserva ya no borra «Por defecto», se intercala (decisión 1)", () => {
  const hoy = dia(HOY, [banda("manana", "08:00", "12:00", [slot("paid", "P1")])]);
  const { r, legado, nuevo } = caso({ borrador: borradorDe([item("a"), item("b"), item("c"), item("d"), item("e")]), hoy });
  assert.equal(legado.fuente, "stock", "hoy la parrilla anula «Por defecto»");
  assert.equal(legado.capas.find(c => c.id === "defecto").anuladaPor, "parrilla");
  assert.deepEqual(nuevo.items.map(clave).map(corta), ["a", "b", "c", "d", "grid:P1", "e"]);
  assert.deepEqual(veredicto(r), ["equivalente", "parrilla_intercala"]);
});

test("equivalente · parrilla_vendida: una reserva «sold» sin kind own/paid la teje el motor nuevo y el legado no la ve", () => {
  const hoy = dia(HOY, [banda("manana", "08:00", "12:00", [slot("sold", "V1")])]);
  const { r, legado } = caso({ borrador: borradorDe([item("a"), item("b"), item("c"), item("d")]), hoy });
  assert.equal(legado.fuente, "defecto");
  assert.deepEqual(veredicto(r), ["equivalente", "parrilla_vendida"]);
  assert.equal(r.detalle.diferencia.vendidas, 1);
  assert.deepEqual(r.detalle.diferencia.spots.soloNuevo, ["grid:V1"]);
});

test("equivalente · franja_nocturna_de_ayer: de madrugada el legado toma la franja de HOY y el motor nuevo la de AYER", () => {
  const at = M(MANANA, "00:30");
  const ayer = dia(HOY, [banda("noche", "22:00", "02:00", [slot("paid", "A1")])]);
  const hoy = dia(MANANA, [banda("noche", "22:00", "02:00", [slot("paid", "B1")])]);
  assert.equal(franjaNocturna({ dia: hoy, parrilla: [ayer, hoy], at }), true);
  assert.equal(franjaNocturna({ dia: hoy, parrilla: [ayer, hoy], at: M(MANANA, "03:00") }), false);
  // Sin lista propia: los dos son relleno, pero cada uno con los spots de su franja.
  const sin = caso({ at, ayer, hoy });
  assert.deepEqual(veredicto(sin.r), ["equivalente", "franja_nocturna_de_ayer"]);
  // Con «Por defecto»: el legado la anula con B1 (de esta noche); el motor nuevo la conserva con A1 (de anoche).
  const con = caso({ at, ayer, hoy, borrador: borradorDe([item("a"), item("b")]) });
  assert.equal(con.legado.fuente, "stock");
  assert.deepEqual(con.nuevo.spots.map(s => s.id), ["grid:A1"]);
  assert.deepEqual(veredicto(con.r), ["equivalente", "franja_nocturna_de_ayer"]);
  assert.equal(con.r.detalle.diferencia.nocturna, true);
  // Si la víspera y el día venden lo mismo, no hay nada que explicar.
  const misma = caso({ at, ayer, hoy: dia(MANANA, [banda("noche", "22:00", "02:00", [slot("paid", "A1")])]) });
  assert.deepEqual(veredicto(misma.r), ["equivalente", "relleno_del_player"]);
});

test("equivalente · viva_directa_gana: una viva que sólo nombra la pantalla deja fuera a la de grupo (decisión 3)", () => {
  const stock = [pieza("c1", ["cafe"]), pieza("c2", ["cafe"]), pieza("t1", ["te"]), pieza("t2", ["te"])];
  const live = { playlists: [
    cleanLive({ name: "Cafés aquí", content: { any: ["cafe"] }, target: { all: ["pantalla:" + SCREEN] } }),
    cleanLive({ name: "Tés", content: { any: ["te"] }, target: { all: ["todas"] } }),
  ], circuits: [] };
  // Lo que compone hoy playlist.js sin borrador: las vivas que casan, fundidas en el orden del documento.
  const v = resolveForScreen(live.playlists, deduceScreenTags({ screen: SCREEN }), stock, { screen: SCREEN }, AT);
  const borrador = borradorDe(v.items, { synthetic: true, live: v.hits.map(p => ({ id: p.id, name: p.name })) });
  const d1 = desdeVivas(live);
  const { r, legado, nuevo } = caso({ borrador, stock, d1 });
  assert.equal(legado.fuente, "defecto");
  assert.deepEqual(legado.piezas.map(p => corta(clave(p))), v.items.map(i => i.stockId));
  assert.equal(v.items.length, 4, "hoy se funden las dos vivas");
  assert.equal(nuevo.fuentes.find(f => f.papel === "eclipsada").playlist.startsWith("viva-"), true);
  assert.deepEqual(veredicto(r), ["equivalente", "viva_directa_gana"]);
});

test("equivalente · rundown_exacto: el 50/50 manda solo y la reserva suelta que el legado entrelazaba no entra (desviación 6)", () => {
  const rundown = (id, position) => slot("own", id, { playlistId: "municipal-50-50", position });
  const hoy = dia(HOY, [banda("manana", "08:00", "12:00", [rundown("R1", 1), rundown("R2", 2), slot("paid", "P1")])]);
  const { r, legado, nuevo } = caso({ hoy });
  assert.equal(legado.fuente, "stock");
  assert.deepEqual([nuevo.capa, nuevo.exacta, nuevo.items.map(i => i.id)], ["propia", true, ["grid:R1", "grid:R2"]]);
  assert.deepEqual(veredicto(r), ["equivalente", "rundown_exacto"]);
});

test("equivalente · orquestacion_por_encima: sincro, mural y Xtore mandan por encima de cualquier playlist", () => {
  const sync = { on: true, why: "grupo", leader: "kiosko-a", remote: { items: [{ id: "m1", url: "https://x/1.mp4", type: "video" }] } };
  const { r, legado } = caso({ borrador: borradorDe([item("a")]), sync });
  assert.equal(legado.fuente, "sincro");
  assert.deepEqual(veredicto(r), ["equivalente", "orquestacion_por_encima"]);
  assert.equal(r.detalle.diferencia.fuente, "sincro");
  assert.equal(r.firmaLegado.startsWith("sincro·"), true);
});

// ── Distinta: lo que hay que mirar ──────────────────────────────────────────────────────────────────────────────
test("distinta · nuevo_vacio: el legado emite «Por defecto» y la D1 no tiene nada para la pantalla", () => {
  const { r } = caso({ borrador: borradorDe([item("a"), item("b")]), d1: { asignaciones: [], playlists: [] } });
  assert.deepEqual(veredicto(r), ["distinta", "nuevo_vacio"]);
  assert.equal(r.coincide, COINCIDE.distinta);
  assert.deepEqual(r.detalle.diferencia.base.soloLegado, ["a", "b"]);
});

test("distinta · orden_distinto y piezas_distintas: la D1 se ha apartado de lo que hay en el KV", () => {
  const borrador = borradorDe([item("a"), item("b"), item("c")]);
  const orden = caso({ borrador, d1: importado(borradorDe([item("c"), item("b"), item("a")])) });
  assert.deepEqual(veredicto(orden.r), ["distinta", "orden_distinto"]);
  const otras = caso({ borrador, d1: importado(borradorDe([item("a"), item("b"), item("x")])) });
  assert.deepEqual(veredicto(otras.r), ["distinta", "piezas_distintas"]);
  assert.deepEqual([otras.r.detalle.diferencia.base.soloLegado, otras.r.detalle.diferencia.base.soloNuevo], [["c"], ["x"]]);
});

test("distinta · solo_en_nuevo y capa_distinta: lo que sólo existe en el motor nuevo", () => {
  const solo = caso({ d1: importado(borradorDe([item("a")])) });
  assert.deepEqual(veredicto(solo.r), ["distinta", "solo_en_nuevo"]);
  // Una toma pagada que sustituye, dada de alta por la API (E4): hoy no existe.
  const pl = limpiarPlaylist({ id: "toma", nombre: "Toma", tipo: "fija", items: [item("z")] });
  const as = { ...limpiarAsignacion({ id: "toma", playlist_id: "toma", destino: { all: ["pantalla:" + SCREEN] }, capa: "pagada", mezcla: "sustituye" }), actualizado_en: 0 };
  const capa = caso({ borrador: borradorDe([item("a")]), d1: { asignaciones: [as, ...importado(borradorDe([item("a")])).asignaciones], playlists: [pl, ...importado(borradorDe([item("a")])).playlists] } });
  assert.deepEqual(veredicto(capa.r), ["distinta", "capa_distinta"]);
});

test("distinta · spots_distintos y cadencia_distinta (relleno con otros spots u otra cadencia)", () => {
  const hoy = dia(HOY, [banda("manana", "08:00", "12:00", [slot("paid", "P1")])]);
  const { legado } = caso({ hoy });
  const borrador = VACIO, base = { at: AT, legado, borrador, dia: hoy, parrilla: [dia(AYER, []), hoy] };
  const spot = id => ({ id, asset: `https://cdn.admira.store/${id.slice(5)}.jpg`, spot: true });
  const otro = comparar({ ...base, nuevo: { capa: "relleno", items: [], spots: [spot("grid:P9")], cadencia: 4, fuentes: [] } });
  assert.deepEqual(veredicto(otro), ["distinta", "spots_distintos"]);
  const cadencia = comparar({ ...base, nuevo: { capa: "relleno", items: [], spots: [spot("grid:P1")], cadencia: 2, fuentes: [] } });
  assert.deepEqual(veredicto(cadencia), ["distinta", "cadencia_distinta"]);
});

// ── Piezas sueltas ──────────────────────────────────────────────────────────────────────────────────────────────
test("claves, firma corta y vocabulario", () => {
  assert.equal(clave({ id: "grid:B-7", asset: "https://cdn/x.jpg" }), "grid:B-7");
  assert.equal(clave({ id: "default:s1", url: " https://stock.admira.store/stock/s1/a.mp4 " }), "a:https://stock.admira.store/stock/s1/a.mp4");
  assert.equal(clave({ id: "item-3" }), "i:item-3");
  assert.equal(corta("a:https://stock.admira.store/stock/s1/asset.mp4"), "s1");
  assert.equal(corta("a:https://cdn.example.com/campa%C3%B1a/spot.mp4?v=2"), "spot.mp4");
  assert.equal(huella("x"), huella("x"));
  assert.notEqual(huella("x"), huella("y"));
  assert.match(huella("cualquier cosa"), /^[0-9a-f]{8}$/);
  const v = vistaNueva({ capa: "por_defecto", items: [item("a"), { id: "grid:P1", asset: "https://cdn/p.jpg", spot: true }], spots: [{ id: "grid:P1" }], cadencia: 4 });
  assert.equal(textoFirma(v), "por_defecto|exacta:0|cad:4|items:a:https://stock.admira.store/stock/a/asset.mp4,grid:P1");
  assert.match(firmaCorta(v), /^por_defecto·2p\+1s·[0-9a-f]{8}$/);
  assert.deepEqual(vistaLegado(null).capa, "desconocida");
  for (const [v, n] of Object.entries(COINCIDE)) assert.equal(VEREDICTO_DE[n], v);
  assert.deepEqual(Object.keys(MOTIVOS), ["igual", "equivalente", "distinta"]);
});

test("cada veredicto lleva un motivo de su lista y el detalle no lleva emails", () => {
  const casos = [caso(), caso({ borrador: borradorDe([item("a")]) }), caso({ borrador: borradorDe([item("a")]), d1: { asignaciones: [], playlists: [] } })];
  for (const { r } of casos) {
    assert.ok(MOTIVOS[r.veredicto].includes(r.motivo), r.motivo);
    assert.doesNotMatch(JSON.stringify(r), /@/);
  }
});
