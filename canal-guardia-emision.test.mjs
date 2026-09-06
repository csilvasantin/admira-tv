/*
 * Guardia de emisión (06-09-2026 · DCL-6cfb6dea · foco admira.tv, players Android/iOS).
 * La pantalla nunca se queda quieta: vídeo atascado → avanza; turno eterno → avanza o recarga;
 * latido a la app nativa; salud en /signage/now. Y lo que NO es un atasco (standby, pausa,
 * directo, rundown) no dispara nada.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const canal = await readFile(new URL('./canal.html', import.meta.url), 'utf8');

test('la guardia vigila el vídeo atascado y el turno eterno con un tick de 2 s', () => {
  assert.match(canal, /const GUARD_STALL_S=12, GUARD_SLOT_MAX_S=180, GUARD_TICK_MS=2000/);
  assert.match(canal, /setInterval\(guardTick,GUARD_TICK_MS\)/);
  assert.match(canal, /if\(!v\.paused&&!v\.ended&&v\.readyState>=1&&now-g\.lastProgressAt>GUARD_STALL_S\*1000\)\{ g\.stalls\+\+; guardRecover\('video atascado/);
  assert.match(canal, /if\(now-g\.lastPlayAt>slotMax\*1000\)\{ guardRecover\('turno eterno/);
});

test('un vídeo largo no se corta: el tope del turno crece con su duración', () => {
  assert.match(canal, /if\(v\.duration>0&&isFinite\(v\.duration\)\) slotMax=Math\.max\(slotMax,v\.duration\*1\.5\)/);
  assert.match(canal, /slotMax=Math\.max\(slotMax,\(\(cfg&&cfg\.imgSec\)\|\|9\)\*3,\(\(cfg&&cfg\.audioSec\)\|\|18\)\*3\)/);
});

test('quieta a propósito no es atasco: standby, directo, rundown y pausa reinician el reloj', () => {
  assert.match(canal, /if\(_standby\|\|directOn\|\|PREVIEW\.on\|\|paused\)\{ g\.lastProgressAt=now; g\.lastPlayAt=now; return; \}/);
});

test('sin media en el segmento no hay turno que vigilar: cero recuperaciones falsas', () => {
  assert.match(canal, /if\(!v&&!mediaEl&&!\(typeof playlist!=='undefined'&&playlist&&playlist\.length\)\)\{ g\.lastPlayAt=now; return; \}/);
});

test('cada turno arranca el reloj de la guardia y la recuperación avanza o, si no puede, recarga', () => {
  assert.match(canal, /async function play\(i, forced\)\{\n  if\(_standby\) return;\n  guardPlayStarted\(\);/);
  assert.match(canal, /try\{ next\(\); \}catch\(_\)\{ try\{ location\.reload\(\); \}catch\(__\)\{\} \}/);
  assert.match(canal, /g\.recoveries\+\+; g\.lastRecoveryAt=Date\.now\(\); g\.lastReason=String\(reason\|\|''\)\.slice\(0,80\)/);
});

test('el latido llega a las dos apps nativas sin romper en un navegador normal', () => {
  assert.match(canal, /if\(window\.AdmiraNative&&typeof AdmiraNative\.beat==='function'\) AdmiraNative\.beat\(\)/);
  assert.match(canal, /webkit\.messageHandlers\.beat\.postMessage\(Date\.now\(\)\)/);
  assert.match(canal, /function guardTick\(\)\{\n  guardBeat\(\);/);
});

test('la salud viaja en /signage/now y distingue emisión en vivo de emisión desde caché', () => {
  assert.match(canal, /device:DEVICE_TELEMETRY, health:guardHealth\(\),/);
  assert.match(canal, /return \{ stalls:g\.stalls, recoveries:g\.recoveries, lastRecoveryAt:g\.lastRecoveryAt\|\|0, lastReason:g\.lastReason\|\|'', source:g\.source, online:navigator\.onLine!==false, uptimeSec:/);
  assert.match(canal, /all=good; guardState\(\)\.source='cache'; return true;/);
  assert.match(canal, /saveCatalog\(\);[^\n]*\n  guardState\(\)\.source='live';/);
});

test('el estado de la guardia no depende del orden de carga del script (sin TDZ)', () => {
  assert.match(canal, /function guardState\(\)\{ return window\.__adtvGuard\|\|\(window\.__adtvGuard=\{stalls:0,recoveries:0/);
  assert.doesNotMatch(canal, /const GUARD=\{/);
});
