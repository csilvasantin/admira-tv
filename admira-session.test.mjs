import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("./admira-session.js", import.meta.url), "utf8");
const avatar = await readFile(new URL("./admira-avatar.js", import.meta.url), "utf8");
const cms = await readFile(new URL("./cms.html", import.meta.url), "utf8");
const ctx = { atob, btoa, escape, decodeURIComponent };
ctx.globalThis = ctx;
vm.runInNewContext(source, ctx);
const { payload, valid } = ctx.AdmiraSession;

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj), "utf8").toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const NOW = 1_700_000_000_000;

test("Yokup (2 partes): el payload es la primera y exp va en milisegundos", () => {
  const token = b64url({ email: "a@b.c", exp: NOW + 3600_000 }) + ".sig";
  assert.equal(payload(token).email, "a@b.c");
  assert.equal(valid(token, NOW), true);
  assert.equal(valid(b64url({ email: "a@b.c", exp: NOW - 1 }) + ".sig", NOW), false);
});

test("JWT (3 partes): se lee el payload, no la cabecera", () => {
  const header = b64url({ alg: "HS256", typ: "JWT" });
  const body = b64url({ email: "a@b.c", exp: Math.floor((NOW + 3600_000) / 1000) });
  const token = header + "." + body + ".sig";
  assert.equal(payload(token).email, "a@b.c");
  assert.equal(payload(token).alg, undefined, "no debe devolver la cabecera");
  assert.equal(valid(token, NOW), true);
});

test("un JWT leído como hacía el código viejo (parte 0) no tiene exp", () => {
  const header = b64url({ alg: "HS256", typ: "JWT" });
  const body = b64url({ email: "a@b.c", exp: Math.floor((NOW + 3600_000) / 1000) });
  const token = header + "." + body + ".sig";
  const old = JSON.parse(Buffer.from(token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
  assert.equal(old.exp, undefined);
  assert.equal(valid(token, NOW), true);
});

test("token vacío, sin punto o podrido es inválido", () => {
  assert.equal(valid(""), false);
  assert.equal(valid("nosesion"), false);
  assert.equal(valid("@@@.@@@"), false);
  assert.equal(payload(null), null);
});

test("el avatar usa AdmiraSession.valid y el CMS carga el script antes", () => {
  assert.match(avatar, /AdmiraSession\.valid/);
  assert.doesNotMatch(avatar, /split\("\."\)\[0\]/);
  const sessionAt = cms.indexOf('src="/admira-session.js');
  const avatarAt = cms.indexOf('src="/admira-avatar.js');
  assert.ok(sessionAt >= 0 && avatarAt > sessionAt, "admira-session.js debe ir antes que el avatar");
});
