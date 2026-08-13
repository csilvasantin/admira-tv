import test from "node:test";
import assert from "node:assert/strict";
import { onRequestGet, onRequestPost } from "./functions/api/playlist.js";

const sessionToken = "session-token";
const sessionKey = `admira-tv:auth:session:${sessionToken}`;
function envWith(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { env: { ACCESS: { get: async key => data.get(key) || null, put: async (key, value) => data.set(key, value) } }, data };
}
const request = (url, options = {}) => new Request(url, options);
const cookie = { Cookie: `__Host-atv_session=${sessionToken}` };

test("la playlist vacía de un player se puede leer sin login", async () => {
  const { env } = envWith();
  const response = await onRequestGet({ request: request("https://admira.tv/api/playlist?screen=macbookpro16"), env });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(body.draft.items, []);
  assert.equal(body.draft.name, "Por defecto");
});

test("la escritura exige sesión first-party y conserva una pieza reproducible", async () => {
  const { env, data } = envWith({ [sessionKey]: JSON.stringify({ email: "csilvasantin@gmail.com", expiresAt: Date.now() + 60000 }) });
  const payload = { screen: "macbookpro16", items: [{ id: "stock-matrix", stockId: "matrix", title: "Matrix extendido", asset: "https://cdn.example/matrix.mp4", assetType: "video", seconds: 40, tags: ["matrix"] }] };
  const denied = await onRequestPost({ request: request("https://admira.tv/api/playlist", { method: "POST", body: JSON.stringify(payload) }), env });
  assert.equal(denied.status, 401);
  const response = await onRequestPost({ request: request("https://admira.tv/api/playlist", { method: "POST", headers: { ...cookie, "Content-Type": "application/json" }, body: JSON.stringify(payload) }), env });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.draft.items[0].assetType, "video");
  assert.equal(body.draft.items[0].title, "Matrix extendido");
  assert.ok(data.has("admira-tv:playlist:default:v1:macbookpro16"));
});

test("rechaza URLs no HTTPS y revisiones que pisan a otro editor", async () => {
  const { env } = envWith({ [sessionKey]: JSON.stringify({ email: "csilvasantin@gmail.com", expiresAt: Date.now() + 60000 }) });
  const headers = { ...cookie, "Content-Type": "application/json" };
  const bad = await onRequestPost({ request: request("https://admira.tv/api/playlist", { method: "POST", headers, body: JSON.stringify({ screen: "macbookpro16", items: [{ id: "x", asset: "http://inseguro.test/x.mp4" }] }) }), env });
  assert.equal(bad.status, 400);
  const first = await onRequestPost({ request: request("https://admira.tv/api/playlist", { method: "POST", headers, body: JSON.stringify({ screen: "macbookpro16", items: [] }) }), env });
  assert.equal(first.status, 200);
  const conflict = await onRequestPost({ request: request("https://admira.tv/api/playlist", { method: "POST", headers, body: JSON.stringify({ screen: "macbookpro16", items: [], rev: 1 }) }), env });
  assert.equal(conflict.status, 409);
});
