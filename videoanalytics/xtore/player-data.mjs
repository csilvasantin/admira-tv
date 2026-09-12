// Public catalogue/rules only. The opaque child can never choose a URL,
// credentials, a physical screen, or access Xtore images/history/storage.
import {XTORE_VIRTUAL_SCREEN} from './virtual-player.mjs';
// Complete public index: stock/list caps at 200, which can hide newer #musica
// matches. The same 2 MiB bounded, credential-free read applies to this URL.
const RESOURCES=Object.freeze({catalog:'https://stock.admira.store/stock/index.json',rules:'https://brain.digitalavatar.ai/segmentation?target=all',playlist:`https://admira.tv/api/playlist?screen=${XTORE_VIRTUAL_SCREEN}`});
const LIMIT=2*1024*1024;
export class PlayerDataBridge{
  constructor({target,fetcher=fetch,now=()=>Date.now()}){Object.assign(this,{target,fetcher,now});this.closed=false;this.active=new Map();this.last=new Map();this.recent=new Map();}
  reply(resource,requestId,result){
    if(this.closed)return;
    try{this.target.postMessage({source:'xtore-public-data',requestId,resource,...result},'*');}catch{/* Removed frame. */}
  }
  async receive(event){
    if(this.closed||event.source!==this.target||event.origin!=='null')return;
    const d=event.data;
    if(!d||d.source!=='admira-tv-public-data'||!Object.hasOwn(RESOURCES,d.resource)||typeof d.requestId!=='string'||!/^[a-z0-9-]{8,80}$/i.test(d.requestId))return;
    if(Object.keys(d).some(k=>!['source','resource','requestId'].includes(k)))return;
    const pending=this.active.get(d.resource);
    if(pending){
      if(pending.requests.size<16)pending.requests.add(d.requestId);
      else this.reply(d.resource,d.requestId,{ok:false});
      return;
    }
    if(this.now()-(this.last.get(d.resource)??-Infinity)<2000){this.reply(d.resource,d.requestId,this.recent.get(d.resource)??{ok:false});return;}
    const controller=new AbortController(),requests=new Set([d.requestId]);
    this.active.set(d.resource,{controller,requests});this.last.set(d.resource,this.now());
    const timeout=setTimeout(()=>controller.abort(),10000);
    let data,ok=false,stage='network';
    try{
      // Browser fetch must not receive this bridge instance as its receiver.
      // Calling this.fetcher(...) can throw Illegal invocation before any network.
      const response=await (0,this.fetcher)(RESOURCES[d.resource],{method:'GET',credentials:'omit',cache:'no-store',redirect:'error',signal:controller.signal});
      stage='http-'+response.status;
      if(!response.ok||!response.body||Number(response.headers.get('content-length'))>LIMIT)throw new Error('Unavailable public data');
      const reader=response.body.getReader();const chunks=[];let size=0;
      stage='read-body';
      try{for(;;){const item=await reader.read();if(item.done)break;size+=item.value.byteLength;if(size>LIMIT)throw new Error('Public data too large');chunks.push(item.value);}}
      catch(error){await reader.cancel().catch(()=>{});throw error;}
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
      stage='json';data=JSON.parse(new TextDecoder().decode(bytes));
      stage='shape';
      if(d.resource==='catalog'?!Array.isArray(data?.items):d.resource==='rules'?!Array.isArray(data?.rules):data?.ok!==true||!Array.isArray(data?.draft?.items))throw new Error('Invalid public data');
      // The frame needs only the public playlist, never audit fields/user email.
      if(d.resource==='playlist')data={ok:true,draft:{items:data.draft.items}};
      ok=true;
    }catch{/* Bounded diagnostics: no headers, URLs, response bodies or raw errors. */
      console.warn('[xtore-public-data]',d.resource,controller.signal.aborted?'timeout':stage);
    }
    finally{clearTimeout(timeout);this.active.delete(d.resource);}
    if(this.closed)return;
    // Timeout is an explicit failure, not a silent missing response. Share one
    // bounded fetch with simultaneous readers, preserving every correlation ID.
    const result={ok,...(ok?{data}:{})};this.recent.set(d.resource,result);
    for(const requestId of requests)this.reply(d.resource,requestId,result);
  }
  stop(){this.closed=true;for(const {controller} of this.active.values())controller.abort();this.active.clear();this.recent.clear();}
}
