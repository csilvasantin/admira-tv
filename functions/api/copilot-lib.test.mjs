import test from "node:test";
import assert from "node:assert/strict";
import {
  looksLikeFleetQuestion, fleetSummary, formatFleetAnswer, honestError, FRESH_MS,
} from "./copilot-lib.js";

test("reconoce la pregunta de equipos conectados", () => {
  assert.equal(looksLikeFleetQuestion("cuántos equipos están conectados a la plataforma"), true);
  assert.equal(looksLikeFleetQuestion("¿Cuantas maquinas online hay?"), true);
  assert.equal(looksLikeFleetQuestion("quién está latiendo en la flota"), true);
  assert.equal(looksLikeFleetQuestion("¿qué horario tenéis?"), false);
  assert.equal(looksLikeFleetQuestion("abre un ticket"), false);
});

test("conectado es latido fresco, no el status online viejo", () => {
  const now = 1_700_000_000_000;
  const machines = [
    { id: "a", name: "Mac Mini", status: "online", lastSeen: (now - 60_000) / 1000 },
    { id: "b", name: "Zenbook", status: "online", lastSeen: (now - 2 * FRESH_MS) / 1000 },
    { id: "c", name: "MBP14", status: "Morfeo · MBP14", lastSeen: now - 90_000 },
  ];
  const s = fleetSummary(machines, now);
  assert.equal(s.total, 3);
  assert.equal(s.connected, 2);
  assert.deepEqual(s.live.map((m) => m.name).sort(), ["MBP14", "Mac Mini"]);
  assert.match(formatFleetAnswer(s), /2 de 3 equipos están conectados/);
  assert.match(formatFleetAnswer(s), /Mac Mini/);
});

test("los errores se dicen, no se disfrazan de «no he podido»", () => {
  assert.match(honestError("unauthorized"), /Sesión caducada/);
  assert.match(honestError("network"), /Sin red/);
  assert.match(honestError("brain"), /cerebro falló/);
  assert.doesNotMatch(honestError("unauthorized"), /No he podido responder/);
});
