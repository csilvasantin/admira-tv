/* Registered per-person clean patches, not a replacement view or camera command. */
(function(root){
 const anchor={pano:'L6xcO37SQfBmCxsT9lPdjQ',heading:325.8989423,pitch:9.8861264};
 function create({getPanorama,container,warp,isAvailable=()=>true}){
  const geometry=root.PedestrianLayers,ref=geometry.reference;
  const ray=(x,y)=>root.DoohSurfaces.unproject(x,y,ref.pov,ref.zoom,ref.width,ref.height);
  const patches=geometry.regions.map(([x,y,r,b],index)=>{
   const canvas=document.createElement('canvas');canvas.className='mapped-person-patch';canvas.width=r-x;canvas.height=b-y;canvas.hidden=true;canvas.dataset.person=String(index+1);container.append(canvas);
   return {canvas,x,y,r,b,rays:[[x,y],[r,y],[r,b],[x,b]].map(p=>ray(...p))};
  });
  const poleRays=geometry.pole.map(p=>ray(...p));
  const button=document.createElement('button');button.id='mapped-no-parking';button.setAttribute('aria-label','Señal de prohibido: ocultar o restaurar peatones');button.title='Ocultar peatones · volver a pulsar para restaurar';button.hidden=true;container.append(button);
  const slider=document.createElement('div');slider.id='mapped-pole-slider';slider.tabIndex=0;slider.setAttribute('role','slider');slider.setAttribute('aria-label','Peatones en el poste');slider.setAttribute('aria-orientation','vertical');slider.setAttribute('aria-valuemin','1');slider.setAttribute('aria-valuemax','10');
  for(let n=10;n>=1;n--){const mark=document.createElement('span');mark.textContent=n;mark.dataset.count=n;slider.append(mark);}container.append(slider);
  const note=document.createElement('output');note.id='mapped-people-status';note.setAttribute('aria-live','polite');note.hidden=true;container.append(note);
  const clean=new Image();clean.src='../assets/mapping/jardinets-clean-registered.png';
  let loaded=false,count=10,audio=null,pointer=null,projectedPole=null;
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
  function setCount(value){
   if(!loaded||getPanorama()?.getPano()!==anchor.pano)return;
   count=geometry.clamp(value);button.setAttribute('aria-pressed',String(count===0));
   slider.setAttribute('aria-valuenow',String(Math.max(1,count)));slider.setAttribute('aria-valuetext',count===0?'Peatones ocultos con la señal':count+' de 10 niveles');
   note.textContent='PRUEBA EDITADA · '+count+'/10 · Poste: abajo 1, arriba 10';note.hidden=false;
   [...slider.children].forEach(mark=>mark.classList.toggle('selected',Number(mark.dataset.count)===count));
   console.info('[Mapping] Peatones',JSON.stringify({count,camera:camera()}));layout();
  }
  async function alertSound(){try{audio??=new (window.AudioContext||window.webkitAudioContext)();await audio.resume();const gain=audio.createGain(),osc=audio.createOscillator(),now=audio.currentTime;gain.connect(audio.destination);gain.gain.setValueAtTime(.1,now);gain.gain.exponentialRampToValueAtTime(.001,now+.3);osc.frequency.setValueAtTime(740,now);osc.frequency.setValueAtTime(520,now+.15);osc.connect(gain);osc.start(now);osc.stop(now+.31);osc.onended=()=>{osc.disconnect();gain.disconnect();};}catch{}}
  const stop=e=>{e.preventDefault();e.stopPropagation();};
  button.addEventListener('pointerdown',stop);button.onclick=e=>{stop(e);if(!loaded||!isAvailable())return;alertSound();setCount(count===0?10:0);};
  function drag(e){if(!projectedPole)return;const rect=container.getBoundingClientRect(),top=[(projectedPole[0][0]+projectedPole[1][0])/2,(projectedPole[0][1]+projectedPole[1][1])/2],bottom=[(projectedPole[2][0]+projectedPole[3][0])/2,(projectedPole[2][1]+projectedPole[3][1])/2];setCount(geometry.countFromPoint([e.clientX-rect.left,e.clientY-rect.top],top,bottom));}
  slider.addEventListener('pointerdown',e=>{stop(e);if(!loaded||!isAvailable())return;pointer=e.pointerId;slider.setPointerCapture(pointer);drag(e);});
  slider.addEventListener('pointermove',e=>{if(e.pointerId===pointer){stop(e);drag(e);}});
  const release=e=>{if(e.pointerId===pointer){stop(e);pointer=null;if(slider.hasPointerCapture(e.pointerId))slider.releasePointerCapture(e.pointerId);}};
  slider.addEventListener('pointerup',release);slider.addEventListener('pointercancel',release);slider.addEventListener('click',stop);
  slider.addEventListener('keydown',e=>{const steps={ArrowUp:1,ArrowRight:1,ArrowDown:-1,ArrowLeft:-1};if(e.key in steps){stop(e);e.stopImmediatePropagation();setCount(Math.max(1,count+steps[e.key]));}else if(e.key==='Home'||e.key==='End'){stop(e);e.stopImmediatePropagation();setCount(e.key==='Home'?1:10);}},true);
  function close(){count=10;patches.forEach(p=>p.canvas.hidden=true);button.hidden=true;slider.hidden=true;note.hidden=true;pointer=null;}
  function layout(){
   const sv=getPanorama(),rect=container.getBoundingClientRect();
   for(const el of [button,slider,note,...patches.map(p=>p.canvas)])if(!el.isConnected)container.append(el);
   const here=sv?.getVisible()&&sv.getPano()===anchor.pano;
   if(!here){close();return;}
   const project=r=>root.DoohSurfaces.project(...r,sv.getPov(),sv.getZoom(),rect.width,rect.height);
   for(const [i,patch] of patches.entries()){
    const pts=patch.rays.map(project);patch.canvas.hidden=!loaded||i<count||pts.some(p=>!p);
    if(!patch.canvas.hidden)patch.canvas.style.transform=warp(patch.canvas.width,patch.canvas.height,pts);
   }
   const p=project([anchor.heading,anchor.pitch]),edge=project([anchor.heading+4,anchor.pitch]);
   button.hidden=!isAvailable()||!p||p[0]<0||p[1]<0||p[0]>rect.width||p[1]>rect.height;
   if(!button.hidden){const size=Math.max(24,Math.min(300,edge?Math.abs(edge[0]-p[0])*2:60));Object.assign(button.style,{left:p[0]+'px',top:p[1]+'px',width:size+'px',height:size+'px'});}
   projectedPole=poleRays.map(project);slider.hidden=!isAvailable()||projectedPole.some(p=>!p);
   if(!slider.hidden)slider.style.transform=warp(26,420,projectedPole);
   slider.setAttribute('aria-valuenow',String(Math.max(1,count)));button.disabled=!loaded;slider.setAttribute('aria-disabled',String(!loaded));
  }
  addEventListener('pagehide',()=>audio?.close());new ResizeObserver(layout).observe(container);
  return {layout,close};
 }
 const api={anchor,create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.InteractiveScene=api;
})(typeof globalThis!=='undefined'?globalThis:this);
