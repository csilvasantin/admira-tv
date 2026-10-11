import {decodeImage,stockPayload} from './twins.mjs';

const API='https://api.admira.store';
// /image/edit es de pago (401 sin sesión Pixeria): va por el relé con la sesión de Admira.tv.
const EDIT='/videoanalytics/api/twin-edit';
// No original is sent to Stock, spawn queues, URL importers, logs or browser storage.
async function request(url,body,signal,credentials='omit'){
  const controller=new AbortController(),cancel=()=>controller.abort();
  signal.addEventListener('abort',cancel,{once:true});
  const timer=setTimeout(cancel,90_000);
  if(signal.aborted)cancel();
  try{
    const response=await fetch(url,{method:'POST',mode:credentials==='omit'?'cors':'same-origin',credentials,cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});
    if(!response.ok){await response.body?.cancel();throw new Error(response.status===401?'login':response.status===403?'access':'pixeria-unavailable');}
    const reader=response.body.getReader(),chunks=[];let size=0;
    try{
      while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8_100_000)throw new Error('response-too-large');chunks.push(value);}
      const bytes=new Uint8Array(size);let offset=0;
      for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;chunk.fill(0);}
      try{return JSON.parse(new TextDecoder().decode(bytes));}finally{bytes.fill(0);}
    }finally{await reader.cancel().catch(()=>{});for(const chunk of chunks)chunk.fill(0);}
  }finally{clearTimeout(timer);signal.removeEventListener('abort',cancel);body.image=null;body.base64=null;}
}
export async function generateTwin({source,category,style,signal}){
  const canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;
  let original,result;
  try{
    canvas.getContext('2d').putImageData(new ImageData(source.data,source.width,source.height),0,0);
    original=canvas.toDataURL('image/png');
    canvas.width=1;canvas.height=1;
    const response=await request(EDIT,{image:original,category,style},signal,'same-origin');
    if(signal.aborted||!response.ok||response.image===original)throw new Error('no-new-result');
    result=decodeImage(response.image);response.image=null;
    // Decode before declaring success; a data URL alone is not a usable image.
    const bitmap=await createImageBitmap(new Blob([result.bytes],{type:result.mime}));
    try{if(bitmap.width<8||bitmap.height<8||bitmap.width>4096||bitmap.height>4096)throw new Error('invalid-size');}finally{bitmap.close();}
    if(signal.aborted)throw new Error('cancelled');
    return result;
  }catch(error){result?.bytes.fill(0);throw error;}
  finally{original=null;canvas.width=1;canvas.height=1;}
}
export async function publishTwin({result,category,style,signal}){
  const response=await request(API+'/stock/publish',stockPayload(result,category,style),signal);
  if(!response.ok||!response.id||!response.url)throw new Error('publication-unconfirmed');
  return {id:response.id,url:response.url};
}
