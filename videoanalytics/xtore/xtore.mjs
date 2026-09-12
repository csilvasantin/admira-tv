import {CLASSES, SNAPSHOT_TTL, PassageTracker, PassageCounts, validRect, validQuad, quadMatrix} from './core.mjs';
import {CutoutJob} from './cutouts.mjs';
import {installTwinUI} from './twin-ui.mjs';
import {detectObjects} from './detector.mjs';
import {installSignageUI} from './signage-ui.mjs';
import {installHistoryUI} from './history.mjs';
import {CalibrationPresetStore,compatiblePreset} from './preset.mjs';

const $=id=>document.getElementById(id);
const scene=$('scene'), stage=$('stage'), frame=document.createElement('canvas');
const frameContext=frame.getContext('2d',{willReadFrequently:true});
const tablet=$('tablet-canvas'), capture=$('capture-canvas');
const tracker=new PassageTracker();
const passages=new PassageCounts();
const numberFormat=new Intl.NumberFormat('es-ES');
const cutoutJob=new CutoutJob();
let segmenter=null,cutoutsEnabled=false,cutoutLoading=false,segmentInput=null,pendingCutout=null,cutoutExpiryTimer=0;
let stream=null, generation=0, analyzing=false, busy=false, loopTimer=0, expiryTimer=0;
let model=null, modelPromise=null, calibration=null, points=[], roiReady=false, tabletReady=false;
let roi=[.706,.026,.282,.293];
let quad=[[.773,.491],[.89,.51],[.874,.675],[.75,.647]];
let signageQuad=[[.59,.37],[.78,.37],[.78,.9],[.59,.9]],signageReady=false;
let sourceSize='', lastVideoTime=-1, lastFrameAt=0;
let sourceDimensions=null,calibrationDimensions=null;
const presetStore=new CalibrationPresetStore(()=>window.localStorage);
let presetState=presetStore.read();
function presetStatus(message){
  const p=presetState.preset;
  const saved=p?`Último preset · ${new Date(p.savedAt).toLocaleString('es-ES')} · ${[p.roi&&'cámara',p.tablet&&'iPad',p.signage&&'DS'].filter(Boolean).join(' + ')}`:'';
  $('preset-status').textContent=message||(saved?`${saved}. Se carga al compartir una vista compatible.`:presetState.state==='unavailable'?'El navegador no permite guardar el preset. Encuadre disponible solo en esta sesión.':presetState.state==='invalid'?'Preset no válido: vuelve a marcar las superficies.':'Sin preset guardado. Marca las superficies una vez.');
  $('forget-preset').disabled=presetState.state==='empty'||(presetState.state==='unavailable'&&!p);
}
function restorePreset(){
  presetState=presetStore.read();presetStatus();
  const p=presetState.preset;
  if(!p)return false;
  if(!compatiblePreset(p,sourceDimensions)){
    presetStatus('Preset conservado, pero el formato de esta pestaña es distinto. Vuelve a marcar las superficies.');return false;
  }
  roiReady=!!p.roi;tabletReady=!!p.tablet;signageReady=!!p.signage;
  calibrationDimensions=[...p.source];
  if(p.roi)roi=[...p.roi];if(p.tablet)quad=p.tablet.map(p=>[...p]);if(p.signage)signageQuad=p.signage.map(p=>[...p]);
  $('calibration-status').textContent=`Preset cargado · Cámara: ${roiReady?'marcada':'pendiente'} · iPad: ${tabletReady?'marcado':'pendiente'} · cartelería: ${signageReady?'marcada':'pendiente'}`;
  presetStatus('Último preset cargado automáticamente. Comprueba la vista antes de iniciar; si has movido el gemelo, vuelve a marcar.');
  return true;
}
function savePreset(){
  if(!stream||!sourceDimensions)return;
  const result=presetStore.save({source:calibrationDimensions||sourceDimensions,roi:roiReady?roi:null,tablet:tabletReady?quad:null,signage:signageReady?signageQuad:null});
  if(result.state==='unavailable'){
    presetState={...result,preset:presetState.preset};
    presetStatus('No se pudo guardar el nuevo encuadre. El último preset guardado no se ha sustituido; el encuadre nuevo solo está en esta sesión.');return;
  }
  presetState=result;
  presetStatus(presetState.state==='saved'?'Último encuadre guardado automáticamente en este navegador.':undefined);
}
$('forget-preset').addEventListener('click',()=>{
  if(!presetStore.clear()){presetStatus('No se pudo borrar el preset del navegador.');return;}
  presetState={state:'empty',preset:null};presetStatus('Preset olvidado. El encuadre actual no cambia; una nueva marcación volverá a guardarlo.');
});
presetStatus();
const twins=installTwinUI({document,onOriginalRemoved:()=>clearCapture('Original temporal retirado')});
const signage=installSignageUI({document,window});
const history=installHistoryUI({document});
let historyTimer=0;
function queueHistory(events,source='detector'){
  history.add(events,source);
  if(!historyTimer)historyTimer=setTimeout(()=>{historyTimer=0;history.sync();},1500);
}

function status(message){$('status').textContent=message;}
function renderCounts(){
  for(const [category,count] of Object.entries(passages.counts))$(`count-${category}`).textContent=numberFormat.format(count);
  $('event-counter').textContent=`${numberFormat.format(passages.total)} ${passages.total===1?'paso':'pasos'}`;
}
function controls(){
  const connected=!!stream;
  $('connect').disabled=connected||busy;
  $('stop').disabled=!connected;
  $('add-scooter').disabled=!connected;
  for(const id of ['set-roi','set-tablet','set-signage','edit-coordinates'])$(id).disabled=!connected;
  // Playback owns its browser instance, independently of the captured video.
  signage.setAnalysis(analyzing&&!calibration&&!document.hidden);
  signage.setEligible(!document.hidden);
  layout();
  $('analyze').disabled=!connected||!roiReady||!tabletReady||!!calibration||busy;
  $('analyze').textContent=analyzing?'Pausar análisis':'Iniciar análisis';
  $('connection').textContent=analyzing?'Analizando':connected?'Pestaña conectada':'Cámara sin conectar';
  $('connection').classList.toggle('live',analyzing);
}
function tabletIdle(text='Esperando un paso'){
  const c=tablet.getContext('2d');
  c.fillStyle='#09131b';c.fillRect(0,0,640,480);
  c.strokeStyle='#33404a';c.lineWidth=16;c.strokeRect(8,8,624,464);
  c.textAlign='center';c.fillStyle='#3df08a';c.font='bold 30px sans-serif';c.fillText('Admira.tv / Xtore',320,210);
  c.fillStyle='#b4c4ce';c.font='24px sans-serif';c.fillText(text,320,266);
}
function clearCapture(message='Sin capturas'){
  clearTimeout(expiryTimer);
  clearCutouts();
  capture.getContext('2d').clearRect(0,0,capture.width,capture.height);
  capture.hidden=true;$('capture-empty').hidden=false;
  $('capture').style.borderColor='#33404a';
  $('event-label').textContent=message;
  $('event-meta').textContent='Capturas efímeras · 6 s';
  tabletIdle(analyzing?'Esperando un paso':'Análisis en pausa');
}
function pause(message){
  // Pausing detection returns to the normal loop; it is not a screen power-off.
  twins.cancelOriginal();
  analyzing=false;generation++;clearTimeout(loopTimer);clearCapture();controls();
  frameContext.clearRect(0,0,frame.width,frame.height);
  if(message)status(message);
}
function disconnect(message='Desconectado. Capturas y vídeo borrados de la vista.'){
  pause();
  tracker.reset();
  if(stream)for(const track of stream.getTracks())track.stop();
  stream=null;scene.srcObject=null;scene.removeAttribute('src');scene.load();
  frame.width=1;frame.height=1;sourceSize='';sourceDimensions=null;calibrationDimensions=null;lastVideoTime=-1;
  roiReady=false;tabletReady=false;signageReady=false;calibration=null;points=[];
  stage.classList.remove('calibrating');stage.style.aspectRatio='16 / 9';
  $('tablet').hidden=true;$('signage').hidden=true;$('roi').hidden=true;$('markers').replaceChildren();
  $('empty-scene').hidden=false;$('source-info').textContent='PLAYER VIRTUAL · SIN VÍDEO EN DIRECTO';
  $('calibration-status').textContent='Encuadre pendiente de confirmar';
  $('coordinates').hidden=true;controls();status(message);
}
function layout(){
  const width=stage.clientWidth,height=stage.clientHeight;
  if(tabletReady){$('tablet').style.transform=`matrix3d(${quadMatrix(640,480,quad.map(([x,y])=>[x*width,y*height])).join(',')})`;}
  if(signageReady){$('signage').style.transform=`matrix3d(${quadMatrix(540,960,signageQuad.map(([x,y])=>[x*width,y*height])).join(',')})`;}
  Object.assign($('roi').style,{left:`${roi[0]*100}%`,top:`${roi[1]*100}%`,width:`${roi[2]*100}%`,height:`${roi[3]*100}%`});
  $('tablet').hidden=!tabletReady||!stream;
  const standalone=!stream,unplaced=!!stream&&!signageReady;
  $('signage').classList.toggle('standalone',standalone);
  $('signage').classList.toggle('unplaced',unplaced);
  if(standalone||unplaced)$('signage').style.transform='none';
  $('signage').hidden=!!calibration;
  $('empty-scene').hidden=true;
  $('roi').hidden=!stream||!roiReady;
}
new ResizeObserver(layout).observe(stage);

$('connect').addEventListener('click',async()=>{
  if(!navigator.mediaDevices?.getDisplayMedia){status('Este navegador no permite compartir pestañas aquí. Abre esta vista en Chrome de escritorio, por HTTPS o localhost.');return;}
  busy=true;controls();
  try{
    // The browser/user chooses the source. Never preselect an authenticated tab or reuse its cookies.
    const selected=await navigator.mediaDevices.getDisplayMedia({video:{displaySurface:'browser',frameRate:{ideal:10,max:15}},audio:false,monitorTypeSurfaces:'exclude',selfBrowserSurface:'exclude',surfaceSwitching:'exclude',systemAudio:'exclude'});
    const track=selected.getVideoTracks()[0];
    if(track?.getSettings().displaySurface!=='browser'){
      selected.getTracks().forEach(t=>t.stop());
      status('Selecciona una pestaña de Chrome, no una ventana ni la pantalla completa.');return;
    }
    stream=selected;generation++;roiReady=false;tabletReady=false;signageReady=false;
    tracker.reset();
    track.addEventListener('ended',()=>disconnect('Se ha terminado de compartir. La captura se ha borrado.'),{once:true});
    track.addEventListener('mute',()=>pause('La fuente está interrumpida. Revisa la pestaña y vuelve a iniciar el análisis.'));
    scene.srcObject=stream;
    await scene.play();
    passages.reset();renderCounts();
    $('empty-scene').hidden=true;
    updateSourceSize();
    status(roiReady&&tabletReady?'Preset cargado. Comprueba que cámara, iPad y DS coinciden con la vista; pulsa Iniciar análisis cuando quieras.':'Pestaña conectada. Comprueba que es la Xtore y marca las superficies pendientes. No se analiza todavía.');
  }catch(error){
    if(stream)disconnect();
    status(error.name==='NotAllowedError'?'No se ha concedido permiso para compartir. Puedes volver a intentarlo.':`No se pudo compartir la pestaña (${error.name||'error del navegador'}).`);
  }finally{busy=false;controls();}
});
$('stop').addEventListener('click',()=>disconnect());
$('reset-counts').addEventListener('click',()=>{
  // Do not reset tracking, cancel an inference or discard the archive outbox.
  // Otherwise a person already in view would immediately count again.
  passages.reset();renderCounts();twins.cancelOriginal();clearCapture('Contadores reiniciados');
  status('Contadores a cero. Se conserva el seguimiento y el histórico; los envíos pendientes no se borran.');
});
$('add-scooter').addEventListener('click',()=>{
  if(!stream)return;
  const events=[{class:'scooter'}];passages.add(events);renderCounts();queueHistory(events,'manual');
  status('Un patinete registrado manualmente. No es una detección automática ni cambia el player.');
});
function updateSourceSize(){
  if(!stream||!scene.videoWidth||!scene.videoHeight)return;
  const next=`${scene.videoWidth} × ${scene.videoHeight}`;
  const dimensions=[scene.videoWidth,scene.videoHeight],first=!sourceSize;
  if(sourceSize && sourceSize!==next){
    const reference=calibrationDimensions||sourceDimensions;
    const proportional=reference&&Math.abs((reference[0]/reference[1])/(dimensions[0]/dimensions[1])-1)<=.005;
    pause(proportional?'La resolución ha cambiado proporcionalmente. Se conserva el encuadre; comprueba la vista antes de reanudar.':'La fuente ha cambiado de formato. Vuelve a marcar las superficies antes de analizar. El preset anterior se conserva.');
    tracker.reset();
    calibration=null;points=[];stage.classList.remove('calibrating');$('markers').replaceChildren();$('coordinates').hidden=true;
    if(!proportional){roiReady=false;tabletReady=false;signageReady=false;calibrationDimensions=null;$('calibration-status').textContent='Formato nuevo: repite el encuadre';}
  }
  sourceDimensions=dimensions;
  if(first&&!calibration)restorePreset();
  sourceSize=next;stage.style.aspectRatio=`${scene.videoWidth} / ${scene.videoHeight}`;
  $('source-info').textContent=`PESTAÑA COMPARTIDA · ${next}`;layout();controls();
}
scene.addEventListener('resize',updateSourceSize);

function startCalibration(kind){
  if(!stream||!sourceDimensions){status('Espera a que la pestaña compartida tenga vídeo antes de marcar.');return;}
  pause();calibration=kind;points=[];stage.classList.add('calibrating');$('markers').replaceChildren();
  stage.scrollIntoView?.({block:'center',behavior:'instant'});
  $('coordinates').hidden=true;
  if(kind==='roi'){tracker.reset();roiReady=false;$('roi').hidden=true;status('Marca dos puntos en la escena: esquina superior izquierda e inferior derecha del vídeo de Puerta Cam. No incluyas el resto de la tienda.');}
  else if(kind==='signage'){signageReady=false;$('signage').hidden=true;status('Marca las cuatro esquinas interiores de la pantalla grande: superior izquierda → superior derecha → inferior derecha → inferior izquierda.');}
  else{tabletReady=false;$('tablet').hidden=true;status('Marca las cuatro esquinas interiores del iPad: superior izquierda → superior derecha → inferior derecha → inferior izquierda.');}
  $('calibration-status').textContent=kind==='roi'?'Marcando cámara: 0 / 2':`Marcando ${kind==='signage'?'cartelería':'iPad'}: 0 / 4`;
  controls();
}
$('set-roi').addEventListener('click',()=>startCalibration('roi'));
$('set-tablet').addEventListener('click',()=>startCalibration('tablet'));
$('set-signage').addEventListener('click',()=>startCalibration('signage'));
stage.addEventListener('click',event=>{
  if(!calibration||calibration==='coordinates')return;
  const box=stage.getBoundingClientRect();
  const point=[Math.max(0,Math.min(1,(event.clientX-box.left)/box.width)),Math.max(0,Math.min(1,(event.clientY-box.top)/box.height))];
  points.push(point);
  const marker=document.createElement('span');marker.className='marker';marker.textContent=points.length;
  marker.style.left=`${point[0]*100}%`;marker.style.top=`${point[1]*100}%`;$('markers').append(marker);
  const required=calibration==='roi'?2:4;
  $('calibration-status').textContent=`Marcando ${calibration==='roi'?'cámara':calibration==='signage'?'cartelería':'iPad'}: ${points.length} / ${required}`;
  if(points.length!==required)return;
  if(calibration==='roi'){
    const candidate=[points[0][0],points[0][1],points[1][0]-points[0][0],points[1][1]-points[0][1]];
    if(!validRect(candidate)){startCalibration('roi');status('El recuadro no es válido. Marca primero arriba a la izquierda y después abajo a la derecha.');return;}
    roi=candidate;roiReady=true;
  }else{
    if(!validQuad(points)){startCalibration(calibration);status('Las esquinas se cruzan o la pantalla es demasiado pequeña. Repite en sentido horario desde arriba a la izquierda.');return;}
    if(calibration==='signage'){signageQuad=points.map(p=>[...p]);signageReady=true;}
    else{quad=points.map(p=>[...p]);tabletReady=true;}
  }
  finishCalibration();
});
function finishCalibration(){
  calibrationDimensions||=[...sourceDimensions];
  calibration=null;points=[];stage.classList.remove('calibrating');$('markers').replaceChildren();
  $('calibration-status').textContent=`Cámara: ${roiReady?'marcada':'pendiente'} · iPad: ${tabletReady?'marcado':'pendiente'} · cartelería: ${signageReady?'marcada':'opcional, pendiente'}`;
  layout();controls();status(roiReady&&tabletReady?'Encuadre listo. Pulsa Iniciar análisis. Si giras o acercas el gemelo, pausa y vuelve a marcar.':'Marca también la otra zona antes de iniciar el análisis.');
  savePreset();
}
const coordinateNames=['Cámara: izquierda','Cámara: arriba','Cámara: ancho','Cámara: alto','iPad: sup. izq. X','iPad: sup. izq. Y','iPad: sup. der. X','iPad: sup. der. Y','iPad: inf. der. X','iPad: inf. der. Y','iPad: inf. izq. X','iPad: inf. izq. Y'];
const signageNames=['Cartelería: sup. izq. X','Cartelería: sup. izq. Y','Cartelería: sup. der. X','Cartelería: sup. der. Y','Cartelería: inf. der. X','Cartelería: inf. der. Y','Cartelería: inf. izq. X','Cartelería: inf. izq. Y'];
$('edit-coordinates').addEventListener('click',()=>{
  if(!stream||!sourceDimensions)return;
  pause();calibration='coordinates';points=[];stage.classList.remove('calibrating');$('markers').replaceChildren();controls();
  $('coordinate-fields').replaceChildren();
  [...roi,...quad.flat(),...signageQuad.flat()].forEach((value,i)=>{
    const label=document.createElement('label');label.textContent=[...coordinateNames,...signageNames][i];
    const input=document.createElement('input');input.type='number';input.min='0';input.max='100';input.step='.1';input.value=i>=12&&!signageReady?'':(value*100).toFixed(1);input.id=`coord-${i}`;label.append(input);$('coordinate-fields').append(label);
  });
  $('coordinates').hidden=false;status('Ajusta los porcentajes y pulsa Aplicar coordenadas. Los valores iniciales son orientativos, no una calibración automática.');
});
$('apply-coordinates').addEventListener('click',()=>{
  if(!stream||!sourceDimensions||calibration!=='coordinates'||$('coordinates').hidden)return;
  const values=coordinateNames.map((_,i)=>$(`coord-${i}`).value.trim()===''?NaN:Number($(`coord-${i}`).value)/100);
  const r=values.slice(0,4),q=[values.slice(4,6),values.slice(6,8),values.slice(8,10),values.slice(10,12)];
  if(!validRect(r)||!validQuad(q)){status('Coordenadas inválidas: cámara dentro de la escena y cuatro esquinas del iPad en sentido horario, sin cruces.');return;}
  const s=signageNames.map((_,i)=>$(`coord-${i+12}`).value.trim());
  if(s.some(Boolean)){
    const sq=Array.from({length:4},(_,i)=>s.slice(i*2,i*2+2).map(v=>v===''?NaN:Number(v)/100));
    if(!validQuad(sq)){status('Completa las ocho coordenadas de cartelería o déjalas todas vacías para omitirla.');return;}
    signageQuad=sq;signageReady=true;
  }else signageReady=false;
  if(r.some((value,i)=>Math.abs(value-roi[i])>.00001))tracker.reset();
  roi=r;quad=q;roiReady=true;tabletReady=true;$('coordinates').hidden=true;finishCalibration();
});
$('confidence').addEventListener('input',()=>{$('confidence-value').value=`${$('confidence').value} %`;});
$('bicycle-confidence').addEventListener('input',()=>{$('bicycle-confidence-value').value=`${$('bicycle-confidence').value} %`;});

function loadScript(src,integrity){
  return new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src=src;script.integrity=integrity;script.crossOrigin='anonymous';
    const timeout=setTimeout(()=>{script.remove();reject(new Error('La descarga del detector tardó demasiado.'));},30000);
    script.onload=()=>{clearTimeout(timeout);resolve();};script.onerror=()=>{clearTimeout(timeout);script.remove();reject(new Error('No se pudo verificar o descargar el detector.'));};document.head.append(script);
  });
}
async function prepareModel(){
  if(model)return model;
  if(modelPromise)return modelPromise;
  $('prepare-model').disabled=true;$('model-status').textContent='Descargando detector local… No se envía ninguna imagen.';
  modelPromise=(async()=>{
    // ES2017 avoids the legacy bundle's dynamic Function/regenerator shim;
    // keep CSP strict rather than enabling unsafe-eval for the entire page.
    if(typeof window.tf?.ready!=='function')await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.es2017.min.js','sha384-ODzrY1mCTIRZRerZfDIqCoTQafA1St1OwLVc9SsTefnkCF1MeIaVSZ88wuK/NKfH');
    if(typeof window.cocoSsd?.load!=='function')await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js','sha384-7qLdgfEQyO9ZQi9ArRHigK+IBto4XPk468jAqc+fnsXaZIcMAhQeLwzggRK7aESl');
    await window.tf.ready();
    let timedOut=false, timer;
    const loading=window.cocoSsd.load({base:'mobilenet_v2'}).then(loaded=>{if(timedOut){loaded.dispose();throw new Error('Descarga caducada');}return loaded;});
    try{model=await Promise.race([loading,new Promise((_,reject)=>{timer=setTimeout(()=>{timedOut=true;reject(new Error('No se pudo completar la descarga del modelo en 60 segundos.'));},60000);})]);}finally{clearTimeout(timer);}
    $('model-status').textContent=`Detector listo · COCO-SSD 2.2.3 / MobileNet v2 · ${window.tf.getBackend()}. Pendiente de validar precisión con esta cámara.`;
    $('prepare-model').textContent='Detector preparado';return model;
  })().catch(error=>{modelPromise=null;$('prepare-model').disabled=false;$('model-status').textContent=`${error.message} Reintenta Preparar detector.`;throw error;});
  return modelPromise;
}
$('prepare-model').addEventListener('click',()=>{prepareModel().catch(()=>{});});
$('analyze').addEventListener('click',async()=>{
  if(analyzing){pause('Análisis en pausa. La pestaña continúa compartida, pero no se procesan fotogramas.');return;}
  if(!stream||!roiReady||!tabletReady||calibration)return;
  const token=++generation;busy=true;controls();
  try{
    await prepareModel();
    if(token!==generation||!stream)return;
    if(document.hidden){status('Vuelve a esta vista y pulsa Iniciar análisis.');return;}
    analyzing=true;lastVideoTime=-1;lastFrameAt=performance.now();
    history.sync();
    status('Analizando solo Puerta Cam. Pasos confirmados en dos fotogramas (tres para bicis de confianza baja); capturas de 6 s. Los pasos con regla y contenido interrumpen la música; sin coincidencia continúa la playlist.');
    tabletIdle();loop(token);
  }catch{status('No se ha iniciado el análisis. Revisa el estado del detector.');}
  finally{busy=false;controls();}
});
async function loop(token){
  if(!analyzing||token!==generation||!stream)return;
  const iterationStart=performance.now();
  try{
      const now=performance.now();
    if(scene.readyState<2||scene.currentTime===lastVideoTime){
      if(now-lastFrameAt>3000){pause('No llegan fotogramas nuevos. Revisa Puerta Cam y vuelve a iniciar el análisis.');return;}
    }else{
      lastVideoTime=scene.currentTime;lastFrameAt=now;
      const [x,y,w,h]=roi, sw=scene.videoWidth,sh=scene.videoHeight;
      const width=Math.max(1,Math.round(Math.min(960,w*sw))),height=Math.max(1,Math.round(width*h*sh/(w*sw)));
      if(frame.width!==width||frame.height!==height){frame.width=width;frame.height=height;}
      frameContext.drawImage(scene,x*sw,y*sh,w*sw,h*sh,0,0,width,height);
      const start=performance.now(),threshold=Number($('confidence').value)/100,bikeThreshold=Number($('bicycle-confidence').value||40)/100;
      const predictions=await detectObjects(model,window.tf,frame,Math.min(.25,threshold,bikeThreshold));
      if(!analyzing||token!==generation)return;
      const events=tracker.update(predictions,performance.now(),width,height,{person:threshold,car:threshold,motorcycle:threshold,bicycle:bikeThreshold});
      if(events.length){passages.add(events);renderCounts();queueHistory(events);signage.passage(events);}
      $('source-info').textContent=`PUERTA CAM · ${width} × ${height} · ${Math.round(performance.now()-start)} ms / análisis`;
      const bikes=predictions.filter(p=>p.class==='bicycle'),best=bikes.reduce((score,p)=>Math.max(score,p.score),0);
      $('detection-status').textContent=`Bicis candidatas: ${bikes.length} · mejor ${Math.round(best*100)} % · umbral ${Math.round(bikeThreshold*100)} % · ${Math.round(performance.now()-start)} ms`;
      if(events.length)showCapture(events);
    }
  }catch{
    if(token!==generation||!analyzing)return;
    pause('El detector ha fallado. La captura se ha borrado; revisa la fuente y vuelve a iniciar.');return;
  }
  if(analyzing&&token===generation)loopTimer=setTimeout(()=>loop(token),Math.max(0,125-(performance.now()-iterationStart)));
}
function showCapture(events){
  const main=CLASSES[events[0].class];
  capture.width=frame.width;capture.height=frame.height;
  const c=capture.getContext('2d');c.drawImage(frame,0,0);
  const fontSize=Math.max(12,Math.round(frame.width/45));c.font=`bold ${fontSize}px sans-serif`;c.lineWidth=Math.max(2,frame.width/220);
  for(const item of events){
    const style=CLASSES[item.class], [x,y,w,h]=item.bbox;
    c.strokeStyle=style.color;c.strokeRect(x,y,w,h);
    const text=`${style.label} ${Math.round(item.score*100)} %`, labelY=Math.max(fontSize+5,y);
    c.fillStyle='#08121de8';c.fillRect(Math.max(0,x),labelY-fontSize-5,c.measureText(text).width+8,fontSize+8);
    c.fillStyle='#fff';c.fillText(text,Math.max(0,x)+4,labelY);
  }
  const ctx=tablet.getContext('2d');ctx.fillStyle='#09131b';ctx.fillRect(0,0,640,480);
  const scale=Math.min(612/capture.width,390/capture.height),dw=capture.width*scale,dh=capture.height*scale;
  ctx.drawImage(capture,(640-dw)/2,16+(390-dh)/2,dw,dh);
  ctx.strokeStyle=main.color;ctx.lineWidth=16;ctx.strokeRect(8,8,624,464);
  ctx.fillStyle='#fff';ctx.textAlign='center';ctx.font='bold 25px sans-serif';ctx.fillText(`${main.label} · ${new Date().toLocaleTimeString('es-ES')}`,320,446);
  capture.hidden=false;$('capture-empty').hidden=true;$('capture').style.borderColor=main.color;
  $('event-label').textContent=events.map(p=>CLASSES[p.class].label).join(' · ');
  $('event-meta').textContent=`${new Date().toLocaleTimeString('es-ES')} · ${Math.round(events[0].score*100)} % de confianza · caduca en 6 s`;
  clearTimeout(expiryTimer);expiryTimer=setTimeout(()=>clearCapture('Captura caducada'),SNAPSHOT_TTL);
  showCutouts(events);
}
function clearCutouts(){
  cutoutJob.clear();
  if(pendingCutout){pendingCutout.source.data.fill(0);pendingCutout=null;}
  if(segmentInput){segmentInput.width=1;segmentInput.height=1;}
  clearCutoutView();
  if(!cutoutLoading)$('cutout-status').textContent=cutoutsEnabled?'Esperando un paso · recortes locales':'Desactivado · procesamiento local';
}
function clearCutoutView(){
  clearTimeout(cutoutExpiryTimer);
  for(const canvas of $('cutouts').querySelectorAll('canvas')){canvas.width=1;canvas.height=1;}
  $('cutouts').replaceChildren();
}
function showCutouts(events){
  if(!cutoutsEnabled||!segmenter)return;
  try{
    const task={source:frameContext.getImageData(0,0,frame.width,frame.height),events,token:generation,expiresAt:performance.now()+SNAPSHOT_TTL,time:new Date().toLocaleTimeString('es-ES')};
    if(cutoutJob.busy){
      if(pendingCutout)pendingCutout.source.data.fill(0);
      pendingCutout=task;$('cutout-status').textContent='Separando · siguiente captura en espera';return;
    }
    runCutoutTask(task);
  }catch{$('cutout-status').textContent='No se pudo leer la captura; el conteo continúa.';}
}
async function runCutoutTask(task){
  const {source,events,token,expiresAt,time}=task;
  let input,sourceExpiryTimer;
  try{
    input=document.createElement('canvas');segmentInput=input;input.width=source.width;input.height=source.height;
    input.getContext('2d').putImageData(source,0,0);
    sourceExpiryTimer=setTimeout(()=>{
      source.data.fill(0);input.width=1;input.height=1;cutoutJob.clear();
      if(token===generation&&cutoutsEnabled)$('cutout-status').textContent='Separación caducada · el conteo continúa';
    },Math.max(0,expiresAt-performance.now()));
    $('cutout-status').textContent='Separando objetos del fondo…';
    await cutoutJob.run({source,events,expiresAt,segment:()=>segmenter.segment(input),onResult:items=>{
      if(token!==generation||!analyzing||!cutoutsEnabled)return;
      clearCutoutView();
      for(const item of items){
        const figure=document.createElement('figure'),canvas=document.createElement('canvas'),caption=document.createElement('figcaption');
        canvas.width=item.width;canvas.height=item.height;canvas.getContext('2d').putImageData(new ImageData(item.data,item.width,item.height),0,0);
        const category=item.category,choose=document.createElement('button');
        choose.textContent='Elegir';choose.setAttribute('aria-label',`Elegir recorte de ${CLASSES[category].label}`);
        choose.disabled=['generating','publishing','review','publish-unknown'].includes(twins.session.phase);
        choose.addEventListener('click',()=>twins.select(canvas,category));
        caption.textContent=CLASSES[category].label;figure.append(canvas,caption,choose);$('cutouts').append(figure);item.data.fill(0);
      }
      $('cutout-status').textContent=items.length?`${time} · recortes locales, no anonimizados`:'Sin máscara fiable en esta captura';
      cutoutExpiryTimer=setTimeout(()=>{clearCutoutView();$('cutout-status').textContent='Recortes caducados · esperando otro paso';},Math.max(0,expiresAt-performance.now()));
    }});
  }catch{
    if(token===generation&&analyzing&&cutoutsEnabled)$('cutout-status').textContent='No se pudo separar el fondo; el conteo continúa.';
  }finally{
    clearTimeout(sourceExpiryTimer);
    source.data.fill(0);
    if(input){input.width=1;input.height=1;if(segmentInput===input)segmentInput=null;}
    const next=pendingCutout;pendingCutout=null;
    if(next){
      if(next.token===generation&&analyzing&&cutoutsEnabled&&performance.now()<next.expiresAt)runCutoutTask(next);
      else next.source.data.fill(0);
    }
  }
}
$('prepare-cutouts').addEventListener('click',async()=>{
  if(cutoutsEnabled){cutoutsEnabled=false;clearCutouts();$('prepare-cutouts').textContent='Activar recortes sin fondo';return;}
  cutoutLoading=true;$('prepare-cutouts').disabled=true;$('cutout-status').textContent='Preparando separación local…';
  try{
    await prepareModel();
    if(!segmenter){
      if(typeof window.deeplab?.load!=='function')await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/deeplab@0.2.2/dist/deeplab.min.js','sha384-E96lyx4l+7gIx8rSHIpUZRjM4TDSp0d7kr2rI+b78OPTU4FpbvWR80ljTbCj9WbU');
      let timedOut=false,timer;
      const loading=window.deeplab.load({base:'pascal',quantizationBytes:2,modelUrl:'https://www.kaggle.com/models/tensorflow/deeplab/tfJs/pascal-1-quantized/2/model.json?tfjs-format=file'}).then(async loaded=>{
        const warmup=document.createElement('canvas');warmup.width=16;warmup.height=16;
        try{
          if(timedOut)throw new Error('Carga caducada');
          await loaded.segment(warmup);
          if(timedOut)throw new Error('Carga caducada');
          return loaded;
        }catch(error){loaded.dispose();throw error;}
        finally{warmup.width=1;warmup.height=1;}
      });
      try{segmenter=await Promise.race([loading,new Promise((_,reject)=>{timer=setTimeout(()=>{timedOut=true;reject(new Error('Tiempo de descarga agotado'));},60000);})]);}finally{clearTimeout(timer);}
    }
    cutoutsEnabled=true;$('prepare-cutouts').textContent='Desactivar recortes sin fondo';
    $('cutout-status').textContent='Separación lista · se aplicará al próximo paso';
  }catch{$('cutout-status').textContent='No se pudo preparar la separación. Puedes reintentarlo; el conteo no cambia.';}
  finally{cutoutLoading=false;$('prepare-cutouts').disabled=false;}
});
// Do not leave identifiable frames sitting in a hidden tab or the back-forward cache.
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause('Análisis pausado al ocultar esta vista. Pulsa Iniciar análisis para continuar.');else{twins.checkExpiry();controls();}});
window.addEventListener('beforeunload',event=>{if(history.pending.length||history.lost){event.preventDefault();event.returnValue='';}});
window.addEventListener('pagehide',()=>{clearTimeout(historyTimer);twins.clear();disconnect();});
tabletIdle();renderCounts();controls();
