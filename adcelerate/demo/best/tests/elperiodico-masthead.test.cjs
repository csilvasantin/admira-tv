const test=require('node:test'),assert=require('node:assert');
const S=require('../../js/interactive-scene.js');
test('mapeo correlativo',()=>{assert.equal(S.letterForPerson(1),'e');assert.equal(S.letterForPerson(3),'P');assert.equal(S.letterForPerson(10),'c');assert.equal(S.MASTHEAD_LETTERS.join('')+S.MASTHEAD_FINAL,'elPeriódico');assert.equal(S.letterForPerson(7),'ó');});
test('consume solo en drop dentro',()=>{const c=Array(10).fill(false);assert.equal(S.consumeOnDrop(c,0,{inside:false}),false);assert.equal(S.consumeOnDrop(c,0,{inside:true,cancel:true}),false);assert.equal(S.consumeOnDrop(c,0,{inside:true}),true);assert.equal(S.consumeOnDrop(c,0,{inside:true}),false);assert.deepEqual(c.map(Number),[1,0,0,0,0,0,0,0,0,0]);});
test('completo y reset',()=>{const c=Array(10).fill(true);assert.ok(S.mastheadComplete(c));c.fill(false);assert.ok(!S.mastheadComplete(c));});
