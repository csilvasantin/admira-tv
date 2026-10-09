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
    liveByPosition: {}, current: 0, $: (id) => (id === "previewVideo" ? vid : null), coverPreview() {},
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

/* Vista previa en el iPad (9-oct-2026, tras el despliegue de las tarjetas): el poster de #previewVideo no basta. Con un
   src que aún no ha cargado, Safari lo esconde y pinta el vídeo negro con el ▶ tachado. La portada va como <img> encima
   mientras el vídeo no esté reproduciéndose de verdad. Se ejecutan preview(), posterPreview(), coverPreview() y el
   enlace de eventos del propio HTML contra un <video> de mentira que, como en iOS, no emite 'playing' por su cuenta. */
const ORIGIN = "http://localhost:8817";
class VideoFalso {
  constructor() { this.hidden = true; this.attrs = new Map(); this.l = {}; this._src = ""; this.paused = true; this.currentTime = 0; this.asignaciones = 0; }
  get src() { return this._src; }
  set src(v) { const habia = this._src; this._src = new URL(v, ORIGIN).href; this.asignaciones++; this.paused = true; if (habia) this.emit("emptied"); }
  get poster() { return this.attrs.get("poster") || ""; }
  set poster(v) { this.attrs.set("poster", String(v)); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  removeAttribute(k) { this.attrs.delete(k); }
  addEventListener(t, f) { (this.l[t] ||= []).push(f); }
  emit(t) { (this.l[t] || []).forEach((f) => f()); }
  pause() { if (!this.paused) { this.paused = true; this.emit("pause"); } }
  play() { this.paused = false; return Promise.resolve(); }
}
class ImgFalsa {
  constructor() { this.hidden = true; this.attrs = new Map(); this.l = {}; this.dataset = {}; this.pedidas = 0; }
  get src() { return this.attrs.get("src") || ""; }
  set src(v) { this.attrs.set("src", String(v)); this.pedidas++; }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  removeAttribute(k) { this.attrs.delete(k); }
  addEventListener(t, f) { (this.l[t] ||= []).push(f); }
  emit(t) { (this.l[t] || []).forEach((f) => f()); }
}
const PIEZAS_PREVIA = [
  { id: "a", title: "Con poster", lane: "municipal", seconds: 10, assetType: "video", stockId: "v-poster", asset: "https://stock.admira.store/stock/v-poster/asset.mp4" },
  { id: "b", title: "Sin portada", lane: "publicidad", seconds: 10, assetType: "video", stockId: "v-nada", asset: "https://stock.admira.store/stock/v-nada/asset.mp4" },
  { id: "c", title: "Imagen", lane: "municipal", seconds: 10, asset: "/parrilla/assets/logo.svg" },
  { id: "d", title: "YouTube", lane: "publicidad", seconds: 10, assetType: "video", stockId: "1783978476349-n8j27g", asset: "https://stock.admira.store/stock/1783978476349-n8j27g/asset.mp4?v=484305" },
];
function previa() {
  const vid = new VideoFalso(), cov = new ImgFalsa(), nodos = { previewVideo: vid, previewCover: cov };
  const $ = (id) => (nodos[id] ||= { hidden: false, textContent: "", src: "", removeAttribute() {} });
  const ctx = conIndice({
    $, location: { origin: ORIGIN }, URL, items: PIEZAS_PREVIA.map((x) => ({ ...x })), liveByPosition: {}, current: 0,
    previewedIndex: -1, playing: false, previewRodando: false, DEFAULT_MODE: false, resolvedTitle: (i) => PIEZAS_PREVIA[i].title,
  });
  for (const fn of ["posterPreview", "coverPreview", "enlazaPortadaPreview", "preview"]) vm.runInContext(extrae(fn), ctx);
  vm.runInContext("enlazaPortadaPreview()", ctx);
  return { ctx, vid, cov, run: (src) => vm.runInContext(src, ctx) };
}
const POSTER = "https://stock.admira.store/stock/v-poster/poster.jpg", YT = "https://img.youtube.com/vi/hCzwv9RPLkE/hqdefault.jpg";

test("vista previa: la portada tapa el vídeo hasta que se reproduce de verdad y vuelve al parar", () => {
  const { vid, cov, run } = previa();
  run("preview()");
  assert.equal(vid.hidden, false);
  assert.equal(cov.hidden, false, "parada: se ve la portada, no el negro de iOS");
  assert.equal(cov.src, POSTER);
  assert.equal(vid.poster, POSTER, "el poster se mantiene");
  // ▶ Reproducir: en iOS 'playing' puede no llegar nunca y la portada sigue ahí.
  run("playing=true;preview()");
  assert.equal(vid.paused, false);
  assert.equal(cov.hidden, false);
  vid.emit("playing");
  assert.equal(cov.hidden, true, "reproduciéndose de verdad, se ve el vídeo");
  // Un repintado a mitad (liveStatus cada 30 s, cambiar la duración) no la saca encima del vídeo que corre.
  run("preview()");
  assert.equal(cov.hidden, true);
  // ⏸ Pausar.
  run("playing=false");vid.pause();
  assert.equal(cov.hidden, false);
  vid.play(); vid.emit("playing"); assert.equal(cov.hidden, true);
  vid.emit("ended");
  assert.equal(cov.hidden, false, "al acabar, otra vez la portada");
});

test("vista previa: al cambiar de pieza vuelve la portada (la nueva), y sin portada o con imagen no hay capa", () => {
  const { vid, cov, run } = previa();
  run("playing=true;preview()"); vid.emit("playing");
  assert.equal(cov.hidden, true);
  // Siguiente pieza mientras se reproduce: nuevo src → portada de la nueva hasta su 'playing'.
  run("current=3;preview()");
  assert.equal(cov.hidden, false);
  assert.equal(cov.src, YT);
  vid.emit("playing"); assert.equal(cov.hidden, true);
  // Vídeo sin portada en el Stock: ni poster ni capa, como antes.
  run("playing=false;current=1;preview()");
  assert.equal(cov.hidden, true);
  assert.equal(vid.getAttribute("poster"), null);
  // Imagen: el vídeo se oculta y la capa también.
  run("current=2;preview()");
  assert.equal(vid.hidden, true);
  assert.equal(cov.hidden, true);
  // Lista vacía.
  run("items=[];current=0;preview()");
  assert.equal(cov.hidden, true);
});

test("vista previa: si la portada no carga se oculta y no se vuelve a pedir; otra pieza sí la enseña", () => {
  const { cov, run } = previa();
  run("preview()");
  assert.equal(cov.hidden, false);
  cov.emit("error");
  assert.equal(cov.hidden, true);
  const pedidas = cov.pedidas;
  run("preview();preview()");
  assert.equal(cov.hidden, true, "rota, no reaparece en cada repintado");
  assert.equal(cov.pedidas, pedidas, "ni se vuelve a descargar");
  run("current=3;preview()");
  assert.equal(cov.hidden, false);
  assert.equal(cov.src, YT);
});

test("vista previa: el src se sigue asignando al elegir la pieza, como en escritorio", () => {
  const { vid, run } = previa();
  run("preview()");
  assert.equal(vid.src, "https://stock.admira.store/stock/v-poster/asset.mp4", "no se espera a ▶ Reproducir");
  assert.equal(vid.paused, true);
  run("preview()");
  assert.equal(vid.asignaciones, 1, "repintar no recarga el vídeo");
});

test("vista previa: la capa va entre el vídeo y el contador, encaja como el vídeo y no tapa sus controles", () => {
  assert.match(html, /<video id="previewVideo" muted playsinline controls loop hidden><\/video><img id="previewCover" class="preview-cover" alt="" hidden><span class="counter" id="previewCounter">/);
  assert.match(html, /\.preview-screen \.preview-cover\{position:absolute;inset:0;pointer-events:none\}/);
  // Misma regla que el vídeo: contain, así respeta vertical u horizontal según la caja (9:16 o 16:9 en estrecho).
  assert.match(html, /\.preview-screen img,\.preview-screen video\{width:100%;height:100%;object-fit:contain;/);
  assert.match(html, /\.preview-screen \[hidden\]\{display:none\}/, "hidden gana a display:block");
  assert.match(html, /\n\s*enlazaPortadaPreview\(\);\n/, "los eventos del vídeo se enlazan al cargar");
});
