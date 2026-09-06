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
  const JESUS_2022='CwrbI-sF75wSN69YO9QYEg';
  const JESUS_PATH=['neHfCciaSwwcDYjCqOBBKQ','ChcRiAHJGowOisoZmsbTng','ri33zzkLzbZkkbAEBoWwiQ'];
  function create(options){
    const {panorama,service,onState=()=>{},onFeedback=()=>{},onPanoChange=()=>{}}=options;
    const seeds={home:options.homePano||options.panelPano,panels:options.homePano||options.panelPano,front:options.frontPano};
    let disposed=false,revision=0,pending=null,metadata=null,timer=null,lastReady='',signature='',pendingKind='initial',statusReady=false,paintPending=0,previousLinksSignature='',linksRevision=0;
    let heldAction=null,queuedAction=null,continuationTimer=null,guidedPath=[];
    const afterPaint=options.afterPaint || (fn=>{const frame=root.requestAnimationFrame || (cb=>setTimeout(cb,0));frame(()=>frame(fn));});
    const state={status:'loading',pano:'',heading:0,position:null,date:'',links:[],steps:0,supportVisible:false,routeActive:false};
    const listeners=[];
    const clone=()=>({...state,canOpenJesus2023:!pending&&['ready','unavailable'].includes(state.status)&&state.pano===JESUS_2022,canEnterJesus:!pending&&state.pano===JESUS_PATH[0]&&state.links.some(l=>l.pano===JESUS_PATH[1]),position:state.position?{...state.position}:null,links:state.links.map(l=>({...l}))});
    function emit(){
      const pov=panorama.getPov?.();state.heading=heading(pov?.heading||0);
      const next=JSON.stringify(clone());if(next!==signature){signature=next;onState(clone());}
    }
    function release(){guidedPath=[];heldAction=null;queuedAction=null;clearTimeout(continuationTimer);continuationTimer=null;if(state.routeActive){state.routeActive=false;emit();}}
    function continueWalk(){
      clearTimeout(continuationTimer);
      if(disposed){release();return;}
      if(!heldAction&&!queuedAction&&!guidedPath.length)return;
      const token=revision;
      continuationTimer=setTimeout(()=>{
        continuationTimer=null;if(disposed||token!==revision||pending)return;
        if(guidedPath.length){guidedStep();return;}
        const action=heldAction||queuedAction;queuedAction=null;
        if(action)command({action,hold:!!heldAction});
      },options.continuationDelayMs??280);
    }
    function fail(status,message){
      if(disposed)return;release();++revision;metadata=null;clearTimeout(timer);timer=null;pending=null;state.status=status;
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
        lastReady=pano;pending=null;if(!guidedPath.length)state.routeActive=false;clearTimeout(timer);timer=null;
        emit();linksChanged();continueWalk();onFeedback(state.links.length?'Camina por las conexiones de Street View.':'Este panorama no tiene conexiones para caminar.');
      });
    }
    function load(pano,kind='walk'){
      if(disposed||!pano)return;
      previousLinksSignature=(state.pano||panorama.getPano())!==pano?JSON.stringify(linksOf(panorama.getLinks?.())):'';
      ++linksRevision;clearTimeout(continuationTimer);continuationTimer=null;
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
      if(pano!==pending&&pano!==metadata?.pano){release();load(pano);}
      else finish();
    }
    function statusChanged(){
      if(disposed)return;
      if(panorama.getStatus()==='OK'){panoChanged();statusReady=panorama.getPano()===pending||panorama.getPano()===metadata?.pano;finish();}
      else if(pending && panorama.getStatus()==='ZERO_RESULTS')fail('error','No hay imagen disponible para este punto.');
    }
    function linksChanged(){
      if(disposed||pending||!metadata||!statusReady||metadata.pano!==panorama.getPano())return;
      const location=panorama.getLocation?.();if(!location||location.pano!==metadata.pano)return;
      const token=revision,observation=++linksRevision,observed=linksOf(panorama.getLinks?.()),signatureNow=JSON.stringify(observed);
      if(!observed.length||signatureNow===previousLinksSignature)return;
      afterPaint(()=>{
        if(disposed||pending||token!==revision||observation!==linksRevision||!metadata||metadata.pano!==panorama.getPano())return;
        const currentLocation=panorama.getLocation?.();if(!currentLocation||currentLocation.pano!==metadata.pano)return;
        if(JSON.stringify(linksOf(panorama.getLinks?.()))!==signatureNow)return;
        // Keep all service links and their current geometry. A stable SDK update
        // may add real exits that the separate metadata response did not contain.
        const merged=new Map(metadata.links.map(l=>[l.pano,l]));
        for(const link of observed)if(link.pano!==metadata.pano&&!merged.has(link.pano))merged.set(link.pano,link);
        state.links=[...merged.values()].slice(0,32);
        if(state.status==='unavailable'&&state.links.length)state.status='ready';emit();
      });
    }
    for(const [event,fn] of [['pano_changed',panoChanged],['status_changed',statusChanged],['links_changed',linksChanged],['pov_changed',emit]]){
      const listener=panorama.addListener(event,fn);listeners.push(listener);
    }
    function navigate(pano,kind='walk'){
      if(disposed||pending)return false;
      load(pano,kind);panorama.setPano(pano);finish();return true;
    }
    function guidedStep(){
      if(disposed||pending||!guidedPath.length)return false;
      const link=state.links.find(l=>l.pano===guidedPath[0]);
      if(!link){release();onFeedback('La conexión del desvío ya no está disponible. Elige una salida actual.');return false;}
      guidedPath.shift();
      panorama.setPov({heading:link.heading,pitch:panorama.getPov()?.pitch||0});
      return navigate(link.pano);
    }
    function command(input){
      if(disposed||!input)return false;
      const action=input.action;
      if(state.routeActive&&!['jesus','release'].includes(action))release();
      if(action==='release'){release();return true;}
      if(action==='jesus-2023'){
        release();if(pending||!['ready','unavailable'].includes(state.status)||state.pano!==JESUS_2022)return false;
        // Explicit dated image change at the same crossing, never a walking link.
        panorama.setPov({heading:234,pitch:0});panorama.setZoom(.9);
        return navigate(JESUS_PATH[0],'return');
      }
      if(action==='jesus'){
        release();if(pending||state.pano!==JESUS_PATH[0])return false;
        guidedPath=JESUS_PATH.slice(1);state.routeActive=true;return guidedStep();
      }
      if(action in seeds){
        release();if(!seeds[action]){onFeedback('Este quiosco no tiene una vista alternativa verificada.');return false;}
        // An explicit return replaces a pending hop and invalidates its late callbacks.
        ++revision;clearTimeout(timer);pending=null;metadata=null;
        panorama.setPov(action==='front'?(options.frontPov||{heading:238.13,pitch:2}):(options.homePov||options.panelPov||{heading:49.5,pitch:2}));
        panorama.setZoom(action==='front'?(options.frontPov?.zoom??0):(options.homePov?.zoom??options.panelPov?.zoom??0.9));return navigate(seeds[action],'return');
      }
      if(action==='forward'||action==='backward'){
        guidedPath=[];
        if(input.hold)heldAction=action;else release();
        if(pending){queuedAction=action;return true;}
      }
      if(action==='link')release();
      if(pending&&action==='link'){onFeedback('Espera a que termine el paso actual.');return false;}
      if(action==='forward'||action==='backward'||action==='link'){
        const link=action==='link'?state.links.find(l=>l.pano===input.pano):chooseLink(state.links,state.heading,action==='backward');
        if(!link){release();state.status='unavailable';emit();onFeedback('Sin conexión en esa dirección. Gira o elige una salida.');return false;}
        return navigate(link.pano);
      }
      const pov=panorama.getPov()||{heading:0,pitch:0};
      if(action==='left'||action==='right')panorama.setPov({heading:heading(pov.heading+(action==='right'?8:-8)),pitch:pov.pitch});
      else if(action==='look-up'||action==='look-down')panorama.setPov({heading:pov.heading,pitch:Math.max(-60,Math.min(60,pov.pitch+(action==='look-up'?6:-6)))});
      else if(action==='zoom-in'||action==='zoom-out')panorama.setZoom(Math.max(0,Math.min(3,(panorama.getZoom()||0)+(action==='zoom-in'?.2:-.2))));
      else return false;
      if(!pending&&state.links.length)state.status='ready';emit();return true;
    }
    function dispose(){
      if(disposed)return;release();disposed=true;++revision;clearTimeout(timer);pending=null;
      for(const listener of listeners)listener?.remove?.();
    }
    load(options.initialPano||panorama.getPano(),'initial');
    return {command,dispose,getState:clone};
  }
  const api={heading,angle,linksOf,chooseLink,create};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.StreetWalk=api;
})(typeof globalThis!=='undefined'?globalThis:this);
