import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const canal = await readFile(new URL('./canal.html', import.meta.url), 'utf8');

test('now, standby y shot comparten un productor estable', () => {
  assert.match(canal, /const TELEMETRY_PRODUCER=/);
  assert.match(canal, /screen:scr\.screen, producer:TELEMETRY_PRODUCER, item/);
  assert.match(canal, /producer:TELEMETRY_PRODUCER, standby:true/);
  assert.match(canal, /producer:TELEMETRY_PRODUCER,itemId:\(_nowItem&&_nowItem\.id\)/);
});

test('la captura mantiene el candado hasta recibir la respuesta', () => {
  assert.match(canal, /const r=await fetch\(SHOT_API/);
  assert.match(canal, /if\(r&&r\.ok\)\{ _lastShotSrc=src;/);
});

test('el CMS sólo muestra una captura ligada a la pieza viva', async () => {
  const cms = await readFile(new URL('./cms.html', import.meta.url), 'utf8');
  assert.match(cms, /SHOT\s+: 'https:\/\/api\.admira\.store\/signage\/shot\?meta=1&screen='/);
  assert.match(cms, /!meta\.itemId\|\|String\(meta\.itemId\)!==String\(liveId\)/);
  assert.match(cms, /actualizando previo/);
});
