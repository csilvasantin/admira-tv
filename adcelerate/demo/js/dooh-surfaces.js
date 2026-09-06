/* Photographic display surfaces: angular corners measured in the named panorama.
 * These IDs identify screens of the digital twin, not a claimed operator inventory.
 * Vila calibration: 2026-09-06, March 2023 panorama, 1440x814, zoom2.3.
 * Left POV45/-7: (541,145),(912,142),(911,637),(550,632).
 * Right POV67/-7: (542,141),(891,141),(893,590),(555,618).
 * Artwork bounds retain the lower white glass strip and surrounding metal.
 * Jardinets calibration: 2026-09-06, March 2023 panorama, 1440x814,
 * POV 290.7/-4, zoom2.8; inner poster corners (619,179),(800,178),(796,651),(619,637).
 */
(function(root){
 'use strict';
 const all=[
  {id:'vila-left',siteId:'vila',label:'Vila · pantalla izquierda',pano:'2NoSvJbqMCZ0RXhR8pTSLA',
   pov:{heading:45.16,pitch:-9,zoom:1.55},elementId:'sv-p1',width:512,height:760,
   corners:{"tl":[39.29435661,1.39963155],"tr":[51.11574475,1.4929159],"br":[51.29441643,-14.30877975],"bl":[39.39492039,-14.16768723]}},
  {id:'vila-right',siteId:'vila',label:'Vila · pantalla derecha',pano:'2NoSvJbqMCZ0RXhR8pTSLA',
   pov:{heading:67.17,pitch:-8.5,zoom:1.55},elementId:'sv-p2',width:512,height:760,
   corners:{"tl":[61.32755652,1.52556329],"tr":[72.45074058,1.52613794],"br":[72.68665341,-12.83206512],"bl":[61.56409348,-13.7276217]}},
  {id:'jardinets-main',siteId:'jardinets',label:'Jardinets · pantalla junto al ATM',pano:'L6xcO37SQfBmCxsT9lPdjQ',
   pov:{heading:290.49,pitch:-6.3,zoom:2.35},elementId:'sv-jardinets',width:512,height:1320,
   corners:{"tl":[288.40210155,1.19514536],"tr":[292.52043081,1.21815636],"br":[292.45242362,-9.5541484],"bl":[288.37259124,-9.23394198]}}
 ];
 // Same physical Vila screens seen from the connected walking arrival, March2023.
 // 1440x814,zoom2.3,pitch-6: left h13 (615,185),(840,179),(840,552),(619,532);
 // right h29 (572,175),(877,170),(876,603),(578,581).
 const walkingViews=[{"id":"vila-left","pano":"xyBUNhtkdE7tUUGrvRPwmA","pov":{"heading":13,"pitch":-7,"zoom":2.3},"corners":{"tl":[9.63606152,1.13559423],"tr":[16.84180584,1.32540668],"br":[16.92723304,-10.65128005],"bl":[9.69701118,-10.0168083]}},{"id":"vila-right","pano":"xyBUNhtkdE7tUUGrvRPwmA","pov":{"heading":29,"pitch":-7,"zoom":2.3},"corners":{"tl":[24.2665672,1.45056276],"tr":[34.01838787,1.60815356],"br":[34.11542054,-12.26126603],"bl":[24.34764864,-11.56825991]}}];
 for(const view of walkingViews){const surface=all.find(s=>s.id===view.id);surface.views=[view];}
 function poseFor(id,pano){const s=all.find(s=>s.id===id);if(!s)return null;if(s.pano===pano)return s;const view=s.views?.find(v=>v.pano===pano);return view?{...s,...view}:null;}
 function freeze(o){if(o&&typeof o==='object'){Object.values(o).forEach(freeze);Object.freeze(o)}return o}freeze(all);
 // Native Street View focal measured from the same feature at headings290.7/298.7:
 // W1440,H814,z2.8,pitch-4, TL619,179→263,179. Model predicts262.67px.
 const fov=zoom=>2*Math.atan(2**(1-zoom));
 function basis(heading,pitch){const r=Math.PI/180,h=heading*r,p=pitch*r,f=[Math.sin(h)*Math.cos(p),Math.cos(h)*Math.cos(p),Math.sin(p)],right=[Math.cos(h),-Math.sin(h),0];return {f,right,up:[right[1]*f[2],-right[0]*f[2],right[0]*f[1]-right[1]*f[0]]}}
 function project(heading,pitch,pov,zoom,width,height){
  const {f,right,up}=basis(pov.heading,pov.pitch),v=basis(heading,pitch).f,dot=(a,b)=>a.reduce((n,x,i)=>n+x*b[i],0),z=dot(v,f);if(z<=.02)return null;
  const focal=width/(2*Math.tan(fov(zoom)/2));return [width/2+focal*dot(v,right)/z,height/2-focal*dot(v,up)/z];
 }
 function unproject(x,y,pov,zoom,width,height){
  const {f,right,up}=basis(pov.heading,pov.pitch),focal=width/(2*Math.tan(fov(zoom)/2)),dx=(x-width/2)/focal,dy=(height/2-y)/focal;
  const v=f.map((n,i)=>n+right[i]*dx+up[i]*dy);return [(Math.atan2(v[0],v[1])*180/Math.PI+360)%360,Math.atan2(v[2],Math.hypot(v[0],v[1]))*180/Math.PI];
 }
 // Fit the entire calibrated poster between the human HUD and the tour controls.
 function fit(surface,width,height){
  const r=Math.PI/180,points=Object.values(surface.corners);
  const heading=points.reduce((n,p)=>n+p[0],0)/4,pitch=points.reduce((n,p)=>n+p[1],0)/4;
  const vec=(h,p)=>[Math.sin(h*r)*Math.cos(p*r),Math.cos(h*r)*Math.cos(p*r),Math.sin(p*r)];
  const f=vec(heading,pitch),right=[Math.cos(heading*r),-Math.sin(heading*r),0],up=[right[1]*f[2],-right[0]*f[2],right[0]*f[1]-right[1]*f[0]];
  const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0);
  const plane=points.map(p=>{const v=vec(...p),z=dot(v,f);return [dot(v,right)/z,dot(v,up)/z]});
  const span=i=>Math.max(...plane.map(p=>p[i]))-Math.min(...plane.map(p=>p[i]));
  const top=Math.min(155,height*.22),bottom=Math.min(275,height*.45);
  const availableH=Math.max(100,height-top-bottom),availableW=Math.max(120,width-48);
  const focal=.82*Math.min(availableW/span(0),availableH/span(1));
  const zoom=Math.max(.9,Math.min(4.5,1+Math.log2(2*focal/width)));
  const centerY=(top+height-bottom)/2;
  return {heading,pitch:pitch+Math.atan((centerY-height/2)/focal)/r,zoom};
 }
 const api={all,poseFor,hasPose:(id,pano)=>!!poseFor(id,pano),get:id=>all.find(s=>s.id===id)||null,fit,fov,project,unproject};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DoohSurfaces=api;
})(typeof globalThis!=='undefined'?globalThis:this);
