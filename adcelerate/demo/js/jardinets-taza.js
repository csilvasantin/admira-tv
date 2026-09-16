/* Dos zonas fotográficas más en Jardinets: la papelera y el armario de contadores
 * (Carlos, 16-09-2026). Al pulsarlas suena su pieza en la pantalla del quiosco y la
 * MISMA pieza va a la taza, que la pixela a 32×16.
 *
 * CONTRATO DE ETIQUETAS, exacto y sin sustitutos, como el de #musica + #1…#10:
 *   papelera → #taza + #papelera   (Queen)
 *   contador → #taza + #contador   (Michael Jackson)
 * #taza es la etiqueta de familia —dice «esto también va a la taza»— y la segunda
 * distingue la zona. Si falta una, la zona lo dice; nunca se emite otra cosa parecida.
 *
 * CÓMO LLEGA A CADA SITIO: con la orden `tag-<zona>` de /locations/cmd, que ya existe
 * en el contrato del player. Al circuito del sitio llegan todas sus pantallas reales;
 * a la taza se le manda la misma orden a su propia pantalla, y su player (que lee
 * signage/now?screen=playertaza) la pixela. No hace falta ningún empujón nuevo.
 *
 * GEOMETRÍA: `corners` son las cuatro esquinas del objeto en el panorama, en pares
 * [rumbo, inclinación], como en jardinets-shoes.js. Las dos están medidas sobre el
 * panorama con DoohSurfaces.unproject y comprobadas dibujando el cuadrilátero encima
 * del objeto; no se pusieron a ojo. Una zona sin medir (corners null) no se pinta:
 * `sinCalibrar()` dice cuáles faltan.
 */
(function(root){
 const PANO='L6xcO37SQfBmCxsT9lPdjQ';
 const FAMILIA='taza';
 // La taza es una pantalla más de la flota: mismo id de circuito y de pantalla.
 const TAZA={circuit:'playertaza',screen:'playertaza'};
 // Calibradas el 16-09-2026 contra las dos fotos de Carlos, midiendo con
 // DoohSurfaces.unproject sobre el propio panorama y comprobando cada cuadrilátero
 // dibujado encima del objeto antes de escribirlo aquí:
 //  · papelera — el cubo negro con la caja de cartón asomando, junto al cajero (rumbo ~291-296)
 //  · contador — los dos armarios grises con la pintada «TAZO» y su pegatina (rumbo ~252-256)
 const ZONAS=[
  {id:'papelera',etiqueta:'papelera',rotulo:'Papelera · Queen',artista:'Queen',
   corners:[[291.378724,-14.710939],[296.036033,-14.879443],[295.866197,-21.396128],[290.803065,-21.163882]]},
  {id:'contador',etiqueta:'contador',rotulo:'Contador de luz · Michael Jackson',artista:'Michael Jackson',
   corners:[[252.040777,-5.731991],[255.945579,-6.284283],[256,-12.840565],[251.897204,-12.267639]]}
 ];
 // Misma normalización que el resolvedor de música: sin acentos, sin almohadilla.
 const norm=v=>String(v).normalize('NFD').replace(/[̀-ͯ]/g,'').trim().toLowerCase().replace(/^#/,'');

 /* Resuelve cada zona contra el catálogo del Stock. Devuelve siempre las dos, con
  * `item` o con `error`: una zona sin pieza no desaparece, se explica. */
 function resolve(items){
  const lista=Array.isArray(items)?items:[];
  return ZONAS.map(zona=>{
   const falta='Falta #'+FAMILIA+' + #'+zona.etiqueta;
   const casan=lista.filter(i=>{
    if(!i||!Array.isArray(i.tags))return false;
    if(!['video','animation'].includes(i.type))return false;
    const etiquetas=i.tags.map(norm);
    return etiquetas.includes(FAMILIA)&&etiquetas.includes(zona.etiqueta);
   });
   if(!casan.length)return {...zona,item:null,error:falta};
   if(casan.length>1)return {...zona,item:null,error:'Hay varias piezas con #'+FAMILIA+' + #'+zona.etiqueta};
   const crudo=casan[0];
   let url; try{ url=new root.URL(crudo.url); }catch{ return {...zona,item:null,error:'La pieza de #'+zona.etiqueta+' no tiene una URL válida'}; }
   if(url.protocol!=='https:'||url.username||url.password)return {...zona,item:null,error:'La pieza de #'+zona.etiqueta+' no llega por https limpio'};
   return {...zona,error:null,item:{id:'taza:'+crudo.id,stockId:String(crudo.id),url:url.href,type:crudo.type,
     title:String(crudo.title||zona.rotulo),artist:String(crudo.artist||zona.artista),tags:crudo.tags}};
  });
 }

 async function fetchCatalog(fetcher){
  const respuesta=await fetcher('https://stock.admira.store/stock/index.json',{cache:'no-store',credentials:'omit'});
  if(!respuesta.ok)throw Error('Pixeria no está disponible');
  const datos=await respuesta.json();
  if(!Array.isArray(datos.items))throw Error('Catálogo no válido');
  return resolve(datos.items);
 }

 /* Las órdenes que dispara una zona: las pantallas del sitio y, siempre, la taza.
  * `tag-<zona>` es una orden documentada del player; no se inventa ninguna ruta. */
 function ordenes(zona,destinos){
  const cmd='tag-'+String(zona&&zona.etiqueta||'').trim();
  const sitio=(destinos||[]).filter(d=>d&&d.circuit&&d.screen);
  return [...sitio,TAZA].map(d=>({id:d.circuit,screen:d.screen,cmd}));
 }

 /* Zonas que todavía no se pueden pintar porque nadie ha medido sus esquinas. */
 function sinCalibrar(){return ZONAS.filter(z=>!Array.isArray(z.corners)||z.corners.length!==4).map(z=>z.id);}

 function create({getPanorama,container,warp,isAvailable=()=>true,onZone=()=>{}}){
  const pintables=ZONAS.filter(z=>Array.isArray(z.corners)&&z.corners.length===4);
  const enlaces=pintables.map(zona=>{
   const el=document.createElement('button');
   el.type='button';el.className='jardinets-taza';el.hidden=true;
   // Escondite, no interfaz: sin title (el globito la delataría al pasar por encima),
   // fuera del recorrido de teclado y sin anunciarse a los lectores de pantalla. Quien
   // no sepa que está ahí no puede tropezarse con ella; quien lo sabe, pulsa.
   el.tabIndex=-1;el.setAttribute('aria-hidden','true');el.dataset.taza=zona.id;
   const rotulo=document.createElement('span');rotulo.textContent=zona.rotulo;el.append(rotulo);
   el.addEventListener('pointerdown',e=>e.stopPropagation());
   el.addEventListener('click',e=>{
    if(!isAvailable()||getPanorama()?.getPano()!==PANO)return;
    e.stopPropagation();onZone(zona);
   });
   container.append(el);return el;
  });
  function layout(){
   const vista=getPanorama(),rect=container.getBoundingClientRect();
   const visible=vista?.getVisible()&&vista.getPano()===PANO&&isAvailable()&&!document.documentElement.classList.contains('targets-hidden');
   enlaces.forEach((el,i)=>{
    const pts=visible?pintables[i].corners.map(p=>root.DoohSurfaces.project(...p,vista.getPov(),vista.getZoom(),rect.width,rect.height)):[];
    el.hidden=!visible||pts.some(p=>!p)||pts.every(p=>p[0]<0||p[0]>rect.width||p[1]<0||p[1]>rect.height);
    if(!el.hidden)el.style.transform=warp(100,48,pts);
   });
  }
  const observador=new ResizeObserver(layout);observador.observe(container);
  addEventListener('admira-targets-change',layout);
  return {layout,pintadas:pintables.map(z=>z.id),
   dispose(){observador.disconnect();removeEventListener('admira-targets-change',layout);enlaces.forEach(e=>e.remove());}};
 }

 const api={PANO,FAMILIA,TAZA,ZONAS,norm,resolve,fetchCatalog,ordenes,sinCalibrar,create};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.JardinetsTaza=api;
})(typeof globalThis!=='undefined'?globalThis:this);
