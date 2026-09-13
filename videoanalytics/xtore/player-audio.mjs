// Sound commands have their own acknowledgement, independent of audience TTLs.
export class PlayerAudioBridge {
  constructor({target,onState=()=>{},id=()=>crypto.randomUUID(),setTimer=(fn,ms)=>setTimeout(fn,ms),clearTimer=timer=>clearTimeout(timer)}) {
    Object.assign(this,{target,onState,id,setTimer,clearTimer});
    this.pending=null;this.timer=null;this.closed=false;this.state=null;
  }
  publish(extra={}) { this.onState({...this.state,pending:!!this.pending,...extra}); }
  setMuted(muted) {
    if(this.closed||this.pending||typeof muted!=='boolean')return false;
    const requestId=this.id();this.pending={requestId,muted};
    this.timer=this.setTimer(()=>this.finish('Sin confirmación del sonido. Puedes volver a intentarlo.'),2500);
    this.publish({error:''});
    try { this.target.postMessage({source:'xpaceos-robot-cli',requestId,command:muted?'audiooff':'audioon'},'*'); }
    catch { this.finish('No se pudo comunicar el cambio de sonido.'); }
    return true;
  }
  readState(data) {
    if(!data||typeof data.muted!=='boolean'||!Number.isFinite(data.volume)||data.volume<0||data.volume>1)return false;
    this.state={muted:data.muted||data.volume===0,volume:data.volume};return true;
  }
  receive(event) {
    if(this.closed||event.source!==this.target||event.origin!=='null')return;
    const data=event.data;
    if(data?.source!=='admira-tv-canal')return;
    if(this.pending&&data.requestId===this.pending.requestId) {
      if(data.ok!==true){this.finish('El player no pudo cambiar el sonido.');return;}
      if(!this.readState(data.audio)){this.finish('El player no confirmó su estado de sonido. Actualiza el player.');return;}
      this.finish();
    } else if(['audio-state','media-state'].includes(data.event)&&this.readState(data)) {
      this.publish();
    }
  }
  finish(error='') { this.clearTimer(this.timer);this.timer=null;this.pending=null;this.publish({error}); }
  stop() { this.closed=true;this.clearTimer(this.timer);this.timer=null;this.pending=null; }
}
