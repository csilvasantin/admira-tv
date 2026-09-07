/* A bounded search over directed Street View links. Never reverse a path or
 * synthesize a hop. RouteWalk checks these links again during playback. */
(function(root){
 async function findPath({start,goal,load,distance,signal,onProgress=()=>{},maxNodes=240,maxDistance=1000}){
  const open=[{id:start.id,g:0,f:distance(start.position,goal.position)}],cost=new Map([[start.id,0]]),parents=new Map(),nodes=new Map([[start.id,start],[goal.id,goal]]),closed=new Set();
  while(open.length){
   if(signal?.aborted)throw Error('cancelled');
   open.sort((a,b)=>a.f-b.f);const cur=open.shift();if(closed.has(cur.id))continue;
   if(cur.id===goal.id){const path=[cur.id];while(parents.has(path[0]))path.unshift(parents.get(path[0]));return {panos:path,nodes:path.map(id=>nodes.get(id))};}
   if(closed.size>=maxNodes)throw Error('search-limit');closed.add(cur.id);
   const node=nodes.get(cur.id)||await load(cur.id);nodes.set(cur.id,node);
   if(distance(start.position,node.position)>maxDistance)continue;
   for(const link of node.links){
    if(signal?.aborted)throw Error('cancelled');
    if(closed.has(link.pano))continue;
    let next=nodes.get(link.pano);if(!next){try{next=await load(link.pano);}catch{continue;}nodes.set(link.pano,next);}
    if(distance(start.position,next.position)>maxDistance)continue;
    const g=cur.g+Math.max(.1,distance(node.position,next.position));
    if(g>=(cost.get(next.id)??Infinity))continue;
    cost.set(next.id,g);parents.set(next.id,cur.id);open.push({id:next.id,g,f:g+distance(next.position,goal.position)});
   }
   onProgress(closed.size);
  }
  throw Error('no-path');
 }
 const api={findPath};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.OfficePaths=api;
})(typeof globalThis!=='undefined'?globalThis:this);
