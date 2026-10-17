import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('./canal.html',import.meta.url),'utf8');
const section=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
const pause=section('function setPaused(p){','\n\n// PLAY REMOTO');
const advance=section('function mediaAdvance(','\n// A policy-denied');
const startAdv=html.match(/function startAdv\(ms\)\{[^\n]+/)[0];
const queued=section('async function executeQueuedCommand(c){','\nasync function ackQueuedCommand');
test('legacy queue executes real pause/play and propagates failed play instead of an optimistic CLI ack',async()=>{
 const calls=[];
 const ctx=vm.createContext({applyCtrlCmd:async cmd=>{calls.push(cmd);return cmd==='play'?'failed':'executed';},runCli(){throw Error('must not reach unimplemented CLI');}});
 vm.runInContext(queued+'\nglobalThis.run=executeQueuedCommand',ctx);
 assert.equal(await ctx.run({cmd:'pause'}),'executed');
 assert.equal(await ctx.run({cmd:'/play'}),'failed');
 assert.deepEqual(calls,['pause','play']);
});
function harness(){
 let now=1000;const timers=new Map(),saved=new Map(),calls=[];
 const media={pause(){calls.push('pause');},play(){calls.push('play');return Promise.resolve();}};
 const ctx=vm.createContext({Date:{now:()=>now},paused:false,PAUSE_INTENT_KEY:'screen-a',usesAdv:false,advElapsed:0,advTotal:5000,advStart:0,timer:7,mediaEl:media,playlist:[{}],cur:0,syncOn:false,
  document:{body:{classList:{toggle(){}}}},$:()=>({}),save:(k,v)=>saved.set(k,v),
  clearTimeout:id=>timers.delete(id),setTimeout:(fn,ms)=>{timers.set(1,{fn,ms});return 1;},stopBar(){},startBar(){},next(){calls.push('next');},play(){calls.push('mount');},syncIndex:()=>0,
  _playTok:1,localInfoRepeatAdvance(){calls.push('repeat');},syncFinishCurrent(){calls.push('sync-end');}
 });
 vm.runInContext(pause+'\n'+advance+'\n'+startAdv+'\nglobalThis.pause=setPaused;globalThis.advance=mediaAdvance;globalThis.arm=startAdv',ctx);
 return {ctx,media,timers,saved,calls,setTime:v=>now=v};
}
test('pause cancels ALL timers even for video and blocks late ended/retry and scheduling until explicit resume',()=>{
 const h=harness();h.ctx.pause(true);
 assert.equal(h.ctx.paused,true);assert.equal(h.media._admiraOperatorPaused,true);assert.equal(h.saved.get('screen-a'),'1');assert.equal(h.ctx.timer,null);
 h.ctx.advance(1,true);h.ctx.arm(24000);assert.equal(h.timers.size,0);assert.deepEqual(h.calls,['pause']);
 h.setTime(61000);h.ctx.advance(1,false);assert.deepEqual(h.calls,['pause']);
 h.ctx.pause(false);assert.equal(h.saved.get('screen-a'),'0');assert.equal(h.media._admiraOperatorPaused,false);
 assert.deepEqual(h.calls,['pause','play']);assert.equal(h.timers.size,1);h.ctx.advance(1);assert.equal(h.calls.at(-1),'next');
});
test('repeated pause is idempotent for remaining editorial duration',()=>{
 const h=harness();h.ctx.usesAdv=true;h.ctx.pause(true);const elapsed=h.ctx.advElapsed;
 h.setTime(10000);h.ctx.pause(true);assert.equal(h.ctx.advElapsed,elapsed);
 h.ctx.pause(false);assert.equal(h.timers.get(1).ms,5000-elapsed);
});
test('paused startup survives reload per screen and does not mount or decode/recover until resume',async()=>{
 const declaration=section("const PAUSE_INTENT_KEY=",'\nlet syncTimeOffset');
 const storage=new Map([['adtv_operator_pause:screen-a','1']]);
 const ctx=vm.createContext({scr:{screen:'screen-a'},LS:(k,f)=>storage.get(k)||f});
 vm.runInContext(declaration+'\nglobalThis.restored=paused',ctx);assert.equal(ctx.restored,true);
 const other=vm.createContext({scr:{screen:'screen-b'},LS:(k,f)=>storage.get(k)||f});
 vm.runInContext(declaration+'\nglobalThis.restored=paused',other);assert.equal(other.restored,false);
 const body=html.match(/async function play\(i, forced\)\{\n  if\(_standby\|\|paused\) return;/)[0];
 let touched=false;const entry=vm.runInNewContext('('+body+'\n touched();})',{paused:true,_standby:false,touched(){touched=true;}});
 await entry(0);assert.equal(touched,false);
 const guard=vm.runInNewContext('('+html.match(/function videoDecodeGuardWait\([\s\S]*?\n\}/)[0]+')');
 assert.equal(guard({_admiraOperatorPaused:true},0,0,60000),750);
});
