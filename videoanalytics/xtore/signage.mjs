// Only commands without images, identity, sex or age cross this bridge.
export const PLAYER_ORIGIN='https://admira.tv';
export const AUDIENCE_TTL=6000;
const KIND_COMMAND={person:'persona',car:'coche',motorcycle:'moto',bicycle:'bici',none:'u'};
export function playerURL(id,origin=PLAYER_ORIGIN){
  if(!/^xtore-virtual-[a-z0-9-]{8,64}$/.test(id))throw new Error('Expected a dedicated virtual player ID');
  if(!/^(https:\/\/(www\.)?admira\.tv|http:\/\/(localhost|127\.0\.0\.1):\d+)$/.test(origin))throw new Error('Untrusted virtual player origin');
  const url=new URL('/canal.html',origin);
  // Aspect is CSS geometry, not a catalogue tag. Opaque frames cannot use the
  // player's disk-first cache; stream is its existing, explicit fallback.
  for(const [k,v] of Object.entries({clean:1,stream:1,xtoreParent:1,parentOrigin:origin,mode:'conditional',modeLock:1,muted:1,cam:0,shot:0,rtb:0,screen:id,circuit:id,machine:id,audience:'all',age:'all',category:'all'}))url.searchParams.set(k,v);
  return url.href;
}
export class SignageBridge{
  constructor({target,onState=()=>{},onFailure=()=>{},now=()=>Date.now(),setTimer=(fn,ms)=>setTimeout(fn,ms),clearTimer=timer=>clearTimeout(timer),id=()=>crypto.randomUUID()}){
    Object.assign(this,{target,onState,onFailure,now,setTimer,clearTimer,id});
    this.pending=new Map();this.ready=false;this.closed=false;this.expiry=0;this.deadline=0;this.revision=0;this.watchdog=null;this.probeTimer=0;
  }
  start(){
    this.command('none',20000);
    // Do not depend on iframe.load: a slow child image/stream can delay that
    // event although its command listener is already usable. Only startup's
    // idempotent neutral command is retried, with the same request ID.
    const probe=()=>{
      if(this.closed||this.ready)return;
      const entry=this.pending.entries().next().value;
      if(entry)this.send(entry[0],'none');
      this.probeTimer=this.setTimer(probe,500);
    };
    this.probeTimer=this.setTimer(probe,500);
  }
  send(requestId,kind){
    try{this.target.postMessage({source:'xpaceos-robot-cli',requestId,command:`admiratv audiencia ${KIND_COMMAND[kind]}`},'*');}
    catch{this.fail('No se pudo comunicar con el player.');}
  }
  command(kind,timeout=2500){
    if(this.closed||!Object.hasOwn(KIND_COMMAND,kind))return;
    // A later category supersedes the previous request. Do not let a delayed
    // failure from an older command tear down a newer, acknowledged state.
    this.pending.clear();
    const requestId=this.id(),revision=++this.revision;
    // A continuous stream must not extend an unacknowledged channel forever.
    if(this.watchdog===null)this.watchdog=this.setTimer(()=>this.fail('Sin confirmación del player. Revisa la versión y el permiso del origen.'),timeout);
    this.pending.set(requestId,{kind,revision});
    // The iframe has an opaque sandbox origin, so '*' is required. The target
    // is the exact iframe WindowProxy, never a broadcast; payload has no images.
    this.send(requestId,kind);
  }
  passage(events){
    if(!this.ready||this.closed)return;
    // Vehicle priority matches the capture; never use incidental rider sex/age.
    const item=['bicycle','motorcycle','car','person'].map(kind=>events.find(e=>e.class===kind)).find(Boolean);
    if(!item)return;
    this.clearTimer(this.expiry);this.deadline=this.now()+AUDIENCE_TTL;
    this.command(item.class);
    this.expiry=this.setTimer(()=>{this.deadline=0;this.command('none');},AUDIENCE_TTL);
  }
  neutral(){
    if(!this.ready||this.closed)return;
    this.clearTimer(this.expiry);this.deadline=0;this.command('none');
  }
  receive(event){
    // 'null' alone is NOT trust: require the dedicated frame and a pending ID.
    if(this.closed||event.origin!=='null'||event.source!==this.target)return;
    const data=event.data;if(!data||data.source!=='admira-tv-canal')return;
    if(this.deadline&&this.now()>=this.deadline){this.clearTimer(this.expiry);this.deadline=0;this.command('none');}
    const request=this.pending.get(data.requestId);
    if(request){
      this.pending.delete(data.requestId);
      if(request.revision!==this.revision)return;
      if(data.ok!==true){this.fail('El player no acepta esta categoría. Actualiza el player de Admira.tv.');return;}
      this.clearTimer(this.watchdog);this.watchdog=null;
      this.clearTimer(this.probeTimer);
      this.ready=true;this.onState({type:'ack',kind:request.kind});
    }else if(data.event==='media-state'&&['conditional','sync','local'].includes(data.mode)&&((typeof data.id==='string'&&data.id.length>0)||typeof data.id==='number')){
      // This is an emission report, not proof that the rule selected the right ad.
      this.onState({type:'media',mode:data.mode,phase:['playing','document-loaded','poster-loaded'].includes(data.phase)?data.phase:'selected',loop:data.loop===true});
    }
  }
  fail(message){if(this.closed)return;this.stop();this.onFailure(message);}
  stop(){
    this.closed=true;this.ready=false;this.clearTimer(this.expiry);this.clearTimer(this.probeTimer);
    this.clearTimer(this.watchdog);this.watchdog=null;this.pending.clear();
  }
}
