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

function sandbox(projectId = "xtanco", items = CONTENIDOS, screens = PANTALLAS) {
  const ctx = { projects: PROYECTOS, screens, items, activeProjectId: projectId, plMode: "tag",
    plTagSel: new Set(), plItemSel: new Set() };
  vm.createContext(ctx);
  for (const fn of ["projectFor", "plTagsPresentes", "plTagLabel", "plDevicesProyecto", "plSeleccion"]) {
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

test("los tags salen de los contenidos, con su recuento, no de una lista fija", () => {
  const ctx = sandbox();
  // Los objetos nacidos dentro del vm son de otro realm y deepEqual los rechaza
  // por referencia aunque coincidan: se comparan serializados.
  assert.deepEqual(JSON.parse(vm.runInContext("JSON.stringify(plTagsPresentes())", ctx)),
    [{ tag: "municipal", count: 2 }, { tag: "publicidad", count: 2 }]);
  // Un tag nuevo aparece solo, sin tocar código.
  const conNuevo = sandbox("xtanco", CONTENIDOS.concat([{ id: "x", title: "Aviso", lane: "emergencias", seconds: 8 }]));
  assert.deepEqual(JSON.parse(vm.runInContext("JSON.stringify(plTagsPresentes().map(t=>t.tag))", conNuevo)),
    ["emergencias", "municipal", "publicidad"]);
});

test("por tag entra todo lo del tag; a mano, exactamente lo marcado", () => {
  const ctx = sandbox();
  vm.runInContext("plTagSel.add('municipal')", ctx);
  assert.deepEqual(JSON.parse(vm.runInContext("JSON.stringify(plSeleccion().map(i=>i.id))", ctx)), ["logo", "sabias"]);
  vm.runInContext("plTagSel.add('publicidad')", ctx);
  assert.equal(vm.runInContext("plSeleccion().length", ctx), 4);

  vm.runInContext("plMode='manual'; plItemSel.add('ad-a'); plItemSel.add('sabias')", ctx);
  assert.deepEqual(JSON.parse(vm.runInContext("JSON.stringify(plSeleccion().map(i=>i.id))", ctx)), ["ad-a", "sabias"],
    "a mano se respeta el ORDEN de la parrilla, no el orden en que se marcó");
});

test("sin tags ni contenidos marcados no se compone nada", () => {
  const ctx = sandbox();
  assert.deepEqual(JSON.parse(vm.runInContext("JSON.stringify(plSeleccion())", ctx)), []);
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
