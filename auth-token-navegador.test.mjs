// Token de Google al navegador tras el acceso por redirección (9-oct-2026). /auth/callback lo deja en el fragmento de la
// vuelta (#admira_gcred=…) y auth-gate.js lo recoge, lo guarda en localStorage (admira_tv_gate.cred) y lo BORRA de la
// dirección antes que ningún otro script. Así AdmiraTvAuth.authorization() vuelve a ofrecerlo a brain (/remotecontrol/).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const leer = p => readFileSync(new URL(p, import.meta.url), "utf8");
const gate = leer("./auth-gate.js");
const callback = leer("./functions/auth/callback.js");

// Un JWT de prueba (sin firma válida: el navegador sólo lee la carga útil).
const b64url = o => Buffer.from(JSON.stringify(o)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const jwt = payload => `${b64url({ alg: "RS256" })}.${b64url(payload)}.firma`;

function ejecutar(hash, { search = "", pathname = "/remotecontrol/" } = {}) {
  const inicio = gate.indexOf("(function tomarCredencialDeVuelta()");
  const fin = gate.indexOf("})();", inicio) + "})();".length;
  assert.ok(inicio > 0 && fin > inicio, "el gate tiene tomarCredencialDeVuelta");
  const guardado = {}, direcciones = [];
  const location = { hash, search, pathname };
  const ctx = {
    location,
    history: { state: null, replaceState(_s, _t, url) { direcciones.push(url); const i = url.indexOf("#"); location.hash = i >= 0 ? url.slice(i) : ""; } },
    localStorage: { setItem(k, v) { guardado[k] = v; } },
    atob: s => Buffer.from(s, "base64").toString("binary"),
    norm: e => String(e).toLowerCase().trim(),
    Date, JSON, decodeURIComponent, String,
  };
  vm.runInNewContext(gate.slice(inicio, fin), ctx);
  return { guardado, direcciones, location };
}

test("callback deja el token en el fragmento de la vuelta, no en la ruta ni en la consulta", () => {
  assert.match(callback, /"admira_gcred=" \+ encodeURIComponent\(String\(form\.credential/);
  assert.match(callback, /returnPath\.includes\("#"\) \? "&" : "#"/);
  assert.match(callback, /Location: PUBLIC_ORIGIN \+ vuelta/);
});

test("el gate recoge el token, lo guarda y lo borra de la dirección", () => {
  const cred = jwt({ email: "Carlos@Example.com", email_verified: true, exp: 9999999999 });
  const r = ejecutar("#admira_gcred=" + encodeURIComponent(cred), { search: "?x=1" });
  assert.deepEqual(r.direcciones, ["/remotecontrol/?x=1"], "la dirección queda sin fragmento");
  const s = JSON.parse(r.guardado.admira_tv_gate);
  assert.equal(s.cred, cred);
  assert.equal(s.email, "carlos@example.com");
  assert.equal(s.via, "callback");
  assert.ok(s.exp > Date.now());
});

test("conserva el resto del fragmento de la página y sólo quita el suyo", () => {
  const cred = jwt({ email: "a@b.c", email_verified: true });
  assert.deepEqual(ejecutar("#seccion&admira_gcred=" + cred).direcciones, ["/remotecontrol/#seccion"]);
  assert.deepEqual(ejecutar("#admira_gcred=" + cred + "&tab=2").direcciones, ["/remotecontrol/#tab=2"]);
});

test("sin token en el fragmento no toca nada; un token ilegible se borra igual y no se guarda", () => {
  const nada = ejecutar("#seccion");
  assert.deepEqual([nada.direcciones, nada.guardado], [[], {}]);
  const roto = ejecutar("#admira_gcred=esto-no-es-un-jwt");
  assert.deepEqual(roto.direcciones, ["/remotecontrol/"], "se borra de la dirección aunque no valga");
  assert.deepEqual(roto.guardado, {}, "y no se guarda");
  const sinVerificar = ejecutar("#admira_gcred=" + jwt({ email: "a@b.c", email_verified: false }));
  assert.deepEqual(sinVerificar.guardado, {}, "un email sin verificar no se guarda");
});

test("se recoge antes de que la página se oculte o cargue nada más", () => {
  const recoge = gate.indexOf("tomarCredencialDeVuelta");
  assert.ok(recoge > 0 && recoge < gate.indexOf('classList.add("gate-locked")'), "va antes de bloquear la página");
  assert.ok(recoge < gate.indexOf("accounts.google.com/gsi/client"), "y antes de cargar el cliente de Google");
});
