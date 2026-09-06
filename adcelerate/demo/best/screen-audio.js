/* Audio belongs to one inspected surface, resolved to its actual canvas player. */
(function(root){
 'use strict';
 function create({media=null,resolveMedia=null,isVisible,isVideo,isPaused=()=>false,onState=()=>{}}){
  let owner=null,revision=0,disposed=false,volume=.7;
  if(media){media.muted=true;media.volume=volume;}
  const emit=status=>{if(owner)onState({...owner,status,volume})};
  function mute(){const previous=owner;owner=null;++revision;if(media)media.muted=true;if(previous)onState({...previous,status:'muted',volume});}
  function play(){
   if(!owner||disposed)return false;
   if(!isVisible(owner.screenId)){mute();return false;}
   const selected=resolveMedia?resolveMedia(owner.screenId):media;
   if(media&&media!==selected)media.muted=true;media=selected;
   if(!media){emit('unavailable');return false;}
   const token=++revision;
   if(!isVideo(owner.screenId)){media.muted=true;emit('unavailable');return false;}
   media.volume=volume;media.muted=false;
   if(isPaused(owner.screenId)){emit('paused');return true;}
   // Called synchronously by the local retry button when browser activation is required.
   let promise;try{promise=media.play()}catch(error){promise=Promise.reject(error)}
   Promise.resolve(promise).then(()=>{if(token!==revision||!owner||disposed)return;if(!isVisible(owner.screenId)){mute();return;}emit(isPaused(owner.screenId)?'paused':'playing')},()=>{if(token!==revision||!owner||disposed)return;if(isPaused(owner.screenId)){emit('paused');return;}media.muted=true;emit('blocked');try{media.play()?.catch?.(()=>{})}catch{}});
   return true;
  }
  function command(input){
   if(disposed||!input)return false;
   if(input.action==='disable'){if(owner&&input.screenId===owner.screenId&&input.requestId===owner.requestId)mute();return true;}
   if(input.action==='enable'){
    mute();if(!isVisible(input.screenId)){onState({screenId:input.screenId,requestId:input.requestId,status:'unavailable',volume});return false;}
    if(Number.isFinite(input.volume)&&input.volume>=0&&input.volume<=1)volume=input.volume;
    owner={screenId:input.screenId,requestId:input.requestId};play();return true;
   }
   if(input.action==='volume'&&owner&&input.screenId===owner.screenId&&input.requestId===owner.requestId&&Number.isFinite(input.volume)&&input.volume>=0&&input.volume<=1){volume=input.volume;if(media)media.volume=volume;return true;}
   return false;
  }
  return {command,mute,retry:play,mediaChanged(screenId){if(!screenId||owner?.screenId===screenId)return play()},check(){if(owner&&!isVisible(owner.screenId))mute()},dispose(){mute();disposed=true},get owner(){return owner?{...owner}:null}};
 }
 const api={create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ScreenAudio=api;
})(typeof globalThis!=='undefined'?globalThis:this);
