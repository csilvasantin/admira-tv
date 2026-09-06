/* Real Street View links only. No generated coordinates or synthetic panorama hops. */
(function(root){
  'use strict';
  const heading = n => ((Number(n) % 360) + 360) % 360;
  const angle = (a,b) => Math.abs(((heading(a)-heading(b)+540)%360)-180);
  function linksOf(links){
    return (Array.isArray(links)?links:[]).filter(l=>l && typeof l.pano==='string' && l.pano && l.pano.length<=250 && Number.isFinite(l.heading))
      .map(l=>({pano:l.pano,heading:heading(l.heading),description:typeof l.description==='string'?l.description.slice(0,160):''})).slice(0,32);
  }
  function chooseLink(links, bearing, backward=false){
    const target=heading(bearing+(backward?180:0));
    const sorted=linksOf(links).sort((a,b)=>angle(a.heading,target)-angle(b.heading,target));
    return sorted[0] && angle(sorted[0].heading,target)<=60 ? sorted[0] : null;
  }
  function create(options){
    const {panorama,service,onState=()=>{},onFeedback=()=>{},onPanoChange=()=>{}}=options;
    const seeds={home:options.panelPano,panels:options.panelPano,front:options.frontPano};
    let disposed=false,revision=0,pending=null,metadata=null,timer=null,lastReady='',signature='',pendingKind='initial',statusReady=false,paintPending=0;
    const afterPaint=options.afterPaint || (fn=>{const frame=root.requestAnimationFrame || (cb=>setTimeout(cb,0));frame(()=>frame(fn));});
    const state={status:'loading',pano:'',heading:0,position:null,date:'',links:[],steps:0,supportVisible:false};
    const listeners=[];
    const clone=()=>({...state,position:state.position?{...state.position}:null,links:state.links.map(l=>({...l}))});
    function emit(){
      const pov=panorama.getPov?.();state.heading=heading(pov?.heading||0);
      const next=JSON.stringify(state);if(next!==signature){signature=next;onState(clone());}
    }
    function fail(status,message){
      if(disposed)return;++revision;metadata=null;clearTimeout(timer);timer=null;pending=null;state.status=status;
      state.supportVisible=false;emit();onFeedback(message);
    }
    function finish(){
      if(disposed||!metadata||!statusReady||metadata.pano!==panorama.getPano()||panorama.getStatus()!=='OK'||paintPending===revision)return;
      const token=revision;paintPending=token;
      afterPaint(()=>{
        if(disposed||token!==revision||!statusReady||!metadata||metadata.pano!==panorama.getPano())return;
        const pano=metadata.pano;
        state.pano=pano;state.date=metadata.date;state.links=metadata.links;state.position=metadata.position;
        state.status=state.links.length?'ready':'unavailable';state.supportVisible=pano===options.panelPano;
        if(lastReady && lastReady!==pano && pendingKind==='walk')state.steps++;
        lastReady=pano;pending=null;clearTimeout(timer);timer=null;
        emit();onFeedback(state.links.length?'Camina por las conexiones de Street View.':'Este panorama no tiene conexiones para caminar.');
      });
    }
    function load(pano,kind='walk'){
      if(disposed||!pano)return;
      const token=++revision;pending=pano;metadata=null;pendingKind=kind;paintPending=0;
      statusReady=(kind==='initial'||(kind==='return'&&lastReady===pano))&&panorama.getPano()===pano&&panorama.getStatus()==='OK';
      Object.assign(state,{status:'loading',pano,date:'',links:[],position:null,supportVisible:false});
      clearTimeout(timer);onPanoChange(pano);emit();
      timer=setTimeout(()=>{if(token===revision)fail('error','No se pudo cargar este punto. Puedes volver al quiosco.');},options.timeoutMs||12000);
      const request=service.getPanorama({pano},(data,status)=>{
        if(disposed||token!==revision)return;
        if(status!=='OK'||data?.location?.pano!==pano){fail('error','Este panorama ya no está disponible.');return;}
        const p=data.location.latLng,lat=typeof p?.lat==='function'?p.lat():p?.lat,lng=typeof p?.lng==='function'?p.lng():p?.lng;
        metadata={pano,date:/^\d{4}-\d{2}$/.test(data.imageDate||'')?data.imageDate:'',links:linksOf(data.links),
          position:Number.isFinite(lat)&&Number.isFinite(lng)?{lat,lng}:null};
        finish();
      });
      request?.catch?.(()=>{}); // Callback above owns the error state.
    }
    function panoChanged(){
      const pano=panorama.getPano();
      if(!pano||disposed)return;
      if(pano!==pending&&pano!==metadata?.pano)load(pano);
      else finish();
    }
    function statusChanged(){
      if(disposed)return;
      if(panorama.getStatus()==='OK'){panoChanged();statusReady=panorama.getPano()===pending||panorama.getPano()===metadata?.pano;finish();}
      else if(pending && panorama.getStatus()==='ZERO_RESULTS')fail('error','No hay imagen disponible para este punto.');
    }
    function linksChanged(){
      if(disposed||pending||!metadata||metadata.pano!==panorama.getPano())return;
      // links_changed may lag behind pano_changed. Accept only links corroborated
      // by the current panorama's service response, never the previous node's links.
      const allowed=new Map(metadata.links.map(l=>[l.pano,l]));
      const observed=linksOf(panorama.getLinks?.()).filter(l=>allowed.has(l.pano)).map(l=>allowed.get(l.pano));
      state.links=observed.length?observed:metadata.links;emit();
    }
    for(const [event,fn] of [['pano_changed',panoChanged],['status_changed',statusChanged],['links_changed',linksChanged],['pov_changed',emit]]){
      const listener=panorama.addListener(event,fn);listeners.push(listener);
    }
    function navigate(pano,kind='walk'){
      if(disposed||pending)return false;
      load(pano,kind);panorama.setPano(pano);finish();return true;
    }
    function command(input){
      if(disposed||!input)return false;
      const action=input.action;
      if(action in seeds){
        // An explicit return replaces a pending hop and invalidates its late callbacks.
        ++revision;clearTimeout(timer);pending=null;metadata=null;
        panorama.setPov(action==='front'?(options.frontPov||{heading:238.13,pitch:2}):(options.panelPov||{heading:49.5,pitch:2}));
        panorama.setZoom(action==='front'?0:0.9);return navigate(seeds[action],'return');
      }
      if(pending){onFeedback('Espera a que termine el paso actual.');return false;}
      if(action==='forward'||action==='backward'||action==='link'){
        const link=action==='link'?state.links.find(l=>l.pano===input.pano):chooseLink(state.links,state.heading,action==='backward');
        if(!link){state.status='unavailable';emit();onFeedback('Sin conexión en esa dirección. Gira o elige una salida.');return false;}
        return navigate(link.pano);
      }
      const pov=panorama.getPov()||{heading:0,pitch:0};
      if(action==='left'||action==='right')panorama.setPov({heading:heading(pov.heading+(action==='right'?8:-8)),pitch:pov.pitch});
      else if(action==='look-up'||action==='look-down')panorama.setPov({heading:pov.heading,pitch:Math.max(-60,Math.min(60,pov.pitch+(action==='look-up'?6:-6)))});
      else if(action==='zoom-in'||action==='zoom-out')panorama.setZoom(Math.max(0,Math.min(3,(panorama.getZoom()||0)+(action==='zoom-in'?.2:-.2))));
      else return false;
      if(state.links.length)state.status='ready';emit();return true;
    }
    function dispose(){
      if(disposed)return;disposed=true;++revision;clearTimeout(timer);pending=null;
      for(const listener of listeners)listener?.remove?.();
    }
    load(options.initialPano||panorama.getPano(),'initial');
    return {command,dispose,getState:clone};
  }
  const api={heading,angle,linksOf,chooseLink,create};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.StreetWalk=api;
})(typeof globalThis!=='undefined'?globalThis:this);
