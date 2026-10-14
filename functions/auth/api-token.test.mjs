// /auth/api-token (encargo #5979): token de la API común a partir de la sesión de admira.tv.
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { onRequest, onRequestGet } from "./api-token.js";
import { onRequestPost as verificar } from "./verify.js";

const KEY = "clave-de-prueba-solo-para-este-test";

function env({ key = KEY, sessions = {} } = {}) {
  const store = new Map(Object.entries(sessions).map(([token, record]) => [`admira-tv:auth:session:${token}`, JSON.stringify(record)]));
  return {
    ...(key ? { ADMIRA_TV_API_KEY: key } : {}),
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

test("sin ADMIRA_TV_API_KEY → 503 api-token-unconfigured", async () => {
  const r = await onRequestGet({ request: pedir("c"), env: env({ key: "", sessions: { c: viva("csilvasantin@gmail.com") } }) });
  assert.equal(r.status, 503);
  assert.equal((await r.json()).error, "api-token-unconfigured");
});

test("sesión válida → token con el formato de Pixeria, iss admira.tv, email de la sesión y 15 min", async () => {
  const r = await onRequestGet({ request: pedir("c"), env: env({ sessions: { c: viva("CSilvaSantin@gmail.com ") } }) });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.ok, true);
  const [payload, firma] = d.token.split(".");
  assert.equal(firma, b64url(createHmac("sha256", KEY).update(`api:${payload}`).digest()), "firma HMAC api:<payload>");
  const datos = JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  assert.equal(datos.v, 1);
  assert.equal(datos.aud, "api.admira.store");
  assert.equal(datos.iss, "admira.tv");
  assert.equal(datos.email, "csilvasantin@gmail.com");
  assert.equal(datos.exp - datos.iat, 900);
  assert.equal(d.exp, datos.exp);
});

test("solo GET", async () => {
  assert.equal(onRequest().status, 405);
});

// POST /auth/verify: lo que llama la API común para comprobar un token de admira.tv.
const pedirVerify = (token) => new Request("https://admira.tv/auth/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });

test("/auth/verify acepta un token recién emitido y devuelve su email", async () => {
  const e = env({ sessions: { c: viva("csilvasantin@gmail.com") } });
  const { token, exp } = await (await onRequestGet({ request: pedir("c"), env: e })).json();
  const r = await verificar({ request: pedirVerify(token), env: e });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, email: "csilvasantin@gmail.com", exp });
});

test("/auth/verify rechaza tokens manipulados, de otra clave, sin iss admira.tv o caducados", async () => {
  const e = env({ sessions: { c: viva("csilvasantin@gmail.com") } });
  const { token } = await (await onRequestGet({ request: pedir("c"), env: e })).json();
  const [payload, firma] = token.split(".");
  const otro = JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  const firmar = (obj, clave = KEY) => { const p = b64url(Buffer.from(JSON.stringify(obj))); return p + "." + b64url(createHmac("sha256", clave).update("api:" + p).digest()); };
  const casos = [
    b64url(Buffer.from(JSON.stringify({ ...otro, email: "otro@example.com" }))) + "." + firma,   // payload cambiado
    firmar(otro, "otra-clave"),                                                                // firma de otra clave
    firmar({ ...otro, iss: "admira.studio" }),                                                 // otro emisor
    firmar({ ...otro, iat: otro.iat - 2000, exp: otro.iat - 1000 }),                           // caducado
    "", "basura",
  ];
  for (const t of casos) assert.equal((await verificar({ request: pedirVerify(t), env: e })).status, 401, t.slice(0, 20));
  assert.equal((await verificar({ request: pedirVerify(token), env: env({ key: "" }) })).status, 401, "sin clave no valida nada");
});
