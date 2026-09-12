// Local display transform only. Never feed its output to detection or evidence storage.
export const CLEAN_FRAME_TTL=1500;
const FOREGROUND=new Set(['person','car','motorcycle','bicycle','scooter']);
export function hideShortcut(event){
  return event.key?.toLowerCase()==='h'&&!event.repeat&&!event.isComposing&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&
    !event.target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])');
}
export class TemporalStreetBackground{
  constructor(){this.reset();}
  reset(){
    for(const key of ['background','previous','stable','learned'])this[key]?.fill(0);
    this.width=0;this.height=0;this.lastAt=-Infinity;
  }
  update(source,boxes,now){
    const {width,height,data}=source,n=width*height;
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||n>320*480||data.length!==n*4||!Number.isFinite(now))throw new Error('Invalid display frame');
    if(now<=this.lastAt)return null; // Replayed frames cannot teach or prolong the display.
    if(this.width!==width||this.height!==height||now-this.lastAt>CLEAN_FRAME_TTL){
      this.reset();this.width=width;this.height=height;
      this.background=new Uint8ClampedArray(n*4);this.previous=new Uint8ClampedArray(n*4);
      this.stable=new Uint8Array(n);this.learned=new Float64Array(n);this.learned.fill(-Infinity);
    }
    const blocked=new Uint8Array(n),hidden=new Uint8Array(n);
    for(const item of boxes){
      if(!FOREGROUND.has(item.class)||!Array.isArray(item.bbox)||item.bbox.length!==4||!item.bbox.every(Number.isFinite))continue;
      const [x,y,w,h]=item.bbox;if(w<=0||h<=0)continue;
      // Bounding-box padding is intentionally conservative; this is not a silhouette model.
      const px=Math.max(.008,w*.20),py=Math.max(.008,h*.18);
      const x0=Math.max(0,Math.floor((x-px)*width)),x1=Math.min(width,Math.ceil((x+w+px)*width));
      const y0=Math.max(0,Math.floor((y-py)*height)),y1=Math.min(height,Math.ceil((y+h+py)*height));
      for(let yy=y0;yy<y1;yy++)for(let xx=x0;xx<x1;xx++){
        blocked[yy*width+xx]=1;if(item.class==='person')hidden[yy*width+xx]=1;
      }
    }
    let comparable=0,changed=0;
    for(let p=0;p<n;p++)if(!blocked[p]&&this.stable[p]){
      const i=p*4,d=Math.max(Math.abs(data[i]-this.previous[i]),Math.abs(data[i+1]-this.previous[i+1]),Math.abs(data[i+2]-this.previous[i+2]));
      comparable++;if(d>35)changed++;
    }
    const sceneChanged=comparable>n*.2&&changed/comparable>.45;
    if(sceneChanged){this.learned.fill(-Infinity);this.stable.fill(0);}
    const output=new Uint8ClampedArray(data);let unknown=0,hiddenPixels=0;
    for(let p=0;p<n;p++){
      const i=p*4;
      if(now-this.learned[p]>20000){this.background.fill(0,i,i+4);this.learned[p]=-Infinity;}
      if(hidden[p]){
        hiddenPixels++;
        if(now-this.learned[p]<=20000)output.set(this.background.subarray(i,i+4),i);
        else{
          unknown++;const stripe=(Math.floor((p%width)/8)+Math.floor(p/width/8))%2;
          output.set(stripe?[37,52,62,255]:[15,25,34,255],i);
        }
      }
      if(blocked[p])this.stable[p]=0;
      else{
        const delta=Math.max(Math.abs(data[i]-this.previous[i]),Math.abs(data[i+1]-this.previous[i+1]),Math.abs(data[i+2]-this.previous[i+2]));
        this.stable[p]=delta<=18?Math.min(3,this.stable[p]+1):1;
        if(this.stable[p]>=3){this.background.set(data.subarray(i,i+4),i);this.learned[p]=now;}
      }
    }
    this.previous.set(data);this.lastAt=now;
    return {data:output,width,height,unknown,hiddenPixels,sceneChanged};
  }
}
