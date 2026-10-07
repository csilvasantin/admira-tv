/* Corner camera uses the public PlayerTaza origin; closing destroys the stream. */
(() => {
 const button=document.createElement('button');button.id='taza-expert-button';button.textContent='⌘';button.title='Experto · CLI';button.setAttribute('aria-label','Experto · CLI');button.setAttribute('aria-expanded','false');
 const panel=document.createElement('section');panel.id='taza-expert-cli';panel.hidden=true;panel.setAttribute('aria-label','Consola experta');
 panel.innerHTML='<header><strong>Experto · Jardinets</strong><button type="button" aria-label="Cerrar consola">×</button></header><pre role="log" aria-live="polite">/demo taza · abrir cámara\n/demo taza cerrar · cerrar cámara\n/help · ayuda</pre><form><label for="taza-cli-command">›</label><input id="taza-cli-command" aria-label="Comando experto" placeholder="/demo taza" autocomplete="off"><button>Ejecutar</button></form>';
 const camera=document.createElement('aside');camera.id='taza-corner';camera.hidden=true;camera.setAttribute('aria-label','Cámara de la taza');camera.innerHTML='<header><strong>Taza · cámara en directo</strong><button type="button" aria-label="Cerrar cámara de la taza">×</button></header><div></div>';
 document.body.append(button,panel,camera);
 const log=t=>{const p=panel.querySelector('pre');p.textContent+='\n'+t;p.scrollTop=p.scrollHeight;};
 function closeCamera(){camera.querySelector('div').replaceChildren();camera.hidden=true;log('Cámara cerrada.');}
 function openCamera(){if(!camera.querySelector('iframe')){const frame=document.createElement('iframe');frame.title='Cámara PlayerTaza';frame.allow='camera; autoplay';frame.src='https://ainimation.studio/taza/camera';camera.querySelector('div').append(frame);}camera.hidden=false;log('Cámara abierta. Si el navegador lo solicita, permite el acceso.');panel.hidden=true;button.setAttribute('aria-expanded','false');}
 button.onclick=()=>{panel.hidden=!panel.hidden;button.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden)panel.querySelector('input').focus();};
 panel.querySelector('header button').onclick=()=>{panel.hidden=true;button.setAttribute('aria-expanded','false');button.focus();};camera.querySelector('button').onclick=closeCamera;
 panel.querySelector('form').onsubmit=e=>{e.preventDefault();const input=panel.querySelector('input'),cmd=input.value.trim().toLowerCase().replace(/\s+/g,' ');log('› '+input.value);input.value='';if(cmd==='/demo taza')openCamera();else if(['/demo taza cerrar','/demo taza close','/demo stop'].includes(cmd))closeCamera();else log('Usa /demo taza para abrir y /demo taza cerrar para cerrar.');};
 panel.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape')panel.querySelector('header button').click();});
 addEventListener('pagehide',()=>camera.querySelector('div').replaceChildren());
})();
