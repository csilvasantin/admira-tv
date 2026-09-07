/* North-up street overview: destinations and the actual traversed positions. */
(function(root){
 let pending;
 async function create({host,sites}){
  const [{Map,Polyline},{Marker}]=await Promise.all([google.maps.importLibrary('maps'),google.maps.importLibrary('marker')]);
  const canvas=document.createElement('div');canvas.setAttribute('aria-label','Mapa del recorrido a pie');
  const map=new Map(canvas,{center:sites[0].position,zoom:16,tilt:0,heading:0,disableDefaultUI:true,clickableIcons:false,gestureHandling:'cooperative'});
  const bounds=new google.maps.LatLngBounds();sites.forEach((s,i)=>{bounds.extend(s.position);new Marker({map,position:s.position,label:String(i+1),title:s.name});});map.fitBounds(bounds,24);
  const line=new Polyline({map,strokeColor:'#287e4b',strokeWeight:4});
  const marker=new Marker({map,icon:{path:google.maps.SymbolPath.CIRCLE,scale:6,fillColor:'#226943',fillOpacity:1,strokeColor:'#fff',strokeWeight:2}});
  let last=null;const trail=[];
  const panel=CenitalPanel.create({host,content:canvas,key:'canalkiosk',name:'CanalKiosk',theme:'kiosk',onShow:()=>{google.maps.event.trigger(map,'resize');if(last)map.panTo(last);else map.fitBounds(bounds,24);}});
  function update(state){if(!state.position||!['ready','unavailable'].includes(state.status))return;const p=state.position;if(last&&p.lat===last.lat&&p.lng===last.lng)return;last=p;marker.setPosition(p);trail.push(p);if(trail.length>500)trail.shift();line.setPath(trail);if(panel.visible&&!map.getBounds()?.contains(p))map.panTo(p);}
  return {update};
 }
 root.WalkOverview={create};
})(typeof globalThis!=='undefined'?globalThis:this);
