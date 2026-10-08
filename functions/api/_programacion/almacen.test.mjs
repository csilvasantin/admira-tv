// node --test functions/api/_programacion/ — almacén D1 del modelo único (E1 · 8-oct-2026).
// Sobre node:sqlite con la migración real: 409 por rev sin rastro, revisiones con poda a 50, auditoría, versión,
// índice invertido del destino, borrados con guarda y lectura de candidatas de punta a punta con el resolver.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { d1Memoria } from "./_d1-memoria.mjs";
import * as A from "./almacen.js";
import { aMinutos, aUtc } from "./horario.js";
import { resolver } from "./resolver.js";

const SQL = await readFile(new URL("../../../migrations/programacion/0001.sql", import.meta.url), "utf8");
const sinSqlite = !(await d1Memoria());
const prueba = (nombre, fn) => test(nombre, { skip: sinSqlite && "node:sqlite no disponible (Node ≥ 22.13)" }, fn);
const M = (fecha, hhmm) => aUtc(fecha, aMinutos(hhmm));
const T0 = M("2026-10-14", "10:00"), yo = { actor: "csilvasantin@gmail.com", ahora: T0 };
const item = s => ({ id: "stock-" + s, stockId: s, title: s, asset: `https://stock.admira.store/stock/${s}/asset.mp4`, assetType: "video", seconds: 10 });
const playlist = (extra = {}) => ({ id: "cafes", nombre: "Cafés", proyecto: "starbucks", tipo: "fija", items: [item("c1"), item("c2")], ...extra });
const cuenta = async (db, tabla, where = "1") => (await db.prepare(`SELECT COUNT(*) AS n FROM ${tabla} WHERE ${where}`).first()).n;

prueba("la migración se aplica dos veces sin error y deja la versión a 0 con el motor apagado", async () => {
  const db = await d1Memoria(SQL);
  await db.exec(SQL);
  assert.deepEqual(await A.leerMeta(db), { version: 0, esquema: 1, banderas: { motor: "apagado", sombra: false }, actualizado_en: 0 });
  const tablas = (await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()).results.map(r => r.name);
  assert.deepEqual(tablas, ["asignacion", "asignacion_destino", "asignacion_revision", "auditoria", "circuito", "clave_servicio", "meta", "playlist", "playlist_revision", "sombra"]);
});

prueba("crear: rev 1, revisión 1, auditoría y versión 1; repetir el id es 409 sin rastro", async () => {
  const db = await d1Memoria(SQL);
  const r = await A.guardarPlaylist(db, playlist(), { ...yo, motivo: "alta" });
  assert.equal(r.ok, true);
  assert.equal(r.status, 201);
  assert.equal(r.version, 1);
  assert.equal(r.playlist.rev, 1);
  assert.deepEqual(r.playlist.items.map(i => i.stockId), ["c1", "c2"]);
  assert.equal(r.playlist.duracion_s, 20);
  assert.equal(r.playlist.creado_por, "csilvasantin@gmail.com");
  assert.equal("escritura" in r.playlist, false, "la ficha interna no sale");
  const h = await A.historial(db, "playlist", "cafes");
  assert.equal(h.length, 1);
  assert.equal(h[0].datos.nombre, "Cafés");
  assert.deepEqual(h[0].datos.items, r.playlist.items, "la revisión es la fila tal cual quedó");
  const au = await A.auditoria(db, { entidad: "playlist", id: "cafes" });
  assert.deepEqual(au.map(a => [a.accion, a.rev, a.version, a.detalle.motivo]), [["crear", 1, 1, "alta"]]);
  const dup = await A.guardarPlaylist(db, playlist({ nombre: "Otra" }), yo);
  assert.equal(dup.status, 409);
  assert.equal(dup.error, "ya_existe");
  assert.equal(dup.actual.nombre, "Cafés");
  assert.equal((await A.leerMeta(db)).version, 1);
  assert.equal(await cuenta(db, "auditoria"), 1);
});

prueba("actualizar: con la rev buena sube rev y versión; con una vieja es 409 y no deja rastro", async () => {
  const db = await d1Memoria(SQL);
  await A.guardarPlaylist(db, playlist(), yo);
  const ok = await A.guardarPlaylist(db, playlist({ nombre: "Cafés de otoño" }), { ...yo, rev: 1, ahora: T0 + 1000 });
  assert.equal(ok.status, 200);
  assert.equal(ok.playlist.rev, 2);
  assert.equal(ok.playlist.creado_en, T0);
  assert.equal(ok.playlist.actualizado_en, T0 + 1000);
  assert.equal(ok.version, 2);
  const viejo = await A.guardarPlaylist(db, playlist({ nombre: "Pisotón" }), { ...yo, rev: 1 });
  assert.deepEqual([viejo.status, viejo.error, viejo.actual.rev, viejo.actual.nombre], [409, "revision_conflict", 2, "Cafés de otoño"]);
  assert.equal((await A.leerMeta(db)).version, 2, "la versión no se movió");
  assert.equal(await cuenta(db, "playlist_revision"), 2, "ni el historial");
  assert.equal(await cuenta(db, "auditoria"), 2, "ni la auditoría");
  assert.equal((await A.leerPlaylist(db, "cafes")).nombre, "Cafés de otoño");
  const nadie = await A.guardarPlaylist(db, playlist({ id: "no-existe" }), { ...yo, rev: 4 });
  assert.deepEqual([nadie.status, nadie.error], [404, "no_existe"]);
  const mala = await A.guardarPlaylist(db, playlist({ tipo: "viva" }), { ...yo, rev: 2 });
  assert.deepEqual([mala.status, mala.error], [400, "viva_sin_reglas"]);
});

prueba("dos escritores con la misma rev: uno gana y el otro recibe 409", async () => {
  const db = await d1Memoria(SQL);
  await A.guardarPlaylist(db, playlist(), yo);
  const [a, b] = await Promise.all([A.guardarPlaylist(db, playlist({ nombre: "A" }), { ...yo, rev: 1 }), A.guardarPlaylist(db, playlist({ nombre: "B" }), { ...yo, rev: 1 })]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  assert.equal((await A.leerPlaylist(db, "cafes")).rev, 2);
  assert.equal((await A.leerMeta(db)).version, 2);
});

prueba("poda: tras 55 escrituras quedan las 50 últimas revisiones", async () => {
  const db = await d1Memoria(SQL);
  let rev = 0;
  for (let i = 1; i <= 55; i += 1) {
    const r = await A.guardarPlaylist(db, playlist({ nombre: "Cafés " + i }), { ...yo, rev, ahora: T0 + i });
    assert.equal(r.ok, true, String(r.error));
    rev = r.playlist.rev;
  }
  assert.equal(rev, 55);
  const h = await A.historial(db, "playlist", "cafes");
  assert.equal(h.length, 50);
  assert.deepEqual([h[0].rev, h[49].rev], [55, 6]);
  assert.equal(h[0].datos.nombre, "Cafés 55");
  assert.equal(await cuenta(db, "playlist_revision"), 50);
  assert.equal(await cuenta(db, "auditoria"), 55, "la auditoría no se poda");
  assert.equal((await A.leerMeta(db)).version, 55);
});

prueba("asignación: exige playlist, precalcula inicio/fin, indexa el destino y candidatas() la encuentra", async () => {
  const db = await d1Memoria(SQL);
  const asg = { id: "cafes-gracia", playlist_id: "cafes", destino: { all: ["circuito:gracia", "orientacion:vertical"] }, capa: "propia", mezcla: "sustituye",
    fecha_desde: "2026-10-14", fecha_hasta: "2026-10-20", franjas: ["08:00-12:00"] };
  const huerfana = await A.guardarAsignacion(db, asg, yo);
  assert.deepEqual([huerfana.status, huerfana.error], [422, "playlist_inexistente"]);
  assert.equal(await cuenta(db, "auditoria"), 0);
  await A.guardarPlaylist(db, playlist(), yo);
  const r = await A.guardarAsignacion(db, asg, yo);
  assert.equal(r.status, 201);
  assert.deepEqual([r.asignacion.inicio_utc, r.asignacion.fin_utc], [M("2026-10-14", "00:00"), M("2026-10-21", "00:00")]);
  assert.deepEqual([r.asignacion.directa, r.asignacion.prioridad, r.asignacion.destino.all], [false, 300, ["circuito:gracia", "orientacion:vertical"]]);
  const indice = async () => (await db.prepare("SELECT etiqueta, modo FROM asignacion_destino WHERE asignacion_id = 'cafes-gracia' ORDER BY etiqueta").all()).results.map(x => x.etiqueta + "/" + x.modo);
  assert.deepEqual(await indice(), ["circuito:gracia/all", "orientacion:vertical/all"]);
  const tags = ["circuito:gracia", "orientacion:vertical", "pantalla:sbux-021-p1", "todas"];
  const c = await A.candidatas(db, tags, { ahora: T0 });
  assert.deepEqual(c.asignaciones.map(a => a.id), ["cafes-gracia"]);
  assert.deepEqual(c.playlists.map(p => p.id), ["cafes"]);
  assert.equal(c.version, 2);
  assert.deepEqual((await A.candidatas(db, ["circuito:otro", "todas"], { ahora: T0 })).asignaciones, [], "ninguna etiqueta suya");
  assert.deepEqual((await A.candidatas(db, tags, { ahora: M("2026-10-23", "10:00") })).asignaciones, [], "ya terminó");
  assert.equal((await A.candidatas(db, tags, { ahora: M("2026-10-12", "10:00") })).asignaciones.length, 1, "empieza dentro de 48 h: entra para el borde");
  // Cambiar el destino rehace el índice; pausarla la saca de las candidatas.
  const r2 = await A.guardarAsignacion(db, { ...asg, destino: { any: ["pantalla:sbux-021-p1", "pantalla:sbux-021-p2"] } }, { ...yo, rev: 1 });
  assert.equal(r2.asignacion.directa, true);
  assert.equal(r2.asignacion.mezcla, "sustituye");
  assert.deepEqual(await indice(), ["pantalla:sbux-021-p1/any", "pantalla:sbux-021-p2/any"]);
  const viejo = await A.guardarAsignacion(db, { ...asg, estado: "pausada" }, { ...yo, rev: 1 });
  assert.equal(viejo.status, 409);
  assert.deepEqual(await indice(), ["pantalla:sbux-021-p1/any", "pantalla:sbux-021-p2/any"], "un 409 no toca el índice");
  await A.guardarAsignacion(db, { ...asg, estado: "pausada" }, { ...yo, rev: 2 });
  assert.deepEqual((await A.candidatas(db, tags, { ahora: T0 })).asignaciones, []);
  assert.equal((await A.historial(db, "asignacion", "cafes-gracia")).length, 3);
});

prueba("borrar: una playlist en uso no se borra; con rev vieja es 409; la copia final queda en la auditoría", async () => {
  const db = await d1Memoria(SQL);
  await A.guardarPlaylist(db, playlist(), yo);
  await A.guardarAsignacion(db, { id: "a1", playlist_id: "cafes", destino: { any: ["todas"] } }, yo);
  const enUso = await A.borrarPlaylist(db, "cafes", { ...yo, rev: 1 });
  assert.deepEqual([enUso.status, enUso.error], [409, "playlist_en_uso"]);
  assert.deepEqual([(await A.borrarAsignacion(db, "a1", { ...yo, rev: 9 })).status, (await A.borrarAsignacion(db, "a1", yo)).status], [409, 428]);
  const fuera = await A.borrarAsignacion(db, "a1", { ...yo, rev: 1, motivo: "fin de campaña" });
  assert.equal(fuera.ok, true);
  assert.equal(await cuenta(db, "asignacion_destino"), 0);
  const borrada = await A.borrarPlaylist(db, "cafes", { ...yo, rev: 1 });
  assert.equal(borrada.ok, true);
  assert.equal(await A.leerPlaylist(db, "cafes"), null);
  assert.equal((await A.borrarPlaylist(db, "cafes", { ...yo, rev: 1 })).status, 404);
  const ultima = (await A.auditoria(db, { entidad: "playlist", id: "cafes" }))[0];
  assert.equal(ultima.accion, "borrar");
  assert.deepEqual(ultima.detalle.datos.items.map(i => i.stockId), ["c1", "c2"]);
  assert.equal(borrada.version, (await A.leerMeta(db)).version);
  // Se puede volver a crear con el mismo id: empieza un historial nuevo.
  const otra = await A.guardarPlaylist(db, playlist({ nombre: "Renace" }), yo);
  assert.equal(otra.playlist.rev, 1);
  assert.deepEqual((await A.historial(db, "playlist", "cafes")).map(h => h.datos.nombre), ["Renace"]);
});

prueba("circuitos, banderas y sombra", async () => {
  const db = await d1Memoria(SQL);
  const c = await A.guardarCircuito(db, { name: "Starbucks verticales", target: { all: ["proyecto:starbucks", "orientacion:vertical", "circuito:starbucks-verticales"] } }, yo);
  assert.equal(c.ok, true);
  assert.deepEqual(c.circuito.destino.all, ["proyecto:starbucks", "orientacion:vertical"], "no se define con su propia etiqueta");
  assert.equal(c.circuito.activo, true);
  assert.deepEqual((await A.listarCircuitos(db)).map(x => x.id), ["starbucks-verticales"]);
  const b = await A.fijarBanderas(db, { motor: "sombra", sombra: true, "mal clave": 1, objeto: { x: 1 } }, yo);
  assert.deepEqual(b.banderas, { motor: "sombra", sombra: true });
  assert.equal((await A.leerMeta(db)).version, b.version);
  await A.registrarSombra(db, { pantalla: "sbux-021-p1", en: T0, version: 2, firma_legado: "123", firma_nueva: "123", capa: "por_defecto" });
  await A.registrarSombra(db, { pantalla: "sbux-021-p2", en: T0, version: 2, firma_legado: "1", firma_nueva: "2", capa: "propia" });
  assert.equal(await cuenta(db, "sombra", "coincide = 0"), 1);
});

prueba("de punta a punta: lo que guarda el almacén es lo que resuelve el resolver", async () => {
  const db = await d1Memoria(SQL);
  await A.guardarPlaylist(db, playlist({ id: "mano", nombre: "A mano", items: [item("m1"), item("m2")] }), yo);
  await A.guardarPlaylist(db, { id: "mediodia", nombre: "Mediodía", tipo: "viva", reglas: [{ any: ["café"], seconds: 6 }] }, yo);
  await A.guardarAsignacion(db, { id: "mano", playlist_id: "mano", destino: { all: ["pantalla:sbux-021-p1"] } }, yo);
  await A.guardarAsignacion(db, { id: "mediodia", playlist_id: "mediodia", destino: { all: ["proyecto:starbucks"] }, capa: "propia", mezcla: "sustituye", franjas: ["13:00-15:00"] }, yo);
  await A.guardarCircuito(db, { nombre: "Gràcia vertical", destino: { all: ["circuito:gracia", "orientacion:vertical"] } }, yo);
  const facts = { screen: "sbux-021-p1", circuit: "gracia", project: "starbucks", w: 1080, h: 1920 };
  const stock = [{ id: "k1", type: "video", url: "https://stock.admira.store/stock/k1/a.mp4", tags: ["café"], createdAt: 5 }];
  const circuitos = await A.listarCircuitos(db);
  const tags = resolver({ facts, circuitos, ahora: T0, siguiente: false }).screenTags;
  assert.ok(tags.includes("circuito:gracia-vertical"), "el circuito definido en la D1 da su etiqueta");
  const c = await A.candidatas(db, tags, { ahora: T0 });
  const r = resolver({ ahora: T0, facts, circuitos, stock, asignaciones: c.asignaciones, playlists: c.playlists });
  assert.equal(r.capa, "por_defecto");
  assert.deepEqual(r.items.map(i => i.stockId), ["m1", "m2"]);
  assert.equal(r.validoHasta, M("2026-10-14", "13:00"));
  assert.equal(r.siguiente.capa, "propia");
  assert.deepEqual(r.siguiente.items.map(i => i.stockId), ["k1"]);
});
