/* Circuit-specific, movable overview. Map gestures remain independent of dragging. */
(function(root){
 'use strict';
 function clamp(x,y,width,height,vw,vh){return {x:Math.max(8,Math.min(x,Math.max(8,vw-width-8))),y:Math.max(8,Math.min(y,Math.max(8,vh-height-8)))};}
 function create({host,content,key='circuits',name='Circuito',theme='admira',onShow=()=>{},onHide=()=>{}}){
  const storageKey='admira.cenital.closed.'+key,positionKey='admira.cenital.position.'+key,events=new AbortController();
  host.classList.add('cenital-host');host.dataset.circuitTheme=theme;
  const panel=document.createElement('section');panel.className='cenital-panel';panel.setAttribute('aria-label','Plano cenital · '+name);
  const bar=document.createElement('div');bar.className='cenital-heading';
  const grip=document.createElement('div');grip.className='cenital-grip';grip.tabIndex=0;grip.setAttribute('role','button');grip.setAttribute('aria-label','Mover plano de '+name);grip.title='Arrastra para mover; usa las flechas con el teclado';
  const title=document.createElement('strong');title.textContent=name;const subtitle=document.createElement('span');subtitle.textContent='⠿ Plano cenital · arrastrar';grip.append(title,subtitle);
  const close=document.createElement('button');close.type='button';close.className='cenital-close';close.textContent='×';close.setAttribute('aria-label','Cerrar plano cenital');
  const body=document.createElement('div');body.className='cenital-body';body.append(content);
  const reopen=document.createElement('button');reopen.type='button';reopen.className='cenital-reopen';reopen.textContent='Mostrar plano · '+name;reopen.setAttribute('aria-label','Mostrar plano cenital de '+name);
  bar.append(grip,close);panel.append(bar,body);host.append(panel,reopen);
  let hidden=false,moved=false,drag=null;
  function place(x,y,save=true){const r=host.getBoundingClientRect(),p=clamp(x,y,r.width,r.height,innerWidth,innerHeight);host.style.position='fixed';host.style.left=p.x+'px';host.style.top=p.y+'px';host.style.right='auto';host.style.bottom='auto';moved=true;if(save)try{sessionStorage.setItem(positionKey,JSON.stringify(p));}catch{};}
  function keepVisible(){if(moved){const r=host.getBoundingClientRect();place(r.left,r.top,false);}}
  try{hidden=sessionStorage.getItem(storageKey)==='1';}catch{}
  function render(focus=false){panel.hidden=hidden;reopen.hidden=!hidden;reopen.setAttribute('aria-expanded',String(!hidden));if(hidden)onHide();else onShow();requestAnimationFrame(keepVisible);if(focus)(hidden?reopen:close).focus();}
  function setHidden(value){hidden=value;try{sessionStorage.setItem(storageKey,hidden?'1':'0');}catch{}render(true);}
  close.addEventListener('click',e=>{e.stopPropagation();setHidden(true);});reopen.addEventListener('click',()=>setHidden(false));
  grip.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();const r=host.getBoundingClientRect();drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:r.left,top:r.top};grip.setPointerCapture(e.pointerId);host.classList.add('cenital-dragging');});
  grip.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;e.preventDefault();place(drag.left+e.clientX-drag.x,drag.top+e.clientY-drag.y);});
  function release(){drag=null;host.classList.remove('cenital-dragging');}
  grip.addEventListener('pointerup',release);grip.addEventListener('pointercancel',release);grip.addEventListener('lostpointercapture',release);
  grip.addEventListener('keydown',e=>{const delta={ArrowLeft:[-16,0],ArrowRight:[16,0],ArrowUp:[0,-16],ArrowDown:[0,16]}[e.key];if(!delta)return;e.preventDefault();e.stopPropagation();const r=host.getBoundingClientRect();place(r.left+delta[0],r.top+delta[1]);});
  window.addEventListener('resize',keepVisible,{signal:events.signal});render();
  try{const p=JSON.parse(sessionStorage.getItem(positionKey));if(p&&Number.isFinite(p.x)&&Number.isFinite(p.y))place(p.x,p.y,false);}catch{}
  return {get visible(){return !hidden;},show(){setHidden(false);},hide(){setHidden(true);},destroy(){events.abort();host.replaceChildren();}};
 }
 const api={create,clamp};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CenitalPanel=api;
})(typeof globalThis!=='undefined'?globalThis:this);
