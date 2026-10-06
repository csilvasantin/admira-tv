import { test } from "node:test";
import assert from "node:assert/strict";
import { onRequestPost } from "./api/playlist.js";
import { onRequestGet } from "./auth/session.js";
import { createLecturaSession, sessionCookie } from "./_auth-session.js";

function kv() {
  const store = new Map();
  return { store, get: async k => store.get(k) ?? null, put: async (k, v) => { store.set(k, v); } };
}

test("la sesión visor abre playlists y un POST de playlist responde 403", async () => {
  const env = { ACCESS: kv(), STOCK_NOTIFY_KEY: "clave-del-stock" };
  const sid = "cd".repeat(32);
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = await createLecturaSession(env, { sid, exp });
  const cookie = sessionCookie(token).split(";")[0];
  const fetchImpl = async (url) => {
    if (String(url).includes("/api/lectura/sesion")) return { ok: true, json: async () => ({ ok: true, site: "tv", role: "viewer" }) };
    if (String(url).includes("/api/lectura/reconocer")) return { ok: true, json: async () => ({ lectura: true }) };
    throw new Error("red");
  };
  const original = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    const allowed = await onRequestGet({
      request: new Request("https://www.admira.tv/auth/session?project=digitalsignage-playlists", { headers: { Cookie: cookie } }),
      env,
    });
    assert.equal(allowed.status, 200);
    assert.equal((await allowed.json()).role, "viewer");
    const manage = await onRequestGet({
      request: new Request("https://www.admira.tv/auth/session?project=admira-tv&manage=1", { headers: { Cookie: cookie } }),
      env,
    });
    assert.equal(manage.status, 403);
    const post = await onRequestPost({
      request: new Request("https://www.admira.tv/api/playlist", {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json", Origin: "https://www.pixeria.com" },
        body: JSON.stringify({ screen: "365-demo", secret: "clave-del-stock", items: [] }),
      }),
      env,
    });
    assert.equal(post.status, 403);
    assert.equal(env.ACCESS.store.size, 1);
  } finally {
    globalThis.fetch = original;
  }
});
