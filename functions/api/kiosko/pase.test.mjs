// node --test functions/api/kiosko/pase.test.mjs — elemento URL con bloqueo (20-nov-2026): la playlist guarda la URL
// sin token y el canal canjea un pase de kiosco de un solo uso solo para piezas de SU playlist publicada.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { onRequestPost as escribir } from "../playlist.js";
import { onRequestPost as pedirPase } from "./pase.js";
import { rutaKioskoDe, elementoConKiosko } from "../../_kiosko-pase.js";
import { assetTypeOf } from "../_asset-type.js";

function kv() { const store = new Map(); return { store, get: async k => store.get(k) ?? null, put: async (k, v) => { store.set(k, v); } }; }
const SSO = "s".repeat(64);
const env = () => ({ ACCESS: kv(), STOCK_NOTIFY_KEY: "clave-del-stock", ADMIRA_SSO_SECRET: SSO });
const enc = new TextEncoder();
async function hmac(k, m) { const key = await crypto.subtle.importKey("raw", enc.encode(k), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return Buffer.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(m)))).toString("base64url"); }
const demo = [{ id: "analytics", type: "url", src: "https://www.admiranext.com/analytics", duration: 60, auth: "admiranext", title: "AdmiraNeXT · Analytics" },
  { id: "portada", type: "web", url: "https://www.admiranext.com/", seconds: 20 }];
async function montar(e) {
  const r = await escribir({ request: new Request("https://admira.tv/api/playlist", { method: "POST", headers: { "Content-Type": "application/json", "X-Notify-Key": "clave-del-stock" },
    body: JSON.stringify({ screen: "demo-url", name: "Demo URL", items: demo }) }), env: e });
  assert.equal(r.status, 200);
  return (await r.json()).draft.items;
}
const pide = (e, body, headers = {}) => pedirPase({ request: new Request("https://www.admira.tv/api/kiosko/pase", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) }), env: e });

test("type url/web se guarda como pieza iframe con src, duration y auth, sin token", async () => {
  assert.equal(assetTypeOf("url"), "interactive");
  assert.equal(assetTypeOf("web"), "interactive");
  const items = await montar(env());
  assert.equal(items[0].assetType, "interactive");
  assert.equal(items[0].asset, "https://www.admiranext.com/analytics");
  assert.equal(items[0].seconds, 60);
  assert.equal(items[0].auth, "admiranext");
  assert.equal(items[0].kind, "url");
  assert.equal(items[1].auth, undefined);
  assert.ok(!JSON.stringify(items).match(/pase|kiosko=|token/i));
});

test("el canal recibe la dirección de canje con un pase firmado de kiosco para su pieza", async () => {
  const e = env(); await montar(e);
  const r = await pide(e, { screen: "demo-url", item: "analytics", url: "https://www.admiranext.com/analytics" }, { Origin: "https://www.admira.tv" });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("Cache-Control").includes("no-store"), true);
  const d = await r.json();
  assert.match(d.src, /^https:\/\/www\.admiranext\.com\/kiosko\/entrar\?pase=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  const [payload, firma] = d.src.split("pase=")[1].split(".");
  assert.equal(firma, await hmac(SSO, payload));
  const c = JSON.parse(Buffer.from(payload, "base64url").toString());
  assert.deepEqual([c.iss, c.aud, c.origen, c.email, c.screen, c.ruta, c.exp - c.iat], ["admira.tv", "admiranext.com", "kiosko", "", "demo-url", "/analytics", 120]);
  assert.match(c.nonce, /^[0-9a-f]{16}$/);
});

test("sin pieza en la playlist, otra pantalla, otro origen o sin secreto: no hay pase", async () => {
  const e = env(); await montar(e);
  assert.equal((await pide(e, { screen: "planeta7-tcl-hotel-creel", item: "analytics" })).status, 404);
  assert.equal((await pide(e, { screen: "demo-url", item: "portada" })).status, 404, "la portada es pública: fuera de las rutas de kiosco");
  assert.equal((await pide(e, { screen: "demo-url", url: "https://www.admiranext.com/usuarios" })).status, 404);
  assert.equal((await pide(e, { screen: "demo-url", item: "analytics" }, { Origin: "https://evil.example" })).status, 403);
  assert.equal((await pide(e, { screen: "demo-url", item: "analytics" }, { "Sec-Fetch-Site": "cross-site" })).status, 403);
  const sin = env(); await montar(sin); delete sin.ADMIRA_SSO_SECRET;
  assert.equal((await pide(sin, { screen: "demo-url", item: "analytics" })).status, 503);
  assert.equal((await pide(e, { screen: "../x", item: "analytics" })).status, 400);
});

test("rutas de kiosco: solo https de admiranext.com y /analytics", () => {
  assert.equal(rutaKioskoDe("https://www.admiranext.com/analytics/"), "/analytics");
  assert.equal(rutaKioskoDe("https://admiranext.com/analytics/index.html"), "/analytics");
  for (const u of ["http://www.admiranext.com/analytics", "https://evil.com/analytics", "https://u:p@www.admiranext.com/analytics", "https://www.admiranext.com/usuarios"]) assert.equal(rutaKioskoDe(u), "", u);
  assert.equal(elementoConKiosko([{ id: "a", asset: "https://www.admiranext.com/analytics", auth: "none" }], { item: "a" }), null);
});

test("canal.html: la pieza URL protegida pide pase y nunca lleva token propio", () => {
  const html = readFileSync(new URL("../../../canal.html", import.meta.url), "utf8");
  assert.match(html, /function kioskoNecesario\(it\)/);
  assert.match(html, /fetch\('\/api\/kiosko\/pase',\{method:'POST'/);
  assert.match(html, /if\(kioskoNecesario\(it\)\)\{/);
  assert.match(html, /_srcId:String\(it\.id\|\|it\.stockId\|\|''\),auth:String\(it\.auth\|\|''\)/);
});
