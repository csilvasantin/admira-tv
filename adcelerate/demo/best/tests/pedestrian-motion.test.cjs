const {test}=require('node:test'),assert=require('node:assert/strict');
const motion=require('../../js/pedestrian-motion.js'),layers=require('../../js/pedestrian-layers.js');
test('diagonal movement is normalized and long frame gaps cannot teleport',()=>{
 assert.deepEqual(motion.displacement(new Set(['ArrowRight']),.05,120),[6,0]);
 const diagonal=motion.displacement(new Set(['ArrowRight','ArrowUp']),.05,120);assert.ok(Math.abs(Math.hypot(...diagonal)-6)<1e-10);
 assert.deepEqual(motion.displacement(new Set(['ArrowRight','ArrowLeft']),.03,120),[0,0]);
 assert.deepEqual(motion.displacement(new Set(['ArrowDown']),20,120),[0,6]);
});
test('eight distinct step phases cycle by travelled distance and count half strides',()=>{
 const frames=Array.from({length:8},(_,i)=>motion.pose(i*3));assert.deepEqual(frames.map(p=>p.frame),[0,1,2,3,4,5,6,7]);
 assert.notEqual(frames[0].left,frames[4].left);assert.equal(motion.pose(24).frame,0);assert.equal(motion.pose(24).steps,2);
});
test('last arriving person owns the music and leaving restores the previous occupant',()=>{
 const o=motion.occupancy();assert.deepEqual(o.update(0,true),{owner:0,changed:true,entered:true});
 assert.deepEqual(o.update(5,true),{owner:5,changed:true,entered:true});
 assert.deepEqual(o.update(0,true),{owner:5,changed:false,entered:false});
 assert.equal(o.update(5,false).owner,0);assert.equal(o.update(0,false).owner,null);
});
test('moving an unrelated person outside does not stop current music; deliberate drop reclaims it',()=>{
 const o=motion.occupancy();o.update(0,true);o.update(1,true);assert.equal(o.update(9,false).changed,false);
 assert.equal(o.update(0,true,true).owner,0);o.clear();assert.equal(o.owner,null);assert.equal(o.update(8,true).owner,8);
});
test('every mapped character has a dedicated source region and silhouette',()=>{assert.equal(layers.silhouettes.length,10);for(let i=0;i<10;i++){assert.ok(layers.silhouettes[i].split(',').length>=15);assert.equal(layers.regions[i].length,4);}});
