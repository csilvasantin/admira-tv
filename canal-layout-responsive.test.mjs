import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const canal = await readFile(new URL("./canal.html", import.meta.url), "utf8");
const fitSource = canal.slice(
  canal.indexOf("function fitMupi()"),
  canal.indexOf("\nwindow.addEventListener('resize',fitMupi)", canal.indexOf("function fitMupi()")),
);

function fitHarness({ width, height, ar, rail = 166, chan = 174, gap = 16, padding = 12 }) {
  const mupi = { style: {} };
  const wrap = { clientWidth: width, clientHeight: height };
  const railEl = { offsetWidth: rail };
  const chanEl = { offsetWidth: chan };
  const nodes = { mupi, wrap, rail: railEl, chan: chanEl };
  const context = vm.createContext({
    mupiAR: ar,
    document: { documentElement: { classList: { contains: () => false } } },
    $: (id) => nodes[id],
    getComputedStyle: (el) => el === wrap
      ? {
          paddingLeft: String(padding), paddingRight: String(padding),
          paddingTop: String(padding), paddingBottom: String(padding),
          columnGap: String(gap), gap: String(gap), display: "flex",
        }
      : { display: "flex" },
    Math,
    parseFloat,
  });
  vm.runInContext(`${fitSource}\nglobalThis.runFit=fitMupi;`, context);
  context.runFit();
  return {
    width: Number.parseInt(mupi.style.width, 10),
    height: Number.parseInt(mupi.style.height, 10),
  };
}

test("el canal reserva cabecera, navegación, detalle y consola experta", () => {
  assert.match(canal, /html\.admnav:not\(\.clean\) #wrap\{[\s\S]*top:var\(--admtb,52px\); left:var\(--admnw,64px\); right:var\(--admrw,0px\); bottom:0/);
  assert.match(canal, /html\.admnav\.admnav-exp:not\(\.clean\) #wrap\{ bottom:var\(--admexph,200px\); \}/);
  assert.match(canal, /_mupiResizeObserver=new ResizeObserver\(\(\)=>\{ fitMupi\._retry=0; fitMupi\(\); \}\)/);
});

test("en móvil los drawers no descuentan ancho al player", () => {
  assert.match(canal, /@media\(max-width:680px\)\{ html\.admnav:not\(\.clean\) #wrap\{ left:0; right:0; \} \}/);
  const box = fitHarness({ width: 390, height: 792, ar: 9 / 16, rail: 0, chan: 0 });
  assert.deepEqual(box, { width: 390 - 24, height: 651 });
  assert.ok(Math.abs(box.width / box.height - 9 / 16) < 0.003);
});

test("el modo clean conserva el kiosco a pantalla completa", () => {
  assert.match(canal, /\.clean #wrap\{ padding:0; gap:0; \}/);
  assert.match(canal, /\.clean #mupi\{ height:100vh; max-width:100vw; border-radius:0; box-shadow:none; \}/);
});

test("un contenido horizontal cabe entre los dos paneles sin deformarse", () => {
  const box = fitHarness({ width: 1412, height: 1238, ar: 16 / 9 });
  assert.deepEqual(box, { width: 1016, height: 572 });
  assert.ok(Math.abs(box.width / box.height - 16 / 9) < 0.003);
});

test("un contenido vertical usa toda la altura libre sin invadir los laterales", () => {
  const box = fitHarness({ width: 1412, height: 1238, ar: 9 / 16 });
  assert.deepEqual(box, { width: 683, height: 1214 });
  assert.ok(Math.abs(box.width / box.height - 9 / 16) < 0.003);
  assert.ok(box.width + 166 + 174 + 32 + 24 <= 1412);
});

test("vídeos e imágenes preservan el contenido completo", () => {
  assert.match(canal, /#stage video, #stage img\{[^}]*object-fit:contain/);
  assert.match(canal, /im\.naturalWidth\/im\.naturalHeight;\s*fitMupi\(\)/);
});
