import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const canal=readFileSync(new URL('./canal.html',import.meta.url),'utf8');
const mando=readFileSync(new URL('./mando.html',import.meta.url),'utf8');
test('la pausa del standby no se guarda como intención y ?standby=0 limpia la heredada',()=>{
  assert.match(canal,/function setPaused\(p\)\{[\s\S]{0,160}if\(!\(opt&&opt\.transient\)\) save\(PAUSE_INTENT_KEY/);
  assert.match(canal,/setPaused\(true,\{transient:true\}\); _nowItem=null;/);
  assert.match(canal,/if\(q==='0'&&paused\)\{ paused=false; save\(PAUSE_INTENT_KEY,'0'\); \}/);
  assert.match(canal,/⏸ En pausa · ▶ desde el mando para reanudar/);
});
test('tag en vivo vacío: conserva el tag y emite la playlist normal',()=>{
  assert.doesNotMatch(canal,/ningún contenido con #/);
  assert.match(canal,/_liveTagFallback=true; seg\.tag='';\s*try\{ rebuild\(restart\); \}finally\{ seg\.tag=keep; _liveTagFallback=false; \}/);
  assert.match(canal,/tagEmpty:\(_liveTag&&_liveTagEmpty\)\|\|''/);
  assert.ok(canal.indexOf("let _liveTagFallback=false")<canal.indexOf('function rebuild(restart)'));
});
test('el mando avisa del tag vacío y enseña cuenta atrás por pantalla',()=>{
  assert.match(mando,/no tiene contenidos · emite la playlist normal/);
  assert.match(mando,/function startCmdCountdown\(screen,cmd,limit\)/);
  assert.match(mando,/cd=startCmdCountdown\(target\.screen,cmd,ackTimeoutFor\(target\.screen\)\), result=await waitRemoteAck\(host,d,target,cmd\); cd\.done\(result\);/);
  assert.match(mando,/aplicado en /);
});
