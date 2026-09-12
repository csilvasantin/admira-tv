import test from 'node:test';
import assert from 'node:assert/strict';
import {CalibrationPresetStore,PRESET_KEY,validPreset,compatiblePreset} from './preset.mjs';
const roi=[.7,.02,.25,.3],tablet=[[.1,.1],[.4,.1],[.4,.5],[.1,.5]],source=[1920,1080];
const make=()=>({version:1,savedAt:1789200000000,source:[...source],roi:[...roi],tablet:tablet.map(p=>[...p]),signage:null});
function storage(){const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k),m};}
test('last preset survives a new store instance, geometry only, with deep copies',()=>{
  const s=storage(),store=new CalibrationPresetStore(()=>s,()=>1789200000000);
  assert.equal(store.read().state,'empty');const p=make();
  assert.equal(store.save({...p,image:'never stored',token:'never stored'}).state,'saved');p.roi[0]=0;
  const restored=new CalibrationPresetStore(()=>s).read();assert.deepEqual(restored.preset,make());
  assert.deepEqual(Object.keys(JSON.parse(s.getItem(PRESET_KEY))),['version','savedAt','source','roi','tablet','signage']);
  assert.equal(s.m.size,1);
});
test('partial surfaces and optional DS persist, but no fabricated defaults or invalid geometry',()=>{
  const s=storage(),store=new CalibrationPresetStore(()=>s,()=>1);
  assert.equal(store.save({source,roi}).state,'saved');assert.equal(store.read().preset.tablet,null);
  const good=s.getItem(PRESET_KEY);
  for(const p of [{source},{source,roi:[2,2,1,1]},{source,tablet:[[0,0]]},{source:[0,0],roi}])assert.equal(store.save(p).state,'invalid');
  assert.equal(s.getItem(PRESET_KEY),good);
});
test('same aspect can scale coordinates; incompatible viewport and malformed source are rejected',()=>{
  assert.equal(compatiblePreset(make(),[1280,720]),true);
  assert.equal(compatiblePreset(make(),[1920,1081]),true);
  for(const s of [[1080,1920],[1440,720],[0,0],[Infinity,2],['1920',1080]])assert.equal(compatiblePreset(make(),s),false);
});
test('stored data fails closed for oversized, corrupt, extra fields and invalid versions',()=>{
  const s=storage(),store=new CalibrationPresetStore(()=>s);
  for(const raw of ['{','null','x'.repeat(4097),JSON.stringify({...make(),version:2}),JSON.stringify({...make(),image:'no'}),JSON.stringify({...make(),source:[32769,1]}),JSON.stringify({...make(),tablet:tablet.slice().reverse()})]){
    s.setItem(PRESET_KEY,raw);assert.equal(store.read().state,'invalid');assert.equal(store.read().preset,null);
  }
  assert.equal(validPreset({...make(),savedAt:NaN}),false);
});
test('blocked storage and quota do not claim persistence; clear removes only our key',()=>{
  const no=new CalibrationPresetStore(()=>{throw new Error('blocked');});
  assert.equal(no.read().state,'unavailable');assert.equal(no.save(make()).state,'unavailable');assert.equal(no.clear(),false);
  const s=storage();s.setItem('unrelated','safe');s.setItem(PRESET_KEY,JSON.stringify(make()));
  const store=new CalibrationPresetStore(()=>s);assert.equal(store.clear(),true);assert.equal(s.getItem('unrelated'),'safe');assert.equal(store.read().state,'empty');
});
