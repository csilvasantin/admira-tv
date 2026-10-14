// /auth/api-token (encargo #5979): token de la API común a partir de la sesión de admira.tv.
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { onRequest, onRequestGet } from "./api-token.js";

const KEY = "clave-de-prueba-solo-para-este-test";

function env({ key = KEY, sessions = {} } = {}) {
  const store = new Map(Object.entries(sessions).map(([token, record]) => [`admira-tv:auth:session:${token}`, JSON.stringify(record)]));
  return {
    ...(key ? { PIXERIA_SIGNING_KEY: key } : {}),
    ACCESS: { get: async (k) => store.get(k) || null, put: async () => {}, delete: async () => {} },
  };
}
const viva = (email, extra = {}) => ({ email, name: "", sub: "s", expiresAt: Date.now() + 60_000, ...extra });
const pedir = (cookie) => new Request("https://admira.tv/auth/api-token", { headers: cookie ? { Cookie: `__Host-atv_session=${cookie}` } : {} });
const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

test("sin sesión → 401 y sin token", async () => {
  const r = await onRequestGet({ request: pedir(), env: env() });
  assert.equal(r.status, 401);
  assert.equal((await r.json()).token, undefined);
  assert.match(r.headers.get("Cache-Control"), /no-store/);
});

test("sesión de solo lectura → 403", async () => {
  const r = await onRequestGet({ request: pedir("lec"), env: env({ sessions: { lec: viva("lectura@merovingio.box", { lectura: true }) } }) });
  assert.equal(r.status, 403);
});

test("usuario sin acceso a admira.tv → 403", async () => {
  const r = await onRequestGet({ request: pedir("x"), env: env({ sessions: { x: viva("alguien@example.com") } }) });
  assert.equal(r.status, 403);
});

test("sin PIXERIA_SIGNING_KEY → 503 api-token-unconfigured", async () => {
  const r = await onRequestGet({ request: pedir("c"), env: env({ key: "", sessions: { c: viva("csilvasantin@gmail.com") } }) });
  assert.equal(r.status, 503);
  assert.equal((await r.json()).error, "api-token-unconfigured");
});

test("sesión válida → token con el formato de Pixeria que verifica la API (aud, v, email de la sesión, 15 min)", async () => {
  const r = await onRequestGet({ request: pedir("c"), env: env({ sessions: { c: viva("CSilvaSantin@gmail.com ") } }) });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.ok, true);
  const [payload, firma] = d.token.split(".");
  assert.equal(firma, b64url(createHmac("sha256", KEY).update(`api:${payload}`).digest()), "firma HMAC api:<payload>");
  const datos = JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  assert.equal(datos.v, 1);
  assert.equal(datos.aud, "api.admira.store");
  assert.equal(datos.email, "csilvasantin@gmail.com");
  assert.equal(datos.exp - datos.iat, 900);
  assert.equal(d.exp, datos.exp);
});

test("solo GET", async () => {
  assert.equal(onRequest().status, 405);
});
