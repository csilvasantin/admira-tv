/* Human-scale HUD. Positions come from Street View; audiences remain demo context. */
(function(root) {
  'use strict';
  const KIOSK = {lat:41.4002641,lng:2.1573332};
  const rad = Math.PI / 180;
  function relativeTarget(position, heading) {
    if (!position) return null;
    const north = (KIOSK.lat-position.lat)*111320;
    const east = (KIOSK.lng-position.lng)*111320*Math.cos(position.lat*rad);
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
  function create({element,send,onExit,onInspect}) {
    let active=false, current=null, routesSignature='';
    const el=id=>element.querySelector('#'+id);
    const command=action=>{ if(active)send({action}); };
    element.querySelectorAll('[data-walk]').forEach(button=>button.addEventListener('click',()=>command(button.dataset.walk)));
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
      el('human-steps').textContent=state.steps+' cambios de vista';
      el('human-link-count').textContent=state.links.length+' rutas';
      el('human-inspect').classList.toggle('nearby',state.supportVisible);
      el('human-inspect').textContent=state.supportVisible?'E · Inspeccionar soporte':'Ficha del quiosco';
      element.querySelectorAll('[data-walk]').forEach(button=> {
        button.disabled=(state.status==='loading' && !['home','panels','front'].includes(button.dataset.walk)) || (['forward','backward'].includes(button.dataset.walk) && !state.links.length);
      });
      const target=relativeTarget(state.position,state.heading);
      el('human-distance').textContent=target?(target.distance<1000?Math.round(target.distance)+' m aprox.':(target.distance/1000).toFixed(1)+' km aprox.'):'Ubicando…';
      el('human-target').setAttribute('cx',target?target.x:50);
      el('human-target').setAttribute('cy',target?target.y:50);
      el('human-target').style.visibility=target?'visible':'hidden';
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
      if(target && (target.isContentEditable || ['INPUT','TEXTAREA','SELECT','BUTTON'].includes(target.tagName))) return;
      const key=event.key.length===1?event.key.toLowerCase():event.key;
      if(key==='e' && current?.supportVisible){ event.preventDefault();onInspect();return; }
      const action=keyActions[key];
      if(!action || (event.repeat && ['forward','backward'].includes(action)))return;
      event.preventDefault();command(action);
    });
    return {
      enter(){active=true;routesSignature='';element.classList.remove('hidden');element.tabIndex=-1;element.focus({preventScroll:true});setState({status:'loading',pano:'',heading:49.5,date:'',position:null,links:[],steps:0,supportVisible:false});},
      leave(){active=false;element.classList.add('hidden');el('human-support-card').classList.add('hidden');el('human-paths').classList.add('hidden');},
      setState,
      inspect(){el('human-support-card').classList.remove('hidden');},
      updateAudience(context,labels,recommendation){
        el('human-audience').textContent=context.effectiveCount;
        el('human-audience-base').textContent='Base '+Math.round(context.baseCount)+(context.manual?' · ajuste manual':' · curva de demostración');
        const h=Math.floor(context.hour),m=Math.round((context.hour-h)*60);
        el('human-time').textContent='SIM · '+String((h+(m===60?1:0))%24).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
        el('human-audience-mix').textContent=Object.keys(context.mix).map(p=>labels[p]+' '+Math.round(context.mix[p])+'%').join(' · ');
        el('human-recommendation').textContent=recommendation;
      }
    };
  }
  const api={relativeTarget,dateLabel,create};
  if(typeof module!=='undefined' && module.exports)module.exports=api;else root.HumanView=api;
})(typeof globalThis!=='undefined'?globalThis:this);
