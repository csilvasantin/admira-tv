/* Screen exposure and linked street travel share one cancellable tour lifecycle. */
(function(root){
  'use strict';
  function create(options){
    const stops=options.stops.slice();
    if(!stops.length||new Set(stops.map(s=>s.id)).size!==stops.length)throw Error('Tour requires unique screens');
    const now=options.now||(()=>performance.now()),later=options.setTimeout||setTimeout,clear=options.clearTimeout||clearTimeout;
    const dwellMs=options.dwellMs??9000,timeoutMs=options.timeoutMs??30000;
    const send=options.send,sendRoute=options.sendRoute||(()=>{throw Error('Route unavailable');}),onChange=options.onChange||(()=>{});
    let order=stops.slice(),index=0,status='idle',requestId=0,sequence=0,lap=1,mode='direct';
    let remainingMs=dwellMs,deadline=0,loadTimer=null,dwellTimer=null,reason=null,destroyed=false;
    let kind=null,route=null,routeStep=0,routeTotal=0,position=null,positionStatus=null;
    const engaged=()=>['locating','travelling','loading','playing','paused','error'].includes(status);
    const current=()=>order[index];
    const canFocus=pano=>options.canFocus?options.canFocus(current().id,pano):pano===current().pano;
    function getState(){
      const remaining=status==='playing'?Math.max(0,deadline-now()):remainingMs;
      return {status,index,total:order.length,surfaceId:current().id,siteId:current().siteId,label:current().label,
        requestId,lap,mode,remainingMs:remaining,progress:Math.min(1,Math.max(0,1-remaining/dwellMs)),reason,
        routeId:route?.id||null,routeStep,routeTotal,pano:position};
    }
    const emit=()=>onChange(getState());
    function clearTimers(){clear(loadTimer);clear(dwellTimer);loadTimer=dwellTimer=null;}
    function cancel(){
      if(!requestId)return;
      try{
        if(kind==='route'&&route)sendRoute({action:'cancel',routeId:route.id,requestId});
        else if(kind==='surface')send({action:'cancel',surfaceId:current().id,requestId});
      }catch(_){/* Cancellation still clears all local continuation timers. */}
    }
    function fail(why){clearTimers();status='error';reason=why;cancel();emit();}
    function watch(){
      clear(loadTimer);const token=requestId;
      loadTimer=later(()=>{if(requestId===token&&['locating','travelling','loading'].includes(status))fail('timeout');},timeoutMs);
    }
    function focus(){
      clearTimers();kind='surface';route=null;routeStep=routeTotal=0;status='loading';reason=null;requestId=++sequence;
      emit();watch();
      try{send({action:'focus',surfaceId:current().id,requestId,...(mode==='walk'?{preservePano:true}:{})});}catch(_){fail('unavailable');}
    }
    function travel(nextRoute){
      clearTimers();kind='route';route=nextRoute;routeStep=route.panos.indexOf(position);routeTotal=route.panos.length-1;
      status='travelling';reason=null;requestId=++sequence;emit();watch();
      try{sendRoute({action:'start',routeId:route.id,requestId});}catch(_){fail('unavailable');}
    }
    function visit(nextIndex,remaining=dwellMs){
      clearTimers();index=nextIndex;remainingMs=remaining;reason=null;
      if(mode==='direct'){focus();return;}
      if(!position||!['ready','unavailable'].includes(positionStatus)){
        kind=null;status='locating';requestId=++sequence;emit();watch();return;
      }
      if(canFocus(position)){focus();return;}
      const nextRoute=options.findRoute?.(position,current().siteId);
      if(!nextRoute||!canFocus(nextRoute.panos.at(-1))){kind=null;route=null;fail('off-route');return;}
      travel(nextRoute);
    }
    function stop(why='user'){
      if(!engaged())return;
      if(status==='playing')remainingMs=Math.max(0,deadline-now());
      clearTimers();status='stopped';reason=why;cancel();emit();
    }
    function accept(event){
      if(destroyed||kind!=='surface'||!event||event.requestId!==requestId||event.surfaceId!==current().id)return false;
      if(event.status==='cancelled'&&event.reason==='manual'&&engaged()){stop('manual');return true;}
      if(status!=='loading')return false;
      if(event.status==='error'){fail(event.reason||'unavailable');return true;}
      if(event.status==='cancelled'){stop(event.reason||'cancel');return true;}
      if(event.status!=='ready')return false;
      if(current().pano&&!canFocus(position)){position=current().pano;}positionStatus='ready';
      clear(loadTimer);loadTimer=null;status='playing';deadline=now()+remainingMs;
      const token=requestId;
      dwellTimer=later(()=>{
        if(requestId!==token||status!=='playing')return;
        remainingMs=0;cancel();const next=(index+1)%order.length;if(!next)lap++;
        visit(next);
      },remainingMs);
      emit();return true;
    }
    function acceptRoute(event){
      if(destroyed||kind!=='route'||!event||event.requestId!==requestId||event.routeId!==route?.id)return false;
      if(event.status==='cancelled'&&event.reason==='manual'&&engaged()){stop('manual');return true;}
      if(status!=='travelling')return false;
      if(event.status==='error'){fail(event.reason||'unavailable');return true;}
      if(event.status==='cancelled'){stop(event.reason||'cancel');return true;}
      if(event.status==='ready'){
        if(event.pano!==route.panos.at(-1)||!canFocus(event.pano)){fail('off-route');return true;}
        position=event.pano;positionStatus='ready';cancel();focus();return true;
      }
      if(!['loading','walking'].includes(event.status))return false;
      if(Number.isInteger(event.step)&&event.step>=routeStep&&event.step<=routeTotal){
        if(event.step>routeStep)watch();routeStep=event.step;
      }
      emit();return true;
    }
    function observePosition(state){
      position=state?.pano||null;positionStatus=state?.status||null;
      if(status==='locating'){
        if(['ready','unavailable'].includes(positionStatus)&&position)visit(index,remainingMs);
        else if(positionStatus==='error')fail('unavailable');
      }
    }
    function start(surfaceId,settings={}){
      if(destroyed)return false;
      clearTimers();status='idle';cancel();kind=null;route=null;routeStep=routeTotal=0;
      mode=settings.mode==='walk'?'walk':'direct';
      const startIndex=Math.max(0,stops.findIndex(stop=>stop.id===surfaceId));
      order=stops.slice(startIndex).concat(stops.slice(0,startIndex));index=0;lap=1;remainingMs=dwellMs;visit(0);return true;
    }
    function pause(){
      if(!['locating','travelling','loading','playing'].includes(status))return;
      if(status==='playing')remainingMs=Math.max(0,deadline-now());
      clearTimers();status='paused';reason=null;cancel();emit();
    }
    function resume(){if(['paused','error'].includes(status)&&!destroyed)visit(index,remainingMs);}
    return {start,pause,resume,stop,accept,acceptRoute,observePosition,getState,isActive:engaged,
      destroy(){stop('closed');destroyed=true;clearTimers();}};
  }
  const api={create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DoohTour=api;
})(typeof globalThis!=='undefined'?globalThis:this);
