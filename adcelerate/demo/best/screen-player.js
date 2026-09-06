/* Isolated digital-twin playback. Content is resolved from an existing trusted
 * catalog; commands never accept media URLs or write to an external player. */
(function(root){
 'use strict';
 function create({items,playlists=[],createVideo,createImage,onState=()=>{},onMedia=()=>{},timer=null,initialIndex=0,initialTime=0}){
  const clock=timer||{now:()=>Date.now(),setTimeout:(f,t)=>setTimeout(f,t),clearTimeout:t=>clearTimeout(t)};
  const catalog=new Map(items.filter(i=>i&&typeof i.id==='string'&&i.id&&['video','image'].includes(i.type)&&typeof i.url==='string').map(i=>[i.id,{...i}]));
  const lists=new Map([['scheduled',[...catalog.keys()]],...playlists.map(p=>[p.id,p.items.filter(id=>catalog.has(id))])]);
  const media=createVideo();media.muted=true;media.volume=.7;media.playsInline=true;media.preload='auto';media.crossOrigin='anonymous';
  let queue=lists.get('scheduled'),playlistId='scheduled',index=-1,item=null,img=null,status='loading',paused=false,loop='playlist',generation=0,disposed=false,timeout=null,loadTimeout=null,detach=()=>{},imageAt=0,imageElapsed=0,duration=0,failures=0,playVersion=0;
  const position=()=>item?.type==='video'?(Number.isFinite(media.currentTime)?media.currentTime:0):Math.min(duration,imageElapsed+(status==='playing'?(clock.now()-imageAt)/1000:0));
  const state=()=>({status,contentId:item?.id||'',title:String(item?.title||item?.id||''),playlistId,index,total:queue.length,position:position(),duration,volume:media.volume,muted:media.muted,loop});
  const emit=()=>{if(!disposed)onState(state())};
  function clear(){clock.clearTimeout(timeout);clock.clearTimeout(loadTimeout);timeout=loadTimeout=null;detach();detach=()=>{};}
  function schedule(){clock.clearTimeout(timeout);if(disposed||paused||status!=='playing'||item.type==='video')return;const seconds=item.type==='image'?Math.max(0,duration-position()):Math.max(0,(duration||30)-position());timeout=clock.setTimeout(ended,Math.max(10,seconds*1000));}
  function fail(token){if(disposed||token!==generation)return;clear();media.pause();status='error';emit();if(loop==='playlist'&&++failures<queue.length)load(index+1);}
  function ended(){if(disposed||paused||status!=='playing')return;load(loop==='one'?index:index+1);}
  function ready(token){if(disposed||token!==generation)return;clock.clearTimeout(loadTimeout);loadTimeout=null;failures=0;duration=item.type==='video'?(Number.isFinite(media.duration)?media.duration:30):Math.max(.1,item.seconds||9);status=paused?'paused':'playing';imageAt=clock.now();onMedia();if(item.type==='video'&&!paused)playVideo(token);else{schedule();emit();}}
  function playVideo(token){const playToken=++playVersion;let promise;try{promise=media.play()}catch(e){promise=Promise.reject(e)}Promise.resolve(promise).then(()=>{if(disposed||token!==generation||playToken!==playVersion)return;if(paused){media.pause();return;}status='playing';schedule();emit()},()=>{if(disposed||token!==generation||playToken!==playVersion)return;status='blocked';emit()});}
  function load(next,seek=0){
   if(disposed||!queue.length)return false;clear();const token=++generation;index=((next%queue.length)+queue.length)%queue.length;item=catalog.get(queue[index]);img=null;imageElapsed=0;duration=0;status='loading';media.pause();emit();onMedia();
   loadTimeout=clock.setTimeout(()=>fail(token),15000);
   if(item.type==='video'){
    const loaded=()=>{if(media.currentSrc&&media.currentSrc!==media.src)return;if(seek>0&&Number.isFinite(media.duration))media.currentTime=Math.min(seek,media.duration);ready(token)};
    const error=()=>fail(token),end=()=>{if(token===generation)ended()};media.addEventListener('loadeddata',loaded);media.addEventListener('error',error);media.addEventListener('ended',end);detach=()=>{media.removeEventListener('loadeddata',loaded);media.removeEventListener('error',error);media.removeEventListener('ended',end)};
    media.src=item.url;media.load?.();
   }else{
    media.removeAttribute('src');media.load?.();const image=createImage();image.crossOrigin='anonymous';image.onload=()=>{if(token!==generation||disposed)return;img=image;ready(token)};image.onerror=()=>fail(token);detach=()=>{image.onload=image.onerror=null};image.src=item.url;
   }
   return true;
  }
  function command(input){
   if(disposed||!input)return false;const a=input.action;
   if(a==='content'){if(!catalog.has(input.contentId))return false;if(!queue.includes(input.contentId)){queue=lists.get('all')||[...catalog.keys()];playlistId='all';}return load(queue.indexOf(input.contentId));}
   if(a==='playlist'){const list=lists.get(input.playlistId);if(!list?.length)return false;queue=list;playlistId=input.playlistId;return load(0);}
   if(a==='next'||a==='prev'||a==='first'||a==='last'||a==='restart')return load(a==='next'?index+1:a==='prev'?index-1:a==='first'?0:a==='last'?queue.length-1:index);
   if(a==='loop'){if(!['one','playlist'].includes(input.loop))return false;loop=input.loop;emit();return true;}
   if(a==='volume'){if(!Number.isFinite(input.volume)||input.volume<0||input.volume>1)return false;media.volume=input.volume;emit();return true;}
   if(a==='mute'){if(typeof input.muted!=='boolean')return false;media.muted=input.muted;emit();return true;}
   if(a==='seek'){if(!Number.isFinite(input.seconds)||input.seconds<0||!duration)return false;const seconds=Math.min(input.seconds,duration);if(item.type==='video')media.currentTime=seconds;else{imageElapsed=seconds;imageAt=clock.now();}schedule();emit();return true;}
   if(['play','pause','toggle-pause'].includes(a)){
    const next=a==='toggle-pause'?(['blocked','error'].includes(status)?false:!paused):a==='pause';if(!next&&status==='error'){paused=false;failures=0;return load(index);}if(next&&!paused&&item?.type==='image')imageElapsed=position();paused=next;
    if(paused){++playVersion;media.pause();clock.clearTimeout(timeout);if(status!=='loading')status='paused';emit();}
    else if(status!=='loading'){if(item?.type==='video')playVideo(generation);else{status='playing';imageAt=clock.now();schedule();emit();}}
    return true;
   }
   return false;
  }
  load(initialIndex,initialTime);
  return{command,state,media,refreshCatalog(library){for(const i of library.items)if(i&&typeof i.id==='string'&&['video','image'].includes(i.type)&&typeof i.url==='string')catalog.set(i.id,{...i});for(const p of library.playlists)lists.set(p.id,p.items.filter(id=>catalog.has(id)));},get paused(){return paused},get item(){return item},get image(){return img},get source(){return item?.type==='video'&&media.readyState>=2?media:img},mute(){media.muted=true;emit()},dispose(){if(disposed)return;disposed=true;++generation;clear();media.muted=true;media.pause();media.removeAttribute('src');media.load?.()}};
 }
 const api={create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ScreenPlayer=api;
})(typeof globalThis!=='undefined'?globalThis:this);
