/* Read-only catalogue for the twin. Media URLs stay inside its renderer. */
(function(root){
 'use strict';
 const STOCK_URL='https://api.admira.store/stock/list?limit=300';
 const text=(value,max)=>String(value??'').slice(0,max);
 const title=value=>text(String(value??'').replace(/&#(?:39|x27);/gi,"'").replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&nbsp;/g,' '),240);
 function mediaURL(value){
  try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href.replace(/^https:\/\/www\.admira\.tv\//,'https://admira.tv/'):null;}catch(_){return null;}
 }
 function normalize(value,index,stock){
  if(!value||typeof value!=='object')return null;
  const type=({animation:'video','digital-twin':'image','twin-npc':'image'})[value.type]||value.type,url=mediaURL(value.url);
  if(!['video','image'].includes(type)||!url)return null;
  const rawId=text(value.id||'program-'+index,stock?154:160),id=(stock?'stock:':'')+rawId;
  const number=Number.isSafeInteger(value.num)&&value.num>0?value.num:index+1;
  return {id,url,type,title:title(value.title||value.name||((type==='image'?'Imagen ':'Vídeo ')+number)),
   seconds:Number.isFinite(value.seconds)&&value.seconds>0?Math.min(120,value.seconds):9,
   lane:['publicidad','municipal'].includes(value.lane)?value.lane:null,source:stock?'stock':value.source||'grid'};
 }
 function build(scheduledQueue,stockItems=[]){
  const items=[],ids=new Set(),urls=new Map(),scheduled=[],stock=[];
  function add(raw,index,isStock){
   const item=normalize(raw,index,isStock);if(!item||items.length>=512)return;
   if(isStock&&urls.has(item.url)){stock.push(urls.get(item.url));return;}
   if(ids.has(item.id))return;
   ids.add(item.id);urls.set(item.url,item.id);items.push(item);(isStock?stock:scheduled).push(item.id);
  }
  (Array.isArray(scheduledQueue)?scheduledQueue:[]).slice(0,212).forEach((i,n)=>add(i,n,false));
  (Array.isArray(stockItems)?stockItems:[]).slice(0,300).forEach((i,n)=>add(i,n,true));
  const playlists=[
   {id:'scheduled',title:'Programación actual',items:scheduled},
   {id:'all',title:'Todo el catálogo',items:items.map(i=>i.id)},
   ...['publicidad','municipal','video','image'].map(id=>({id,title:{publicidad:'Anuncios',municipal:'Información municipal',video:'Vídeos',image:'Imágenes'}[id],items:items.filter(i=>i.lane===id||i.type===id).map(i=>i.id)})),
   {id:'stock',title:'Stock de Admira',items:[...new Set(stock)]}
  ].filter(p=>p.items.length||p.id==='scheduled');
  return {items,playlists};
 }
 async function fetchStock(fetcher,signal){
  const response=await fetcher(STOCK_URL,{cache:'no-store',credentials:'omit',signal});
  if(!response.ok)throw new Error('Catálogo no disponible');
  const data=await response.json();return (Array.isArray(data)?data:Array.isArray(data?.items)?data.items:[]).slice(0,300);
 }
 const api={build,fetchStock,STOCK_URL};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PlayerLibrary=api;
})(typeof globalThis!=='undefined'?globalThis:this);
