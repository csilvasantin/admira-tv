// Bound every initialization phase, including tf.ready(), not only model download.
export function deadline(task,{label,ms,onProgress=()=>{},disposeLate=()=>{}}){
  let expired=false,timer,tick;const started=Date.now();
  onProgress(`${label} · 0 s`);
  const progress=()=>{onProgress(`${label} · ${Math.max(0,Math.floor((Date.now()-started)/1000))} s`);tick=setTimeout(progress,1000);};
  tick=setTimeout(progress,1000);
  const work=Promise.resolve().then(task).then(value=>{
    if(expired){disposeLate(value);return;}
    return value;
  });
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{
    expired=true;reject(new Error(`${label}: no ha terminado en ${ms/1000} s. Puedes reintentar sin volver a compartir la cámara.`));
  },ms);});
  return Promise.race([work,timeout]).finally(()=>{clearTimeout(timer);clearTimeout(tick);});
}
export async function loadDetectorModel({getTF,getCoco,loadScript,onProgress=()=>{}}){
  const phase=(label,ms,task,disposeLate)=>deadline(task,{label,ms,onProgress,disposeLate});
  if(typeof getTF()?.ready!=='function')await phase('1/4 · Cargando TensorFlow',30000,()=>loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.es2017.min.js','sha384-ODzrY1mCTIRZRerZfDIqCoTQafA1St1OwLVc9SsTefnkCF1MeIaVSZ88wuK/NKfH'));
  if(typeof getCoco()?.load!=='function')await phase('2/4 · Cargando detector',30000,()=>loadScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js','sha384-7qLdgfEQyO9ZQi9ArRHigK+IBto4XPk468jAqc+fnsXaZIcMAhQeLwzggRK7aESl'));
  if(typeof getTF()?.ready!=='function'||typeof getCoco()?.load!=='function')throw new Error('Las bibliotecas del detector no están disponibles. Reintenta Preparar detector.');
  await phase('3/4 · Inicializando motor',15000,()=>getTF().ready());
  return phase('4/4 · Descargando y preparando modelo',60000,()=>getCoco().load({base:'mobilenet_v2'}),loaded=>loaded?.dispose());
}
