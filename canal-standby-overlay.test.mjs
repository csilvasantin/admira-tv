import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('./canal.html',import.meta.url),'utf8');
test('authorized blackout survives the active foreign-overlay guard and resume removes it',()=>{
 const kids=[],document={body:{children:kids,appendChild(n){kids.push(n)}},getElementById(id){return kids.find(n=>n.id===id)},createElement(){const attrs={};return {nodeType:1,tagName:'DIV',style:{},setAttribute(k,v){attrs[k]=v},getAttribute(k){return attrs[k]},remove(){kids.splice(kids.indexOf(this),1)}}}};
 const c=vm.createContext({document,save(){},setPaused(){},_postStandby(){},setInterval(){return 1},clearInterval(){},setLive(){},loadFeed(){},rebuild(){},_standby:false,_sbKeep:null,_nowItem:{},seenSig:''});
 vm.runInContext(html.match(/function standbyOn\(on\)\{[\s\S]*?\n\}/)[0],c);
 vm.runInContext(html.match(/  function isOwn\(node\)\{[\s\S]*?\n  \}/)[0],c);
 vm.runInContext('standbyOn(true)',c);const overlay=kids[0];assert.equal(c._standby,true);assert.equal(overlay.id,'standby-ov');assert.match(overlay.style.cssText,/background:#000/);assert.equal(vm.runInContext('isOwn(document.body.children[0])',c),true);
 const foreign=document.createElement('div');kids.push(foreign);assert.equal(vm.runInContext('isOwn(document.body.children[1])',c),false,'foreign popup protection stays active');
 vm.runInContext('standbyOn(false)',c);assert.equal(c._standby,false);assert.equal(kids.includes(overlay),false);
});
