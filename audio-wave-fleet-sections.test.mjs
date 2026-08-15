import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const cms = await readFile(new URL('./cms.html', import.meta.url), 'utf8');
const canal = await readFile(new URL('./canal.html', import.meta.url), 'utf8');
const mando = await readFile(new URL('./mando.html', import.meta.url), 'utf8');

test('el player publica el mute y el volumen reales en su latido', () => {
  assert.match(canal, /function playerAudioState\(\)/);
  assert.match(canal, /audio:playerAudioState\(\), sinc/);
  assert.match(canal, /DEVICE_TELEMETRY\.audio=playerAudioState\(\)/);
  assert.match(canal, /function pushAudioStateSoon\(\)/);
  assert.match(canal, /pushAudioStateSoon\(\);/);
  assert.match(mando, /reportedAudio=\(it&&it\.audio\)\|\|\(d&&d\.device&&d\.device\.audio\)/);
});

test('cada previo muestra onda verde activa o roja silenciada', () => {
  assert.match(cms, /function audioInfo\(p\)/);
  assert.match(cms, /function audioBadge\(p\)/);
  assert.match(cms, /class="ebAudio '\+cls\+'"/);
  assert.match(cms, /\.ebAudio\.live\{color:var\(--air\)/);
  assert.match(cms, /\.ebAudio\.muted\{color:var\(--off\)/);
  assert.match(cms, /audioBadge\(p\).*<\/a>/s);
});

test('la ficha local analiza la señal sin reconectar la salida de audio', () => {
  assert.match(canal, /el\.captureStream\|\|el\.mozCaptureStream/);
  assert.match(canal, /ctx\.createMediaStreamSource\(stream\)/);
  assert.match(canal, /analyser\.getByteTimeDomainData\(m\.data\)/);
  assert.match(canal, /Math\.sqrt\(sum\/m\.data\.length\)/);
  assert.doesNotMatch(canal, /source\.connect\(ctx\.destination\)/);
  assert.match(canal, /id="li-audio"[^>]*aria-label="Audio silenciado"/);
  assert.match(canal, /row\('audio',audio\.muted\?'SILENCIADO':'ACTIVO/);
});

test('Superficies y Sitios nacen compactados y cargan el detalle al abrir', () => {
  assert.match(cms, /gapSection\('surfaces','Superficies de parrilla sin player/);
  assert.match(cms, /gapSection\('sites','Sitios \(mapa\) sin player vivo'/);
  assert.match(cms, /<details class="ebGapSection"/);
  assert.match(cms, /Pulsa para cargar el detalle/);
  assert.match(cms, /addEventListener\('toggle'/);
  assert.match(cms, /body\.innerHTML=box\.open\?\(EB_DETAIL\[id\]/);
});

test('los scripts inline modificados conservan sintaxis válida', () => {
  for (const [name,source] of [['cms',cms],['canal',canal],['mando',mando]]) {
    const scripts=[...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(Boolean);
    scripts.forEach((code,index)=>assert.doesNotThrow(()=>new vm.Script(code,{filename:`${name}-${index}.js`})));
  }
});
