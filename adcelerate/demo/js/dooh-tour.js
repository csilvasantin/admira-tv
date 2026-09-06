/* A cancellable screen tour. Changing photographs is not represented as walking. */
(function(root){
  'use strict';
  function create(options){
    const stops=options.stops.slice();
    if(!stops.length || new Set(stops.map(s=>s.id)).size!==stops.length)throw new Error('Tour requires unique screens');
    const now=options.now||(()=>performance.now());
    const later=options.setTimeout||setTimeout,clear=options.clearTimeout||clearTimeout;
    const dwellMs=options.dwellMs??9000,timeoutMs=options.timeoutMs??30000;
    const send=options.send,onChange=options.onChange||(()=>{});
    let order=stops.slice(),index=0,status='idle',requestId=0,sequence=0,lap=1;
    let remainingMs=dwellMs,deadline=0,loadTimer=null,dwellTimer=null,reason=null,destroyed=false;
    const engaged=()=>['loading','playing','paused','error'].includes(status);
    const current=()=>order[index];
    function getState(){
      const remaining=status==='playing'?Math.max(0,deadline-now()):remainingMs;
      return {status,index,total:order.length,surfaceId:current().id,siteId:current().siteId,
        label:current().label,requestId,lap,remainingMs:remaining,
        progress:Math.min(1,Math.max(0,1-remaining/dwellMs)),reason};
    }
    const emit=()=>onChange(getState());
    function clearTimers(){clear(loadTimer);clear(dwellTimer);loadTimer=dwellTimer=null;}
    function cancel(){if(requestId)try{send({action:'cancel',surfaceId:current().id,requestId});}catch(_){/* Local timers are already stopped. */}}
    function fail(why){
      clearTimers();status='error';reason=why;cancel();emit();
    }
    function focus(nextIndex,remaining=dwellMs){
      clearTimers();index=nextIndex;remainingMs=remaining;status='loading';reason=null;
      requestId=++sequence;const token=requestId;
      emit();
      loadTimer=later(()=>{if(requestId===token && status==='loading')fail('timeout');},timeoutMs);
      try{send({action:'focus',surfaceId:current().id,requestId});}catch(_){fail('unavailable');}
    }
    function stop(why='user'){
      if(!engaged())return;
      if(status==='playing')remainingMs=Math.max(0,deadline-now());
      clearTimers();status='stopped';reason=why;cancel();emit();
    }
    function accept(event){
      if(destroyed || !event || event.requestId!==requestId || event.surfaceId!==current().id)return false;
      if(event.status==='cancelled' && event.reason==='manual' && engaged()){stop('manual');return true;}
      if(status!=='loading')return false;
      if(event.status==='error'){fail(event.reason||'unavailable');return true;}
      if(event.status==='cancelled'){stop(event.reason||'cancel');return true;}
      if(event.status!=='ready')return false;
      clear(loadTimer);loadTimer=null;status='playing';deadline=now()+remainingMs;
      const token=requestId;
      dwellTimer=later(()=>{
        if(requestId!==token || status!=='playing')return;
        remainingMs=0;
        // Complete a view before starting the next one. Loops are intentional.
        cancel();const next=(index+1)%order.length;if(!next)lap++;
        focus(next);
      },remainingMs);
      emit();return true;
    }
    function start(surfaceId){
      if(destroyed)return false;
      clearTimers();status='idle';cancel();
      const startIndex=Math.max(0,stops.findIndex(stop=>stop.id===surfaceId));
      order=stops.slice(startIndex).concat(stops.slice(0,startIndex));
      index=0;lap=1;remainingMs=dwellMs;focus(0);return true;
    }
    function pause(){
      if(!['loading','playing'].includes(status))return;
      if(status==='playing')remainingMs=Math.max(0,deadline-now());
      clearTimers();status='paused';reason=null;cancel();emit();
    }
    function resume(){if(['paused','error'].includes(status)&&!destroyed)focus(index,remainingMs);}
    return {start,pause,resume,stop,accept,getState,
      isActive:engaged,destroy(){stop('closed');destroyed=true;clearTimers();}};
  }
  const api={create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DoohTour=api;
})(typeof globalThis!=='undefined'?globalThis:this);
