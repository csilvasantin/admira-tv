const{test}=require('node:test'),assert=require('node:assert/strict');const{clamp}=require('../cenital-panel.js');
test('drag keeps all panel edges reachable in the viewport',()=>{assert.deepEqual(clamp(-50,-20,250,200,1280,720),{x:8,y:8});assert.deepEqual(clamp(2000,2000,250,200,1280,720),{x:1022,y:512});});
test('a narrow resized viewport keeps the title and close control in reach',()=>{assert.deepEqual(clamp(700,500,210,180,390,844),{x:172,y:500});assert.deepEqual(clamp(700,500,250,300,240,250),{x:8,y:8});});
