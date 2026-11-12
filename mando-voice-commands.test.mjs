/* Frases de voz del mando: «hola Admira» es obligatorio; luego el comando de transporte. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  parseVoiceCommand,
  parseVoiceUtterance,
  normalizePhrase,
  matchWake,
  ARM_MS
} = require("./mando-voice-commands.js");
const mando = await readFile(new URL("./mando.html", import.meta.url), "utf8");

test("normaliza minúsculas, tildes y puntuación, sin quitar la activación", () => {
  assert.equal(normalizePhrase("  Hola,  Admira,   Siguiente  "), "hola admira siguiente");
  assert.equal(normalizePhrase("próximo"), "proximo");
  assert.equal(normalizePhrase("última"), "ultima");
  assert.equal(normalizePhrase("atrás, por favor"), "atras por favor");
  assert.equal(normalizePhrase("Hola Admira"), "hola admira");
});

test("reconoce las variantes de «hola Admira»", () => {
  for (const phrase of ["hola admira", "hola Admira", "ola admira", "hola almira", "ola almira", "hola, admira", "Hola, Admira"]) {
    const wake = matchWake(normalizePhrase(phrase));
    assert.ok(wake, phrase);
    assert.equal(wake.rest, "", phrase);
    assert.equal(parseVoiceUtterance(phrase).type, "arm", phrase);
  }
});

test("sin palabra de activación no envía comando: type ignored", () => {
  for (const phrase of ["siguiente", "pausa", "admira siguiente", "next", "anterior", "play"]) {
    const result = parseVoiceUtterance(phrase);
    assert.equal(result.type, "ignored", phrase);
    assert.equal(result.cmd, null, phrase);
    assert.equal(parseVoiceCommand(phrase), null, phrase);
  }
});

test("hola Admira + comando en la misma frase", () => {
  const cases = [
    ["hola Admira, siguiente", "next"],
    ["hola admira proximo", "next"],
    ["ola admira next", "next"],
    ["hola almira, anterior", "prev"],
    ["ola almira atrás", "prev"],
    ["hola, admira previo", "prev"],
    ["hola Admira primero", "first"],
    ["hola Admira, primera", "first"],
    ["hola Admira inicio", "first"],
    ["hola Admira, desde el principio", "first"],
    ["hola Admira último", "last"],
    ["hola Admira ultima", "last"],
    ["hola Admira final", "last"],
    ["hola Admira, pausa", "pause"],
    ["hola admira para", "pause"],
    ["hola Admira pausar", "pause"],
    ["hola Admira stop", "pause"],
    ["hola Admira sigue", "play"],
    ["hola Admira, continúa", "play"],
    ["hola Admira reanuda", "play"],
    ["hola Admira play", "play"],
    ["hola Admira reproduce", "play"],
    ["hola Admira, reproducir", "play"]
  ];
  for (const [phrase, cmd] of cases) {
    const result = parseVoiceUtterance(phrase);
    assert.equal(result.type, "command", phrase);
    assert.equal(result.cmd, cmd, phrase);
    assert.equal(parseVoiceCommand(phrase), cmd, phrase);
  }
});

test("solo «hola Admira» abre una ventana de 5 segundos para un comando suelto", () => {
  assert.equal(ARM_MS, 5000);
  const arm = parseVoiceUtterance("hola Admira");
  assert.equal(arm.type, "arm");
  assert.equal(arm.arm, true);
  assert.equal(arm.cmd, null);

  const now = 10_000;
  const open = now + ARM_MS;
  assert.equal(parseVoiceCommand("siguiente", { now, armedUntil: open }), "next");
  assert.equal(parseVoiceUtterance("pausa", { now, armedUntil: open }).type, "command");
  assert.equal(parseVoiceCommand("pausa", { now, armedUntil: open }), "pause");
  assert.equal(parseVoiceCommand("desde el principio", { now, armedUntil: open }), "first");

  assert.equal(parseVoiceCommand("siguiente", { now: open, armedUntil: open }), null, "al cerrarse ya no vale un comando suelto");
  assert.equal(parseVoiceUtterance("siguiente", { now: open, armedUntil: open }).type, "ignored");
});

test("hola Admira + frase desconocida no se envía, no se marca ignorada", () => {
  const result = parseVoiceUtterance("hola Admira, silencio");
  assert.equal(result.type, "unrecognized");
  assert.equal(result.cmd, null);
  assert.equal(parseVoiceCommand("hola Admira mute"), null);
});

test("no reconoce mute ni frases vacías", () => {
  for (const phrase of ["", "   ", "silencio", "mute", "unmute", "audioon", "audiooff", "volumen", "apaga"]) {
    const result = parseVoiceUtterance(phrase);
    assert.equal(result.cmd, null, phrase);
    assert.ok(result.type === "ignored" || result.type === "unrecognized", phrase);
  }
});

test("mando.html exige «hola Admira», muestra ignorada y esconde el micrófono si no hay API", () => {
  assert.match(mando, /src="\/mando-voice-commands\.js"/);
  assert.match(mando, /id="voiceToggle"/);
  assert.match(mando, /id="voiceLog"/);
  assert.match(mando, /id="voiceArmed"/);
  assert.match(mando, /webkitSpeechRecognition|SpeechRecognition/);
  assert.match(mando, /lang\s*=\s*['"]es-ES['"]/);
  assert.match(mando, /continuous\s*=\s*true/);
  assert.match(mando, /ARM_MS|5000/);
  assert.match(mando, /ignorada/);
  assert.match(mando, /id="voiceDock"/);
  assert.match(mando, /(?:voiceDock|dock|toggle)\.hidden\s*=\s*true/);
  assert.doesNotMatch(mando, /El control por voz necesita Chrome o Edge/);
  assert.doesNotMatch(mando, /sendRemote\(['"]audioon['"]/)
  assert.doesNotMatch(mando, /sendRemote\(['"]unmute['"]/)
  assert.match(mando, /first\/prev\/pause\/play\/next\/last/);
  assert.doesNotMatch(mando, /toggle-pause/);
});
