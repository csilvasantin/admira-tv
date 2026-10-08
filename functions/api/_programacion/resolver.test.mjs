// node --test functions/api/_programacion/ — resolver del modelo único de playlists (E2 · 8-oct-2026).
// Paridad con lo que emite hoy playlist.js (borrador a mano, vivas, hashtag) y las reglas nuevas: capas, orden K,
// emergencia, spots que ya no borran el por defecto, mando en vivo con caducidad, relleno, validoHasta y siguiente.
import test from "node:test";
import assert from "node:assert/strict";
import { addressedContent, applyCircuits, cleanLive, deduceScreenTags, resolveForScreen } from "../_playlist-live.js";
import { aMinutos, aUtc, HORIZONTE_MS } from "./horario.js";
import { desdeLegado } from "./legado.js";
import { limpiarAsignacion, limpiarPlaylist, ordenK } from "./modelo.js";
import { intercalar, resolver } from "./resolver.js";

const M = (fecha, hhmm) => aUtc(fecha, aMinutos(hhmm));
const HOY = "2026-10-14", AHORA = M(HOY, "10:00");                     // miércoles
const FACTS = { screen: "sbux-021-p1", circuit: "gracia", project: "starbucks", w: 1080, h: 1920, lang: "es" };
const pieza = (id, tags, extra = {}) => ({ id, type: "video", title: "Pieza " + id, tags, url: `https://stock.admira.store/stock/${id}/asset.mp4`, createdAt: 1000 + Number(String(id).replace(/\D/g, "") || 0), ...extra });
const item = s => ({ id: "stock-" + s, stockId: s, title: "Pieza " + s, asset: `https://stock.admira.store/stock/${s}/asset.mp4`, assetType: "video", seconds: 10 });
const fija = (id, piezas, extra = {}) => limpiarPlaylist({ id, nombre: id, tipo: "fija", items: piezas.map(item), ...extra });
const viva = (id, any, extra = {}) => limpiarPlaylist({ id, nombre: id, tipo: "viva", reglas: [{ any, limit: 100, seconds: 12 }], ...extra });
const asig = (id, playlist_id, destino, extra = {}) => ({ ...limpiarAsignacion({ id, playlist_id, destino, ...extra }), actualizado_en: extra.actualizado_en || 0 });
const aMano = (id, playlist_id, extra = {}) => asig(id, playlist_id, { all: ["pantalla:" + FACTS.screen] }, extra);
const ids = lista => lista.map(i => i.stockId || i.id);
const papel = (r, id) => (r.fuentes.find(f => f.id === id) || {}).papel;
const slot = (kind, bookingId, extra = {}) => ({ kind, status: kind === "own" ? "own" : kind === "paid" ? "sold" : kind, bookingId, title: bookingId,
  creative: { type: "image", url: `https://stock.admira.store/grid/${bookingId}.jpg` }, ...extra });
const parrilla = (bandas, fecha = HOY) => ({ ok: true, date: fecha, config: { slotSeconds: 8 }, bands: bandas.map(([id, from, to, slots = []]) => ({ id, label: id, from, to, slots })) });

// Lo que emite HOY una pantalla con playlist.js + canal.html: borrador a mano (más lo dirigido por hashtag que el
// canal pega detrás) o, si no hay borrador, las vivas fundidas y después lo dirigido. Copia fiel de onRequestGet.
function legadoHoy({ live = { playlists: [], circuits: [] }, draft = null, stock, facts = FACTS, now = AHORA }) {
  const tags = applyCircuits(deduceScreenTags(facts), live.circuits || []), dirigidas = addressedContent(stock, facts, now);
  if (draft && draft.items.length) { const ya = new Set(draft.items.map(i => String(i.stockId || ""))); return [...draft.items, ...dirigidas.filter(i => !ya.has(i.stockId))]; }
  const v = resolveForScreen(live.playlists.filter(p => p.enabled !== false), tags, stock, facts, now), ya = new Set(v.items.map(i => i.stockId));
  return [...v.items, ...dirigidas.filter(i => !ya.has(i.stockId))].slice(0, 200);
}
const huella = lista => lista.map(i => [i.stockId, i.seconds, i.asset]);

test("paridad: lo puesto a mano a la pantalla gana a las vivas que le llegan por grupos", () => {
  const stock = [pieza("c1", ["café"]), pieza("c2", ["cafe"]), pieza("t1", ["té"]), pieza("m1", ["interno"]), pieza("m2", ["interno"])];
  const live = { playlists: [cleanLive({ name: "Cafés", content: { any: ["café"] }, target: { all: ["circuito:gracia"] } }),
    cleanLive({ name: "Tés", content: { any: ["té"] }, target: { all: ["proyecto:starbucks", "orientacion:vertical"] } })], circuits: [] };
  const draft = { screen: FACTS.screen, name: "A mano", items: [item("m1"), item("m2")], updatedAt: 5 };
  const r = resolver({ ahora: AHORA, facts: FACTS, stock, ...desdeLegado({ borradores: [draft], live }) });
  assert.deepEqual(huella(r.items), huella(legadoHoy({ live, draft, stock })));
  assert.deepEqual(ids(r.items), ["m1", "m2"]);
  assert.equal(r.capa, "por_defecto");
  assert.deepEqual(r.base, ["defecto-sbux-021-p1"]);
  assert.equal(papel(r, "viva-cafes"), "eclipsada");
  assert.equal(papel(r, "viva-tes"), "eclipsada");
  // Sin borrador, las vivas fundidas, exactamente como hoy.
  const sin = resolver({ ahora: AHORA, facts: FACTS, stock, ...desdeLegado({ live }) });
  assert.deepEqual(huella(sin.items), huella(legadoHoy({ live, stock })));
  assert.deepEqual(ids(sin.items), ["c2", "c1", "t1"]);
  assert.equal(sin.nombre, "Cafés + Tés");
});

test("paridad: las vivas se funden en el orden de hoy (el del documento), sin repetir pieza y con el tope de 200", () => {
  const stock = [];
  for (let i = 1; i <= 120; i += 1) stock.push(pieza("a" + i, ["alfa"]), pieza("b" + i, ["beta"]));
  stock.push(pieza("x1", ["alfa", "beta"]), pieza("x2", ["gamma", "alfa"]));
  // La segunda del documento es la más reciente: el orden K sin peso la pondría delante. El puente le da peso.
  const live = { playlists: [cleanLive({ name: "Gamma", content: { any: ["gamma"] }, target: { any: ["todas"] } }, "", 100),
    cleanLive({ name: "Beta", content: { any: ["beta"], limit: 100 }, target: { any: ["todas"] } }, "", 900),
    cleanLive({ name: "Alfa", content: { any: ["alfa"], limit: 100 }, target: { all: ["idioma:es"] } }, "", 500)], circuits: [] };
  const hoy = legadoHoy({ live, stock }), r = resolver({ ahora: AHORA, facts: FACTS, stock, ...desdeLegado({ live }) });
  assert.deepEqual(huella(r.items), huella(hoy));
  assert.equal(r.items.length, 200);
  assert.deepEqual(ids(r.items).slice(0, 3), ["x2", "b120", "b119"], "Gamma, después Beta (lo más nuevo primero), después Alfa");
  assert.ok(ids(r.items).indexOf("x1") < ids(r.items).indexOf("a120"), "x1 sale con Beta, no se repite en Alfa");
  assert.equal(new Set(ids(r.items)).size, 200, "ningún stockId repetido");
});

test("hashtag dirigido: se añade detrás de lo de por defecto, solo manda si no hay nada y no se cuela bajo una capa mayor", () => {
  const stock = [pieza("h1", ["sbux_021_p1"]), pieza("c1", ["café"]), pieza("m1", ["x"])];
  const draft = { screen: FACTS.screen, items: [item("m1")] };
  const conMano = resolver({ ahora: AHORA, facts: FACTS, stock, ...desdeLegado({ borradores: [draft] }) });
  assert.deepEqual(ids(conMano.items), ["m1", "h1"]);
  assert.deepEqual(huella(conMano.items), huella(legadoHoy({ draft, stock })));
  assert.equal(conMano.nombre, "Por defecto + Dirigido por hashtag");
  const live = { playlists: [cleanLive({ name: "Cafés", content: { any: ["café"] }, target: { any: ["todas"] } })], circuits: [] };
  const conVivas = resolver({ ahora: AHORA, facts: FACTS, stock, ...desdeLegado({ live }) });
  assert.deepEqual(huella(conVivas.items), huella(legadoHoy({ live, stock })));
  const solo = resolver({ ahora: AHORA, facts: FACTS, stock });
  assert.deepEqual(ids(solo.items), ["h1"]);
  assert.equal(solo.capa, "por_defecto");
  assert.equal(solo.nombre, "Dirigido por hashtag");
  const pagada = resolver({ ahora: AHORA, facts: FACTS, stock, playlists: [fija("campana", ["c1"])],
    asignaciones: [asig("toma", "campana", { all: ["circuito:gracia"] }, { capa: "pagada", mezcla: "sustituye" })] });
  assert.deepEqual(ids(pagada.items), ["c1"]);
  assert.equal(papel(pagada, "implicita:hashtag"), "por_debajo_de_la_base");
});

test("emergencia: todas las de emergencia fundidas, exactas, sin spots, sin mando y por encima de todo", () => {
  const stock = [pieza("m1", ["x"])];
  const r = resolver({ ahora: AHORA, facts: FACTS, stock, mando: { tipo: "hashtag", valor: "x", desde: AHORA - 60_000 },
    playlists: [fija("evacuacion", ["e1", "e2"]), fija("aviso", ["e2", "e3"]), fija("mano", ["m1"])],
    asignaciones: [asig("e-todas", "evacuacion", { any: ["todas"] }, { capa: "emergencia", mezcla: "fusiona" }),
      asig("e-circuito", "aviso", { all: ["circuito:gracia"] }, { capa: "emergencia", mezcla: "fusiona", peso: 5 }),
      aMano("mano", "mano")],
    parrilla: parrilla([["dia", "08:00", "20:00", [slot("paid", "P1")]]]) });
  assert.equal(r.capa, "emergencia");
  assert.equal(r.exacta, true);
  assert.deepEqual(ids(r.items), ["e2", "e3", "e1"], "la de más peso primero; la pieza compartida, una vez");
  assert.deepEqual(r.spots, []);
  assert.equal(papel(r, "mano"), "ignorada_por_emergencia");
  assert.equal(papel(r, "parrilla:dia:pagada"), "ignorada_por_emergencia");
  assert.equal(r.mando.ignorado, "emergencia", "el mando no puede con una emergencia");
});

test("spots: lo pagado se intercala sobre la base y ya no borra el por defecto; después lo propio; cadencia mínima o 4", () => {
  const base = ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8"];
  const grid = parrilla([["manana", "08:00", "12:00", [slot("own", "O1"), slot("paid", "P1"), slot("paid", "P1"), slot("paid", "P2", { status: "accepted" }), slot("pending", "X"), slot("free", "F")]]]);
  const r = resolver({ ahora: AHORA, facts: FACTS, stock: [], parrilla: grid, playlists: [fija("mano", base)], asignaciones: [aMano("mano", "mano")] });
  assert.deepEqual(ids(r.items), ["m1", "m2", "m3", "m4", "grid:P1", "m5", "m6", "m7", "m8", "grid:P2", "grid:O1"]);
  assert.equal(r.capa, "por_defecto", "la base sigue siendo el por defecto");
  assert.deepEqual(r.spots.map(s => [s.id, s.capa]), [["grid:P1", "pagada"], ["grid:P2", "pagada"], ["grid:O1", "propia"]]);
  assert.equal(r.spots[0].seconds, 8, "duración editorial de la parrilla (slotSeconds)");
  assert.equal(r.cadencia, 4);
  // Una campaña pagada del modelo nuevo con cadencia 2 entra con los pagados y manda la cadencia mínima.
  const c = resolver({ ahora: AHORA, facts: FACTS, stock: [], parrilla: grid, playlists: [fija("mano", base), fija("cuña", ["k1"])],
    asignaciones: [aMano("mano", "mano"), asig("cuña", "cuña", { all: ["proyecto:starbucks"] }, { capa: "pagada", mezcla: "intercala", cadencia: 2 })] });
  assert.equal(c.cadencia, 2);
  assert.deepEqual(ids(c.spots), ["grid:P1", "grid:P2", "k1", "grid:O1"], "pagados primero (parrilla y modelo nuevo), después propios");
  assert.deepEqual(ids(c.items).slice(0, 6), ["m1", "m2", "grid:P1", "m3", "m4", "grid:P2"]);
  // Sin base: items vacío y capa relleno; el player teje los spots sobre su propio relleno.
  const sinBase = resolver({ ahora: AHORA, facts: FACTS, stock: [], parrilla: grid });
  assert.equal(sinBase.capa, "relleno");
  assert.deepEqual(sinBase.items, []);
  assert.equal(sinBase.spots.length, 3);
  assert.deepEqual(intercalar(["a", "b"], ["S"], 4), ["a", "b", "S"], "base corta: los spots detrás, como hoy");
});

test("rundown municipal-50-50 de la parrilla: base propia exacta, en su orden y sin tejer nada encima", () => {
  const grid = parrilla([["manana", "08:00", "12:00", [
    slot("paid", "P2", { playlistId: "municipal-50-50", position: 3 }), slot("own", "M1", { playlistId: "municipal-50-50", position: 0 }),
    slot("paid", "P1", { playlistId: "municipal-50-50", position: 1 }), slot("own", "M2", { playlistId: "municipal-50-50", position: 2 }), slot("paid", "SUELTO")]]]);
  const r = resolver({ ahora: AHORA, facts: FACTS, stock: [pieza("h1", ["sbux_021_p1"])], parrilla: grid, playlists: [fija("mano", ["m1"])], asignaciones: [aMano("mano", "mano")] });
  assert.equal(r.capa, "propia");
  assert.equal(r.exacta, true);
  assert.deepEqual(ids(r.items), ["grid:M1", "grid:P1", "grid:M2", "grid:P2"]);
  assert.deepEqual(r.spots, []);
  assert.equal(papel(r, "parrilla:manana:pagada"), "omitida_por_base_exacta");
  assert.equal(papel(r, "implicita:hashtag"), "omitida_por_base_exacta");
  assert.equal(papel(r, "mano"), "eclipsada");
});

test("empates de la base según el orden K: directa, sustituye, peso, fecha_desde, actualizado_en, id", () => {
  const base = { capa: "propia", directa: false, mezcla: "fusiona", peso: 0, fecha_desde: null, actualizado_en: 0 };
  const orden = lista => lista.sort(ordenK).map(c => c.id);
  assert.deepEqual(orden([{ ...base, id: "grupo-sustituye", mezcla: "sustituye", peso: 99 }, { ...base, id: "directa", directa: true }]), ["directa", "grupo-sustituye"]);
  assert.deepEqual(orden([{ ...base, id: "fusiona", peso: 99 }, { ...base, id: "sustituye", mezcla: "sustituye" }]), ["sustituye", "fusiona"]);
  assert.deepEqual(orden([{ ...base, id: "ligera", peso: 1 }, { ...base, id: "pesada", peso: 2 }]), ["pesada", "ligera"]);
  assert.deepEqual(orden([{ ...base, id: "abierta" }, { ...base, id: "vieja", fecha_desde: "2026-01-01" }, { ...base, id: "nueva", fecha_desde: "2026-10-01" }]), ["nueva", "vieja", "abierta"]);
  assert.deepEqual(orden([{ ...base, id: "antes", actualizado_en: 1 }, { ...base, id: "despues", actualizado_en: 2 }]), ["despues", "antes"]);
  assert.deepEqual(orden([{ ...base, id: "b" }, { ...base, id: "a" }]), ["a", "b"]);
  // En el resolver: dentro de la capa propia gana la sustituye con más peso; la capa pagada, aunque sea de grupo, a todas.
  const pl = [fija("p1", ["a1"]), fija("p2", ["b1"]), fija("p3", ["c1"]), fija("p4", ["q1"])];
  const g = { all: ["circuito:gracia"] };
  const r = resolver({ ahora: AHORA, facts: FACTS, stock: [], playlists: pl, asignaciones: [
    asig("s-ligera", "p1", g, { capa: "propia", mezcla: "sustituye", peso: 1 }), asig("s-pesada", "p2", g, { capa: "propia", mezcla: "sustituye", peso: 3 }),
    asig("f-directa", "p3", { all: ["pantalla:sbux-021-p1"] }, { capa: "por_defecto", mezcla: "fusiona", peso: 50 })] });
  assert.deepEqual(ids(r.items), ["b1"]);
  assert.equal(papel(r, "s-ligera"), "eclipsada");
  assert.equal(papel(r, "f-directa"), "eclipsada", "una capa más baja no compite aunque sea directa");
  // Lo directo que fusiona gana a lo de grupo que sustituye y se funde sólo con lo directo.
  const d = resolver({ ahora: AHORA, facts: FACTS, stock: [], playlists: pl, asignaciones: [
    asig("grupo", "p1", g, { capa: "propia", mezcla: "sustituye", peso: 9 }), asig("d1", "p2", { any: ["pantalla:sbux-021-p1"] }, { capa: "propia", mezcla: "fusiona" }),
    asig("d2", "p4", { any: ["pantalla:sbux-021-p1"] }, { capa: "propia", mezcla: "fusiona", actualizado_en: 9 })] });
  assert.deepEqual(ids(d.items), ["q1", "b1"], "d2 (editada después) delante de d1");
  assert.deepEqual(d.base, ["d2", "d1"]);
  assert.equal(papel(d, "grupo"), "eclipsada");
});

test("mando en vivo: manda sobre la base, conserva lo pagado y caduca a las 2 h", () => {
  const stock = [pieza("t1", ["navidad"]), pieza("t2", ["navidad"]), pieza("n7", ["x"], { num: 1234 }), pieza("m1", ["x"])];
  const grid = parrilla([["dia", "08:00", "20:00", [slot("paid", "P1"), slot("own", "O1")]]]);
  const entrada = { facts: FACTS, stock, parrilla: grid, playlists: [fija("mano", ["m1", "m2", "m3"])], asignaciones: [aMano("mano", "mano")],
    mando: { tipo: "hashtag", valor: "#Navidad", desde: AHORA } };
  const r = resolver({ ...entrada, ahora: AHORA + 30 * 60_000 });
  assert.equal(r.capa, "mando");
  assert.deepEqual(ids(r.items), ["t2", "t1", "grid:P1"], "las piezas del tag y lo pagado; lo propio de la parrilla no");
  assert.deepEqual(r.mando, { activo: true, tipo: "hashtag", valor: "#Navidad", desde: AHORA, caduca: AHORA + 2 * 3_600_000, motivo: "2h" });
  assert.equal(r.validoHasta, AHORA + 2 * 3_600_000, "el siguiente cambio es la caducidad del mando");
  assert.equal(r.siguiente.capa, "por_defecto");
  assert.deepEqual(ids(r.siguiente.items), ["m1", "m2", "m3", "grid:P1", "grid:O1"]);
  const tarde = resolver({ ...entrada, ahora: AHORA + 2 * 3_600_000 });
  assert.equal(tarde.capa, "por_defecto");
  assert.equal(tarde.mando.activo, false);
  // #ID: la pieza va la primera y la programación sigue detrás.
  const porId = resolver({ ...entrada, ahora: AHORA, mando: { tipo: "id", valor: "#1234", desde: AHORA } });
  assert.equal(porId.capa, "mando");
  assert.deepEqual(ids(porId.items), ["n7", "m1", "m2", "m3", "grid:P1", "grid:O1"]);
  // Directo: una sola señal y lo pagado detrás.
  const directo = resolver({ ...entrada, ahora: AHORA, mando: { tipo: "directo", valor: "https://live.admira.tv/canal.m3u8", desde: AHORA } });
  assert.deepEqual(directo.items.map(i => i.asset || i.id), ["https://live.admira.tv/canal.m3u8", "https://stock.admira.store/grid/P1.jpg"]);
  // Un tag sin piezas no deja la pantalla en negro: la programación sigue y el mando queda marcado vacío.
  const vacio = resolver({ ...entrada, ahora: AHORA, mando: { tipo: "hashtag", valor: "nada", desde: AHORA } });
  assert.equal(vacio.capa, "por_defecto");
  assert.equal(vacio.mando.vacio, true);
});

test("mando en vivo: caduca antes en el siguiente borde de franja (parrilla o programación)", () => {
  const stock = [pieza("t1", ["navidad"])];
  const base = { facts: FACTS, stock, playlists: [fija("mano", ["m1"]), fija("tarde", ["k1"])], mando: { tipo: "hashtag", valor: "navidad", desde: AHORA } };
  const porParrilla = resolver({ ...base, asignaciones: [aMano("mano", "mano")], ahora: AHORA + 30 * 60_000,
    parrilla: parrilla([["manana", "08:00", "11:00", [slot("paid", "P1")]], ["mediodia", "11:00", "14:00", [slot("paid", "P2")]]]) });
  assert.equal(porParrilla.mando.caduca, M(HOY, "11:00"));
  assert.equal(porParrilla.mando.motivo, "franja");
  assert.deepEqual(ids(porParrilla.items), ["t1", "grid:P1"]);
  assert.equal(porParrilla.siguiente.en, M(HOY, "11:00"));
  assert.deepEqual(ids(porParrilla.siguiente.items), ["m1", "grid:P2"], "a las 11 vuelve la base con el pagado de la nueva franja");
  const despues = resolver({ ...base, asignaciones: [aMano("mano", "mano")], ahora: M(HOY, "11:00"),
    parrilla: parrilla([["manana", "08:00", "11:00"], ["mediodia", "11:00", "14:00"]]) });
  assert.equal(despues.mando.activo, false);
  // El borde también puede ser de la programación: una asignación que empieza a las 11:30.
  const porProgramacion = resolver({ ...base, ahora: AHORA + 60_000, asignaciones: [aMano("mano", "mano"),
    asig("tarde", "tarde", { all: ["circuito:gracia"] }, { capa: "propia", mezcla: "sustituye", franjas: ["11:30-13:00"] })] });
  assert.equal(porProgramacion.mando.caduca, M(HOY, "11:30"));
  assert.equal(porProgramacion.siguiente.capa, "propia");
});

test("relleno: sin nada que emitir, items vacío y capa relleno; una base vacía cae a la siguiente", () => {
  const nada = resolver({ ahora: AHORA, facts: FACTS, stock: [] });
  assert.equal(nada.capa, "relleno");
  assert.deepEqual(nada.items, []);
  assert.equal(nada.nombre, "Relleno");
  assert.deepEqual(nada.base, []);
  const stock = [pieza("r1", ["relleno"])];
  const r = resolver({ ahora: AHORA, facts: FACTS, stock, playlists: [viva("sin-piezas", ["inexistente"]), viva("de-relleno", ["relleno"])],
    asignaciones: [asig("vacia", "sin-piezas", { any: ["todas"] }, { capa: "por_defecto", mezcla: "sustituye" }), asig("relleno", "de-relleno", { any: ["todas"] }, { capa: "relleno", mezcla: "sustituye" })] });
  assert.equal(r.capa, "relleno");
  assert.deepEqual(ids(r.items), ["r1"]);
  assert.equal(papel(r, "vacia"), "vacia");
  const huerfana = resolver({ ahora: AHORA, facts: FACTS, stock, asignaciones: [asig("rota", "no-existe", { any: ["todas"] })] });
  assert.equal(papel(huerfana, "rota"), "sin_playlist");
  assert.equal(huerfana.capa, "relleno");
});

test("validoHasta es el próximo borde (como mucho 48 h) y siguiente dice lo que saldrá entonces", () => {
  const playlists = [fija("mano", ["m1"]), fija("mediodia", ["k1", "k2"])];
  const asignaciones = [aMano("mano", "mano"), asig("mediodia", "mediodia", { all: ["proyecto:starbucks"] }, { capa: "propia", mezcla: "sustituye", franjas: ["13:00-15:00"], dias: ["L", "M", "X", "J", "V"] })];
  const manana = resolver({ ahora: AHORA, facts: FACTS, stock: [], playlists, asignaciones });
  assert.equal(manana.validoHasta, M(HOY, "13:00"));
  assert.deepEqual(manana.siguiente, { en: M(HOY, "13:00"), capa: "propia", nombre: "mediodia", base: ["mediodia"], rev: manana.siguiente.rev,
    items: ["k1", "k2"].map(s => ({ id: "stock-" + s, stockId: s, asset: `https://stock.admira.store/stock/${s}/asset.mp4`, assetType: "video" })) });
  const comida = resolver({ ahora: M(HOY, "14:00"), facts: FACTS, stock: [], playlists, asignaciones });
  assert.equal(comida.capa, "propia");
  assert.equal(comida.validoHasta, M(HOY, "15:00"));
  assert.equal(comida.siguiente.capa, "por_defecto");
  // Viernes por la tarde: el próximo borde es el lunes 13:00, más allá de 48 h → validoHasta = +48 h y sin siguiente.
  const viernes = M("2026-10-16", "16:00"), finde = resolver({ ahora: viernes, facts: FACTS, stock: [], playlists, asignaciones });
  assert.equal(finde.validoHasta, viernes + HORIZONTE_MS);
  assert.equal(finde.siguiente, null);
  // Los bordes de la parrilla también cuentan.
  const grid = resolver({ ahora: AHORA, facts: FACTS, stock: [], playlists, asignaciones: [aMano("mano", "mano")], parrilla: parrilla([["manana", "08:00", "12:00", [slot("paid", "P1")]]]) });
  assert.equal(grid.validoHasta, M(HOY, "12:00"));
  assert.deepEqual(ids(grid.siguiente.items), ["m1"]);
  assert.notEqual(grid.rev, grid.siguiente.rev);
});

test("playlist mixta: los huecos se llenan del Stock con su regla, sin repetir lo que ya está en la lista", () => {
  const stock = [pieza("c1", ["café"]), pieza("c2", ["café"]), pieza("c3", ["café"]), pieza("c4", ["café"]), pieza("m1", ["café"])];
  const mixta = limpiarPlaylist({ id: "mixta", nombre: "Mixta", tipo: "mixta", reglas: [{ any: ["café"], seconds: 7 }],
    items: [item("m1"), { tipo: "hueco", regla: 0, cuantas: 2 }, item("m2"), { tipo: "hueco" }, { tipo: "hueco", regla: { any: ["té"] } }] });
  assert.equal(mixta.duracion_s, 10 + 2 * 7 + 10 + 7 + 10);
  const r = resolver({ ahora: AHORA, facts: FACTS, stock, playlists: [mixta], asignaciones: [aMano("mixta", "mixta")] });
  assert.deepEqual(ids(r.items), ["m1", "c4", "c3", "m2", "c2"], "el hueco de té no tiene piezas y no deja rastro");
  assert.equal(r.items[1].seconds, 7);
  assert.throws(() => limpiarPlaylist({ nombre: "x", tipo: "fija", items: [{ tipo: "hueco" }] }), /hueco_en_fija/);
  assert.throws(() => limpiarPlaylist({ nombre: "x", tipo: "viva" }), /viva_sin_reglas/);
  assert.throws(() => limpiarPlaylist({ nombre: "x", items: new Array(201).fill(item("a")) }), /demasiados_items/);
});

test("parrilla de varios días (E3): la franja nocturna de la víspera sigue de madrugada y se ven los bordes de mañana", () => {
  const AYER = "2026-10-13", MANANA = "2026-10-15";
  const dias = [
    parrilla([["noche", "22:00", "02:00", [slot("paid", "NOCHE-AYER")]]], AYER),
    { ...parrilla([["dia", "08:00", "20:00", [slot("paid", "P1")]], ["noche", "22:00", "02:00", [slot("paid", "NOCHE-HOY")]]]), config: { slotSeconds: 12 } },
    parrilla([["dia", "08:00", "20:00", [slot("paid", "P-MANANA")]]], MANANA),
  ];
  const entrada = { facts: FACTS, stock: [], playlists: [fija("mano", ["m1", "m2"])], asignaciones: [aMano("mano", "mano")], parrilla: dias };
  // 01:00 de hoy: manda la noche de AYER (pertenece al día en que empieza), no la de hoy.
  const madrugada = resolver({ ...entrada, ahora: M(HOY, "01:00") });
  assert.deepEqual(ids(madrugada.spots), ["grid:NOCHE-AYER"]);
  assert.equal(madrugada.validoHasta, M(HOY, "02:00"));
  assert.deepEqual(madrugada.siguiente.items.map(i => i.id), ["stock-m1", "stock-m2"]);
  // Cada franja lleva la duración editorial de su día.
  const dia = resolver({ ...entrada, ahora: AHORA });
  assert.deepEqual(dia.spots.map(s => [s.id, s.seconds]), [["grid:P1", 12]]);
  // 23:00 de hoy: la noche de hoy, y su fin (02:00 de mañana) es el borde; después, el día de mañana.
  const noche = resolver({ ...entrada, ahora: M(HOY, "23:00") });
  assert.deepEqual(ids(noche.spots), ["grid:NOCHE-HOY"]);
  assert.equal(noche.validoHasta, M(MANANA, "02:00"));
  const tras = resolver({ ...entrada, ahora: M(MANANA, "03:00") });
  assert.equal(tras.validoHasta, M(MANANA, "08:00"), "sin el día siguiente, validoHasta saltaría a +48 h");
  assert.deepEqual(tras.siguiente.items.map(i => i.id), ["stock-m1", "stock-m2", "grid:P-MANANA"]);
  // Una sola respuesta sigue valiendo como antes.
  assert.deepEqual(ids(resolver({ ...entrada, parrilla: dias[1], ahora: AHORA }).spots), ["grid:P1"]);
});
