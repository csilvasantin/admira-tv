/* Deterministic 2D movement and eight authored walking poses. */
(function(root){
 const arrows={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
 const poses=[{left:-12,right:10,bob:0,tilt:-1},{left:-7,right:7,bob:-1,tilt:-.5},{left:0,right:0,bob:-2,tilt:0},{left:7,right:-7,bob:-1,tilt:.5},{left:12,right:-10,bob:0,tilt:1},{left:7,right:-7,bob:-1,tilt:.5},{left:0,right:0,bob:-2,tilt:0},{left:-7,right:7,bob:-1,tilt:-.5}];
 function displacement(keys,seconds,speed){const v=[0,0];for(const key of keys){if(arrows[key]){v[0]+=arrows[key][0];v[1]+=arrows[key][1];}}const length=Math.hypot(...v);return length?v.map(n=>n/length*Math.min(.05,Math.max(0,seconds))*speed):[0,0];}
 function pose(distance,stride=24){const frame=Math.floor(Math.max(0,distance)/stride*8)%8;return {frame,steps:Math.floor(Math.max(0,distance)/stride*2),...poses[frame]};}
 function occupancy(size=10){const ranks=Array(size).fill(0);let clock=0,owner=null;return {
  update(index,inside,activate=false){const entered=inside&&!ranks[index];if(inside){if(entered||activate)ranks[index]=++clock;}else ranks[index]=0;
   const next=ranks.reduce((best,n,i)=>n&&(best===null||n>ranks[best])?i:best,null),changed=next!==owner;owner=next;return {owner,changed,entered};},
  clear(){ranks.fill(0);owner=null;},get owner(){return owner;}
 };}
 const api={arrows,poses,displacement,pose,occupancy};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PedestrianMotion=api;
})(typeof globalThis!=='undefined'?globalThis:this);
