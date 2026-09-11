// No I/O: geometry and short-lived object tracking, testable without camera access.
export const CLASSES = Object.freeze({
  person: {label: 'Persona', color: '#808080', priority: 0},
  car: {label: 'Coche', color: '#8B5E3C', priority: 1},
  motorcycle: {label: 'Moto', color: '#2ECC71', priority: 3},
  bicycle: {label: 'Bici', color: '#F59E0B', priority: 2},
});
export const SNAPSHOT_TTL = 6000;
// Aggregates confirmed passages only; no images, identities or browser storage.
export class PassageCounts {
  constructor(){this.reset();}
  reset(){this.counts={person:0,car:0,motorcycle:0,bicycle:0};}
  add(events){
    for(const event of events){
      if(event && Object.hasOwn(this.counts,event.class))this.counts[event.class]++;
    }
  }
  get total(){return Object.values(this.counts).reduce((sum,value)=>sum+value,0);}
}
export function validRect(r) {
  return Array.isArray(r) && r.length === 4 && r.every(Number.isFinite) && r[0] >= 0 && r[1] >= 0 && r[2] >= .04 && r[3] >= .04 && r[0]+r[2] <= 1.00001 && r[1]+r[3] <= 1.00001;
}
export function validQuad(q) {
  if (!Array.isArray(q) || q.length !== 4 || q.some(p => !Array.isArray(p) || p.length !== 2 || p.some(v => !Number.isFinite(v) || v < 0 || v > 1))) return false;
  // Clockwise TL, TR, BR, BL in screen coordinates; reject crossing/degenerate panels.
  return q.every((p,i) => {
    const b=q[(i+1)%4], c=q[(i+2)%4];
    return (b[0]-p[0])*(c[1]-b[1])-(b[1]-p[1])*(c[0]-b[0]) > .0001;
  });
}
function adj(m){return [m[4]*m[8]-m[5]*m[7],m[2]*m[7]-m[1]*m[8],m[1]*m[5]-m[2]*m[4],m[5]*m[6]-m[3]*m[8],m[0]*m[8]-m[2]*m[6],m[2]*m[3]-m[0]*m[5],m[3]*m[7]-m[4]*m[6],m[1]*m[6]-m[0]*m[7],m[0]*m[4]-m[1]*m[3]];}
function mm(a,b){const c=[];for(let i=0;i<3;i++)for(let j=0;j<3;j++){let s=0;for(let k=0;k<3;k++)s+=a[3*i+k]*b[3*k+j];c[3*i+j]=s;}return c;}
function basis(x1,y1,x2,y2,x3,y3,x4,y4){const m=[x1,x2,x3,y1,y2,y3,1,1,1],a=adj(m),v=[a[0]*x4+a[1]*y4+a[2],a[3]*x4+a[4]*y4+a[5],a[6]*x4+a[7]*y4+a[8]];return mm(m,[v[0],0,0,0,v[1],0,0,0,v[2]]);}
// Adapted from adcelerate/demo/best/index.html quadWarp (CanalKiosk).
export function quadMatrix(w,h,d){
  const s=basis(0,0,w,0,w,h,0,h),t=basis(...d.flat()),m=mm(t,adj(s));
  const divisor=m[8];
  if (!divisor || !Number.isFinite(divisor)) throw new Error('Degenerate panel');
  for(let i=0;i<9;i++)m[i]/=divisor;
  return [m[0],m[3],0,m[6],m[1],m[4],0,m[7],0,0,1,0,m[2],m[5],0,m[8]];
}
const center=b=>[b[0]+b[2]/2,b[1]+b[3]/2];
function overlap(a,b){const area=Math.max(0,Math.min(a[0]+a[2],b[0]+b[2])-Math.max(a[0],b[0]))*Math.max(0,Math.min(a[1]+a[3],b[1]+b[3])-Math.max(a[1],b[1]));return area/(a[2]*a[3]+b[2]*b[3]-area);}
export class PassageTracker {
  constructor(){this.reset();}
  reset(){this.tracks=[];this.sequence=0;}
  update(predictions, now, width, height, threshold=.65){
    this.tracks=this.tracks.filter(t=>now-t.last<1500);
    const matched=new Set(), events=[];
    const valid=predictions.filter(p=>Object.hasOwn(CLASSES,p.class) && Number.isFinite(p.score) && p.score >= threshold && Array.isArray(p.bbox) && p.bbox.length===4 && p.bbox.every(Number.isFinite) && p.bbox[2]>0 && p.bbox[3]>0).sort((a,b)=>b.score-a.score);
    for(const p of valid){
      const b=[p.bbox[0]/width,p.bbox[1]/height,p.bbox[2]/width,p.bbox[3]/height], c=center(b);
      let best=null, bestCost=Infinity;
      for(const t of this.tracks){
        if(matched.has(t.id)||t.category!==p.class)continue;
        const tc=center(t.bbox),dist=Math.hypot(c[0]-tc[0],c[1]-tc[1]),iou=overlap(t.bbox,b);
        if((iou>.1||dist<.10)&&dist+(1-iou)*.1<bestCost){best=t;bestCost=dist+(1-iou)*.1;}
      }
      if(!best){best={id:++this.sequence,category:p.class,bbox:b,origin:c,last:now,hits:0,emitted:false};this.tracks.push(best);}
      // A long detection gap is not consecutive evidence.
      if(now-best.last>900)best.hits=0;
      best.hits++;best.bbox=b;best.last=now;matched.add(best.id);
      if(!best.emitted && best.hits>=2 && Math.hypot(c[0]-best.origin[0],c[1]-best.origin[1])>=.012){
        best.emitted=true;events.push({...p,trackId:best.id});
      }
    }
    // A rider may also be detected as person; show the vehicle border first.
    return events.sort((a,b)=>CLASSES[b.class].priority-CLASSES[a.class].priority || b.score-a.score);
  }
}
