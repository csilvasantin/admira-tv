/* Frases de voz del mando → comandos de transporte (next/prev/first/last/toggle-pause/play). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { parseVoiceCommand, normalizePhrase } = require("./mando-voice-commands.js");
const mando = await readFile(new URL("./mando.html", import.meta.url), "utf8");

test("normaliza minúsculas, tildes y la palabra de activación opcional admira", () => {
  assert.equal(normalizePhrase("  ADMIRA   Siguiente  "), "siguiente");
  assert.equal(normalizePhrase("próximo"), "proximo");
  assert.equal(normalizePhrase("última"), "ultima");
  assert.equal(normalizePhrase("atrás, por favor"), "atras");
  assert.equal(normalizePhrase("Admira"), "");
});

test("siguiente / proximo / next → next", () => {
  for (const phrase of ["siguiente", "Admira siguiente", "próximo", "proximo", "next", "siguiente canción"]) {
    assert.equal(parseVoiceCommand(phrase), "next", phrase);
  }
});

test("anterior / atras / previo → prev", () => {
  for (const phrase of ["anterior", "atrás", "atras", "previo", "admira anterior"]) {
    assert.equal(parseVoiceCommand(phrase), "prev", phrase);
  }
});

test("primero / primera / inicio / desde el principio → first", () => {
  for (const phrase of ["primero", "primera", "inicio", "desde el principio", "admira desde el principio", "primera canción"]) {
    assert.equal(parseVoiceCommand(phrase), "first", phrase);
  }
});

test("ultimo / ultima / final → last", () => {
  for (const phrase of ["último", "ultima", "último", "final", "admira última"]) {
    assert.equal(parseVoiceCommand(phrase), "last", phrase);
  }
});

test("pausa / para / pausar / stop → toggle-pause (la pausa también reanuda)", () => {
  for (const phrase of ["pausa", "para", "pausar", "stop", "Admira pausa", "pausa por favor"]) {
    assert.equal(parseVoiceCommand(phrase), "toggle-pause", phrase);
  }
});

test("sigue / continua / reanuda / play / reproduce → play", () => {
  for (const phrase of ["sigue", "continúa", "continua", "reanuda", "play", "reproduce", "admira sigue"]) {
    assert.equal(parseVoiceCommand(phrase), "play", phrase);
  }
});

test("no reconoce mute ni frases vacías o ajenas", () => {
  for (const phrase of ["", "admira", "silencio", "mute", "unmute", "audioon", "audiooff", "volumen", "apaga"]) {
    assert.equal(parseVoiceCommand(phrase), null, phrase);
  }
});

test("mando.html carga el parser, el botón de micrófono y avisa si no hay reconocimiento de voz", () => {
  assert.match(mando, /src="\/mando-voice-commands\.js"/);
  assert.match(mando, /id="voiceToggle"/);
  assert.match(mando, /id="voiceLog"/);
  assert.match(mando, /webkitSpeechRecognition|SpeechRecognition/);
  assert.match(mando, /El control por voz necesita Chrome o Edge/);
  assert.match(mando, /lang\s*=\s*['"]es-ES['"]/);
  assert.match(mando, /continuous\s*=\s*true/);
  assert.doesNotMatch(mando, /sendRemote\(['"]audioon['"]/)
  assert.doesNotMatch(mando, /sendRemote\(['"]unmute['"]/)
  assert.match(mando, /toggle-pause/);
});
