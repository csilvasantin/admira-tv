/* Segunda ronda de eficiencia (FLT-1411): los 7 objetivos que la auditoría dejó
   inventariados, verificados adversarialmente contra el código r26 (7/7 confirmados,
   0 refutados) e implementados. Contratos fijados para que nada vuelva atrás. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const canal = await readFile(new URL("./canal.html", import.meta.url), "utf8");
const sw = await readFile(new URL("./sw.js", import.meta.url), "utf8");

test("[1] el SW archiva el shell por pathname: una copia por ruta, no por variante", () => {
  assert.match(sw, /const key = new URL\(req\.url\)\.pathname;/);
  assert.match(sw, /c\.put\(key, cp\)/);
  assert.doesNotMatch(sw, /c\.put\(req, cp\)/);
});

test("[2] la onda de audio compone en el compositor: transform, no height", () => {
  assert.match(canal, /@keyframes wv\{ 0%,100%\{ transform:scaleY\(\.22\) \} 50%\{ transform:scaleY\(1\) \} \}/);
  assert.match(canal, /\.audio-card \.wave i\{ width:6px; height:46px;[^}]*transform-origin:bottom; will-change:transform;/);
});

test("[3] con cámara, el POST viaja solo si la lectura CAMBIÓ; el HUD no repinta idéntico", () => {
  assert.match(canal, /const sig=a\?\[a\.faces\|\|0,a\.gender\|\|'',a\.age\|\|''\]\.join\('\|'\):'null';/);
  assert.match(canal, /if\(sig===_audSig\) return;/);
  assert.match(canal, /if\(html!==camHud\._last\)\{ camHud\._last=html; h\.innerHTML=html; \}/);
  // La cadencia de DETECCIÓN de 1 s es deliberada y no se toca.
  assert.match(canal, /CAM\.timer=setTimeout\(camLoop, 1000\);/);
});

test("[4] el canvas del shot es persistente y se des-tinta reasignando dimensiones", () => {
  assert.match(canal, /const cv=_shotCv\|\|\(_shotCv=document\.createElement\('canvas'\)\);/);
  // Incondicional a propósito: asignar width resetea bitmap y origin-clean.
  assert.match(canal, /cv\.width=W; cv\.height=H;\s+\/\/ asignar SIEMPRE/);
});

test("[5] la matriz condicional no se reprocesa si el CMS no la cambió", () => {
  assert.match(canal, /if\(t===lastMTxt\) return;/);
  // La cadencia de 15 s (latencia de edición) se mantiene.
  assert.match(canal, /mtimer=setInterval\(fetchMatrix, 15000\)/);
  // Y no se sella hasta poder resolver ids→url (auto-curación del precache).
  assert.match(canal, /if\(typeof all!=='undefined' && all\.length\) lastMTxt=t;/);
});

test("[6] se pide almacenamiento persistente: el SO no debe desalojar el loop", () => {
  assert.match(canal, /navigator\.storage\.persist\(\)\.catch\(function\(\)\{\}\);/);
});

test("[7] lo podado deja de estar ready: si vuelve al segmento se re-descarga", () => {
  assert.match(canal, /const dead=_prIds\.get\(req\.url\); if\(dead\) for\(const id of dead\)\{ _ready\.delete\(id\); _dl\.delete\(id\); \}/);
  assert.match(canal, /for\(const it of \[\.\.\.playlist, \.\.\._condItems\.values\(\), \.\.\.all\]\)/);
});
