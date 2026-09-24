import test from 'node:test';
import assert from 'node:assert/strict';
import {loadDetectorModel} from './model-loader.mjs';
const flush=()=>new Promise(r=>setImmediate(r));
function fixture(){
 const artifacts={modelTopology:{},weightSpecs:[],weightData:new ArrayBuffer(0)},stages=[];
 let options;
 const tf={ready:async()=>{},io:{http:(url,opts)=>{assert.match(url,/ssd_mobilenet_v2\/model.json$/);options=opts;return {load:async()=>{opts.onProgress(.7);return artifacts;}};}}};
 const model={dispose(){}};
 return {artifacts,stages,model,tf,get options(){return options;},opts:{getTF:()=>tf,getCoco:()=>({load:async config=>{assert.equal(config.base,'mobilenet_v2');assert.equal(await config.modelUrl.load(),artifacts);return model;}}),loadScript:()=>assert.fail(),onProgress:s=>stages.push(s)}};
}
test('downloads once then warms exactly those artifacts without reloading scripts',async()=>{
 const f=fixture();assert.equal(await loadDetectorModel(f.opts),f.model);
 assert.match(f.stages[0],/3\/5/);assert.ok(f.stages.some(s=>/4\/5.*0 %/.test(s)));assert.match(f.stages.at(-1),/5\/5/);
});
test('slow download reports measured progress, survives 60 seconds and aborts on its own deadline',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date']});const f=fixture();let options;
 f.tf.io.http=(url,opts)=>{options=opts;return {load:()=>new Promise(()=>{})};};
 const rejected=assert.rejects(loadDetectorModel(f.opts),/Descargando modelo.*180 s/);
 await flush();options.onProgress(.45);t.mock.timers.tick(61000);await flush();
 assert.equal(options.requestInit.signal.aborted,false);assert.match(f.stages.at(-1),/45 %/);
 t.mock.timers.tick(119000);await rejected;assert.equal(options.requestInit.signal.aborted,true);
});
test('engine readiness is bounded before any download',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date']});const f=fixture();f.tf.ready=()=>new Promise(()=>{});
 const rejected=assert.rejects(loadDetectorModel(f.opts),/Inicializando motor.*15 s/);
 await flush();t.mock.timers.tick(15000);await rejected;assert.equal(f.options,undefined);
});
test('timed-out warm-up is disposed on late arrival and retry remains possible',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date']});const f=fixture();let complete,disposed=0;
 const rejected=assert.rejects(loadDetectorModel({...f.opts,getCoco:()=>({load:()=>new Promise(r=>{complete=r;})})}),/Preparando motor.*45 s/);
 await flush();t.mock.timers.tick(45000);await rejected;
 assert.equal(await loadDetectorModel(f.opts),f.model);complete({dispose(){disposed++;}});await flush();assert.equal(disposed,1);
});
test('download failure aborts outstanding requests and never begins warm-up',async()=>{
 const f=fixture();let options;
 f.tf.io.http=(url,opts)=>{options=opts;return {load:async()=>{throw Error('network');}};};
 await assert.rejects(loadDetectorModel({...f.opts,getCoco:()=>({load:()=>assert.fail()})}),/network/);
 assert.equal(options.requestInit.signal.aborted,true);
});
test('library download remains bounded',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date']});
 const rejected=assert.rejects(loadDetectorModel({getTF:()=>null,getCoco:()=>null,loadScript:()=>new Promise(()=>{})}),/Cargando TensorFlow.*30 s/);
 await flush();t.mock.timers.tick(30000);await rejected;
});
