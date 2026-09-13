// Ephemeral geometry of confirmed observations. No image, appearance, identity,
// demographics or cumulative passage counts belong in this wire payload.
export const TRAFFIC_TTL=1500;
export const MAX_TRAFFIC_TRACKS=100;
const KINDS=new Set(['person','car','motorcycle','bicycle','scooter']);

export function trafficSnapshot(observations,frameAgeMs,now=Date.now()){
  if(!Array.isArray(observations)||!Number.isFinite(now)||!Number.isFinite(frameAgeMs)||frameAgeMs<0||frameAgeMs>=TRAFFIC_TTL)return null;
  const frameAt=now-frameAgeMs,tracks=[],ids=new Set();
  for(const o of observations.slice(0,256)){
    if(!o||!KINDS.has(o.class)||(o.class==='scooter'&&o.manual!==true)||o.confirmed!==true||
      !Number.isSafeInteger(o.trackId)||o.trackId<1||ids.has(o.trackId)||
      !Number.isFinite(o.ageMs)||o.ageMs<0||o.ageMs>=TRAFFIC_TTL||
      !Array.isArray(o.bbox)||o.bbox.length!==4||!o.bbox.every(Number.isFinite)||o.bbox[2]<=0||o.bbox[3]<=0)continue;
    const [bx,by,bw,bh]=o.bbox,x0=Math.max(0,bx),y0=Math.max(0,by),x1=Math.min(1,bx+bw),y1=Math.min(1,by+bh);
    if(x1<=x0||y1<=y0)continue;
    const observedAt=Math.min(frameAt,now-o.ageMs);
    if(now-observedAt>=TRAFFIC_TTL)continue;
    tracks.push({id:o.trackId,kind:o.class,box:[x0,y0,x1-x0,y1-y0],x:(x0+x1)/2,y:y1,
      observedAt,confirmed:true,...(o.class==='scooter'?{manual:true}:{})});
    ids.add(o.trackId);if(tracks.length===MAX_TRAFFIC_TRACKS)break;
  }
  return {frameAt,tracks};
}
