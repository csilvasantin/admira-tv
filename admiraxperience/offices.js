/* Addresses requested by Carlos. Coordinates: OSM entrance nodes, checked 2026-09-07.
 * Santa Rosa has also been renamed Rosa Puig-Rodon Pla in current map labels.
 * Screens and interior assets must be explicitly linked; no fleet writes here. */
(function(root){
 const offices=[
  {id:'santa-rosa',locationId:'admiraxperience-santa-rosa',name:'Santa Rosa 4',address:'Carrer de Santa Rosa 4, 08012 Barcelona',position:{lat:41.4031596,lng:2.1527412},source:'https://www.openstreetmap.org/node/6163444335',interiorUrl:null,screens:[]},
  {id:'planeta',locationId:'admiraxperience-planeta',name:'Planeta 7',address:'Carrer del Planeta 7, 08012 Barcelona',position:{lat:41.4013338,lng:2.1558441},source:'https://www.openstreetmap.org/node/10788870066',interiorUrl:null,screens:[]}
 ];
 function distance(a,b){const rad=Math.PI/180;return Math.hypot((b.lat-a.lat)*111320,(b.lng-a.lng)*111320*Math.cos((a.lat+b.lat)*rad/2));}
 function bearing(a,b){return (Math.atan2((b.lng-a.lng)*Math.cos(a.lat*Math.PI/180),b.lat-a.lat)*180/Math.PI+360)%360;}
 function arrived(state,office){return !!(office&&state?.position&&['ready','unavailable'].includes(state.status)&&distance(state.position,office.position)<=25);}
 const api={all:offices,get:id=>offices.find(o=>o.id===id)||offices[0],distance,bearing,arrived};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AdmiraOffices=api;
})(typeof globalThis!=='undefined'?globalThis:this);
