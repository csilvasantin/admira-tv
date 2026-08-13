import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { onRequestPost as challenge } from "./functions/auth/challenge.js";
import { onRequestPost as callback } from "./functions/auth/callback.js";
import { onRequestGet as session } from "./functions/auth/session.js";

class MemoryKV {
  constructor(seed = {}) { this.data = new Map(Object.entries(seed)); }
  async get(key) { return this.data.get(key) ?? null; }
  async put(key, value) { this.data.set(key, String(value)); }
  async delete(key) { this.data.delete(key); }
}

const CLIENT_ID = "861856772040-e1ri6kpu6maagtb6crdfbb923hsaalgb.apps.googleusercontent.com";

function cookieValue(setCookie, name) {
  const match = new RegExp(`${name}=([^;,]+)`).exec(setCookie || "");
  return match && match[1];
}

async function issue(kv, returnTo = "/cms") {
  const response = await challenge({
    env: { ACCESS: kv },
    request: new Request("https://admira.tv/auth/challenge", {
      method: "POST", headers: { Origin: "https://admira.tv", "Content-Type": "application/json" },
      body: JSON.stringify({ flow: "redirect", return_to: returnTo }),
    }),
  });
  return { response, body: await response.json() };
}

function googlePost(body, cookies) {
  return new Request("https://admira.tv/auth/callback", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookies },
    body: new URLSearchParams(body),
  });
}

test("el gate usa redirect top-level sin popup ni FedCM", async () => {
  const source = await readFile(new URL("./auth-gate.js", import.meta.url), "utf8");
  assert.match(source, /ux_mode:\s*"redirect"/);
  assert.match(source, /login_uri:\s*LOGIN_URI/);
  assert.match(source, /state_cookie_domain:\s*"admira\.tv"/);
  assert.match(source, /use_fedcm_for_button:\s*false/);
  assert.doesNotMatch(source, /callback:\s*onCredential/);
  assert.doesNotMatch(source, /google\.accounts\.id\.prompt\(/);
  assert.match(source, /\/auth\/session\?project=/);
});

test("todas las páginas protegidas versionan el gate para no resucitar el popup antiguo", async () => {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const index = await readFile(new URL("./index.html", import.meta.url), "utf8");
  const version = index.match(/admiranext-version" content="([^"]+)/)?.[1];
  assert.ok(version, "index.html debe declarar la versión canónica");
  const cacheKey = version.replace(/^v\./, "").replaceAll(":", "");
  const { stdout } = await promisify(execFile)("rg", ["-l", "/auth-gate\\.js", "--glob", "*.html", "."]);
  const pages = stdout.trim().split("\n").filter(Boolean);
  assert.ok(pages.length >= 40);
  for (const page of pages) {
    const html = await readFile(new URL(page, import.meta.url), "utf8");
    assert.doesNotMatch(html, /\/auth-gate\.js(?=["'])/, page);
    assert.ok(html.includes(`/auth-gate.js?v=${cacheKey}`), page);
  }
});

test("challenge fija nonce, retorno interno y cookie HttpOnly apta para el POST de Google", async () => {
  const kv = new MemoryKV();
  const { response, body } = await issue(kv, "//evil.example/robo");
  assert.equal(response.status, 200);
  assert.equal(body.login_uri, "https://admira.tv/auth/callback");
  assert.ok(body.state && body.nonce);
  assert.match(response.headers.get("set-cookie"), /__Host-atv_challenge=.*HttpOnly; Secure; SameSite=None/);
  const record = JSON.parse(await kv.get(`admira-tv:auth:challenge:${body.state}`));
  assert.equal(record.returnPath, "/");
});

test("callback valida doble CSRF + nonce, crea sesión first-party y conserva el retorno", async () => {
  const kv = new MemoryKV();
  const { response: issued, body } = await issue(kv, "/cms?canal=kiosk");
  const challengeCookie = cookieValue(issued.headers.get("set-cookie"), "__Host-atv_challenge");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "https://oauth2.googleapis.com/tokeninfo");
    assert.match(String(init.body), /id_token=fake/);
    return Response.json({
      iss: "https://accounts.google.com", aud: CLIENT_ID, sub: "google-1",
      email: "csilva@admira.com", email_verified: "true", name: "Carlos",
      nonce: body.nonce, iat: String(Math.floor(Date.now() / 1000) - 5), exp: String(Math.floor(Date.now() / 1000) + 3600),
    });
  };
  try {
    const request = googlePost({ credential: "fake", g_csrf_token: "csrf", state: body.state }, `__Host-atv_challenge=${challengeCookie}; g_csrf_token=csrf`);
    const completed = await callback({ request, env: { ACCESS: kv } });
    assert.equal(completed.status, 303);
    assert.equal(completed.headers.get("location"), "https://admira.tv/cms?canal=kiosk");
    const setCookie = completed.headers.get("set-cookie");
    assert.match(setCookie, /__Host-atv_session=.*HttpOnly; Secure; SameSite=Lax/);
    const token = cookieValue(setCookie, "__Host-atv_session");
    const probe = await session({
      env: { ACCESS: kv },
      request: new Request("https://admira.tv/auth/session?project=digitalsignage-cms", { headers: { Cookie: `__Host-atv_session=${token}` } }),
    });
    assert.equal(probe.status, 200);
    assert.equal((await probe.json()).actor, "csilva@admira.com");

    const replay = await callback({ request: googlePost({ credential: "fake", g_csrf_token: "csrf", state: body.state }, `__Host-atv_challenge=${challengeCookie}; g_csrf_token=csrf`), env: { ACCESS: kv } });
    assert.equal(replay.status, 403);
  } finally { globalThis.fetch = originalFetch; }
});

test("un CSRF distinto no consume ni abre sesión", async () => {
  const kv = new MemoryKV();
  const { response: issued, body } = await issue(kv);
  const stateCookie = cookieValue(issued.headers.get("set-cookie"), "__Host-atv_challenge");
  const denied = await callback({
    env: { ACCESS: kv },
    request: googlePost({ credential: "fake", g_csrf_token: "otro", state: body.state }, `__Host-atv_challenge=${stateCookie}; g_csrf_token=csrf`),
  });
  assert.equal(denied.status, 403);
  assert.doesNotMatch(denied.headers.get("set-cookie") || "", /__Host-atv_session=/);
});
