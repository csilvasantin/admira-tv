/* La verja no puede quedarse colgada ni confundir «no he podido comprobar» con
   «no tienes permiso». Carlos, 12-ago-2026: «volvemos a tener problemas con el
   login, ¿qué está pasando?» — /users se quedaba en ESTABLECIENDO ENLACE 021%
   sin botón, sin motivo y sin salida.

   Dos causas, las dos reales:
   1) El paso de «conectando» a «login» ocurría DENTRO de tickProgress, que se
      llama con requestAnimationFrame. El navegador pausa rAF en pestañas de
      fondo, así que la única vía hacia el botón de entrar dependía de que la
      pestaña estuviera delante y de que Google hubiera cargado. Si cualquiera
      de las dos fallaba, la barra se quedaba clavada para siempre.
   2) serverAccess devolvía `false` ante CUALQUIER fallo —500, corte de red,
      respuesta ilegible— igual que ante un rechazo legítimo. Y el 12-ago se
      había retirado el FALLBACK_OWNERS que amortiguaba eso (commit b89c880),
      así que una caída del API dejaba fuera a todo el mundo sin decir por qué. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const gate = await readFile(new URL("./auth-gate.js", import.meta.url), "utf8");

test("el paso a login va por reloj, no por fotogramas", () => {
  // tickProgress ya sólo PINTA: no puede ser quien decide entrar.
  const tick = gate.slice(gate.indexOf("function tickProgress()"), gate.indexOf("function renderFoot()"));
  assert.doesNotMatch(tick, /phase = "ready"/, "tickProgress no puede cambiar de fase: rAF se pausa en segundo plano");
  assert.match(tick, /requestAnimationFrame\(tickProgress\)/);
  // Y existe un temporizador real que sí lo hace.
  assert.match(gate, /function programaEntrada\(\)/);
  assert.match(gate, /setTimeout\(espera, 120\)/);
  assert.match(gate, /programaEntrada\(\);/);
});

test("hay tope: si Google no llega, se entra igual y se explica", () => {
  assert.match(gate, /var GIS_TIMEOUT_MS = 8000/);
  assert.match(gate, /if \(t >= GIS_TIMEOUT_MS\) return entraEnLogin\(\)/);
  assert.match(gate, /Google tarda en responder/);
  // Y el botón que se menciona existe de verdad, no sólo en el mensaje.
  assert.match(gate, /id="atv-retry"/);
  assert.match(gate, /retry\.addEventListener\("click", function \(\) \{ location\.reload\(\); \}\)/);
  assert.match(gate, /r\.hidden = false/);
});

test("una sola entrada al login, aunque coincidan reloj y carga de Google", () => {
  assert.match(gate, /if \(entradaHecha \|\| phase !== "connecting"\) return;/);
  assert.match(gate, /entradaHecha = true;/);
});

test("«no he podido comprobar» NO es «no tienes permiso»", () => {
  // 401/403 es un rechazo de verdad; cualquier otro fallo es indisponible.
  assert.match(gate, /if \(r\.status === 401 \|\| r\.status === 403\) return \{ estado: "denegado" \}/);
  assert.match(gate, /if \(!r\.ok\) return \{ estado: "indisponible"/);
  assert.match(gate, /catch\(function \(\) \{ return \{ estado: "indisponible", detalle: "sin conexión" \}; \}\)/);
  // Nadie puede volver a colapsar los tres casos en un booleano.
  assert.doesNotMatch(gate, /\.then\(function \(d\) \{ return Boolean\(d && d\.allowed\); \}\)/);
});

test("un fallo del servidor no tira la sesión guardada ni acusa al usuario", () => {
  const bloque = gate.slice(gate.indexOf("serverAccess(saved.cred)"), gate.indexOf("// ===== estado ====="));
  assert.match(bloque, /if \(res\.estado === "permitido"\) return unlock\(\)/);
  // Sólo se borra la sesión cuando el servidor DICE que no.
  assert.match(bloque, /if \(res\.estado === "denegado"\) \{[^}]*removeItem\("admira_tv_gate"\)/);
  assert.match(bloque, /pendienteRevalidar = res\.detalle/);
  // Y nunca se abre la puerta sin haber comprobado.
  assert.doesNotMatch(bloque, /indisponible[\s\S]{0,80}unlock\(\)/);
});

test("al identificarse, un error del servidor se dice tal cual", () => {
  const bloque = gate.slice(gate.indexOf("serverAccess(resp.credential)"));
  assert.match(bloque, /if \(res\.estado === "denegado"\) return reject\(\)/);
  assert.match(bloque, /No se ha podido comprobar tu permiso/);
  assert.match(bloque, /Reintenta/);
});

/* 06-10-2026: «IDENTIFÍCATE PARA CONTINUAR» y debajo «NO SE HA PODIDO COMPROBAR TU
   PERMISO (NO SE PUDO INICIAR EL ACCESO SEGURO)», sin botón de Google. Un solo fallo
   de POST /auth/challenge bastaba para dejar la verja sin botón y sin motivo; y
   «Reintentar» se veía siempre porque .gbtn{display:flex} pisaba el atributo hidden. */
test("el reto de acceso se reintenta y el fallo dice su motivo exacto", () => {
  assert.match(gate, /var CHALLENGE_TRIES = 3;/);
  assert.match(gate, /function pideChallenge\(returnTo, intento\)/);
  assert.match(gate, /pideChallenge\(returnTo, intento \+ 1\)/);
  // HTTP + código del servidor en el mensaje, no un genérico.
  assert.match(gate, /"HTTP " \+ response\.status/);
  assert.match(gate, /pendienteRevalidar = "no se pudo iniciar el acceso seguro · " \+ motivo/);
  // bad_origin no se reintenta: no es un fallo pasajero.
  assert.match(gate, /code !== "bad_origin"/);
  // El reto tiene que traer state y nonce para pintar el botón.
  assert.match(gate, /!challenge\.state \|\| !challenge\.nonce/);
});

test("si el reto llega tarde, el botón aparece y el aviso viejo se limpia", () => {
  const bloque = gate.slice(gate.indexOf("function initGis()"), gate.indexOf("ready(mount);"));
  assert.match(bloque, /if \(phase === "ready"\) \{\s*renderGoogleButton\(\);/);
  assert.match(bloque, /r\.hidden = true/);
});

test("«Reintentar» solo se ve cuando hay algo que reintentar", () => {
  assert.match(gate, /"#admira-tv-gate \[hidden\]\{display:none!important\}"/);
  assert.match(gate, /id="atv-retry" hidden/);
});
