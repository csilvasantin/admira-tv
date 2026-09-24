// Session aggregates only. Track geometry is ephemeral and never exported.
export const DEFAULT_DIRECTION_AXIS=[[.5,0],[.5,1]];
export function validDirectionAxis(axis){
  return Array.isArray(axis)&&axis.length===2&&axis.every(p=>Array.isArray(p)&&p.length===2&&p.every(n=>Number.isFinite(n)&&n>=0&&n<=1))&&Math.hypot(axis[1][0]-axis[0][0],axis[1][1]-axis[0][1])>=.2;
}
export class DirectionCounter{
  constructor(){this.reset();}
  reset(){this.enter=0;this.exit=0;this.tracks=new Map();}
  clearGeometry(){this.tracks.clear();}
  update(observations,events,now,axis=DEFAULT_DIRECTION_AXIS){
    if(!validDirectionAxis(axis)||!Number.isFinite(now))return false;
    const dx=axis[1][0]-axis[0][0],dy=axis[1][1]-axis[0][1],length=Math.hypot(dx,dy),ux=dx/length,uy=dy/length;
    for(const [id,t] of this.tracks)if(now-t.last>=8000)this.tracks.delete(id);
    const newlyCounted=new Set(events.filter(e=>e.class==='person').map(e=>e.trackId));
    let changed=false;
    for(const o of observations){
      if(o.class!=='person'||o.uncertain||o.ageMs!==0||!Number.isSafeInteger(o.trackId))continue;
      const foot=[o.bbox[0]+o.bbox[2]/2,o.bbox[1]+o.bbox[3]];
      let t=this.tracks.get(o.trackId);
      if(!t){t={origin:foot,first:now,last:now,hits:0,counted:false,done:false};this.tracks.set(o.trackId,t);}
      if(newlyCounted.has(o.trackId))t.counted=true;
      if(t.done)continue;
      // Never infer direction through a pause, occlusion or stale frame.
      if(now-t.last>=1500){t.origin=foot;t.first=now;t.hits=0;}
      if(t.hits&&now<=t.last)continue;
      t.last=now;t.hits++;
      const x=foot[0]-t.origin[0],y=foot[1]-t.origin[1],along=x*ux+y*uy,cross=Math.abs(x*uy-y*ux);
      if(t.counted&&o.confirmed&&t.hits>=3&&now-t.first>=300&&Math.abs(along)>=.08&&Math.abs(along)>=cross*1.25){
        if(along>0)this.enter++;else this.exit++;
        t.done=true;changed=true;
      }
    }
    return changed;
  }
  snapshot(total){return {enter:this.enter,exit:this.exit,unknown:Math.max(0,total-this.enter-this.exit)};}
}
export function audienceSnapshot({sessionId,startedAt,revision,counts,directions,axis,state,updatedAt}){
  return {schema:'admira.audience-session.v1',sessionId,startedAt,revision,updatedAt,
    site:'admira-xperience-santa-rosa-19',source:'puerta-cam',screen:'xtore-virtual-zapatillas',
    metric:'cumulative-passages',state,counts:{...counts},directions:{...directions},
    directionAxis:axis.map(p=>[...p]),directionMeaning:{enter:'toward-camera',exit:'toward-street-end'}};
}
