/* Creador de incidencias · fallo inyectado «formato girado» (DCL-34d5bbccb9cc227bb752a419).
   Carlos, 14-oct-2026: «un agente que testea todas las incidencias posibles en un player,
   empezando por formato girado: si en el MBP16 el contenido tiene que ser horizontal y se
   muestra en vertical, tiene que abrir una incidencia».

   Se prueba la función REAL extraída del canal contra un DOM de mentira: lo que importa
   es qué pinta (#mupi.style.transform) y qué declara la telemetría (display.painted /
   display.paintedRotation), y que la orden sólo se ejecute dirigida a esta pantalla. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const canal = await readFile(new URL("./canal.html", import.meta.url), "utf8");

function extrae(nombre) {
  const i = canal.indexOf(`function ${nombre}(`);
  assert.notEqual(i, -1, `falta ${nombre}`);
  let j = canal.indexOf("{", i), lv = 0, f = j;
  for (; f < canal.length; f++) {
    if (canal[f] === "{") lv++;
    else if (canal[f] === "}") { lv--; if (!lv) { f++; break; } }
  }
  return canal.slice(i, f);
}

// Del giro del operador al final del bloque del fallo inyectado: el código tal cual.
const inicio = canal.indexOf("const DISPLAY_ROTATION_KEY=");
const fin = canal.indexOf("armFaultExpiry();\n", canal.indexOf("function applyFaultCommand(")) + "armFaultExpiry();".length;
const bloque = canal.slice(inicio, fin);

// Como el navegador: rotate(Ndeg) calculado = matrix(cos, sin, -sin, cos, 0, 0).
function computedTransform(style) {
  const m = /rotate\((-?\d+)deg\)/.exec(style.transform || "");
  if (!m) return "none";
  const r = Number(m[1]) * Math.PI / 180, c = Math.round(Math.cos(r)), s = Math.round(Math.sin(r));
  return `matrix(${c}, ${s}, ${-s}, ${c}, 0, 0)`;
}

function player({ screen = "macbookpro16", ancho = 1728, alto = 1117, almacen = new Map(), ahora = () => Date.now() } = {}) {
  const mupi = { style: {} };
  const posts = [], flashes = [], timers = [];
  const ctx = vm.createContext({
    scr: { screen, circuit: "osx" },
    LS: (k, d) => (almacen.has(k) ? almacen.get(k) : d),
    save: (k, v) => almacen.set(k, v),
    localStorage: { removeItem: (k) => almacen.delete(k) },
    $: (id) => (id === "mupi" ? mupi : null),
    getComputedStyle: (el) => ({ transform: computedTransform(el.style) }),
    screen: { width: ancho, height: alto }, innerWidth: ancho, innerHeight: alto,
    window: { screen: { width: ancho, height: alto } },
    DEVICE_TELEMETRY: { display: {} },
    _nowItem: null, _postNow: (it) => posts.push(it),
    fitMupi: () => {}, flashCli: (msg) => flashes.push(msg),
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout: () => {},
    Date: { now: ahora }, JSON, Math, Number, String, Object,
  });
  vm.runInContext(`${bloque}\n${extrae("cmdScreenSlug")}\nglobalThis.__get=()=>({displayRotation,injectedFault});`, ctx);
  return { ctx, mupi, posts, flashes, timers, almacen, run: (src) => vm.runInContext(src, ctx) };
}

test("las órdenes de laboratorio se reconocen y nada más", () => {
  const { run } = player();
  const parse = (c) => JSON.parse(JSON.stringify(run(`faultCommand(${JSON.stringify(c)})`) ?? null));
  assert.deepEqual(parse("fault-rotate"), { op: "rotate", angle: 90 });
  assert.deepEqual(parse("fault-rotate-270"), { op: "rotate", angle: 270 });
  assert.deepEqual(parse("/FAULT:rotate"), { op: "rotate", angle: 90 });
  assert.deepEqual(parse("fault-clear"), { op: "clear" });
  assert.deepEqual(parse("fault_clear extra"), { op: "clear" });
  for (const no of ["fault-rotate-45", "faultrotate", "rotate-90", "rotation-90", "fault-", "", "standby"]) assert.equal(parse(no), null, no);
});

test("formato girado: pinta 90° y la telemetría declara lo que se pinta, sin marca de prueba", () => {
  const p = player();
  const status = p.run(`applyFaultCommand(faultCommand('fault-rotate'),{screen:'macbookpro16'})`);
  assert.equal(status, "executed");
  assert.equal(p.mupi.style.transform, "rotate(90deg)");
  const display = p.run("DEVICE_TELEMETRY.display");
  assert.equal(display.rotation, 0, "el giro del operador no se toca");
  assert.equal(display.paintedRotation, 90);
  assert.equal(display.painted, "vertical", "panel apaisado + cuarto de vuelta = composición vertical");
  assert.doesNotMatch(JSON.stringify(display), /fault|lab|prueba|inject/i, "nada que el detector pueda leer para hacer trampa");
  const guardado = JSON.parse(p.almacen.get("adtv_fault:macbookpro16"));
  assert.equal(guardado.type, "rotate");
  assert.equal(guardado.until - guardado.at, 30 * 60000, "caduca sola a los 30 min");
  assert.ok(p.timers.some((t) => t.ms > 29 * 60000), "deja armada la caducidad");

  assert.equal(p.run(`applyFaultCommand(faultCommand('fault-clear'),{screen:'macbookpro16'})`), "executed");
  assert.equal(p.mupi.style.transform, "");
  assert.equal(p.run("DEVICE_TELEMETRY.display.painted"), "horizontal");
  assert.equal(p.run("DEVICE_TELEMETRY.display.paintedRotation"), 0);
  assert.equal(p.almacen.has("adtv_fault:macbookpro16"), false);
});

test("se suma al giro del operador y la vuelta devuelve exactamente lo que había", () => {
  const p = player();
  p.run("setDisplayRotation(90)");   // monitor montado en vertical sobre un SO apaisado
  assert.equal(p.mupi.style.transform, "rotate(90deg)");
  assert.equal(p.run("DEVICE_TELEMETRY.display.painted"), "vertical");
  p.run(`applyFaultCommand(faultCommand('fault-rotate'),{screen:'macbookpro16'})`);
  assert.equal(p.mupi.style.transform, "rotate(180deg)");
  assert.equal(p.run("DEVICE_TELEMETRY.display.painted"), "horizontal", "una pantalla vertical que pinta en horizontal también es formato girado");
  assert.equal(p.run("DEVICE_TELEMETRY.display.rotation"), 90);
  p.run(`applyFaultCommand(faultCommand('fault-clear'),{screen:'macbookpro16'})`);
  assert.equal(p.mupi.style.transform, "rotate(90deg)");
  assert.equal(p.run("displayRotation"), 90);
});

test("sólo la orden dirigida a esta pantalla: nunca un broadcast del circuito", () => {
  const p = player();
  assert.equal(p.run(`applyFaultCommand(faultCommand('fault-rotate'),{screen:''})`), "failed");
  assert.equal(p.run(`applyFaultCommand(faultCommand('fault-rotate'),{})`), "failed");
  assert.equal(p.run(`applyFaultCommand(faultCommand('fault-rotate'),{screen:'macmini-starbucks-horizontal'})`), "failed");
  assert.equal(p.mupi.style.transform ?? "", "");
  assert.equal(p.almacen.size, 0);
});

test("un fallo guardado sobrevive a la recarga del player hasta que caduca", () => {
  let ahora = 1_000_000;
  const almacen = new Map([["adtv_fault:macbookpro16", JSON.stringify({ type: "rotate", angle: 90, at: ahora - 60000, until: ahora + 60000 })]]);
  const p = player({ almacen, ahora: () => ahora });
  assert.equal(p.run("effectiveRotation()"), 90, "tras recargar sigue girado");
  ahora += 120000;
  assert.equal(p.run("effectiveRotation()"), 0, "caducado no se pinta");
  // Un registro manipulado con una vida mayor que la permitida no se acepta.
  const larga = new Map([["adtv_fault:macbookpro16", JSON.stringify({ type: "rotate", angle: 90, at: 0, until: 10 * 3600000 })]]);
  assert.equal(player({ almacen: larga, ahora: () => 1000 }).run("effectiveRotation()"), 0);
});

test("la orientación pintada se mide del transform real y del panel físico", () => {
  const { run } = player();
  assert.equal(run("transformAngle('matrix(0, 1, -1, 0, 0, 0)')"), 90);
  assert.equal(run("transformAngle('matrix(0, -1, 1, 0, 0, 0)')"), 270);
  assert.equal(run("transformAngle('matrix(-1, 0, 0, -1, 0, 0)')"), 180);
  assert.equal(run("transformAngle('matrix3d(0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)')"), 90);
  assert.equal(run("transformAngle('none')"), 0);
  assert.equal(run("paintedOrientation(0,1728,1117)"), "horizontal");
  assert.equal(run("paintedOrientation(90,1728,1117)"), "vertical");
  assert.equal(run("paintedOrientation(180,1728,1117)"), "horizontal");
  assert.equal(run("paintedOrientation(0,1117,1728)"), "vertical");
  assert.equal(run("paintedOrientation(270,1117,1728)"), "horizontal");
});

test("cableado: la cola del mando, la telemetría y el encuadre usan el giro efectivo", () => {
  const cola = extrae("executeQueuedCommand");
  assert.match(cola, /const fault=faultCommand\(raw\);\n\s*if\(fault\) return applyFaultCommand\(fault,c\);/);
  assert.ok(cola.indexOf("faultCommand(raw)") < cola.indexOf("runCli(raw)"), "antes del runCli de reserva (que daría un ACK falso)");
  const base = extrae("deviceTelemetryBase");
  assert.match(base, /rotation:displayRotation, fit:\(typeof displayFit==='string'\?displayFit:'editorial'\), \.\.\.measuredPaint\(\) \}/);
  assert.doesNotMatch(base, /injectedFault|FAULT_|faultRotation/, "la telemetría no lleva marca de prueba");
  assert.match(extrae("fitMupi"), /typeof effectiveRotation==='function'\?effectiveRotation\(\)/);
  // fault-* no entra por la cola de /control (whitelist del mando) ni por la CLI local.
  assert.doesNotMatch(extrae("applyCtrlCmd"), /fault-|faultCommand|applyFaultCommand/);
  assert.doesNotMatch(extrae("runCli"), /fault-rotate|applyFaultCommand/);
});

test("el giro animado se vuelve a medir al terminar la transición y se publica si cambió", () => {
  const p = player();
  // Como en Chrome con `transition: transform .35s`: justo al cambiar, el calculado aún es el de antes.
  let enTransicion = true;
  p.ctx.getComputedStyle = (el) => ({ transform: enTransicion ? "none" : computedTransform(el.style) });
  p.run("_nowItem={id:'x'}");
  p.run(`applyFaultCommand(faultCommand('fault-rotate'),{screen:'macbookpro16'})`);
  assert.equal(p.run("DEVICE_TELEMETRY.display.painted"), "horizontal", "medida en mitad de la transición");
  const remedida = p.timers.filter((t) => t.ms === 450).at(-1);
  assert.ok(remedida, "queda programada la nueva medida");
  enTransicion = false;
  const antes = p.posts.length;
  remedida.fn();
  assert.equal(p.run("DEVICE_TELEMETRY.display.painted"), "vertical");
  assert.equal(p.run("DEVICE_TELEMETRY.display.paintedRotation"), 90);
  assert.equal(p.posts.length, antes + 1, "y se publica al momento");
  remedida.fn();
  assert.equal(p.posts.length, antes + 1, "sin cambio no vuelve a publicar");
});
