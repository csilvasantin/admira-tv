/* Independent photographic characters, panorama-anchored positions and keyboard gait. */
(function(root){
 const anchor={pano:'L6xcO37SQfBmCxsT9lPdjQ',heading:325.8989423,pitch:9.8861264};
 // Install ahead of the panorama navigation listeners. Character arrows never reach the camera.
 let keyboard=null;
 if(root.addEventListener){
  root.addEventListener('keydown',e=>keyboard?.down(e),true);
  root.addEventListener('keyup',e=>keyboard?.up(e),true);
 }
 function create({getPanorama,container,foreground=container,warp,isAvailable=()=>true,onSelect=()=>{},onClose=()=>{}}){
  const geometry=root.PedestrianLayers,ref=geometry.reference,motion=root.PedestrianMotion;
  const selectionEnabled=()=>!document.documentElement.classList.contains('targets-hidden');
  const ray=(x,y)=>root.DoohSurfaces.unproject(x,y,ref.pov,ref.zoom,ref.width,ref.height);
  const patches=geometry.regions.map(([x,y,r,b],index)=>{
   const canvas=document.createElement('canvas');canvas.className='mapped-person-patch';canvas.width=r-x;canvas.height=b-y;canvas.hidden=true;canvas.dataset.person=String(index+1);container.append(canvas);
   return {canvas,x,y,r,b,rays:[[x,y],[r,y],[r,b],[x,b]].map(p=>ray(...p))};
  });
  const moved=Array(10).fill(null),occupants=motion.occupancy(10),keys=new Set();
  let selected=null,personDrag=null,suppressClick=null,playbackOwner=null,walkDistance=0,walkFrame=0,lastFrame=0,sourceLoaded=false;
  const sprites=patches.map((patch,i)=>{
   const sprite=document.createElement('div');sprite.className='mapped-character';sprite.dataset.person=String(i+1);sprite.hidden=true;
   Object.assign(sprite.style,{width:patch.canvas.width+'px',height:patch.canvas.height+'px'});
   const body=document.createElement('div');body.className='mapped-character-body';sprite.append(body);
   if(i===0){body.classList.add('person-one');const rig=document.createElement('div');rig.className='mapped-walk-rig';for(const part of ['torso','left-leg','right-leg']){const layer=document.createElement('div');layer.className='mapped-walk-part '+part;rig.append(layer);}sprite.append(rig);}
   else{
    const w=patch.r-patch.x,h=patch.b-patch.y;
    Object.assign(body.style,{backgroundImage:'url(../assets/mapping/jardinets-people-reference.jpg)',backgroundSize:(ref.width/w*100)+'% '+(ref.height/h*100)+'%',backgroundPosition:(patch.x/(ref.width-w)*100)+'% '+(patch.y/(ref.height-h)*100)+'%',clipPath:'polygon('+geometry.silhouettes[i]+')'});
   }
   foreground.append(sprite);return sprite;
  });
  const source=new Image();source.onload=()=>{sourceLoaded=true;layout();};source.src='../assets/mapping/jardinets-people-reference.jpg';
  const people=patches.map((patch,index)=>{
   const hit=document.createElement('button');hit.className='mapped-person-hit';hit.type='button';hit.dataset.person=String(index+1);
   hit.style.width=patch.canvas.width+'px';hit.style.height=patch.canvas.height+'px';hit.hidden=true;hit.innerHTML='<span>'+(index+1)+'</span>';
   hit.setAttribute('aria-label','Persona '+(index+1)+': seleccionar y arrastrar'+(index===0?' · flechas para caminar · Top Gun':''));hit.setAttribute('aria-pressed','false');
   hit.title=index===0?'Selecciona y usa las flechas · arrastra al quiosco · Top Gun':'Arrastra al quiosco · música de la persona '+(index+1);
   hit.addEventListener('pointerdown',e=>beginDrag(e,index));
   hit.addEventListener('pointermove',moveDrag);
   hit.addEventListener('pointerup',e=>{if(e.pointerId===personDrag?.id){stop(e);endPersonDrag();}});
   hit.addEventListener('pointercancel',()=>endPersonDrag(true));hit.addEventListener('lostpointercapture',()=>endPersonDrag(true));
   hit.addEventListener('click',e=>{stop(e);if(suppressClick===index){suppressClick=null;return;}if(!canMove(index))return;selectPerson(index);active=true;playbackOwner=inTarget(index)?index:null;onSelect(index+1,{restart:true,atKiosk:inTarget(index)});});
   foreground.append(hit);return hit;
  });
  const dropZone=document.createElement('div');dropZone.id='mapped-drop-zone';dropZone.hidden=true;foreground.append(dropZone);
  const canMove=i=>loaded&&sourceLoaded&&i<count&&isAvailable()&&selectionEnabled()&&getPanorama()?.getVisible()&&getPanorama()?.getPano()===anchor.pano;
  function project(points){const sv=getPanorama(),rect=container.getBoundingClientRect();return points.map(r=>root.DoohSurfaces.project(...r,sv.getPov(),sv.getZoom(),rect.width,rect.height));}
  function targetBounds(){
   const surface=root.DoohSurfaces.get('jardinets-main'),pts=project(Object.values(surface.corners));if(pts.some(p=>!p))return null;
   const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys),margin=Math.max(35,(right-left)*.65);
   return {left:left-margin,right:right+margin,top,bottom:bottom+Math.max(60,(bottom-top)*.7)};
  }
  function inTarget(index){
   if(!moved[index])return false;const pts=project(moved[index]);if(pts.some(p=>!p))return false;
   const foot=[(pts[2][0]+pts[3][0])/2,(pts[2][1]+pts[3][1])/2],box=targetBounds();return !!box&&foot[0]>=box.left&&foot[0]<=box.right&&foot[1]>=box.top&&foot[1]<=box.bottom;
  }
  function placeMusic(index,force=false){
   const inside=inTarget(index),wasOwner=playbackOwner===index,result=occupants.update(index,inside,force);
   if(inside&&(force||result.entered)){active=true;playbackOwner=index;onSelect(index+1,{restart:true,atKiosk:true});}
   else if(!inside&&wasOwner){playbackOwner=result.owner;onSelect(result.owner===null?0:result.owner+1,{restart:true,atKiosk:true});}
  }
  function stopWalking(){keys.clear();if(walkFrame)cancelAnimationFrame(walkFrame);walkFrame=0;lastFrame=0;sprites[0].classList.remove('is-walking');sprites[0].dataset.stepFrame='idle';layout();}
  function selectPerson(index){if(selected!==index)stopWalking();if(index===null&&selected!==null&&document.activeElement===people[selected])people[selected].blur();selected=index;people.forEach((hit,i)=>{hit.classList.toggle('is-selected',i===index);hit.setAttribute('aria-pressed',String(i===index));});renderNote();layout();}
  function translate(index,pts,dx,dy){
   const sv=getPanorama(),rect=container.getBoundingClientRect();if(pts.some(p=>!p))return [0,0];
   const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);
   dx=Math.max(4-Math.min(...xs),Math.min(rect.width-4-Math.max(...xs),dx));dy=Math.max(22-Math.min(...ys),Math.min(rect.height-26-Math.max(...ys),dy));
   moved[index]=pts.map(p=>root.DoohSurfaces.unproject(p[0]+dx,p[1]+dy,sv.getPov(),sv.getZoom(),rect.width,rect.height));return [dx,dy];
  }
  function walk(dx,dy){
   const delta=translate(0,project(moved[0]||patches[0].rays),dx,dy);walkDistance+=Math.hypot(...delta);
   const gait=motion.pose(walkDistance),sprite=sprites[0];sprite.classList.add('is-walking');sprite.dataset.stepFrame=String(gait.frame);sprite.dataset.steps=String(gait.steps);
   sprite.style.setProperty('--left-leg',gait.left+'deg');sprite.style.setProperty('--right-leg',gait.right+'deg');sprite.style.setProperty('--body-bob',gait.bob+'px');sprite.style.setProperty('--body-tilt',gait.tilt+'deg');
   if(dx||dy)sprite.dataset.direction=Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>0?'down':'up';
   placeMusic(0);renderNote();layout();
  }
  function animateWalking(time){
   walkFrame=0;if(selected!==0||!keys.size||!canMove(0)||personDrag){stopWalking();return;}
   const delta=motion.displacement(keys,lastFrame?(time-lastFrame)/1000:1/60,120);lastFrame=time;walk(...delta);walkFrame=requestAnimationFrame(animateWalking);
  }
  const typing=e=>e.target?.isContentEditable||e.target?.closest?.('input,textarea,select,[role="textbox"],[role="slider"]');
  keyboard={down(e){
   if(e.key==='Escape'&&(personDrag||selected!==null)){stop(e);e.stopImmediatePropagation();if(personDrag){suppressClick=personDrag.index;endPersonDrag(true);}else selectPerson(null);return;}
   if(!(e.key in motion.arrows)||selected!==0||!canMove(0)||typing(e)||e.ctrlKey||e.altKey||e.metaKey||e.isComposing)return;
   stop(e);e.stopImmediatePropagation();if(personDrag)return;const fresh=!keys.has(e.key);keys.add(e.key);if(fresh)walk(...motion.displacement(keys,1/60,120));if(!walkFrame)walkFrame=requestAnimationFrame(animateWalking);
  },up(e){if(!keys.has(e.key))return;stop(e);e.stopImmediatePropagation();keys.delete(e.key);if(!keys.size)stopWalking();}};
  function beginDrag(e,index){
   stop(e);if(e.button!==0||!canMove(index))return;endPersonDrag(true);stopWalking();suppressClick=null;selectPerson(index);people[index].focus({preventScroll:true});
   const pts=project(moved[index]||patches[index].rays);if(pts.some(p=>!p))return;
   personDrag={index,id:e.pointerId,x:e.clientX,y:e.clientY,pts,previous:moved[index],started:false};people[index].setPointerCapture(e.pointerId);
  }
  function moveDrag(e){
   if(!personDrag||e.pointerId!==personDrag.id)return;stop(e);const dx=e.clientX-personDrag.x,dy=e.clientY-personDrag.y;
   if(!personDrag.started&&Math.hypot(dx,dy)<5)return;personDrag.started=true;people[personDrag.index].classList.add('is-dragging');translate(personDrag.index,personDrag.pts,dx,dy);layout();
  }
  function endPersonDrag(cancel=false){
   const drag=personDrag;if(!drag)return;personDrag=null;const hit=people[drag.index];hit.classList.remove('is-dragging');dropZone.hidden=true;
   if(hit.hasPointerCapture(drag.id))hit.releasePointerCapture(drag.id);
   if(cancel){moved[drag.index]=drag.previous;suppressClick=drag.index;layout();return;}
   if(!drag.started)return;suppressClick=drag.index;placeMusic(drag.index,true);layout();
  }
  root.addEventListener('blur',stopWalking);document.addEventListener('visibilitychange',()=>{if(document.hidden)stopWalking();});
  root.addEventListener('pointerdown',e=>{if(selected!==null&&!e.target?.closest?.('.mapped-person-hit'))selectPerson(null);},true);
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
   const previous=count;count=geometry.clamp(value);if(selected!==null&&selected>=count)selectPerson(null);for(let i=count;i<10;i++)occupants.update(i,false);playbackOwner=null;active=true;slider.style.setProperty('--fader-position',String(fraction===null?(count-.5)/10:fraction));button.setAttribute('aria-pressed',String(count===0));
   slider.setAttribute('aria-valuenow',String(Math.max(1,count)));slider.setAttribute('aria-valuetext',count===0?'Peatones ocultos con la señal':count+' de 10 niveles');
   renderNote();note.hidden=false;
   [...slider.querySelectorAll('span')].forEach(mark=>mark.classList.toggle('selected',Number(mark.dataset.count)===count));
   if(previous!==count){console.info('[Mapping] Peatones',JSON.stringify({count,camera:camera()}));}onSelect(count,{restart:false});layout();
  }
  async function alertSound(){try{audio??=new (window.AudioContext||window.webkitAudioContext)();await audio.resume();const gain=audio.createGain(),osc=audio.createOscillator(),now=audio.currentTime;gain.connect(audio.destination);gain.gain.setValueAtTime(.1,now);gain.gain.exponentialRampToValueAtTime(.001,now+.3);osc.frequency.setValueAtTime(740,now);osc.frequency.setValueAtTime(520,now+.15);osc.connect(gain);osc.start(now);osc.stop(now+.31);osc.onended=()=>{osc.disconnect();gain.disconnect();};}catch{}}
  const stop=e=>{e.preventDefault();e.stopPropagation();};
  button.addEventListener('pointerdown',stop);button.onclick=e=>{stop(e);if(!loaded||!isAvailable())return;alertSound();setCount(count===0?10:0);};
  function renderNote(){note.textContent=(selected===0?'Persona 1 · ← ↑ ↓ → caminar · Esc salir · '+root.PedestrianMotion.pose(walkDistance).steps+' pasos':selected!==null?'Persona '+(selected+1)+' · arrastra frente al quiosco':count+'/10')+(musicText?' · '+musicText:'');}
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
  let closing=false;
  function close(){
   if(closing)return;closing=true;endPersonDrag(true);stopWalking();selected=null;walkDistance=0;moved.fill(null);occupants.clear();playbackOwner=null;
   if(active){active=false;onClose();}count=10;people.forEach(hit=>{hit.hidden=true;hit.classList.remove('is-selected');hit.setAttribute('aria-pressed','false');});sprites.forEach(s=>s.hidden=true);patches.forEach(p=>p.canvas.hidden=true);button.hidden=true;slider.hidden=true;note.hidden=true;dropZone.hidden=true;pointer=null;closing=false;
  }
  function layout(){
   if(closing)return;const sv=getPanorama(),rect=container.getBoundingClientRect();
   for(const el of [button,slider,note,...patches.map(p=>p.canvas)])if(!el.isConnected)container.append(el);
   for(const el of [dropZone,...sprites,...people])if(el.parentElement!==foreground)foreground.append(el);
   if(!sv?.getVisible()||sv.getPano()!==anchor.pano){close();return;}
   const selecting=selectionEnabled();if(personDrag&&!canMove(personDrag.index))endPersonDrag(true);
   note.hidden=!selecting||(!active&&selected===null);
   if(!selecting&&pointer!==null){if(slider.hasPointerCapture(pointer))slider.releasePointerCapture(pointer);pointer=null;slider.classList.remove('dragging');}
   const projectRay=r=>root.DoohSurfaces.project(...r,sv.getPov(),sv.getZoom(),rect.width,rect.height);
   for(const [i,patch] of patches.entries()){
    const pts=project(moved[i]||patch.rays),valid=!pts.some(p=>!p),shown=isAvailable()&&i<count&&valid;
    people[i].hidden=!selecting||!shown;people[i].disabled=!loaded||!sourceLoaded;
    if(!people[i].hidden)people[i].style.transform=warp(patch.canvas.width,patch.canvas.height,pts);
    const original=project(patch.rays);patch.canvas.hidden=!loaded||(i<count&&!moved[i])||original.some(p=>!p);
    if(!patch.canvas.hidden)patch.canvas.style.transform=warp(patch.canvas.width,patch.canvas.height,original);
    sprites[i].hidden=!moved[i]||!shown;if(!sprites[i].hidden)sprites[i].style.transform=warp(patch.canvas.width,patch.canvas.height,pts);
   }
   const zoneIndex=personDrag?.started?personDrag.index:keys.size?0:null,box=zoneIndex!==null&&targetBounds();dropZone.hidden=!box;
   if(box){dropZone.textContent=zoneIndex===0?'Zona de escucha · Top Gun':'Zona de escucha · Persona '+(zoneIndex+1);Object.assign(dropZone.style,{left:box.left+'px',top:box.top+'px',width:(box.right-box.left)+'px',height:(box.bottom-box.top)+'px'});dropZone.classList.toggle('is-over',inTarget(zoneIndex));}
   const p=projectRay([anchor.heading,anchor.pitch]),edge=projectRay([anchor.heading+4,anchor.pitch]);
   button.hidden=!selecting||!isAvailable()||!p||p[0]<0||p[1]<0||p[0]>rect.width||p[1]>rect.height;
   if(!button.hidden){const size=Math.max(24,Math.min(300,edge?Math.abs(edge[0]-p[0])*2:60));Object.assign(button.style,{left:p[0]+'px',top:p[1]+'px',width:size+'px',height:size+'px'});}
   projectedPole=poleRays.map(projectRay);slider.hidden=!selecting||!isAvailable()||projectedPole.some(p=>!p);if(!slider.hidden)slider.style.transform=warp(26,420,projectedPole);
   slider.setAttribute('aria-valuenow',String(Math.max(1,count)));button.disabled=!loaded;slider.setAttribute('aria-disabled',String(!loaded));
  }
  addEventListener('admira-targets-change',()=>{if(!selectionEnabled()){selectPerson(null);if([slider,button,...people].includes(document.activeElement))document.activeElement.blur();}layout();});
  addEventListener('pagehide',()=>{stopWalking();audio?.close();});new ResizeObserver(layout).observe(container);
  return {layout,close,setMusicState};
 }
 const api={anchor,create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.InteractiveScene=api;
})(typeof globalThis!=='undefined'?globalThis:this);
