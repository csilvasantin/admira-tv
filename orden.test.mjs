import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { renumera, revisa, reordena, mueve } from "./orden.mjs";

const censo = JSON.parse(await readFile(new URL("./subapps.json", import.meta.url), "utf8"));
const raiz = new URL("./", import.meta.url);

test("el censo publicado está sano", () => {
  assert.deepEqual(revisa(censo), []);
});

// Carlos pidió el alias con este formato exacto: «01.- Cartelería digital».
test("el alias lleva dos dígitos, punto, guion y el nombre en español", () => {
  for (const x of censo) {
    assert.match(x.alias, /^\d{2}\.- .+/, `alias mal formado en ${x.slug}`);
    assert.equal(x.alias, `${String(x.n).padStart(2, "0")}.- ${x.name_es}`);
  }
});

// El censo tiene que cubrir el repositorio: una subapp fuera del censo es una
// subapp sin número, y «la 07» dejaría de identificar a nadie.
test("toda carpeta con index.html está en el censo", async () => {
  const fuera = [];
  for (const d of await readdir(raiz)) {
    if (d.startsWith(".") || d.startsWith("v.2026")) continue;
    if (["assets", "docs", "node_modules", "tools", "functions"].includes(d)) continue;
    let esDir = false;
    try { esDir = (await stat(new URL(d + "/", raiz))).isDirectory(); } catch { continue; }
    if (!esDir) continue;
    try { await stat(new URL(d + "/index.html", raiz)); } catch { continue; }
    if (!censo.some((x) => x.slug === d)) fuera.push(d);
  }
  assert.deepEqual(fuera, [], "subapps en el repo y fuera del censo");
});

// El número dice la prioridad de HOY: tiene que poder cambiar sin tocar rutas.
test("reordenar renumera y no pierde ni duplica ninguna", () => {
  const movido = mueve(censo, "player", 2);
  assert.equal(movido[1].slug, "player");
  assert.equal(movido[1].alias, "02.- Reproductor");
  assert.equal(movido.length, censo.length);
  assert.deepEqual(revisa(movido), []);
  assert.deepEqual(new Set(movido.map((x) => x.slug)), new Set(censo.map((x) => x.slug)));
});

test("reordenar por lista respeta el orden relativo de lo no nombrado", () => {
  const antes = censo.filter((x) => !["wall", "dashboard"].includes(x.slug)).map((x) => x.slug);
  const nuevo = reordena(censo, ["wall", "dashboard"]);
  assert.equal(nuevo[0].slug, "wall");
  assert.equal(nuevo[1].slug, "dashboard");
  assert.deepEqual(nuevo.slice(2).map((x) => x.slug), antes);
});

test("mover a una posición imposible no rompe el censo", () => {
  for (const destino of [0, -5, 999]) {
    const r = mueve(censo, "help", destino);
    assert.deepEqual(revisa(r), []);
    assert.equal(r.length, censo.length);
  }
});

test("una subapp que no existe se rechaza, no se inventa", () => {
  assert.throws(() => mueve(censo, "noexiste", 1), /no existe/);
  assert.throws(() => reordena(censo, ["noexiste"]), /no existe/);
});

// La vitrina pública (apps/public-catalog.json) daba sus 20 entradas por
// «available» y diecinueve eran escaparate. Este censo es OTRA cosa: cubre las
// 34 y su estado se mide contra el backend que toca cada una. La vitrina no se
// toca — es una selección comercial curada y tiene su propio test.
test("el censo no pisa la vitrina pública: son listas distintas", async () => {
  const vitrina = JSON.parse(await readFile(new URL("./apps/public-catalog.json", import.meta.url), "utf8"));
  assert.equal(vitrina.length, 20, "la vitrina pública sigue siendo de 20");
  const enVitrina = new Set(vitrina.map((x) => x.slug));
  for (const x of censo) {
    assert.equal(x.en_vitrina, enVitrina.has(x.slug), `${x.slug}: en_vitrina no cuadra con la vitrina real`);
  }
});

test("el estado es medido, no un «available» para todos", () => {
  const estados = new Set(censo.map((x) => x.estado));
  assert.ok(estados.size > 1, "si todas comparten estado, el estado no informa");
  assert.equal(censo.filter((x) => x.estado === "escaparate").length, 29);
  assert.equal(censo.find((x) => x.slug === "adcelerate").estado, "emite");
  assert.equal(censo.find((x) => x.slug === "estadisticas").estado, "emite");
  assert.equal(censo.find((x) => x.slug === "digitalsignage").estado, "emite");
  assert.equal(censo.find((x) => x.slug === "digitalsignage").ruta, "/cms");
});
