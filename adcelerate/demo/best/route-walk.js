/* Execute only catalogued routes and revalidate every hop against the current SDK links. */
(function(root){
 'use strict';
 function create({getRoute,getWalker,setHeading=()=>{},onState=()=>{},onArrival=()=>{},onCancel=()=>{},stepDelayMs=1300,timeoutMs=18000,linkGraceMs=1200,linkRetryMs=80}){
  let active=null,disposed=false;
  function emit(run,status,reason){onState({routeId:run.route.id,requestId:run.requestId,status,step:run.index,total:run.route.panos.length-1,pano:run.route.panos[run.index],...(reason?{reason}:{})})}
  function cancel(reason='cancel',requestId){if(!active||(requestId!==undefined&&requestId!==active.requestId))return false;const run=active;active=null;clearTimeout(run.timer);clearTimeout(run.next);onCancel(run.requestId);getWalker()?.command({action:'release'});emit(run,'cancelled',reason);return true;}
  function fail(run,reason){if(active!==run)return;active=null;clearTimeout(run.timer);clearTimeout(run.next);onCancel(run.requestId);getWalker()?.command({action:'release'});emit(run,'error',reason)}
  function next(run){
   if(active!==run||disposed||run.pending)return;
   const walker=getWalker(),s=walker?.getState();
   if(!s||!['ready','unavailable'].includes(s.status)||s.pano!==run.route.panos[run.index]){fail(run,'unavailable');return;}
   if(run.index===run.route.panos.length-1){run.ready=true;clearTimeout(run.timer);onArrival(run.route);emit(run,'ready');return;}
   const target=run.route.panos[run.index+1],link=s.links.find(l=>l.pano===target);
   if(!link){
    // StreetWalk first emits service metadata; a stable SDK links update can follow.
    run.linkDeadline??=Date.now()+linkGraceMs;
    if(Date.now()>=run.linkDeadline){fail(run,'missing-link');return;}
    clearTimeout(run.next);run.next=setTimeout(()=>{run.next=null;next(run)},linkRetryMs);return;
   }
   run.linkDeadline=null;
   run.pending=target;run.orienting=true;emit(run,'walking');
   clearTimeout(run.timer);run.timer=setTimeout(()=>fail(run,'timeout'),timeoutMs);
   const move=()=>{if(active!==run||disposed||run.pending!==target)return;run.orienting=false;if(!walker.command({action:'link',pano:target}))fail(run,'unavailable');};
   let orientation;try{orientation=setHeading(link.heading,run.requestId)}catch{fail(run,'unavailable');return;}
   if(orientation?.then)orientation.then(move,()=>fail(run,'unavailable'));else move();
  }
  function observe(s){
   const run=active;if(!run||run.ready)return;
   if(s.status==='error'){fail(run,'unavailable');return;}
   if(!['ready','unavailable'].includes(s.status))return;
   if(run.orienting){if(s.pano!==run.route.panos[run.index])fail(run,'manual');return;}
   if(run.pending){if(s.pano!==run.pending){fail(run,'manual');return;}run.index++;run.pending=null;clearTimeout(run.timer);emit(run,'walking');}
   else if(s.pano!==run.route.panos[run.index]){fail(run,'manual');return;}
   if(run.waiting){run.waiting=false;clearTimeout(run.timer);}
   if(run.next)return;
   run.next=setTimeout(()=>{run.next=null;next(run)},stepDelayMs);
  }
  function start(routeId,requestId){
   const route=getRoute(routeId);if(disposed||!route||!Array.isArray(route.panos)||route.panos.length<2||!Number.isSafeInteger(requestId)||requestId<1)return false;
   cancel();const s=getWalker()?.getState(),index=route.panos.indexOf(s?.pano);
   const run={route,requestId,index:Math.max(0,index),pending:null,ready:false};active=run;emit(run,'loading');
   if(index<0){fail(run,'off-route');return false;}
   if(s?.status==='loading'){
    run.waiting=true;run.timer=setTimeout(()=>fail(run,'timeout'),timeoutMs);return true;
   }
   if(!['ready','unavailable'].includes(s?.status)){fail(run,'unavailable');return false;}
   next(run);return true;
  }
  return {start,cancel,observe,dispose(){cancel();disposed=true},get active(){return active?{routeId:active.route.id,requestId:active.requestId}:null}};
 }
 const api={create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RouteWalk=api;
})(typeof globalThis!=='undefined'?globalThis:this);
