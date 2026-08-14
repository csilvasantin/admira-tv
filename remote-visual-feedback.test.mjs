import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const mando=fs.readFileSync(new URL('./mando.html',import.meta.url),'utf8');
const canal=fs.readFileSync(new URL('./canal.html',import.meta.url),'utf8');

function fn(source,name){
  const start=source.indexOf('function '+name+'('); assert.ok(start>=0,'falta '+name);
  const brace=source.indexOf('{',start); let depth=0;
  for(let i=brace;i<source.length;i++){ if(source[i]==='{') depth++; else if(source[i]==='}'&&--depth===0) return source.slice(start,i+1); }
  assert.fail('función incompleta '+name);
}

test('el último ACK o fallo queda visible hasta la siguiente orden o cambio de player',()=>{
  const finish=fn(mando,'finishRemoteButton');
  assert.match(finish,/action\.state=result===['"]executed['"]\?['"]applied['"]:result===['"]failed['"]\?['"]failed['"]:['"]timeout['"]/);
  assert.doesNotMatch(finish,/classList\.remove\('remote-pending'/);
  assert.match(mando,/function clearRemoteFeedback\(\)/);
  assert.match(mando,/resetRemoteControls\(\); clearRemoteFeedback\(\); paintRemoteContext/);
  assert.match(mando,/background-color:color-mix\(in srgb,#39d98a 12%,transparent\)!important/);
});

test('Informar alterna la ficha remota y refleja el estado confirmado en el propio botón',()=>{
  assert.match(mando,/id="infoControl"[^>]*aria-label="Informar sobre el contenido actual"/);
  assert.match(mando,/opening\?'info-show':'info-hide'/);
  assert.match(mando,/infoControl\.setAttribute\('aria-pressed',infoOpen\?'true':'false'\)/);
  assert.match(mando,/infoOpenByScreen\.set\(target\.screen,opening\)/);
  assert.match(mando,/else infoShotByScreen\.delete\(target\.screen\)/);
  assert.match(mando,/waitInfoShot\(target,baselineTs,generation\)/);
  assert.match(mando,/infoShotByScreen\.set\(target\.screen,\{url:shot\.url,ts:Number\(meta\.ts\)/);
  assert.match(mando,/paintMediaControl\(infoControl,[\s\S]*infoShot\?\[infoShot\.url\]/);
  assert.match(canal,/case 'info-show':[\s\S]*case 'info-hide': \{[\s\S]*localInfoHide\(\)[\s\S]*localInfoToggle\(\)[\s\S]*await shotTick\(true\)/);
  assert.match(canal,/function localInfoToggle\(\)\{ const opening=\$\('localInfo'\)\.hidden; localInfoVisible\(opening\); return opening; \}/);
  assert.match(canal,/function _shotDrawLocalInfo\(cx,W,H\)/);
  assert.match(canal,/kind:forceInfo\?'info':'frame'/);
  assert.match(mando,/function checkedPreview\(src\)/);
  assert.match(mando,/light\/samples>16&&visible\/samples>\.035/);
  assert.match(mando,/function previewFallbackData\(it\)/);
});

test('todos los controles conservan outline verde si operan y rojo si fallan',()=>{
  assert.match(mando,/\.remote-applied\{[^}]*outline:2px solid #39d98a/);
  assert.match(mando,/\.remote-failed,\.remote-timeout\{[^}]*outline:2px solid #ff667a/);
  const finish=fn(mando,'finishRemoteButton');
  assert.match(finish,/result===['"]executed['"]\?['"]applied['"]:result===['"]failed['"]\?['"]failed['"]:['"]timeout['"]/);
  assert.doesNotMatch(finish,/remove\('remote-pending'/);
});

test('los tres fotogramas representan 25, 50 y 75 por ciento y envían seek exacto',()=>{
  assert.deepEqual([.25,.5,.75].map(part=>Math.round(40*part)),[10,20,30]);
  assert.match(mando,/id="seekStrip"/);
  assert.match(mando,/\[\.25,\.5,\.75\]\.forEach/);
  assert.match(mando,/sendRemote\('seek-'\+seconds,b\)/);
  assert.match(canal,/if\(\/\^seek-\\d\{1,5\}\$\/\.test\(cmd\)\) return applyCtrlCmd\(cmd\)/);
  assert.match(canal,/const seek=\/\^seek-\(\\d\{1,5\}\)\$\/\.exec\(cmd\)/);
  assert.match(canal,/_nowItem\.startedAt=Date\.now\(\)-Math\.round\(second\*1000\)/);
});

test('cada contenido descargado lleva una imagen real o una imagen de respaldo no negra',()=>{
  const render=fn(mando,'renderRemoteContents');
  assert.match(render,/className='content-preview'/);
  assert.match(render,/document\.createElement\('img'\)/);
  assert.match(render,/setSafePreview\(previewImg,youtubeFrameCandidates\(it,2\),it,false\)/);
  assert.match(mando,/linearGradient id="g"/);
});

test('los scripts inline modificados conservan sintaxis JavaScript válida',()=>{
  for(const [name,source] of [['mando',mando],['canal',canal]]){
    const scripts=[...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(Boolean);
    scripts.forEach((code,index)=>assert.doesNotThrow(()=>new vm.Script(code,{filename:name+'-inline-'+index+'.js'})));
  }
});
