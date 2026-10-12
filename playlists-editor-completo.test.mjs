// Editor completo de /playlists/ (Carlos, 12-oct-2026): ordenar arrastrando, duración por pieza y de la vuelta,
// duplicar y eliminar UNA playlist, y guardar sin pisar lo que otra persona acaba de guardar.
// Se ejecuta el JavaScript REAL de la página en un DOM mínimo; el almacén xpl-store se simula con su mismo contrato.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const PAGINA = await readFile(new URL("./playlists/index.html", import.meta.url), "utf8");

function clases() { const s = new Set(); return { add: (...c) => c.forEach(x => s.add(x)), remove: (...c) => c.forEach(x => s.delete(x)), toggle: (c, f) => { const on = f === undefined ? !s.has(c) : !!f; if (on) s.add(c); else s.delete(c); return on; }, contains: c => s.has(c) }; }
function elemento(id) {
  return {
    id, textContent: "", value: "", className: "", hidden: false, disabled: false, onclick: null, scrollTop: 0, style: {}, dataset: {}, listeners: {}, classList: clases(), _html: "",
    get innerHTML() { return this._html; }, set innerHTML(v) { this._html = String(v); }, insertAdjacentHTML(_d, h) { this._html += String(h); },
    addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }, querySelectorAll: () => [], querySelector: () => null, closest: () => null, focus() {}, removeAttribute() {}, load() {},
  };
}
/** Almacén simulado. `ops:true` = el xpl-store nuevo (upsert/remove con conflicto); `ops:false` = el antiguo (sólo conjunto). */
function almacen({ flota = [], ops = true, cae = false } = {}) {
  const posts = []; let reloj = 5000;
  const red = async (url, opts = {}) => {
    url = String(url); const method = String(opts.method || "GET").toUpperCase();
    if (url.startsWith("https://xpl.admira.store/playlists")) {
      if (cae) throw new Error("sin red");
      if (method === "GET") return Response.json({ ok: true, playlists: structuredClone(flota), ...(ops ? { ops: ["upsert", "remove"] } : {}) });
      const b = JSON.parse(opts.body); posts.push(b);
      if (b.key !== "clave-xpl") return Response.json({ error: "clave requerida" }, { status: 401 });
      if (ops && b.upsert) {
        const i = flota.findIndex(p => p.id === b.upsert.id), actual = i >= 0 ? flota[i] : null;
        if (!b.force && b.base != null && (!actual || Number(actual.updatedAt) !== Number(b.base))) return Response.json({ error: "conflict", actual, playlists: structuredClone(flota) }, { status: 409 });
        const mia = { id: b.upsert.id, name: b.upsert.name, items: b.upsert.items || [], updatedAt: ++reloj };
        if (i >= 0) flota[i] = mia; else flota.unshift(mia);
        return Response.json({ ok: true, playlist: mia, playlists: structuredClone(flota) });
      }
      if (ops && b.remove != null) { const n = flota.length; flota.splice(0, n, ...flota.filter(p => p.id !== b.remove)); return Response.json({ ok: true, removed: n - flota.length, playlists: structuredClone(flota) }); }
      if (!Array.isArray(b.playlists)) return Response.json({ error: "nada que guardar" }, { status: 400 });
      flota.splice(0, flota.length, ...structuredClone(b.playlists)); return Response.json({ ok: true, count: flota.length });
    }
    if (url.endsWith("/stock/index.json")) return Response.json({ items: [] });
    if (url.includes("/stock/list")) return Response.json({ items: [] });
    if (url.includes("/signage/screens") || url.includes("/grid/screens")) return Response.json({ screens: [] });
    return new Response("no", { status: 404 });
  };
  return { flota, posts, red, cae: v => { cae = v; } };
}
function abre(alm, { storage = {}, confirma = () => true } = {}) {
  const els = new Map(), $ = id => { if (!els.has(id)) els.set(id, elemento(id)); return els.get(id); };
  const ls = new Map(Object.entries({ adtv_pl_key: "clave-xpl", ...storage })), dialogos = [], avisos = [];
  const ctx = {
    document: { getElementById: $, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {}, createElement: () => elemento("nuevo"), body: { classList: clases() } },
    localStorage: { getItem: k => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: k => ls.delete(k) },
    fetch: alm.red, confirm: m => { dialogos.push(String(m)); return confirma(String(m)); }, prompt: () => null, alert: m => avisos.push(String(m)),
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    console, URL, location: { href: "http://localhost/playlists/" }, navigator: { clipboard: { writeText() {} } },
    AdmiraVirtualPlayers: { list: async () => [], merge: (a, b) => a.concat(b), label: () => "" }, AdmiraEink: { apto: () => false, isEink: () => false },
  };
  ctx.window = ctx; vm.createContext(ctx);
  const ini = PAGINA.indexOf("<script>\n'use strict';"), fin = PAGINA.indexOf("</script>", ini);
  vm.runInContext(PAGINA.slice(ini + 8, fin), ctx);
  return { $, ls, dialogos, avisos, js: c => vm.runInContext(c, ctx) };
}
const plano = x => JSON.parse(JSON.stringify(x));
const reposa = async () => { for (let i = 0; i < 80; i++) await new Promise(r => setImmediate(r)); };
const pieza = (id, type = "video", extra = {}) => ({ id, title: "Pieza " + id, type, url: "https://stock.admira.store/stock/" + id + "/asset.mp4", thumbnail: null, category: null, audience: null, motor: null, ...extra });
const PL = (id, name, updatedAt, items = [pieza("p1")]) => ({ id, name, items, updatedAt });

test("ordenar: la pieza cae en el hueco donde se suelta y soltar en su sitio no cambia nada", async () => {
  const b = abre(almacen()); await reposa();
  const m = (de, a) => plano(b.js(`mueve(['a','b','c','d'],${de},${a})`)).join("");
  assert.equal(m(0, 2), "bacd"); assert.equal(m(0, 4), "bcda", "hasta el final");
  assert.equal(m(3, 0), "dabc", "hasta el principio"); assert.equal(m(2, 1), "acbd");
  assert.equal(m(1, 1), "abcd"); assert.equal(m(1, 2), "abcd", "el hueco de antes y el de después de sí misma son su sitio");
  assert.equal(m(9, 0), "abcd"); assert.equal(m(0, 9), "abcd"); assert.equal(b.js("mueve(['a'],0,null).join('')"), "a");
  // Las filas llevan asa para arrastrar y conservan ▲▼ para el teclado.
  b.js("openEdit(null,{id:'x',name:'X',items:" + JSON.stringify([pieza("p1"), pieza("p2")]) + "})");
  assert.match(b.$("edItems").innerHTML, /class="grip" data-grip="0"[\s\S]*data-mv="0\|-1"[\s\S]*class="grip" data-grip="1"/);
  assert.match(PAGINA, /\.plRow \.grip\{[^}]*touch-action:none/, "sin esto, en el móvil el dedo desplaza la lista en vez de arrastrar la fila");
});

test("duraciones: lo medido se ve por pieza, las imágenes cuentan a 10 s y la vuelta dice lo que le falta por medir", async () => {
  const b = abre(almacen(), { storage: { adtv_pl_dur: JSON.stringify({ v1: 31.4 }) } }); await reposa();
  const lista = [pieza("v1"), pieza("v2", "video", { dur: 89 }), pieza("i1", "image"), pieza("a1", "music"), pieza("v3")];
  b.js("openEdit(null,{id:'x',name:'X',items:" + JSON.stringify(lista) + "})");
  assert.deepEqual(plano(b.js("editDraft.items.map(durDe)")), [31.4, 89, null, 0, 0], "recordada · guardada con la playlist · imagen · sin medir");
  assert.deepEqual(plano(b.js("vueltaDe(editDraft.items)")), { seg: 130.4, imgs: 1, sinMedir: 2 });
  assert.equal(b.$("edTotal").textContent, "Vuelta ≈ 2:10 · 1 imagen a 10 s (o lo que marque la pantalla) · 2 piezas sin medir");
  assert.match(b.$("edItems").innerHTML, /<span class="du" title="Duración medida">0:31<\/span>[\s\S]*>1:29<\/span>[\s\S]*class="du pend"[^>]*>fija<\/span>[\s\S]*class="du pend"[^>]*>…<\/span>/);
  // Llega una medida (cabecera del vídeo leída): se apunta, se recuerda y la vuelta se actualiza sola.
  b.$("mEdit").classList.add("open"); b.js("apuntaDur('v3',59.6); apuntaDur('a1',180)");
  assert.equal(b.$("edTotal").textContent, "Vuelta ≈ 6:10 · 1 imagen a 10 s (o lo que marque la pantalla)");
  assert.deepEqual([0, 59.6, 60, 3599.5].map(s => b.js(`mmss(${s})`)), ["0:00", "1:00", "1:00", "60:00"], "sin «0:60»");
  assert.equal(b.js("vueltaTxt([])"), "");
});

test("guardar una playlist no pisa la que otra persona acaba de crear (almacén nuevo: viaja sólo la que se toca)", async () => {
  const alm = almacen({ flota: [PL("pl_a", "Mañanas", 100), PL("pl_b", "Tardes", 200)] });
  const b = abre(alm); await reposa();
  assert.equal(b.js("PL_OPS"), true);
  b.js("openEdit('pl_a')"); b.$("edName").value = "Mañanas de otoño";
  alm.flota.unshift(PL("pl_nueva", "La de otra persona", 300));   // otro navegador crea una mientras tanto
  await b.js("$('edSave').onclick()");
  const post = alm.posts.at(-1);
  assert.equal(post.upsert.id, "pl_a"); assert.equal(post.base, 100, "va con el sello con que se abrió"); assert.equal(post.playlists, undefined, "no viaja el conjunto");
  assert.deepEqual(alm.flota.map(p => p.name), ["La de otra persona", "Mañanas de otoño", "Tardes"], "la de la otra persona sigue ahí");
  assert.deepEqual(plano(b.js("PLAYLISTS.map(p=>p.id)")), ["pl_nueva", "pl_a", "pl_b"], "y este navegador ya la ve");
  assert.equal(b.$("mEdit").classList.contains("open"), false);
});

test("si otra persona cambió la MISMA playlist, se avisa y no se guarda sin decidirlo", async () => {
  const alm = almacen({ flota: [PL("pl_a", "Mañanas", 100)] });
  let respuesta = false;
  const b = abre(alm, { confirma: () => respuesta }); await reposa();
  b.js("openEdit('pl_a')"); b.$("mEdit").classList.add("open"); b.$("edName").value = "Mi versión";
  alm.flota[0] = PL("pl_a", "La versión de otra persona", 999, [pieza("p9")]);
  await b.js("$('edSave').onclick()");
  assert.match(b.dialogos.at(-1), /Otra persona ha guardado cambios en «La versión de otra persona» mientras la editabas[\s\S]*Aceptar: guardar TU versión encima/);
  assert.equal(alm.flota[0].name, "La versión de otra persona", "cancelar no escribe");
  assert.equal(b.$("mEdit").classList.contains("open"), true, "y la edición sigue abierta, sin perder lo hecho");
  assert.match(b.$("edHint").textContent, /Sin guardar: otra persona cambió esta playlist/); assert.equal(b.$("edSave").disabled, false);
  respuesta = true;
  await b.js("$('edSave').onclick()");
  assert.equal(alm.posts.at(-1).force, true); assert.equal(alm.flota[0].name, "Mi versión", "aceptar la pisa a sabiendas");
  // Y si la borraron mientras se editaba, también se dice.
  b.js("openEdit('pl_a')"); alm.flota.splice(0, 1); respuesta = false;
  await b.js("$('edSave').onclick()");
  assert.match(b.dialogos.at(-1), /Otra persona ha eliminado esta playlist mientras la editabas/); assert.equal(alm.flota.length, 0);
});

test("con un almacén antiguo (sólo conjunto) se lee lo que hay AHORA antes de escribir, y tampoco se pierde nada", async () => {
  const alm = almacen({ ops: false, flota: [PL("pl_a", "Mañanas", 100)] });
  const b = abre(alm); await reposa();
  assert.equal(b.js("PL_OPS"), false);
  b.js("openEdit('pl_a')"); b.$("edName").value = "Mañanas 2";
  alm.flota.push(PL("pl_z", "Creada por otro", 300));
  await b.js("$('edSave').onclick()");
  assert.deepEqual(alm.posts.at(-1).playlists.map(p => p.name), ["Mañanas 2", "Creada por otro"], "el conjunto que se escribe es el vivo, con mi cambio");
  // y el conflicto se detecta igual, comparando el sello
  b.js("openEdit('pl_a')"); alm.flota[0] = PL("pl_a", "De otro", 77777);
  const r = await b.js("guardaUna(Object.assign({},editDraft,{name:'Mía'}),editBase)");
  assert.equal(r.estado, "conflicto"); assert.equal(r.actual.name, "De otro"); assert.equal(alm.flota[0].name, "De otro");
});

test("playlist nueva: va delante, se guarda con las duraciones medidas y sin red se queda en este navegador", async () => {
  const alm = almacen({ flota: [PL("pl_a", "Mañanas", 100)] });
  const b = abre(alm, { storage: { adtv_pl_dur: JSON.stringify({ p7: 42 }) } }); await reposa();
  b.js("openEdit(null)"); b.$("edName").value = "Nueva"; b.js("editDraft.items=" + JSON.stringify([pieza("p7"), pieza("i1", "image")]));
  await b.js("$('edSave').onclick()");
  const up = alm.posts.at(-1).upsert;
  assert.equal(alm.posts.at(-1).base, undefined, "una nueva no tiene con qué chocar");
  assert.deepEqual(up.items.map(i => i.dur), [42, undefined], "la duración medida viaja con la pieza; la imagen no tiene");
  assert.deepEqual(alm.flota.map(p => p.name), ["Nueva", "Mañanas"]);
  alm.cae(true);
  b.js("openEdit(null)"); b.$("edName").value = "Sin red"; b.js("editDraft.items=" + JSON.stringify([pieza("p7")]));
  await b.js("$('edSave').onclick()");
  assert.equal(b.js("PLAYLISTS[0].name"), "Sin red"); assert.equal(b.js("PL_SHARED"), false);
  assert.match(b.$("fleetFlag").textContent, /solo locales/, "y se dice que no está compartida");
  assert.equal(alm.flota.length, 2);
});

test("duplicar abre una copia que no existe hasta que se guarda; eliminar borra sólo esa", async () => {
  const alm = almacen({ flota: [PL("pl_a", "Mañanas", 100, [pieza("p1"), pieza("p2")]), PL("pl_b", "Mañanas (copia)", 200), PL("pl_c", "Tardes", 300)] });
  const b = abre(alm); await reposa();
  const antes = alm.posts.length;
  b.js("duplica('pl_a')");
  assert.equal(b.$("edName").value, "Mañanas (copia 2)", "no repite un nombre que ya existe");
  assert.equal(b.js("editId"), null); assert.equal(b.js("editBase"), null); assert.notEqual(b.js("editDraft.id"), "pl_a");
  assert.deepEqual(plano(b.js("editDraft.items.map(i=>i.id)")), ["p1", "p2"]);
  assert.equal(alm.posts.length, antes, "duplicar no escribe nada"); assert.equal(alm.flota.length, 3);
  b.js("editDraft.items.pop()"); assert.equal(alm.flota[0].items.length, 2, "la copia no comparte piezas con el original");
  assert.equal(b.js("nombreCopia('Mañanas (copia)')"), "Mañanas (copia 2)"); assert.equal(b.js("nombreCopia('Tardes')"), "Tardes (copia)");
  await b.js("$('edSave').onclick()");
  assert.equal(alm.flota.length, 4); assert.equal(alm.flota[0].name, "Mañanas (copia 2)");

  await b.js("eliminaPlaylist('pl_c')");
  assert.match(b.dialogos.at(-1), /¿Eliminar la playlist «Tardes» \(1 pieza\)\?[\s\S]*Se borra para todos los equipos/);
  assert.deepEqual(alm.posts.at(-1), { key: "clave-xpl", remove: "pl_c" });
  assert.deepEqual(alm.flota.map(p => p.id).includes("pl_c"), false); assert.equal(alm.flota.length, 3);
  assert.equal(b.js("PLAYLISTS.length"), 3);
});

test("eliminar: cancelar no borra, una playlist asignada exige la clave de la parrilla y sin red no se borra a medias", async () => {
  const alm = almacen({ flota: [PL("pl_a", "Mañanas", 100), PL("pl_b", "Tardes", 200)] });
  let respuesta = false;
  const b = abre(alm, { confirma: () => respuesta, storage: { adtv_pl_assign: JSON.stringify({ pl_b: [{ screen: "led-1", name: "LED", scope: "now" }] }) } }); await reposa();
  const antes = alm.posts.length;
  await b.js("eliminaPlaylist('pl_a')"); assert.equal(alm.posts.length, antes); assert.equal(alm.flota.length, 2);
  await b.js("eliminaPlaylist('pl_b')");
  assert.match(b.avisos.at(-1), /«Tardes» está asignada a 1 pantalla[\s\S]*falta la clave GRID_KEY/); assert.equal(alm.flota.length, 2, "no se borra dejando la parrilla emitiendo algo huérfano");
  respuesta = true; alm.cae(true);
  await b.js("eliminaPlaylist('pl_a')");
  assert.match(b.avisos.at(-1), /No he podido eliminarla de la flota/); assert.equal(b.js("PLAYLISTS.length"), 2, "sigue aquí: la flota la devolvería al sincronizar");
});
