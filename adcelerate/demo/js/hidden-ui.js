/* H: presentation. S: selection overlays. Neither changes camera or playback. */
(function(){
 const embedded=window.parent!==window,channel='admira-hidden-ui-v1';let hidden=true,selectionHidden=false;
 const frames=()=>[...document.querySelectorAll('#photo-view iframe')];
 const state=()=>({channel,type:'state',hidden,selectionHidden});
 function apply(value,selection=selectionHidden){
  const resized=hidden!==value,selectionChanged=selectionHidden!==selection;hidden=value;selectionHidden=selection;
  document.documentElement.classList.toggle('ui-hidden',hidden);
  document.documentElement.classList.toggle('targets-hidden',selectionHidden);
  frames().forEach(f=>f.contentWindow?.postMessage(state(),location.origin));
  if(resized)window.dispatchEvent(new Event('resize'));
  if(selectionChanged)window.dispatchEvent(new Event('admira-targets-change'));
 }
 addEventListener('keydown',e=>{
  const key=e.key.toLowerCase();if(!['h','s'].includes(key)||e.repeat||e.ctrlKey||e.metaKey||e.altKey||e.isComposing)return;
  if(e.target?.isContentEditable||e.target?.closest?.('input,textarea,select,[role="textbox"]'))return;
  e.preventDefault();e.stopImmediatePropagation();
  if(embedded)parent.postMessage({channel,type:key==='s'?'toggle-targets':'toggle'},location.origin);
  else if(key==='s')apply(hidden,!selectionHidden);else apply(!hidden);
 },true);
 addEventListener('message',e=>{
  if(e.origin!==location.origin||e.data?.channel!==channel)return;
  if(embedded&&e.source===parent&&e.data.type==='state'&&typeof e.data.hidden==='boolean')apply(e.data.hidden,typeof e.data.selectionHidden==='boolean'?e.data.selectionHidden:selectionHidden);
  if(!embedded&&frames().some(f=>f.contentWindow===e.source)){
   if(e.data.type==='toggle')apply(!hidden);
   if(e.data.type==='toggle-targets')apply(hidden,!selectionHidden);
   if(e.data.type==='ready')e.source.postMessage(state(),location.origin);
  }
 });
 apply(hidden);
 if(embedded)parent.postMessage({channel,type:'ready'},location.origin);
})();
