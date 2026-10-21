/* «Destino» a pie: one catalogued route from the current photograph to the chosen site.
 * Without a route from here the caller keeps the direct jump (Carlos, 21-oct-2026). */
(function(root){
  'use strict';
  const speeds=Object.freeze([1,2,4,6,8]);
  function create(options){
    const findRoute=options.findRoute,sendRoute=options.sendRoute,onChange=options.onChange||(()=>{});
    // Its own request range: a late answer to a destination walk can never match a tour request.
    let sequence=options.firstRequestId??1e9,route=null,requestId=0,status='idle',step=0,speed=1,reason=null;
    function getState(){
      return {status,routeId:route?.id||null,siteId:route?.toSiteId||null,fromSiteId:route?.fromSiteId||null,
        requestId,step,total:route?route.panos.length-1:0,speed,reason};
    }
    const emit=()=>onChange(getState());
    const isActive=()=>status==='travelling';
    function finish(next,why){status=next;reason=why||null;emit();}
    function cancel(why='cancel'){
      if(!isActive())return false;
      try{sendRoute({action:'cancel',routeId:route.id,requestId});}catch(_){/* The walk is cancelled here regardless. */}
      finish('cancelled',why);return true;
    }
    function start(siteId,pano,settings={}){
      const next=typeof pano==='string'&&pano?findRoute(pano,siteId):null;
      if(!next||next.panos.at(-1)===pano)return false;
      cancel('restart');
      route=next;requestId=++sequence;step=route.panos.indexOf(pano);reason=null;status='travelling';
      speed=speeds.includes(settings.speed)?settings.speed:1;emit();
      try{sendRoute({action:'start',routeId:route.id,requestId,speed});}catch(_){finish('error','unavailable');}
      return true;
    }
    function accept(event){
      if(!event||!route||event.requestId!==requestId||event.routeId!==route.id)return false;
      // Ours even after it ended: a late «cancelled» from the walker must not reach the tour.
      if(!isActive())return true;
      if(Number.isInteger(event.step)&&event.step>=0&&event.step<=route.panos.length-1)step=event.step;
      if(event.status==='ready'){
        // Like the tour, release the walker on arrival: it keeps door and sign overlays off while it holds a route.
        try{sendRoute({action:'cancel',routeId:route.id,requestId});}catch(_){/* Arrival stands regardless. */}
        finish('arrived');
      }
      // The walker reports a foreign photograph change (Google's own arrows) as a «manual» error:
      // the visitor took control, so there is nothing to recover with a direct jump.
      else if(event.status==='error'&&event.reason==='manual')finish('cancelled','manual');
      else if(event.status==='error')finish('error',event.reason||'unavailable');
      else if(event.status==='cancelled')finish('cancelled',event.reason||'cancel');
      else emit();
      return true;
    }
    function setSpeed(next){
      if(!speeds.includes(next))return false;
      speed=next;if(!isActive())return true;
      try{sendRoute({action:'speed',routeId:route.id,requestId,speed});}catch(_){finish('error','unavailable');return false;}
      emit();return true;
    }
    return {start,accept,cancel,setSpeed,getState,isActive};
  }
  const api={create,speeds};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DestinationWalk=api;
})(typeof globalThis!=='undefined'?globalThis:this);
