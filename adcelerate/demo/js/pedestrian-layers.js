/* Calibration in the original 1280×720 capture; each patch follows a panorama ray. */
(function(root){
 const reference={width:1280,height:720,pov:{heading:290,pitch:-6},zoom:1.084};
 const regions=[
  [311,323,376,465], [8,336,68,440], [417,310,447,372],
  [518,329,551,427], [542,297,572,357], [813,319,872,368],
  [947,296,985,382], [980,295,1043,384],
  [1137,292,1179,369], [1197,292,1236,360]
 ];
 const pole=[[1130,235],[1151,235],[1107,657],[1085,657]];
 const clamp=n=>Math.max(0,Math.min(10,Math.round(n)));
 function countFromPoint(point,top,bottom){const dx=top[0]-bottom[0],dy=top[1]-bottom[1],den=dx*dx+dy*dy;if(den<1)return 1;const f=((point[0]-bottom[0])*dx+(point[1]-bottom[1])*dy)/den;return Math.max(1,Math.min(10,Math.floor(f*10)+1));}
 const api={reference,regions,pole,clamp,countFromPoint};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PedestrianLayers=api;
})(typeof globalThis!=='undefined'?globalThis:this);
