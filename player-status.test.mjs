import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const mando=fs.readFileSync(new URL('./mando.html',import.meta.url),'utf8');
const canal=fs.readFileSync(new URL('./canal.html',import.meta.url),'utf8');

test('Status es una vista local del mando y no un enlace externo',()=>{
  assert.match(mando,/href="#status" data-mando-view-link="status">Status<\/a>/);
  assert.match(mando,/id="statusView" data-mando-pane="status" hidden/);
  assert.doesNotMatch(mando,/href="https:\/\/www\.admira\.live\/status">Status/);
  assert.match(mando,/\['playlist','status','contents'\]\.includes\(view\)/);
});

test('Status cruza los tres contratos vivos del player',()=>{
  assert.match(mando,/var SCREENS_API = 'https:\/\/api\.admira\.store\/signage\/screens'/);
  assert.match(mando,/Promise\.all\(\[remoteNowData\(target\.screen\),remoteCacheData\(target\.screen\),remoteScreenRecord\(target\.screen\),remoteProfileData\(target\.screen\)\]\)/);
  assert.match(mando,/function renderRemoteStatus\(nowData,cache,record,profile\)/);
});

test('Contenidos sustituye el enlace Admira.tv y cruza inventario, caché y destino',()=>{
  assert.match(mando,/href="#contents" data-mando-view-link="contents">Contenidos<\/a>/);
  assert.doesNotMatch(mando,/>Admira\.tv<\/a>/);
  assert.match(mando,/function renderRemoteContents\(cache,playlistData,nowData,profile\)/);
  for(const label of ['Resolución','Bitrate','Codec','Peso','Duración','Formato']) assert.match(mando,new RegExp(label));
  assert.match(mando,/Reducible: bitrate alto para este player/);
});

test('Status muestra información de pantalla, sistema, hardware, disco y software sin inventar ausencias',()=>{
  for(const label of ['Resolución física','Sistema operativo','CPU lógica','Disco físico','Uso disponible al player','Versión del player','Release web','Caché lista','Último latido']) assert.match(mando,new RegExp(label));
  assert.match(mando,/No expuesto por este player/);
  assert.match(mando,/function statusMaskIp\(value\)/);
});

test('el canal publica una telemetría allowlisted y refresca datos variables',()=>{
  assert.match(canal,/function deviceTelemetryBase\(\)/);
  assert.match(canal,/navigator\.storage\.estimate/);
  assert.match(canal,/navigator\.storage\.persisted/);
  assert.match(canal,/device:DEVICE_TELEMETRY/);
  assert.match(canal,/standby:false/);
  assert.match(canal,/version:window\.ADMIRA_VERSION/);
});

test('el player analiza sólo su caché local y publica inventario técnico',()=>{
  assert.match(canal,/function cachedCodec\(blob,mime\)/);
  assert.match(canal,/function cachedMediaMetadata\(blob,type\)/);
  assert.match(canal,/bitrate:duration&&bytes\?Math\.round\(bytes\*8\/duration\):0/);
  assert.match(canal,/return \{ screen:scr\.screen, ready, total:inv\.length, downloading, bytes:_cBytes, contents \}/);
});

test('todos los scripts inline del mando y canal conservan sintaxis válida',()=>{
  for(const [name,source] of [['mando',mando],['canal',canal]]){
    let count=0;
    for(const match of source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)){
      if(!match[1].trim()) continue;
      new vm.Script(match[1],{filename:`${name}.html#${++count}`});
    }
    assert.ok(count>0);
  }
});
