/* AdmiraXperience: two office arrivals and a real, directed photographic walk. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id),sites=AdmiraOffices;
 let selected=sites.get(new URLSearchParams(location.search).get('site')),walker=null,panorama=null,map=null,service=null,routeWalk=null,route=null,routeRequest=0,search=null,paused=false,interior=false,ready=false;
 const entries=new Map(),cache=new Map();let line=null,positionMarker=null,lastState=null;
 function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
 function showSelected(){
  $('place').textContent=selected.name;
  document.querySelectorAll('.office').forEach(b=>b.classList.toggle('active',b.dataset.site===selected.id));
  const other=sites.all.find(s=>s.id!==selected.id);$('travel').textContent='Caminar a '+other.name;
  const url=new URL(location.href);url.searchParams.set('site',selected.id);history.replaceState(null,'',url);document.title='AdmiraXperience · '+selected.name;document.querySelector('header>a:last-child').href='https://www.admira.app/?locationId='+selected.locationId;
 }
 function closeInterior(){interior=false;$('interior').hidden=true;$('interior-media').replaceChildren();if(panorama)panorama.setVisible(true);updateArrival(lastState);}
 function cancel(){search?.abort();search=null;routeWalk?.cancel();route=null;paused=false;$('pause').disabled=true;$('pause').textContent='Pausar';$('travel').disabled=!ready;}
 function updateArrival(state){const near=sites.arrived(state,selected);$('arrival').hidden=!near||!!search||!!routeWalk?.active&&!paused||interior;$('distance').textContent=state?.position?Math.round(sites.distance(state.position,selected.position))+' m de '+selected.name:'';}
 function onState(state){
  lastState=state;routeWalk?.observe(state);
  if(state.position&&positionMarker)positionMarker.setPosition(state.position);
  $('date').textContent=state.date?'Fotografía · '+state.date:'Fecha no disponible';
  updateArrival(state);
  document.querySelectorAll('[data-walk]').forEach(b=>b.disabled=!['ready','unavailable'].includes(state.status)||interior);
  if(state.status==='error')status('No se ha podido cargar la fotografía. Abre de nuevo la llegada o reintenta.',true);
 }
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
 async function travel(){
  if(!ready||search)return;
  closeInterior();cancel();
  const current=walker.getState();if(!['ready','unavailable'].includes(current.status)){status('Espera a que termine de cargar la fotografía.');return;}
  const target=sites.all.find(s=>s.id!==selected.id),controller=new AbortController();search=controller;
  $('travel').disabled=true;$('pause').disabled=false;$('pause').textContent='Cancelar búsqueda';$('arrival').hidden=true;status('Buscando conexiones fotográficas hacia '+target.name+'…');
  try{
   const start=await load(current.pano),goal=entries.get(target.id);
   const path=await OfficePaths.findPath({start,goal,load,distance:sites.distance,arrive:node=>sites.distance(node.position,target.position)<=18,signal:controller.signal,onProgress:n=>status('Verificando el paseo a '+target.name+' · '+n+' cruces comprobados…')});
   if(controller.signal.aborted||search!==controller)return;
   if(walker.getState().pano!==current.pano)throw Error('moved');
   search=null;selected=target;showSelected();
   line.setPath(path.nodes.map(n=>n.position));
   if(path.panos.length<2){status('Ya estás en el punto de llegada.');$('travel').disabled=false;updateArrival(walker.getState());return;}
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
 $('speed').addEventListener('change',()=>routeWalk?.setSpeed(Number($('speed').value)));
 document.querySelectorAll('[data-walk]').forEach(button=>button.addEventListener('click',()=>{cancel();walker?.command({action:button.dataset.walk});status('Paseo libre · sigue las conexiones de la calle.');}));
 $('enter').addEventListener('click',()=>{
  if(!sites.arrived(walker?.getState(),selected))return;
  cancel();interior=true;panorama.setVisible(false);$('arrival').hidden=true;$('interior-title').textContent=selected.name;$('interior').hidden=false;$('exit-interior').focus();
 });
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
   for(const office of sites.all){bounds.extend(office.position);const marker=new Marker({map,position:office.position,label:{text:office.id==='santa-rosa'?'1':'2',color:'#fff'},title:'AdmiraXperience · '+office.name});marker.addListener('click',()=>openOffice(office));}
   map.fitBounds(bounds,35);line=new Polyline({map,strokeColor:'#376c42',strokeOpacity:.85,strokeWeight:4});positionMarker=new Marker({map,icon:{path:google.maps.SymbolPath.CIRCLE,scale:5,fillColor:'#234f37',fillOpacity:1,strokeWeight:2,strokeColor:'#fff'}});
   for(const office of sites.all){const node=await getPano({location:office.position,radius:35,source:'outdoor',preference:'nearest'});if(sites.distance(node.position,office.position)>35)throw Error('far-photo');entries.set(office.id,node);}
   const entry=entries.get(selected.id);
   panorama=new StreetViewPanorama($('street'),{pano:entry.id,pov:{heading:sites.bearing(entry.position,selected.position),pitch:0},zoom:1,disableDefaultUI:true,linksControl:true,clickToGo:true,scrollwheel:false,showRoadLabels:true,motionTracking:false});
   walker=StreetWalk.create({panorama,service,initialPano:entry.id,homePano:entry.id,homePov:{heading:sites.bearing(entry.position,selected.position),pitch:0},onState});
   routeWalk=RouteWalk.create({getRoute:id=>route?.id===id?route:null,getWalker:()=>walker,setHeading:heading=>{panorama.setPov({heading,pitch:0});return new Promise(resolve=>setTimeout(resolve,350));},onState:s=>{
    $('progress').value=s.total?s.step/s.total:0;
    if(s.status==='walking'||s.status==='loading')status('Caminando a '+selected.name+' · '+s.step+' / '+s.total+' tramos · ×'+s.speed);
    if(s.status==='ready'){routeWalk.cancel();route=null;$('pause').disabled=true;$('travel').disabled=false;status('Has llegado a '+selected.name+'. Las pantallas están dentro.');updateArrival(walker.getState());}
    if(s.status==='error'){routeWalk.cancel();route=null;$('pause').disabled=true;$('travel').disabled=false;status('El paseo se ha detenido: una conexión ya no está disponible. Puedes reintentar desde aquí o seguir a mano.',true);}
   }});
   ready=true;$('travel').disabled=false;document.querySelectorAll('.office').forEach(b=>b.disabled=false);status('Llegada exterior · inicia el paseo a la otra oficina.');
  }catch(error){status('Street View no está disponible en este momento. Las oficinas siguen identificadas en el mapa; vuelve a cargar para reintentar.',true);}
 }
 window.gm_authFailure=()=>{ready=false;cancel();document.querySelectorAll('[data-walk],.office').forEach(b=>b.disabled=true);status('Abre esta Xperiencia en admira.tv para utilizar el mapa y Street View.',true);};
 window.initAdmiraOffices=boot;
 const script=document.createElement('script');script.async=true;script.src='https://maps.googleapis.com/maps/api/js?key=AIzaSyDOQTBlJYugpPBPuSMlRg74tu8Gvmq7mKA&loading=async&callback=initAdmiraOffices&v=weekly';script.onerror=()=>status('No se ha podido conectar con el mapa. Vuelve a cargar para reintentar.',true);document.head.append(script);
})();
