/* Decoded-frame handoff for the seven-screen coffee programme. */
(function(root){
  'use strict';
  function create(stage, env){
    env=env||{};
    const doc=env.document||document, raf=env.raf||requestAnimationFrame;
    const later=env.later||setTimeout;
    let hold=null, warm=null, serial=0;
    function release(v){if(!v)return;v.pause();v.removeAttribute('src');v.load();v.remove();}
    function clear(){serial++;if(hold)hold.remove();hold=null;if(warm)release(warm.video);warm=null;}
    function freeze(){
      serial++;
      const v=stage.querySelector('video');
      if(v&&v.readyState>=2&&v.videoWidth&&v.style.opacity!=='0'){
        const canvas=doc.createElement('canvas');canvas.width=v.videoWidth;canvas.height=v.videoHeight;
        try{canvas.getContext('2d').drawImage(v,0,0);if(hold)hold.remove();hold=canvas;}catch(_){/* Retain the previous held frame. */}
      }
      if(v)release(v);
      if(hold){hold.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:2;pointer-events:none;opacity:1';hold.setAttribute('aria-hidden','true');}
      return hold;
    }
    function attach(){if(hold)stage.appendChild(hold);}
    function reveal(video, valid, target){
      const turn=serial;
      function frame(now,metadata){
        if(turn!==serial||!valid())return;
        // A pre-seek frame is not the next programme frame. Wait for the
        // shared clock seek to finish, including warm videos with metadata.
        const decodedTime=metadata&&Number.isFinite(metadata.mediaTime)?metadata.mediaTime:video.currentTime;
        if(video.seeking||video.readyState<2||Math.abs(decodedTime-target())>.3){schedule();return;}
        video._admiraDecodedFrameSeen=true;video.style.opacity='1';
        const previous=hold;if(!previous)return;
        previous.style.transition='opacity 320ms linear';
        raf(()=>{if(turn===serial&&valid())previous.style.opacity='0';});
        later(()=>{previous.remove();if(hold===previous)hold=null;},360);
      }
      function schedule(){
        if(turn!==serial||!valid())return;
        if(typeof video.requestVideoFrameCallback==='function')video.requestVideoFrameCallback(frame);
        else raf(()=>raf(frame));
      }
      schedule();
    }
    function prepare(key,src){
      if(warm&&warm.key===key)return;
      if(warm)release(warm.video);
      const video=doc.createElement('video'), entry={key,video,taken:false};warm=entry;
      video.crossOrigin='anonymous';video.muted=true;video.playsInline=true;video.preload='auto';
      video.style.cssText='position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
      video.setAttribute('aria-hidden','true');doc.body.appendChild(video);
      video.addEventListener('loadeddata',()=>{
        if(entry.taken||warm!==entry)return;
        video.play().then(()=>{
          const stop=()=>{if(!entry.taken&&warm===entry)video.pause();};
          if(video.requestVideoFrameCallback)video.requestVideoFrameCallback(stop);else raf(stop);
        }).catch(()=>{});
      },{once:true});
      video.src=src;video.load();
    }
    function take(key){
      if(!warm||warm.key!==key)return null;
      const entry=warm;warm=null;entry.taken=true;entry.video.remove();entry.video.style.cssText='';return entry.video;
    }
    return {freeze,attach,reveal,prepare,take,clear};
  }
  root.AdmiraSeamlessVideo={create};
})(typeof window==='undefined'?globalThis:window);
