import {XTORE_VIRTUAL_SCREEN} from './virtual-player.mjs';
const ORIGINS=new Set(['https://www.xpaceos.com','https://xpaceos.com']);
const local=origin=>/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
export function allowedTwinOrigin(origin,own){return ORIGINS.has(origin)||(local(own)&&local(origin));}
// Only the explicitly paired window receives data, whether in a tab or popup.
export function installXpaceLink({window,document,onChange=()=>{}}){
  const status=document.getElementById('xpace-status'),button=document.getElementById('open-xpace');
  const qs=new URLSearchParams(window.location?.search||'');
  let peer=null,origin='',session='',ready=false,seq=0,media=null,cameraAt=0,busy=false;
  let cameraGeneration=0,lastSend=0,lastHeartbeat=0,statistics=null;
  const requested=qs.get('twinOrigin'),token=qs.get('twinSession');
  if(window.opener&&allowedTwinOrigin(requested,window.location?.origin||'https://admira.tv')&&/^[a-f0-9-]{36}$/.test(token||'')){
    peer=window.opener;origin=requested;session=token;
  }
  const backgroundActive=()=>ready&&!!peer&&!peer.closed&&Date.now()-lastHeartbeat<=4000;
  function send(event,extra={},transfer=[]){
    if(!peer||peer.closed||!ready)return false;
    try{peer.postMessage({source:'admira-xtore-twin',screen:XTORE_VIRTUAL_SCREEN,session,event,seq:++seq,ts:Date.now(),...extra},origin,transfer);return true;}catch{return false;}
  }
  function reportStatistics(){if(statistics)send('statistics',{passages:statistics});}
  function resetCamera(){cameraGeneration++;cameraAt=0;send('camera-off');}
  function hello(){
    if(!peer||peer.closed)return;
    peer.postMessage({source:'admira-xtore-twin',screen:XTORE_VIRTUAL_SCREEN,session,event:'hello'},origin);
  }
  button.addEventListener('click',()=>{
    if(peer&&!peer.closed){hello();peer.focus();return;}
    session=window.crypto.randomUUID();origin='https://www.xpaceos.com';ready=false;
    const url=new URL('/admira-xp/',origin);
    url.search=new URLSearchParams({autostart:'xtanco',virtualPlayer:XTORE_VIRTUAL_SCREEN,twinOrigin:window.location?.origin||'https://admira.tv',twinSession:session});
    peer=window.open(url.href,'xtore-zapatillas-'+session,'popup,width=1240,height=850');
    status.textContent=peer?'Conectando el gemelo…':'Chrome bloqueó la ventana. Permite abrir el gemelo y vuelve a pulsar.';
    hello();startTimer();onChange();
  });
  window.addEventListener('message',e=>{
    const d=e.data;
    if(!peer||e.source!==peer||e.origin!==origin||d?.source!=='xpace-xtore-twin'||d.screen!==XTORE_VIRTUAL_SCREEN||d.session!==session)return;
    if(d.event==='hello'||d.event==='ready'){
      ready=true;lastHeartbeat=Date.now();
      status.textContent='Gemelo conectado · interior y escaparate siguen este player. Cámara compartida solo entre estas ventanas.';
      send('ready');reportStatistics();
      onChange();
    }else if(d.event==='heartbeat'){lastHeartbeat=Date.now();}
    else if(d.event==='disconnect'){ready=false;media=null;resetCamera();status.textContent='Gemelo desconectado.';onChange();}
  });
  let interval=null;
  function startTimer(){if(interval!==null)return;interval=setInterval(()=>{
    if(!ready){hello();return;}
    if(!peer||peer.closed||Date.now()-lastHeartbeat>4000){ready=false;cameraGeneration++;status.textContent='Gemelo sin conexión. Vuelve a abrirlo para enlazar.';onChange();return;}
    // Cumulative counter state is independent of camera/inference freshness.
    reportStatistics();
    // Never re-stamp an old player report as fresh.
    if((!document.hidden||backgroundActive())&&media&&Date.now()-media.ts<2000)send('playback',{playback:media});
    else send('playback-off');
    if(cameraAt&&Date.now()-cameraAt>1500)resetCamera();
  },500);}
  if(peer)startTimer();
  window.addEventListener('pagehide',()=>{send('disconnect');ready=false;cameraGeneration++;});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&!backgroundActive()){resetCamera();send('playback-off');}});
  return {
    get backgroundActive(){return backgroundActive();},
    get cameraOnly(){return !!peer;},
    media(value){media=value;},
    statistics(value){
      const keys=['person','car','motorcycle','bicycle','scooter'];
      if(!value||!keys.every(k=>Number.isSafeInteger(value[k])&&value[k]>=0&&value[k]<=10000000))return;
      statistics=Object.fromEntries(keys.map(k=>[k,value[k]]));reportStatistics();
    },
    stop(){media=null;send('playback-off');},
    cameraOff:resetCamera,
    async camera(canvas,observations,ageMs=0,passages=null,views=null){
      if(!ready||(document.hidden&&!backgroundActive())||busy||Date.now()-lastSend<250||!Number.isFinite(ageMs)||ageMs<0||ageMs>=1500)return;
      lastSend=Date.now();cameraAt=Date.now()-ageMs;busy=true;
      const generation=cameraGeneration,stamp=cameraAt;
      let bitmap=null,originalBitmap=null;
      try{
        const sources=[canvas,...(views?.original?[views.original]:[])];
        const results=await Promise.allSettled(sources.map(source=>window.createImageBitmap(source,{resizeWidth:Math.min(480,source.width),resizeQuality:'low'})));
        if(results.some(r=>r.status==='rejected')){for(const r of results)if(r.status==='fulfilled')r.value.close();return;}
        bitmap=results[0].value;originalBitmap=results[1]?.value||null;
        if(generation!==cameraGeneration||!ready||(document.hidden&&!backgroundActive())||Date.now()-stamp>=1500){bitmap.close();originalBitmap?.close();return;}
        const counts={person:0,car:0,motorcycle:0,bicycle:0};
        for(const o of observations||[])if(o.confirmed===true&&o.ageMs<1500&&Object.hasOwn(counts,o.class))counts[o.class]++;
        const totals=passages&&Object.keys(counts).every(k=>Number.isSafeInteger(passages[k])&&passages[k]>=0&&passages[k]<=10000000)
          ?Object.fromEntries(Object.keys(counts).map(k=>[k,passages[k]])):null;
        // Patinetes are observed manually in the analyzer; never infer them from people/bikes.
        if(totals&&Number.isSafeInteger(passages.scooter)&&passages.scooter>=0&&passages.scooter<=10000000)totals.scooter=passages.scooter;
        if(!send('camera',{bitmap,originalBitmap,modified:views?.modified===true,frameAt:stamp,counts,passages:totals},[bitmap,...(originalBitmap?[originalBitmap]:[])])){bitmap.close();originalBitmap?.close();}
      }catch{bitmap?.close();originalBitmap?.close();/* Source unavailable; receiver expires its last frame. */}finally{busy=false;}
    }
  };
}
