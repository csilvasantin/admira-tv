/* H toggles presentation only: component visibility and remote-player state survive. */
(function(){
 const embedded=window.parent!==window,channel='admira-hidden-ui-v1';let hidden=false;
 const frames=()=>[...document.querySelectorAll('#photo-view iframe')];
 function apply(value){hidden=value;document.documentElement.classList.toggle('ui-hidden',hidden);frames().forEach(f=>f.contentWindow?.postMessage({channel,type:'state',hidden},location.origin));window.dispatchEvent(new Event('resize'));}
 addEventListener('keydown',e=>{
  if(e.key.toLowerCase()!=='h'||e.repeat||e.ctrlKey||e.metaKey||e.altKey)return;
  if(e.target?.isContentEditable||e.target?.closest?.('input,textarea,select,[role="textbox"]'))return;
  e.preventDefault();e.stopImmediatePropagation();
  if(embedded)parent.postMessage({channel,type:'toggle'},location.origin);else apply(!hidden);
 },true);
 addEventListener('message',e=>{
  if(e.origin!==location.origin||e.data?.channel!==channel)return;
  if(embedded&&e.source===parent&&e.data.type==='state'&&typeof e.data.hidden==='boolean')apply(e.data.hidden);
  if(!embedded&&frames().some(f=>f.contentWindow===e.source)){
   if(e.data.type==='toggle')apply(!hidden);
   if(e.data.type==='ready')e.source.postMessage({channel,type:'state',hidden},location.origin);
  }
 });
 if(embedded)parent.postMessage({channel,type:'ready'},location.origin);
})();
