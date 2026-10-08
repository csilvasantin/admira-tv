// node --test functions/api/_programacion/ — horario del modelo único de playlists (E2 · 8-oct-2026).
// Hora de pared de Europe/Madrid: cambios de hora, medianoche, cada N semanas, excepciones, días y rangos abiertos.
import test from "node:test";
import assert from "node:assert/strict";
import { DIAS, FIN_ABIERTO, HORA_MS, MIN_MS, aMinutos, aUtc, bitDia, cubre, diaActivo, expandir, limpiarProgramacion,
  partesLocales, proximoBorde, rangoUtc } from "./horario.js";

const Z = s => Date.parse(s);
const M = (fecha, hhmm) => aUtc(fecha, aMinutos(hhmm));                 // hora de pared de Madrid → instante
const iso = t => new Date(t).toISOString().slice(0, 16) + "Z";
const tramos = (p, desde, hasta) => expandir(p, desde, hasta).map(o => [iso(o.inicio), iso(o.fin)]);

test("otoño, 25-oct-2026: la hora repetida toma la primera ocurrencia y el día dura 25 h", () => {
  assert.equal(aUtc("2026-10-25", 150), Z("2026-10-25T00:30Z"), "02:30 → la primera, aún en verano (UTC+2)");
  assert.equal(aUtc("2026-10-25", 180), Z("2026-10-25T02:00Z"), "03:00 sólo existe en invierno (UTC+1)");
  assert.equal(aUtc("2026-10-26", 0) - aUtc("2026-10-25", 0), 25 * HORA_MS);
  assert.equal(partesLocales(Z("2026-10-25T01:30Z")).hhmm, "02:30", "la segunda 02:30 se lee como 02:30");
  const p = limpiarProgramacion({ fecha_desde: "2026-10-25", fecha_hasta: "2026-10-25", franjas: ["02:00-03:00"] });
  assert.deepEqual(tramos(p, Z("2026-10-24T00:00Z"), Z("2026-10-27T00:00Z")), [["2026-10-25T00:00Z", "2026-10-25T02:00Z"]], "02:00–03:00 dura 2 h reales");
  // 00:00–02:30 y 02:30–24:00 se reparten el día sin hueco ni solape, también en la hora repetida.
  const a = limpiarProgramacion({ franjas: ["00:00-02:30"] }), b = limpiarProgramacion({ franjas: ["02:30-24:00"] });
  for (let t = aUtc("2026-10-25", 0); t < aUtc("2026-10-26", 0); t += 15 * MIN_MS) assert.equal(cubre(a, t) + cubre(b, t), 1, iso(t));
  assert.equal(cubre(a, Z("2026-10-25T01:30Z")), false, "la segunda 02:30 ya es de la franja siguiente");
  assert.equal(cubre(b, Z("2026-10-25T01:30Z")), true);
  // Diaria 08:00–20:00: desde el sábado por la noche, el borde siguiente es el domingo 08:00 de invierno (07:00Z).
  assert.equal(proximoBorde(limpiarProgramacion({ franjas: ["08:00-20:00"] }), Z("2026-10-24T21:00Z")), Z("2026-10-25T07:00Z"));
});

test("primavera, 28-mar-2027: la hora que no existe salta a las 03:00 y el día dura 23 h", () => {
  assert.equal(aUtc("2027-03-28", 150), Z("2027-03-28T01:00Z"), "02:30 no existe: 03:00 de verano");
  assert.equal(aUtc("2027-03-28", 120), Z("2027-03-28T01:00Z"));
  assert.equal(aUtc("2027-03-28", 119), Z("2027-03-28T00:59Z"), "01:59 todavía es invierno");
  assert.equal(aUtc("2027-03-29", 0) - aUtc("2027-03-28", 0), 23 * HORA_MS);
  const hueca = limpiarProgramacion({ franjas: ["02:00-02:45"] });
  assert.deepEqual(tramos(hueca, aUtc("2027-03-28", 0), aUtc("2027-03-29", 0)), [], "ese día la franja no existe");
  assert.equal(tramos(hueca, aUtc("2027-03-27", 0), aUtc("2027-03-28", 0)).length, 1, "el sábado sí");
  assert.equal(cubre(hueca, Z("2027-03-28T01:00Z")), false);
  assert.deepEqual(tramos(limpiarProgramacion({ franjas: ["01:00-02:30"] }), aUtc("2027-03-28", 0), aUtc("2027-03-29", 0)),
    [["2027-03-28T00:00Z", "2027-03-28T01:00Z"]], "01:00–02:30 de pared es 1 h real");
  assert.equal(cubre(limpiarProgramacion({ franjas: ["03:00-04:00"] }), Z("2027-03-28T01:00Z")), true);
  assert.equal(proximoBorde(limpiarProgramacion({ franjas: ["08:00-20:00"] }), Z("2027-03-27T22:00Z")), Z("2027-03-28T06:00Z"), "08:00 ya en verano");
});

test("franjas que cruzan la medianoche pertenecen al día en que empiezan", () => {
  const p = limpiarProgramacion({ dias: ["V"], franjas: [{ desde: "22:00", hasta: "02:00" }] });   // 9-oct-2026 es viernes
  assert.equal(cubre(p, M("2026-10-09", "23:00")), true);
  assert.equal(cubre(p, M("2026-10-10", "01:59")), true, "la madrugada del sábado sigue siendo la del viernes");
  assert.equal(cubre(p, M("2026-10-10", "02:00")), false);
  assert.equal(cubre(p, M("2026-10-10", "23:00")), false, "el sábado no empieza");
  assert.equal(cubre(p, M("2026-10-09", "01:00")), false, "la madrugada del viernes es del jueves");
  assert.equal(proximoBorde(p, M("2026-10-09", "12:00")), M("2026-10-09", "22:00"));
  assert.equal(proximoBorde(p, M("2026-10-09", "23:00")), M("2026-10-10", "02:00"));
  const ultima = limpiarProgramacion({ fecha_desde: "2026-10-09", fecha_hasta: "2026-10-09", franjas: ["22:00-02:00"] });
  assert.equal(cubre(ultima, M("2026-10-10", "01:00")), true, "la última noche termina al día siguiente de fecha_hasta");
  assert.equal(rangoUtc(ultima).fin_utc, M("2026-10-10", "02:00"), "y la cota precalculada lo incluye");
  const otono = limpiarProgramacion({ dias: ["S"], franjas: ["22:00-04:00"] });
  assert.deepEqual(tramos(otono, Z("2026-10-24T12:00Z"), Z("2026-10-25T12:00Z")), [["2026-10-24T20:00Z", "2026-10-25T03:00Z"]], "6 h de pared, 7 reales");
  const entero = limpiarProgramacion({ franjas: ["06:00-06:00"] });
  assert.equal(cubre(entero, M("2026-10-10", "05:59")), true, "desde = hasta: 24 h seguidas");
  assert.equal(proximoBorde(entero, M("2026-10-10", "12:00")), null, "días encadenados sin hueco no tienen borde");
});

test("cada N semanas: semanas de lunes a domingo contadas desde el ancla, también hacia atrás", () => {
  const p = limpiarProgramacion({ dias: ["L"], recurrencia: { tipo: "semanal", cada: 2, ancla: "2026-10-07" } });
  assert.deepEqual(["2026-09-21", "2026-09-28", "2026-10-05", "2026-10-06", "2026-10-12", "2026-10-19"].map(f => diaActivo(p, f)),
    [true, false, true, false, false, true], "el ancla (miércoles) marca la semana del lunes 5");
  const q = limpiarProgramacion({ fecha_desde: "2026-10-08", recurrencia: { tipo: "semanal", cada: 3 } });
  assert.deepEqual(["2026-10-05", "2026-10-08", "2026-10-11", "2026-10-12", "2026-10-26", "2026-11-01", "2026-11-02"].map(f => diaActivo(q, f)),
    [false, true, true, false, true, true, false], "sin ancla, la de fecha_desde");
  assert.equal(proximoBorde(q, M("2026-10-11", "20:00")), M("2026-10-12", "00:00"));
  assert.equal(limpiarProgramacion({ recurrencia: { tipo: "semanal", cada: 1 } }).recurrencia, null, "cada 1 es lo normal");
  assert.throws(() => limpiarProgramacion({ recurrencia: { tipo: "semanal", cada: 2 } }), /recurrencia_sin_ancla/);
  const fechas = limpiarProgramacion({ recurrencia: { tipo: "fechas", fechas: ["2026-12-31", "2026-12-24", "2026-12-24"] } });
  assert.deepEqual(fechas.recurrencia.fechas, ["2026-12-24", "2026-12-31"]);
  assert.deepEqual(["2026-12-23", "2026-12-24", "2026-12-31"].map(f => diaActivo(fechas, f)), [false, true, true]);
  assert.deepEqual(rangoUtc(fechas), { inicio_utc: M("2026-12-24", "00:00"), fin_utc: M("2027-01-01", "00:00") });
});

test("excepciones: días sueltos y rangos que no se emiten", () => {
  const p = limpiarProgramacion({ fecha_desde: "2026-12-01", fecha_hasta: "2026-12-31", excepciones: [{ desde: "2026-12-28", hasta: "2026-12-30" }, "2026-12-25"] });
  assert.deepEqual(["2026-12-24", "2026-12-25", "2026-12-26", "2026-12-28", "2026-12-30", "2026-12-31"].map(f => diaActivo(p, f)),
    [true, false, true, false, false, true]);
  assert.equal(proximoBorde(p, M("2026-12-24", "12:00")), M("2026-12-25", "00:00"));
  assert.equal(proximoBorde(p, M("2026-12-25", "12:00")), M("2026-12-26", "00:00"));
  assert.throws(() => limpiarProgramacion({ excepciones: [{ desde: "2026-12-30", hasta: "2026-12-28" }] }), /excepcion_invalida/);
  assert.throws(() => limpiarProgramacion({ excepciones: ["2026-13-01"] }), /excepcion_invalida/);
});

test("días de la semana como máscara L=1 … D=64", () => {
  assert.deepEqual({ ...DIAS }, { L: 1, M: 2, X: 4, J: 8, V: 16, S: 32, D: 64 });
  const p = limpiarProgramacion({ dias: DIAS.L | DIAS.X | DIAS.V, franjas: ["09:00-10:00"] });
  assert.equal(p.dias, 21);
  assert.deepEqual(["05", "06", "07", "08", "09", "10", "11"].map(d => diaActivo(p, "2026-10-" + d)), [true, false, true, false, true, false, false]);
  assert.equal(bitDia("2026-10-11"), 64, "domingo");
  assert.equal(limpiarProgramacion({ dias: ["s", "D"] }).dias, 96);
  assert.equal(limpiarProgramacion({}).dias, 127);
  assert.throws(() => limpiarProgramacion({ dias: 128 }), /dias_invalidos/);
  const finde = limpiarProgramacion({ dias: ["S", "D"] });
  assert.equal(proximoBorde(finde, M("2026-10-09", "18:00")), M("2026-10-10", "00:00"));
  assert.equal(proximoBorde(finde, M("2026-10-10", "18:00")), M("2026-10-12", "00:00"), "sábado y domingo son un solo bloque");
});

test("rangos abiertos por cualquier lado, fechas inclusivas y cotas UTC precalculadas", () => {
  const siempre = limpiarProgramacion({});
  assert.equal(cubre(siempre, Z("2001-01-01T00:00Z")), true);
  assert.equal(proximoBorde(siempre, M("2026-10-08", "12:00")), null);
  assert.deepEqual(rangoUtc(siempre), { inicio_utc: 0, fin_utc: FIN_ABIERTO });
  const desde = limpiarProgramacion({ fecha_desde: "2026-10-10" });
  assert.equal(cubre(desde, M("2026-10-09", "23:59")), false);
  assert.equal(cubre(desde, M("2026-10-10", "00:00")), true);
  assert.equal(proximoBorde(desde, M("2026-10-09", "12:00")), M("2026-10-10", "00:00"));
  assert.deepEqual(rangoUtc(desde), { inicio_utc: M("2026-10-10", "00:00"), fin_utc: FIN_ABIERTO });
  const hasta = limpiarProgramacion({ fecha_hasta: "2026-10-10" });
  assert.equal(cubre(hasta, M("2026-10-10", "23:59")), true, "fecha_hasta incluye el día entero");
  assert.equal(cubre(hasta, M("2026-10-11", "00:00")), false);
  assert.deepEqual(rangoUtc(hasta), { inicio_utc: 0, fin_utc: M("2026-10-11", "00:00") });
  assert.equal(proximoBorde(hasta, M("2026-10-10", "12:00")), M("2026-10-11", "00:00"));
  assert.equal(proximoBorde(hasta, M("2026-10-08", "12:00")), null, "más allá de 48 h no cuenta");
  assert.throws(() => limpiarProgramacion({ fecha_desde: "2026-10-10", fecha_hasta: "2026-10-01" }), /fechas_invertidas/);
  assert.throws(() => limpiarProgramacion({ fecha_desde: "2026-02-30" }), /fecha_desde_invalida/);
  assert.throws(() => limpiarProgramacion({ franjas: ["25:00-26:00"] }), /franja_invalida/);
  assert.deepEqual(limpiarProgramacion({ franjas: [{ desde: 720, hasta: 1440 }, "08:00-12:00"] }).franjas, [{ desde: 480, hasta: 720 }, { desde: 720, hasta: 1440 }]);
  // Franjas contiguas se funden: 08–12 y 12–20 no tienen borde a las 12.
  assert.equal(proximoBorde(limpiarProgramacion({ franjas: ["08:00-12:00", "12:00-20:00"] }), M("2026-10-10", "09:00")), M("2026-10-10", "20:00"));
});
