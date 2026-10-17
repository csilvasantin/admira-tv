/* Bugito · fallos de superficie del banco de pruebas (DCL-5da4653d859552490fd5ae1d).
   Carlos, 14-oct-2026: «le diremos que genere incidencias en el player (cambio de resolución de
   vertical a horizontal, emisión de popups encima del contenido, pantallas a medio abrir, etc.)».

   Como canal-fault-rotate.test.mjs: se ejecuta el código REAL del canal contra un DOM de mentira.
   Lo que importa es qué pinta (popup, clase del marco, tamaño del lienzo) y qué MIDE y declara la
   telemetría (display.canvas, display.visible, display.overlay), sin marca de prueba. */
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

const inicio = canal.indexOf("const DISPLAY_ROTATION_KEY=");
const fin = canal.indexOf("armSurfaceExpiry(); paintSurfaceFaults();\n") + "armSurfaceExpiry(); paintSurfaceFaults();".length;
assert.ok(inicio > 0 && fin > inicio, "bloque del fallo inyectado");
const bloque = canal.slice(inicio, fin);

// ── Un DOM mínimo con geometría: rectángulos fijos por elemento y hit-testing por capas ──
function rect(l, t, w, h) { return { left: l, top: t, right: l + w, bottom: t + h, width: w, height: h }; }
function dom({ ancho = 1600, alto = 900, completa = true } = {}) {
  const nodos = new Map();
  const el = (id, r, padre = null) => {
    const n = { id, padre, r, style: {}, hijos: [], clases: new Set(), tagName: 'DIV',
      get offsetWidth() { return n.r.width; }, get offsetHeight() { return n.r.height; },
      classList: { toggle(c, on) { on ? n.clases.add(c) : n.clases.delete(c); }, contains: (c) => n.clases.has(c) },
      getBoundingClientRect: () => n.r, contains(o) { for (let x = o; x; x = x.padre) if (x === n) return true; return false; },
      setAttribute() {}, remove() { nodos.delete(n.id); body.hijos = body.hijos.filter((h) => h !== n); }, innerHTML: "" };
    nodos.set(id, n); return n;
  };
  const root = el("html", rect(0, 0, ancho, alto)), body = el("body", rect(0, 0, ancho, alto), root);
  root.classList = { contains: (c) => c === "screen-fit" && completa, toggle() {}, add() {} };
  Object.defineProperty(body, "children", { get: () => [wrap, ...body.hijos] });
  const wrap = el("wrap", rect(0, 0, ancho, alto), body), mupi = el("mupi", rect(0, 0, ancho, alto), wrap), stage = el("stage", rect(0, 0, ancho, alto), mupi);
  mupi.style.width = `${ancho}px`; mupi.style.height = `${alto}px`;   // lo que deja fitMupi a pantalla completa
  const document = {
    documentElement: root, body,
    getElementById: (id) => nodos.get(id) || null,
    createElement: () => el("", rect(0, 0, 0, 0)),
    // Encima de todo lo que haya en el body fuera de #wrap (el popup), si no, #stage dentro del marco.
    elementFromPoint(x, y) {
      const dentro = (n) => x >= n.r.left && x < n.r.right && y >= n.r.top && y < n.r.bottom;
      for (const n of [...body.hijos].reverse()) if (dentro(n)) return n;
      if (dentro(stage)) return stage;
      if (dentro(mupi)) return mupi;
      return wrap;
    },
  };
  body.appendChild = (n) => {
    n.padre = body; if (n.id) nodos.set(n.id, n);
    // El popup del canal: 58vw × 46vh centrado (lo que dice su CSS).
    if (n.id === "faultPopup") n.r = rect(ancho * 0.21, alto * 0.27, ancho * 0.58, alto * 0.46);
    if (n.id === "faultTitlebar") n.r = rect(0,0,ancho,38);
    body.hijos.push(n);
  };
  return { document, nodos, wrap, mupi, stage, root, body };
}

function player({ screen = "virtual-lab-bugito", almacen = new Map(), ahora = () => Date.now(), virtual = true, ancho = 1600, alto = 900, completa = true } = {}) {
  const d = dom({ ancho, alto, completa });
  const posts = [], flashes = [], timers = [];
  let encuadres = 0;
  const ctx = vm.createContext({
    scr: { screen, circuit: screen },
    VIRTUAL_PLAYER: virtual,
    LS: (k, def) => (almacen.has(k) ? almacen.get(k) : def),
    save: (k, v) => almacen.set(k, v),
    localStorage: { removeItem: (k) => almacen.delete(k) },
    document: d.document,
    $: (id) => d.document.getElementById(id),
    getComputedStyle: () => ({ transform: "none" }),
    screen: { width: 390, height: 844 }, innerWidth: ancho, innerHeight: alto,
    window: { screen: { width: 390, height: 844 } },
    DEVICE_TELEMETRY: { display: {} },
    _nowItem: { id: "pieza-1" }, _postNow: (it) => posts.push(it),
    fitMupi: () => { encuadres++; }, flashCli: (msg) => flashes.push(msg),
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout: () => {},
    Date: { now: ahora }, JSON, Math, Number, String, Object, Array,
  });
  vm.runInContext(`${bloque}\n${extrae("cmdScreenSlug")}\nglobalThis.__surface=()=>surfaceFaults;`, ctx);
  return { ctx, d, posts, flashes, timers, almacen, encuadres: () => encuadres, run: (src) => vm.runInContext(src, ctx) };
}
const orden = (p, cmd, screen = "virtual-lab-bugito") => p.run(`applyFaultCommand(faultCommand(${JSON.stringify(cmd)}),{screen:${JSON.stringify(screen)}})`);
const display = (p) => JSON.parse(JSON.stringify(p.run("DEVICE_TELEMETRY.display")));

test("las tres órdenes de superficie se reconocen; variantes no", () => {
  const { run } = player();
  const parse = (c) => JSON.parse(JSON.stringify(run(`faultCommand(${JSON.stringify(c)})`) ?? null));
  assert.deepEqual(parse("fault-canvas"), { op: "canvas" });
  assert.deepEqual(parse("/FAULT:popup"), { op: "popup" });
  assert.deepEqual(parse("fault_half extra"), { op: "half" });
  for (const no of ["fault-canvass", "fault-popup-2", "canvas", "popup", "fault-medio", "fault-", "half"]) assert.equal(parse(no), null, no);
  // La salvaguarda del backend (omnipublicity-api src/fault-lab.js) trocea igual: primera palabra que empieza por «fault».
  for (const c of ["fault-canvas", "fault-popup", "fault-half"]) assert.match(c, /^fault-/);
});

test("sin fallos el player declara lienzo entero, 100 % visible y nada encima", () => {
  const p = player();
  const m = JSON.parse(JSON.stringify(p.run("measuredPaint()")));
  assert.deepEqual(m, { paintedRotation: 0, painted: "horizontal", canvas: { w: 1600, h: 900 }, visible: 100, overlay: 0, chromeTop: 0, playbackPaused: false });
});

test("popup encima: pinta la ventana de aviso y la telemetría mide el % tapado, sin decir que es una prueba", () => {
  const p = player();
  assert.equal(orden(p, "fault-popup"), "executed");
  const pop = p.d.document.getElementById("faultPopup");
  assert.ok(pop, "la ventana está en el body, fuera del player");
  assert.match(pop.innerHTML, /Actualización pendiente/);
  const dsp = display(p);
  assert.ok(dsp.overlay >= 20 && dsp.overlay <= 32, `tapado ${dsp.overlay} %`);
  assert.equal(dsp.visible, 100, "el lienzo sigue entero: no es «medio abrir»");
  assert.deepEqual(dsp.canvas, { w: 1600, h: 900 });
  assert.doesNotMatch(JSON.stringify(dsp), /fault|lab|prueba|inject|popup|bugito/i);
  const guardado = JSON.parse(p.almacen.get("adtv_fault_surface:virtual-lab-bugito"));
  assert.equal(guardado.popup.until - guardado.popup.at, 30 * 60000, "caduca sola a los 30 min");
  assert.ok(p.posts.length === 0 && p.timers.some((t) => t.ms === 0), "publica al momento (setTimeout 0)");
  assert.match(p.flashes.at(-1), /popup encima/);
  // Es una ventana del SISTEMA: el vigilante ALWAYS ON TOP la respeta y queda encima de #wrap (2147483646).
  assert.match(extrae("paintSurfaceFaults"), /pop\.setAttribute\('data-adm-ok','1'\)/);
  assert.match(extrae("isOwn"), /getAttribute\('data-adm-ok'\)==='1'/);
  assert.match(canal, /#faultPopup\{ position:fixed; z-index:2147483647;/);
  assert.match(canal, /w\.style\.zIndex='2147483646'/);
});

test("medio abrir: el contenido ocupa la mitad del lienzo; la persiana es el fondo del marco, no una capa", () => {
  const p = player();
  orden(p, "fault-half");
  assert.equal(p.d.mupi.classList.contains("fault-half"), true);
  // Lo que hace el CSS (#mupi.fault-half #stage{bottom:50%}): el escenario mide la mitad de arriba.
  p.d.stage.r = rect(0, 0, 1600, 450);
  p.run("Object.assign(DEVICE_TELEMETRY.display,measuredPaint())");
  const dsp = display(p);
  assert.equal(dsp.visible, 50);
  assert.equal(dsp.overlay, 0, "lo de abajo es del player: no cuenta como capa encima");
  assert.match(canal, /#mupi\.fault-half #stage\{ bottom:50% !important; overflow:hidden; \}/, "la persiana tapa de verdad la mitad de abajo");
  assert.match(canal, /#mupi\.fault-half\{ background:repeating-linear-gradient/);
});

test("cambio de resolución: re-encuadra el lienzo y la telemetría declara su caja medida", () => {
  const p = player();
  const antes = p.encuadres();
  orden(p, "fault-canvas");
  assert.ok(p.encuadres() > antes, "re-encuadra el marco");
  assert.equal(p.run("surfaceFaultOn('canvas')"), true);
  // Lo que deja fitMupi: un lienzo 9:16 centrado en el panel 16:9 (estilo destino y caja).
  p.d.mupi.style.width = "506px"; p.d.mupi.style.height = "900px";
  p.d.mupi.r = rect(547, 0, 506, 900); p.d.stage.r = rect(547, 0, 506, 900);
  p.run("Object.assign(DEVICE_TELEMETRY.display,measuredPaint())");
  const dsp = display(p);
  assert.deepEqual(dsp.canvas, { w: 506, h: 900 });
  assert.equal(dsp.visible, 100, "el contenido llena su lienzo: no es «medio abrir»");
  assert.equal(dsp.overlay, 0);
  assert.equal(dsp.painted, "horizontal", "no está girado: no es «formato girado»");
});

test("se suman entre sí y fault-clear los retira todos, con el giro", () => {
  const p = player();
  orden(p, "fault-popup"); orden(p, "fault-half"); orden(p, "fault-rotate");
  assert.deepEqual(Object.keys(JSON.parse(JSON.stringify(p.run("__surface()")))).sort(), ["half", "popup"]);
  assert.equal(orden(p, "fault-clear"), "executed");
  assert.deepEqual(JSON.parse(JSON.stringify(p.run("__surface()"))), {});
  assert.equal(p.d.document.getElementById("faultPopup"), null, "la ventana desaparece");
  assert.equal(p.d.mupi.classList.contains("fault-half"), false);
  assert.equal(p.almacen.has("adtv_fault_surface:virtual-lab-bugito"), false);
  assert.equal(p.almacen.has("adtv_fault:virtual-lab-bugito"), false);
});

test("cuatro fallos simultáneos se retiran por separado sin renovar ni borrar los restantes", () => {
  const p = player();
  for (const kind of ['rotate', 'canvas', 'popup', 'half']) assert.equal(orden(p, `fault-${kind}`), 'executed');
  const initial = JSON.parse(JSON.stringify(p.run('__surface()')));
  assert.equal(orden(p, 'fault-rotate off'), 'executed');
  assert.equal(p.run('faultRotation()'), 0);
  assert.deepEqual(JSON.parse(JSON.stringify(p.run('__surface()'))), initial);
  assert.ok(p.d.document.getElementById('faultPopup'));
  assert.equal(p.d.mupi.classList.contains('fault-half'), true);
  assert.equal(orden(p, 'fault-canvas off'), 'executed');
  assert.deepEqual(JSON.parse(JSON.stringify(p.run('__surface()'))), {popup:initial.popup, half:initial.half});
  assert.ok(p.d.document.getElementById('faultPopup'));
  assert.equal(orden(p, 'fault-popup off'), 'executed');
  assert.equal(p.d.document.getElementById('faultPopup'), null);
  assert.deepEqual(JSON.parse(JSON.stringify(p.run('__surface()'))), {half:initial.half});
  assert.equal(p.d.mupi.classList.contains('fault-half'), true);
  assert.equal(orden(p, 'fault-half off'), 'executed');
  assert.deepEqual(JSON.parse(JSON.stringify(p.run('__surface()'))), {});
  assert.equal(p.d.mupi.classList.contains('fault-half'), false);
  assert.equal(p.almacen.has('adtv_fault_surface:virtual-lab-bugito'), false);
  assert.equal(p.almacen.has('adtv_fault:virtual-lab-bugito'), false);
});

test("retirar un fallo conserva el giro del operador y rechaza destinos ajenos o broadcast", () => {
  const p = player();
  p.run('displayRotation=180');
  orden(p, 'fault-rotate'); orden(p, 'fault-popup');
  assert.equal(orden(p, 'fault-popup off', ''), 'failed');
  assert.equal(orden(p, 'fault-rotate off', 'virtual-lab-otro'), 'failed');
  assert.equal(p.run('faultRotation()'), 90);
  assert.ok(p.d.document.getElementById('faultPopup'));
  assert.equal(orden(p, '/FAULT:rotate OFF'), 'executed');
  assert.equal(p.run('effectiveRotation()'), 180);
  assert.ok(p.d.document.getElementById('faultPopup'));
  assert.equal(orden(p, 'fault-rotate off'), 'executed', 'retirada idempotente');
  assert.equal(p.run('effectiveRotation()'), 180);
});

test("sólo dirigidas a ESTA pantalla: un broadcast o la orden de otra no tocan nada", () => {
  const p = player();
  assert.equal(orden(p, "fault-popup", ""), "failed");
  assert.equal(orden(p, "fault-half", "virtual-lab-otro"), "failed");
  assert.equal(p.run("applyFaultCommand(faultCommand('fault-canvas'),{})"), "failed");
  assert.equal(p.d.document.getElementById("faultPopup"), null);
  assert.equal(p.almacen.size, 0);
});

test("sobrevive a la recarga hasta que caduca; un registro manipulado no se acepta", () => {
  let ahora = 1_000_000;
  const almacen = new Map([["adtv_fault_surface:virtual-lab-bugito", JSON.stringify({ popup: { at: ahora - 60000, until: ahora + 60000 }, half: { at: 0, until: 10 * 3600000 },
    canvas: { at: ahora + 10 * 60000, until: ahora + 20 * 60000 }, otro: { at: ahora, until: ahora + 1000 } })]]);
  const p = player({ almacen, ahora: () => ahora });
  assert.deepEqual(Object.keys(JSON.parse(JSON.stringify(p.run("__surface()")))), ["popup"], "fuera el de vida mayor que la permitida, el de fecha futura y el desconocido");
  assert.ok(p.d.document.getElementById("faultPopup"), "tras recargar se vuelve a pintar");
  const caducidad = p.timers.filter((t) => t.ms >= 1000).at(-1);
  ahora += 120000; caducidad.fn();
  assert.deepEqual(JSON.parse(JSON.stringify(p.run("__surface()"))), {});
  assert.equal(p.d.document.getElementById("faultPopup"), null);
  assert.match(p.flashes.at(-1), /fin de la prueba/);
});

test("el panel de un player virtual es su ventana, no el monitor que la aloja", () => {
  // iframe 16:9 dentro de un móvil vertical: screen 390×844 pero la ventana del player es 1600×900.
  assert.equal(player({ virtual: true }).run("measuredPaint().painted"), "horizontal");
  assert.equal(player({ virtual: false }).run("measuredPaint().painted"), "vertical", "un player físico sigue midiendo su panel");
});

test("% tapado por rejilla: lo que no es del player cuenta; lo del player no", () => {
  const { run } = player();
  const r = "{l:0,t:0,r:160,b:90}";
  assert.equal(run(`overlayPct(${r},()=>'ajeno',()=>false)`), 100);
  assert.equal(run(`overlayPct(${r},()=>'player',()=>true)`), 0);
  assert.equal(run(`overlayPct(${r},(x)=>x<80?'ajeno':'player',(e)=>e==='player')`), 50);
  assert.equal(run(`overlayPct({l:0,t:0,r:0,b:0},()=>'ajeno',()=>false)`), 0, "sin superficie no hay nada tapado");
});

test("encuadre: con fault-canvas el marco toma la proporción contraria del hueco", () => {
  // fitMupi real contra un #wrap 1600×900 sin raíl ni canal.
  const estilo = (el) => ({ display: el && el.oculto ? "none" : "block", paddingLeft: "0", paddingRight: "0", paddingTop: "0", paddingBottom: "0", columnGap: "0" });
  const mupi = { style: {} }, wrap = { clientWidth: 1600, clientHeight: 900 };
  const html = { classList: { contains: (c) => c === "screen-fit" } };
  const ctx = vm.createContext({
    $: (id) => ({ mupi, wrap, rail: { oculto: true }, chan: { oculto: true } })[id] || null,
    getComputedStyle: estilo, document: { documentElement: html }, requestAnimationFrame: () => 0,
    effectiveRotation: () => 0, mupiAR: 9 / 16, canvasOn: true,
    surfaceFaultOn: (k) => k === "canvas" && ctx.canvasOn,
  });
  vm.runInContext(extrae("fitMupi"), ctx);
  vm.runInContext("fitMupi()", ctx);
  assert.equal(mupi.style.width, "506px"); assert.equal(mupi.style.height, "900px");
  ctx.canvasOn = false; vm.runInContext("fitMupi()", ctx);
  assert.equal(mupi.style.width, "1600px"); assert.equal(mupi.style.height, "900px", "sin el fallo, fill vuelve a ocupar el panel");
  ctx.canvasOn = true; ctx.effectiveRotation = () => 90; vm.runInContext("fitMupi()", ctx);
  assert.equal(mupi.style.width, "900px"); assert.equal(mupi.style.height, "506px", "con un cuarto de vuelta el rectángulo sin girar intercambia lados");
});

test("cableado: telemetría y re-medida llevan las medidas de superficie; el mando y la CLI no", () => {
  assert.match(extrae("measuredPaint"), /\.\.\.measuredSurface\(\)/);
  assert.match(canal, /const MEASURED_KEYS=\['paintedRotation','painted','canvas','overlay','visible','chromeTop','playbackPaused'\];/);
  assert.match(extrae("remeasurePaint"), /MEASURED_KEYS\.every/);
  assert.match(extrae("deviceTelemetryBase"), /\.\.\.measuredPaint\(\) \}/);
  assert.doesNotMatch(extrae("measuredSurface"), /surfaceFaults|surfaceFaultOn|SURFACE_/, "se mide el DOM, no el estado del fallo");
  assert.doesNotMatch(extrae("applyCtrlCmd"), /fault-|applyFaultCommand|setSurfaceFaults/);
  assert.doesNotMatch(extrae("runCli"), /fault-|setSurfaceFaults/);
});

test("revisión: el lienzo es el tamaño DESTINO (no el de la transición) y sólo a pantalla completa", () => {
  const p = player();
  // A mitad de la transición de .35 s la caja mide otra cosa; el estilo destino manda.
  p.d.mupi.r = rect(210, 118, 1180, 664); p.d.stage.r = rect(210, 118, 1180, 664);
  assert.deepEqual(JSON.parse(JSON.stringify(p.run("measuredSurface()").canvas)), { w: 1600, h: 900 });
  // Con un cuarto de vuelta, el estilo está en el sentido del marco sin girar: se devuelve en el del panel.
  p.run("setInjectedFault({type:'rotate',angle:90,at:Date.now(),until:Date.now()+60000})");
  p.d.mupi.style.width = "900px"; p.d.mupi.style.height = "1600px";
  assert.deepEqual(JSON.parse(JSON.stringify(p.run("measuredSurface()").canvas)), { w: 1600, h: 900 });
  // En editorial el marco sigue a cada pieza: no se declara canvas.
  const ed = player({ completa: false });
  assert.equal("canvas" in ed.run("measuredSurface()"), false);
  assert.equal(ed.run("measuredSurface()").visible, 100);
});

test("revisión: sin capas ajenas en <body> no hay hit-testing (0 % tapado sin 576 elementFromPoint)", () => {
  const p = player();
  let llamadas = 0;
  const original = p.d.document.elementFromPoint;
  p.d.document.elementFromPoint = (...a) => { llamadas++; return original(...a); };
  assert.equal(p.run("measuredSurface()").overlay, 0);
  assert.equal(llamadas, 0);
  orden(p, "fault-popup");
  llamadas = 0;
  assert.ok(p.run("measuredSurface()").overlay > 10);
  assert.equal(llamadas, 32 * 18 + 9, "con una capa ajena, la rejilla completa");
});

test('title bar is detected from the actual top band and independently removed',()=>{const p=player();assert.equal(orden(p,'fault-title'),'executed');assert.ok(p.d.document.getElementById('faultTitlebar'));assert.ok(p.run('measuredSurface().chromeTop')>=36);orden(p,'fault-popup');orden(p,'fault-title off');assert.equal(p.run('measuredSurface().chromeTop'),0);assert.ok(p.run('measuredSurface().overlay')>10);orden(p,'fault-clear');assert.equal(p.run('measuredSurface().overlay'),0);});

test('pause telemetry reads the actual media element rather than assuming the command succeeded',()=>{const p=player();p.run('globalThis.mediaEl={paused:true}');assert.equal(p.run('measuredPaint().playbackPaused'),true);p.run('mediaEl.paused=false');assert.equal(p.run('measuredPaint().playbackPaused'),false);});
