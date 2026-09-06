/* One photographic surface request, with a retained token for manual cancellation. */
(function(root){
 'use strict';
 const angle=(a,b)=>Math.abs(((a-b+540)%360)-180);
 function create({getSurface,prepare,getCamera,onState=()=>{},onCancel=()=>{},afterPaint=fn=>requestAnimationFrame(()=>requestAnimationFrame(fn)),timeoutMs=15000,settleMs=700}){
  let active=null,disposed=false;
  const emit=(run,status,reason)=>onState({surfaceId:run.surface.id,requestId:run.requestId,status,...(reason?{reason}:{})});
  function cancel(reason='cancel',requestId){
   if(!active||(requestId!==undefined&&active.requestId!==requestId))return false;
   const run=active;active=null;clearTimeout(run.timer);clearTimeout(run.settle);onCancel(run.requestId);emit(run,'cancelled',reason);return true;
  }
  function cameraMatches(run){
   const c=getCamera(),p=run.goal;
   return c&&p&&c.pano===run.surface.pano&&c.visible===true&&angle(c.heading,p.heading)<.75&&Math.abs(c.pitch-p.pitch)<.75&&Math.abs(c.zoom-p.zoom)<.08;
  }
  function fail(run,reason){if(active!==run)return;clearTimeout(run.timer);clearTimeout(run.settle);active=null;onCancel(run.requestId);emit(run,'error',reason)}
  function check(){
   const run=active;if(!run||!run.prepared||run.ready||run.painting)return;
   const s=run.scene;
   if(s?.status==='error'){fail(run,'unavailable');return}
   if(!s||!['ready','unavailable'].includes(s.status)||s.pano!==run.surface.pano||!cameraMatches(run))return;
   run.painting=true;
   afterPaint(()=>{
    if(active!==run||disposed)return;
    const finish=()=>{if(active!==run||disposed)return;run.painting=false;if(!['ready','unavailable'].includes(run.scene?.status)||run.scene?.pano!==run.surface.pano||!cameraMatches(run))return;run.ready=true;clearTimeout(run.timer);emit(run,'ready')};
    // The public SDK has no full-resolution texture-ready event. This bounded,
    // cancellable settling interval follows scene/camera readiness and paint.
    if(settleMs>0)run.settle=setTimeout(finish,settleMs);else finish();
   });
  }
  function focus(surfaceId,requestId,options={}){
   const surface=getSurface(surfaceId,options);if(disposed||!surface||!Number.isSafeInteger(requestId)||requestId<1)return false;
   cancel();const run={surface,requestId,prepared:false,ready:false,painting:false,scene:null,goal:null};active=run;
   run.timer=setTimeout(()=>fail(run,'timeout'),timeoutMs);emit(run,'loading');
   Promise.resolve().then(()=>active===run&&!disposed?prepare(surface,requestId):null).then(goal=>{if(active!==run||disposed)return;run.goal=goal;run.prepared=true;check()},()=>fail(run,'unavailable'));
   return true;
  }
  function observe(scene){if(active){active.scene=scene;check()}}
  return {focus,observe,cancel,check,dispose(){cancel();disposed=true},get active(){return active?{surfaceId:active.surface.id,requestId:active.requestId,ready:active.ready}:null}};
 }
 const api={create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SurfaceFocus=api;
})(typeof globalThis!=='undefined'?globalThis:this);
