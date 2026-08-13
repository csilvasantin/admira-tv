/* Eficiencia del player (FLT-1409, Carlos: «el reproductor más eficiente del mercado
   del digital signage»). Auditoría de 15 agentes con verificación adversarial: 10
   hallazgos confirmados, 10 implementados. Este test fija los CONTRATOS de cada uno
   para que ninguna vuelta atrás pase desapercibida. Línea base medida antes de tocar:
   CPU media 7,9% · pico 13,3% · 260 MB (MacBookProNegro14, 60 s de muestreo). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const canal = await readFile(new URL("./canal.html", import.meta.url), "utf8");

test("[1] la sincro no re-monta la antena si el máster no cambió", () => {
  assert.match(canal, /const sig=d\.items\.map\(i=>i\.id\)\.join\(','\)\+'\|'\+\(d\.slotMs\|\|20000\)/);
  assert.match(canal, /if\(syncOn && \(sig!==_syncSig \|\| !hadRemote\)\)\{ _syncSig=sig; rebuild\(true\); \}/);
  // El reloj del máster se refresca SIEMPRE, gateado no.
  assert.match(canal, /SYNC_REMOTE=\{ items:d\.items, slotMs:d\.slotMs\|\|20000, offset:\(d\.serverNow\|\|Date\.now\(\)\)-Date\.now\(\) \};\s+\/\/ el reloj/);
  // Y tras recuperarse con firma igual, el rótulo no sigue diciendo SIN MÁSTER.
  assert.match(canal, /else if\(syncOn\)\{ try\{ setLive\('SINCRO CANAL · '/);
});

test("[2] next() no re-baja el catálogo: los 5 s quedan SOLO para import y novedad", () => {
  assert.match(canal, /const _ivl=\(pendingImport\|\|freshOn\(\)\)\?5000:Math\.max\(10,\+cfg\.refreshSec\|\|30\)\*1000;/);
  assert.doesNotMatch(canal, /if\(Date\.now\(\)-_lastFeed>5000\)\{ try\{ loadFeed\(false\); \}catch\(_\)\{\} \} if\(syncOn\)/);
});

test("[3] el plano de control tiene backoff por inactividad y despertar instantáneo", () => {
  // setTimeout re-armado, nunca setInterval fijo.
  assert.doesNotMatch(canal, /setInterval\(pollCmd, 3000\)/);
  assert.doesNotMatch(canal, /setInterval\(pollCtrl,2500\)/);
  assert.match(canal, /function __cmdDelay\(\)\{ return __cmdIdleN>=40\?10000:3000; \}/);
  assert.match(canal, /function __ctrlDelay\(\)\{ return __ctrlIdleN>=48\?10000:2500; \}/);
  // Actividad = reset; y volver al frente despierta LOS DOS planos.
  assert.match(canal, /__cmdIdleN=0;\s+\/\/ hay actividad/);
  assert.match(canal, /__ctrlIdleN=0;\s+\/\/ cualquier respuesta con comandos/);
  assert.match(canal, /rearmCtrlOnForeground\(\)\{[\s\S]{0,220}cmdWake\(\)/);
  // pollMode NO se toca: su guard es doctrina r46/r47/r51.
  assert.match(canal, /setInterval\(pollMode, 12000\)/);
  // Un fallo de red también es inactividad: sin esto, un ISP que bloquee el host
  // (workers.dev en España) nos tendría sondeando a toda velocidad contra un muro.
  assert.match(canal, /__cmdHost=\(__cmdHost\+1\)%CMD_HOSTS\.length; __cmdIdleN\+\+;/);
  assert.match(canal, /catch\(_\)\{ __ctrlIdleN\+\+;/);
});

test("[4] el LRU de blobs es dinámico: reuso total si el loop cabe, 2 si no", () => {
  assert.match(canal, /return u2\.size<=6\?6:2;/);
  assert.match(canal, /while\(_objURLs\.size>cap\)\{ const k=_objURLs\.keys\(\)\.next\(\)\.value; if\(k===it\.url\) break;/);
});

test("[5] shotTick no captura en standby/pausa ni re-sube la misma imagen fija", () => {
  assert.match(canal, /if\(_standby\|\|paused\) return;\s+\/\/ pantalla apagada o en pausa/);
  assert.match(canal, /el\.tagName==='IMG' && src===_lastShotSrc && \(Date\.now\(\)-_lastShotTs\)<300000\) return;/);
  // El éxito se marca en la RESPUESTA aceptada, no al disparar.
  assert.match(canal, /const r=await fetch\(SHOT_API/);
  assert.match(canal, /if\(r&&r\.ok\)\{ _lastShotSrc=src; _lastShotTs=Date\.now\(\); \}/);
});

test("[6] el precache va en streaming al disco, con fallback y disco-primero intacto", () => {
  assert.match(canal, /const tees=resp\.body\.tee\(\);/);
  // El buffer doble (chunks[] + Blob del cuerpo original) ya no existe en el camino normal…
  assert.doesNotMatch(canal, /const reader=resp\.body\.getReader\(\); const chunks=\[\];/);
  // …pero el fallback bufferizado para WebKit viejo sí, con re-fetch (el body quedó locked).
  assert.match(canal, /const r2=await fetch\(it\.url,\{mode:'cors',cache:'force-cache'\}\); if\(!r2\|\|!r2\.ok\) throw err;/);
  // _ready SOLO tras completar el put (r43: disco-primero).
  assert.match(canal, /\}\n    _dl\.delete\(it\.id\); _ready\.add\(it\.id\); return true;/);
});

test("[7] el proof-of-play se agrupa a 60 s: el tally ya vive en localStorage", () => {
  assert.match(canal, /_emitTimer=setTimeout\(emitFlush,60000\)/);
  assert.doesNotMatch(canal, /_emitTimer=setTimeout\(emitFlush,12000\)/);
});

test("[8] loadGrid no reconstruye nada si la parrilla no cambió", () => {
  assert.match(canal, /let _gridSig='·';/);
  assert.match(canal, /if\(_gsig===_gridSig\)\{ try\{ signagePlaylistPush\(\); \}catch\(_\)\{\} return; \}/);
  // La franja 'auto' entra en la firma: los cruces horarios de Madrid siguen re-segmentando.
  assert.match(canal, /\+\(seg\.slot==='auto'\?madridSlot\(\):''\)/);
});

test("[9] el inventario de caché solo viaja si cambió, con latido ≤60 s para el mando", () => {
  assert.match(canal, /if\(sig===_cacheSig && _dl\.size===0 && Date\.now\(\)-_cacheSentAt<55000\)\{ cacheBadge\(\); return; \}/);
  // La firma se resetea si el POST falla: el arranque offline reintenta (patrón r45).
  assert.match(canal, /\.catch\(\(\)=>\{ _cacheSig=''; \}\)/);
});

test("[10] en kiosko no se pinta lo invisible: barra, reloj, rail y chan con guard", () => {
  assert.match(canal, /function startBar\(\)\{ stopBar\(\); if\(__adtvClean\) return; barTimer=setInterval\(barFromAdv,120\); \}/);
  // Los DOS armados de la barra pasan por startBar (startAdv y el resume de pausa).
  assert.equal((canal.match(/barTimer=setInterval\(barFromAdv,120\)/g) || []).length, 1, "solo dentro de startBar");
  assert.match(canal, /clock\(\); if\(!__adtvClean\) setInterval\(clock,1000\);/);
  assert.match(canal, /function renderRail\(\)\{\n  if\(__adtvClean\) return;/);
  assert.match(canal, /renderChan\(\)\{\n  const el=\$\('chan'\); if\(!el\) return;\n  if\(__adtvClean\) return;/);
  // El avance REAL del bucle no se toca: setTimeout(next,…) sigue.
  assert.match(canal, /timer=setTimeout\(next,ms\); startBar\(\);/);
});

test("[extra] un solo ResizeObserver sobre el wrap — hubo dos entre r23 y r24", () => {
  assert.equal((canal.match(/new ResizeObserver/g) || []).length, 1);
  assert.match(canal, /_mupiResizeObserver=new ResizeObserver\(\(\)=>\{ fitMupi\._retry=0; fitMupi\(\); \}\)/);
});
