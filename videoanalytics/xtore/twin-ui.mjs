import {TwinSession,STYLES,CATEGORIES} from './twins.mjs';
import {generateTwin,publishTwin} from './pixeria.mjs';
import {readAvatarPhoto} from './avatar-source.mjs';

export function installTwinUI({document,generate=generateTwin,publish=publishTwin,readPhoto=readAvatarPhoto,onOriginalRemoved=()=>{}}){
  const $=id=>document.getElementById(id);
  let previewResult=null,previewUrl=null,lastPhase='empty',photoVersion=0,loadingPhoto=false;
  const busy=()=>['generating','publishing','review','publish-unknown'].includes(session.phase);
  const cancelPhoto=()=>{photoVersion++;loadingPhoto=false;};
  const messages={
    empty:'Elige una foto o un recorte para crear un avatar.',selected:'Original temporal seleccionado · máximo 3 min.',
    generating:'Generando en Pixeria · original temporal en uso…',review:'Resultado listo · copia temporal del original retirada.',
    failed:'No se obtuvo un resultado válido. Copia temporal retirada; selecciona otro recorte.',
    expired:'Tiempo agotado · copia temporal retirada.',publishing:'Publicando solo el resultado revisado…',
    published:'Resultado publicado en Stock. No se ha publicado el original.',
    'publish-unknown':'No se pudo confirmar la publicación. Comprueba Stock antes de volver a publicar; no se reintentará automáticamente.',
    'result-expired':'Vista del resultado caducada. Si lo publicaste, sigue disponible en Stock.'
  };
  const session=new TwinSession({generate,publish,onChange:s=>{
    const phase=s.phase;
    $('twin-status').textContent=loadingPhoto?'Abriendo foto en este navegador…':messages[phase];
    $('twin-photo').disabled=loadingPhoto||['generating','publishing','review','publish-unknown'].includes(phase);
    const sourceCanvas=$('twin-source');
    sourceCanvas.hidden=!s.source;
    if(s.source){sourceCanvas.width=s.source.width;sourceCanvas.height=s.source.height;sourceCanvas.getContext('2d').putImageData(new ImageData(s.source.data,s.source.width,s.source.height),0,0);}
    else{sourceCanvas.width=1;sourceCanvas.height=1;}
    $('twin-source-label').textContent=s.source?`${CATEGORIES[s.category]} · original temporal`:'Sin original retenido';
    $('twin-style').disabled=phase!=='selected';
    $('twin-consent').disabled=phase!=='selected';
    $('twin-generate').disabled=loadingPhoto||phase!=='selected'||!$('twin-consent').checked;
    $('twin-review').disabled=phase!=='review';
    $('twin-clear').disabled=(!loadingPhoto&&phase==='empty')||phase==='publishing';
    $('twin-clear').textContent=loadingPhoto?'Cancelar carga':phase==='generating'?'Cancelar y retirar original':'Descartar copia local';
    $('twin-result-box').hidden=!s.result;
    if(previewResult!==s.result){
      if(previewUrl)URL.revokeObjectURL(previewUrl);
      previewResult=s.result;previewUrl=null;
      $('twin-result').removeAttribute('src');$('twin-review').checked=false;
      if(s.result){previewUrl=URL.createObjectURL(new Blob([s.result.bytes],{type:s.result.mime}));$('twin-result').src=previewUrl;}
    }
    $('twin-download').hidden=!previewUrl;
    if(previewUrl){
      $('twin-download').href=previewUrl;
      $('twin-download').download=`xtore-avatar-${s.style}.${s.result.mime==='image/jpeg'?'jpg':s.result.mime==='image/webp'?'webp':'png'}`;
    }else{$('twin-download').removeAttribute('href');$('twin-download').removeAttribute('download');}
    $('twin-publish').disabled=phase!=='review'||!$('twin-review').checked;
    $('twin-result-label').textContent=s.result?`${STYLES[s.style]} · ${CATEGORIES[s.category]} · pendiente de revisión`:'Sin resultado';
    if(phase==='published')$('twin-result-label').textContent=`${STYLES[s.style]} · publicado`;
    $('twin-public-link').hidden=!s.url;
    if(s.url)$('twin-public-link').href=s.url;else $('twin-public-link').removeAttribute('href');
    $('twin-stock-link').hidden=phase!=='publish-unknown';
    for(const button of $('cutouts').querySelectorAll('button'))button.disabled=['generating','publishing','review','publish-unknown'].includes(phase);
    if(phase==='review'&&lastPhase==='generating')onOriginalRemoved();
    lastPhase=phase;
  }});
  $('twin-consent').addEventListener('change',()=>session.emit());
  $('twin-review').addEventListener('change',()=>session.emit());
  $('twin-generate').addEventListener('click',()=>{if(!loadingPhoto)return session.create($('twin-style').value,$('twin-consent').checked);});
  $('twin-publish').addEventListener('click',()=>session.publishReviewed($('twin-review').checked));
  $('twin-clear').addEventListener('click',()=>{cancelPhoto();session.clear();});
  $('twin-photo').addEventListener('change',async()=>{
    const file=$('twin-photo').files?.[0];$('twin-photo').value='';
    if(!file||busy()||loadingPhoto)return;
    const version=++photoVersion;loadingPhoto=true;
    $('twin-consent').checked=false;$('twin-review').checked=false;session.clear();
    let source;
    try{
      source=await readPhoto(file);
      if(version!==photoVersion){source.data.fill(0);return;}
      loadingPhoto=false;
      // The operator supplies a photo for a fictional avatar; no demographic
      // classifier or automatic person/camera detection is invoked here.
      if(!session.select(source,'person'))throw new Error('photo-invalid');
      $('twin-panel').open=true;
    }catch{
      source?.data?.fill(0);
      if(version!==photoVersion)return;
      loadingPhoto=false;session.emit();
      $('twin-status').textContent='No se pudo abrir la foto. Usa JPG, PNG o WebP de hasta 8 MB y 24 megapíxeles.';
    }
  });
  session.emit();
  return {
    session,
    select(canvas,category){
      if(canvas.width<2||canvas.height<2)return false;
      cancelPhoto();
      const selected=session.select(canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height),category);
      if(selected){$('twin-panel').open=true;$('twin-consent').checked=false;$('twin-review').checked=false;session.emit();}
      return selected;
    },
    cancelOriginal:()=>{cancelPhoto();session.cancelOriginal();session.emit();},clear:()=>{cancelPhoto();session.clear();},checkExpiry:()=>session.checkExpiry()
  };
}
