// Selector de contenidos de /playlists/ a la altura del Stock (Carlos, 12-oct-2026). Se ejecuta el JavaScript REAL de
// la página en un DOM mínimo, con la red simulada. Antes el selector pedía /stock/list?limit=300 y enseñaba 160 de las
// 1.400 piezas; ahora lee el índice completo, sólo ofrece lo que un player puede emitir y se busca por nº de pieza.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const PLAYLISTS = await readFile(new URL("./playlists/index.html", import.meta.url), "utf8");

// ── Un navegador mínimo: lo justo para que corra el script de la página ──
function clases() { const s = new Set(); return { add: (...c) => c.forEach(x => s.add(x)), remove: (...c) => c.forEach(x => s.delete(x)), toggle: (c, f) => { const on = f === undefined ? !s.has(c) : !!f; if (on) s.add(c); else s.delete(c); return on; }, contains: c => s.has(c) }; }
function elemento(id) {
  return {
    id, textContent: "", value: "", className: "", hidden: false, disabled: false, onclick: null, scrollTop: 0, style: {}, dataset: {}, listeners: {}, classList: clases(), _html: "",
    get innerHTML() { return this._html; }, set innerHTML(v) { this._html = String(v); },
    insertAdjacentHTML(_donde, html) { this._html += String(html); },
    addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }, querySelectorAll: () => [], querySelector: () => null, closest: () => null, focus() {},
  };
}
function abre({ indice, lista = [], indiceCae = false, storage = {} } = {}) {
  const els = new Map(), $ = id => { if (!els.has(id)) els.set(id, elemento(id)); return els.get(id); };
  const ls = new Map(Object.entries(storage)), pedidas = [];
  const red = async url => {
    url = String(url); pedidas.push(url);
    if (url.startsWith("https://xpl.admira.store/playlists")) return Response.json({ ok: true, playlists: [] });
    if (url.endsWith("/stock/index.json")) { if (indiceCae) throw new Error("sin red"); return Response.json({ items: structuredClone(indice), total: indice.length }); }
    if (url.includes("/stock/list")) return Response.json({ items: structuredClone(lista) });
    if (url.includes("/signage/screens") || url.includes("/grid/screens")) return Response.json({ screens: [] });
    return new Response("no", { status: 404 });
  };
  const ctx = {
    document: { getElementById: $, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} },
    localStorage: { getItem: k => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: k => ls.delete(k) },
    fetch: red, confirm: () => true, prompt: () => null, alert() {}, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    console, URL, location: { href: "http://localhost/playlists/" }, navigator: { clipboard: { writeText() {} } },
    AdmiraVirtualPlayers: { list: async () => [], merge: (a, b) => a.concat(b), label: () => "" },
    AdmiraEink: { apto: () => false, isEink: () => false },
  };
  ctx.window = ctx; vm.createContext(ctx);
  const ini = PLAYLISTS.indexOf("<script>\n'use strict';"), fin = PLAYLISTS.indexOf("</script>", ini);
  assert.ok(ini > 0 && fin > ini, "encuentro el script de /playlists/");
  vm.runInContext(PLAYLISTS.slice(ini + 8, fin), ctx);
  return { $, ls, pedidas, js: codigo => vm.runInContext(codigo, ctx) };
}
const plano = x => JSON.parse(JSON.stringify(x));
const reposa = async () => { for (let i = 0; i < 60; i++) await new Promise(r => setImmediate(r)); };

const pieza = (num, extra = {}) => ({ id: "p" + num, num, type: "video", mime: "video/mp4", title: "Pieza " + num, tags: [], category: "marca", audience: "all", url: `https://stock.admira.store/stock/p${num}/asset.mp4`, thumbnail: null, poster: null, ...extra });
// 130 vídeos corrientes (del más reciente al más antiguo, como llega el índice) y unas piezas con nombre propio.
const CORRIENTES = Array.from({ length: 130 }, (_, i) => pieza(1000 - i));
const INDICE = [
  pieza(1457, { title: "Café de la mañana", tags: ["cafetería", "promo"], poster: "https://api.admira.store/stock/poster/p1457", orientacion: "vertical" }),
  pieza(1456, { title: "Escaparate otoño", tags: ["moda", "horizontal"] }),
  pieza(1455, { type: "image", mime: "image/png", title: "Cartel 14", ancho: 1080, alto: 1920, thumbnail: "https://stock.admira.store/stock/p1455/thumb.jpg" }),
  pieza(1454, { type: "music", mime: "audio/mpeg", title: "Hilo musical suave" }),
  pieza(14, { title: "La pieza catorce" }),
  { ...pieza(1453), type: "link", mime: "text/uri-list" },
  { ...pieza(1452), type: "furni", mime: "model/gltf-binary" },
  { ...pieza(1451), type: "capsula", mime: "text/plain" },
  { ...pieza(1450), type: "guion", mime: "text/plain" },
  { ...pieza(1449), type: "twin-npc", mime: "image/png" },
  { ...pieza(1448), type: "interactive", mime: "text/html" },
  { ...pieza(1447), url: "" },
  ...CORRIENTES,
];

test("el selector lee el índice completo del Stock y sólo ofrece lo que un player puede emitir", async () => {
  const b = abre({ indice: INDICE });
  await reposa();
  assert.ok(b.pedidas.includes("https://stock.admira.store/stock/index.json"), "pide el índice completo");
  assert.ok(!b.pedidas.some(u => u.includes("/stock/list?limit=300")), "y no las «últimas 300» de /stock/list");
  assert.equal(b.js("STOCK_FULL"), true);
  assert.equal(b.js("STOCK.length"), 135, "5 con nombre + 130 corrientes: fuera enlaces, muebles, cápsulas, guiones, NPC, HTML y lo que no tiene url");
  assert.deepEqual(plano(b.js("STOCK.filter(x=>x.num>1400).map(x=>x.type)")), ["video", "video", "image", "music"]);
});

test("si el índice no responde se sigue con /stock/list y el selector lo avisa", async () => {
  const b = abre({ indiceCae: true, lista: [pieza(9), pieza(8)] });
  await reposa();
  assert.equal(b.js("STOCK_FULL"), false); assert.equal(b.js("STOCK.length"), 2);
  b.js("openEdit(null); openPicker()");
  assert.match(b.$("pkSrc").textContent, /índice completo del Stock no responde[\s\S]*2 piezas más recientes/);
  assert.match(b.$("pkSrc").className, /warn/);
});

test("se busca por título y etiqueta sin acentos, y por nº de pieza", async () => {
  const b = abre({ indice: INDICE });
  await reposa();
  b.js("openEdit(null); openPicker()");
  const busca = q => { b.$("pkQ").value = q; b.js("renderPicker()"); return plano(b.js("pkList.map(x=>x.num)")); };
  assert.deepEqual(busca("cafe"), [1457], "«cafe» encuentra «Café» y «cafetería»");
  assert.deepEqual(busca("CAFETERIA promo"), [1457], "todas las palabras tienen que estar");
  assert.deepEqual(busca("#14"), [14], "#14 es la pieza 14, no la 1455 ni «Cartel 14»");
  assert.deepEqual(busca("14"), [1455, 14, 914], "sin almohadilla vale el número o el texto del título (no trozos del id interno)");
  assert.deepEqual(busca("p1456"), [1456], "el id interno entero también vale");
  assert.deepEqual(busca("#99999"), []);
});

test("filtros: orientación declarada (campo, medidas o tag), audio y categoría sacada del propio Stock", async () => {
  const b = abre({ indice: INDICE });
  await reposa();
  b.js("openEdit(null); openPicker()");
  const con = (id, v) => { b.$("pkQ").value = ""; ["pkType", "pkAud", "pkCat", "pkOri"].forEach(x => { b.$(x).value = x === id ? v : ""; }); b.js("renderPicker()"); return plano(b.js("pkList.map(x=>x.num)")); };
  const sinDato = [14, ...CORRIENTES.map(x => x.num)];   // vídeos que no declaran formato: van detrás, no se esconden
  assert.deepEqual(con("pkOri", "v"), [1457, 1455, ...sinDato], "campo orientacion y alto > ancho delante; fuera el horizontal y el audio");
  assert.match(b.$("pkSrc").textContent, /^2 verticales confirmadas primero · después 131 que no declaran formato/);
  assert.match(b.$("pkGrid").innerHTML, /data-pk="p14">[\s\S]*?<span class="or">\?<\/span>/, "las dudosas llevan «?»");
  assert.deepEqual(con("pkOri", "h"), [1456, ...sinDato], "tag «horizontal»");
  assert.deepEqual(con("pkType", "audio"), [1454], "music cuenta como audio");
  assert.match(b.$("pkCat").innerHTML, /<option value="marca">Marca · 135<\/option>/, "las categorías salen del Stock, con su cuenta");
});

test("el Stock entero se pinta por tandas de 60 y «mostrar más» añade sin repintar", async () => {
  const b = abre({ indice: INDICE });
  await reposa();
  b.js("openEdit(null); openPicker()");
  const tarjetas = () => (b.$("pkGrid").innerHTML.match(/class="pkItem/g) || []).length;
  assert.equal(tarjetas(), 60); assert.equal(b.$("pkMore").hidden, false);
  assert.match(b.$("pkMore").textContent, /Mostrar 60 más · quedan 75/);
  assert.match(b.$("pkHint").textContent, /0 seleccionadas · 60 de 135 piezas/);
  const antes = b.$("pkGrid").innerHTML;
  b.$("pkMore").onclick();
  assert.equal(tarjetas(), 120); assert.ok(b.$("pkGrid").innerHTML.startsWith(antes), "lo ya pintado no se toca");
  b.$("pkMore").onclick(); b.$("pkMore").onclick();
  assert.equal(tarjetas(), 135); assert.equal(b.$("pkMore").hidden, true);
});

test("la portada de un vídeo es su poster, la pieza añadida lo conserva y el selector marca lo que ya está", async () => {
  const b = abre({ indice: INDICE });
  await reposa();
  b.js("openEdit(null); openPicker()");
  assert.match(b.$("pkGrid").innerHTML, /<img src="https:\/\/api\.admira\.store\/stock\/poster\/p1457"/, "poster como portada: antes salía en negro");
  assert.match(b.$("pkGrid").innerHTML, /<span class="nu">#1457<\/span>/, "cada tarjeta dice su nº de pieza");
  b.js("pkToggle('p1457',null); pkToggle('p1454',null)");
  assert.match(b.$("pkHint").textContent, /^2 seleccionadas/); assert.equal(b.$("pkClear").hidden, false);
  b.$("pkAddSel").onclick();
  assert.deepEqual(plano(b.js("editDraft.items")), [
    { id: "p1457", title: "Café de la mañana", type: "video", url: "https://stock.admira.store/stock/p1457/asset.mp4", thumbnail: "https://api.admira.store/stock/poster/p1457", category: "marca", audience: "all", motor: null },
    { id: "p1454", title: "Hilo musical suave", type: "music", url: "https://stock.admira.store/stock/p1454/asset.mp4", thumbnail: null, category: "marca", audience: "all", motor: null },
  ], "la plantilla guarda la misma forma de siempre: xpl-store no cambia");
  assert.match(b.$("edItems").innerHTML, /#1457 · video · ▯ vertical/, "la fila del editor dice nº, tipo y orientación");
  b.js("openPicker()");
  assert.match(b.$("pkGrid").innerHTML, /data-pk="p1457">[\s\S]*?<span class="ya">ya está<\/span>/);
});

test("una pieza de la playlist que ya no está en el Stock se avisa en el editor", async () => {
  const b = abre({ indice: INDICE, storage: { adtv_playlists: JSON.stringify([{ id: "pl_x", name: "Cierre", items: [{ id: "borrada", title: "Locución cierre", type: "locucion", url: "https://x/y.mp3" }, { id: "p1456", title: "Escaparate otoño", type: "video", url: "https://x/z.mp4" }] }]) } });
  await reposa();
  b.js("PLAYLISTS=JSON.parse(localStorage.getItem('adtv_playlists')); openEdit('pl_x')");
  const filas = b.$("edItems").innerHTML.split('class="plRow"').slice(1);
  assert.match(filas[0], /ya no está en el Stock/); assert.doesNotMatch(filas[1], /ya no está en el Stock/);
});

test("Escape cierra sólo el modal de encima: el selector no se lleva el editor a medio hacer", () => {
  assert.match(PLAYLISTS, /const abiertos=\[\.\.\.document\.querySelectorAll\('\.modal\.open'\)\], top=abiertos\[abiertos\.length-1\];/);
  assert.match(PLAYLISTS, /if\(e\.key==='Escape'\)\{ e\.preventDefault\(\); closeModal\(top\.id\); \}/);
  assert.doesNotMatch(PLAYLISTS, /querySelectorAll\('\.modal\.open'\)\.forEach\(m=>m\.classList\.remove\('open'\)\)/, "ya no se cierran todos de golpe");
  // el modal de la vista previa va el último en el documento: es el que queda encima y el primero que se cierra
  assert.ok(PLAYLISTS.indexOf('id="mPrev"') > PLAYLISTS.indexOf('id="mAssign"') && PLAYLISTS.indexOf('id="mAssign"') > PLAYLISTS.indexOf('id="mPick"'));
});

test("lo recién subido que aún no está en el índice entra por la cabeza de /stock/list y no se da por borrado", async () => {
  const b = abre({ indice: INDICE, lista: [pieza(1500, { title: "Recién subida" }), pieza(1457)] });
  await reposa();
  assert.ok(b.pedidas.some(u => u.includes("/stock/list?limit=60")), "pide la cabeza en vivo");
  assert.deepEqual(plano(b.js("STOCK.slice(0,2).map(x=>x.num)")), [1500, 1457], "la nueva va delante y la repetida no se duplica");
  assert.equal(b.js("STOCK.length"), 136); assert.equal(b.js("STOCK_IDS.has('p1500')"), true);
});

test("la orientación no se aprende de portadas de YouTube (siempre 4:3) y las imágenes sin portada de más de 1,5 MB no se bajan", async () => {
  const b = abre({ indice: [pieza(7, { type: "image", mime: "image/png", size: 26_000_000 }), pieza(6, { type: "image", mime: "image/png", size: 200_000 }), ...INDICE] });
  await reposa();
  assert.equal(b.js("portadaFiable('https://img.youtube.com/vi/abc/hqdefault.jpg')"), false);
  assert.equal(b.js("portadaFiable('https://i.ytimg.com/vi/abc/hqdefault.jpg')"), false);
  assert.equal(b.js("portadaFiable('https://stock.admira.store/stock/p1/poster.jpg')"), true);
  assert.equal(b.js("thumbHtml(STOCKMAP.p7)"), "🖼", "26 MB: icono");
  assert.match(b.js("thumbHtml(STOCKMAP.p6)"), /^<img src="https:\/\/stock\.admira\.store\/stock\/p6\/asset\.mp4"/, "200 KB: el original vale de miniatura");
  // lo que mide la vista previa manda sobre lo aprendido, pero nunca sobre lo que la pieza declara
  b.js("oriApunta('p14','h')"); assert.equal(b.js("oriDe(STOCKMAP.p14)"), "h");
  b.js("oriApunta('p1457','h')"); assert.equal(b.js("oriDe(STOCKMAP.p1457)"), "v", "declarada vertical: lo aprendido no la pisa");
});
