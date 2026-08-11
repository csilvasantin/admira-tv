import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const canal = await readFile(new URL("./canal.html", import.meta.url), "utf8");
const remote = await readFile(new URL("./remotecontrol/index.html", import.meta.url), "utf8");
const cms = await readFile(new URL("./cms.html", import.meta.url), "utf8");
const remoteStartSource = canal.slice(
  canal.indexOf("async function remoteStartPlayback()"),
  canal.indexOf("\n\n// Orden POR DEFECTO", canal.indexOf("async function remoteStartPlayback()"))
);

function playbackHarness({ standby = false, playResults = [undefined] } = {}) {
  const calls = [];
  const results = playResults.slice();
  const context = vm.createContext({
    Promise,
    _standby: standby,
    paused: true,
    playlist: [{}],
    cur: 0,
    muted: false,
    mediaEl: {
      muted: false,
      play() {
        calls.push("play");
        const result = results.shift();
        return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
      }
    },
    standbyOn(on) { calls.push(`standby:${on}`); context._standby = on; },
    setPaused(on) { calls.push(`paused:${on}`); context.paused = on; },
    async play() { calls.push("mount"); },
    applyAudio() { calls.push(`audio:${context.muted}`); context.mediaEl.muted = context.muted; },
    flashCli(message) { calls.push(message); },
    tap: { classList: { add(name) { calls.push(`tap+:${name}`); }, remove(name) { calls.push(`tap-:${name}`); } } }
  });
  vm.runInContext(`${remoteStartSource}\nglobalThis.runRemoteStart=remoteStartPlayback;`, context);
  return { calls, context, run: () => context.runRemoteStart() };
}

test("play remoto despierta standby y comprueba la reproducción real", () => {
  assert.match(canal, /async function remoteStartPlayback\(\)/);
  assert.match(canal, /if\(_standby\) standbyOn\(false\)/);
  assert.match(canal, /case 'play':\s+return remoteStartPlayback\(\)/);
  assert.match(canal, /if\(_standby\|\|paused\) return remoteStartPlayback\(\)/);
  assert.match(canal, /await Promise\.resolve\(el\.play\(\)\)/);
});

test("el arranque remoto sale realmente de standby", async () => {
  const h = playbackHarness({ standby: true });
  assert.equal(await h.run(), "executed");
  assert.deepEqual(h.calls.slice(0, 2), ["standby:false", "play"]);
});

test("iOS recibe un fallback de autoplay silencioso antes de declarar fallo", () => {
  assert.match(canal, /const previousMuted=muted;\s+muted=true; applyAudio\(\)/);
  assert.match(canal, /audio silenciado por iOS/);
  assert.match(canal, /muted=previousMuted; applyAudio\(\)/);
  assert.match(canal, /catch\(_\)\{ ackCtrl\(c,'failed'\); \}/);
});

test("si WebKit bloquea el audio, el segundo intento arranca en mudo", async () => {
  const h = playbackHarness({ playResults: [new Error("NotAllowedError"), undefined] });
  assert.equal(await h.run(), "executed");
  assert.equal(h.context.muted, true);
  assert.equal(h.calls.filter((call) => call === "play").length, 2);
  assert.ok(h.calls.includes("audio:true"));
});

test("si también falla el intento mudo, restaura audio y propaga el fallo", async () => {
  const h = playbackHarness({ playResults: [new Error("NotAllowedError"), new Error("AbortError")] });
  await assert.rejects(h.run(), /AbortError/);
  assert.equal(h.context.muted, false);
  assert.ok(h.calls.includes("audio:false"));
  assert.ok(h.calls.includes("tap+:show"));
});

test("la cola no solapa polls y se rearma al volver iOS a primer plano", () => {
  assert.match(canal, /if\(!scr\.screen\|\|_ctrlPolling\) return/);
  assert.match(canal, /const result=await applyCtrlCmd/);
  assert.match(canal, /document\.addEventListener\('visibilitychange',rearmCtrlOnForeground\)/);
  assert.match(canal, /window\.addEventListener\('pageshow',rearmCtrlOnForeground\)/);
  assert.match(canal, /window\.addEventListener\('online',rearmCtrlOnForeground\)/);
});

test("el mando llama Arrancar a play y distingue acuse fallido de ejecutado", () => {
  assert.match(remote, /\{cmd:'play',\s+ico:'▶', lab:'Arrancar'\}/);
  assert.match(remote, /receipt\.result==='failed'/);
  assert.match(remote, /✗ recibido · no arrancó/);
  assert.match(remote, /✓✓ ejecutado/);
});

test("el mini-mando existente del CMS también puede arrancar el iPhone", () => {
  assert.match(cms, /data-cmd="resume" title="arrancar o reanudar el player \(iPhone\/iOS incluido\)"/);
  assert.match(canal, /if\(cmd==='resume'\|\|cmd==='wake'[^]*?remoteStartPlayback\(\)\.catch/);
});
