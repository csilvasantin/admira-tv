(() => {
 const video=document.getElementById('local-camera'),live=document.getElementById('live');
 const open=document.getElementById('camera-open'),stop=document.getElementById('camera-stop');
 const device=document.getElementById('camera-device'),message=document.getElementById('camera-message');
 const brightness=document.getElementById('camera-brightness'),brightnessValue=document.getElementById('camera-brightness-value');
 function adjustBrightness(){video.style.filter='brightness('+Number(brightness.value)/100+')';brightnessValue.textContent=brightness.value+'%';}
 brightness.addEventListener('input',adjustBrightness);adjustBrightness();
 const pill=document.getElementById('cam-pill');let stream=null;live.hidden=true;live.style.display='none';pill.textContent='cámara cerrada';
 function close(){
  if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;
  video.hidden=true;video.style.display='none';live.hidden=true;live.style.display='none';window.playerTazaLocalCamera=false;
  stop.disabled=true;message.textContent='Cámara cerrada.';pill.textContent='sin cámara';pill.className='pill';
 }
 async function start(id){
  open.disabled=true;
  try{
   if(!navigator.mediaDevices?.getUserMedia)throw Error('Abre esta app en localhost o HTTPS para usar la cámara.');
   if(stream)close();
   stream=await navigator.mediaDevices.getUserMedia({video:id?{deviceId:{exact:id}}:{width:{ideal:1280},height:{ideal:720}},audio:false});
   video.srcObject=stream;video.hidden=false;video.style.display='block';live.hidden=true;live.style.display='none';
   await video.play();window.playerTazaLocalCamera=true;stop.disabled=false;
   const devices=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput');
   device.replaceChildren(...devices.map((d,i)=>new Option(d.label||'Cámara '+(i+1),d.deviceId)));
   device.value=stream.getVideoTracks()[0].getSettings().deviceId;device.disabled=false;
   message.textContent='Cámara en directo · imágenes solo en este navegador.';pill.textContent='cámara de este Mac';pill.className='pill ok';
   stream.getVideoTracks()[0].addEventListener('ended',close,{once:true});
  }catch(e){close();message.textContent=e.name==='NotAllowedError'?'Permiso de cámara denegado. Permite la cámara para esta página en Chrome y en Ajustes de macOS.':e.message;}
  finally{open.disabled=false;}
 }
 open.addEventListener('click',()=>start(device.value||undefined));
 stop.addEventListener('click',close);device.addEventListener('change',()=>start(device.value));
 document.getElementById('camera-expand').addEventListener('click',()=>document.body.classList.toggle('camera-expanded'));
 window.addEventListener('pagehide',close);
})();
