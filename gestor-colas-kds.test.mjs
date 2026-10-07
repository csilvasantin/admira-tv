// Gestor de colas · KDS y cola cerrada (Carlos, 7-oct-2026). admira.tv habla con el relé de ainimation
// (mcp-ainimation.admira.store/cola/*) SOLO desde el servidor: la clave de barra viaja únicamente cuando la
// petición ya pasó sesión Admira o clave de sala (gc_…). Aquí el relé es un fetch simulado que apunta qué recibe.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { onRequest as api } from "./functions/gestorColas/api/[op].js";
import { onRequest as mcp } from "./functions/gestorColas/mcp.js";
import { claveDe, claveBarra, lineasDe } from "./functions/gestorColas/_lib.js";

const SALA = "starbucks-paseo-de-gracia";
const LATTE = { id: "caffe-latte", name: "Caffè Latte", qty: 2, options: { tamano: "venti", leche: "avena", extras: ["shot"] }, optionsText: "Venti · Avena · Shot extra de espresso" };
function releSimulado() {
  const llamadas = [];
  const pedido = { id: "gc-x", numero: "A001", estado: "recibido", nombre: "Ana", creado: "2026-10-07T20:00:00.000Z", pagado: "2026-10-07T20:00:00.000Z" };
  globalThis.fetch = async (url, init = {}) => {
    const h = init.headers || {}; const body = init.body ? JSON.parse(init.body) : null;
    llamadas.push({ url: String(url), metodo: init.method || "GET", clave: h["x-cola-clave"] || null, admin: h["x-cola-admin"] || null, body });
    const detalle = !!h["x-cola-clave"];
    const p = detalle ? { ...pedido, nombre: "Ana María", lineas: [LATTE] } : pedido;
    const d = /\/cola\/estado/.test(url) ? { ok: true, recibido: [p], preparando: [], listo: [], pendientes: 0, acceso: { detalle } } : { ok: true, ...p };
    return { ok: true, status: 200, json: async () => d };
  };
  return llamadas;
}
const env = { COLAS_SEED: "semilla-test", COLA_ADMIN: "servicio-test" };
const ctx = (path, { method = "GET", body, headers = {} } = {}) => {
  const u = new URL("https://admira.tv" + path);
  return { request: new Request(u, { method, headers: { "content-type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined }), env, params: { op: u.pathname.split("/").pop() } };
};

test("lectura pública: el relé no recibe ninguna clave (estado minimizado, sin líneas)", async () => {
  const ll = releSimulado();
  const r = await (await api(ctx(`/gestorColas/api/estado?sala=${SALA}`))).json();
  assert.equal(r.ok, true); assert.equal(r.recibido[0].nombre, "Ana"); assert.equal(r.recibido[0].lineas, undefined);
  assert.equal(ll[0].clave, null); assert.equal(ll[0].admin, null, "la clave de servicio tampoco viaja en lecturas públicas");
});

test("con clave de sala gc_: el servidor pide al relé con su clave de barra y devuelve las líneas; ?publico=1 nunca", async () => {
  const ll = releSimulado(); const gc = await claveDe(env, SALA);
  const r = await (await api(ctx(`/gestorColas/api/estado?sala=${SALA}`, { headers: { "x-clave-sala": gc } }))).json();
  assert.deepEqual(r.recibido[0].lineas, [LATTE]); assert.equal(r.recibido[0].nombre, "Ana María");
  assert.equal(ll[0].clave, gc, "sin COLA_BARRA_KEY usa la gc_ derivada de COLAS_SEED"); assert.equal(ll[0].admin, "servicio-test");
  await api(ctx(`/gestorColas/api/estado?sala=${SALA}&publico=1`, { headers: { "x-clave-sala": gc } }));
  assert.equal(ll[1].clave, null, "la pantalla pública no recibe detalle aunque haya sesión o clave");
  const l = await (await api(ctx(`/gestorColas/api/listar?sala=${SALA}&clave=${gc}`))).json();
  assert.equal(l.detalle, true); assert.deepEqual(l.pedidos[0].lineas, [LATTE]); assert.ok(!ll[2].url.includes("clave"), "la clave no viaja en la URL al relé");
  assert.equal(await claveBarra({ ...env, COLA_BARRA_KEY: "barra-fija" }, SALA), "barra-fija");
});

test("escrituras: sin sesión ni clave → 401 y el relé ni se entera; con clave, avanzar viaja con la clave de barra", async () => {
  const ll = releSimulado(); const gc = await claveDe(env, SALA);
  for (const op of ["crear", "avanzar", "llamar", "reiniciar"]) assert.equal((await api(ctx(`/gestorColas/api/${op}?sala=${SALA}`, { method: "POST", body: { pedido: "A001", confirmar: true } }))).status, 401, op);
  assert.equal(ll.length, 0);
  assert.equal((await api(ctx(`/gestorColas/api/avanzar?sala=${SALA}`, { method: "POST", body: { pedido: "A001", a: "listo" }, headers: { "x-clave-sala": "gc_falsa000000000000000000" } }))).status, 401);
  const r = await (await api(ctx(`/gestorColas/api/avanzar?sala=${SALA}`, { method: "POST", body: { pedido: "A001", a: "listo", clave: gc } }))).json();
  assert.equal(r.ok, true); assert.equal(ll[0].clave, gc); assert.deepEqual(ll[0].body, { numero: "A001", id: "A001", a: "listo" });
});

test("crear «pedido en barra» con líneas: pasan al relé (máx. 10) con clave; el total sigue siendo 0", async () => {
  const ll = releSimulado(); const gc = await claveDe(env, SALA);
  const muchas = Array.from({ length: 14 }, (_, i) => ({ name: "Cookie " + i, qty: 1 }));
  await api(ctx(`/gestorColas/api/crear?sala=${SALA}`, { method: "POST", body: { nombre: "Luis", idem: "toque-123456", lineas: [LATTE, ...muchas], clave: gc } }));
  const alta = ll.find((l) => l.url.includes("/cola/pedido")); assert.equal(alta.clave, gc);
  assert.equal(alta.body.lines.length, 10); assert.deepEqual(alta.body.lines[0], LATTE); assert.equal(alta.body.total, 0); assert.equal(alta.body.clave, undefined);
  assert.ok(ll.find((l) => l.url.includes("/cola/pagar")).clave);
  assert.deepEqual(lineasDe(JSON.stringify([LATTE])), [LATTE]); assert.deepEqual(lineasDe("no-json"), []); assert.deepEqual(lineasDe([null, 3, LATTE]), [LATTE]);
});

test("MCP: cola_crear_pedido admite «lineas»; cola_listar/cola_estado traen líneas solo con clave", async () => {
  const ll = releSimulado(); const gc = await claveDe(env, SALA);
  const rpc = async (method, params) => (await (await mcp(ctx("/gestorColas/mcp", { method: "POST", body: { jsonrpc: "2.0", id: 1, method, params } }))).json()).result;
  const tools = (await rpc("tools/list")).tools; const crear = tools.find((t) => t.name === "cola_crear_pedido");
  assert.equal(crear.inputSchema.properties.lineas.type, "array"); assert.ok(tools.find((t) => t.name === "cola_listar").inputSchema.properties.clave);
  const sin = await rpc("tools/call", { name: "cola_listar", arguments: { sala: SALA } });
  assert.equal(sin.structuredContent.pedidos[0].lineas, undefined); assert.equal(ll.at(-1).clave, null);
  const con = await rpc("tools/call", { name: "cola_listar", arguments: { sala: SALA, clave: gc } });
  assert.deepEqual(con.structuredContent.pedidos[0].lineas, [LATTE]);
  const est = await rpc("tools/call", { name: "cola_estado", arguments: { sala: SALA, clave: gc } }); assert.deepEqual(est.structuredContent.recibido[0].lineas, [LATTE]);
  const nada = await rpc("tools/call", { name: "cola_crear_pedido", arguments: { sala: SALA, lineas: [LATTE] } }); assert.equal(nada.isError, true);
  await rpc("tools/call", { name: "cola_crear_pedido", arguments: { sala: SALA, clave: gc, nombre: "Eva", lineas: [LATTE] } });
  const alta = ll.filter((l) => l.url.includes("/cola/pedido") && l.metodo === "POST").at(-1); assert.deepEqual(alta.body.lines, [LATTE]); assert.equal(alta.body.clave, undefined);
});

test("páginas: el control es un KDS (líneas, espera, botones táctiles) y la pantalla pública pide ?publico=1", () => {
  const ctl = fs.readFileSync("gestorColas/index.html", "utf8"), pan = fs.readFileSync("gestorColas/pantalla/index.html", "utf8");
  assert.match(ctl, /id="kds"/); assert.match(ctl, /data-a="'\+a\+'"/); for (const k of ["bPrep2", "bListo", "bEnt"]) assert.match(ctl, new RegExp(`b\\('[a-z]+','${k}'\\)`));
  assert.match(ctl, /bEnt:'Entregado'/); assert.match(ctl, /bEnt:'Handed over'/); assert.match(ctl, /min-height:60px/);
  assert.match(ctl, /headers:k\?\{'x-clave-sala':k\}/, "la clave de sala también acompaña las lecturas");
  assert.doesNotMatch(ctl, /mcp-ainimation\.admira\.store/, "el navegador nunca llama al relé directamente");
  assert.match(pan, /api\/estado\?sala='\+sala\+'&publico=1/);
});
