import {TemporalStreetBackground,CLEAN_FRAME_TTL,hideShortcut} from './clean-street.mjs';
import {TrackingOverlay} from './tracking-overlay.mjs';

export function installCleanStreetUI({document,onToggle=()=>{}}){
  const $=id=>document.getElementById(id),canvas=$('clean-preview'),tablet=$('tablet-canvas');
  const input=document.createElement('canvas'),context=input.getContext('2d',{willReadFrequently:true});
  const background=new TemporalStreetBackground(),overlay=new TrackingOverlay($('tablet-tracking'),{labelHeight:20,labelCharWidth:9.5,reservedTop:0});
  let enabled=false,timer=0,lastAt=-Infinity,labelsAt=0,observations=[];
  const message=text=>{$('clean-status').textContent=text;};
  function blank(text='H · esperando vídeo analizado'){
    canvas.width=320;canvas.height=180;
    const c=canvas.getContext('2d');c.fillStyle='#101923';c.fillRect(0,0,320,180);
    overlay.clear();lastAt=-Infinity;observations=[];message(text);
    if(enabled){const t=tablet.getContext('2d');t.fillStyle='#09131b';t.fillRect(0,0,640,480);t.fillStyle='#3df08a';t.font='22px sans-serif';t.textAlign='center';t.fillText(text,320,240);}
  }
  function reset(){clearTimeout(timer);background.reset();input.width=1;input.height=1;blank();}
  function tabletFrame(){
    if(!enabled||performance.now()-lastAt>=CLEAN_FRAME_TTL)return;
    const t=tablet.getContext('2d'),scale=Math.min(612/input.width,390/input.height);
    const w=input.width*scale,h=input.height*scale,x=(640-w)/2,y=16+(390-h)/2;
    t.fillStyle='#09131b';t.fillRect(0,0,640,480);t.drawImage(input,x,y,w,h);
    t.strokeStyle='#3df08a';t.lineWidth=12;t.strokeRect(6,6,628,468);
    t.fillStyle='#3df08a';t.font='bold 18px sans-serif';t.textAlign='center';t.fillText('Puerta Cam · vídeo original',320,435);
    t.fillStyle='#b4c4ce';t.font='16px sans-serif';t.fillText('Personas visibles · detección en directo',320,461,600);
    Object.assign($('tablet-tracking').style,{left:`${x}px`,top:`${y}px`,width:`${w}px`,height:`${h}px`});
    overlay.render(observations.map(o=>({...o,ageMs:o.ageMs+Math.max(0,performance.now()-labelsAt)})));
  }
  function setEnabled(value){
    enabled=!!value;canvas.hidden=!enabled;$('clean-status').hidden=!enabled;$('tablet-tracking').hidden=!enabled;
    $('hide-people').setAttribute('aria-pressed',String(enabled));$('hide-people').textContent=enabled?'H · Mostrar personas':'H · Ocultar personas';
    onToggle(enabled);
    if(enabled){if(performance.now()-lastAt<CLEAN_FRAME_TTL)tabletFrame();else blank();}else overlay.clear();
  }
  $('hide-people').addEventListener('click',()=>setEnabled(!enabled));
  document.addEventListener('keydown',event=>{if(hideShortcut(event)&&!$('hide-people').disabled){event.preventDefault();setEnabled(!enabled);}});
  function update(frame,predictions,tracks,capturedAt){
    try{
      if(performance.now()-capturedAt>=CLEAN_FRAME_TTL){reset();return;}
      const scale=Math.min(1,320/frame.width,480/frame.height),w=Math.max(1,Math.round(frame.width*scale)),h=Math.max(1,Math.round(frame.height*scale));
      if(input.width!==w||input.height!==h){input.width=w;input.height=h;}
      context.drawImage(frame,0,0,w,h);
      const boxes=[...predictions.filter(p=>p.score>=.25).map(p=>({...p,bbox:p.bbox.map((v,i)=>v/(i%2?frame.height:frame.width))})),...tracks];
      const result=background.update(context.getImageData(0,0,w,h),boxes,capturedAt);if(!result)return;
      canvas.width=w;canvas.height=h;canvas.getContext('2d').putImageData(new ImageData(result.data,w,h),0,0);result.data.fill(0);
      lastAt=capturedAt;labelsAt=performance.now();observations=tracks;
      message(result.unknown?'H · zona tapada: fondo sin observar':result.sceneChanged?'H · fondo reiniciado por cambio de vista':'H · fondo temporal · vista modificada');
      tabletFrame();clearTimeout(timer);
      timer=setTimeout(()=>{background.reset();input.width=1;input.height=1;blank('H · sin fotograma reciente');},Math.max(0,CLEAN_FRAME_TTL-(performance.now()-capturedAt)));
    }catch{reset();message('H · vista no disponible; análisis independiente');}
  }
  blank();
  return {get enabled(){return enabled;},update,reset,setEnabled,layout:()=>overlay.layoutLabels()};
}
