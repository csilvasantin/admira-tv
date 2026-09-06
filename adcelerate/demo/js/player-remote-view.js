/* The remote owns a focus session, never a camera movement or a physical device. */
(function(root){
  'use strict';
  function timeLabel(seconds){const n=Math.max(0,Math.floor(Number(seconds)||0));return Math.floor(n/60)+':'+String(n%60).padStart(2,'0');}
  function create({element,send,onOpen=()=>{},onClose=()=>{}}){
    const el=id=>element.querySelector('#'+id);
    let session=null,serial=0,current=null,launcher=null,catalogSignature='';
    function command(action,fields={}){if(!session)return false;send({...fields,action,...session});return true;}
    function close(){if(!session)return;command('close');const last=current;session=null;current=null;element.classList.add('hidden');onClose(last);launcher?.focus?.({preventScroll:true});}
    function open(surface){if(!surface)return false;if(session)close();launcher=document.activeElement;session={screenId:surface.id,requestId:++serial};current=null;catalogSignature='';
      el('remote-screen').textContent=surface.label;el('remote-content-title').textContent='Conectando con el player…';el('remote-status').textContent='Preparando mando';el('remote-mode').textContent='Contenido de esta pantalla';
      setPending(true);element.classList.remove('hidden');element.tabIndex=-1;onOpen();element.focus({preventScroll:true});command('open');return true;
    }
    element.querySelectorAll('[data-player-action]').forEach(button=>button.addEventListener('click',()=>command(button.id==='remote-play'&&['paused','blocked','error'].includes(current?.status)?'play':button.dataset.playerAction)));
    el('remote-close').onclick=close;
    el('remote-preview').onclick=()=>command('preview',{expanded:!current?.expanded});
    el('remote-mute').onclick=()=>command('mute',{muted:!current?.muted});
    el('remote-volume').oninput=e=>command('volume',{volume:Number(e.target.value)});
    el('remote-seek').onchange=e=>command('seek',{seconds:Number(e.target.value)});
    el('remote-loop').onchange=e=>command('loop',{loop:e.target.value});
    el('remote-content').onchange=e=>command('content',{contentId:e.target.value});
    el('remote-playlist').onchange=e=>command('playlist',{playlistId:e.target.value});
    function setPending(pending){element.querySelectorAll('[data-player-action]').forEach(button=>{button.disabled=pending;});for(const id of ['remote-seek','remote-content','remote-playlist','remote-loop','remote-mute','remote-volume'])el(id).disabled=pending;}
    function options(node,items,selected){node.replaceChildren(...items.map(item=>{const o=document.createElement('option');o.value=item.id;o.textContent=item.title;return o;}));node.value=selected;}
    function accept(state){if(!session||!state||state.requestId!==session.requestId||state.screenId!==session.screenId)return false;current=state;setPending(state.status==='loading');
      el('remote-preview').textContent=state.expanded?'Ver en el quiosco':'Ampliar pantalla';el('remote-preview').setAttribute('aria-pressed',String(!!state.expanded));
      el('remote-content-title').textContent=state.title||'Contenido de la pantalla';el('remote-mode').textContent=state.mode==='local'?'Sesión local · solo esta pantalla':'Programación del canal';
      el('remote-status').textContent=({loading:'Cargando contenido…',playing:'Reproduciendo',paused:'En pausa',blocked:'Pulsa Reproducir en la imagen para autorizar el vídeo.',error:'No se pudo reproducir. Prueba otro contenido.'})[state.status]||'';
      const canPlay=['paused','blocked','error'].includes(state.status);el('remote-play').textContent=canPlay?'▶':'Ⅱ';el('remote-play').setAttribute('aria-label',canPlay?'Reproducir':'Pausar');
      el('remote-position').textContent=timeLabel(state.position)+' / '+timeLabel(state.duration);
      el('remote-index').textContent=state.total?(state.index+1)+' / '+state.total:'—';
      if(document.activeElement!==el('remote-seek'))el('remote-seek').value=state.position;el('remote-seek').max=state.duration||1;el('remote-seek').disabled=state.status==='loading'||!(state.duration>0);
      if(document.activeElement!==el('remote-volume'))el('remote-volume').value=state.volume;
      el('remote-mute').textContent=state.muted?'Activar audio':'Silenciar';el('remote-mute').setAttribute('aria-pressed',String(!state.muted));el('remote-loop').value=state.loop;
      const signature=JSON.stringify([state.catalog,state.playlists]);if(signature!==catalogSignature){catalogSignature=signature;options(el('remote-content'),state.catalog||[],state.contentId);options(el('remote-playlist'),state.playlists||[],state.playlistId);}
      if(document.activeElement!==el('remote-content'))el('remote-content').value=state.contentId;
      if(document.activeElement!==el('remote-playlist'))el('remote-playlist').value=state.playlistId;
      el('remote-content').disabled=state.status==='loading'||!state.catalog?.length;el('remote-playlist').disabled=state.status==='loading'||!state.playlists?.length;
      return true;
    }
    return {open,close,accept,command,isOpen:()=>!!session,getState:()=>current,getSession:()=>session&&({...session})};
  }
  const api={create,timeLabel};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PlayerRemoteView=api;
})(typeof globalThis!=='undefined'?globalThis:this);
