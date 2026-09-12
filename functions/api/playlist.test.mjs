// node --test functions/api/playlist.test.mjs — vía server-to-server del Stock de Pixeria (Yokup #3183).
import { test } from "node:test";
import assert from "node:assert/strict";
import { onRequestGet, onRequestOptions, onRequestPost } from "./playlist.js";

function kv() {
  const store = new Map();
  return { store, get: async k => store.get(k) ?? null, put: async (k, v) => { store.set(k, v); } };
}
const env = () => ({ ACCESS: kv(), STOCK_NOTIFY_KEY: "clave-del-stock" });
const post = (body, headers = {}) => new Request("https://admira.tv/api/playlist", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://www.pixeria.com", ...headers }, body: JSON.stringify(body) });
const item = { id: "auto-1", url: "https://stock.admira.store/stock/auto-1/asset.webm", type: "video", title: "Mejillón · 2,25 €", seconds: 15, tags: ["catalogo", "alcampo"] };

test("preflight desde pixeria.com recibe CORS; desde otro origen no", async () => {
  const ok = await onRequestOptions({ request: new Request("https://admira.tv/api/playlist", { method: "OPTIONS", headers: { Origin: "https://www.pixeria.com" } }) });
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get("Access-Control-Allow-Origin"), "https://www.pixeria.com");
  assert.match(ok.headers.get("Access-Control-Allow-Headers"), /X-Notify-Key/);
  const no = await onRequestOptions({ request: new Request("https://admira.tv/api/playlist", { method: "OPTIONS", headers: { Origin: "https://evil.example" } }) });
  assert.equal(no.headers.get("Access-Control-Allow-Origin"), null);
});

test("POST con la clave del Stock escribe la playlist y firma updatedBy", async () => {
  const e = env();
  const r = await onRequestPost({ request: post({ screen: "alcampo-esplugues", secret: "clave-del-stock", source: "catalogo alcampo-2026-09-10", name: "Catálogo Alcampo", items: [item] }), env: e });
  assert.equal(r.status, 200);
  const out = await r.json();
  assert.equal(out.ok, true);
  assert.equal(out.draft.items[0].asset, item.url);
  assert.equal(out.draft.items[0].assetType, "video");
  assert.equal(out.draft.items[0].seconds, 15);
  assert.equal(out.draft.name, "Catálogo Alcampo");
  assert.equal(out.draft.updatedBy, "pixeria-stock · catalogo alcampo-2026-09-10");
  assert.equal(r.headers.get("Access-Control-Allow-Origin"), "https://www.pixeria.com");
  assert.ok(e.ACCESS.store.has("admira-tv:playlist:default:v1:alcampo-esplugues"));
  const g = await onRequestGet({ request: new Request("https://admira.tv/api/playlist?screen=alcampo-esplugues", { headers: { Origin: "https://pixeria.com" } }), env: e });
  const d = await g.json();
  assert.equal(d.draft.items.length, 1);
  assert.equal(g.headers.get("Access-Control-Allow-Origin"), "https://pixeria.com");
});

test("clave mala, sin clave o secreto no instalado → 401 y no escribe", async () => {
  for (const [e, body] of [[env(), { screen: "alcampo-salt", secret: "otra", items: [item] }], [env(), { screen: "alcampo-salt", items: [item] }], [{ ACCESS: kv() }, { screen: "alcampo-salt", secret: "clave-del-stock", items: [item] }]]) {
    const r = await onRequestPost({ request: post(body), env: e });
    assert.equal(r.status, 401);
    assert.equal(e.ACCESS.store.size, 0);
  }
  const h = await onRequestPost({ request: post({ screen: "alcampo-salt", items: [item] }, { "X-Notify-Key": "clave-del-stock" }), env: env() });
  assert.equal(h.status, 200);
});
