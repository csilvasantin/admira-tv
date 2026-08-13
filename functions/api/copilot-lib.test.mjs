import test from "node:test";
import assert from "node:assert/strict";
import {
  looksLikeFleetQuestion, looksLikePlayersQuestion,
  fleetSummary, formatFleetAnswer, screensSummary, formatPlayersAnswer,
  honestError, FRESH_MS,
} from "./copilot-lib.js";

test("reconoce la pregunta de equipos conectados", () => {
  assert.equal(looksLikeFleetQuestion("cuántos equipos están conectados a la plataforma"), true);
  assert.equal(looksLikeFleetQuestion("¿Cuantas maquinas online hay?"), true);
  assert.equal(looksLikeFleetQuestion("quién está latiendo en la flota"), true);
  assert.equal(looksLikeFleetQuestion("¿qué horario tenéis?"), false);
  assert.equal(looksLikeFleetQuestion("abre un ticket"), false);
});

test("players emitiendo no se confunde con Macs de la flota", () => {
  const q = "cuantos players hay ahora mismo emitiendo";
  assert.equal(looksLikePlayersQuestion(q), true);
  assert.equal(looksLikeFleetQuestion(q), false);
  assert.equal(looksLikePlayersQuestion("cuántas pantallas hay en antena"), true);
  assert.equal(looksLikePlayersQuestion("cuántos equipos están conectados"), false);
});

test("players conectados a la plataforma no se van a la flota", () => {
  const q = "cuántos players hay conectados a la plataforma";
  assert.equal(looksLikePlayersQuestion(q), true);
  assert.equal(looksLikeFleetQuestion(q), false);
  assert.equal(looksLikePlayersQuestion("cuántos hay conectados a la plataforma"), true);
  assert.equal(looksLikeFleetQuestion("cuántos hay conectados a la plataforma"), false);
  assert.equal(looksLikePlayersQuestion("cuántos equipos están conectados a la plataforma"), false);
  assert.equal(looksLikeFleetQuestion("cuántos equipos están conectados a la plataforma"), true);
});

test("la respuesta de players usa el censo de emisión, no el status de un Mac", () => {
  const s = screensSummary({
    online_count: 2, total_count: 3,
    screens: [
      { screen: "xtanco-totem", online: true, locName: "xtanco-totem" },
      { screen: "neo-lab", online: true, loc: "macbookairplata", locName: "macbookairplata" },
      { screen: "viejo", online: false, loc: "apagado" },
    ],
  });
  assert.equal(s.emitting, 2);
  assert.equal(s.total, 3);
  assert.match(formatPlayersAnswer(s), /2 players conectados a la plataforma/);
  assert.match(formatPlayersAnswer(s), /xtanco-totem/);
  assert.match(formatPlayersAnswer(s), /neo-lab/);
  assert.doesNotMatch(formatPlayersAnswer(s), /macbookairplata/);
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
