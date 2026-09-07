/* Execute only catalogued routes and revalidate every hop against the current SDK links. */
(function(root){
 'use strict';
 function create({getRoute,getWalker,setHeading=()=>{},onState=()=>{},onArrival=()=>{},onCancel=()=>{},stepDelayMs=450,timeoutMs=18000,linkGraceMs=1200,linkRetryMs=80,minHopIntervalMs=600,timer=null}){
  const clock=timer||{now:()=>Date.now(),setTimeout:(fn,ms)=>setTimeout(fn,ms),clearTimeout:id=>clearTimeout(id)};
  const speeds=[1,2,4,6,8];
  let active=null,disposed=false,lastHopAt;
  function emit(run,status,reason){run.status=status;onState({speed:run.speed,routeId:run.route.id,requestId:run.requestId,status,step:run.index,total:run.route.panos.length-1,pano:run.route.panos[run.index],...(reason?{reason}:{})})}
  function cancel(reason='cancel',requestId){if(!active||(requestId!==undefined&&requestId!==active.requestId))return false;const run=active;active=null;clock.clearTimeout(run.timer);clock.clearTimeout(run.next);onCancel(run.requestId);getWalker()?.command({action:'release'});emit(run,'cancelled',reason);return true;}
  function fail(run,reason){if(active!==run)return;active=null;clock.clearTimeout(run.timer);clock.clearTimeout(run.next);onCancel(run.requestId);getWalker()?.command({action:'release'});emit(run,'error',reason)}
  function next(run){
   if(active!==run||disposed||run.pending)return;
   const walker=getWalker(),s=walker?.getState();
   if(!s||!['ready','unavailable'].includes(s.status)||s.pano!==run.route.panos[run.index]){fail(run,'unavailable');return;}
   // Google's imagery viewer can publish a previous transition after status OK.
   // Do not overlap another orientation/hop with that native transition. This
   // guard survives pause/resume and also protects the final camera focus. It
   // is independent of the user's readable-pause multiplier.
   const settling=lastHopAt===undefined?0:minHopIntervalMs-(clock.now()-lastHopAt);
   if(settling>0){run.nextKind='sdk';run.next=clock.setTimeout(()=>{run.next=null;run.nextKind=null;next(run)},settling);return;}
   if(run.index===run.route.panos.length-1){run.ready=true;clock.clearTimeout(run.timer);onArrival(run.route);emit(run,'ready');return;}
   const target=run.route.panos[run.index+1],link=s.links.find(l=>l.pano===target);
   if(!link){
    // StreetWalk first emits service metadata; a stable SDK links update can follow.
    run.linkDeadline??=clock.now()+linkGraceMs;
    if(clock.now()>=run.linkDeadline){fail(run,'missing-link');return;}
    clock.clearTimeout(run.next);run.nextKind='links';run.next=clock.setTimeout(()=>{run.next=null;run.nextKind=null;next(run)},linkRetryMs);return;
   }
   run.linkDeadline=null;
   run.pending=target;run.orienting=true;emit(run,'walking');
   clock.clearTimeout(run.timer);run.timer=clock.setTimeout(()=>fail(run,'timeout'),timeoutMs);
   const move=()=>{if(active!==run||disposed||run.pending!==target)return;run.orienting=false;lastHopAt=clock.now();if(!walker.command({action:'link',pano:target}))fail(run,'unavailable');};
   let orientation;try{orientation=setHeading(link.heading,run.requestId)}catch{fail(run,'unavailable');return;}
   if(orientation?.then)orientation.then(move,()=>fail(run,'unavailable'));else move();
  }
  function scheduleDwell(run){
   clock.clearTimeout(run.next);run.nextKind='dwell';
   run.dwell.since=clock.now();
   run.next=clock.setTimeout(()=>{run.next=null;run.nextKind=null;run.dwell=null;next(run)},run.dwell.remaining/run.speed);
  }
  function setSpeed(speed,requestId,routeId){
   const run=active;if(!run||disposed||!speeds.includes(speed)||(requestId!==undefined&&requestId!==run.requestId)||(routeId!==undefined&&routeId!==run.route.id))return false;
   if(run.speed===speed)return true;
   if(run.nextKind==='dwell')run.dwell.remaining=Math.max(0,run.dwell.remaining-(clock.now()-run.dwell.since)*run.speed);
   run.speed=speed;
   if(run.nextKind==='dwell')scheduleDwell(run);
   emit(run,run.status);return true;
  }
  function observe(s){
   const run=active;if(!run||run.ready)return;
   if(s.status==='error'){fail(run,'unavailable');return;}
   if(!['ready','unavailable'].includes(s.status))return;
   if(run.orienting){if(s.pano!==run.route.panos[run.index])fail(run,'manual');return;}
   if(run.pending){if(s.pano!==run.pending){fail(run,'manual');return;}run.index++;run.pending=null;clock.clearTimeout(run.timer);emit(run,'walking');}
   else if(s.pano!==run.route.panos[run.index]){fail(run,'manual');return;}
   if(run.waiting){run.waiting=false;clock.clearTimeout(run.timer);}
   if(run.next)return;
   if(run.index===run.route.panos.length-1){next(run);return;}
   run.dwell={remaining:stepDelayMs,since:clock.now()};scheduleDwell(run);
  }
  function start(routeId,requestId,options={}){
   const speed=options.speed??1;
   const route=getRoute(routeId);if(!speeds.includes(speed)||disposed||!route||!Array.isArray(route.panos)||route.panos.length<2||!Number.isSafeInteger(requestId)||requestId<1)return false;
   cancel();const s=getWalker()?.getState(),index=route.panos.indexOf(s?.pano);
   const run={route,requestId,speed,index:Math.max(0,index),pending:null,ready:false};active=run;emit(run,'loading');
   if(index<0){fail(run,'off-route');return false;}
   if(s?.status==='loading'){
    run.waiting=true;run.timer=clock.setTimeout(()=>fail(run,'timeout'),timeoutMs);return true;
   }
   if(!['ready','unavailable'].includes(s?.status)){fail(run,'unavailable');return false;}
   next(run);return true;
  }
  return {start,setSpeed,cancel,observe,dispose(){cancel();disposed=true},get active(){return active?{routeId:active.route.id,requestId:active.requestId,speed:active.speed}:null}};
 }
 const api={create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RouteWalk=api;
})(typeof globalThis!=='undefined'?globalThis:this);
