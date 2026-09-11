import {TwinSession,STYLES,CATEGORIES} from './twins.mjs';
import {generateTwin,publishTwin} from './pixeria.mjs';

export function installTwinUI({document,generate=generateTwin,publish=publishTwin,onOriginalRemoved=()=>{}}){
  const $=id=>document.getElementById(id);
  let previewResult=null,previewUrl=null,lastPhase='empty';
  const messages={
    empty:'Elige un recorte para crear su gemelo.',selected:'Original temporal seleccionado · máximo 3 min.',
    generating:'Generando en Pixeria · original temporal en uso…',review:'Resultado listo · copia temporal del original retirada.',
    failed:'No se obtuvo un resultado válido. Copia temporal retirada; selecciona otro recorte.',
    expired:'Tiempo agotado · copia temporal retirada.',publishing:'Publicando solo el resultado revisado…',
    published:'Resultado publicado en Stock. No se ha publicado el original.',
    'publish-unknown':'No se pudo confirmar la publicación. Comprueba Stock antes de volver a publicar; no se reintentará automáticamente.',
    'result-expired':'Vista del resultado caducada. Si lo publicaste, sigue disponible en Stock.'
  };
  const session=new TwinSession({generate,publish,onChange:s=>{
    const phase=s.phase;
    $('twin-status').textContent=messages[phase];
    const sourceCanvas=$('twin-source');
    sourceCanvas.hidden=!s.source;
    if(s.source){sourceCanvas.width=s.source.width;sourceCanvas.height=s.source.height;sourceCanvas.getContext('2d').putImageData(new ImageData(s.source.data,s.source.width,s.source.height),0,0);}
    else{sourceCanvas.width=1;sourceCanvas.height=1;}
    $('twin-source-label').textContent=s.source?`${CATEGORIES[s.category]} · original temporal`:'Sin original retenido';
    $('twin-style').disabled=phase!=='selected';
    $('twin-consent').disabled=phase!=='selected';
    $('twin-generate').disabled=phase!=='selected'||!$('twin-consent').checked;
    $('twin-review').disabled=phase!=='review';
    $('twin-clear').disabled=['empty','publishing'].includes(phase);
    $('twin-clear').textContent=phase==='generating'?'Cancelar y retirar original':'Descartar copia local';
    $('twin-result-box').hidden=!s.result;
    if(previewResult!==s.result){
      if(previewUrl)URL.revokeObjectURL(previewUrl);
      previewResult=s.result;previewUrl=null;
      $('twin-result').removeAttribute('src');$('twin-review').checked=false;
      if(s.result){previewUrl=URL.createObjectURL(new Blob([s.result.bytes],{type:s.result.mime}));$('twin-result').src=previewUrl;}
    }
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
  $('twin-generate').addEventListener('click',()=>session.create($('twin-style').value,$('twin-consent').checked));
  $('twin-publish').addEventListener('click',()=>session.publishReviewed($('twin-review').checked));
  $('twin-clear').addEventListener('click',()=>session.clear());
  session.emit();
  return {
    session,
    select(canvas,category){
      if(canvas.width<2||canvas.height<2)return false;
      const selected=session.select(canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height),category);
      if(selected){$('twin-panel').open=true;$('twin-consent').checked=false;$('twin-review').checked=false;session.emit();}
      return selected;
    },
    cancelOriginal:()=>session.cancelOriginal(),clear:()=>session.clear(),checkExpiry:()=>session.checkExpiry()
  };
}
