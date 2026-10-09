// Standby y resume desde /remotecontrol/ (9-oct-2026). Los botones van por la cola de brain (/control/cmd), así que
// canal.html tiene que entenderlos también en applyCtrlCmd, igual que por /locations/cmd; y la tarjeta enseña cuándo
// la pantalla está apagada (/signage/now trae standby:true).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const leer = p => readFileSync(new URL(p, import.meta.url), "utf8");
const mando = leer("./remotecontrol/index.html");
const canal = leer("./canal.html");

test("la tarjeta trae Standby y Resume, con su clase, en la misma fila que el resto", () => {
  assert.match(mando, /\{cmd:'standby',\s*ico:'⏻', lab:'Standby', cls:'pwr'\}/);
  assert.match(mando, /\{cmd:'resume',\s*ico:'☀', lab:'Resume', cls:'pwr'\}/);
  assert.match(mando, /BTNS\.map\(c=>'<button class="b'\+\(c\.cls\?' '\+c\.cls:''\)\+'" data-cmd="'/);
  assert.match(mando, /'<div class="ctlrow">'\+padHtml\+btnHtml\+'<\/div>'/, "una sola fila de controles");
  assert.match(mando, /\.ctlrow\{display:flex;gap:3px;/);
  assert.match(mando, /\.ctlrow button\.b\{flex:1 1 0;min-width:26px;/, "13 botones caben en una tarjeta de escritorio");
});

test("la tarjeta dice cuándo la pantalla está en standby y no enseña la última pieza", () => {
  const i = mando.indexOf("function refreshNow(scr)");
  const cuerpo = mando.slice(i, mando.indexOf("function sortArr", i));
  assert.match(cuerpo, /const apagada=!!\(d&&d\.standby\);/);
  assert.match(cuerpo, /rec\.el\.classList\.toggle\('standby',apagada\);/);
  assert.match(cuerpo, /rec\.lastItem=apagada\?null:\(it\|\|null\);/);
  assert.ok(cuerpo.indexOf("⏻ En standby") < cuerpo.indexOf("Emitiendo ahora"), "el aviso de standby va antes que la pieza");
});

test("canal.html ejecuta standby y resume que llegan por la cola de brain, como por /locations/cmd", () => {
  const i = canal.indexOf("async function applyCtrlCmd(cmd)");
  const cuerpo = canal.slice(i, canal.indexOf("async function pollCtrl", i));
  assert.match(cuerpo, /case 'standby': standbyOn\(true\); flashCli\('⏻ standby \(apagada\)'\); return 'executed';/);
  assert.match(cuerpo, /case 'resume':\s*try\{ await remoteStartPlayback\(\); flashCli\('▶ reanudada'\); return 'executed'; \}\s*catch\(_\)\{ try\{ tap\.classList\.add\('show'\); \}catch\(__\)\{\} return 'failed'; \}/);
  const cola = canal.slice(canal.indexOf("async function executeQueuedCommand(c)"));
  assert.match(cola, /standbyOn\(true\); flashCli\('⏻ standby \(apagada\)'\); return 'executed';/, "mismo efecto que /locations/cmd");
});
