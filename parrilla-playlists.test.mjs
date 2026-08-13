/* Playlists desde la pastilla de programación (Carlos, 12-ago-2026): «tenemos que
   poder crear playlist —asignarle un nombre y un conjunto de dispositivos IoT a los
   que asignárselos que estén en el mismo proyecto— en la pastilla de programación,
   básicamente por tags (poder seleccionar la tag que forma la playlist o escoger
   los contenidos manualmente)».

   Lo que se guarda aquí es lo que hace la función correcta y no sólo bonita: que
   una playlist NUNCA pueda caer en una pantalla de otro proyecto, que los tags
   salgan de los contenidos y no de una lista fija, y que asignar —que sobrescribe
   el borrador de otras pantallas— no ocurra a espaldas de nadie. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const html = await readFile(new URL("./parrilla/index.html", import.meta.url), "utf8");
const cms = await readFile(new URL("./cms.html", import.meta.url), "utf8");
const canal = await readFile(new URL("./canal.html", import.meta.url), "utf8");

/* Se extraen las funciones puras del propio HTML y se ejecutan de verdad: un
   assert.match sobre el texto pasa aunque la lógica esté al revés. */
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

const PROYECTOS = [
  { id: "kiosk", name: "CanalKiosk", circuits: ["kiosko", "gracia"] },
  { id: "xtanco", name: "Canal Xtanco", circuits: ["xtanco", "xtanco-valencia"] },
];
const PANTALLAS = [
  { screen: "sim-gracia-kiosko", name: "Canal Kiosk Plaça Vila", circuit: "gracia" },
  { screen: "xtanco-led-frontal", name: "LED Frontal", circuit: "xtanco" },
  { screen: "xtanco-led-vertical", name: "LED Vertical", circuit: "xtanco" },
  { screen: "xtanco-mostrador-panel", name: "Mostrador panel", circuit: "xtanco" },
  { screen: "xtore-escaparate-pn1w", name: "Xtanco Valencia · Escaparate Colón", circuit: "xtanco-valencia" },
  { screen: "xtanco-camara-1", name: "Cámara entrada", circuit: "xtanco", programmable: false },
];
const CONTENIDOS = [
  { id: "logo", title: "Ajuntament · Sempre amb tu", lane: "municipal", seconds: 10 },
  { id: "ad-a", title: "Publicidad local A", lane: "publicidad", seconds: 10 },
  { id: "sabias", title: "¿Sabías que?", lane: "municipal", seconds: 15 },
  { id: "ad-b", title: "Publicidad local B", lane: "publicidad", seconds: 10 },
];

/* El Stock real de pixeria, tal como lo devuelve el índice público: los tags
   llevan tilde y hay variantes que también son música. */
const STOCK = [
  { id: "a1", title: "Berlin · Take My Breath Away", type: "video", tags: ["música", "videoclip", "cine", "good"] },
  { id: "a2", title: "Huey Lewis · The Power Of Love", type: "video", tags: ["música", "videoclip", "pop 80s"] },
  { id: "a3", title: "Billboard Top 30 · 1985", type: "video", tags: ["listas música", "años 80"] },
  { id: "a4", title: "Robot de sala", type: "image", tags: ["tecnología", "ia"] },
  { id: "a5", title: "Curso de atención", type: "capsula", tags: ["formacion"] },
  { id: "a6", title: "Sin etiquetar", type: "image", tags: [] },
];

function sandbox(projectId = "xtanco", items = CONTENIDOS, screens = PANTALLAS, stock = STOCK) {
  const ctx = { projects: PROYECTOS, screens, items, activeProjectId: projectId, plMode: "tag",
    plTagSel: new Set(), plItemSel: new Set(), stockPiezas: stock, stockEstado: "ok" };
  vm.createContext(ctx);
  for (const fn of ["projectFor", "plNorm", "plPiezaTags", "plTagCatalogo", "plTagsQueCasan",
                    "plPiezaAItem", "plPool", "plTagLabel", "plDevicesProyecto", "plSeleccion"]) {
    vm.runInContext(extrae(fn), ctx);
  }
  return ctx;
}

test("los dispositivos ofrecidos son SÓLO los del proyecto activo", () => {
  const ctx = sandbox("xtanco");
  const ids = vm.runInContext("plDevicesProyecto().map(s=>s.screen)", ctx);
  assert.deepEqual(ids, ["xtanco-led-frontal", "xtanco-led-vertical", "xtanco-mostrador-panel", "xtore-escaparate-pn1w"]);
  // Ni la del otro proyecto, ni la que no tiene parrilla de vídeo.
  assert.ok(!ids.includes("sim-gracia-kiosko"), "una pantalla de CanalKiosk no puede aparecer en Canal Xtanco");
  assert.ok(!ids.includes("xtanco-camara-1"), "una cámara no admite parrilla y no debe ofrecerse");
});

test("cambiar de proyecto cambia por completo la lista de destinos", () => {
  const ctx = sandbox("kiosk");
  const ids = vm.runInContext("plDevicesProyecto().map(s=>s.screen)", ctx);
  assert.deepEqual(ids, ["sim-gracia-kiosko"]);
});

test("el catálogo de tags sale del Stock de pixeria, ordenado por uso", () => {
  const ctx = sandbox();
  const cat = JSON.parse(vm.runInContext("JSON.stringify(plTagCatalogo())", ctx));
  assert.equal(cat[0].tag, "música");
  assert.equal(cat[0].count, 2);
  // Una pieza sin tags no inventa ninguno.
  assert.ok(!cat.some((t) => !t.tag));
});

// AQUÍ estaba la trampa: el tag real se escribe «música» con tilde y quien teclea
// «#musica» no encontraría NADA, sin ninguna pista de por qué.
test("#musica encuentra música: se normaliza tilde, mayúscula y almohadilla", () => {
  const ctx = sandbox();
  for (const escrito of ["#musica", "musica", "MÚSICA", " Música ", "#MUSICA"]) {
    const casan = JSON.parse(vm.runInContext(`JSON.stringify(plTagsQueCasan(${JSON.stringify(escrito)}))`, ctx));
    assert.ok(casan.some((c) => c.tag === "música"), `«${escrito}» debe encontrar el tag música`);
  }
});

test("un tag casa también con los que lo contienen como palabra entera", () => {
  const ctx = sandbox();
  const casan = JSON.parse(vm.runInContext('JSON.stringify(plTagsQueCasan("musica").map(c=>c.tag))', ctx));
  assert.deepEqual(casan.sort(), ["listas música", "música"], "«listas música» es música igualmente");
  // Pero no casa a trozos: «ia» no puede arrastrar «formacion» ni «música».
  const ia = JSON.parse(vm.runInContext('JSON.stringify(plTagsQueCasan("ia").map(c=>c.tag))', ctx));
  assert.deepEqual(ia, ["ia"]);
});

test("un tag inexistente no casa con nada, no devuelve el catálogo entero", () => {
  const ctx = sandbox();
  assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(plTagsQueCasan("cocina"))', ctx)), []);
  assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(plTagsQueCasan("#"))', ctx)), []);
});

test("por tag entran TODAS las piezas del tag; a mano, sólo las marcadas", () => {
  const ctx = sandbox();
  vm.runInContext("plTagSel.add('musica')", ctx);
  const porTag = JSON.parse(vm.runInContext("JSON.stringify(plSeleccion().map(i=>i.id))", ctx));
  assert.deepEqual(porTag, ["stock-a1", "stock-a2", "stock-a3"], "las tres, incluida la de «listas música»");

  vm.runInContext("plMode='manual'; plItemSel.add('stock-a2')", ctx);
  assert.deepEqual(JSON.parse(vm.runInContext("JSON.stringify(plSeleccion().map(i=>i.id))", ctx)), ["stock-a2"]);
});

test("sin tag, el conjunto es todo el Stock: a mano se puede elegir igual", () => {
  const ctx = sandbox();
  // En modo tag sin filtro entra todo — es lo que dice el resumen antes de crear.
  assert.equal(vm.runInContext("plSeleccion().length", ctx), STOCK.length);
  vm.runInContext("plMode='manual'", ctx);
  assert.deepEqual(JSON.parse(vm.runInContext("JSON.stringify(plSeleccion())", ctx)), []);
});

test("la pieza del Stock entra como pieza de parrilla, con su duración por defecto", () => {
  const ctx = sandbox();
  const it = JSON.parse(vm.runInContext('JSON.stringify(plPiezaAItem(stockPiezas[0]))', ctx));
  assert.equal(it.id, "stock-a1");
  assert.equal(it.title, "Berlin · Take My Breath Away");
  assert.equal(it.seconds, 10, "el Stock no guarda duración: entra con la de la parrilla");
  assert.equal(it.stockId, "a1");
  assert.match(it.sub, /^pixeria · video/);
});

test("la pastilla ofrece la creación y los dos modos", () => {
  assert.match(html, /id="plOpen"[^>]*>＋ Nueva playlist/);
  assert.match(html, /id="plName"/);
  assert.match(html, /id="plModeTag"[\s\S]{0,120}Por tag/);
  assert.match(html, /id="plModeManual"[\s\S]{0,120}A mano/);
  assert.match(html, /id="plDevices"/);
});

test("asignar avisa de que sobrescribe, nombra las pantallas y no finge sin GRID_KEY", () => {
  const aplicar = extrae("plAplicar");
  // Sin clave no hay escritura remota posible: se dice, no se simula.
  assert.match(aplicar, /if\(!key\)\{feedback\(/);
  assert.match(aplicar, /Sin GRID_KEY no se puede asignar/);
  // Confirmación con los nombres de las pantallas delante.
  assert.match(aplicar, /devs\.map\(s=>'· '\+s\.name\)\.join\('\\n'\)/);
  assert.match(aplicar, /Se sobrescribe el borrador de cada uno/);
  // El destino se vuelve a filtrar por proyecto en el momento de aplicar, no sólo
  // al elegir: una playlist guardada ayer no puede escribir fuera de su proyecto.
  assert.match(aplicar, /plDevicesProyecto\(\)\.filter\(s=>pl\.devices\.includes\(s\.screen\)\)/);
  // Un 409 es un fallo, no un éxito silencioso.
  assert.match(aplicar, /r\.status===409\?'otro editor se adelantó'/);
  assert.match(aplicar, /ok\+' de '\+devs\.length\+' dispositivos/);
});

test("Flota llama Por defecto a la playlist base y abre el editor exacto del player", () => {
  assert.match(cms, /<b>Por defecto<\/b>/);
  assert.match(cms, /\/parrilla\/\?project=/);
  assert.match(cms, /&playlist=default/);
  assert.doesNotMatch(cms, /— sin parrilla/);
});

test("Por defecto admite empezar vacía, añadir, eliminar y arrastrar contenidos", () => {
  assert.match(html, /PLAYLIST_ID=BOOT_QUERY\.get\('playlist'\)/);
  assert.match(html, /DEFAULT_MODE=PLAYLIST_ID==='default'/);
  assert.match(html, /Por defecto está vacía/);
  assert.match(html, /id="removeCurrent"/);
  assert.match(html, /addEventListener\('dragstart'/);
  assert.match(html, /plTagSel/);
  assert.match(html, /plItemSel/);
  assert.match(html, /name:'Por defecto'/);
  assert.match(html, /routeScreen=query\.get\('device'\)\|\|query\.get\('screen'\)/);
  assert.match(html, /offlineContext:true/);
});

test("el player carga su borrador default y lo trata como playlist base cacheable", () => {
  assert.match(canal, /grid\/draft\?screen=.*playlist=default/);
  assert.match(canal, /DEFAULT_DRAFT\.items\.length&&!syncOn&&!gridInjected\.length/);
  assert.match(canal, /motor:'parrilla-default'/);
  assert.match(canal, /signagePlaylistPush\(\)/);
  assert.match(canal, /schedulePrecache\(\)/);
});
