// Latido del snapshot agregado hacia el productor servidor VA (FLT-101113 · #4475).
// El navegador NO tiene claves de flota: solo entrega el snapshot a su propio
// origen con la cookie admin; el servidor lo publica en va_session_publish.
// TTL del MCP = 4 s, así que se late cada 2 s mientras hay análisis.
const API='/videoanalytics/api/va-session';
// Estos errores no se arreglan reintentando: el puente se apaga hasta recargar.
const FATAL=new Set(['unauthorized','forbidden','va_bridge_not_configured','va_scope_denied','va_identity_required']);

export class VaProducer{
  constructor({snapshot,fetchImpl=(...args)=>fetch(...args),interval=2000,onState=()=>{}}){
    Object.assign(this,{snapshot,fetchImpl,interval,onState});
    this.timer=0;this.running=false;this.inFlight=false;this.off=null;this.error=null;this.published=0;this.revision=null;
  }
  start(){
    if(this.running||this.off)return;
    this.running=true;this.tick();
  }
  // Un último latido lleva el estado paused/disconnected al MCP antes de parar.
  stop(){
    if(!this.running)return;
    this.running=false;clearTimeout(this.timer);this.timer=0;
    return this.send();
  }
  async tick(){
    if(!this.running)return;
    await this.send();
    if(this.running&&!this.off)this.timer=setTimeout(()=>this.tick(),this.interval);
  }
  async send(){
    if(this.inFlight||this.off)return;
    this.inFlight=true;
    try{
      const response=await this.fetchImpl(API,{method:'POST',credentials:'same-origin',cache:'no-store',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({snapshot:this.snapshot()}),signal:AbortSignal.timeout(5000)});
      let data=null;try{data=await response.json();}catch{}
      const error=data?.ok===true?null:(data?.error||`http_${response.status}`);
      if(error){this.error=error;if(FATAL.has(error)){this.off=error;this.running=false;clearTimeout(this.timer);}}
      else{this.error=null;this.published++;this.revision=data.revision;}
    }catch{this.error='network';}
    finally{this.inFlight=false;this.onState(this);}
  }
}
