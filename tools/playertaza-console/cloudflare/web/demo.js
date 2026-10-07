/* Demos exercise the source applications; physical confirmation remains explicit. */
window.TazaDemo = function({api,project,status,say,expected}) {
  const kiosk='https://admira.tv/adcelerate/demo/?view=human&site=jardinets';
  const queue='https://admira.tv/gestorColas/?store=starbucks-paseo-de-gracia';
  const store='starbucks-paseo-de-gracia', relay='https://mcp-ainimation.admira.store';
  let generation=0, active=null, target=null;
  const requests=new Map();
  addEventListener('message',e=>{const d=e.data;if(e.origin!=='https://admira.tv'||e.source!==target||d?.channel!=='taza-demo-v1')return;const p=requests.get(d.id);if(p){requests.delete(d.id);clearTimeout(p.timer);d.error?p.reject(Error(d.error)):p.resolve(d);}});
  const pause=ms=>new Promise(r=>setTimeout(r,ms));
  async function check(g){if(g!==generation)throw Error('Demo detenida');const b=await status();if(g!==generation||!b?.enabled||b.revision!==active?.revision)throw Error('Demo detenida: ha cambiado el proyecto');if(target?.closed)throw Error('Demo detenida: se cerró la aplicación');}
  function send(number){return new Promise((resolve,reject)=>{const id=crypto.randomUUID(),timer=setTimeout(()=>{requests.delete(id);reject(Error('El kiosko no responde al control de demo'));},4000);requests.set(id,{resolve,reject,timer});target.postMessage({channel:'taza-demo-v1',action:'select',number,id},'https://admira.tv');});}
  async function order(path,body){const r=await fetch(relay+'/cola/'+path+'?store='+store,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok||!d.ok)throw Error(d.error||'Error del gestor de colas');return d;}
  async function sequence(kind,g){try{
    await project(kind==='canalkiosk'?'canalkiosk':'colas');if(g!==generation)return;
    active={revision:(await status()).revision};
    say('Demo '+kind+' iniciada. Abre la cámara del player para contrastar los LED. /demo stop detiene los siguientes pasos.');
    for(let i=0;i<3;i++){
      await check(g);
      if(kind==='canalkiosk'){
        let result,lastError;
        for(let attempt=0;attempt<6;attempt++){await check(g);try{result=await send([6,4,10][i]);break;}catch(e){lastError=e;await pause(1500);}}
        if(!result)throw lastError;
        await check(g);expected(result.title);say('Paso '+(i+1)+'/3: el kiosko ha seleccionado '+result.title+'. Comprueba el nombre en la taza. Siguiente cambio en 30 segundos.');
      }else{
        const id='taza-demo-'+crypto.randomUUID();
        const p=await order('pedido',{id,nombre:['Demo Ana','Demo Luis','Demo Eva'][i],total:0,prep:600});
        await check(g);await order('avanzar',{id,a:'preparando'});
        say('Paso '+(i+1)+'/3: pedido '+p.numero+' ('+p.nombre+') en preparación. Pasará a listo en 5 segundos.');
        await pause(5000);await check(g);await order('avanzar',{id,a:'listo'});
        expected(p.nombre+' · PEDIDO LISTO');say('Pedido '+p.numero+' listo. El seguimiento de colas debe avisar a la taza: '+p.nombre+'. Compruébalo en la cámara.');
      }
      await pause(30000);
    }
    await check(g);say('Demo terminada: tres cambios ejecutados. Confirma el último contenido solo si lo has visto en la taza.');active=null;
  }catch(e){if(g===generation){say(e.message);active=null;}}}
  return {start(arg){const kind=({'1':'canalkiosk',canalkiosk:'canalkiosk','2':'starbucks',starbucks:'starbucks'})[arg];if(!kind)throw Error('Usa /demo 1, /demo canalkiosk, /demo 2, /demo starbucks o /demo stop');const g=++generation;target=window.open(kind==='canalkiosk'?kiosk:queue,'taza-demo-site');if(!target)throw Error('Permite abrir la ventana de demo y vuelve a ejecutar el comando.');sequence(kind,g);},stop(){generation++;active=null;for(const p of requests.values()){clearTimeout(p.timer);p.reject(Error('Demo detenida'));}requests.clear();say('Demo detenida. No se enviarán más pasos; las aplicaciones permanecen abiertas.');}};
};
