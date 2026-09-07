/* One calibrated image-editing experiment. It does not alter Google panoramas. */
(function(root){
 const anchor={pano:'L6xcO37SQfBmCxsT9lPdjQ',heading:325.8989423,pitch:9.8861264};
 function create({getPanorama,container,onOpen=()=>{},isAvailable=()=>true}){
  const button=document.createElement('button');button.id='mapped-no-parking';button.title='Prueba: alerta y escena sin peatones';button.setAttribute('aria-label','Señal de prohibido: alerta y prueba sin peatones');button.hidden=true;container.append(button);
  const preview=document.createElement('section');preview.id='mapped-scene-preview';preview.hidden=true;preview.setAttribute('role','dialog');preview.setAttribute('aria-label','Prueba editada de Jardinets sin peatones');
  const img=new Image();img.alt='Edición fija de Jardinets sin peatones; no es un panorama navegable';img.src='../assets/mapping/jardinets-empty.png';
  const caption=document.createElement('p');caption.textContent='PRUEBA EDITADA · Vista fija sin peatones · No modifica el paseo ni sus fotografías originales';
  const back=document.createElement('button');back.textContent='Volver a la calle original · Esc';back.onclick=close;preview.append(img,caption,back);document.body.append(preview);
  let audio=null,open=false;
  function notifyPreview(active){if(parent!==window)parent.postMessage({channel:'admira-hidden-ui-v1',type:'preview',active},location.origin);}
  function close(){if(open)notifyPreview(false);open=false;preview.hidden=true;document.documentElement.classList.remove('mapping-preview');if(!button.hidden)button.focus({preventScroll:true});}
  async function alertSound(){try{audio??=new (window.AudioContext||window.webkitAudioContext)();await audio.resume();const gain=audio.createGain();gain.connect(audio.destination);const now=audio.currentTime;gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(.12,now+.02);gain.gain.setValueAtTime(.12,now+.25);gain.gain.linearRampToValueAtTime(0,now+.4);const oscillator=audio.createOscillator();oscillator.type='sine';oscillator.frequency.setValueAtTime(740,now);oscillator.frequency.setValueAtTime(520,now+.15);oscillator.connect(gain);oscillator.start(now);oscillator.stop(now+.41);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};console.info('[Mapping] Alerta emitida');}catch{caption.textContent='PRUEBA EDITADA · Vista fija sin peatones · Audio no disponible en este navegador';}}
  button.addEventListener('pointerdown',e=>e.stopPropagation());
  button.onclick=async(e)=>{
   e.stopPropagation();
   if(getPanorama()?.getPano()!==anchor.pano||!isAvailable())return;
   alertSound();
   try{await img.decode();}catch{button.title='No se pudo cargar la prueba; vuelve a intentarlo';return;}
   if(getPanorama()?.getPano()!==anchor.pano)return;
   onOpen();open=true;notifyPreview(true);preview.hidden=false;document.documentElement.classList.add('mapping-preview');back.focus();console.info('[Mapping] Escena editada abierta');
  };
  addEventListener('keydown',e=>{if(open&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();}},true);
  addEventListener('pagehide',()=>audio?.close());
  function layout(){
   const sv=getPanorama(),rect=container.getBoundingClientRect();
   if(!button.isConnected)container.append(button);
   const available=sv?.getVisible()&&sv.getPano()===anchor.pano&&isAvailable();
   if(!available){button.hidden=true;if(open)close();return;}
   const p=root.DoohSurfaces.project(anchor.heading,anchor.pitch,sv.getPov(),sv.getZoom(),rect.width,rect.height);
   const edge=root.DoohSurfaces.project(anchor.heading+5,anchor.pitch,sv.getPov(),sv.getZoom(),rect.width,rect.height);
   button.hidden=!p||p[0]<0||p[1]<0||p[0]>rect.width||p[1]>rect.height;
   if(button.hidden)return;
   const size=Math.max(24,Math.min(300,edge?Math.abs(edge[0]-p[0])*2:60));
   Object.assign(button.style,{left:p[0]+'px',top:p[1]+'px',width:size+'px',height:size+'px'});
  }
  new ResizeObserver(layout).observe(container);
  return {layout,close};
 }
 const api={anchor,create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.InteractiveScene=api;
})(typeof globalThis!=='undefined'?globalThis:this);
