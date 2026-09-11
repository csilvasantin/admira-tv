// Public catalogue/rules only. The opaque child can never choose a URL,
// credentials, a physical screen, or access Xtore images/history/storage.
const RESOURCES=Object.freeze({catalog:'https://api.admira.store/stock/list?limit=300',rules:'https://brain.digitalavatar.ai/segmentation?target=all'});
const LIMIT=2*1024*1024;
export class PlayerDataBridge{
  constructor({target,fetcher=fetch,now=()=>Date.now()}){Object.assign(this,{target,fetcher,now});this.closed=false;this.active=new Map();this.last=new Map();}
  async receive(event){
    if(this.closed||event.source!==this.target||event.origin!=='null')return;
    const d=event.data;
    if(!d||d.source!=='admira-tv-public-data'||!Object.hasOwn(RESOURCES,d.resource)||typeof d.requestId!=='string'||!/^[a-z0-9-]{8,80}$/i.test(d.requestId))return;
    if(Object.keys(d).some(k=>!['source','resource','requestId'].includes(k)))return;
    if(this.active.has(d.resource)||this.now()-(this.last.get(d.resource)??-Infinity)<2000)return;
    const controller=new AbortController();this.active.set(d.resource,controller);this.last.set(d.resource,this.now());
    const timeout=setTimeout(()=>controller.abort(),10000);
    let data,ok=false;
    try{
      const response=await this.fetcher(RESOURCES[d.resource],{method:'GET',credentials:'omit',cache:'no-store',redirect:'error',signal:controller.signal});
      if(!response.ok||!response.body||Number(response.headers.get('content-length'))>LIMIT)throw new Error('Unavailable public data');
      const reader=response.body.getReader();const chunks=[];let size=0;
      try{for(;;){const item=await reader.read();if(item.done)break;size+=item.value.byteLength;if(size>LIMIT)throw new Error('Public data too large');chunks.push(item.value);}}
      catch(error){await reader.cancel().catch(()=>{});throw error;}
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
      data=JSON.parse(new TextDecoder().decode(bytes));
      if(d.resource==='catalog'?!Array.isArray(data?.items):!Array.isArray(data?.rules))throw new Error('Invalid public data');
      ok=true;
    }catch{/* Report a bounded failure; never forward response headers/errors. */}
    finally{clearTimeout(timeout);this.active.delete(d.resource);}
    if(this.closed||controller.signal.aborted)return;
    try{this.target.postMessage({source:'xtore-public-data',requestId:d.requestId,resource:d.resource,ok,...(ok?{data}:{})},'*');}catch{/* The frame may have been removed. */}
  }
  stop(){this.closed=true;for(const controller of this.active.values())controller.abort();this.active.clear();}
}
