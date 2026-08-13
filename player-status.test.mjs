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
  assert.match(mando,/view==='playlist'\|\|view==='status'/);
});

test('Status cruza los tres contratos vivos del player',()=>{
  assert.match(mando,/var SCREENS_API = 'https:\/\/api\.admira\.store\/signage\/screens'/);
  assert.match(mando,/Promise\.all\(\[remoteNowData\(target\.screen\),remoteCacheData\(target\.screen\),remoteScreenRecord\(target\.screen\)\]\)/);
  assert.match(mando,/function renderRemoteStatus\(nowData,cache,record\)/);
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
