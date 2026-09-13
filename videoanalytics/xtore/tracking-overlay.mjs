import {CLASSES,PRESENCE_GRACE} from './core.mjs';

// Anonymous trajectory colors, unrelated to sex/age/identity. No I/O or images.
export const trackColor=id=>`hsl(${((id*137.508)%360).toFixed(2)} 90% 65%)`;
const metric=(value,fallback,min=0)=>Number.isFinite(value)&&value>=min?value:fallback;
function observedRect(o,elapsed=0){
  if(!Number.isSafeInteger(o.trackId)||o.trackId<1||!CLASSES[o.class]||CLASSES[o.class].manualOnly||!Number.isFinite(o.ageMs)||o.ageMs<0||!Number.isFinite(elapsed)||elapsed<0||o.ageMs+elapsed>=PRESENCE_GRACE||!Array.isArray(o.bbox)||o.bbox.length!==4||!o.bbox.every(Number.isFinite))return null;
  const [x,y,w,h]=o.bbox,left=Math.max(0,x),top=Math.max(0,y),right=Math.min(1,x+w),bottom=Math.min(1,y+h);
  return right>left&&bottom>top?{left,top,right,bottom}:null;
}
// Export the same anonymous tracking information into the modified camera bitmap.
// Call only on a display copy: the detector, temporal background and original stay untouched.
export function drawTrackingAnnotations(context,width,height,observations,elapsed=0){
  if(!Number.isFinite(width)||width<=0||!Number.isFinite(height)||height<=0)return;
  const occupied=[],gap=2,labelHeight=18;
  context.save();context.font='bold 12px monospace';context.textAlign='left';context.textBaseline='middle';context.lineWidth=2;
  for(const o of [...observations].sort((a,b)=>a.trackId-b.trackId)){
    const rect=observedRect(o,elapsed);if(!rect)continue;
    const {left,top,right,bottom}=rect,color=trackColor(o.trackId),text=`${CLASSES[o.class].label} #${o.trackId}`;
    context.strokeStyle=color;context.setLineDash(!o.confirmed||o.uncertain?[4,3]:[]);
    context.strokeRect(left*width,top*height,(right-left)*width,(bottom-top)*height);
    const w=Math.ceil(context.measureText(text).width+6);
    if(w>width||labelHeight>height)continue;
    const x=Math.max(0,Math.min(width-w,left*width+2)),preferred=Math.max(0,Math.min(height-labelHeight,top*height+2));
    let position=null;
    for(let row=0;row<=Math.ceil(height/(labelHeight+gap))&&!position;row++){
      for(const offset of row?[row,-row]:[0]){
        const y=preferred+offset*(labelHeight+gap);
        if(y<0||y+labelHeight>height||occupied.some(b=>x<b.x+b.w+gap&&x+w+gap>b.x&&y<b.y+b.h+gap&&y+labelHeight+gap>b.y))continue;
        position={x,y,w,h:labelHeight};break;
      }
    }
    if(!position)continue; // Keep boxes when there is no room for another readable label.
    occupied.push(position);context.fillStyle='#09131be8';context.fillRect(position.x,position.y,w,labelHeight);
    context.fillStyle=color;context.fillText(text,position.x+3,position.y+labelHeight/2);
  }
  context.restore();
}
export class TrackingOverlay{
  constructor(root,{now=()=>performance.now(),setTimer=(fn,ms)=>setTimeout(fn,ms),clearTimer=id=>clearTimeout(id),labelHeight=16,labelCharWidth=7,labelPaddingX=6,labelGap=2,reservedTop=22,reservedBottom=0}={}){
    Object.assign(this,{root,now,setTimer,clearTimer});this.nodes=new Map();this.timer=0;
    // Metrics include CSS padding; reservations may read a wrapping status band at layout time.
    Object.assign(this,{labelHeight:metric(labelHeight,16,1),labelCharWidth:metric(labelCharWidth,7,1),labelPaddingX:metric(labelPaddingX,6),labelGap:metric(labelGap,2),reservedTop,reservedBottom});
  }
  render(observations){
    const now=this.now(),seen=new Set();
    for(const o of observations){
      const rect=observedRect(o);if(!rect)continue;
      const {left,top,right,bottom}=rect;
      seen.add(o.trackId);
      let entry=this.nodes.get(o.trackId);
      if(!entry){
        const box=this.root.ownerDocument.createElement('div'),label=this.root.ownerDocument.createElement('b');
        box.className='track-box';label.className='track-label';box.append(label);this.root.append(box);
        entry={box,label};this.nodes.set(o.trackId,entry);
      }
      const {box,label}=entry;
      Object.assign(box.style,{left:`${left*100}%`,top:`${top*100}%`,width:`${(right-left)*100}%`,height:`${(bottom-top)*100}%`,color:trackColor(o.trackId)});
      box.classList.toggle('uncertain',!o.confirmed||o.uncertain);
      box.title=`${CLASSES[o.class].label} #${o.trackId}${!o.confirmed?' · confirmando':o.uncertain?' · continuidad breve':''}`;
      label.textContent=`${CLASSES[o.class].label} #${o.trackId}`;
      entry.anchor=[left,top];
      entry.until=now+PRESENCE_GRACE-o.ageMs;
    }
    for(const [id,e] of this.nodes)if(!seen.has(id)){e.box.remove();this.nodes.delete(id);}
    this.layoutLabels();this.prune();
  }
  layoutLabels(){
    const width=this.root.clientWidth,height=this.root.clientHeight;
    if(!width||!height)return;
    const reserve=value=>{
      try{return Math.min(height,metric(typeof value==='function'?value():value,height));}catch{return height;}
    };
    const occupied=[],{labelHeight,labelCharWidth,labelPaddingX,labelGap:gap}=this;
    const top=reserve(this.reservedTop),bottom=height-reserve(this.reservedBottom),available=bottom-top;
    for(const [,e] of Array.from(this.nodes).sort((a,b)=>a[0]-b[0])){
      const w=Math.ceil(labelCharWidth*e.label.textContent.length+labelPaddingX);
      if(w>width||available<labelHeight){e.label.hidden=true;continue;}
      const x=Math.max(0,Math.min(width-w,e.anchor[0]*width+2));
      const preferred=Math.max(top,Math.min(bottom-labelHeight,e.anchor[1]*height+2));
      let position=null;
      for(let row=0;row<=Math.ceil(available/(labelHeight+gap));row++){
        for(const offset of row?[row,-row]:[0]){
          const y=preferred+offset*(labelHeight+gap);
          if(y<top||y+labelHeight>bottom)continue;
          const candidate={x,y,w,h:labelHeight};
          if(occupied.some(b=>x<b.x+b.w+gap&&x+w+gap>b.x&&y<b.y+b.h+gap&&y+labelHeight+gap>b.y))continue;
          position=candidate;break;
        }
        if(position)break;
      }
      // If the ROI is too dense/small, keep its colored box, not overlapping text.
      e.label.hidden=!position;
      // Absolute children start inside the track's 2px border; keep the label's outer edge in bounds.
      if(position){occupied.push(position);e.label.style.left=`${position.x-e.anchor[0]*width-2}px`;e.label.style.top=`${position.y-e.anchor[1]*height-2}px`;}
    }
  }
  prune(){
    this.clearTimer(this.timer);this.timer=0;const now=this.now();
    for(const [id,e] of this.nodes)if(e.until<=now){e.box.remove();this.nodes.delete(id);}
    if(this.nodes.size)this.timer=this.setTimer(()=>this.prune(),Math.max(1,Math.min(...Array.from(this.nodes.values(),e=>e.until))-now));
  }
  clear(){this.clearTimer(this.timer);this.timer=0;this.root.replaceChildren();this.nodes.clear();}
}
