/* Transporte de grupo: matemática de shiftMs y aislamiento de la clave KV de playout. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { onRequestGet, onRequestPost, GROUP_STATE_KEY, PLAYOUT_STATE_KEY } from "./functions/api/playout/group.js";
import { onRequestGet as playoutGet, onRequestPost as playoutPost } from "./functions/api/playout.js";
import {
  applyGroupAction,
  timeline,
  clockMs,
  defaultState,
  GROUP_STATE_KEY as MATH_GROUP_KEY,
  PLAYOUT_STATE_KEY as MATH_PLAYOUT_KEY
} from "./functions/api/_playout-group.js";

const require = createRequire(import.meta.url);
const umd = require("./playout-group-math.js");
const canal = await readFile(new URL("./canal.html", import.meta.url), "utf8");
const mando = await readFile(new URL("./mando.html", import.meta.url), "utf8");

const DURS = [10_000, 20_000, 30_000]; // total 60s
const NOW = 100_000; // pos = 40000 → índice 2 (empieza en 30000), elapsed 10000

function envFor(email = "csilvasantin@gmail.com") {
  const records = new Map([["admira-tv:auth:session:test-session", JSON.stringify({ email, expiresAt: Date.now() + 60_000 })]]);
  return {
    ACCESS: {
      get: async (key) => records.get(key) || null,
      put: async (key, value) => { records.set(key, value); },
      delete: async (key) => { records.delete(key); }
    },
    records
  };
}

function authed(url, method, body) {
  const headers = { Cookie: "__Host-atv_session=test-session", "Content-Type": "application/json" };
  return new Request(url, { method, headers, body: body != null ? JSON.stringify(body) : undefined });
}

test("el UMD del player y el ESM de las Functions calculan lo mismo", () => {
  const a = applyGroupAction(defaultState(), "next", NOW, DURS);
  const b = umd.applyGroupAction(umd.defaultState(), "next", NOW, DURS);
  assert.deepEqual(a, b);
  assert.equal(MATH_GROUP_KEY, umd.GROUP_STATE_KEY);
  assert.equal(MATH_PLAYOUT_KEY, "admira-tv:playout:v1");
  assert.equal(GROUP_STATE_KEY, "admira-tv:playout:group:v1");
  assert.notEqual(GROUP_STATE_KEY, PLAYOUT_STATE_KEY);
});

test("next y prev recorren el loop y vuelven al otro extremo", () => {
  const start = timeline(DURS, defaultState(), NOW, 0);
  assert.equal(start.index, 2);
  assert.equal(start.elapsed, 10_000);

  const afterNext = applyGroupAction(defaultState(), "next", NOW, DURS);
  const nextLine = timeline(DURS, afterNext, NOW, 0);
  assert.equal(nextLine.index, 0);
  assert.equal(nextLine.elapsed, 0);

  const afterPrev = applyGroupAction(defaultState(), "prev", NOW, DURS);
  const prevLine = timeline(DURS, afterPrev, NOW, 0);
  assert.equal(prevLine.index, 1);
  assert.equal(prevLine.elapsed, 0);

  const fromFirst = applyGroupAction(defaultState(), "first", NOW, DURS);
  const wrapPrev = applyGroupAction(fromFirst, "prev", NOW, DURS);
  assert.equal(timeline(DURS, wrapPrev, NOW, 0).index, 2);
  assert.equal(timeline(DURS, wrapPrev, NOW, 0).elapsed, 0);
});

test("first va al inicio y last al comienzo de la última pieza", () => {
  const first = applyGroupAction(defaultState(), "first", NOW, DURS);
  assert.equal(timeline(DURS, first, NOW, 0).index, 0);
  assert.equal(timeline(DURS, first, NOW, 0).elapsed, 0);
  const last = applyGroupAction(defaultState(), "last", NOW, DURS);
  assert.equal(timeline(DURS, last, NOW, 0).index, 2);
  assert.equal(timeline(DURS, last, NOW, 0).elapsed, 0);
});

test("pause congela la posición y play reanuda en el mismo punto", () => {
  const playingPos = timeline(DURS, defaultState(), NOW, 0).pos;
  const paused = applyGroupAction(defaultState(), "pause", NOW, DURS);
  assert.equal(paused.pausedAt, NOW);
  assert.equal(timeline(DURS, paused, NOW + 15_000, 0).pos, playingPos);
  assert.equal(timeline(DURS, paused, NOW + 15_000, 0).index, 2);
  const resumed = applyGroupAction(paused, "play", NOW + 15_000, DURS);
  assert.equal(resumed.pausedAt, null);
  assert.equal(timeline(DURS, resumed, NOW + 15_000, 0).pos, playingPos);
  const later = timeline(DURS, resumed, NOW + 15_000 + 2_000, 0);
  const expected = timeline(DURS, defaultState(), NOW + 2_000, 0);
  assert.equal(later.pos, expected.pos);
});

test("sin duraciones, next queda en events con el timestamp del servidor", () => {
  const queued = applyGroupAction(defaultState(), "next", NOW);
  assert.deepEqual(queued.events, [{ action: "next", at: NOW }]);
  const resolved = timeline(DURS, queued, NOW, 0);
  assert.equal(resolved.index, 0);
  assert.equal(resolved.elapsed, 0);
});

test("el POST del grupo no escribe ni altera admira-tv:playout:v1", async () => {
  const env = envFor();
  const original = JSON.stringify({ configured: true, mode: "synchronized", screens: ["a-screen", "b-screen"], revision: 8, updatedAt: 6 });
  env.records.set(PLAYOUT_STATE_KEY, original);
  const keysBefore = new Set(env.records.keys());

  const res = await onRequestPost({ request: authed("https://admira.tv/api/playout/group", "POST", { action: "next", durations: DURS }), env });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.ok(body.state.revision >= 1);
  assert.equal(env.records.get(PLAYOUT_STATE_KEY), original);
  assert.ok(env.records.has(GROUP_STATE_KEY));
  for (const key of env.records.keys()) {
    if (key !== GROUP_STATE_KEY && !keysBefore.has(key)) {
      assert.fail("se escribió una clave nueva inesperada: " + key);
    }
  }
  assert.equal(env.records.get(PLAYOUT_STATE_KEY), original);
});

test("GET del grupo es público y el POST exige la misma sesión que /api/playout", async () => {
  const env = envFor();
  const open = await onRequestGet({ request: new Request("https://admira.tv/api/playout/group"), env });
  assert.equal(open.status, 200);
  const published = await open.json();
  assert.equal(published.ok, true);
  assert.equal(published.state.shiftMs, 0);

  const denied = await onRequestPost({ request: new Request("https://admira.tv/api/playout/group", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "next" }) }), env });
  assert.equal(denied.status, 401);

  const bad = await onRequestPost({ request: authed("https://admira.tv/api/playout/group", "POST", { action: "mute" }), env });
  assert.equal(bad.status, 400);
});

test("la asignación de /api/playout incluye groupTransport sin reescribir el playout", async () => {
  const env = envFor();
  env.records.set(PLAYOUT_STATE_KEY, JSON.stringify({ configured: true, mode: "synchronized", screens: ["a-screen", "b-screen"], revision: 8, updatedAt: 6 }));
  const before = env.records.get(PLAYOUT_STATE_KEY);
  await onRequestPost({ request: authed("https://admira.tv/api/playout/group", "POST", { action: "pause" }), env });
  const assignment = await (await playoutGet({ request: new Request("https://admira.tv/api/playout?screen=a-screen"), env })).json();
  assert.equal(assignment.mode, "synchronized");
  assert.ok(assignment.groupTransport);
  assert.ok(assignment.groupTransport.pausedAt);
  assert.equal(env.records.get(PLAYOUT_STATE_KEY), before);
  const topology = await playoutPost({ request: authed("https://admira.tv/api/playout", "POST", { mode: "synchronized", screens: ["a-screen", "b-screen"] }), env });
  assert.equal(topology.status, 200);
  const groupStill = JSON.parse(env.records.get(GROUP_STATE_KEY));
  assert.ok(groupStill.pausedAt);
});

test("canal y mando usan el endpoint de grupo en modo sincronizado y no el snap-back local", () => {
  assert.match(canal, /playout-group-math\.js/);
  assert.match(canal, /postGroupTransport/);
  assert.match(canal, /AdmiraPlayoutGroup\.clockMs/);
  assert.match(canal, /\/api\/playout\/group/);
  assert.doesNotMatch(canal, /admira-tv:playout:v1/);
  assert.match(mando, /\/api\/playout\/group/);
  assert.match(mando, /mode===['"]synchronized['"]/);
});
