import test from 'node:test';
import assert from 'node:assert/strict';
import {createExclusions} from './assets/galleon-exclusions.mjs';
import {taggedForScreen} from './assets/galleon-schedule.mjs';
test('aliases route only to the Galleon and never duplicate stock rows',()=>{
 const row={id:'one',type:'video',url:'https://example.com/v.mp4',tags:['corsair','galleon','corsair-galleon-100']};
 for(const tag of row.tags) assert.equal(taggedForScreen([{...row,tags:[tag]}],'corsair-galleon-100').length,1);
 assert.equal(taggedForScreen([row],'corsair-galleon-100').length,1);
 assert.equal(taggedForScreen([row],'another-screen').length,0);
 assert.equal(taggedForScreen([{...row,oculto:true}],'corsair-galleon-100').length,0);
});
test('removed H/V slot survives reload and stays isolated by screen',()=>{
 const data=new Map(), storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
 const e=createExclusions(storage,'galleon');
 assert.deepEqual(e.removeSlot({landscape:{stockId:'a'},portrait:{id:'b'}}),['a','b']);
 const reload=createExclusions(storage,'galleon');
 assert.equal(reload.has({id:'a'}),true);assert.equal(reload.has({stockId:'b'}),true);
 assert.equal(reload.has({id:'c'}),false);assert.equal(createExclusions(storage,'other').has({id:'a'}),false);
});
test('storage failure does not silently remove a piece',()=>{
 const e=createExclusions({getItem:()=>null,setItem:()=>{throw Error('quota')}},'galleon');
 assert.throws(()=>e.removeSlot({landscape:{id:'a'}}));assert.equal(e.has({id:'a'}),false);
});
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('./assets/galleon-player.mjs',import.meta.url),'utf8');
const removal=source.slice(source.indexOf('function removePaused()'),source.indexOf('function transport(action)'));
function harness(overrides={}) {
 const slots=[{landscape:{id:'a'}},{landscape:{id:'b'}}];
 const c={pausedAt:1,onAir:{source:'playlist',id:'a',index:0},twinSelection:null,playlist:{slots},trackOf:x=>x,
 exclusions:{removeSlot:()=>['a']},composePlaylist(){c.playlist.slots.shift()},jumpToSlot(i){c.selected=i},...overrides};
 vm.createContext(c);vm.runInContext(removal,c);return c;
}
test('paused removal advances, and repeat cannot delete next playing content',()=>{
 const c=harness();assert.equal(c.removePaused().removed,true);assert.equal(c.selected,0);assert.equal(c.pausedAt,null);
 assert.equal(c.removePaused().removed,false);assert.equal(c.playlist.slots.length,1);
});
test('running, playout, twin and stale selection cannot be removed',()=>{
 for(const change of [{pausedAt:null},{onAir:{source:'playout',id:'a',index:0}},{twinSelection:{}},{onAir:{source:'playlist',id:'stale',index:0}}]) {
  const c=harness(change);assert.equal(c.removePaused().removed,false);assert.equal(c.playlist.slots.length,2);
 }
});
test('last item can be removed without jumping to invalid index',()=>{
 const c=harness({playlist:{slots:[{landscape:{id:'a'}}]}});assert.equal(c.removePaused().removed,true);assert.equal(c.selected,undefined);
});
