// Only commands without images, identity, sex or age cross this bridge.
import {XTORE_VIRTUAL_CIRCUIT,XTORE_VIRTUAL_NAME} from './virtual-player.mjs';
import {PRESENCE_GRACE} from './core.mjs';
export const PLAYER_ORIGIN='https://admira.tv';
export const AUDIENCE_TTL=6000;
export const VEHICLE_EXIT_TAIL=2000;
const KIND_COMMAND={person:'persona',car:'coche',motorcycle:'moto',bicycle:'bici',none:'u'};
const VEHICLES=new Set(['bicycle','motorcycle','car']);
export function playerURL(id,origin=PLAYER_ORIGIN){
  if(!/^xtore-virtual-[a-z0-9-]{8,64}$/.test(id))throw new Error('Expected a dedicated virtual player ID');
  if(!/^(https:\/\/(www\.)?admira\.tv|http:\/\/(localhost|127\.0\.0\.1):\d+)$/.test(origin))throw new Error('Untrusted virtual player origin');
  const url=new URL('/canal.html',origin);
  // Aspect is CSS geometry, not a catalogue tag. Opaque frames cannot use the
  // player's disk-first cache; stream is its existing, explicit fallback.
  for(const [k,v] of Object.entries({clean:1,stream:1,xtoreParent:1,xtoreMusic:1,parentOrigin:origin,playerType:'virtual',name:XTORE_VIRTUAL_NAME,mode:'conditional',modeLock:1,muted:0,cam:0,shot:0,rtb:0,screen:id,circuit:XTORE_VIRTUAL_CIRCUIT,machine:'',audience:'all',age:'all',category:'all'}))url.searchParams.set(k,v);
  return url.href;
}
export class SignageBridge{
  constructor({target,onState=()=>{},onFailure=()=>{},now=()=>Date.now(),setTimer=(fn,ms)=>setTimeout(fn,ms),clearTimer=timer=>clearTimeout(timer),id=()=>crypto.randomUUID(),relay=null}){
    Object.assign(this,{target,onState,onFailure,now,setTimer,clearTimer,id,relay});
    this.relayKind=null;this.relayAt=-Infinity;
    this.pending=new Map();this.ready=false;this.closed=false;this.expiry=0;this.deadline=0;this.revision=0;this.watchdog=null;this.probeTimer=0;
    this.presenceSamples=[];this.presenceKind=null;this.presenceSentAt=-Infinity;
    this.vehicleTails=new Map();this.presenceEvidence=new Map();this.seenObservations=new WeakMap();
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
    this.relayCategory(kind);
  }
  // FLT-100400: paired physical screens follow this player through the audience bus. Only the
  // category crosses (person|car|motorcycle|bicycle|none), at most once per second per kind; a
  // change of category or «none» goes out at once. Relay failures never touch the local player.
  relayCategory(kind){
    if(typeof this.relay!=='function')return;
    const now=this.now();
    if(kind===this.relayKind&&kind!=='none'&&now-this.relayAt<900)return;
    if(kind==='none'&&this.relayKind==='none')return;
    this.relayKind=kind;this.relayAt=now;
    try{Promise.resolve(this.relay(kind)).catch(()=>{});}catch{}
  }
  passage(events){
    if(!this.ready||this.closed)return;
    // Vehicle priority matches the capture; never use incidental rider sex/age.
    const item=['bicycle','motorcycle','car','person'].map(kind=>events.find(e=>e.class===kind)).find(Boolean);
    if(!item)return;
    this.presenceSamples=[];this.presenceKind=null;this.vehicleTails.clear();
    this.clearTimer(this.expiry);this.deadline=this.now()+AUDIENCE_TTL;
    this.command(item.class);
    this.expiry=this.setTimer(()=>{this.deadline=0;this.command('none');},AUDIENCE_TTL);
  }
  presence(observations){
    if(!this.ready||this.closed)return;
    const now=this.now(),fresh=new Map();
    // ageMs comes from the captured frame, not inference completion. Neither
    // ID nor geometry crosses the player bridge. observedAt is only a local
    // evidence token: its clock need not match the bridge's clock. Replaying
    // the same frame, including a copied object with old ageMs, cannot renew.
    for(const o of Array.isArray(observations)?observations:[]){
      if(!o||o.confirmed!==true||o.class==='none'||!Object.hasOwn(KIND_COMMAND,o.class)||!Number.isFinite(o.ageMs)||o.ageMs<0||o.ageMs>=PRESENCE_GRACE)continue;
      const stamp=Number.isFinite(o.observedAt)&&o.observedAt>=0?o.observedAt:null;
      let until=now+PRESENCE_GRACE-o.ageMs;
      const seen=this.seenObservations.get(o),prior=this.presenceEvidence.get(o.class);
      if(seen&&seen.stamp===stamp)until=Math.min(until,seen.until);
      if(stamp!==null&&prior){
        if(stamp<prior.stamp)continue;
        if(stamp===prior.stamp)until=Math.min(until,prior.until);
      }
      this.seenObservations.set(o,{stamp,until});
      if(stamp!==null)this.presenceEvidence.set(o.class,{stamp,until});
      if(until<=now)continue;
      if(!fresh.has(o.class)||fresh.get(o.class).until<until)fresh.set(o.class,{kind:o.class,freshUntil:until,until});
      if(VEHICLES.has(o.class)){
        const tail=this.vehicleTails.get(o.class),end=until+VEHICLE_EXIT_TAIL;
        if(!tail||tail.until<end)this.vehicleTails.set(o.class,{kind:o.class,freshUntil:until,until:end});
      }
    }
    this.presenceSamples=[...fresh.values()];
    this.syncPresence();
  }
  syncPresence(){
    if(!this.ready||this.closed)return;
    const now=this.now();
    this.presenceSamples=this.presenceSamples.filter(o=>o.until>now);
    for(const [kind,tail] of this.vehicleTails)if(tail.until<=now)this.vehicleTails.delete(kind);
    const candidates=[...this.presenceSamples,...this.vehicleTails.values()];
    const item=['bicycle','motorcycle','car','person'].map(kind=>candidates.filter(o=>o.kind===kind).sort((a,b)=>b.until-a.until)[0]).find(Boolean);
    if(!item){if(this.presenceKind!==null)this.neutral();return;}
    this.clearTimer(this.expiry);this.deadline=item.until;
    const changed=this.presenceKind!==item.kind;
    this.presenceKind=item.kind;
    // Wait for an outstanding same-kind ACK instead of replacing its ID at
    // frame rate. The original watchdog still bounds an unresponsive player.
    if(changed||(now<item.freshUntil&&now-this.presenceSentAt>=1000&&!Array.from(this.pending.values()).some(p=>p.kind===item.kind))){
      this.presenceSentAt=now;this.command(item.kind);
    }
    // The exit tail only retains music, not visual presence or boxes. Never
    // renew a command solely because its tail is still running. Both stages
    // expire without requiring another frame; a higher-priority vehicle wins.
    const next=item.freshUntil>now?item.freshUntil:item.until;
    this.expiry=this.setTimer(()=>this.syncPresence(),Math.max(1,next-now));
  }
  neutral(){
    if(!this.ready||this.closed)return;
    this.clearTimer(this.expiry);this.deadline=0;this.presenceSamples=[];this.presenceKind=null;this.vehicleTails.clear();this.command('none');
  }
  receive(event){
    // 'null' alone is NOT trust: require the dedicated frame and a pending ID.
    if(this.closed||event.origin!=='null'||event.source!==this.target)return;
    const data=event.data;if(!data||data.source!=='admira-tv-canal')return;
    if(this.deadline&&this.now()>=this.deadline){
      if(this.presenceKind!==null)this.syncPresence();
      else{this.clearTimer(this.expiry);this.deadline=0;this.command('none');}
    }
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
      this.onState({type:'media',mode:data.mode,phase:['playing','document-loaded','poster-loaded','audio-blocked','playlist-empty','playlist-unavailable'].includes(data.phase)?data.phase:'selected',loop:data.loop===true,music:data.music===true,musicSource:['playlist','pixeria-musica'].includes(data.musicSource)?data.musicSource:null,mediaType:data.mediaType==='audio'?'audio':null,muted:typeof data.muted==='boolean'?data.muted:null,volume:Number.isFinite(data.volume)?Math.max(0,Math.min(1,data.volume)):null});
    }
  }
  fail(message){if(this.closed)return;this.stop();this.onFailure(message);}
  stop(){
    this.closed=true;this.ready=false;this.clearTimer(this.expiry);this.clearTimer(this.probeTimer);
    this.presenceSamples=[];this.presenceKind=null;this.vehicleTails.clear();this.presenceEvidence.clear();this.seenObservations=new WeakMap();
    this.clearTimer(this.watchdog);this.watchdog=null;this.pending.clear();
  }
}
