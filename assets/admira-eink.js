// Player de tinta electrónica (role 'eink') — reglas compartidas por Mando,
// Players, Playlists y Control remoto. Un player eink es una pantalla de tinta
// (p. ej. SY11-ab, 480x800, 4 colores BWRY) que late por /signage/now a través
// de un puente BLE: solo imagen, refresco lento, sin audio ni rotación.
// El estado llega en device.eink y health (api.admira.store · r1 10-oct-2026).
(function(root){
  'use strict';
  var PALETA={black:'B',white:'W',red:'R',yellow:'Y',negro:'B',blanco:'W',rojo:'R',amarillo:'Y'};
  // Órdenes del mando que una pantalla de tinta sí entiende; el resto (vídeo,
  // volumen, rotación, relleno) no tiene sentido y la UI no las ofrece.
  // follow / follow-off: la SY11-ab sigue (o deja de seguir) las novedades del Corsair y de #eink (18-nov-2026).
  // content-<N>-cover / -contain: la pieza se adapta a la resolución de cada pantalla rellenando (recorta) o
  // encajando (bandas blancas); sin sufijo, en automático (ver ajuste()).
  var ORDENES=/^(content-\d{1,6}(?:-(?:auto|cover|contain))?|content-clear|next|prev|first|last|refresh|standby|resume|follow|follow-off)$/;

  function einkOf(rec){
    var d=rec&&rec.device; return d&&d.eink&&typeof d.eink==='object'?d.eink:null;
  }
  function isEink(rec){
    if(!rec||typeof rec!=='object') return false;
    if(String(rec.role||'').toLowerCase()==='eink') return true;
    if(einkOf(rec)) return true;
    var ua=String(rec.user_agent||(rec.device&&rec.device.software&&rec.device.software.userAgent)||'');
    return /AdmiraEinkBridge/i.test(ua);
  }
  function paleta(list){
    if(!Array.isArray(list)||!list.length) return '';
    var orden='BWRY', letras=list.map(function(c){ return PALETA[String(c).toLowerCase()]||''; }).filter(Boolean);
    letras.sort(function(a,b){ return orden.indexOf(a)-orden.indexOf(b); });
    return letras.length===list.length?letras.join(''):list.join(' · ');
  }
  function resolucion(rec){
    var e=einkOf(rec)||{}, disp=rec&&rec.device&&rec.device.display||{};
    return e.resolution||(disp.width&&disp.height?(disp.width+'x'+disp.height):'');
  }
  // «2026-10-10T16:36:56+0200» → «16:36» (la hora local del puente, tal cual la declaró).
  function hora(iso){
    var m=/T(\d{2}:\d{2})/.exec(String(iso||'')); return m?m[1]:'';
  }
  function fecha(iso){
    var m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})/.exec(String(iso||'')); return m?(m[3]+'/'+m[2]+' · '+m[4]):'';
  }
  function bateria(e){
    return e&&typeof e.battery==='number'?(Math.round(e.battery)+' %'):'n/d';
  }
  function estado(rec){
    var e=einkOf(rec)||{}, h=rec&&rec.health||{};
    var error=e.status==='error'||h.ok===false||h.status==='error';
    return {error:error, texto:error?('Error'+((e.lastError||h.error)?' · '+(e.lastError||h.error):'')):(e.paused?'En pausa':(e.status||h.status)?'Correcto':''), detalle:e.lastError||h.error||''};
  }
  // Rótulo de una línea para listados: «Tinta · 480x800 BWRY · solo imagen · refresco lento · último envío 16:36 · batería n/d»
  function resumen(rec){
    var e=einkOf(rec)||{}, bits=['Tinta'], res=resolucion(rec), pal=paleta(e.palette);
    if(res||pal) bits.push([res,pal].filter(Boolean).join(' '));
    bits.push('solo imagen','refresco lento');
    bits.push('último envío '+(hora(e.lastSendAt)||'—'));
    bits.push('batería '+bateria(e));
    var st=estado(rec); if(st.error) bits.push('ERROR');
    return bits.join(' · ');
  }
  // Filas [etiqueta, valor, clase] para la tarjeta «Tinta electrónica» de Mando → Status.
  function statusRows(rec){
    var e=einkOf(rec)||{}, st=estado(rec), res=resolucion(rec), pal=paleta(e.palette);
    return [
      ['Tipo','Tinta electrónica'+(e.model?' · '+e.model:'')],
      ['Panel',[res?res.replace('x',' × ')+' px':'',pal?(e.palette.length+' colores '+pal):''].filter(Boolean).join(' · ')],
      ['Firmware',e.firmware],
      ['Contenido',e.imageOnly===false?'Imagen y más':'Solo imagen'],
      ['Refresco',e.slowRefresh===false?'Normal':'Lento · cambia el fotograma completo'],
      ['Estado',st.texto,st.error?'warn':'good'],
      ['Último envío',fecha(e.lastSendAt)||'Sin envíos todavía'],
      ['Envíos',typeof e.sends==='number'?String(e.sends):''],
      ['Pieza fijada',typeof e.pin==='number'?('#'+e.pin):'Ninguna · sigue su playlist'],
      ['Batería',bateria(e)==='n/d'?'n/d · el firmware no la informa':bateria(e)],
      ['Último error',e.lastError||(rec&&rec.health&&rec.health.error)||'Ninguno',(e.lastError||(rec&&rec.health&&rec.health.error))?'warn':'']
    ];
  }
  function tagsOf(item){
    return (item&&Array.isArray(item.tags)?item.tags:[]).map(function(t){ return String(t||'').toLowerCase().replace(/^#/,'').trim(); });
  }
  // Pieza hecha para tinta: lleva el tag «eink» o uno de pantalla «eink-<id>».
  function isEinkTagged(item){
    return tagsOf(item).some(function(t){ return t==='eink'||t.indexOf('eink-')===0; });
  }
  // «Apto eink» = imagen y vertical. La orientación sale de ancho/alto si el
  // Stock los trae; si no, de la orientación declarada o de los tags.
  function apto(item){
    if(!item||item.type!=='image') return false;
    if(isEinkTagged(item)) return true;
    var w=Number(item.ancho||item.width), h=Number(item.alto||item.height);
    if(w>0&&h>0) return w/h<0.8;
    if(/^vertical$/i.test(String(item.orientacion||''))) return true;
    return tagsOf(item).some(function(t){ return t==='vertical'||t==='9:16'||t==='3:4'||t==='9x16'; });
  }
  function aceptaOrden(cmd){ return ORDENES.test(String(cmd||'')); }

  // ── Adaptar la pieza a la resolución de la pantalla (18-nov-2026) ──
  // «480x800» (o device.display) → {w,h}. Sin dato, la SY11-ab: 480×800.
  function medidas(rec){
    var m=/^(\d{2,5})\s*[x×]\s*(\d{2,5})$/.exec(String(resolucion(rec)||'').trim());
    return m?{w:Number(m[1]),h:Number(m[2])}:{w:480,h:800};
  }
  // Orden «content-2089-cover» → {num:2089, modo:'cover'}; sin sufijo, modo 'auto'.
  function leeContenido(cmd){
    var m=/^(?:content-|play|loop)(\d{1,6})(?:-(auto|cover|contain))?$/.exec(String(cmd||'').replace(/^\//,'').split(/\s+/)[0].toLowerCase());
    return m?{num:Number(m[1]),modo:m[2]||'auto'}:null;
  }
  // Una imagen sw×sh en una pantalla dw×dh. «cover» la escala hasta llenar y recorta lo que sobra (centrado);
  // «contain» la mete entera y deja bandas blancas. «auto» rellena si se pierde como mucho un 20 % de la imagen
  // (un 9:16 o un 3:4 en la SY11 de 3:5) y encaja si no (un 16:9 o un cuadrado no se mutilan).
  // Devuelve el rectángulo donde pintarla y cuánto se recorta o queda en blanco (0..1).
  var MAX_RECORTE=0.2;
  function ajuste(sw,sh,dw,dh,modo){
    sw=Number(sw)||dw; sh=Number(sh)||dh;
    var ra=sw/sh, rd=dw/dh, perdida=1-Math.min(ra/rd,rd/ra);
    var m=modo==='cover'||modo==='contain'?modo:(perdida<=MAX_RECORTE+1e-9?'cover':'contain');
    var k=m==='cover'?Math.max(dw/sw,dh/sh):Math.min(dw/sw,dh/sh), w=sw*k, h=sh*k;
    return {modo:m, x:(dw-w)/2, y:(dh-h)/2, w:w, h:h, recorte:m==='cover'?perdida:0, bandas:m==='contain'?perdida:0,
      lados:ra===rd?'':((ra>rd)===(m==='cover')?'izquierda y derecha':'arriba y abajo')};   // dónde recorta o dónde van las bandas
  }

  var api={isEink:isEink,einkOf:einkOf,resumen:resumen,statusRows:statusRows,estado:estado,hora:hora,paleta:paleta,
    bateria:bateria,apto:apto,isEinkTagged:isEinkTagged,aceptaOrden:aceptaOrden,
    medidas:medidas,leeContenido:leeContenido,ajuste:ajuste,MAX_RECORTE:MAX_RECORTE,ICONO:'🖋️',NOMBRE:'Tinta electrónica'};
  root.AdmiraEink=api;
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
