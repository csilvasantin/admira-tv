import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeDetections,detectObjects} from './detector.mjs';
const scores=new Float32Array(180);
scores[0]=.9;scores[1]=.45;scores[90]=.8;scores[91]=.4;
const boxes=new Float32Array([.2,.1,.8,.5,.21,.11,.79,.49]);
test('rider and bicycle survive together; overlapping duplicate anchors do not',()=>{
  const found=decodeDetections(scores,boxes,2,90,1000,500,.35);
  assert.deepEqual(found.map(p=>p.class),['person','bicycle']);
  assert.equal(decodeDetections(scores,boxes,2,90,1000,500,.65).length,1);
});
test('decoder fails closed on changed shape and discards invalid boxes and scores',()=>{
  assert.throws(()=>decodeDetections(scores,boxes,2,91,1000,500),/contract/);
  const bad=scores.slice();bad[0]=NaN;bad[1]=2;bad[90]=Infinity;bad[91]=-.1;
  assert.deepEqual(decodeDetections(bad,boxes,2,90,1000,500),[]);
  assert.deepEqual(decodeDetections(scores,new Float32Array([NaN,0,1,1,1,0,0,1]),2,90,1000,500),[]);
});
test('raw adapter disposes input batch and outputs, including on decode failure',async()=>{
  for(const fail of [false,true]){
    let batchDisposed=false,outputsDisposed=false;
    class Tensor{}
    const batch={shape:[1,500,1000,3],dispose(){batchDisposed=true;}};
    const tf={Tensor,tidy:fn=>fn(),expandDims:()=>batch,dispose:()=>{outputsDisposed=true;}};
    const output=[{shape:[1,2,fail?91:90],data:async()=>scores},{shape:[1,2,1,4],data:async()=>boxes}];
    const run=detectObjects({model:{executeAsync:async()=>output}},tf,new Tensor(),.35);
    if(fail)await assert.rejects(run,/contract/);else assert.equal((await run).length,2);
    assert.ok(batchDisposed);assert.ok(outputsDisposed);
  }
});
