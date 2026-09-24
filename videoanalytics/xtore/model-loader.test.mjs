import test from 'node:test';
import assert from 'node:assert/strict';
import {loadDetectorModel} from './model-loader.mjs';
const flush=()=>new Promise(r=>setImmediate(r));
test('a ready real-adapter contract loads once without reloading existing libraries',async()=>{
  const stages=[];let loads=0;
  const model={dispose(){}};
  const result=await loadDetectorModel({getTF:()=>({ready:async()=>{}}),getCoco:()=>({load:async opts=>{loads++;assert.equal(opts.base,'mobilenet_v2');return model;}}),loadScript:()=>assert.fail(),onProgress:s=>stages.push(s)});
  assert.equal(result,model);assert.equal(loads,1);assert.match(stages[0],/3\/4/);assert.match(stages[1],/4\/4/);
});
test('engine readiness times out before the model is requested, and another attempt can succeed',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date']});let ready=false,loads=0;const stages=[];
  const opts={getTF:()=>({ready:()=>ready?Promise.resolve():new Promise(()=>{})}),getCoco:()=>({load:async()=>{loads++;return {};}}),loadScript:()=>assert.fail(),onProgress:s=>stages.push(s)};
  const rejected=assert.rejects(loadDetectorModel(opts),/Inicializando motor.*15 s/);
  await flush();t.mock.timers.tick(1000);assert.ok(stages.some(s=>s.endsWith('1 s')));
  t.mock.timers.tick(14000);await rejected;assert.equal(loads,0);
  ready=true;await loadDetectorModel(opts);assert.equal(loads,1);
});
test('timed-out models are disposed when they arrive and never replace a successful retry',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date']});let complete,disposed=0;
  const opts={getTF:()=>({ready:async()=>{}}),getCoco:()=>({load:()=>new Promise(r=>{complete=r;})}),loadScript:()=>assert.fail()};
  const rejected=assert.rejects(loadDetectorModel(opts),/preparando modelo.*60 s/);
  await flush();t.mock.timers.tick(60000);await rejected;
  const fresh={};assert.equal(await loadDetectorModel({...opts,getCoco:()=>({load:async()=>fresh})}),fresh);
  complete({dispose(){disposed++;}});await flush();assert.equal(disposed,1);
});
test('library download is bounded and rejection prevents later stages',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date']});let calls=0;
  const rejected=assert.rejects(loadDetectorModel({getTF:()=>null,getCoco:()=>null,loadScript:()=>{calls++;return new Promise(()=>{});}}),/Cargando TensorFlow.*30 s/);
  await flush();t.mock.timers.tick(30000);await rejected;assert.equal(calls,1);
});
