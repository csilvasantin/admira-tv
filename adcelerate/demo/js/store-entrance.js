/* Puertas fotográficas: pulsar la fachada de una tienda entra en su gemelo digital.
 * Starbucks Passeig de Gràcia 103 (Carlos, 30-sep-2026): arco STARBUCKS + escaparate del 103,
 * calibrado sobre bNZ9QjiL55gYQ2iyOhSqMw (ago-2026), 1512×917, POV 218.70/5.17, zoom 1.167;
 * esquinas en pantalla (718,442),(1066,448),(1066,605),(684,609) → rumbo/inclinación. */
(function(root){
 const sites=typeof module!=='undefined'&&module.exports?require('./outdoor-sites.js'):root.OutdoorSites;
 const doors=sites.all.filter(site=>site.twin&&site.twin.door).map(site=>({siteId:site.id,label:site.twin.label,href:site.twin.url,...site.twin.door}));
 function create({getPanorama,container,warp,isAvailable=()=>true,onLeave=()=>{}}){
  const links=doors.map(door=>{
   const link=document.createElement('a');link.className='store-door';link.href=door.href;link.target='_top';link.hidden=true;
   link.setAttribute('aria-label',document.documentElement.lang.startsWith('en')?'Enter Starbucks · Matrix digital twin':door.label);link.dataset.site=door.siteId;
   link.addEventListener('pointerdown',e=>e.stopPropagation());
   link.addEventListener('click',e=>{if(!isAvailable()||getPanorama()?.getPano()!==door.pano){e.preventDefault();return;}e.stopPropagation();onLeave();});
   container.append(link);return link;
  });
  function layout(){
   const view=getPanorama(),rect=container.getBoundingClientRect();
   links.forEach((link,i)=>{
    const door=doors[i],visible=view?.getVisible()&&view.getPano()===door.pano&&isAvailable()&&!document.documentElement.classList.contains('targets-hidden');
    const pts=visible?door.corners.map(p=>root.DoohSurfaces.project(...p,view.getPov(),view.getZoom(),rect.width,rect.height)):[];
    link.hidden=!visible||pts.some(p=>!p)||pts.every(p=>p[0]<0||p[0]>rect.width||p[1]<0||p[1]>rect.height);
    if(!link.hidden)link.style.transform=warp(200,80,pts);
   });
  }
  const resize=new ResizeObserver(layout);resize.observe(container);addEventListener('admira-targets-change',layout);
  return {layout,dispose(){resize.disconnect();removeEventListener('admira-targets-change',layout);links.forEach(l=>l.remove());}};
 }
 const api={doors,create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.StoreEntrance=api;
})(typeof globalThis!=='undefined'?globalThis:this);
