/* Short, cancellable camera turns shared by every photographic circuit. */
(function(root){
 'use strict';
 function create({getView,getSpeed=()=>1,reducedMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches,requestFrame=fn=>requestAnimationFrame(fn),cancelFrame=id=>cancelAnimationFrame(id),now=()=>performance.now()}){
  let motion=null;
  function cancel(id){if(!motion||(id!==undefined&&motion.id!==id))return;const m=motion;motion=null;cancelFrame(m.frame);m.reject(Error('Cancelled'));}
  function turn(heading,id){
   cancel();const view=getView();if(!view)return Promise.reject(Error('Panorama unavailable'));
   const from=view.getPov(),dh=((heading-from.heading+540)%360)-180;
   if(reducedMotion()||(Math.abs(dh)<2&&Math.abs(from.pitch)<2)){view.setPov({heading,pitch:0});return;}
   const duration=Math.max(80,Math.min(240,Math.abs(dh)*2));
   return new Promise((resolve,reject)=>{const m={id,frame:null,reject};motion=m;let previous=now(),elapsed=0;
    function frame(t){if(motion!==m)return;elapsed+=Math.max(0,t-previous)*Math.sqrt(getSpeed());previous=t;const p=Math.min(1,elapsed/duration),ease=p*p*(3-2*p);view.setPov({heading:from.heading+dh*ease,pitch:from.pitch*(1-ease)});if(p<1)m.frame=requestFrame(frame);else{motion=null;resolve();}}
    m.frame=requestFrame(frame);
   });
  }
  return {turn,cancel,dispose(){cancel();}};
 }
 const api={create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WalkOrientation=api;
})(typeof globalThis!=='undefined'?globalThis:this);
