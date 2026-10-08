export const DIGITAL_TWIN_URL='https://digitaltwin.ieu.ai/';
export function demoReadiness(s){
  const checks={camera:!!s.cameraFresh,framing:!!s.framing,detector:!!s.detector,player:!!s.player?.playing,audio:s.player?.audioEnabled===true};
  const ready=Object.values(checks).every(Boolean)&&s.analyzing===true;
  let message=ready?'Listo para enseñar · análisis y player activos':!checks.camera?'Abre Store → Entrada → Puerta Cam y comparte esa pestaña':!checks.framing?(s.calibrating&&s.statusMessage?s.statusMessage:'Marca Puerta Cam o recupera un encuadre compatible'):!checks.detector?(s.modelError?'Reintenta preparar el detector':'Preparando detector…'):!s.analyzing?(s.analysisRequested?'Esperando que se recupere el análisis…':'Pulsa Iniciar análisis para activar la demo'):s.player?.audioBlocked?'Pulsa «Toca para activar el sonido» dentro del player':!checks.player?'Esperando reproducción · revisa el player':!checks.audio?'Habilita el sonido en el player':'Comprobando la demo…';
  return {ready,checks,message};
}
export function installDemoSetup({document,window,snapshot,prepareDetector,resumePlayer,share,startAnalysis,now=()=>Date.now(),schedule=setInterval,cancel=clearInterval}){
  const $=id=>document.getElementById(id);
  let twin=null,preparing=false,prepared=false,lastFrameTime=-1,lastFrameAt=-Infinity,shareMessage='';
  function render(){
    const s=snapshot();
    if(s.connected&&Number.isFinite(s.videoTime)&&s.videoTime!==lastFrameTime){lastFrameTime=s.videoTime;lastFrameAt=now();}
    if(!s.connected){lastFrameTime=-1;lastFrameAt=-Infinity;}
    const state=demoReadiness({...s,cameraFresh:s.connected&&!s.sourceMuted&&s.videoReady&&now()-lastFrameAt<1500});
    $('demo-ready').textContent=state.ready?'Listo para enseñar':'Preparación pendiente';
    $('demo-ready').classList.toggle('live',state.ready);
    $('demo-next').textContent=s.capturing?'Elige la pestaña de Puerta Cam en Chrome; puedes cancelar.':!s.connected&&shareMessage?shareMessage:state.message;
    const labels={camera:'Cámara',framing:'Encuadre',detector:'Detector',player:'Player',audio:'Sonido habilitado'};
    for(const [key,ok] of Object.entries(state.checks)){
      const node=$('demo-check-'+key);node.textContent=(ok?'✓ ':'○ ')+labels[key];node.classList.toggle('ready',ok);
    }
    $('prepare-demo').disabled=preparing;
    $('prepare-demo').textContent=preparing?'Preparando detector…':prepared?'Preparar de nuevo':'Preparar demo';
    $('demo-share').disabled=!!s.capturing||!!s.connected;
    $('demo-share').textContent=s.capturing?'Seleccionando pestaña…':s.connected?'Pestaña compartida':'Compartir Puerta Cam';
    $('demo-retry-player').hidden=s.player?.running===true;
    $('demo-retry-detector').hidden=!s.modelError;
    $('demo-review').hidden=!s.connected||state.checks.framing;
    $('demo-start-analysis').hidden=!s.connected||!state.checks.framing||!s.detector||s.analyzing||s.analysisRequested;
    return state;
  }
  async function prepare(){
    if(preparing)return;
    shareMessage='';
    // Open synchronously from the gesture. Reuse only this setup's named tab.
    // IEU selects its own office/camera; no invented deep-link or device command.
    if(!twin||twin.closed)twin=window.open(DIGITAL_TWIN_URL,'xtore-demo-digitaltwin');
    else twin.focus();
    $('demo-open-status').textContent=twin?'En Digital Twin: Store → Entrada → Puerta Cam → Ver stream. Vuelve aquí para compartir la pestaña.':'No se pudo abrir Digital Twin. Usa Abrir Digital Twin en Opciones y permite su apertura.';
    resumePlayer();prepared=true;preparing=true;render();
    try{await prepareDetector();}catch{/* The detector status supplies a retry; capture remains untouched. */}
    finally{preparing=false;render();}
  }
  $('prepare-demo').addEventListener('click',prepare);
  $('demo-share').addEventListener('click',async()=>{
    shareMessage='';
    try{await share();}catch{shareMessage='No se pudo compartir. Vuelve a esta pestaña e inténtalo de nuevo.';}
    finally{const s=snapshot();if(!s.connected&&!s.capturing)shareMessage=s.statusMessage||shareMessage||'No se ha compartido la pestaña. Puedes volver a intentarlo.';render();}
  });
  $('demo-retry-player').addEventListener('click',()=>{resumePlayer();render();});
  $('demo-retry-detector').addEventListener('click',prepare);
  $('demo-review').addEventListener('click',()=>$('set-roi').click());
  $('demo-start-analysis').addEventListener('click',()=>startAnalysis());
  const timer=schedule(render,500);timer?.unref?.();
  window.addEventListener('pagehide',()=>cancel(timer));
  render();
  return {prepare,render,dispose:()=>cancel(timer)};
}
