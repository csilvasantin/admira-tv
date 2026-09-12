// No I/O: geometry and short-lived object tracking, testable without camera access.
export const CLASSES = Object.freeze({
  person: {label: 'Persona', color: '#808080', priority: 0},
  car: {label: 'Coche', color: '#8B5E3C', priority: 1},
  motorcycle: {label: 'Moto', color: '#2ECC71', priority: 3},
  bicycle: {label: 'Bici', color: '#F59E0B', priority: 2},
  scooter: {label: 'Patinete', color: '#A78BFA', priority: 4, manualOnly: true},
});
export const SNAPSHOT_TTL = 6000;
// Presence is evidence from a recent frame, not the 8 s association memory.
export const PRESENCE_GRACE = 1500;
// Aggregates confirmed passages only; no images, identities or browser storage.
export class PassageCounts {
  constructor(){this.reset();}
  reset(){this.counts=Object.fromEntries(Object.keys(CLASSES).map(kind=>[kind,0]));}
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
// Rectangular Hungarian assignment: dummy columns are expensive, so preserve
// the maximum number of valid continuities, then minimize geometric cost.
// Greedy pairs can steal another person's only valid match in a walking group.
function assignment(costs,trackCount){
  const n=costs.length;if(!n||!trackCount)return [];
  const m=trackCount+n,u=new Float64Array(n+1),v=new Float64Array(m+1),p=new Int32Array(m+1),way=new Int32Array(m+1);
  for(let i=1;i<=n;i++){
    p[0]=i;let j0=0;const min=new Float64Array(m+1).fill(Infinity),used=new Uint8Array(m+1);
    do{
      used[j0]=1;const i0=p[j0];let delta=Infinity,j1=0;
      for(let j=1;j<=m;j++)if(!used[j]){
        const raw=j<=trackCount?costs[i0-1][j-1]:1000;
        const current=(Number.isFinite(raw)?raw:1e6)-u[i0]-v[j];
        if(current<min[j]){min[j]=current;way[j]=j0;}
        if(min[j]<delta){delta=min[j];j1=j;}
      }
      for(let j=0;j<=m;j++)if(used[j]){u[p[j]]+=delta;v[j]-=delta;}else min[j]-=delta;
      j0=j1;
    }while(p[j0]!==0);
    do{const j1=way[j0];p[j0]=p[j1];j0=j1;}while(j0);
  }
  const matches=[];
  for(let j=1;j<=trackCount;j++)if(p[j]&&Number.isFinite(costs[p[j]-1][j-1]))matches.push([p[j]-1,j-1]);
  return matches;
}
export class PassageTracker {
  constructor(){this.reset();}
  reset(){this.tracks=[];this.sequence=(this.sequence??0);}
  resetPresence(){for(const t of this.tracks)t.presenceHits=0;}
  visible(now){
    if(!Number.isFinite(now))return [];
    return this.tracks.filter(t=>now>=t.last&&now-t.last<PRESENCE_GRACE&&now-t.strongAt<PRESENCE_GRACE).map(t=>({
      trackId:t.id,class:t.category,bbox:[...t.bbox],score:t.score,
      ageMs:now-Math.min(t.last,t.strongAt),confirmed:t.presenceHits>=t.presenceNeeded,
      uncertain:now-t.last>300||t.last>t.strongAt
    }));
  }
  update(predictions, now, width, height, threshold=.65){
    if(!Number.isFinite(now)||!(width>0)||!(height>0))return [];
    // Geometry only: tolerate short occlusions, never store faces/embeddings.
    // An outward-moving object at the edge is retired sooner so a new arrival
    // at the same entrance cannot inherit an already-counted track.
    this.tracks=this.tracks.filter(t=>now-t.last<(t.exiting?1000:8000));
    const matched=new Set(), events=[];
    const limit=category=>typeof threshold==='number'?threshold:(threshold[category]??.65);
    const valid=predictions.filter(p=>Object.hasOwn(CLASSES,p.class) && !CLASSES[p.class].manualOnly && Number.isFinite(p.score) && p.score<=1 && p.score>=.25 && Array.isArray(p.bbox) && p.bbox.length===4 && p.bbox.every(Number.isFinite) && p.bbox[2]>0 && p.bbox[3]>0)
      .sort((a,b)=>b.score-a.score).map(p=>({p,b:[p.bbox[0]/width,p.bbox[1]/height,p.bbox[2]/width,p.bbox[3]/height]}))
      .filter(({b})=>b[0]<1&&b[1]<1&&b[0]+b[2]>0&&b[1]+b[3]>0);
    // Suppress near-identical same-class boxes before association. Distinct
    // nearby people and rider+bicycle remain separate objects.
    const candidates=[];
    for(const item of valid)if(candidates.length<100&&!candidates.some(other=>other.p.class===item.p.class&&overlap(other.b,item.b)>.7))candidates.push(item);
    const strong=candidates.filter(({p})=>p.score>=limit(p.class));
    const weak=candidates.filter(({p})=>p.score<limit(p.class)&&p.score>=Math.max(.25,limit(p.class)*.55));
    const cost=(t,{p,b})=>{
      const c=center(b),tc=center(t.bbox),elapsed=Math.max(0,now-t.last)/1000;
      const predicted=tc.map((v,i)=>v+Math.max(-.22,Math.min(.22,t.velocity[i]*Math.min(elapsed,.8))));
      const dist=Math.hypot(c[0]-tc[0],c[1]-tc[1]),predDist=Math.hypot(c[0]-predicted[0],c[1]-predicted[1]);
      const iou=overlap(t.bbox,b),fast=p.class==='bicycle'||p.class==='motorcycle';
      const reach=fast?Math.min(.30,.08+elapsed*.55):Math.min(.20,.065+elapsed*.20);
      const ratio=b[2]*b[3]/(t.bbox[2]*t.bbox[3]);
      if(ratio<.3||ratio>3.3||(iou<=.1&&Math.min(dist,predDist)>=reach))return Infinity;
      return predDist+(1-iou)*.06+Math.abs(Math.log(ratio))*.02;
    };
    const observe=(t,{p,b},isStrong)=>{
      const c=center(b),previous=center(t.bbox),elapsed=(now-t.last)/1000;
      if(elapsed>=.04&&elapsed<=1.5)t.velocity=t.velocity.map((v,i)=>v*.5+Math.max(-1.5,Math.min(1.5,(c[i]-previous[i])/elapsed))*.5);
      else if(elapsed>1.5)t.velocity=[0,0];
      if(isStrong){
        // Reconfirm after a gap without discarding the already-counted track.
        if(now-t.strongAt>=PRESENCE_GRACE)t.presenceHits=0;
        t.presenceHits++;t.presenceNeeded=p.class==='bicycle'&&p.score<.65?3:2;
        // Low-score matches preserve continuity but cannot confirm a passage.
        if(now-t.strongAt>3000){t.hits=0;t.origin=c;}
        t.hits++;t.strongAt=now;
      }
      t.bbox=b;t.last=now;t.score=p.score;matched.add(t.id);
      t.exiting=(c[0]<.06&&t.velocity[0]<-.02)||(c[0]>.94&&t.velocity[0]>.02)||(c[1]<.04&&t.velocity[1]<-.02)||(c[1]>.96&&t.velocity[1]>.02);
      const needed=p.class==='bicycle'&&p.score<.65?3:2;
      if(isStrong&&!t.emitted&&t.hits>=needed&&Math.hypot(c[0]-t.origin[0],c[1]-t.origin[1])>=.012){t.emitted=true;events.push({...p,trackId:t.id});}
    };
    const associate=(items,isStrong)=>{
      const available=this.tracks.filter(t=>!matched.has(t.id)),used=new Set();
      const costs=items.map(item=>available.map(t=>t.category===item.p.class?cost(t,item):Infinity));
      for(const [row,column] of assignment(costs,available.length)){
        observe(available[column],items[row],isStrong);used.add(items[row]);
      }
      return items.filter(item=>!used.has(item));
    };
    const unmatched=associate(strong,true);
    associate(weak,false);
    for(const item of unmatched){
      // Bounded memory. Weak detections never create a new track.
      if(this.tracks.length>=256)break;
      const t={id:++this.sequence,category:item.p.class,bbox:item.b,origin:center(item.b),last:now,strongAt:now,hits:0,presenceHits:0,presenceNeeded:2,emitted:false,velocity:[0,0],exiting:false};
      this.tracks.push(t);observe(t,item,true);
    }
    // A rider may also be detected as person; show the vehicle border first.
    return events.sort((a,b)=>CLASSES[b.class].priority-CLASSES[a.class].priority || b.score-a.score);
  }
}
