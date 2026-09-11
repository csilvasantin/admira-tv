// COCO-SSD 2.2.3 adapter: class-aware postprocessing of its pinned raw outputs.
// The stock wrapper keeps only the strongest class per anchor and runs NMS
// across classes, so a rider can suppress the bicycle at the same location.
const SCORE_INDEX={person:0,bicycle:1,car:2,motorcycle:3};
export function iou(a,b){
  const area=Math.max(0,Math.min(a[0]+a[2],b[0]+b[2])-Math.max(a[0],b[0]))*Math.max(0,Math.min(a[1]+a[3],b[1]+b[3])-Math.max(a[1],b[1]));
  return area/(a[2]*a[3]+b[2]*b[3]-area)||0;
}
export function decodeDetections(scores,boxes,count,classes,width,height,minScore=.25){
  if(classes!==90||scores.length!==count*classes||boxes.length!==count*4)throw new Error('COCO output contract changed');
  const result=[];
  for(const [category,index] of Object.entries(SCORE_INDEX)){
    const candidates=[];
    for(let i=0;i<count;i++){
      const score=scores[i*classes+index];if(!Number.isFinite(score)||score<minScore||score>1)continue;
      const values=Array.from(boxes.subarray(i*4,i*4+4));if(!values.every(Number.isFinite))continue;
      const [top,left,bottom,right]=values.map(v=>Math.min(1,Math.max(0,v)));
      const bbox=[left*width,top*height,(right-left)*width,(bottom-top)*height];
      if(bbox[2]<3||bbox[3]<3)continue;
      candidates.push({class:category,score,bbox});
    }
    const kept=[];
    for(const p of candidates.sort((a,b)=>b.score-a.score).slice(0,200)){
      if(!kept.some(previous=>iou(p.bbox,previous.bbox)>.45))kept.push(p);
      if(kept.length===20)break;
    }
    result.push(...kept);
  }
  return result.sort((a,b)=>b.score-a.score);
}
export async function detectObjects(model,tf,input,minScore=.25){
  // Compatibility for alternative detector adapters and in-process test fixtures.
  if(!model.model?.executeAsync||!tf?.tidy)return model.detect(input,40,minScore);
  let batch,output;
  try{
    batch=tf.tidy(()=>tf.expandDims(input instanceof tf.Tensor?input:tf.browser.fromPixels(input)));
    output=await model.model.executeAsync(batch);
    if(!Array.isArray(output)||output.length!==2||output[0].shape.length!==3||output[1].shape.at(-1)!==4)throw new Error('Unexpected COCO outputs');
    const [scores,boxes]=await Promise.all([output[0].data(),output[1].data()]);
    return decodeDetections(scores,boxes,output[0].shape[1],output[0].shape[2],batch.shape[2],batch.shape[1],minScore);
  }finally{if(output)tf.dispose(output);batch?.dispose();}
}
