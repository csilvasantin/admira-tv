/* Human-scale HUD. Positions come from Street View; audiences remain demo context. */
(function(root) {
  'use strict';
  const sites=typeof module!=='undefined'&&module.exports?require('./outdoor-sites.js'):root.OutdoorSites;
  const rad = Math.PI / 180;
  function relativeTarget(position, heading, destination=sites.get('vila').position) {
    if (!position || !destination) return null;
    const north = (destination.lat-position.lat)*111320;
    const east = (destination.lng-position.lng)*111320*Math.cos(position.lat*rad);
    const distance = Math.hypot(north,east);
    const bearing = (Math.atan2(east,north)/rad+360)%360;
    const relative = (bearing-heading)*rad;
    const radius = Math.min(39,distance/80*39);
    return {distance,bearing,x:50+Math.sin(relative)*radius,y:50-Math.cos(relative)*radius};
  }
  function dateLabel(date) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(date)) return 'Fecha de imagen no disponible';
    const [year,month]=date.split('-').map(Number);
    return new Intl.DateTimeFormat('es',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(year,month-1,1)));
  }
  function create({element,send,onExit,onInspect,onSiteChange=()=>{}}) {
    let active=false, current=null, routesSignature='', currentSite=sites.get('vila'), routeTarget=null, audienceArgs=null, heldKey=null, heldPointer=null, heldButton=null;
    const el=id=>element.querySelector('#'+id);
    const command=action=>{ if(active)send({action}); };
    const release=()=>{const wasPointer=heldPointer!==null;heldKey=null;heldPointer=null;heldButton=null;if(active){send({action:'release'});if(wasPointer&&current)setState(current);}};
    element.querySelectorAll('[data-walk]').forEach(button=>{
      let pointerClick=false;
      button.addEventListener('click',event=>{
        if(pointerClick && event.detail!==0){pointerClick=false;return;}
        pointerClick=false;command(button.dataset.walk);
      });
      if(['forward','backward'].includes(button.dataset.walk)){
        button.addEventListener('pointerdown',event=>{
          if(event.button!==0||!active||button.disabled)return;
          event.preventDefault();pointerClick=true;heldPointer=event.pointerId;heldButton=button;button.setPointerCapture?.(event.pointerId);
          send({action:button.dataset.walk,hold:true});
        });
        const endPointer=event=>{if(event.pointerId===heldPointer)release();};
        button.addEventListener('pointerup',endPointer);button.addEventListener('pointercancel',endPointer);button.addEventListener('lostpointercapture',endPointer);
      }
    });
    el('human-site-select').replaceChildren(...sites.all.map(site=>{
      const option=document.createElement('option');option.value=site.id;option.textContent=site.shortLabel||site.area;return option;
    }));
    el('human-site-select').onchange=event=>onSiteChange(event.target.value);
    el('human-next-site').onclick=()=>onSiteChange(sites.next((routeTarget||currentSite).id).id);
    function setSite(site){
      if(!site)return;currentSite=site;
      el('human-location').textContent='HUMANO / '+(site.shortLabel||site.area).toLocaleUpperCase('es');
      el('human-site-select').value=site.id;
      el('human-target-label').textContent=site.targetLabel.toLocaleUpperCase('es');
      el('human-site-name').textContent=site.name;
      el('human-inventory-label').textContent=site.inventoryLabel;
      el('human-site-note').textContent=site.area+(site.audienceSiteId?' · soporte identificado':' · punto de visita');
      const front=element.querySelector('[data-walk="front"]');front?.classList.toggle('hidden',!site.front);
      const panels=element.querySelector('[data-walk="panels"]');if(panels)panels.textContent=site.front?'Paneles publicitarios':'Ver quiosco';
      if(audienceArgs)updateAudience(...audienceArgs);
      renderTarget();
    }

    function renderTarget(){
      el('human-site-select').value=(routeTarget||currentSite).id;
      el('human-target-label').textContent=routeTarget?'HACIA '+routeTarget.shortLabel.toLocaleUpperCase('es'):currentSite.targetLabel.toLocaleUpperCase('es');
      const target=relativeTarget(current?.position,current?.heading||0,(routeTarget||currentSite).position);
      el('human-distance').textContent=target?(target.distance<1000?Math.round(target.distance)+' m aprox.':(target.distance/1000).toFixed(1)+' km aprox.'):'Ubicando…';
      el('human-target').setAttribute('cx',target?target.x:50);
      el('human-target').setAttribute('cy',target?target.y:50);
      el('human-target').style.visibility=target?'visible':'hidden';
    }
    function setRouteTarget(siteId){routeTarget=sites.get(siteId);renderTarget();}

    el('human-exit').onclick=onExit;
    el('human-inspect').onclick=onInspect;
    el('human-inspect-close').onclick=()=>el('human-support-card').classList.add('hidden');
    el('human-paths-toggle').onclick=()=>el('human-paths').classList.toggle('hidden');
    function setState(state) {
      current=state;
      el('human-status').textContent=({loading:'Cargando el siguiente punto…',ready:'Explora el quiosco',error:'No se pudo cargar esta vista',unavailable:'Sin salida en esa dirección · gira o elige una ruta'})[state.status];
      if(['ready','unavailable'].includes(state.status) && !state.links.length) el('human-status').textContent='Vista sin conexiones · vuelve al quiosco';
      el('human-date').textContent='Street View · '+dateLabel(state.date);
      el('human-heading').textContent=Math.round(state.heading)%360+'°';
      el('human-compass-needle').style.transform=`rotate(${-state.heading}deg)`;
      el('human-steps').textContent=state.steps+(state.steps===1?' cambio de vista':' cambios de vista');
      el('human-link-count').textContent=state.links.length+' rutas';
      el('human-jesus').classList.toggle('hidden',!state.canEnterJesus);
      el('human-crossing-alternative').classList.toggle('hidden',!state.canOpenJesus2023);
      el('human-route-stop').classList.toggle('hidden',!state.routeActive);
      el('human-inspect').classList.toggle('nearby',state.supportVisible);
      el('human-inspect').textContent=state.supportVisible?'E · Inspeccionar soporte':'Ficha del quiosco';
      element.querySelectorAll('[data-walk]').forEach(button=> {
        button.disabled=(state.status==='loading' && button!==heldButton && !['home','panels','front','release'].includes(button.dataset.walk)) || (['forward','backward'].includes(button.dataset.walk) && !state.links.length && button!==heldButton);
      });
      renderTarget();
      const nextRoutes=JSON.stringify([state.links,state.status==='loading']);
      if(nextRoutes!==routesSignature) {
      routesSignature=nextRoutes;
      el('human-routes').replaceChildren(...state.links.map(link=>{
        const button=document.createElement('button');
        button.textContent=Math.round(link.heading)+'° · '+(link.description||'Siguiente punto');
        button.disabled=state.status==='loading';
        button.onclick=()=>send({action:'link',pano:link.pano});
        return button;
      }));
      }
      el('human-no-links').classList.toggle('hidden',!!state.links.length);
      element.dataset.status=state.status;
    }
    const keyActions={w:'forward',s:'backward',a:'left',d:'right',ArrowUp:'forward',ArrowDown:'backward',ArrowLeft:'left',ArrowRight:'right'};
    addEventListener('keydown',event=>{
      if(!active || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target=event.target;
      if(target && (target.isContentEditable || ['INPUT','TEXTAREA','SELECT'].includes(target.tagName))) return;
      if(target?.tagName==='BUTTON' && !element.contains?.(target))return;
      const key=event.key.length===1?event.key.toLowerCase():event.key;
      if(key==='e' && current?.supportVisible){ event.preventDefault();onInspect();return; }
      const action=keyActions[key];
      if(!action || (event.repeat && ['forward','backward'].includes(action)))return;
      event.preventDefault();
      if(['forward','backward'].includes(action)){heldKey=key;send({action,hold:true});}
      else command(action);
    });
    addEventListener('keyup',event=>{
      const key=event.key.length===1?event.key.toLowerCase():event.key;
      if(key===heldKey)release();
    });
    addEventListener('blur',release);
    for(const event of ['pointerup','pointercancel'])addEventListener(event,e=>{if(e.pointerId===heldPointer)release();});
    document.addEventListener?.('visibilitychange',()=>{if(document.hidden)release();});
    function updateAudience(context,labels,recommendation){
      audienceArgs=[context,labels,recommendation];
      const hasAudience=currentSite.audienceSiteId===context.siteId;
      el('human-audience').textContent=hasAudience?context.effectiveCount:'—';
      el('human-audience-label').textContent=hasAudience?'personas simuladas en Vila de Gràcia':'Audiencia pendiente de conectar';
      el('human-audience-base').textContent=hasAudience?'Base '+Math.round(context.baseCount)+(context.manual?' · ajuste manual':' · curva de demostración'):'';
      const h=Math.floor(context.hour),m=Math.round((context.hour-h)*60);
      el('human-time').classList.toggle('hidden',!hasAudience);
      el('human-time').textContent=hasAudience?'SIM · '+String((h+(m===60?1:0))%24).padStart(2,'0')+':'+String(m%60).padStart(2,'0'):'';
      el('human-audience-mix').textContent=hasAudience?Object.keys(context.mix).map(p=>labels[p]+' '+Math.round(context.mix[p])+'%').join(' · '):'';
      el('human-recommendation').textContent=hasAudience?recommendation:'';
      el('human-recommendation-box').classList.toggle('hidden',!hasAudience);
      el('human-audience-scope').textContent=hasAudience?'La audiencia pertenece a la simulación de Vila de Gràcia. No mide impactos de este recorrido.':'El modelo 3D corresponde a Vila de Gràcia.';
    }
    return {
      enter(siteId='vila'){if(active)release();active=true;routesSignature='';setSite(sites.get(siteId)||sites.get('vila'));element.classList.remove('hidden');element.tabIndex=-1;element.focus({preventScroll:true});setState({status:'loading',pano:'',heading:currentSite.entry.pov.heading,date:'',position:null,links:[],steps:0,supportVisible:false});},
      leave(){release();active=false;element.classList.add('hidden');el('human-support-card').classList.add('hidden');el('human-paths').classList.add('hidden');},
      setState,setSite,setRouteTarget,
      inspect(){el('human-support-card').classList.remove('hidden');},
      updateAudience
    };
  }
  const api={relativeTarget,dateLabel,create};
  if(typeof module!=='undefined' && module.exports)module.exports=api;else root.HumanView=api;
})(typeof globalThis!=='undefined'?globalThis:this);
