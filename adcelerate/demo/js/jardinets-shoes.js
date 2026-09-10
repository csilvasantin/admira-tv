/* Two photographic hotspots on the Jardinets pole, calibrated 2026-09-10.
 * 1278×632 viewport, POV 290/24, zoom .9; top-left viewport at (1,57). */
(function(root){
 const pano='L6xcO37SQfBmCxsT9lPdjQ';
 const zones=[
  {id:'interior',label:'Zapatilla superior · entrar en la Store',href:'https://digitaltwin.ieu.ai/',corners:[[325.253013,32.313881],[329.144338,30.993865],[328.655784,29.425716],[324.783207,30.678395]]},
  {id:'walk',label:'Zapatilla inferior · caminar hasta Santa Rosa 19',href:'/admiraxperience/?site=store&from=jardinets',corners:[[323.905231,29.658268],[328.242447,28.318055],[327.594690,26.107878],[323.289394,27.339371]]}
 ];
 function create({getPanorama,container,warp,isAvailable=()=>true,onLeave=()=>{}}){
  const links=zones.map(zone=>{
   const link=document.createElement('a');link.className='jardinets-shoe';link.href=zone.href;link.target='_top';link.hidden=true;
   link.setAttribute('aria-label',zone.label);link.title=zone.label;link.dataset.shoe=zone.id;
   const label=document.createElement('span');label.textContent=zone.id==='interior'?'Entrar en la Store':'Caminar a Santa Rosa 19';link.append(label);
   link.addEventListener('pointerdown',e=>e.stopPropagation());
   link.addEventListener('click',e=>{if(!isAvailable()||getPanorama()?.getPano()!==pano){e.preventDefault();return;}e.stopPropagation();onLeave();});
   container.append(link);return link;
  });
  function layout(){
   const view=getPanorama(),rect=container.getBoundingClientRect();
   const visible=view?.getVisible()&&view.getPano()===pano&&isAvailable()&&!document.documentElement.classList.contains('targets-hidden');
   links.forEach((link,i)=>{
    const pts=visible?zones[i].corners.map(p=>root.DoohSurfaces.project(...p,view.getPov(),view.getZoom(),rect.width,rect.height)):[];
    link.hidden=!visible||pts.some(p=>!p)||pts.every(p=>p[0]<0||p[0]>rect.width||p[1]<0||p[1]>rect.height);
    if(!link.hidden)link.style.transform=warp(100,48,pts);
   });
  }
  const resize=new ResizeObserver(layout);resize.observe(container);addEventListener('admira-targets-change',layout);
  return {layout,dispose(){resize.disconnect();removeEventListener('admira-targets-change',layout);links.forEach(l=>l.remove());}};
 }
 const api={pano,zones,create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.JardinetsShoes=api;
})(typeof globalThis!=='undefined'?globalThis:this);
