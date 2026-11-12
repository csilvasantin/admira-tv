/* Pausa de grupo al fotograma (12-nov-2026, Zona 0): las 5 pantallas se congelan en la posición
 * de pausedAt (hora del servidor) aunque cada una lea la pausa en un instante distinto, y el play
 * de grupo reanuda en el sitio. El estado de grupo se lee de D1 (consistente), no de KV (caché ~60 s). */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { onRequestGet, onRequestPost, GROUP_STATE_KEY } from "./functions/api/playout/group.js";

const require = createRequire(import.meta.url);
const AdmiraPlayoutGroup = require("./playout-group-math.js");
const html = readFileSync(new URL("./canal.html", import.meta.url), "utf8");
const section = (a, b) => { const i = html.indexOf(a); assert.ok(i >= 0, a); return html.slice(i, html.indexOf(b, i)); };
const transport = section("let _groupTransport=null", "async function pollGroupTransport(){");
const timeline = section("function syncTimeline(){", "function syncFinishCurrent(){");

const DURS_S = [120, 200, 90];   // segundos publicados por pieza (total 410 s)
function player(nowMs, drift) {
  const media = { tagName: "VIDEO", readyState: 4, duration: 200.5, currentTime: 0, paused: false, calls: [],
    pause() { this.paused = true; this.calls.push("pause"); }, play() { this.paused = false; this.calls.push("play"); return Promise.resolve(); },
    addEventListener() {} };
  const ctx = vm.createContext({
    AdmiraPlayoutGroup, mediaEl: media, paused: false, syncOn: true, _standby: false, cur: 1, timer: 0,
    playlist: DURS_S.map((d, i) => ({ id: "p" + i, _dur: d })), SYNC_REMOTE: { epochMs: 0 },
    syncItemDurationMs: it => it._dur * 1000, syncFallbackSlotMs: () => 20000,
    syncNow: () => ctx.__now + drift, __now: nowMs, PAUSE_INTENT_KEY: "k", save() {},
    document: { body: { classList: { remove() {}, toggle() {} } } }, $: () => ({}),
    clearTimeout() {}, setTimeout: () => 1, next() {}, xtoreMusicEnabled: () => false,
    play: () => { ctx.__mounted = (ctx.__mounted || 0) + 1; },
    setPaused(p) { ctx.paused = !!p; if (p) media.pause(); else ctx.play(); }, Promise
  });
  vm.runInContext(timeline + "\n" + transport + "\nglobalThis.apply=applyGroupTransportState;globalThis.line=syncTimeline;globalThis.pending=()=>_groupFreezePending;", ctx);
  return { ctx, media };
}

test("pausa de grupo: todas congelan la posición de pausedAt aunque lean la pausa con 0–1,2 s de diferencia", () => {
  const shiftMs = -197076, pausedAt = 1794490653273;
  const expected = AdmiraPlayoutGroup.timeline(DURS_S.map(s => s * 1000), { shiftMs, pausedAt, events: [] }, 0, 0);
  const lags = [0, 590, 870, 1010, 1210], drifts = [-12, 8, 0, 25, -30];
  const positions = lags.map((lag, i) => {
    const p = player(pausedAt + lag, drifts[i]);
    p.ctx.cur = expected.index;
    p.media.currentTime = (expected.elapsed + lag) / 1000;   // seguía reproduciendo hasta leer la pausa
    p.ctx.apply({ shiftMs, pausedAt, revision: 9, updatedAt: pausedAt, events: [] });
    assert.equal(p.ctx.paused, true);
    assert.ok(p.media.calls.includes("pause"));
    return p.media.currentTime * 1000;
  });
  const spread = Math.max(...positions) - Math.min(...positions);
  assert.ok(spread < 1, "spread " + spread + " ms");
  assert.ok(Math.abs(positions[0] - expected.elapsed) < 1);
});

test("pausa que cae en otra pieza: monta la pieza de pausedAt y queda pendiente de congelar", () => {
  const pausedAt = 125000;   // pieza 1 (120–320 s)
  const p = player(pausedAt + 800, 0); p.ctx.cur = 0;
  p.ctx.apply({ shiftMs: 0, pausedAt, revision: 3, updatedAt: pausedAt, events: [] });
  assert.equal(p.ctx.__mounted, 1);
  assert.equal(p.ctx.pending(), true);
  p.ctx.apply({ shiftMs: 0, pausedAt, revision: 3, updatedAt: pausedAt, events: [] });   // sondeo repetido: no re-monta
  assert.equal(p.ctx.__mounted, 1);
});

test("play de grupo: despausa en el sitio, alineado al reloj común, sin re-montar el vídeo", () => {
  const pausedAt = 150000, resumeAt = 170000;
  const p = player(pausedAt + 300, 0); p.ctx.cur = 1;
  p.ctx.apply({ shiftMs: 0, pausedAt, revision: 5, updatedAt: pausedAt, events: [] });
  assert.equal(p.ctx.paused, true);
  const play = AdmiraPlayoutGroup.applyGroupAction({ shiftMs: 0, pausedAt, revision: 5, events: [] }, "play", resumeAt, null);
  p.ctx.__now = resumeAt + 700;   // lo lee 0,7 s después
  p.ctx.apply(play);
  assert.equal(p.ctx.paused, false);
  assert.equal(p.ctx.__mounted || 0, 0);
  assert.equal(p.media.calls.at(-1), "play");
  // continúa desde el punto de pausa + lo transcurrido desde el play (0,7 s)
  assert.ok(Math.abs(p.media.currentTime * 1000 - (pausedAt - 120000 + 700)) < 1);
});

function fakeD1() {
  const rows = new Map();
  return { rows, prepare(sql) { let args = []; return {
    bind(...a) { args = a; return this; },
    async run() { if (/^INSERT/i.test(sql)) rows.set(args[0], { state: args[1] }); return { success: true }; },
    async first() { return rows.get(args[0]) || null; } }; } };
}

test("el estado de grupo se lee de D1 aunque KV sirva una copia vieja (caché de borde)", async () => {
  const KEY = "k".repeat(48);
  const stale = JSON.stringify({ shiftMs: 0, pausedAt: 111, revision: 9, updatedAt: 111, events: [] });
  const env = { RELE_SERVICE_KEY: KEY, PROGRAMACION_DB: fakeD1(),
    ACCESS: { get: async () => stale, put: async () => {} } };   // KV nunca devuelve lo nuevo
  const r = await onRequestPost({ request: new Request("https://admira.tv/api/playout/group", { method: "POST",
    headers: { Authorization: "Bearer " + KEY, "Content-Type": "application/json" }, body: JSON.stringify({ action: "play" }) }), env });
  assert.equal(r.status, 200);
  const body = await r.json(); assert.equal(body.store, "d1");
  const got = await (await onRequestGet({ env })).json();
  assert.equal(got.state.revision, 10);
  assert.equal(got.state.pausedAt, null);
  assert.equal(GROUP_STATE_KEY, "admira-tv:playout:group:v1");
});

test("con «next» en cola, pause/play no mueven la línea de tiempo (antes saltaba de pieza)", () => {
  const durs = DURS_S.map(s => s * 1000);
  let st = { shiftMs: -197076, pausedAt: null, revision: 8, updatedAt: 0, events: [{ action: "next", at: 1000000 }, { action: "next", at: 2000000 }] };
  const T = 3000000;
  const live = AdmiraPlayoutGroup.timeline(durs, st, T, 0);
  st = AdmiraPlayoutGroup.applyGroupAction(st, "pause", T, null);
  assert.equal(st.paused, true);
  const frozen = AdmiraPlayoutGroup.timeline(durs, st, T + 50000, 0);   // 50 s después sigue en el mismo punto
  assert.equal(frozen.index, live.index); assert.ok(Math.abs(frozen.elapsed - live.elapsed) < 1);
  assert.notEqual(AdmiraPlayoutGroup.resolveState(st, durs).pausedAt, null);
  st = AdmiraPlayoutGroup.applyGroupAction(st, "play", T + 60000, null);
  assert.equal(st.paused, false);
  assert.equal(AdmiraPlayoutGroup.resolveState(st, durs).pausedAt, null);
  const resumed = AdmiraPlayoutGroup.timeline(durs, st, T + 60000 + 2000, 0);   // 2 s después del play
  const expectPos = (live.pos + 2000) % live.total;
  assert.ok(Math.abs(resumed.pos - expectPos) < 1, resumed.pos + " vs " + expectPos);
});

test("el player resuelve la pausa con la cola de eventos (top-level pausedAt sigue null)", () => {
  const p = player(3000500, 0);
  let st = { shiftMs: 0, pausedAt: null, revision: 8, updatedAt: 0, events: [{ action: "next", at: 1000 }] };
  st = AdmiraPlayoutGroup.applyGroupAction(st, "pause", 3000000, null);
  assert.equal(st.pausedAt, null);
  const exp = AdmiraPlayoutGroup.timeline(DURS_S.map(s => s * 1000), st, 0, 0);
  p.ctx.cur = exp.index;
  p.ctx.apply(st);
  assert.equal(p.ctx.paused, true);
  assert.ok(Math.abs(p.media.currentTime * 1000 - exp.elapsed) < 1);
});
