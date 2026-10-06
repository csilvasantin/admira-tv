/* 06-10-2026: con la cookie visor (enlace de solo lectura #5261) el middleware
   devolvía 403 solo_lectura a POST /auth/challenge y la verja de admira.tv/apps/
   se quedaba sin botón de Google. El circuito de identificación queda fuera del
   guarda; cualquier otra escritura sigue bloqueada. */
import test from "node:test";
import assert from "node:assert/strict";
import { onRequest, AUTH_FLOW } from "./functions/_middleware.js";

class MemoryKV {
  constructor(seed = {}) { this.data = new Map(Object.entries(seed)); }
  async get(key) { return this.data.get(key) ?? null; }
  async put(key, value) { this.data.set(key, String(value)); }
  async delete(key) { this.data.delete(key); }
}
const TOKEN = "visor-token-0123456789abcdef";
const env = () => new MemoryKV({ ["admira-tv:auth:session:" + TOKEN]: JSON.stringify({ email: "lectura@merovingio.box", lectura: true, sid: "a".repeat(64), expiresAt: Date.now() + 3600e3 }) });
const req = (path, method = "POST") => new Request("https://admira.tv" + path, { method, headers: { Cookie: "__Host-atv_session=" + TOKEN, Origin: "https://admira.tv", "Content-Type": "application/json" }, body: method === "GET" ? undefined : "{}" });
const run = async (path, method) => {
  let passed = false;
  const res = await onRequest({ request: req(path, method), env: { ACCESS: env() }, next: async () => { passed = true; return new Response("ok"); } });
  return { passed, status: res.status, body: passed ? null : await res.json() };
};

test("con la sesión visor se puede iniciar el acceso con Google y cerrar sesión", async () => {
  assert.deepEqual([...AUTH_FLOW].sort(), ["/auth/callback", "/auth/challenge", "/auth/logout"]);
  for (const path of AUTH_FLOW) assert.equal((await run(path)).passed, true, path);
});

test("cualquier otra escritura con la sesión visor sigue respondiendo 403 solo_lectura", async () => {
  for (const path of ["/api/playlist", "/users/api/users", "/accesscontrol/api/doc", "/auth/challenge/x", "/auth/lectura"]) {
    const r = await run(path);
    assert.equal(r.passed, false, path);
    assert.equal(r.status, 403, path);
    assert.equal(r.body.error, "solo_lectura", path);
  }
  assert.equal((await run("/apps/", "GET")).passed, true, "leer sigue permitido");
});
