import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const mando = await readFile(new URL('./mando.html', import.meta.url), 'utf8');

function functionSource(source, name) {
  const start=source.indexOf(`function ${name}(`); assert.notEqual(start,-1,`falta ${name}`);
  const brace=source.indexOf('{',start); let depth=0,quote='',escaped=false;
  for(let i=brace;i<source.length;i+=1){ const c=source[i];
    if(quote){ if(escaped) escaped=false; else if(c==='\\') escaped=true; else if(c===quote) quote=''; continue; }
    if(c==='"'||c==="'"||c==='`'){ quote=c; continue; }
    if(c==='{') depth+=1; else if(c==='}'&&--depth===0) return source.slice(start,i+1);
  }
  throw new Error(`${name} incompleta`);
}

test('el contorno representa el avance y avisa al acercarse el final',()=>{
  const context=vm.createContext({});
  vm.runInContext(`${functionSource(mando,'previewProgressState')}\nglobalThis.state=previewProgressState;`,context);
  const state=(elapsed,duration=100)=>JSON.parse(JSON.stringify(context.state({dur:duration,startedAt:1000},1000+elapsed*1000)));
  assert.deepEqual(state(50),{duration:100,elapsed:50,remaining:50,progress:.5,color:'#39d98a'});
  assert.equal(state(75).color,'#ffd866');
  assert.equal(state(91).color,'#ff667a');
  assert.equal(state(150).progress,1);
  assert.equal(context.state({dur:0,startedAt:1000},2000),null);
  assert.match(mando,/\.frame\.has-progress::after\{[^}]*conic-gradient\(from -90deg,var\(--preview-ring\) var\(--preview-progress\)/);
  assert.match(mando,/setInterval\(function\(\)\{ if\(!document\.hidden\) paintPreviewProgress\(Date\.now\(\)\); \},500\)/);
  assert.match(mando,/quedan '\+previewClock\(state\.remaining\)/);
});

test('el previo pinta un ecualizador desde la telemetría real del player',()=>{
  assert.match(mando,/id="previewAudio"[^>]*aria-label="Estado de audio desconocido"/);
  assert.equal((mando.match(/<i><\/i>/g)||[]).length,4);
  assert.match(mando,/\.preview-audio\.on\{color:#55e89b/);
  assert.match(mando,/\.preview-audio\.silent\{color:#ffd866/);
  assert.match(mando,/\.preview-audio\.muted\{color:#ff667a/);
  assert.match(mando,/var silent=!!audio&&!muted&&audio\.analyzed===true&&Number\(audio\.level\)<=1/);
  assert.match(mando,/paintPreviewAudio\(reportedAudio\|\|null\)/);
  assert.match(mando,/Audio activo al /);
});

test('el script inline conserva sintaxis JavaScript válida',()=>{
  for(const [index,match] of [...mando.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].entries()){
    if(match[1].trim()) assert.doesNotThrow(()=>new vm.Script(match[1],{filename:`mando-preview-${index}.js`}));
  }
});
