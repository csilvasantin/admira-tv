const {test}=require('node:test'),assert=require('node:assert/strict');
const visit=require('../store-visit.js'),shoes=require('../../adcelerate/demo/js/jardinets-shoes.js');
test('only the Store walk from Jardinets can start automatically',()=>{
 assert.equal(visit.parse('?site=store&from=jardinets').walk,true);
 for(const q of ['?site=store','?site=planeta&from=jardinets','?site=store&from=https://bad.example'])assert.equal(visit.parse(q).walk,false);
 assert.equal(visit.parse('?site=store&from=jardinets').interior,false);
});
test('Store arrival requires the destination panorama even when an earlier node is near the door',()=>{
 const goal={id:'door',position:{lat:41,lng:2}},near={id:'before-door',position:goal.position},store={id:'store',position:goal.position};
 assert.equal(visit.reached(near,store,goal,()=>4),false);
 assert.equal(visit.reached(goal,store,goal,()=>4),true);
});
test('upper shoe opens IEU directly; lower shoe starts the outdoor walk without entering',()=>{
 const [upper,lower]=shoes.zones;
 assert.equal(upper.href,'https://digitaltwin.ieu.ai/');
 const url=new URL(lower.href,'https://admira.tv');assert.deepEqual(visit.parse(url.search),{walk:true,interior:false});
 assert.equal(shoes.pano,visit.origin.pano);
 assert.ok(Math.min(...upper.corners.map(c=>c[1]))>Math.max(...lower.corners.slice(2).map(c=>c[1])));
});
