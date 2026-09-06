const {test}=require('node:test');const assert=require('node:assert/strict');
const {create,timeLabel}=require('../js/player-remote-view.js');
function harness(t){
  const old=global.document;const sent=[],events=[],nodes=new Map();
  const node=()=>({textContent:'',value:'',disabled:false,attributes:{},classList:{add(){},remove(){}},setAttribute(k,v){this.attributes[k]=v;},focus(){events.push('focus');},replaceChildren(...x){this.children=x;this.replaced=(this.replaced||0)+1;},addEventListener(k,fn){this[k]=fn;}});
  const element=node();element.querySelector=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);};const play=element.querySelector('#remote-play');play.id='remote-play';play.dataset={playerAction:'toggle-pause'};element.querySelectorAll=()=>[play];
  global.document={activeElement:node(),createElement:node};t.after(()=>global.document=old);
  const view=create({element,send:x=>sent.push(x),onOpen:()=>events.push('open'),onClose:()=>events.push('close')});
  return {view,sent,events,nodes,element};
}
function state(token,overrides={}){return {...token,mode:'scheduled',status:'playing',contentId:'clip-a',title:'Actual',playlistId:'canal',index:0,total:2,position:7,duration:30,volume:.35,muted:false,loop:'playlist',catalog:[{id:'clip-a',title:'Actual',type:'video'}],playlists:[{id:'canal',title:'Canal',count:2}],...overrides};}
test('session scopes every control and rejects old-screen or closed-session telemetry',t=>{
  const h=harness(t);h.view.open({id:'vila-left',label:'Vila izquierda'});const first=h.view.getSession();
  assert.equal(h.view.accept(state(first)),true);h.view.command('next');
  assert.deepEqual(h.sent.at(-1),{...first,action:'next'});
  h.view.open({id:'lesseps-main',label:'Lesseps'});const next=h.view.getSession();
  assert.notEqual(first.requestId,next.requestId);assert.equal(h.view.accept(state(first)),false);
  assert.equal(h.view.accept(state({...next,screenId:'vila-left'})),false);
  assert.equal(h.view.accept(state(next)),true);h.view.close();const sent=h.sent.length;
  assert.equal(h.view.accept(state(next)),false);assert.equal(h.view.command('next'),false);assert.equal(h.sent.length,sent);
});
test('opening reads the inspected player without playback, mute or volume mutations',t=>{
  const h=harness(t);h.view.open({id:'jardinets-main',label:'Jardinets'});
  assert.deepEqual(h.sent,[{action:'open',screenId:'jardinets-main',requestId:1}]);
  h.view.accept(state(h.view.getSession()));assert.equal(h.nodes.get('#remote-volume').value,.35);
  assert.equal(h.nodes.get('#remote-mute').textContent,'Silenciar');assert.equal(h.sent.length,1);
  h.view.close();assert.equal(h.sent.at(-1).action,'close');assert.deepEqual(h.events,['open','focus','close','focus']);
});
test('volume, selection and seeking use typed fields without arbitrary media URLs',t=>{
  const h=harness(t);h.view.open({id:'vila-right',label:'Derecha'});h.view.accept(state(h.view.getSession()));
  h.nodes.get('#remote-volume').oninput({target:{value:'.5'}});assert.equal(h.sent.at(-1).volume,.5);
  h.nodes.get('#remote-content').onchange({target:{value:'clip-a'}});assert.equal(h.sent.at(-1).contentId,'clip-a');
  h.nodes.get('#remote-seek').onchange({target:{value:'18'}});assert.equal(h.sent.at(-1).seconds,18);
  h.nodes.get('#remote-mute').onclick();assert.equal(h.sent.at(-1).muted,true);
});
test('time updates preserve focused controls and do not rebuild catalog choices',t=>{
  const h=harness(t);h.view.open({id:'lesseps-main',label:'Lesseps'});const data=state(h.view.getSession());h.view.accept(data);
  const select=h.nodes.get('#remote-content'),seek=h.nodes.get('#remote-seek');select.focus();global.document.activeElement=seek;seek.value=21;
  h.view.accept({...data,position:8});assert.equal(seek.value,21);assert.equal(select.replaced,1);
  global.document.activeElement=null;h.view.accept({...data,position:9});assert.equal(seek.value,9);
  assert.equal(timeLabel(73.9),'1:13');assert.equal(timeLabel(NaN),'0:00');
});

test('loading leaves exit available and blocked playback retries play explicitly',t=>{
  const h=harness(t);h.view.open({id:'lesseps-main',label:'Lesseps'});const token=h.view.getSession();
  assert.equal(h.nodes.get('#remote-play').disabled,true);assert.equal(h.nodes.get('#remote-seek').disabled,true);
  for(const status of ['blocked','error','paused']){h.view.accept(state(token,{status}));h.nodes.get('#remote-play').click();assert.equal(h.sent.at(-1).action,'play');assert.equal(h.nodes.get('#remote-play').attributes['aria-label'],'Reproducir');}
  h.view.accept(state(token,{status:'loading',duration:30}));assert.equal(h.nodes.get('#remote-seek').disabled,true);
  h.nodes.get('#remote-close').onclick();assert.equal(h.view.isOpen(),false);assert.equal(h.sent.at(-1).action,'close');
});
