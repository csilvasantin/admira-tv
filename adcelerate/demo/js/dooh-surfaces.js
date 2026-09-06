/* Photographic display surfaces: angular corners measured in the named panorama.
 * These IDs identify screens of the digital twin, not a claimed operator inventory.
 * Jardinets calibration: 2026-09-06, March 2023 panorama, 1440x814,
 * POV 290.7/-4, zoom2.8; inner poster corners (619,179),(800,178),(796,651),(619,637).
 */
(function(root){
 'use strict';
 const all=[
  {id:'vila-left',siteId:'vila',label:'Vila · pantalla izquierda',pano:'2NoSvJbqMCZ0RXhR8pTSLA',
   pov:{heading:45.16,pitch:-9,zoom:1.55},elementId:'sv-p1',width:512,height:760,
   corners:{tl:[39.38,1.14],tr:[51.35,1.28],br:[51.31,-14.90],bl:[38.59,-14.74]}},
  {id:'vila-right',siteId:'vila',label:'Vila · pantalla derecha',pano:'2NoSvJbqMCZ0RXhR8pTSLA',
   pov:{heading:67.17,pitch:-8.5,zoom:1.55},elementId:'sv-p2',width:512,height:760,
   corners:{tl:[61.24,1.25],tr:[72.05,1.51],br:[73.41,-13.16],bl:[61.99,-14.39]}},
  {id:'jardinets-main',siteId:'jardinets',label:'Jardinets · pantalla junto al ATM',pano:'L6xcO37SQfBmCxsT9lPdjQ',
   pov:{heading:290.49,pitch:-6.3,zoom:2.35},elementId:'sv-jardinets',width:512,height:1320,
   corners:{tl:[288.86131,.15569],tr:[292.15655,.17388],br:[292.09841,-8.44379],bl:[288.84246,-8.18785]}}
 ];
 function freeze(o){if(o&&typeof o==='object'){Object.values(o).forEach(freeze);Object.freeze(o)}return o}freeze(all);
 // Fit the entire calibrated poster between the human HUD and the tour controls.
 function fit(surface,width,height){
  const r=Math.PI/180,points=Object.values(surface.corners);
  const heading=points.reduce((n,p)=>n+p[0],0)/4,pitch=points.reduce((n,p)=>n+p[1],0)/4;
  const vec=(h,p)=>[Math.sin(h*r)*Math.cos(p*r),Math.cos(h*r)*Math.cos(p*r),Math.sin(p*r)];
  const f=vec(heading,pitch),right=[Math.cos(heading*r),-Math.sin(heading*r),0],up=[right[1]*f[2],-right[0]*f[2],right[0]*f[1]-right[1]*f[0]];
  const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0);
  const plane=points.map(p=>{const v=vec(...p),z=dot(v,f);return [dot(v,right)/z,dot(v,up)/z]});
  const span=i=>Math.max(...plane.map(p=>p[i]))-Math.min(...plane.map(p=>p[i]));
  const top=Math.min(155,height*.22),bottom=Math.min(275,height*.36);
  const availableH=Math.max(100,height-top-bottom),availableW=Math.max(120,width-48);
  const focal=.88*Math.min(availableW/span(0),availableH/span(1));
  const fov=2*Math.atan(width/(2*focal))/r;
  const zoom=Math.max(.9,Math.min(4.5,Math.log2(180/fov)));
  const centerY=(top+height-bottom)/2;
  return {heading,pitch:pitch+Math.atan((centerY-height/2)/focal)/r,zoom};
 }
 const api={all,get:id=>all.find(s=>s.id===id)||null,fit};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DoohSurfaces=api;
})(typeof globalThis!=='undefined'?globalThis:this);
