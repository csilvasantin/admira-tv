/* Portadas del Stock en la parrilla (9-oct-2026). En un iPad real (iPadOS 17.7) los <video> de las miniaturas
   del «Orden de emisión» no cargan nunca —readyState 0, peticiones canceladas— y cada tarjeta era una caja negra
   con ▶; la vista previa, negra hasta darle al play. El índice del Stock trae poster o thumbnail para casi todas
   las piezas: la parrilla la pone como poster del vídeo y como <img> encima, que sí se pinta en iOS.

   Se ejecutan las funciones del propio HTML (como parrilla-playlists.test.mjs): un assert.match sobre el texto
   pasaría aunque la lógica estuviera al revés. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const html = await readFile(new URL("./parrilla/index.html", import.meta.url), "utf8");

function extrae(nombre) {
  const inicio = html.indexOf(`function ${nombre}(`);
  assert.notEqual(inicio, -1, `falta la función ${nombre}`);
  let i = html.indexOf("{", inicio), nivel = 0, fin = i;
  for (; fin < html.length; fin++) {
    if (html[fin] === "{") nivel++;
    else if (html[fin] === "}") { nivel--; if (!nivel) { fin++; break; } }
  }
  return html.slice(inicio, fin);
}

/* Tal como viene en stock/index.json ({items:[…]}): con poster, sólo con thumbnail (el caso de YouTube), con una
   portada que no es https y sin ninguna. */
const STOCK = [
  { id: "v-poster", type: "video", url: "https://stock.admira.store/stock/v-poster/asset.mp4?v=1", poster: "https://stock.admira.store/stock/v-poster/poster.jpg", thumbnail: "https://stock.admira.store/stock/v-poster/thumb.jpg" },
  { id: "1783978476349-n8j27g", type: "video", url: "https://stock.admira.store/stock/1783978476349-n8j27g/asset.mp4?v=484305", poster: null, thumbnail: "https://img.youtube.com/vi/hCzwv9RPLkE/hqdefault.jpg" },
  { id: "v-data", type: "video", url: "https://stock.admira.store/stock/v-data/asset.mp4", poster: "data:image/jpeg;base64,AAAA", thumbnail: "http://inseguro.example/t.jpg" },
  { id: "v-mixto", type: "video", url: "https://stock.admira.store/stock/v-mixto/asset.mp4", poster: "http://inseguro.example/p.jpg", thumbnail: "https://stock.admira.store/stock/v-mixto/thumb.jpg" },
  { id: "v-nada", type: "video", url: "https://stock.admira.store/stock/v-nada/asset.mp4" },
];

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function sandbox(extra = {}) {
  const ctx = { esc, portadas: null, portadasPedidas: false, ...extra };
  vm.createContext(ctx);
  for (const fn of ["portadaUrl", "sinQuery", "indicePortadas", "portadaDe", "portadaImg", "pieceType"]) {
    vm.runInContext(extrae(fn), ctx);
  }
  return ctx;
}
const conIndice = (extra) => { const ctx = sandbox(extra); vm.runInContext("portadas=indicePortadas(STOCK)", Object.assign(ctx, { STOCK })); return ctx; };

test("la portada prefiere poster, cae a thumbnail y sólo acepta https", () => {
  const ctx = conIndice();
  const de = (id) => vm.runInContext(`portadaDe({stockId:${JSON.stringify(id)}},null)`, ctx);
  assert.equal(de("v-poster"), "https://stock.admira.store/stock/v-poster/poster.jpg");
  assert.equal(de("1783978476349-n8j27g"), "https://img.youtube.com/vi/hCzwv9RPLkE/hqdefault.jpg", "sin poster, el thumbnail");
  assert.equal(de("v-mixto"), "https://stock.admira.store/stock/v-mixto/thumb.jpg", "un poster http no tapa un thumbnail https");
  assert.equal(de("v-data"), "", "ni data: ni http:");
  assert.equal(de("v-nada"), "");
  assert.equal(de("no-existe"), "");
});

test("se encuentra por stockId de la pieza viva, del contenido a mano y por la URL del archivo sin query", () => {
  const ctx = conIndice();
  const run = (src) => vm.runInContext(src, ctx);
  // Pieza viva de /grid/day: stockId + asset.
  assert.equal(run(`portadaDe({id:'x',asset:'/parrilla/assets/a.mp4'},{stockId:'v-poster',asset:'https://stock.admira.store/stock/v-poster/asset.mp4?v=1'})`),
    "https://stock.admira.store/stock/v-poster/poster.jpg");
  // Contenido a mano con stockId.
  assert.equal(run(`portadaDe({id:'stock-1783978476349-n8j27g',stockId:'1783978476349-n8j27g',asset:'x.mp4'},undefined)`),
    "https://img.youtube.com/vi/hCzwv9RPLkE/hqdefault.jpg");
  // Sólo el archivo, con otra versión en la query: casa igual.
  assert.equal(run(`portadaDe({id:'a',asset:'https://stock.admira.store/stock/v-mixto/asset.mp4?v=999#t=1'},null)`),
    "https://stock.admira.store/stock/v-mixto/thumb.jpg");
  // Lo que se ve manda: si la viva trae archivo, su portada; nunca la del contenido que tapa.
  assert.equal(run(`portadaDe({stockId:'v-poster'},{stockId:'v-nada',asset:'https://stock.admira.store/stock/v-nada/asset.mp4'})`), "");
});

test("sin índice (no ha llegado o ha fallado) no hay portada y la miniatura es la de siempre", () => {
  const ctx = sandbox();
  assert.equal(vm.runInContext(`portadaDe({stockId:'v-poster',asset:'a.mp4'},null)`, ctx), "");
  const tpl = renderThumbs(ctx);
  assert.match(tpl, /<video data-slot-video data-src="https:\/\/stock\.admira\.store\/stock\/v-poster\/asset\.mp4" muted playsinline preload="metadata"><\/video><span class="slot-thumb-play">▶<\/span>/);
  assert.doesNotMatch(tpl, /poster=|data-slot-cover/);
});

test("si el índice falla no se pinta nada y el catálogo se vuelve a pedir al abrir el panel", async () => {
  let pintadas = 0;
  const panel = { hidden: true };
  const ctx = sandbox({
    stockEstado: "idle", stockPiezas: null, stockPromesa: null,
    $: (id) => (id === "plPanel" ? panel : null),
    pintaPortadas: () => { pintadas++; },
  });
  // plCargaStock real: un fetch que revienta.
  ctx.STOCK_INDEX = "https://stock.admira.store/stock/index.json";
  ctx.fetch = () => Promise.reject(new TypeError("Load failed"));
  vm.runInContext(extrae("plCargaStock"), ctx);
  vm.runInContext(extrae("cargaPortadas"), ctx);
  vm.runInContext("cargaPortadas()", ctx);
  await vm.runInContext("stockPromesa", ctx);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(pintadas, 0);
  assert.equal(vm.runInContext("portadas", ctx), null);
  assert.equal(vm.runInContext("stockPiezas", ctx), null, "no se queda con un catálogo vacío para siempre");
  assert.equal(vm.runInContext("stockPromesa", ctx), null);
  assert.equal(vm.runInContext("stockEstado", ctx), "idle", "con el panel cerrado, como si no se hubiera pedido");
  // Una sola descarga por carga de página: el latido de liveStatus no lo reintenta.
  let pedidas = 0;
  ctx.fetch = () => { pedidas++; return Promise.reject(new Error("x")); };
  vm.runInContext("cargaPortadas();cargaPortadas()", ctx);
  assert.equal(pedidas, 0);
});

test("con el índice, se reutiliza la descarga de los tags y se pintan las portadas una vez", async () => {
  let pintadas = 0, pedidas = 0;
  const ctx = sandbox({ stockEstado: "idle", stockPiezas: null, stockPromesa: null, $: () => ({ hidden: true }), pintaPortadas: () => { pintadas++; } });
  ctx.STOCK_INDEX = "https://stock.admira.store/stock/index.json";
  ctx.fetch = () => { pedidas++; return Promise.resolve({ json: () => Promise.resolve({ items: STOCK, total: STOCK.length }) }); };
  vm.runInContext(extrae("plCargaStock"), ctx);
  vm.runInContext(extrae("cargaPortadas"), ctx);
  vm.runInContext("cargaPortadas()", ctx);
  // El panel de tags pide el catálogo a la vez: misma promesa, una sola descarga.
  const delPanel = await vm.runInContext("plCargaStock()", ctx);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(pedidas, 1);
  assert.equal(delPanel.length, STOCK.length);
  assert.equal(pintadas, 1);
  assert.equal(vm.runInContext("stockEstado", ctx), "ok");
  assert.equal(vm.runInContext("portadaDe({stockId:'v-poster'},null)", ctx), "https://stock.admira.store/stock/v-poster/poster.jpg");
});

/* render() de verdad, con un DOM mínimo: lo que importa es el HTML de las miniaturas. */
function renderThumbs(ctx, items = [{ id: "v1", lane: "publicidad", seconds: 10, title: "Vídeo", asset: "https://stock.admira.store/stock/v-poster/asset.mp4", assetType: "video", stockId: "v-poster" }], live = {}) {
  const nodos = {};
  const $ = (id) => (nodos[id] ||= { innerHTML: "", disabled: false, textContent: "", hidden: false, focus() {}, select() {} });
  Object.assign(ctx, {
    $, items, liveByPosition: live, current: 0, editingTitle: -1, MIN_SECS: 2, MAX_SECS: 600,
    readOnlyReason: () => "", renderFollow() {}, resolvedTitle: (i) => items[i].title, hydrateSlotThumbs() {}, bindDrag() {},
    updateBalance() {}, preview() {}, syncSlotProgress() {}, requestAnimationFrame() {}, document: { querySelector: () => null },
  });
  vm.runInContext(extrae("render"), ctx);
  vm.runInContext("render()", ctx);
  return nodos.rundown.innerHTML;
}

test("la miniatura de vídeo lleva la portada como poster y como <img> entre el vídeo y el ▶", () => {
  const ctx = conIndice();
  const tpl = renderThumbs(ctx);
  const cover = "https://stock.admira.store/stock/v-poster/poster.jpg";
  assert.ok(tpl.includes(`<video data-slot-video data-src="https://stock.admira.store/stock/v-poster/asset.mp4" poster="${cover}" muted playsinline preload="metadata"></video>`), tpl);
  // El orden importa: la imagen va DESPUÉS del vídeo (lo tapa aunque iOS no lo cargue) y ANTES del ▶ (que sigue encima).
  assert.ok(tpl.includes(`</video><img class="slot-cover" data-slot-cover src="${cover}" alt="" draggable="false"><span class="slot-thumb-play">▶</span>`), tpl);
  assert.match(html, /\.slot-thumb \.slot-cover\{position:absolute;inset:0\}/, "la portada cubre la miniatura entera");
});

test("la pieza viva de la parrilla pone su portada aunque el contenido a mano no tenga", () => {
  const ctx = conIndice();
  const tpl = renderThumbs(ctx, [{ id: "m1", lane: "municipal", seconds: 10, title: "Local", asset: "/parrilla/assets/local.mp4", assetType: "video" }],
    { 0: { stockId: "1783978476349-n8j27g", asset: "https://stock.admira.store/stock/1783978476349-n8j27g/asset.mp4?v=484305", assetType: "video", title: "Ronaldo", sourceTag: "deporte", lane: "municipal" } });
  assert.match(tpl, /poster="https:\/\/img\.youtube\.com\/vi\/hCzwv9RPLkE\/hqdefault\.jpg"/);
  assert.match(tpl, /data-slot-cover src="https:\/\/img\.youtube\.com\/vi\/hCzwv9RPLkE\/hqdefault\.jpg"/);
});

test("las imágenes no cambian: ni poster ni capa de portada", () => {
  const ctx = conIndice();
  const tpl = renderThumbs(ctx, [{ id: "i1", lane: "publicidad", seconds: 10, title: "Foto", asset: "https://stock.admira.store/stock/v-poster/asset.mp4", assetType: "image", stockId: "v-poster" }]);
  assert.match(tpl, /<img data-slot-image src="[^"]+" alt="">/);
  assert.doesNotMatch(tpl, /poster=|data-slot-cover/);
});

test("vertical u horizontal: la portada decide sólo si el vídeo no ha dado sus medidas; rota, se quita", () => {
  const ctx = sandbox();
  vm.runInContext(extrae("hydrateCover"), ctx);
  const caja = (video) => {
    const clases = new Map();
    const box = { classList: { toggle: (c, on) => clases.set(c, on) }, querySelector: () => video };
    return { box, clases };
  };
  const img = (box, w, h, complete = true) => ({ naturalWidth: w, naturalHeight: h, complete, removed: false, closest: () => box, remove() { this.removed = true; }, addEventListener() {} });

  // iOS: el vídeo no carga nunca (0×0) → manda la portada, vertical.
  let c = caja({ videoWidth: 0, videoHeight: 0 });
  ctx.hydrateCover(img(c.box, 720, 1280));
  assert.equal(c.clases.get("portrait"), true);
  // Escritorio: el vídeo ya dio 1920×1080 → la portada (una de YouTube 4:3) no lo pisa.
  c = caja({ videoWidth: 1920, videoHeight: 1080 });
  ctx.hydrateCover(img(c.box, 360, 480));
  assert.equal(c.clases.has("portrait"), false);
  // Portada rota: fuera, queda el vídeo como antes.
  c = caja({ videoWidth: 0, videoHeight: 0 });
  const rota = img(c.box, 0, 0);
  ctx.hydrateCover(rota);
  assert.equal(rota.removed, true);
});

test("las portadas que llegan tarde sólo tocan las miniaturas de vídeo, nunca el título en edición ni el arrastre", () => {
  const insertado = [];
  const slot = (i, video, conPortada = false) => ({
    dataset: { index: String(i) },
    querySelector: (sel) => (sel === "[data-slot-video]" ? video : sel === "[data-slot-cover]" ? (conPortada ? {} : null) : null),
  });
  const v0 = { poster: "", insertAdjacentHTML: (pos, s) => insertado.push([0, pos, s]), nextElementSibling: { cover: 0 } };
  const v2 = { poster: "", insertAdjacentHTML: (pos, s) => insertado.push([2, pos, s]), nextElementSibling: { cover: 2 } };
  const slots = [slot(0, v0), slot(1, null), slot(2, v2, true)];
  let timers = 0, hidratadas = [], posters = 0;
  const ctx = conIndice({
    items: [{ stockId: "v-poster", assetType: "video" }, { stockId: "v-poster", assetType: "image" }, { stockId: "v-poster", assetType: "video" }],
    liveByPosition: {}, dragId: "algo",
    document: { querySelectorAll: () => slots },
    setTimeout: () => { timers++; },
    hydrateCover: (n) => hidratadas.push(n.cover),
    posterPreview: () => { posters++; },
  });
  vm.runInContext(extrae("pintaPortadas"), ctx);
  // Arrastrando: se espera, no se toca el DOM.
  vm.runInContext("pintaPortadas()", ctx);
  assert.equal(timers, 1);
  assert.equal(insertado.length, 0);
  // Sin arrastre: sólo la miniatura de vídeo que aún no tiene portada; el resto de la tarjeta ni se rehace.
  vm.runInContext("dragId=null;pintaPortadas()", ctx);
  assert.deepEqual(insertado.map(([i, pos]) => [i, pos]), [[0, "afterend"]]);
  assert.equal(v0.poster, "https://stock.admira.store/stock/v-poster/poster.jpg");
  assert.deepEqual(hidratadas, [0]);
  assert.equal(posters, 1, "y la vista previa recibe su poster");
  assert.doesNotMatch(extrae("pintaPortadas"), /render\(|innerHTML=/, "no rehace la lista: el input del título sobrevive");
});

test("la vista previa y el visor a pantalla completa llevan la portada como poster", () => {
  const vid = { poster: "", attrs: new Set(["poster"]), removeAttribute(a) { this.attrs.delete(a); this.poster = ""; } };
  const ctx = conIndice({
    items: [{ stockId: "v-poster", assetType: "video" }, { stockId: "v-nada", assetType: "video" }, { stockId: "v-poster", assetType: "image" }],
    liveByPosition: {}, current: 0, $: (id) => (id === "previewVideo" ? vid : null),
  });
  vm.runInContext(extrae("posterPreview"), ctx);
  vm.runInContext("posterPreview()", ctx);
  assert.equal(vid.poster, "https://stock.admira.store/stock/v-poster/poster.jpg");
  // Pasar a una pieza sin portada no deja colgada la anterior.
  vm.runInContext("current=1;posterPreview()", ctx);
  assert.equal(vid.poster, "");
  assert.equal(vid.attrs.has("poster"), false);
  // preview() lo llama en la rama de vídeo y el visor lo usa.
  assert.match(extrae("preview"), /if\(type==='video'\)\{[^}]*posterPreview\(\)/);
  assert.match(extrae("previewData"), /cover:type==='video'\?portadaDe\(it,live\):''/);
  assert.match(extrae("renderStockPreview"), /\(d\.cover\?' poster="'\+esc\(d\.cover\)\+'"':''\)/);
});

test("el índice se pide desde liveStatus, en paralelo y sin frenar el primer pintado", () => {
  assert.match(html, /async function liveStatus\(\)\{cargaPortadas\(\);/);
  // Y es la MISMA descarga que el catálogo de tags: no hay un segundo fetch del índice en la página.
  assert.equal(html.match(/stock\.admira\.store\/stock\/index\.json/g).length, 1);
  assert.match(extrae("cargaPortadas"), /plCargaStock\(\)/);
});
