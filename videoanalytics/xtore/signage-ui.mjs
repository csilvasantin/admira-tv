import {SignageBridge,playerURL} from './signage.mjs';
const LABEL={none:'Neutro',person:'Persona',car:'Coche',motorcycle:'Moto',bicycle:'Bici'};
export function installSignageUI({document,window}){
  const $=id=>document.getElementById(id);
  let iframe=null,bridge=null,eligible=false,emissionTimer=0,emissionSeen=false;
  function controls(){$('start-signage').disabled=!eligible||!!iframe;$('stop-signage').disabled=!iframe;}
  function stop(message='Player apagado · sin órdenes pendientes'){
    clearTimeout(emissionTimer);bridge?.stop();bridge=null;
    if(iframe){iframe.remove();iframe=null;}
    $('signage-idle').hidden=false;$('signage-status').textContent=message;controls();
    $('signage-media').textContent='Sin emisión activa';
  }
  $('start-signage').addEventListener('click',()=>{
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
      if(loaded){stop('El player intentó navegar. Se ha cerrado su canal de órdenes.');return;}loaded=true;
    });
    iframe.src=playerURL(`xtore-virtual-${crypto.randomUUID()}`);
    $('signage').append(iframe);$('signage-idle').hidden=true;
    emissionSeen=false;
    emissionTimer=setTimeout(()=>{if(!emissionSeen)stop('Sin emisión confirmada en 30 s. Revisa catálogo, reglas y compatibilidad del player aislado.');},30000);
    bridge=new SignageBridge({target:iframe.contentWindow,onFailure:stop,onState:state=>{
        if(state.type==='ack')$('signage-status').textContent=`${LABEL[state.kind]} · orden aceptada${state.kind==='none'?'':', vigencia 6 s'}. No confirma una creatividad concreta.`;
        else{emissionSeen=true;clearTimeout(emissionTimer);$('signage-media').textContent=`El player informa de una emisión · modo ${state.mode}.`;}
      }});
    $('signage-status').textContent='Cargando player · comprobando canal de órdenes…';
    $('signage-media').textContent='Sin confirmación de emisión';
    bridge.start();controls();
  });
  $('stop-signage').addEventListener('click',()=>stop());
  window.addEventListener('message',event=>bridge?.receive(event));
  controls();
  return {setEligible(value){eligible=value;if(!value)stop();controls();},stop,passage:events=>bridge?.passage(events)};
}
