// Semantic masks intersected with the detector's bounding box. No I/O or storage.
const SEGMENT_LABELS=Object.freeze({person:'person',car:'car',motorcycle:'motorbike',bicycle:'bicycle'});
export function isolatePixels(source,segmentation,event){
  const label=SEGMENT_LABELS[event?.class],box=event?.bbox;
  if(!label||!Array.isArray(box)||box.length!==4||!box.every(Number.isFinite)||box[2]<=0||box[3]<=0)return null;
  const {width:sw,height:sh,data}=source;
  const {width:mw,height:mh,segmentationMap:map,legend}=segmentation;
  if(!Number.isInteger(sw)||!Number.isInteger(sh)||sw<=0||sh<=0||data?.length!==sw*sh*4||!Number.isInteger(mw)||!Number.isInteger(mh)||mw<=0||mh<=0||map?.length!==mw*mh*4)return null;
  const color=legend?.[label];if(!color)return null;
  const left=Math.max(0,Math.floor(box[0])),top=Math.max(0,Math.floor(box[1]));
  const right=Math.min(sw,Math.ceil(box[0]+box[2])),bottom=Math.min(sh,Math.ceil(box[1]+box[3]));
  const width=right-left,height=bottom-top;if(width<=0||height<=0)return null;
  const rgba=new Uint8ClampedArray(width*height*4);let visible=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const sx=left+x,sy=top+y,mx=Math.min(mw-1,Math.floor(sx*mw/sw)),my=Math.min(mh-1,Math.floor(sy*mh/sh)),mi=(my*mw+mx)*4;
    if(map[mi]!==color[0]||map[mi+1]!==color[1]||map[mi+2]!==color[2]||map[mi+3]===0)continue;
    const si=(sy*sw+sx)*4,di=(y*width+x)*4;
    rgba[di]=data[si];rgba[di+1]=data[si+1];rgba[di+2]=data[si+2];rgba[di+3]=data[si+3];
    if(rgba[di+3])visible++;
  }
  // Empty/unusable masks never fall back to publishing a rectangular photograph.
  if(visible<16)return null;
  return {width,height,data:rgba,visible,category:event.class};
}

export class CutoutJob {
  constructor({now=()=>performance.now()}={}){this.now=now;this.generation=0;this.busy=false;}
  clear(){this.generation++;this.source?.data.fill(0);}
  async run({source,events,segment,expiresAt,onResult}){
    if(this.busy){source.data.fill(0);return false;}
    const token=++this.generation;this.busy=true;this.source=source;
    try{
      const masks=await segment();
      if(token!==this.generation||this.now()>=expiresAt)return false;
      const cutouts=events.slice(0,4).map(event=>isolatePixels(source,masks,event)).filter(Boolean);
      onResult(cutouts);return true;
    }catch(error){
      if(token!==this.generation||this.now()>=expiresAt)return false;
      throw error;
    }finally{source.data.fill(0);this.source=null;this.busy=false;}
  }
}
