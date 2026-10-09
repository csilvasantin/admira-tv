// Bucle de recarga sin sesión (9-oct-2026): /users/ llamaba a su API antes de que la verja dejara pasar; el 401
// recargaba la página y la verja volvía a empezar sin pintar el botón de Google (11 recargas en 10 s en /users/,
// 155 en 8 s en /remotecontrol/). Las páginas esperan a AdmiraTvAuth.ready() y, ante un 401, usan
// AdmiraTvAuth.expired(), que recarga como mucho una vez por minuto.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const leer = p => readFileSync(new URL(p, import.meta.url), "utf8");

test("auth-gate.js expone ready() (espera a que se quite gate-locked) y expired() (una recarga por minuto)", () => {
  const g = leer("./auth-gate.js");
  assert.match(g, /ready: function \(\)/);
  assert.match(g, /classList\.contains\("gate-locked"\)/);
  assert.match(g, /new MutationObserver/);
  assert.match(g, /expired: function \(\)/);
  assert.match(g, /admira_tv_gate_401/);
  assert.match(g, /now - prev < 60000/);
});

for (const pagina of ["./users/index.html", "./remotecontrol/index.html"]) {
  test(`${pagina}: no llama a la API antes de entrar ni recarga en bucle ante un 401`, () => {
    const html = leer(pagina);
    assert.match(html, /AdmiraTvAuth\.ready\(\)/, "arranca tras AdmiraTvAuth.ready()");
    assert.match(html, /\.expired\(\)/, "un 401 pasa por AdmiraTvAuth.expired()");
    // El botón «Salir» sí borra y recarga (lo pide la persona); lo que no puede es hacerlo la respuesta 401.
    assert.doesNotMatch(html, /status\s*===\s*401\)\s*\{[^}]*location\.reload\(\)/, "un 401 no recarga por su cuenta");
    assert.doesNotMatch(html, /setTimeout\(load,\s*\d+\)/, "sin reintento a ciegas de la carga sin sesión");
  });
}
