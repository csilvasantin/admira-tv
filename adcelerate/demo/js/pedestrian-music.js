/* Resolve exact Pixeria music + number tags; never substitute unrelated content. */
(function(root){
 const URL='https://stock.admira.store/stock/index.json';
 // Authored fictional preferences for the ten demo characters, not inferred traits.
 const artists={'1786643541589-rb1gz3':'White Rabbit · The Matrix','1786641001650-o0h5zu':'Rage Against the Machine','1786640403818-t5fpqo':'Westlife','1786640147155-omwc1l':'*NSYNC','1786638996270-46fd6n':'The Communards','1786637469495-8zzrgn':"Guns N' Roses",'1786533143983-n2y09e':'Berlin','1786532932584-a1412h':'Huey Lewis & The News','1782023136001-2aqafn':'Benson Boone','1781952357264-shzjr3':'Blur'};
 function preference(number,artist){return 'A Metahuman '+number+' le gusta '+artist;}
 const tag=v=>String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/^#/,'');
 function resolve(items){
  const slots=Array.from({length:10},(_,i)=>({number:i+1,item:null,error:'Falta #musica + #'+(i+1)})),used=new Set();
  for(const slot of slots){
   const matches=items.filter(i=>['video','animation'].includes(i.type)&&Array.isArray(i.tags)&&i.tags.map(tag).includes('musica')&&i.tags.map(tag).includes(String(slot.number)));
   if(matches.length>1){slot.error='Hay varios vídeos con #musica + #'+slot.number;continue;}
   if(matches.length!==1)continue;
   const raw=matches[0];let url;try{url=new globalThis.URL(raw.url);if(url.protocol!=='https:'||url.username||url.password)continue;}catch{continue;}
   if(used.has(url.href)){slot.error='El vídeo ya está asociado a otra persona';continue;}
   used.add(url.href);slot.item={id:'music:'+raw.id,url:url.href,type:'video',title:String(raw.title||'Canción '+slot.number),artist:String(raw.artist||artists[raw.id]||raw.title||'esta canción'),number:slot.number,tags:raw.tags};slot.error=null;
  }
  // Explicit authored drop assignment. Do not alter the catalogue's #7 tag.
  const topGun=items.find(i=>i.id==='1786533143983-n2y09e'&&i.type==='video');
  if(topGun){try{const u=new globalThis.URL(topGun.url);if(u.protocol==='https:'&&!u.username&&!u.password)slots.topGun={id:'music:'+topGun.id,url:u.href,type:'video',title:String(topGun.title),artist:'Berlin · Top Gun',number:1,tags:topGun.tags};}catch{}}
  return slots;
 }
 async function fetchCatalog(fetcher){const response=await fetcher(URL,{cache:'no-store',credentials:'omit'});if(!response.ok)throw Error('Pixeria no está disponible');const data=await response.json();if(!Array.isArray(data.items))throw Error('Catálogo no válido');return resolve(data.items);}
 // Only the most recent intention can play after an asynchronous catalogue load.
 function create({load,play,stop,isCurrent=()=>true,onState=()=>{}}){
  let slots=null,pending=null,revision=0,selected=0,selectedVariant=false;
  const warm=()=>pending||(pending=load().then(value=>(slots=value,value)).catch(error=>{pending=null;throw error}));
  async function select(number,{restart=false,atKiosk=false}={}){
   if(!Number.isInteger(number)||number<0||number>10)return;
   const token=++revision;
   if(number===0){selected=0;stop();onState({number:0,status:'stopped',title:''});return;}
   if(number===selected&&atKiosk===selectedVariant&&!restart&&isCurrent(number))return;
   onState({number,status:'loading',title:atKiosk?'Buscando Top Gun':'Buscando #musica + #'+number});
   try{const catalog=slots||await warm();if(token!==revision)return;
    const slot=atKiosk&&number===1?{item:catalog.topGun,error:'Top Gun no está disponible en el catálogo'}:catalog[number-1];if(!slot?.item){selected=0;stop();onState({number,status:'error',title:slot?.error||'Canción no disponible'});return;}
    selected=number;selectedVariant=atKiosk;const items=catalog.filter(s=>s.item).map(s=>s.item).filter(i=>i.id!==slot.item.id);items.unshift(slot.item);play(slot.item,items);
   }catch(error){if(token!==revision)return;selected=0;stop();onState({number,status:'error',title:error.message});}
  }
  return {warm,select,stop:()=>select(0)};
 }
 const api={resolve,fetchCatalog,create,preference};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PedestrianMusic=api;
})(typeof globalThis!=='undefined'?globalThis:this);
