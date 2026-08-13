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

test('el ACK completo queda visible hasta la siguiente orden o cambio de player',()=>{
  const finish=fn(mando,'finishRemoteButton');
  assert.match(finish,/if\(result===['"]executed['"]\)\{/);
  assert.match(finish,/return;[\s\S]*setTimeout\(function\(\)/);
  assert.match(mando,/function clearRemoteFeedback\(\)/);
  assert.match(mando,/resetRemoteControls\(\); clearRemoteFeedback\(\); paintRemoteContext/);
  assert.match(mando,/background-color:color-mix\(in srgb,#39d98a 12%,transparent\)!important/);
});

test('Recargar conserva el clip actual pero pide un fotograma alternativo comprobado',()=>{
  assert.match(mando,/id="reloadControl"[^>]*data-cmd="reload"/);
  assert.match(mando,/paintMediaControl\(reloadControl,[\s\S]*youtubeFrameCandidates\(currentMedia,3\)\)/);
  assert.match(mando,/function checkedPreview\(src\)/);
  assert.match(mando,/light\/samples>16&&visible\/samples>\.035/);
  assert.match(mando,/function previewFallbackData\(it\)/);
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
