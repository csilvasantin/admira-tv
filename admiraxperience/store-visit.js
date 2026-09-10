/* Only this known origin can launch the Store walk; URLs cannot supply panoramas. */
(function(root){
 const origin={pano:'L6xcO37SQfBmCxsT9lPdjQ',pov:{heading:290,pitch:-6,zoom:.9}};
 function parse(search){const q=new URLSearchParams(search);return {walk:q.get('site')==='store'&&q.get('from')==='jardinets',interior:q.get('site')==='store'&&q.get('entry')==='interior'};}
 function reached(node,target,goal,distance){return target.id==='store'?node.id===goal.id:distance(node.position,target.position)<=18;}
 const api={origin,parse,reached};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.StoreVisit=api;
})(typeof globalThis!=='undefined'?globalThis:this);
