import {DirectionCounter,DEFAULT_DIRECTION_AXIS,validDirectionAxis,audienceSnapshot} from './audience-session.mjs?v=audience-session-1';
import {installXpaceLink} from './xpace-link.mjs?v=audience-session-1';
import {CLASSES, SNAPSHOT_TTL, PRESENCE_GRACE, PassageTracker, PassageCounts, validRect, validQuad, quadMatrix} from './core.mjs';
import {CutoutJob} from './cutouts.mjs';
import {installTwinUI} from './twin-ui.mjs?v=avatar-photo-1';
import {detectObjects} from './detector.mjs';
import {loadDetectorModel} from './model-loader.mjs?v=detector-download-2';
import {installSignageUI} from './signage-ui.mjs';
import {installHistoryUI} from './history.mjs';
import {CalibrationPresetStore,compatiblePreset} from './preset.mjs?v=audience-session-1';
import {TrackingOverlay} from './tracking-overlay.mjs';
import {installCleanStreetUI} from './clean-street-ui.mjs';
import {installScooterTracks} from './scooter-tracks.mjs';

const $=id=>document.getElementById(id);
const scene=$('scene'), stage=$('stage'), frame=document.createElement('canvas');
const frameContext=frame.getContext('2d',{willReadFrequently:true});
const cameraPreview=document.createElement('canvas');
let cameraPreviewTimer=0,previewVideoTime=-1;
const tablet=$('tablet-canvas'), capture=$('capture-canvas');
const tracker=new PassageTracker();
const trackingOverlay=new TrackingOverlay($('tracking-overlay'),{reservedBottom:()=>$('clean-status').hidden?0:$('clean-status').offsetHeight+2});
const passages=new PassageCounts();
const directions=new DirectionCounter();
let directionAxis=DEFAULT_DIRECTION_AXIS.map(p=>[...p]);
let audienceSessionId=crypto.randomUUID(),audienceStartedAt=Date.now(),audienceRevision=0,audienceUpdatedAt=Date.now();
function resetAudience(){directions.reset();audienceSessionId=crypto.randomUUID();audienceStartedAt=Date.now();audienceRevision=0;audienceUpdatedAt=Date.now();}
function sessionAudience(){return audienceSnapshot({sessionId:audienceSessionId,startedAt:audienceStartedAt,revision:audienceRevision,updatedAt:audienceUpdatedAt,counts:passages.counts,directions:directions.snapshot(passages.counts.person),axis:directionAxis,state:analyzing?'analyzing':analysisRequested?'waiting':stream?'paused':'disconnected'});}

const numberFormat=new Intl.NumberFormat('es-ES');
const cutoutJob=new CutoutJob();
let segmenter=null,cutoutsEnabled=false,cutoutLoading=false,segmentInput=null,pendingCutout=null,cutoutExpiryTimer=0;
let stream=null, generation=0, analyzing=false, busy=false, loopTimer=0, expiryTimer=0;
let captureRequest=null;
let analysisRequested=false,suspendedReason=null,recoveryTimer=0,recoveryVideoTime=-1,sourceMuted=false,inferences=0;
let sourcePlayPending=null,sourcePlayRetryAt=0;
let modelPhase='',modelError='';
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
  $('preset-summary').textContent=p?`Encuadre guardado · ${[p.roi&&'cámara',p.tablet&&'iPad',p.signage&&'pantalla'].filter(Boolean).join(' + ')} · se recupera al compartir la misma vista`:presetState.state==='unavailable'?'Guardado no disponible en este navegador · consulta Encuadre y detección':'Sin encuadre guardado en este navegador · configura las zonas una vez';
  const select=$('saved-presets'),previous=select.value;
  select.replaceChildren();
  for(const [i,item] of (presetState.presets||[]).entries()){
    const option=document.createElement('option');option.value=String(i);
    option.textContent=`${sourceDimensions&&!compatiblePreset(item,sourceDimensions)?'Otro formato · ':''}${i===0?'Último · ':''}${new Date(item.savedAt).toLocaleString('es-ES')} · ${item.source.join(' × ')} · ${[item.roi&&'cámara',item.tablet&&'iPad',item.signage&&'pantalla'].filter(Boolean).join(' + ')}`;
    select.append(option);
  }
  select.value=previous!==''&&(presetState.presets||[])[Number(previous)]?previous:'0';
  select.disabled=!(presetState.presets||[]).length;
  presetControls();
  $('forget-preset').disabled=presetState.state==='empty'||(presetState.state==='unavailable'&&!p);
}
function presetControls(){
  const selected=(presetState.presets||[])[Number($('saved-presets').value)];
  $('restore-preset').disabled=!stream||!compatiblePreset(selected,sourceDimensions)||!!captureRequest;
}
function restorePreset(selected){
  if(!selected){presetState=presetStore.read(sourceDimensions);presetStatus();}
  const p=selected||presetState.preset;
  if(!p)return false;
  if(!compatiblePreset(p,sourceDimensions)){
    presetStatus('Preset conservado, pero el formato de esta pestaña es distinto. Vuelve a marcar las superficies.');return false;
  }
  roiReady=!!p.roi;tabletReady=!!p.tablet;signageReady=!!p.signage;
  calibrationDimensions=[...p.source];
  directionAxis=(p.directionAxis||DEFAULT_DIRECTION_AXIS).map(p=>[...p]);
  if(p.roi)roi=[...p.roi];if(p.tablet)quad=p.tablet.map(p=>[...p]);if(p.signage)signageQuad=p.signage.map(p=>[...p]);
  $('saved-presets').value=String((presetState.presets||[]).indexOf(p));
  $('calibration-status').textContent=`Preset cargado · Cámara: ${roiReady?'marcada':'pendiente'} · iPad: ${tabletReady?'marcado':'opcional, sin colocar'} · cartelería: ${signageReady?'marcada':'opcional, sin colocar'}`;
  presetStatus('Encuadre recuperado. Comprueba la zona de cámara y las pantallas que hayas colocado antes de iniciar; si has movido el gemelo, vuelve a marcar.');
  return true;
}
function savePreset(){
  if(!stream||!sourceDimensions)return;
  const result=presetStore.save({source:calibrationDimensions||sourceDimensions,roi:roiReady?roi:null,tablet:tabletReady?quad:null,signage:signageReady?signageQuad:null,directionAxis});
  if(result.state==='unavailable'){
    presetState={...presetState,state:result.state};
    presetStatus('No se pudo guardar el nuevo encuadre. El último preset guardado no se ha sustituido; el encuadre nuevo solo está en esta sesión.');return;
  }
  presetState=result;
  $('saved-presets').value='0';
  presetStatus(presetState.state==='saved'?'Último encuadre guardado automáticamente en este navegador.':undefined);
}
$('forget-preset').addEventListener('click',()=>{
  if(!presetStore.clear()){presetStatus('No se pudo borrar el preset del navegador.');return;}
  presetState={state:'empty',preset:null,presets:[]};presetStatus('Preset olvidado. El encuadre actual no cambia; una nueva marcación volverá a guardarlo.');
});
$('saved-presets').addEventListener('change',presetControls);
$('restore-preset').addEventListener('click',()=>{
  const selected=(presetState.presets||[])[Number($('saved-presets').value)];
  if(!stream||!compatiblePreset(selected,sourceDimensions))return;
  pause();calibration=null;points=[];stage.classList.remove('calibrating');
  $('markers').replaceChildren();$('coordinates').hidden=true;
  restorePreset(selected);layout();controls();savePreset();
  status('Encuadre recuperado: cámara, iPad y pantalla según las marcas guardadas. Comprueba la superposición y pulsa Iniciar análisis.');
});
presetStatus();
const twins=installTwinUI({document,onOriginalRemoved:()=>clearCapture('Original temporal retirado')});
const xpace=installXpaceLink({document,window,onChange:()=>{
  if(document.hidden&&!xpace.backgroundActive)suspendAnalysis('hidden','Gemelo desconectado: análisis en espera mientras esta pestaña está oculta.');
  else {controls();scheduleRecovery();}
}});
const sourceVisible=()=>!document.hidden||xpace.backgroundActive;
const signage=installSignageUI({document,window,onMirror:state=>xpace.media(state),onStop:()=>xpace.stop()});
const history=installHistoryUI({document});
const scooterTracks=installScooterTracks({document,onConfirm:events=>{passages.add(events);renderCounts();queueHistory(events,'manual');}});
const cleanStreet=installCleanStreetUI({document,getPassages:()=>passages.counts,onToggle:enabled=>{
  xpace.cameraOff();previewVideoTime=-1;
  clearCapture();
  $('capture-empty').textContent=enabled?'Vídeo original en directo en el iPad':'Esperando un paso confirmado';
}});
let historyTimer=0;
function queueHistory(events,source='detector'){
  history.add(events,source);
  if(!historyTimer)historyTimer=setTimeout(()=>{historyTimer=0;history.sync();},1500);
}

function status(message){$('status').textContent=message;}
function renderCounts(){
  for(const [category,count] of Object.entries(passages.counts))$(`count-${category}`).textContent=numberFormat.format(count);
  audienceRevision++;audienceUpdatedAt=Date.now();
  xpace.statistics(passages.counts,sessionAudience());
  $('camera-passage-count').textContent=`Personas que han pasado: ${numberFormat.format(passages.counts.person)} · Personas entran: ${numberFormat.format(directions.enter)} · Personas salen: ${numberFormat.format(directions.exit)} · Coches: ${numberFormat.format(passages.counts.car)} · Motos: ${numberFormat.format(passages.counts.motorcycle)} · Bicis: ${numberFormat.format(passages.counts.bicycle)}`;
  $('direction-summary').textContent=`Hacia la cámara: ${directions.enter} · Hacia el fondo: ${directions.exit} · Sin dirección: ${directions.snapshot(passages.counts.person).unknown}. Son sentidos de paso por la calle, no entradas físicas a la tienda.`;
  $('event-counter').textContent=`${numberFormat.format(passages.total)} ${passages.total===1?'paso':'pasos'}`;
}
function controls(){
  xpace.audience(sessionAudience());
  presetControls();
  const connected=!!stream;
  $('connect').disabled=connected||busy||!!captureRequest;
  $('stop').disabled=!connected&&!captureRequest;
  $('hide-people').disabled=!connected||!roiReady||!!calibration;
  $('add-scooter').disabled=!connected;
  for(const id of ['set-roi','set-tablet','set-signage','edit-coordinates','set-direction'])$(id).disabled=!connected;
  // Playback owns its browser instance, independently of the captured video.
  signage.setAnalysis(analyzing&&!calibration&&sourceVisible(),!analysisRequested&&!calibration);
  signage.setEligible(sourceVisible());
  layout();
  $('analyze').disabled=!!captureRequest||(busy&&!analysisRequested)||(connected&&(!roiReady||!!calibration));
  $('analyze').textContent=captureRequest?'Conectando cámara…':analysisRequested?'Pausar análisis':connected?'Iniciar análisis':'Arrancar cámara y análisis';
  $('analysis-health').textContent=analyzing?'Analizando Puerta Cam':suspendedReason?'Esperando vídeo · reanudación automática':analysisRequested?(modelPhase||'Preparando detector…'):!connected?'Cámara sin conectar':!roiReady?'Marca la zona de cámara':modelError?'Detector no disponible · reintenta Iniciar análisis':'Análisis en pausa';
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
  if(!cleanStreet.enabled)tabletIdle(analyzing?'Esperando un paso':'Análisis en pausa');
}
function pause(message){
  cancelCapture();
  clearTimeout(cameraPreviewTimer);cameraPreviewTimer=0;previewVideoTime=-1;
  xpace.cameraOff();
  xpace.trafficOff();
  scooterTracks.clear();
  // Pausing detection returns to the normal loop; it is not a screen power-off.
  analysisRequested=false;suspendedReason=null;clearTimeout(recoveryTimer);recoveryTimer=0;
  twins.cancelOriginal();
  analyzing=false;generation++;clearTimeout(loopTimer);trackingOverlay.clear();cleanStreet.reset();tracker.resetPresence();clearCapture();controls();
  frameContext.clearRect(0,0,frame.width,frame.height);
  if(message)status(message);
}
function scheduleRecovery(){
  if(recoveryTimer||!analysisRequested||!suspendedReason)return;
  recoveryTimer=setTimeout(()=>{
    recoveryTimer=0;
    if(!analysisRequested||!suspendedReason||!stream)return;
    if(sourceVisible()&&!sourceMuted&&scene.paused===true&&!sourcePlayPending&&performance.now()>=sourcePlayRetryAt){
      const request={},source=stream;sourcePlayPending=request;sourcePlayRetryAt=performance.now()+2000;
      Promise.resolve().then(()=>{if(stream===source&&analysisRequested&&sourceVisible()&&!sourceMuted)return scene.play();})
        .catch(()=>{if(stream===source&&analysisRequested)status('Esperando que el navegador reanude el vídeo compartido. Puedes pausar o reconectar si la fuente no vuelve.');})
        .finally(()=>{if(sourcePlayPending===request)sourcePlayPending=null;});
    }
    if(sourceVisible()&&!sourceMuted&&!busy&&!inferences&&!calibration&&roiReady&&scene.readyState>=2&&scene.currentTime!==recoveryVideoTime){
      // A fresh frame in the same authorized source is required. Never infer
      // on the last frozen frame or silently acquire another capture source.
      void startAnalysis(true);
    }else scheduleRecovery();
  },500);
}
function suspendAnalysis(reason,message){
  // Choosing the shared tab can hide this page. That is not a cancellation of
  // the user's picker; availability is checked again before inference starts.
  if(captureRequest&&!analysisRequested){controls();return;}
  const wanted=analysisRequested;
  pause(wanted?message:undefined);
  if(!wanted)return;
  analysisRequested=true;suspendedReason=reason;recoveryVideoTime=scene.currentTime;
  controls();scheduleRecovery();
}
function disconnect(message='Desconectado. Capturas y vídeo borrados de la vista.'){
  pause();
  tracker.reset();directions.clearGeometry();
  if(stream)for(const track of stream.getTracks())track.stop();
  stream=null;scene.srcObject=null;scene.removeAttribute('src');scene.load();
  frame.width=1;frame.height=1;sourceSize='';sourceDimensions=null;calibrationDimensions=null;lastVideoTime=-1;sourceMuted=false;sourcePlayPending=null;sourcePlayRetryAt=0;
  roiReady=false;tabletReady=false;signageReady=false;calibration=null;points=[];
  stage.classList.remove('calibrating');stage.style.aspectRatio='16 / 9';
  $('tablet').hidden=true;$('signage').hidden=true;$('roi').hidden=true;$('markers').replaceChildren();
  $('empty-scene').hidden=false;$('source-info').textContent='PLAYER VIRTUAL · SIN VÍDEO EN DIRECTO';
  $('calibration-status').textContent='Encuadre pendiente de confirmar';
  $('coordinates').hidden=true;controls();status(message);
}
function layout(){
  trackingOverlay.layoutLabels();
  cleanStreet.layout();
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

function stopSelected(selected){for(const track of selected?.getTracks()||[])track.stop();}
function cancelCapture(){
  const request=captureRequest;if(!request)return;
  captureRequest=null;request.cancel();stopSelected(request.selected);
  if(request.selected&&scene.srcObject===request.selected){scene.srcObject=null;scene.removeAttribute('src');scene.load();}
}
async function waitForCaptureDimensions(request){
  if(scene.videoWidth&&scene.videoHeight)return true;
  let ready,timer;
  const dimensions=new Promise(resolve=>{
    ready=()=>{if(scene.videoWidth&&scene.videoHeight)resolve(true);};
    scene.addEventListener('loadedmetadata',ready);scene.addEventListener('resize',ready);
    timer=setTimeout(()=>resolve(false),10000);
    ready();
  });
  try{return await Promise.race([dimensions,request.cancelled]);}
  finally{clearTimeout(timer);scene.removeEventListener('loadedmetadata',ready);scene.removeEventListener('resize',ready);}
}
async function connectSource(startWhenReady=false){
  if(stream||captureRequest||busy)return;
  if(!navigator.mediaDevices?.getDisplayMedia){status('Este navegador no permite compartir pestañas aquí. Abre esta vista en Chrome de escritorio, por HTTPS o localhost.');return;}
  const request={selected:null};request.cancelled=new Promise(resolve=>{request.cancel=()=>resolve(false);});
  captureRequest=request;controls();
  try{
    // Called directly from the click, before any awaited work. The browser/user
    // chooses the source on every new connection; no capture permission is saved.
    const selected=await navigator.mediaDevices.getDisplayMedia({video:{displaySurface:'browser',frameRate:{ideal:10,max:15}},audio:false,monitorTypeSurfaces:'exclude',selfBrowserSurface:'exclude',surfaceSwitching:'exclude',systemAudio:'exclude'});
    request.selected=selected;
    if(captureRequest!==request){stopSelected(selected);return;}
    const track=selected.getVideoTracks()[0];
    if(track?.getSettings().displaySurface!=='browser'){
      stopSelected(selected);
      status('Selecciona una pestaña de Chrome, no una ventana ni la pantalla completa.');return;
    }
    track.addEventListener('ended',()=>{
      if(stream===selected)disconnect('Se ha terminado de compartir. La captura se ha borrado.');
      else if(captureRequest===request){cancelCapture();controls();status('Se ha terminado de compartir antes de arrancar el análisis.');}
    },{once:true});
    track.addEventListener('mute',()=>{if(stream!==selected)return;sourceMuted=true;suspendAnalysis('source','Puerta Cam está interrumpida temporalmente. El análisis se reanudará cuando lleguen fotogramas nuevos.');});
    track.addEventListener('unmute',()=>{if(stream!==selected)return;sourceMuted=false;scheduleRecovery();});
    scene.srcObject=selected;
    const playing=await Promise.race([Promise.resolve(scene.play()).then(()=>true),request.cancelled]);
    if(!playing||captureRequest!==request)return;
    if(startWhenReady)await waitForCaptureDimensions(request);
    if(captureRequest!==request)return;
    captureRequest=null;stream=selected;sourceMuted=track.muted===true;generation++;roiReady=false;tabletReady=false;signageReady=false;
    tracker.reset();directions.clearGeometry();
    passages.reset();resetAudience();renderCounts();
    $('empty-scene').hidden=true;
    updateSourceSize();
    if(startWhenReady&&roiReady){await startAnalysis();return;}
    if(startWhenReady&&!roiReady&&sourceDimensions){
      startCalibration('roi');
      status('Cámara conectada sin un encuadre compatible completo. Marca las esquinas superior izquierda e inferior derecha de Puerta Cam; después pulsa Iniciar análisis. El iPad y la pantalla son opcionales.');
    }else status(roiReady?'Preset cargado. Comprueba que la zona de cámara coincide con la vista; pulsa Iniciar análisis cuando quieras.':!sourceDimensions?'Pestaña conectada; esperando vídeo para recuperar el encuadre. Cuando esté listo, pulsa Iniciar análisis.':'Pestaña conectada. Marca la zona de cámara y pulsa Iniciar análisis. El iPad y la pantalla son opcionales. No se analiza todavía.');
  }catch(error){
    // A cancelled/older picker must never disconnect a newer capture or replace
    // its status. Its tracks are stopped when the browser eventually returns.
    if(captureRequest!==request&&(!request.selected||stream!==request.selected))return;
    if(captureRequest===request)cancelCapture();
    if(stream===request.selected&&stream)disconnect();
    status(error.name==='NotAllowedError'?'No se ha concedido permiso para compartir. Puedes volver a intentarlo.':`No se pudo compartir la pestaña (${error.name||'error del navegador'}).`);
  }finally{if(captureRequest===request)captureRequest=null;controls();}
}
$('connect').addEventListener('click',()=>connectSource());
$('stop').addEventListener('click',()=>disconnect());
$('reset-counts').addEventListener('click',()=>{
  // Do not reset tracking, cancel an inference or discard the archive outbox.
  // Otherwise a person already in view would immediately count again.
  passages.reset();resetAudience();renderCounts();scooterTracks.clear();twins.cancelOriginal();clearCapture('Contadores reiniciados');
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
  const changed=sourceSize&&sourceSize!==next,wasCalibrating=!!calibration;
  if(sourceSize && sourceSize!==next){
    const reference=calibrationDimensions||sourceDimensions;
    const proportional=reference&&Math.abs((reference[0]/reference[1])/(dimensions[0]/dimensions[1])-1)<=.005;
    if(proportional&&!calibration)suspendAnalysis('resize','La resolución ha cambiado proporcionalmente. Se conserva el encuadre y se reanudará al llegar vídeo nuevo.');
    else pause('La fuente ha cambiado de formato o interrumpido una marcación. Comprueba las superficies antes de iniciar. El preset anterior se conserva.');
    tracker.reset();directions.clearGeometry();
    calibration=null;points=[];stage.classList.remove('calibrating');$('markers').replaceChildren();$('coordinates').hidden=true;
    if(!proportional){roiReady=false;tabletReady=false;signageReady=false;calibrationDimensions=null;$('calibration-status').textContent='Formato nuevo: repite el encuadre';}
  }
  sourceDimensions=dimensions;
  if((first&&!calibration)||(changed&&!wasCalibrating&&!roiReady&&!tabletReady&&!signageReady))restorePreset();
  sourceSize=next;stage.style.aspectRatio=`${scene.videoWidth} / ${scene.videoHeight}`;
  $('source-info').textContent=`PESTAÑA COMPARTIDA · ${next}`;layout();controls();
}
scene.addEventListener('resize',updateSourceSize);

function startCalibration(kind){
  if(!stream||!sourceDimensions){status('Espera a que la pestaña compartida tenga vídeo antes de marcar.');return;}
  pause();calibration=kind;points=[];stage.classList.add('calibrating');$('markers').replaceChildren();
  stage.scrollIntoView?.({block:'center',behavior:'instant'});
  $('coordinates').hidden=true;
  if(kind==='roi'){tracker.reset();directions.clearGeometry();roiReady=false;$('roi').hidden=true;status('Marca dos puntos en la escena: esquina superior izquierda e inferior derecha del vídeo de Puerta Cam. No incluyas el resto de la tienda.');}
  else if(kind==='direction'){status('Marca dos puntos dentro de la cámara: primero el fondo de la calle, después el lado cercano a la cámara. Se guardará este sentido.');}
  else if(kind==='signage'){signageReady=false;$('signage').hidden=true;status('Marca las cuatro esquinas interiores de la pantalla grande: superior izquierda → superior derecha → inferior derecha → inferior izquierda.');}
  else{tabletReady=false;$('tablet').hidden=true;status('Marca las cuatro esquinas interiores del iPad: superior izquierda → superior derecha → inferior derecha → inferior izquierda.');}
  $('calibration-status').textContent=kind==='direction'?'Marcando sentido: fondo → cámara (0 / 2)':kind==='roi'?'Marcando cámara: 0 / 2':`Marcando ${kind==='signage'?'cartelería':'iPad'}: 0 / 4`;
  controls();
}
$('set-direction').addEventListener('click',()=>{if(roiReady)startCalibration('direction');});
$('export-audience').addEventListener('click',()=>{
  const data=JSON.stringify(sessionAudience(),null,2),url=URL.createObjectURL(new Blob([data],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=`xtore-audience-${audienceSessionId}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
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
  const required=['roi','direction'].includes(calibration)?2:4;
  $('calibration-status').textContent=`Marcando ${calibration==='direction'?'sentido fondo → cámara':calibration==='roi'?'cámara':calibration==='signage'?'cartelería':'iPad'}: ${points.length} / ${required}`;
  if(points.length!==required)return;
  if(calibration==='direction'){
    const axis=points.map(p=>[(p[0]-roi[0])/roi[2],(p[1]-roi[1])/roi[3]]);
    if(!validDirectionAxis(axis)){startCalibration('direction');status('Marca fondo y cámara dentro del recuadro, suficientemente separados.');return;}
    directionAxis=axis;directions.clearGeometry();renderCounts();
  }else if(calibration==='roi'){
    const candidate=[points[0][0],points[0][1],points[1][0]-points[0][0],points[1][1]-points[0][1]];
    if(!validRect(candidate)){startCalibration('roi');status('El recuadro no es válido. Marca primero arriba a la izquierda y después abajo a la derecha.');return;}
    roi=candidate;roiReady=true;directionAxis=DEFAULT_DIRECTION_AXIS.map(p=>[...p]);
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
  $('calibration-status').textContent=`Cámara: ${roiReady?'marcada':'pendiente'} · iPad: ${tabletReady?'marcado':'opcional, sin colocar'} · cartelería: ${signageReady?'marcada':'opcional, sin colocar'}`;
  layout();controls();status(roiReady?'Cámara lista. Pulsa Iniciar análisis; el player virtual ya está disponible. Si giras o acercas el gemelo, pausa y vuelve a marcar.':'Marca la zona de cámara antes de iniciar el análisis. El iPad y la pantalla son opcionales.');
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
  if(r.some((value,i)=>Math.abs(value-roi[i])>.00001)){tracker.reset();directions.clearGeometry();}
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
  modelError='';const runtime=window;
  $('prepare-model').disabled=true;
  modelPromise=loadDetectorModel({getTF:()=>runtime.tf,getCoco:()=>runtime.cocoSsd,loadScript,onProgress:phase=>{
    modelPhase=phase;$('model-status').textContent=phase;
    if(analysisRequested)$('analysis-health').textContent=phase;
  }}).then(loaded=>{
    model=loaded;modelPhase='';
    $('model-status').textContent=`Detector listo · COCO-SSD 2.2.3 / MobileNet v2 · ${window.tf.getBackend()}. Pendiente de validar precisión con esta cámara.`;
    $('prepare-model').textContent='Detector preparado';return model;
  }).catch(error=>{
    modelPromise=null;modelPhase='';modelError=error.message||'No se pudo preparar el detector.';
    $('prepare-model').disabled=false;$('prepare-model').textContent='Reintentar preparar detector';
    $('model-status').textContent=modelError;throw error;
  });
  return modelPromise;
}
$('prepare-model').addEventListener('click',()=>{prepareModel().catch(()=>{});});
async function startAnalysis(recovering=false){
  if(!stream||!roiReady||calibration)return;
  if(recovering&&(!analysisRequested||!suspendedReason))return;
  analysisRequested=true;
  if(!sourceVisible()||sourceMuted){suspendAnalysis('source','Esperando que la vista y Puerta Cam estén disponibles. Se reanudará automáticamente.');return;}
  suspendedReason=null;clearTimeout(recoveryTimer);recoveryTimer=0;
  const token=++generation;busy=true;controls();
  previewCamera(token);
  try{
    await prepareModel();
    if(token!==generation||!stream)return;
    if(!sourceVisible()||sourceMuted){suspendAnalysis('source','Esperando vídeo disponible; el análisis se reanudará automáticamente.');return;}
    analyzing=true;lastVideoTime=-1;lastFrameAt=performance.now();
    history.sync();
    status('Analizando solo Puerta Cam. Rectángulos por trayectoria; margen de pérdida de 1,5 s. Vehículos automáticos: 2 s adicionales de contenido tras ese margen. H oculta personas solo en el previo; el iPad y el detector usan el original. Capturas de 6 s, sin repetir conteo.');
    if(!cleanStreet.enabled)tabletIdle();loop(token);previewCamera(token);
  }catch{if(token===generation)pause(`No se ha iniciado el análisis. ${modelError} Pulsa Iniciar análisis para reintentar; la cámara y el encuadre se conservan.`);}
  finally{busy=false;controls();}
}
$('analyze').addEventListener('click',async()=>{
  if(analysisRequested){pause('Análisis en pausa manual. No se reanudará solo; pulsa Iniciar análisis cuando quieras.');return;}
  if(captureRequest||busy)return;
  if(!stream){await connectSource(true);return;}
  await startAnalysis();
});
async function loop(token){
  if(!analyzing||token!==generation||!stream)return;
  const iterationStart=performance.now();
  try{
      const now=performance.now();
    if(scene.readyState<2||scene.currentTime===lastVideoTime){
      if(now-lastFrameAt>3000){suspendAnalysis('frames','No llegan fotogramas nuevos. Esperando Puerta Cam; el análisis se reanudará automáticamente al recuperarse.');return;}
    }else{
      lastVideoTime=scene.currentTime;lastFrameAt=now;
      const [x,y,w,h]=roi, sw=scene.videoWidth,sh=scene.videoHeight;
      const width=Math.max(1,Math.round(Math.min(960,w*sw))),height=Math.max(1,Math.round(width*h*sh/(w*sw)));
      if(frame.width!==width||frame.height!==height){frame.width=width;frame.height=height;}
      frameContext.drawImage(scene,x*sw,y*sh,w*sw,h*sh,0,0,width,height);
      const start=performance.now(),threshold=Number($('confidence').value)/100,bikeThreshold=Number($('bicycle-confidence').value||40)/100;
      let predictions;inferences++;
      try{predictions=await detectObjects(model,window.tf,frame,Math.min(.25,threshold,bikeThreshold));}finally{inferences--;}
      if(!analyzing||token!==generation)return;
      const events=performance.now()-now<PRESENCE_GRACE?tracker.update(predictions,now,width,height,{person:threshold,car:threshold,motorcycle:threshold,bicycle:bikeThreshold}):[];
      if(events.length){passages.add(events);queueHistory(events);}
      const directionChanged=directions.update(tracker.visible(now),events,now,directionAxis);
      if(events.length||directionChanged)renderCounts();
      $('source-info').textContent=`PUERTA CAM · ${width} × ${height} · ${Math.round(performance.now()-start)} ms / análisis`;
      const bikes=predictions.filter(p=>p.class==='bicycle'),best=bikes.reduce((score,p)=>Math.max(score,p.score),0);
      $('detection-status').textContent=`Bicis candidatas: ${bikes.length} · mejor ${Math.round(best*100)} % · umbral ${Math.round(bikeThreshold*100)} % · ${Math.round(performance.now()-start)} ms`;
      if(events.length)showCapture(events);
      cleanStreet.update(frame,predictions,tracker.visible(performance.now()),now);
    }
    const observedNow=performance.now(),visible=tracker.visible(observedNow);
    trackingOverlay.render(visible);signage.presence(visible);
    scooterTracks.update(visible);
    xpace.traffic(scooterTracks.annotate(visible),observedNow-lastFrameAt);
    const views=cleanStreet.frames();
    if(views)void xpace.camera(views.clean,visible,performance.now()-views.capturedAt,passages.counts,{original:views.original,modified:true});
  }catch{
    if(token!==generation||!analyzing)return;
    pause('El detector ha fallado. La captura se ha borrado; revisa la fuente y vuelve a iniciar.');return;
  }
  if(analyzing&&token===generation)loopTimer=setTimeout(()=>loop(token),Math.max(0,125-(performance.now()-iterationStart)));
}
// Retry fresh analyzed pairs independently of inference: its first send may
// have been throttled by a raw preview. Retain the original capture timestamp;
// only a new live crop can replace an expired pair while inference is pending.
function previewCamera(token){
  clearTimeout(cameraPreviewTimer);
  if(!analysisRequested||token!==generation||!stream)return;
  const views=xpace.cameraOnly?cleanStreet.frames():null;
  if(xpace.cameraOnly&&views&&sourceVisible()&&!sourceMuted&&!calibration){
    const at=performance.now();
    void xpace.camera(views.clean,tracker.visible(at),at-views.capturedAt,passages.counts,{original:views.original,modified:true});
  }else if(xpace.cameraOnly&&!views&&sourceVisible()&&!sourceMuted&&!calibration&&roiReady&&scene.readyState>=2&&scene.currentTime!==previewVideoTime){
    const at=performance.now();previewVideoTime=scene.currentTime;
    const [x,y,w,h]=roi,sw=scene.videoWidth,sh=scene.videoHeight;
    const width=Math.max(1,Math.round(Math.min(480,w*sw))),height=Math.max(1,Math.round(width*h*sh/(w*sw)));
    cameraPreview.width=width;cameraPreview.height=height;
    cameraPreview.getContext('2d').drawImage(scene,x*sw,y*sh,w*sw,h*sh,0,0,width,height);
    void xpace.camera(cameraPreview,tracker.visible(at),performance.now()-at,passages.counts);
  }
  cameraPreviewTimer=setTimeout(()=>previewCamera(token),250);
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
  if(!cleanStreet.enabled){
  const ctx=tablet.getContext('2d');ctx.fillStyle='#09131b';ctx.fillRect(0,0,640,480);
  const scale=Math.min(612/capture.width,390/capture.height),dw=capture.width*scale,dh=capture.height*scale;
  ctx.drawImage(capture,(640-dw)/2,16+(390-dh)/2,dw,dh);
  ctx.strokeStyle=main.color;ctx.lineWidth=16;ctx.strokeRect(8,8,624,464);
  ctx.fillStyle='#fff';ctx.textAlign='center';ctx.font='bold 25px sans-serif';ctx.fillText(`${main.label} · ${new Date().toLocaleTimeString('es-ES')}`,320,446);
  }
  capture.hidden=cleanStreet.enabled;$('capture-empty').hidden=!cleanStreet.enabled;$('capture').style.borderColor=main.color;
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
document.addEventListener('visibilitychange',()=>{if(!sourceVisible())suspendAnalysis('hidden','Vista oculta: no se procesan imágenes. Al volver se reanudará el análisis si seguía activo.');else{twins.checkExpiry();controls();scheduleRecovery();}});
window.addEventListener('beforeunload',event=>{if(history.pending.length||history.lost){event.preventDefault();event.returnValue='';}});
window.addEventListener('pagehide',()=>{clearTimeout(historyTimer);twins.clear();disconnect();});
tabletIdle();renderCounts();controls();
