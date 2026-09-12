import {SignageBridge,playerURL} from './signage.mjs';
import {PlayerDataBridge} from './player-data.mjs';
import {XTORE_VIRTUAL_SCREEN} from './virtual-player.mjs';
const LABEL={none:'Bucle general',person:'Persona',car:'Coche',motorcycle:'Moto',bicycle:'Bici'};
export function installSignageUI({document,window}){
  const $=id=>document.getElementById(id);
  let iframe=null,bridge=null,dataBridge=null,eligible=false,analysisEnabled=false,emissionTimer=0,emissionSeen=false,emissionDelayed=false,mediaReported=false,manuallyOff=false,failed=false;
  function controls(){$('start-signage').disabled=!eligible||!!iframe;$('stop-signage').disabled=!iframe;}
  function stop(message='Player en pausa mientras la pestaña está oculta. Al volver se reanuda la música, no el análisis.'){
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
    iframe.title='Player virtual Xtore · música y cartelería condicionada';
    // Opaque origin even when Xtore is on admira.tv. No parent DOM, cookies or
    // shared localStorage access; the player must tolerate unavailable storage.
    iframe.setAttribute('sandbox','allow-scripts');
    iframe.setAttribute('allow',"autoplay; camera 'none'; microphone 'none'; geolocation 'none'");
    iframe.referrerPolicy='no-referrer';iframe.tabIndex=0;
    const loadingFrame=iframe;let loaded=false;
    iframe.addEventListener('load',()=>{
      if(iframe!==loadingFrame)return;
      if(loaded){failed=true;stop('El player intentó navegar. Se ha cerrado su canal de órdenes.');return;}loaded=true;
    });
    iframe.src=playerURL(XTORE_VIRTUAL_SCREEN,window.location?.origin);
    $('signage').append(iframe);$('signage-idle').hidden=true;
    dataBridge=new PlayerDataBridge({target:iframe.contentWindow});
    emissionSeen=false;emissionDelayed=false;mediaReported=false;
    // Slow media is not a dead command channel. Keep the same player alive so
    // catalogue retries can recover; only actual media may confirm playback.
    emissionTimer=setTimeout(()=>{if(!emissionSeen){emissionDelayed=true;$('signage-status').textContent='Carga demorada · sin emisión confirmada. Reintentando sin apagar el player.';}},30000);
    bridge=new SignageBridge({target:iframe.contentWindow,onFailure:message=>{failed=true;stop(message);},onState:state=>{
        if(state.type==='ack'){
          $('signage-command').textContent=`${LABEL[state.kind]} · orden aceptada${state.kind==='none'?'':', vigencia 6 s'}. No confirma una creatividad concreta.`;
          // An ACK is control-plane evidence, not a new playback event. The
          // neutral ACK after pause/expiry must not erase confirmed playback.
          if(!mediaReported&&!emissionDelayed)$('signage-status').textContent='Canal conectado · esperando emisión';
        }else if(state.phase==='playlist-unavailable'){
          mediaReported=true;clearTimeout(emissionTimer);
          $('signage-status').textContent='Playlist no disponible · reintentando consulta';
          $('signage-media').textContent='No se ha podido comprobar si hay una playlist asociada. Se consulta de nuevo cada 30 s; un fallo de red no significa playlist vacía.';
        }else if(state.phase==='playlist-empty'){
          mediaReported=true;clearTimeout(emissionTimer);
          $('signage-status').textContent=state.musicSource==='playlist'?'Playlist asociada sin medios reproducibles':'Sin contenidos reproducibles con #musica';
          $('signage-media').textContent='Se reintenta la consulta. Sin playlist asociada se usan los cinco últimos audios o vídeos musicales de Pixeria con #musica; nunca se amplía a otros temas.';
        }else if(state.phase==='audio-blocked'){
          mediaReported=true;clearTimeout(emissionTimer);
          $('signage-status').textContent='Sonido pendiente de permiso del navegador';
          $('signage-media').textContent='Pulsa el botón de sonido dentro del player virtual. La pista espera: no avanza mientras el navegador bloquea el audio.';
        }else if(state.phase==='selected'){
          mediaReported=true;
          $('signage-status').textContent='Cargando contenido · emisión pendiente';
          $('signage-media').textContent='Pieza seleccionada; todavía no confirma reproducción ni carga.';
        }else{
          mediaReported=true;
          emissionSeen=true;clearTimeout(emissionTimer);
          $('signage-status').textContent=`${state.loop?(state.music?(state.musicSource==='pixeria-musica'?'Pixeria #musica · últimos 5':'Playlist musical asociada'):'Bucle general'):'Contenido condicionado'} · ${state.phase==='playing'?'reproduciendo':state.phase==='poster-loaded'?'miniatura de respaldo':'interactivo cargado'}`;
          $('signage-media').textContent=state.phase==='playing'?(state.mediaType==='audio'?(state.muted===true||state.volume===0?'Audio iniciado en silencio.':'Audio iniciado por el navegador; no confirma el volumen de los altavoces del equipo.'):'El player confirma vídeo/audio iniciado o imagen cargada.'):state.phase==='poster-loaded'?'Miniatura cargada; este vídeo no ha confirmado reproducción.':'Evento de carga del interactivo recibido; no confirma contenido visible ni reproducción interna.';
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
  return {
    setEligible(value){eligible=value;if(!value&&iframe)stop();else if(value&&!iframe&&!manuallyOff&&!failed)start();controls();},
    setAnalysis(value){
      const next=value===true;
      if(analysisEnabled&&!next)bridge?.neutral();
      analysisEnabled=next;
      $('signage-mode').textContent=next?'Audiencia activa · la música se interrumpe solo con regla y contenido disponibles.':'Música por defecto · analizador inactivo. No necesita compartir vídeo.';
    },
    stop,neutral:()=>bridge?.neutral(),passage:events=>{if(analysisEnabled)bridge?.passage(events);}
  };
}
