/* Registered per-person clean patches, not a replacement view or camera command. */
(function(root){
 const anchor={pano:'L6xcO37SQfBmCxsT9lPdjQ',heading:325.8989423,pitch:9.8861264};
 function create({getPanorama,container,foreground=container,warp,isAvailable=()=>true,onSelect=()=>{},onClose=()=>{}}){
  const geometry=root.PedestrianLayers,ref=geometry.reference;
  const selectionEnabled=()=>!document.documentElement.classList.contains('targets-hidden');
  const ray=(x,y)=>root.DoohSurfaces.unproject(x,y,ref.pov,ref.zoom,ref.width,ref.height);
  const patches=geometry.regions.map(([x,y,r,b],index)=>{
   const canvas=document.createElement('canvas');canvas.className='mapped-person-patch';canvas.width=r-x;canvas.height=b-y;canvas.hidden=true;canvas.dataset.person=String(index+1);container.append(canvas);
   return {canvas,x,y,r,b,rays:[[x,y],[r,y],[r,b],[x,b]].map(p=>ray(...p))};
  });
  const people=patches.map((patch,index)=>{const hit=document.createElement('button');hit.className='mapped-person-hit';hit.type='button';hit.style.width=patch.canvas.width+'px';hit.style.height=patch.canvas.height+'px';hit.hidden=true;hit.innerHTML='<span>'+(index+1)+'</span>';hit.setAttribute('aria-label','Persona '+(index+1)+': reproducir canción '+(index+1));hit.dataset.person=String(index+1);hit.title='Persona '+(index+1)+' · #musica + #'+(index+1);hit.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();});hit.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();if(index===0&&suppressClick){suppressClick=false;return;}if(index>=count||!isAvailable()||!selectionEnabled())return;active=true;onSelect(index+1,{restart:true});});container.append(hit);return hit;});
  const sprite=document.createElement('div');sprite.className='mapped-person-sprite';sprite.hidden=true;people[0].prepend(sprite);
  people[0].setAttribute('aria-label','Persona 1: arrastra delante del quiosco para reproducir Top Gun');
  people[0].title='Arrastra delante de la pantalla · Top Gun · Escape cancela';
  const dropZone=document.createElement('div');dropZone.id='mapped-drop-zone';dropZone.textContent='Suelta aquí · Top Gun';dropZone.hidden=true;container.append(dropZone);
  let movedRays=null,personDrag=null,suppressClick=false,atKiosk=false;
  function targetBounds(){
   const sv=getPanorama(),rect=container.getBoundingClientRect(),surface=root.DoohSurfaces.get('jardinets-main');
   const pts=Object.values(surface.corners).map(r=>root.DoohSurfaces.project(...r,sv.getPov(),sv.getZoom(),rect.width,rect.height));
   if(pts.some(p=>!p))return null;
   const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys),margin=Math.max(35,(right-left)*.65);
   return {left:left-margin,right:right+margin,top,bottom:bottom+Math.max(60,(bottom-top)*.7)};
  }
  function inTarget(){
   if(!movedRays)return false;
   const sv=getPanorama(),rect=container.getBoundingClientRect(),pts=movedRays.map(r=>root.DoohSurfaces.project(...r,sv.getPov(),sv.getZoom(),rect.width,rect.height));
   if(pts.some(p=>!p))return false;
   const foot=[(pts[2][0]+pts[3][0])/2,(pts[2][1]+pts[3][1])/2],box=targetBounds();
   return !!box&&foot[0]>=box.left&&foot[0]<=box.right&&foot[1]>=box.top&&foot[1]<=box.bottom;
  }
  function endPersonDrag(cancel=false){
   const drag=personDrag;if(!drag)return;personDrag=null;people[0].classList.remove('is-dragging');dropZone.hidden=true;
   if(people[0].hasPointerCapture(drag.id))people[0].releasePointerCapture(drag.id);
   if(cancel){movedRays=drag.previous;layout();return;}
   if(!drag.started)return;
   suppressClick=true;const over=inTarget();
   if(over){atKiosk=true;active=true;onSelect(1,{restart:true,atKiosk:true});}
   else if(atKiosk){atKiosk=false;onSelect(0,{restart:true});}
   layout();
  }
  people[0].addEventListener('pointerdown',e=>{
   if(e.button!==0||!loaded||!isAvailable()||!selectionEnabled()||count<1)return;
   e.preventDefault();e.stopPropagation();suppressClick=false;
   const sv=getPanorama(),rect=container.getBoundingClientRect();
   const pts=(movedRays||patches[0].rays).map(r=>root.DoohSurfaces.project(...r,sv.getPov(),sv.getZoom(),rect.width,rect.height));if(pts.some(p=>!p))return;
   personDrag={id:e.pointerId,x:e.clientX,y:e.clientY,pts,previous:movedRays,started:false};people[0].setPointerCapture(e.pointerId);
  });
  people[0].addEventListener('pointermove',e=>{
   if(!personDrag||e.pointerId!==personDrag.id)return;e.preventDefault();e.stopPropagation();
   const dx=e.clientX-personDrag.x,dy=e.clientY-personDrag.y;if(!personDrag.started&&Math.hypot(dx,dy)<5)return;
   personDrag.started=true;people[0].classList.add('is-dragging');
   const sv=getPanorama(),rect=container.getBoundingClientRect();movedRays=personDrag.pts.map(p=>root.DoohSurfaces.unproject(p[0]+dx,p[1]+dy,sv.getPov(),sv.getZoom(),rect.width,rect.height));layout();
  });
  people[0].addEventListener('pointerup',e=>{if(e.pointerId===personDrag?.id){e.preventDefault();e.stopPropagation();endPersonDrag();}});
  people[0].addEventListener('pointercancel',()=>endPersonDrag(true));
  people[0].addEventListener('lostpointercapture',()=>endPersonDrag(true));
  addEventListener('keydown',e=>{if(e.key==='Escape'&&personDrag){e.preventDefault();e.stopImmediatePropagation();suppressClick=true;endPersonDrag(true);}},true);
  const poleRays=geometry.pole.map(p=>ray(...p));
  const button=document.createElement('button');button.id='mapped-no-parking';button.setAttribute('aria-label','Señal de prohibido: ocultar o restaurar peatones');button.title='Ocultar peatones · volver a pulsar para restaurar';button.hidden=true;container.append(button);
  const slider=document.createElement('div');slider.id='mapped-pole-slider';slider.tabIndex=0;slider.setAttribute('role','slider');slider.setAttribute('aria-label','Peatones en el poste');slider.setAttribute('aria-orientation','vertical');slider.setAttribute('aria-valuemin','1');slider.setAttribute('aria-valuemax','10');
  for(let n=10;n>=1;n--){const mark=document.createElement('span');mark.textContent=n;mark.dataset.count=n;slider.append(mark);}const thumb=document.createElement('b');thumb.className='mapped-fader-thumb';thumb.setAttribute('aria-hidden','true');slider.append(thumb);container.append(slider);
  const note=document.createElement('output');note.id='mapped-people-status';note.setAttribute('aria-live','polite');note.hidden=true;container.append(note);
  const clean=new Image();clean.src='../assets/mapping/jardinets-clean-registered.png';
  let loaded=false,count=10,audio=null,pointer=null,projectedPole=null,active=false,musicText='';
  clean.onload=()=>{
   for(const patch of patches){const {canvas,x,y,r,b}=patch;const ctx=canvas.getContext('2d');ctx.drawImage(clean,x/ref.width*clean.width,y/ref.height*clean.height,(r-x)/ref.width*clean.width,(b-y)/ref.height*clean.height,0,0,canvas.width,canvas.height);
    // Feather only the patch seam; interiors remain fully opaque.
    ctx.globalCompositeOperation='destination-in';const mask=ctx.createLinearGradient(0,0,canvas.width,0);mask.addColorStop(0,'transparent');mask.addColorStop(.04,'black');mask.addColorStop(.96,'black');mask.addColorStop(1,'transparent');ctx.fillStyle=mask;ctx.fillRect(0,0,canvas.width,canvas.height);
    if(patch===patches[4])ctx.clearRect(0,32,9,canvas.height-32);
   }
   loaded=true;layout();
  };
  clean.onerror=()=>{button.title='No se pudo cargar la edición. La calle original permanece visible.';};
  function camera(){const sv=getPanorama();return {pano:sv?.getPano(),pov:sv?.getPov(),zoom:sv?.getZoom()};}
  function setCount(value,{fraction=null}={}){
   if(!loaded||getPanorama()?.getPano()!==anchor.pano)return;
   const previous=count;count=geometry.clamp(value);active=true;slider.style.setProperty('--fader-position',String(fraction===null?(count-.5)/10:fraction));button.setAttribute('aria-pressed',String(count===0));
   slider.setAttribute('aria-valuenow',String(Math.max(1,count)));slider.setAttribute('aria-valuetext',count===0?'Peatones ocultos con la señal':count+' de 10 niveles');
   renderNote();note.hidden=false;
   [...slider.querySelectorAll('span')].forEach(mark=>mark.classList.toggle('selected',Number(mark.dataset.count)===count));
   if(previous!==count){console.info('[Mapping] Peatones',JSON.stringify({count,camera:camera()}));}onSelect(count,{restart:false});layout();
  }
  async function alertSound(){try{audio??=new (window.AudioContext||window.webkitAudioContext)();await audio.resume();const gain=audio.createGain(),osc=audio.createOscillator(),now=audio.currentTime;gain.connect(audio.destination);gain.gain.setValueAtTime(.1,now);gain.gain.exponentialRampToValueAtTime(.001,now+.3);osc.frequency.setValueAtTime(740,now);osc.frequency.setValueAtTime(520,now+.15);osc.connect(gain);osc.start(now);osc.stop(now+.31);osc.onended=()=>{osc.disconnect();gain.disconnect();};}catch{}}
  const stop=e=>{e.preventDefault();e.stopPropagation();};
  button.addEventListener('pointerdown',stop);button.onclick=e=>{stop(e);if(!loaded||!isAvailable())return;alertSound();setCount(count===0?10:0);};
  function renderNote(){note.textContent=count+'/10'+(musicText?' · '+musicText:' · Pulsa una persona o desliza el poste');}
  function setMusicState(state){
   musicText=state.status==='stopped'?'Programación habitual':state.artist&&!['error','loading'].includes(state.status)?root.PedestrianMusic.preference(state.number,state.artist)+' · ♪ '+state.title:(state.status==='error'?'⚠ ':state.status==='blocked'?'Activar audio · ':'Cargando · ')+state.number+' · '+state.title;
   renderNote();layout();people.forEach((hit,i)=>hit.classList.toggle('is-playing',state.status!=='stopped'&&i+1===state.number));
  }
  function drag(e){if(!projectedPole)return;const rect=container.getBoundingClientRect(),top=[(projectedPole[0][0]+projectedPole[1][0])/2,(projectedPole[0][1]+projectedPole[1][1])/2],bottom=[(projectedPole[2][0]+projectedPole[3][0])/2,(projectedPole[2][1]+projectedPole[3][1])/2];const point=[e.clientX-rect.left,e.clientY-rect.top];setCount(geometry.countFromPoint(point,top,bottom),{fraction:geometry.fractionFromPoint(point,top,bottom)});}
  slider.addEventListener('pointerdown',e=>{stop(e);if(!loaded||!isAvailable())return;slider.focus({preventScroll:true});slider.classList.add('dragging');pointer=e.pointerId;slider.setPointerCapture(pointer);drag(e);});
  slider.addEventListener('pointermove',e=>{if(e.pointerId===pointer){stop(e);drag(e);}});
  const release=e=>{if(e.pointerId===pointer){stop(e);slider.classList.remove('dragging');pointer=null;if(slider.hasPointerCapture(e.pointerId))slider.releasePointerCapture(e.pointerId);}};
  slider.addEventListener('pointerup',release);slider.addEventListener('pointercancel',release);slider.addEventListener('click',stop);
  slider.addEventListener('keydown',e=>{const steps={ArrowUp:1,ArrowRight:1,ArrowDown:-1,ArrowLeft:-1};if(e.key in steps){stop(e);e.stopImmediatePropagation();setCount(Math.max(1,count+steps[e.key]));}else if(e.key==='Home'||e.key==='End'){stop(e);e.stopImmediatePropagation();setCount(e.key==='Home'?1:10);}},true);
  function close(){endPersonDrag(true);movedRays=null;atKiosk=false;sprite.hidden=true;if(active){active=false;onClose();}count=10;people.forEach(hit=>hit.hidden=true);patches.forEach(p=>p.canvas.hidden=true);button.hidden=true;slider.hidden=true;note.hidden=true;pointer=null;}
  function layout(){
   const sv=getPanorama(),rect=container.getBoundingClientRect();
   for(const el of [button,slider,note,dropZone,...patches.map(p=>p.canvas)])if(!el.isConnected)container.append(el);
   for(const hit of people)if(hit.parentElement!==foreground)foreground.append(hit);
   const here=sv?.getVisible()&&sv.getPano()===anchor.pano;
   if(!here){close();return;}
   const selecting=selectionEnabled();if((!selecting||!isAvailable()||count<1)&&personDrag)endPersonDrag(true);note.hidden=!selecting||!active;
   if(!selecting&&pointer!==null){if(slider.hasPointerCapture(pointer))slider.releasePointerCapture(pointer);pointer=null;slider.classList.remove('dragging');}
   const project=r=>root.DoohSurfaces.project(...r,sv.getPov(),sv.getZoom(),rect.width,rect.height);
   for(const [i,patch] of patches.entries()){
    const pts=(i===0&&movedRays?movedRays:patch.rays).map(project);people[i].hidden=!selecting||!isAvailable()||i>=count||pts.some(p=>!p);if(!people[i].hidden)people[i].style.transform=warp(patch.canvas.width,patch.canvas.height,pts);const original=patch.rays.map(project);patch.canvas.hidden=!loaded||(i<count&&!(i===0&&movedRays))||original.some(p=>!p);
    if(!patch.canvas.hidden)patch.canvas.style.transform=warp(patch.canvas.width,patch.canvas.height,original);
   }
   sprite.hidden=!movedRays;
   const box=personDrag?.started&&targetBounds();dropZone.hidden=!box;
   if(box){Object.assign(dropZone.style,{left:box.left+'px',top:box.top+'px',width:(box.right-box.left)+'px',height:(box.bottom-box.top)+'px'});dropZone.classList.toggle('is-over',inTarget());}
   const p=project([anchor.heading,anchor.pitch]),edge=project([anchor.heading+4,anchor.pitch]);
   button.hidden=!selecting||!isAvailable()||!p||p[0]<0||p[1]<0||p[0]>rect.width||p[1]>rect.height;
   if(!button.hidden){const size=Math.max(24,Math.min(300,edge?Math.abs(edge[0]-p[0])*2:60));Object.assign(button.style,{left:p[0]+'px',top:p[1]+'px',width:size+'px',height:size+'px'});}
   projectedPole=poleRays.map(project);slider.hidden=!selecting||!isAvailable()||projectedPole.some(p=>!p);
   if(!slider.hidden)slider.style.transform=warp(26,420,projectedPole);
   slider.setAttribute('aria-valuenow',String(Math.max(1,count)));button.disabled=!loaded;slider.setAttribute('aria-disabled',String(!loaded));
  }
  addEventListener('admira-targets-change',()=>{if(!selectionEnabled()&&[slider,button,...people].includes(document.activeElement))document.activeElement.blur();layout();});
  addEventListener('pagehide',()=>audio?.close());new ResizeObserver(layout).observe(container);
  return {layout,close,setMusicState};
 }
 const api={anchor,create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.InteractiveScene=api;
})(typeof globalThis!=='undefined'?globalThis:this);
