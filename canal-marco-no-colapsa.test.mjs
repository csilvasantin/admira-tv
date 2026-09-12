/* El marco del MUPI no puede colapsar a una franja. Carlos, 12-ago-2026, con foto
   del MacBookProNegro14 emitiendo en kiosko: «la reproducción de vídeo va fatal,
   el segundo vídeo se corta y se ve solo la franja inferior».

   CAUSA. fitMupi() calcula el marco desde wrap.clientHeight y lo escribe en px:

       const aH = Math.max(1, wrap.clientHeight - padY);   // ← aquí
       let h = aH, w = h * mupiAR;
       mupi.style.height = Math.round(h) + 'px';

   Ese Math.max(1,…) convierte «todavía no se puede medir» en «el marco mide un
   píxel», y lo deja ESCRITO. En un WKWebView en kiosko el wrap puede medir 0 justo
   cuando play() encadena la segunda pieza — y como nadie vuelve a llamar a
   fitMupi, el MUPI se queda clavado en 1px: negro con una franja abajo.

   Se prueba ejecutando la función real extraída del canal contra un DOM de
   mentira, no mirando el texto: lo que importa es qué ESCRIBE. */
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

/* Un wrap que mide lo que le digamos, y un mupi que recuerda lo que le escriben. */
function escenario({ alto, ancho, rotation = 0, screenFit = false }) {
  const mupi = { style: {} };
  const wrap = { clientHeight: alto, clientWidth: ancho };
  const nodos = { mupi, wrap, rail: null, chan: null };
  const marcos = [];
  const ctx = vm.createContext({
    $: (id) => nodos[id] || null,
    document: { documentElement: { classList: { contains: (name) => name === "screen-fit" && screenFit } } },
    getComputedStyle: () => ({ display: "none", paddingLeft: "0", paddingRight: "0",
      paddingTop: "0", paddingBottom: "0", columnGap: "0", gap: "0" }),
    mupiAR: 9 / 16,
    displayRotation: rotation,
    Math, parseFloat, requestAnimationFrame: (fn) => { marcos.push(fn); },
    ResizeObserver: undefined,
  });
  vm.runInContext(extrae("fitMupi"), ctx);
  return { ctx, mupi, wrap, marcos, fit: () => vm.runInContext("fitMupi()", ctx) };
}

test("con medidas buenas dimensiona el marco, como siempre", () => {
  const e = escenario({ alto: 1000, ancho: 1600 });
  e.fit();
  assert.equal(e.mupi.style.height, "1000px");
  assert.equal(e.mupi.style.width, "563px");   // 1000 × 9/16
  assert.equal(e.mupi.style.aspectRatio, "auto");
});

test("NO escribe un marco de un píxel cuando todavía no se puede medir", () => {
  const e = escenario({ alto: 0, ancho: 0 });
  e.fit();
  assert.equal(e.mupi.style.height, undefined, "una medida de 0 no puede acabar escrita en px");
  assert.equal(e.mupi.style.width, undefined);
  assert.ok(e.marcos.length >= 1, "y tiene que reintentar, no rendirse");
});

test("al encadenar la segunda pieza conserva el marco bueno si el wrap mide 0", () => {
  // Primera pieza con la ventana ya medible: marco correcto.
  const e = escenario({ alto: 900, ancho: 1440 });
  e.fit();
  const bueno = { h: e.mupi.style.height, w: e.mupi.style.width };
  assert.equal(bueno.h, "900px");

  // Segunda pieza: play() vuelve a llamar y el WebView reporta 0 en ese instante.
  e.wrap.clientHeight = 0; e.wrap.clientWidth = 0;
  e.fit();
  assert.deepEqual({ h: e.mupi.style.height, w: e.mupi.style.width }, bueno,
    "el marco tiene que quedarse como estaba, no colapsar a una franja");

  // Y en cuanto se puede medir otra vez, el reintento lo re-ajusta solo.
  e.wrap.clientHeight = 800; e.wrap.clientWidth = 1440;
  e.marcos.shift()();
  assert.equal(e.mupi.style.height, "800px");
});

test("una medida ridícula tampoco pasa: el umbral es de píxeles reales", () => {
  const e = escenario({ alto: 12, ancho: 1440 });
  e.fit();
  assert.equal(e.mupi.style.height, undefined, "12px de alto no es una ventana, es ruido de layout");
});

test("Android a 90° conserva el viewport físico cuando llega el AR real del vídeo", () => {
  const e = escenario({ alto: 834, ancho: 752, rotation: 90, screenFit: true });
  e.fit();
  assert.deepEqual({ h: e.mupi.style.height, w: e.mupi.style.width }, { h: "752px", w: "834px" });

  // loadedmetadata puede descubrir que el MP4 es 16:9. En un player físico no
  // debe volver a orientar el marco ni animar un segundo giro aparente.
  e.ctx.mupiAR = 16 / 9;
  e.fit();
  assert.deepEqual({ h: e.mupi.style.height, w: e.mupi.style.width }, { h: "752px", w: "834px" });
});

test("el reintento no se vuelve infinito", () => {
  const e = escenario({ alto: 0, ancho: 0 });
  e.fit();
  for (let i = 0; i < 200 && e.marcos.length; i++) e.marcos.shift()();
  assert.equal(e.marcos.length, 0, "tiene que rendirse en algún momento, no girar para siempre");
});

test("el canal se autocura ante cualquier cambio de tamaño", () => {
  // Sin esto, una medida mala que llegara a colarse duraría hasta la siguiente pieza.
  // Desde r24 hay UN solo observer (hubo dos entre r23 y r24) y hereda el reset.
  assert.match(canal, /_mupiResizeObserver=new ResizeObserver\(\(\)=>\{ fitMupi\._retry=0; fitMupi\(\); localInfoClamp\(\); \}\)/);
  assert.equal((canal.match(/new ResizeObserver/g) || []).length, 1);
  // Y el Math.max(1,…) que lo causaba no puede volver.
  assert.doesNotMatch(canal, /const aH=Math\.max\(1,wrap\.clientHeight-padY\)/);
});

test("un único observer reajusta el marco y mantiene la ficha dentro del wrap", () => {
  const nodes = new Map();
  const node = (id) => {
    if (!nodes.has(id)) nodes.set(id, {
      id, hidden: false, clientWidth: 540, clientHeight: 960,
      offsetWidth: 220, offsetHeight: 320, offsetLeft: 500, offsetTop: 900,
      style: {}, addEventListener() {}, appendChild(child) { this.child = child; },
    });
    return nodes.get(id);
  };
  const observers = [];
  class ResizeObserver {
    constructor(callback) { this.callback = callback; this.observed = []; observers.push(this); }
    observe(element) { this.observed.push(element); }
  }
  let fits = 0;
  const fitMupi = () => { fits++; };
  fitMupi._retry = 9;
  const ctx = vm.createContext({ $: node, window: { ResizeObserver }, ResizeObserver, fitMupi });
  const observerStart = canal.indexOf("let _mupiResizeObserver=null;");
  vm.runInContext(canal.slice(observerStart, canal.indexOf("// ── CONTENIDO EXPANDIDO", observerStart)), ctx);
  vm.runInContext(canal.slice(canal.indexOf("let _localInfoDrag=null;"), canal.indexOf("// Pointer Events da un doble toque")), ctx);

  assert.equal(observers.length, 1);
  assert.deepEqual(observers[0].observed, [node("wrap"), node("localInfo")]);
  assert.equal(node("wrap").child, node("localInfo"));
  observers[0].callback();
  assert.equal(fits, 1);
  assert.equal(fitMupi._retry, 0);
  assert.deepEqual(node("localInfo").style, { left: "310px", top: "630px" });

  node("wrap").clientWidth = 260;
  node("wrap").clientHeight = 380;
  observers[0].callback();
  assert.deepEqual(node("localInfo").style, { left: "30px", top: "50px" });
  node("localInfo").hidden = true;
  node("wrap").clientWidth = 240;
  observers[0].callback();
  assert.equal(fits, 3);
  assert.deepEqual(node("localInfo").style, { left: "30px", top: "50px" });
  assert.equal(observers.length, 1, "mostrar/redimensionar no crea observers adicionales");
});
