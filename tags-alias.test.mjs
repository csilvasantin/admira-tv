// Equivalencias de etiquetas del Stock (7-oct-2026): una sola tabla en tres sitios; aquí se comprueba que coinciden.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { TAG_ALIAS, norm, resolveContent, cleanLive, deduceScreenTags } from "./functions/api/_playlist-live.js";

const tabla = file => { const s = fs.readFileSync(new URL(file, import.meta.url), "utf8"), m = s.match(/const TAG_ALIAS\s?=\s?(\{[^}]+\});/); assert.ok(m, file + " tiene la tabla"); return JSON.parse(JSON.stringify(vm.runInNewContext("(" + m[1] + ")"))); };

test("canal, parrilla y servidor comparten exactamente las mismas equivalencias", () => {
  assert.deepEqual(tabla("./canal.html"), { ...TAG_ALIAS });
  assert.deepEqual(tabla("./parrilla/index.html"), { ...TAG_ALIAS });
  for (const [de, a] of Object.entries(TAG_ALIAS)) { assert.notEqual(de, a); assert.equal(TAG_ALIAS[a], undefined, a + " no se reenvía a otra"); }
});

test("el canal resuelve la forma antigua y la nueva a la misma etiqueta, en la consulta y en la pieza", () => {
  const s = fs.readFileSync(new URL("./canal.html", import.meta.url), "utf8"), i = s.indexOf("function normTag("), j = s.indexOf("function matchesSeg(");
  const ctx = vm.createContext({}); vm.runInContext(s.slice(i, j) + ";this.c=canonicalPlayTag;this.n=tagNeedles;", ctx);
  assert.equal(ctx.c("#Tech"), "tecnologia"); assert.equal(ctx.c("Tecnología"), "tecnologia"); assert.equal(ctx.c("gaming"), "videojuego"); assert.equal(ctx.c("música"), "musica");
  assert.equal(ctx.c("oferta"), "ofertas"); assert.equal(ctx.c("expandido"), "expandido");
  assert.deepEqual(Array.from(ctx.n("business")).sort().join(","), "business,negocio");
  assert.ok(ctx.n("tecnologia").includes("tech") && ctx.n("tecnologia").includes("technology"));
});

test("una playlist viva escrita con «tech» sigue trayendo las piezas que ahora dicen «tecnología»", () => {
  assert.equal(norm("Tech"), "tecnologia"); assert.equal(norm("#Videojuegos"), "videojuego"); assert.equal(norm("Bebida"), "bebidas");
  const stock = [{ id: "1-a", type: "video", url: "https://x/1.mp4", tags: ["tecnología"] }, { id: "2-b", type: "video", url: "https://x/2.mp4", tags: ["negocio"] }];
  const c = cleanLive({ name: "T", content: { any: ["tech"] }, target: { all: ["todas"] } }).content;
  assert.deepEqual(c.any, ["tecnologia"]);
  assert.deepEqual(resolveContent(c, stock).map(i => i.stockId), ["1-a"]);
  assert.ok(deduceScreenTags({ screen: "robot-1", circuit: "robot" }).includes("circuito:robot"), "las etiquetas de PANTALLA no pasan por las equivalencias");
});
