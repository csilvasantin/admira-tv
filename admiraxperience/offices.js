/* Addresses requested by Carlos. Coordinates: OSM entrance nodes, checked 2026-09-07.
 * Santa Rosa has also been renamed Rosa Puig-Rodon Pla in current map labels.
 * Screens and interior assets must be explicitly linked; no fleet writes here. */
(function(root){
 const offices=[
  {id:'santa-rosa',locationId:'admiraxperience-santa-rosa',name:'Santa Rosa 4',address:'Carrer de Santa Rosa 4, 08012 Barcelona',position:{lat:41.4031596,lng:2.1527412},source:'https://www.openstreetmap.org/node/6163444335',interiorName:'Santa Rosa',interiorUrl:'https://digitaltwin.ieu.ai/',interiorSelection:'manual',screens:[]},
  {id:'planeta',locationId:'admiraxperience-planeta',name:'Planeta 7',address:'Carrer del Planeta 7 bajos, 08012 Barcelona',position:{lat:41.4013338,lng:2.1558441},source:'https://www.openstreetmap.org/node/10788870066',interiorName:'Planeta Terminator',interiorUrl:'https://digitaltwin.ieu.ai/',interiorSelection:'manual',screens:[]},
  {"id": "breton", "locationId": "admiraxperience-breton", "name": "Bretón de los Herreros 9", "address": "Bretón de los Herreros 9, Barcelona", "position": {"lat": 41.4023751, "lng": 2.1519882}, "source": "https://www.openstreetmap.org/node/11684340991", "interiorUrl": null, "screens": []},
  {"id": "aulestia", "locationId": "admiraxperience-aulestia", "name": "Aulèstia i Pijoan 23", "address": "Aulèstia i Pijoan 23, Barcelona", "position": {"lat": 41.4031086, "lng": 2.1508739}, "source": "https://www.openstreetmap.org/node/6165564010", "interiorUrl": null, "screens": []},
  {"id": "store", "locationId": "admiraxperience-store", "name": "Store · Santa Rosa 19", "address": "Carrer de Santa Rosa 19 bajos, 08012 Barcelona", "position": {"lat": 41.4034658, "lng": 2.1537097}, "source": "https://www.openstreetmap.org/node/6170010026", "interiorName": "Store", "interiorUrl": "https://digitaltwin.ieu.ai/", "interiorSelection": "manual", "screens": []}
 ];
 function distance(a,b){const rad=Math.PI/180;return Math.hypot((b.lat-a.lat)*111320,(b.lng-a.lng)*111320*Math.cos((a.lat+b.lat)*rad/2));}
 function bearing(a,b){return (Math.atan2((b.lng-a.lng)*Math.cos(a.lat*Math.PI/180),b.lat-a.lat)*180/Math.PI+360)%360;}
 function arrived(state,office){return !!(office&&state?.position&&['ready','unavailable'].includes(state.status)&&distance(state.position,office.position)<=25);}
 const api={all:offices,get:id=>offices.find(o=>o.id===id)||offices[0],distance,bearing,arrived};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AdmiraOffices=api;
})(typeof globalThis!=='undefined'?globalThis:this);
