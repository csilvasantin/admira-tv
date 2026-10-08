import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {demoReadiness,installDemoSetup,DIGITAL_TWIN_URL} from './demo-setup.mjs';
const complete={connected:true,cameraFresh:true,videoTime:1,videoReady:true,framing:true,detector:true,analyzing:true,player:{playing:true,audioEnabled:true}};
test('ready requires fresh camera, framing, detector, live analysis, actual playback and enabled audio',()=>{
 assert.equal(demoReadiness(complete).ready,true);
 for(const key of ['cameraFresh','framing','detector','analyzing'])assert.equal(demoReadiness({...complete,[key]:false}).ready,false,key);
 for(const key of ['playing','audioEnabled'])assert.equal(demoReadiness({...complete,player:{...complete.player,[key]:false}}).ready,false,key);
});
function fixture({blocked=false,fail=false,pending=false}={}){
 const nodes=new Map(),calls={opened:[],model:0,resume:0,share:0,focus:0,analysis:0};let time=100,resolve;
 const get=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',classList:{toggle(){}},listeners:{},addEventListener(k,fn){this.listeners[k]=fn;},click(){return this.listeners.click?.();}});return nodes.get(id);};
 let state={...complete,player:{...complete.player}};
 const twin={closed:false,focus(){calls.focus++;}};
 const window={open(...args){calls.opened.push(args);return blocked?null:twin;},addEventListener(){}};
 const controller=installDemoSetup({document:{getElementById:get},window,snapshot:()=>state,now:()=>time,schedule:()=>0,cancel(){},resumePlayer:()=>calls.resume++,share:()=>calls.share++,startAnalysis:()=>calls.analysis++,prepareDetector:()=>{calls.model++;return fail?Promise.reject(new Error('network')):pending?new Promise(r=>{resolve=r;}):Promise.resolve();}});
 return {controller,get,calls,twin,setState:s=>{state=s;},tick:ms=>{time+=ms;},finish:()=>resolve()};
}
test('prepare opens IEU synchronously, warms detector, reuses its tab and never requests capture itself',async()=>{
 const f=fixture({pending:true});const promise=f.get('prepare-demo').click();
 assert.deepEqual(f.calls.opened,[[DIGITAL_TWIN_URL,'xtore-demo-digitaltwin']]);assert.equal(f.calls.model,1);assert.equal(f.calls.resume,1);assert.equal(f.calls.share,0);
 await f.controller.prepare();assert.equal(f.calls.model,1);f.finish();await promise;
 const again=f.controller.prepare();assert.equal(f.calls.opened.length,1);assert.equal(f.calls.focus,1);f.finish();await again;
 f.get('demo-share').click();assert.equal(f.calls.share,1);
});
test('blocked popup and detector failure stay retryable without discarding existing capture',async()=>{
 const f=fixture({blocked:true,fail:true});await f.controller.prepare();
 assert.match(f.get('demo-open-status').textContent,/No se pudo abrir/);assert.equal(f.get('prepare-demo').disabled,false);assert.equal(f.calls.share,0);
 await f.controller.prepare();assert.equal(f.calls.model,2);
});
test('a frozen source loses readiness even when the connection still exists; a new frame restores it',()=>{
 const f=fixture();assert.equal(f.controller.render().ready,true);
 f.tick(1600);assert.equal(f.controller.render().ready,false);
 f.setState({...complete,videoTime:2});assert.equal(f.controller.render().ready,true);
 f.setState({...complete,connected:false});assert.equal(f.controller.render().ready,false);
});
test('Xtore uses the exact native shell and keeps every original control ID once',()=>{
 const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
 for(const file of ['admira-nav.js','admira-frame.js','admira-frame.css'])assert.ok(html.includes('/'+file));
 for(const slot of ['left','right','bottom'])assert.ok(html.includes('data-af-slot="'+slot+'"'));
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
 for(const id of ['analyze','connect','stop','set-roi','set-tablet','set-signage','prepare-model','start-signage','stop-signage','test-person','capture-canvas','reset-counts','history-panel','twin-photo','hide-people'])assert.ok(ids.includes(id),id);
});

test('Xtore production policy allows exact native Expert resources while retaining capture isolation',()=>{
 const headers=readFileSync(new URL('../../_headers',import.meta.url),'utf8').split('/videoanalytics/xtore/*')[1].split('/videoanalitics/estadisticas/')[0];
 for(const asset of ['https://www.admiranext.com/suite/experto.js','https://www.admiranext.com/suite/experto.css'])assert.ok(headers.includes(asset));
 assert.ok(headers.includes('camera=(), microphone=(), geolocation=()'));
 assert.ok(headers.includes("frame-ancestors 'none'"));
 assert.ok(!headers.includes('unsafe-eval'));
});

test('camera framing guidance and capture refusal remain visible without opening panels',async()=>{
 assert.match(demoReadiness({...complete,framing:false,calibrating:true,statusMessage:'Marca dos puntos en la escena'}).message,/Marca dos puntos/);
 const f=fixture();f.setState({...complete,connected:false,statusMessage:'No se ha concedido permiso para compartir. Puedes volver a intentarlo.'});
 await f.get('demo-share').click();
 assert.match(f.get('demo-next').textContent,/No se ha concedido permiso/);
 assert.equal(f.get('demo-share').disabled,false);
 assert.equal(f.controller.render().ready,false);
});
