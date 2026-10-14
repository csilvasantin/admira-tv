import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Ejecuta decir() del producto con reloj controlado. No sustituye la audición física.
const html=fs.readFileSync('gestorColas/pantalla/index.html','utf8');
const source=html.slice(html.indexOf('function tiempoVoz('),html.indexOf('const chips='));
function ensayo({duraciones=[5300,8000],conCola=false,textoLargo=false}={}) {
  let ahora=0,secuencia=0;const timers=new Map(),cancelaciones=[],inicios=[];
  const timer=(fn,ms=0)=>{const id=++secuencia;timers.set(id,{fn,at:ahora+ms});return id;};
  const ss={cancel(){cancelaciones.push(ahora);},speak(u){const i=inicios.length;inicios.push({lang:u.lang,at:ahora});if(duraciones[i]!=null)timer(()=>u.onend(),duraciones[i]);}};
  const texto=textoLargo?'palabra '.repeat(200):'Ana, tu pedido AdmiraNeXT está preparado. Pedido A001, recógelo en barra.';
  const contexto=vm.createContext({
    gen:0,lang:'es',T:{es:{dice:()=>texto,voz:'es-ES',html:()=>''},en:{dice:()=>texto+' Please collect your order at the counter.',voz:'en-GB',html:()=>''}},
    BILINGUE:true,otro:()=> 'en',sigueListo:()=>true,esc:String,$:()=>({innerHTML:'',classList:{add(){},remove(){}}}),
    cola:conCola?[{id:'siguiente'}]:[],said:[],actual:null,cortar:null,inicioAviso:0,topeAviso:0,vozOk:true,hablando:false,
    window:{speechSynthesis:ss},SpeechSynthesisUtterance:class {constructor(text){this.text=text;}},vozDe:()=>null,
    Date:{now:()=>ahora},setTimeout:timer,clearTimeout:id=>timers.delete(id)
  });
  vm.runInContext(source,contexto);
  const avance=async ms=>{const fin=ahora+ms;while(true){const siguiente=[...timers].filter(([,t])=>t.at<=fin).sort((a,b)=>a[1].at-b[1].at)[0];if(!siguiente)break;ahora=siguiente[1].at;timers.delete(siguiente[0]);siguiente[1].fn();await Promise.resolve();}ahora=fin;await Promise.resolve();};
  return {contexto,avance,inicios,cancelaciones};
}
test('la llamada bilingüe termina ambos idiomas después de 12 s, también con pedidos esperando',async()=>{
  for(const conCola of [false,true]){
    const e=ensayo({conCola});const fin=e.contexto.decir({id:'primero',numero:'A001',nombre:'Ana'});
    await e.avance(12500);assert.equal(e.contexto.said.length,0,'el inglés aún está hablando');
    await e.avance(2500);await fin;
    assert.equal(e.contexto.said[0].motivo,'fin');assert.deepEqual(Array.from(e.contexto.said[0].dichas),['es-ES','en-GB']);
    assert.equal(e.cancelaciones.length,1,'sólo la limpieza anterior al aviso cancela');
  }
});
test('una voz sin eventos tiene plazo finito y libera el siguiente aviso',async()=>{
  const e=ensayo({duraciones:[null,100,100],conCola:true});
  e.contexto.cola.unshift({id:'primero',numero:'A001',nombre:'Ana'});
  const fin=e.contexto.siguiente();await e.avance(65000);await fin;
  assert.equal(e.contexto.said[0].motivo,'tope');assert.equal(e.contexto.said[1].motivo,'fin');assert.equal(e.contexto.hablando,false);
  assert.ok(e.contexto.said[0].ms<=60000);
});
test('un nombre muy largo tampoco elimina la guardia de 60 s del aviso bilingüe',async()=>{
  const e=ensayo({duraciones:[null],textoLargo:true});const fin=e.contexto.decir({id:'primero',numero:'A001'});
  await e.avance(61000);await fin;assert.equal(e.contexto.said[0].motivo,'tope');assert.equal(e.contexto.said[0].ms,60000);
});
