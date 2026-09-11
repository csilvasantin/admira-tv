import {SignageBridge,playerURL} from './signage.mjs';
import {PlayerDataBridge} from './player-data.mjs';
const LABEL={none:'Bucle general',person:'Persona',car:'Coche',motorcycle:'Moto',bicycle:'Bici'};
export function installSignageUI({document,window}){
  const $=id=>document.getElementById(id);
  let iframe=null,bridge=null,dataBridge=null,eligible=false,emissionTimer=0,emissionSeen=false,mediaReported=false,manuallyOff=false,failed=false;
  function controls(){$('start-signage').disabled=!eligible||!!iframe;$('stop-signage').disabled=!iframe;}
  function stop(message='El bucle arranca al conectar la vista y marcar la pantalla grande.'){
    clearTimeout(emissionTimer);bridge?.stop();bridge=null;dataBridge?.stop();dataBridge=null;
    if(iframe){iframe.remove();iframe=null;}
    $('signage-idle-label').textContent=failed?'Player detenido por error':manuallyOff?'Player apagado':'Player en espera';
    $('signage-idle').hidden=false;$('signage-status').textContent=message;controls();
    $('signage-media').textContent='Sin emisión activa';
    $('signage-command').textContent='Canal de órdenes cerrado';
  }
  function start(){
    if(!eligible||iframe||document.hidden)return;
    iframe=document.createElement('iframe');
    iframe.title='Player condicionado Admira.tv · pantalla virtual';
    // Opaque origin even when Xtore is on admira.tv. No parent DOM, cookies or
    // shared localStorage access; the player must tolerate unavailable storage.
    iframe.setAttribute('sandbox','allow-scripts');
    iframe.setAttribute('allow',"autoplay; camera 'none'; microphone 'none'; geolocation 'none'");
    iframe.referrerPolicy='no-referrer';iframe.tabIndex=-1;
    const loadingFrame=iframe;let loaded=false;
    iframe.addEventListener('load',()=>{
      if(iframe!==loadingFrame)return;
      if(loaded){failed=true;stop('El player intentó navegar. Se ha cerrado su canal de órdenes.');return;}loaded=true;
    });
    iframe.src=playerURL(`xtore-virtual-${crypto.randomUUID()}`,window.location?.origin);
    $('signage').append(iframe);$('signage-idle').hidden=true;
    dataBridge=new PlayerDataBridge({target:iframe.contentWindow});
    emissionSeen=false;mediaReported=false;
    emissionTimer=setTimeout(()=>{if(!emissionSeen){failed=true;stop('Sin emisión confirmada en 30 s. Revisa catálogo, reglas y compatibilidad del player aislado.');}},30000);
    bridge=new SignageBridge({target:iframe.contentWindow,onFailure:message=>{failed=true;stop(message);},onState:state=>{
        if(state.type==='ack'){
          $('signage-command').textContent=`${LABEL[state.kind]} · orden aceptada${state.kind==='none'?'':', vigencia 6 s'}. No confirma una creatividad concreta.`;
          // An ACK is control-plane evidence, not a new playback event. The
          // neutral ACK after pause/expiry must not erase confirmed playback.
          if(!mediaReported)$('signage-status').textContent='Canal conectado · esperando emisión';
        }else if(state.phase==='selected'){
          mediaReported=true;
          $('signage-status').textContent='Cargando contenido · emisión pendiente';
          $('signage-media').textContent='Pieza seleccionada; todavía no confirma reproducción ni carga.';
        }else{
          mediaReported=true;
          emissionSeen=true;clearTimeout(emissionTimer);
          $('signage-status').textContent=`${state.loop?'Bucle general':'Contenido condicionado'} · ${state.phase==='playing'?'reproduciendo':state.phase==='poster-loaded'?'miniatura de respaldo':'interactivo cargado'}`;
          $('signage-media').textContent=state.phase==='playing'?'El player confirma vídeo/audio iniciado o imagen cargada.':state.phase==='poster-loaded'?'Miniatura cargada; este vídeo no ha confirmado reproducción.':'Evento de carga del interactivo recibido; no confirma contenido visible ni reproducción interna.';
        }
      }});
    $('signage-status').textContent='Cargando player · comprobando canal de órdenes…';
    $('signage-media').textContent='Sin confirmación de emisión';
    $('signage-command').textContent='Comprobando canal de órdenes…';
    bridge.start();controls();
  }
  $('start-signage').addEventListener('click',()=>{manuallyOff=false;failed=false;start();});
  $('stop-signage').addEventListener('click',()=>{manuallyOff=true;stop('Player apagado manualmente. Pulsa Reanudar bucle para volver.');});
  window.addEventListener('message',event=>{bridge?.receive(event);void dataBridge?.receive(event);});
  controls();
  return {setEligible(value){eligible=value;if(!value&&iframe)stop();else if(value&&!iframe&&!manuallyOff&&!failed)start();controls();},stop,neutral:()=>bridge?.neutral(),passage:events=>bridge?.passage(events)};
}
