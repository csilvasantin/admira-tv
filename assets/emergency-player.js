// This document contains only the incident. If the media fails it stays black.
const query=new URLSearchParams(location.search);
const screen=query.get('screen'), returnPath=query.get('back')||'';
const region=document.querySelector('main');
let active='';
if(/^[a-z0-9][a-z0-9-]{1,79}$/.test(screen||'')){
  AdmiraImportPriority.watch({screen,restoreEmpty:false,onChange(state){
    const item=state.emergency;
    if(!item){
      const dest=new URL(returnPath,location.origin);
      if(dest.origin===location.origin&&/^\/canal(?:\.html)?\/?$/.test(dest.pathname))location.replace(dest.href);
      else location.replace('/canal.html?screen='+encodeURIComponent(screen));
      return;
    }
    if(item.event===active)return;
    active=item.event;
    region.replaceChildren();
    const kind=item.assetType==='image'?'img':item.assetType==='audio'?'audio':'video';
    const media=document.createElement(kind);
    if(kind==='img')media.alt=item.title||'Aviso';
    else{media.autoplay=true;media.loop=true;media.playsInline=true;}
    media.src=item.asset;region.append(media);
    if(media.play)media.play().catch(()=>{if(kind==='video'){media.muted=true;media.play().catch(()=>{});}});
  }});
}
