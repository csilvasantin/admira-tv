import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const mando=fs.readFileSync(new URL('./mando.html',import.meta.url),'utf8');
const previewSource=mando.slice(mando.indexOf('var T, previewItem'),mando.indexOf('\n    function setTarget'));

test('el preview ya no arranca otro canal con la identidad del player real',()=>{
  assert.doesNotMatch(mando,/id="prev"/);
  assert.doesNotMatch(mando,/\/canal\.html\?circuit=/);
  assert.match(mando,/class="preview-media" id="previewMedia"/);
  assert.match(mando,/renderPreview\(it\)/);
});

test('la pastilla y los controles de fullscreen gobiernan solo el preview local',()=>{
  assert.match(previewSource,/previewToggle\.onclick=function\(\)\{ setPreviewPaused\(!previewPaused\); \}/);
  assert.match(previewSource,/previewBack/);
  assert.match(previewSource,/previewPause\.onclick/);
  assert.match(previewSource,/iframe\.src='about:blank'/);
  assert.match(previewSource,/setAttribute\('sandbox','allow-scripts'\)/);
  assert.doesNotMatch(previewSource,/allow-same-origin/);
  assert.doesNotMatch(previewSource,/setAttribute\('allow','fullscreen'\)/);
  assert.match(previewSource,/previewItem=it\|\|null; paintPreviewPause\(\)/);
  assert.doesNotMatch(previewSource,/sendRemote\(/);
});

test('los controles básicos viven dentro de Ahora emitiendo y tienen una única salida hacia el player remoto',()=>{
  const pillStart=mando.indexOf('<div class="nowbox">');
  const pillEnd=mando.indexOf('\n  </div>\n\n  <section id="playlistView"',pillStart);
  assert.notEqual(pillStart,-1);
  assert.notEqual(pillEnd,-1);
  const pill=mando.slice(pillStart,pillEnd);
  assert.match(pill,/data-cmd="prev"/);
  assert.match(pill,/data-cmd="next"/);
  assert.match(pill,/id="mute"/);
  assert.match(pill,/data-cmd="reload"/);
  assert.match(pill,/id="vol"/);
  assert.doesNotMatch(mando,/Player remoto · todos los controles inferiores/);
  assert.match(mando,/async function sendRemote\(cmd,button,options\)/);
  assert.match(mando,/vol\.onchange=function\(\)\{ sendRemote\('volume '\+vol\.value\); \}/);
  assert.match(mando,/pwr\.onclick=async function\(\)\{[\s\S]*?sendRemote\(desired\?'standby':'resume',pwr\)/);
  assert.match(mando,/mb\.onclick=async function\(\)\{[\s\S]*?sendRemote\(desired\?'audiooff':'audioon',mb\)/);
  assert.match(mando,/function resetRemoteControls\(\)\{[\s\S]*?standby=storedStandby\(\); muted=false; pwr\.disabled=false; mb\.disabled=false;/);
  assert.match(mando,/signal:controller\.signal/);
  assert.match(mando,/setTimeout\(function\(\)\{controller\.abort\(\);\},2500\)/);
  assert.match(mando,/op!==powerOp\|\|T!==target/);
  assert.match(mando,/op!==muteOp\|\|T!==target/);
});

test('una respuesta tardía del preview no cambia el siguiente objetivo',()=>{
  assert.match(mando,/targetGeneration\+\+; if\(nowController\)\{ nowController\.abort\(\)/);
  assert.match(mando,/generation!==targetGeneration\|\|requestSeq!==nowRequestSeq/);
  assert.match(mando,/signal:controller\.signal/);
});

test('el modo ampliado es modal, aísla el fondo y restaura el foco',()=>{
  assert.match(previewSource,/previewFrame\.setAttribute\('role','dialog'\)/);
  assert.match(previewSource,/previewFrame\.setAttribute\('aria-modal','true'\)/);
  assert.match(previewSource,/n\.inert=!!on/);
  assert.match(previewSource,/previewReturnFocus\.focus\(\)/);
  assert.match(previewSource,/e\.key!=='Tab'/);
});

test('todos los scripts inline conservan sintaxis JavaScript válida',()=>{
  let count=0;
  for(const match of mando.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)){
    if(!match[1].trim()) continue;
    new vm.Script(match[1],{filename:`mando.html#${++count}`});
  }
  assert.ok(count>0);
});
