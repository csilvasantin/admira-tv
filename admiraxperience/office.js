/* AdmiraXperience: two office arrivals and a real, directed photographic walk. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id),sites=AdmiraOffices,launch=StoreVisit.parse(location.search);
 let launchPending=launch.walk,recoveryTimer=null,recoveryCount=0;
 let selected=sites.get(new URLSearchParams(location.search).get('site')),walker=null,panorama=null,map=null,service=null,routeWalk=null,route=null,routeRequest=0,search=null,paused=false,interior=false,ready=false;
 const entries=new Map(),cache=new Map();let line=null,positionMarker=null,lastState=null,overview=null;
 function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
 function showSelected(){
  $('place').textContent=selected.name;
  document.querySelectorAll('.office').forEach(b=>b.classList.toggle('active',b.dataset.site===selected.id));
  const old=$('destination').value;$('destination').replaceChildren();sites.all.filter(s=>launchPending||s.id!==selected.id||!sites.arrived(lastState,selected)).forEach(s=>{const o=document.createElement('option');o.value=s.id;o.textContent=s.name;$('destination').append(o);});if(launchPending)$('destination').value='store';else if(sites.all.some(s=>s.id===old)&&[...$('destination').options].some(o=>o.value===old))$('destination').value=old;updateTravelLabel();
  const url=new URL(location.href);url.searchParams.set('site',selected.id);history.replaceState(null,'',url);document.title='AdmiraXperience · '+selected.name;document.querySelector('header>a:last-child').href='https://www.admira.app/?locationId='+selected.locationId;
 }
 function updateTravelLabel(){$('travel').textContent='Caminar a '+sites.get($('destination').value).name;}
 $('destination').addEventListener('change',updateTravelLabel);
 function closeInterior(){interior=false;$('interior').hidden=true;$('interior-media').replaceChildren();if(panorama)panorama.setVisible(true);updateArrival(lastState);}
 function cancel(){clearTimeout(recoveryTimer);recoveryTimer=null;launchPending=false;search?.abort();search=null;routeWalk?.cancel();route=null;paused=false;$('pause').disabled=true;$('pause').textContent='Pausar';$('travel').disabled=!ready;$('destination').disabled=!ready;}
 function updateArrival(state){const near=sites.arrived(state,selected);$('arrival').hidden=!near||!!search||!!routeWalk?.active&&!paused||interior;$('distance').textContent=state?.position?Math.round(sites.distance(state.position,selected.position))+' m de '+selected.name:'';}
 function onState(state){
  lastState=state;
  if(state.position&&['ready','unavailable'].includes(state.status)){const known=cache.get(state.pano);const links=new Map((known?.links||[]).map(l=>[l.pano,l]));state.links.forEach(l=>links.set(l.pano,l));cache.set(state.pano,{id:state.pano,position:state.position,date:state.date,links:[...links.values()]});}
  routeWalk?.observe(state);
  if(state.position&&positionMarker)positionMarker.setPosition(state.position);
  $('date').textContent=state.date?'Fotografía · '+state.date:'Fecha no disponible';
  updateArrival(state);
  startLaunchWalk(state);
  document.querySelectorAll('[data-walk]').forEach(b=>b.disabled=!['ready','unavailable'].includes(state.status)||interior);
  if(state.status==='error')status('No se ha podido cargar la fotografía. Abre de nuevo la llegada o reintenta.',true);
 }
 function startLaunchWalk(state){if(ready&&launchPending&&state?.pano===StoreVisit.origin.pano&&['ready','unavailable'].includes(state.status)){launchPending=false;$('destination').value='store';queueMicrotask(()=>{if(ready&&walker?.getState().pano===StoreVisit.origin.pano)travel();});}}
 async function getPano(request){
  let timer;const response=await Promise.race([service.getPanorama(request),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),12000);})]).finally(()=>clearTimeout(timer));
  const d=response.data;if(!d?.location?.pano||!d.location.latLng)throw Error('no-photo');
  const node={id:d.location.pano,position:{lat:d.location.latLng.lat(),lng:d.location.latLng.lng()},links:(d.links||[]).filter(l=>l.pano).map(l=>({pano:l.pano,heading:l.heading,description:l.description||''})),date:d.imageDate||''};cache.set(node.id,node);return node;
 }
 async function load(id){return cache.get(id)||getPano({pano:id});}
 async function openOffice(office){
  if(!ready)return;cancel();closeInterior();selected=office;showSelected();line?.setPath([]);$('progress').value=0;
  const entry=entries.get(office.id);walker.setSite({homePano:entry.id,homePov:{heading:sites.bearing(entry.position,office.position),pitch:0,zoom:1}});walker.command({action:'home'});map.panTo(office.position);status('Llegada exterior · puedes caminar o acceder al interior cuando estés cerca.');
 }
 async function travel(targetId,recovering=false){
  if(!ready||search)return;
  if(!recovering)recoveryCount=0;
  closeInterior();cancel();
  const current=walker.getState();if(!['ready','unavailable'].includes(current.status)){status('Espera a que termine de cargar la fotografía.');return;}
  const target=sites.get(typeof targetId==='string'?targetId:$('destination').value),controller=new AbortController();search=controller;
  $('travel').disabled=true;$('destination').disabled=true;$('pause').disabled=false;$('pause').textContent='Cancelar búsqueda';$('arrival').hidden=true;status('Buscando conexiones fotográficas hacia '+target.name+'…');
  try{
   const start=await load(current.pano),goal=entries.get(target.id);console.info('[AdmiraXperience] Inicio de paseo',JSON.stringify({pano:start.id,links:start.links.length,position:start.position,to:target.id}));
   const path=await OfficePaths.findPath({start,goal,load,distance:sites.distance,arrive:node=>StoreVisit.reached(node,target,goal,sites.distance),signal:controller.signal,onProgress:n=>status('Verificando el paseo a '+target.name+' · '+n+' cruces comprobados…')});
   if(controller.signal.aborted||search!==controller)return;
   if(walker.getState().pano!==current.pano)throw Error('moved');
   search=null;selected=target;showSelected();
   line.setPath(path.nodes.map(n=>n.position));
   if(path.panos.length<2){status('Ya estás en el punto de llegada.');$('travel').disabled=false;$('destination').disabled=false;updateArrival(walker.getState());return;}
   route={id:'offices-'+(++routeRequest),panos:path.panos};$('pause').textContent='Pausar';
   routeWalk.start(route.id,routeRequest,{speed:Number($('speed').value)});
  }catch(error){
   if(controller.signal.aborted)return;console.warn('[AdmiraXperience] Paseo detenido:',error.message);search=null;cancel();
   status(error.message==='moved'?'Te has desplazado durante la búsqueda. Vuelve a iniciar el paseo desde aquí.':'No se ha encontrado un recorrido fotográfico continuo desde este punto. Puedes caminar con las flechas o abrir la llegada de la otra oficina.',true);
  }
 }
 $('travel').addEventListener('click',travel);
 $('pause').addEventListener('click',()=>{
  if(search){cancel();status('Búsqueda cancelada.');return;}
  if(!route)return;
  if(paused){paused=false;$('pause').textContent='Pausar';routeWalk.start(route.id,++routeRequest,{speed:Number($('speed').value)});}
  else{paused=true;routeWalk.cancel();$('pause').textContent='Reanudar';status('Paseo en pausa.');updateArrival(walker.getState());}
 });
 $('street').addEventListener('pointerdown',()=>{if(search||route||recoveryTimer){cancel();status('Paseo en pausa · navegación manual.');}});
 $('street').addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))cancel();});
 $('speed').addEventListener('change',()=>routeWalk?.setSpeed(Number($('speed').value)));
 document.querySelectorAll('[data-walk]').forEach(button=>button.addEventListener('click',()=>{cancel();walker?.command({action:button.dataset.walk});status('Paseo libre · sigue las conexiones de la calle.');}));
 function enterInterior(direct=false){
  if(!direct&&!sites.arrived(walker?.getState(),selected))return;
  cancel();
  if(selected.id==='store'&&selected.interiorUrl){location.assign(selected.interiorUrl);return;}
  $('interior-media').replaceChildren();
  $('interior-pending').hidden=!!selected.interiorUrl;
  if(selected.interiorUrl){
   const heading=document.createElement('h3');heading.textContent=selected.interiorName;
   const instructions=document.createElement('p');
   instructions.textContent='Abre IEU y elige «'+selected.interiorName+'» en el selector de oficinas. Si aparece otra oficina, cámbiala antes de usar sus controles.';
   const link=document.createElement('a');link.className='interior-link';link.href=selected.interiorUrl;link.target='_blank';link.rel='noopener';link.textContent='Abrir IEU · '+selected.interiorName+' ↗';
   const note=document.createElement('p');note.className='note';note.textContent='Se abre en otra pestaña. Usa tu cuenta autorizada de IEU para recorrer las escenas y controlar los dispositivos disponibles. Al terminar, vuelve a esta pestaña para continuar el paseo. La oficina todavía se selecciona manualmente.';
   $('interior-media').append(heading,instructions,link,note);
  }
  interior=true;panorama?.setVisible(false);$('arrival').hidden=true;$('interior-title').textContent=selected.name;$('interior').hidden=false;$('exit-interior').focus();
 }
 $('enter').addEventListener('click',()=>enterInterior());
 $('exit-interior').addEventListener('click',closeInterior);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&interior)closeInterior();});
 window.addEventListener('pagehide',()=>{cancel();walker?.dispose();routeWalk?.dispose();panorama?.setVisible(false);});
 sites.all.forEach(office=>{const b=document.createElement('button');b.className='office';b.dataset.site=office.id;const title=document.createElement('strong');title.textContent=office.name;const small=document.createElement('small');small.textContent='Abrir llegada · pantallas interiores';b.append(title,small);b.disabled=true;b.addEventListener('click',()=>openOffice(office));$('offices').append(b);});showSelected();
 async function boot(){
  try{
   const [{Map}, {StreetViewPanorama,StreetViewService}, {Marker}, {Polyline}]=await Promise.all(['maps','streetView','marker','maps'].map(l=>google.maps.importLibrary(l)));
   service=new StreetViewService();
   map=new Map($('map'),{center:{lat:41.40224,lng:2.1543},zoom:16,disableDefaultUI:true,clickableIcons:false,gestureHandling:'cooperative'});
   const bounds=new google.maps.LatLngBounds();
   for(const office of sites.all){bounds.extend(office.position);const marker=new Marker({map,position:office.position,label:{text:String(sites.all.indexOf(office)+1),color:'#fff'},title:'AdmiraXperience · '+office.name});marker.addListener('click',()=>openOffice(office));}
   map.fitBounds(bounds,35);overview=CenitalPanel.create({host:$('map-panel'),content:$('map'),key:'offices',name:'AdmiraXperience',theme:'admira',onShow:()=>{google.maps.event.trigger(map,'resize');map.fitBounds(bounds,35);}});line=new Polyline({map,strokeColor:'#376c42',strokeOpacity:.85,strokeWeight:4});positionMarker=new Marker({map,icon:{path:google.maps.SymbolPath.CIRCLE,scale:5,fillColor:'#234f37',fillOpacity:1,strokeWeight:2,strokeColor:'#fff'}});
   for(const office of sites.all){const node=await getPano({location:office.position,radius:35,sources:[google.maps.StreetViewSource.GOOGLE,google.maps.StreetViewSource.OUTDOOR],preference:'nearest'});if(sites.distance(node.position,office.position)>35)throw Error('far-photo');entries.set(office.id,node);}
   const entry=launch.walk?await getPano({pano:StoreVisit.origin.pano}):entries.get(selected.id);
   const entryPov=launch.walk?StoreVisit.origin.pov:{heading:sites.bearing(entry.position,selected.position),pitch:0,zoom:1};
   panorama=new StreetViewPanorama($('street'),{pano:entry.id,pov:entryPov,zoom:entryPov.zoom,disableDefaultUI:true,linksControl:true,clickToGo:true,scrollwheel:false,showRoadLabels:true,motionTracking:false});
   walker=StreetWalk.create({panorama,service,initialPano:entry.id,homePano:entry.id,homePov:entryPov,onState});
   const officeOrientation=WalkOrientation.create({getView:()=>panorama,getSpeed:()=>routeWalk?.active?.speed||1});
   routeWalk=RouteWalk.create({getRoute:id=>route?.id===id?route:null,getWalker:()=>walker,setHeading:(heading,id)=>officeOrientation.turn(heading,id),onCancel:id=>officeOrientation.cancel(id),onState:s=>{
    $('progress').value=s.total?s.step/s.total:0;
    if(s.status==='walking'||s.status==='loading')status('Caminando a '+selected.name+' · '+s.step+' / '+s.total+' tramos · ×'+s.speed);
    if(s.status==='ready'){panorama.setPov({heading:sites.bearing(walker.getState().position,selected.position),pitch:0});console.info('[AdmiraXperience] Llegada verificada',JSON.stringify({to:selected.id,step:s.step,total:s.total,pano:s.pano}));routeWalk.cancel();route=null;$('pause').disabled=true;$('travel').disabled=false;$('destination').disabled=false;status('Has llegado a '+selected.name+'. Paseo detenido: pulsa Acceso interior para continuar.');$('enter').textContent='Acceso interior →';updateArrival(walker.getState());}
    if(s.status==='error'){
     console.warn('[AdmiraXperience] Conexión interrumpida',JSON.stringify(s));
     routeWalk.cancel();route=null;$('pause').disabled=true;$('travel').disabled=false;$('destination').disabled=false;
     const current=walker.getState(),target=selected.id;
     if(recoveryCount<3&&['ready','unavailable'].includes(current.status)){
      recoveryCount++;status('La fotografía ha cambiado. Recalculando el paseo desde aquí…');
      cache.clear();cache.set(current.pano,{id:current.pano,position:current.position,date:current.date,links:current.links});
      recoveryTimer=setTimeout(()=>{recoveryTimer=null;travel(target,true);},750);
     }else status('El paseo se ha detenido: una conexión ya no está disponible. Puedes reintentar desde aquí o seguir a mano.',true);
    }
   }});
   ready=true;$('travel').disabled=false;$('destination').disabled=false;document.querySelectorAll('.office').forEach(b=>b.disabled=false);status(launch.walk?'Jardinets · preparando el paseo a Santa Rosa 19…':'Llegada exterior · elige un destino e inicia el paseo.');startLaunchWalk(walker.getState());
  }catch(error){status('Street View no está disponible en este momento. Las oficinas siguen identificadas en el mapa; vuelve a cargar para reintentar.',true);}
 }
 window.gm_authFailure=()=>{ready=false;cancel();document.querySelectorAll('[data-walk],.office').forEach(b=>b.disabled=true);status('Abre esta Xperiencia en admira.tv para utilizar el mapa y Street View.',true);};
 if(launch.interior){enterInterior(true);$('exit-interior').onclick=()=>location.assign('?site=store');return;}
 window.initAdmiraOffices=boot;
 const script=document.createElement('script');script.async=true;script.src='https://maps.googleapis.com/maps/api/js?key=AIzaSyDOQTBlJYugpPBPuSMlRg74tu8Gvmq7mKA&loading=async&callback=initAdmiraOffices&v=weekly';script.onerror=()=>status('No se ha podido conectar con el mapa. Vuelve a cargar para reintentar.',true);document.head.append(script);
})();
