// Real player functions in a minimal in-memory DOM; no browser, network or media files.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {PlayerDataBridge} from './player-data.mjs';
import {XTORE_MUSIC_ASSETS} from './conditional-music.mjs';

const html=readFileSync(new URL('../../canal.html',import.meta.url),'utf8');
const section=(from,to)=>html.slice(html.indexOf(from),html.indexOf(to,html.indexOf(from)));
const song=(id='song',extra={})=>({id:'default:'+id,type:'audio',url:'https://media.example/'+id+'.mp3',title:id,_previewSec:10,...extra});
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
  const classes=()=>{const set=new Set();return {add:x=>set.add(x),remove:x=>set.delete(x),contains:x=>set.has(x)};};
  const nodes=new Map(),created=[],messages=[],advances=[],timers=[];
  let audioPlay=null;
  function node(tagName='DIV'){
    const handlers=new Map();
    const el={tagName:tagName.toUpperCase(),style:{},classList:classes(),children:[],textContent:'',paused:true,ended:false,
      pauseCount:0,loadCount:0,naturalWidth:640,naturalHeight:360,isConnected:true,
      addEventListener(type,fn){handlers.set(type,fn);},setAttribute(name,value){this[name]=value;},removeAttribute(name){delete this[name];},
      appendChild(child){this.children.push(child);},
      querySelectorAll(){return this.children.filter(n=>['AUDIO','VIDEO'].includes(n.tagName));},
      querySelector(selector){return selector==='.audio-card'?this:this.children.find(n=>['AUDIO','VIDEO','IMG'].includes(n.tagName))||null;},
      pause(){this.paused=true;this.pauseCount++;},load(){this.loadCount++;},
      emit(type,event){handlers.get(type)?.(event);},
      play(){if(audioPlay)return audioPlay(this);this.paused=false;this.emit('playing');return Promise.resolve();},
    };
    Object.defineProperty(el,'innerHTML',{get(){return this.markup||'';},set(value){this.markup=value;this.children=[];}});
    return el;
  }
  const stage=node(),tap=node(),parent={postMessage:(data,origin)=>messages.push({data,origin})};
  const c={console,URL,URLSearchParams,Set,Map,Date,window:{parent},
    qs:new URLSearchParams('xtoreMusic=1&screen=xtore-virtual-zapatillas'),XTORE_PARENT:'https://admira.tv',
    KIND:{audio:'audio',music:'audio',locucion:'audio',image:'image',video:'video',interactive:'interactive'},MEDIA:['audio','music','locucion','image','video','interactive'],
    _standby:false,_playTok:0,timer:0,bar:{style:{}},mediaEl:null,usesAdv:false,paused:false,stage,tap,
    document:{body:node(),documentElement:node(),createElement(tag){const el=node(tag);created.push(el);return el;}},
    $:id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);},
    guardPlayStarted(){},stopBar(){},syncOn:false,directOn:false,playlist:[],all:[],cur:-1,
    cachedSrc:async()=>null,cacheable:()=>true,firstCachedFrom:()=>assert.fail('Music cannot wait for opaque storage'),
    _asapItemId:null,STREAM_OK:false,_warmWaiting:false,_coldWaiting:false,_extendedAssignment:null,
    itemAR:()=>1,fitMupi(){},mupiAR:1,nowEl:node(),metaEl:node(),renderRail(){},localInfoSet(){},renderChan(){},setLive(){},
    AV1_OK:true,_codecBad:new Set(),PREVIEW:{on:true},playoutMode:'conditional',_condPlaylist:true,_condFallback:false,
    muted:false,volume:0.8,localInfoRender(){},signagePlaylistPush(){},_nowItem:null,
    applyAudio(){if(c.mediaEl){c.mediaEl.muted=c.muted;c.mediaEl.volume=c.volume;}},
    cfg:{imgSec:9,audioSec:18},seg:{ids:null,category:'all',tag:'',medio:'all'},
    matchesSeg:(it,s)=>!s.ids||s.ids.includes(it.id),next:()=>advances.push(true),syncFinishCurrent:()=>advances.push('sync'),
    startAdv:ms=>timers.push(ms),setTimeout,clearTimeout,
  };
  vm.createContext(c);
  vm.runInContext(section('function xtoreMusicEnabled()','function xtorePublicRead('),c);
  vm.runInContext(section('const DEFAULT_DRAFT=','async function loadDefaultDraft('),c);
  vm.runInContext('DEFAULT_DRAFT.ready=true',c);
  vm.runInContext(section('function editorialSec(','function syncNow('),c);
  vm.runInContext(section('function emitFrameState(','// r62: cada cambio de carril'),c);
  vm.runInContext(section('function mediaAdvance(','// antes de cada nuevo contenido'),c);
  vm.runInContext(section('let _localInfoRemoteBusy=','function audioMeterDetach('),c);
  c.$('localInfo').hidden=true;
  return {c,created,messages,advances,timers,eval:code=>vm.runInContext(code,c),
    draft(items){c.draftInput=items;vm.runInContext('DEFAULT_DRAFT.items=draftInput',c);},
    audioPlay(fn){audioPlay=fn;},
  };
}

test('music opt-in is restricted to the exact Xtore parent profile and screen',()=>{
  const f=fixture();assert.equal(f.c.xtoreMusicEnabled(),true);
  for(const query of ['', 'xtoreMusic=1&screen=hardware-mupi','xtoreMusic=0&screen=xtore-virtual-zapatillas']){
    f.c.qs=new URLSearchParams(query);assert.equal(f.c.xtoreMusicEnabled(),false);
  }
  f.c.qs=new URLSearchParams('xtoreMusic=1&screen=xtore-virtual-zapatillas');f.c.XTORE_PARENT='';
  assert.equal(f.c.xtoreMusicEnabled(),false);
});

test('clean musical embed keeps its autoplay gesture visible and keyboard accessible',()=>{
  assert.match(html,/\.clean\.xtore-music #tap\.show\{ display:grid!important; \}/);
  assert.match(html,/if\(xtoreMusicEnabled\(\)\)\{\s*document\.documentElement\.classList\.add\('xtore-music'\);\s*tap\.setAttribute\('role','button'\)/);
});

test('local mini remote precedes long content and uses the common accessible sticky card toolbar',()=>{
  assert.ok(html.indexOf('id="li-remote"')<html.indexOf('id="li-title"'));
  assert.match(html,/<div id="li-remote" hidden role="group"/);
  for(const id of ['prev','next','mute','repeat'])assert.match(html,new RegExp('<button id="li-'+id+'" type="button"[^>]*aria-label='));
  assert.match(html,/#localInfo\{[^}]*max-height:calc\(100% - 60px\)[^}]*overflow-y:auto[^}]*pointer-events:auto[^}]*touch-action:pan-y/);
  assert.match(html,/#localInfo \.li-toolbar\{[^}]*position:sticky/);
  assert.match(html,/#li-remote\[hidden\]\{ display:none!important/);
  assert.match(html,/#li-remote button:focus-visible/);
});

test('local remote is hidden/inert outside Xtore, with no playlist or while standby/direct/closed',()=>{
  const f=fixture(),c=f.c;let calls=0;c.next=()=>calls++;c.prev=()=>calls++;
  c.$('localInfo').hidden=false;c.localInfoRemoteBind();
  assert.equal(c.$('li-remote').hidden,false);assert.equal(c.$('li-next').disabled,true);
  assert.equal(c.localInfoRemoteAction('next'),false);
  c.playlist=[song()];c.cur=0;c.localInfoRemoteRender();assert.equal(c.$('li-next').disabled,false);
  for(const key of ['_standby','directOn']){c[key]=true;assert.equal(c.localInfoRemoteAction('next'),false);c[key]=false;}
  c.$('localInfo').hidden=true;assert.equal(c.localInfoRemoteAction('prev'),false);c.$('localInfo').hidden=false;
  c.XTORE_PARENT='';c.localInfoRemoteRender();assert.equal(c.$('li-remote').hidden,true);
  assert.equal(c.localInfoRemoteAction('next'),false);assert.equal(c.localInfoRemoteAction('mute'),false);
  assert.equal(calls,0);
});

test('remote pointer/button gestures stay in the card; native Enter/Space are not global pause, Ctrl+I bubbles',()=>{
  const f=fixture(),c=f.c;c.$('localInfo').hidden=false;c.playlist=[song()];c.cur=0;c.localInfoRemoteBind();
  let calls=0;c.next=()=>calls++;
  const event=(key,repeat=false)=>({key,repeat,stopped:false,prevented:false,stopPropagation(){this.stopped=true;},preventDefault(){this.prevented=true;}});
  const click=event();c.$('li-next').emit('click',click);
  assert.equal(calls,1);assert.equal(click.stopped,true);assert.equal(c.$('localInfo').hidden,false);
  for(const type of ['pointerdown','pointerup','dblclick']){const e=event();c.$('li-remote').emit(type,e);assert.equal(e.stopped,true);}
  for(const key of ['Enter',' ']){
    const e=event(key);c.$('li-remote').emit('keydown',e);assert.equal(e.stopped,true);assert.equal(e.prevented,false);
    const repeated=event(key,true);c.$('li-remote').emit('keydown',repeated);assert.equal(repeated.prevented,true);
  }
  const shortcut=event('i');shortcut.ctrlKey=true;c.$('li-remote').emit('keydown',shortcut);assert.equal(shortcut.stopped,false);
  assert.equal(c.$('localInfo').tabIndex,0);
});

test('remote mute reads the actual element, applies sound locally and refreshes from applyAudio',async()=>{
  const f=fixture(),c=f.c;f.draft([song()]);c.xtoreMusicRebuild();await settle();
  c.$('localInfo').hidden=false;c.localInfoRemoteBind();
  Object.assign(c,{save(){},localInfoAudioPaint(){},pushAudioStateSoon(){}});
  vm.runInContext(section('function applyAudio()','function setAudio('),c);
  c.mediaEl.muted=true;c.mediaEl.volume=0;c.muted=false;c.volume=0.8;c.localInfoRemoteRender();
  assert.equal(c.$('li-mute')['aria-pressed'],'true');
  assert.equal(c.localInfoRemoteAction('mute'),true);await settle();
  assert.equal(c.mediaEl.muted,false);assert.equal(c.mediaEl.volume,0.6);assert.equal(c.$('li-mute')['aria-pressed'],'false');
  c.localInfoRemoteAction('mute');assert.equal(c.mediaEl.muted,true);assert.equal(c.$('li-mute')['aria-pressed'],'true');
  // The existing volume control/command also refreshes the mini remote, not just its own clicks.
  c.muted=false;c.volume=0.4;c.applyAudio();assert.equal(c.$('li-mute')['aria-pressed'],'false');
  assert.match(c.$('li-mute').title,/40%/);
});

test('remote unmute retains blocked media until gesture succeeds and does not advance it',async()=>{
  const f=fixture(),c=f.c;f.audioPlay(()=>Promise.reject(new Error('NotAllowedError')));
  f.draft([song()]);c.xtoreMusicRebuild();await settle();c.$('localInfo').hidden=false;c.muted=true;c.applyAudio();
  const audio=c.mediaEl;c.localInfoRemoteAction('mute');await settle();
  assert.equal(c.mediaEl,audio);assert.equal(f.messages.at(-1).data.phase,'audio-blocked');assert.equal(f.advances.length,0);
});

test('remote rejects synchronous reentrancy and unknown actions without enqueuing later navigation',()=>{
  const f=fixture(),c=f.c;c.$('localInfo').hidden=false;c.playlist=[song()];c.cur=0;let calls=0;
  c.next=()=>{calls++;assert.equal(c.localInfoRemoteAction('prev'),false);};
  c.prev=()=>calls++;
  assert.equal(c.localInfoRemoteAction('bad'),false);assert.equal(c.localInfoRemoteAction('next'),true);assert.equal(calls,1);
  assert.equal(c.localInfoRemoteAction('prev'),true);assert.equal(calls,2);
});

test('rapid remote next/prev reuse tokenized play; late cache, ended and blocked play cannot replace newest choice',async()=>{
  const f=fixture(),c=f.c;let rejectOld;
  f.audioPlay(()=>new Promise((resolve,reject)=>{rejectOld=reject;}));
  f.draft([song('one'),song('two'),song('three')]);c.xtoreMusicRebuild();await settle();
  const old=c.mediaEl,ended=old.onended;c.$('localInfo').hidden=false;f.audioPlay(null);
  Object.assign(c,{kioskReloadIfDue:()=>false,finishForcedTagPlayback:()=>false});
  vm.runInContext(section('function next()','// ── AUTOACTUALIZACIÓN EN KIOSKO'),c);
  const pending=[];c.cachedSrc=()=>new Promise(resolve=>pending.push(resolve));
  c.localInfoRemoteAction('next');assert.equal(c.cur,1);
  c.localInfoRemoteAction('prev');assert.equal(c.cur,0);
  c.localInfoRemoteAction('prev');assert.equal(c.cur,2);
  pending[2](null);await settle();const newest=c.mediaEl,token=c._playTok,count=f.messages.length;
  pending[0](null);pending[1](null);rejectOld(new Error('late autoplay rejection'));ended();await settle();
  assert.equal(c.mediaEl,newest);assert.equal(c.cur,2);assert.equal(c._playTok,token);assert.equal(f.messages.length,count);
  assert.ok(old.pauseCount>=1);assert.equal(old.src,undefined);assert.equal(newest.src,'https://media.example/three.mp3');
  assert.equal(f.created.length,2);assert.equal(c.$('localInfo').hidden,false);
});

for(const type of ['audio','video'])test(`repeat replays the same base ${type} only on natural ended, even with the card closed`,async()=>{
  const f=fixture(),c=f.c;c.setTimeout=()=>0;
  f.draft([song('one',{type}),song('two')]);c.xtoreMusicRebuild();await settle();
  const first=c.mediaEl,token=c._playTok;c.$('localInfo').hidden=false;
  assert.equal(c.localInfoRemoteAction('repeat'),true);assert.equal(c.$('li-repeat')['aria-pressed'],'true');
  c.$('localInfo').hidden=true;first.onended();await settle();
  assert.equal(c.cur,0);assert.equal(c.playlist[c.cur].id,'default:one');assert.notEqual(c.mediaEl,first);
  assert.equal(c._playTok,token+1);assert.ok(first.pauseCount>=1);assert.equal(first.src,undefined);
  assert.equal(f.eval('_localInfoRepeatKey'),c.localInfoRepeatIdentity(c.playlist[0]));
  assert.equal(f.advances.length,0);assert.deepEqual(f.timers,[]);assert.equal(f.messages.at(-1).data.loop,true);
  c.$('localInfo').hidden=false;c.localInfoRemoteAction('repeat');c.mediaEl.onended();
  assert.equal(f.advances.length,1);assert.equal(f.eval('_localInfoRepeatKey'),'');
});

test('a repeated audio error leaves the piece and manual previous/next disarm repetition',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const f=fixture(),c=f.c;Object.assign(c,{kioskReloadIfDue:()=>false,finishForcedTagPlayback:()=>false});
  vm.runInContext(section('function next()','// ── AUTOACTUALIZACIÓN EN KIOSKO'),c);
  f.draft([song('one'),song('two'),song('three')]);c.xtoreMusicRebuild();await settle();c.$('localInfo').hidden=false;
  c.localInfoRemoteAction('repeat');const failed=c.mediaEl;failed.onerror();
  t.mock.timers.tick(601);await settle();assert.equal(c.cur,1);assert.equal(f.eval('_localInfoRepeatKey'),'');
  assert.ok(failed.pauseCount>=1);assert.equal(failed.src,undefined);
  c.localInfoRemoteAction('repeat');c.localInfoRemoteAction('next');await settle();
  assert.equal(c.cur,2);assert.equal(f.eval('_localInfoRepeatKey'),'');
  c.localInfoRemoteAction('repeat');c.localInfoRemoteAction('prev');await settle();
  assert.equal(c.cur,1);assert.equal(f.eval('_localInfoRepeatKey'),'');
});

test('base and conditional contexts cancel repeat even when both resolve the same id and URL',async()=>{
  const f=fixture(),c=f.c,one=song('shared');c.all=[one];f.draft([one]);
  c.xtoreMusicRebuild();await settle();c.$('localInfo').hidden=false;c.localInfoRemoteAction('repeat');
  const base=c.mediaEl;c._condPlaylist=false;c.seg.ids=[one.id];c.xtoreMusicRebuild();await settle();
  assert.notEqual(c.mediaEl,base);assert.equal(f.eval('_xtoreMusicBase'),false);assert.equal(f.eval('_localInfoRepeatKey'),'');
  c.localInfoRemoteAction('repeat');const conditional=c.mediaEl;c._condPlaylist=true;c.seg.ids=null;c.xtoreMusicRebuild();await settle();
  assert.notEqual(c.mediaEl,conditional);assert.equal(f.eval('_xtoreMusicBase'),true);assert.equal(f.eval('_localInfoRepeatKey'),'');
  assert.equal(c.playlist[0].id,one.id);assert.equal(c.playlist[0].url,one.url);
});

test('sync, direct, standby and a non-Xtore profile cannot arm or retain repeat',async()=>{
  for(const mode of ['syncOn','directOn','_standby','ordinary']){
    const f=fixture(),c=f.c;f.draft([song()]);c.xtoreMusicRebuild();await settle();c.$('localInfo').hidden=false;
    c.localInfoRemoteAction('repeat');const token=c._playTok,el=c.mediaEl;
    if(mode==='ordinary')c.XTORE_PARENT='';else c[mode]=true;
    assert.equal(c.localInfoRepeatAllowed(c.playlist[0]),false);assert.equal(c.localInfoRemoteAction('repeat'),false);
    el.onended();assert.equal(c._playTok,token);assert.equal(f.eval('_localInfoRepeatKey'),'');
    assert.deepEqual(f.advances,mode==='syncOn'?['sync']:[true]);
  }
  const f=fixture();f.draft([song('still',{type:'image'})]);f.c.xtoreMusicRebuild();await settle();f.c.$('localInfo').hidden=false;f.c.localInfoRemoteRender();
  assert.equal(f.c.localInfoRemoteAction('repeat'),false);assert.equal(f.c.$('li-repeat').disabled,true);
});

test('stale ended/error tokens cannot replay old media or clear the newest repeat choice',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const f=fixture(),c=f.c;Object.assign(c,{kioskReloadIfDue:()=>false,finishForcedTagPlayback:()=>false});
  vm.runInContext(section('function next()','// ── AUTOACTUALIZACIÓN EN KIOSKO'),c);
  f.draft([song('one'),song('two')]);c.xtoreMusicRebuild();await settle();c.$('localInfo').hidden=false;
  c.localInfoRemoteAction('repeat');const old=c.mediaEl;old.onerror();c.localInfoRemoteAction('next');await settle();
  c.localInfoRemoteAction('repeat');const current=c.mediaEl,key=f.eval('_localInfoRepeatKey'),token=c._playTok;
  old.onended();t.mock.timers.tick(601);await settle();
  assert.equal(c.mediaEl,current);assert.equal(c._playTok,token);assert.equal(f.eval('_localInfoRepeatKey'),key);
  current.onended();await settle();assert.equal(c.cur,1);assert.notEqual(c.mediaEl,current);assert.equal(f.eval('_localInfoRepeatKey'),key);
});

test('real musical audience interrupts repeat and neutral/TTL replace it without extending presence',async()=>{
  const f=fixture(),c=f.c;let now=10000;
  Object.assign(c,{Date:class extends Date{static now(){return now;}},setTimeout:()=>0,setInterval:()=>0,clearInterval(){},
    seenSig:'',scr:{},syncSegPanel(){},flashCli(){},setAdmiraMode:()=>assert.fail('No engine restart'),
    rebuild:()=>c.xtoreMusicRebuild(),xtorePublicRead:async()=>({rules:[
      {kind:'person',assets:[XTORE_MUSIC_ASSETS.person],musicOnly:true},
      {kind:'car',assets:[XTORE_MUSIC_ASSETS.car],musicOnly:true},
    ]})});
  c.all=[{id:XTORE_MUSIC_ASSETS.person,type:'video',url:'https://media.example/topgun.mp4'},
    {id:XTORE_MUSIC_ASSETS.car,type:'video',url:'https://media.example/future.mp4'}];
  f.draft([song('base'),song('two')]);c.xtoreMusicRebuild();await settle();c.$('localInfo').hidden=false;
  vm.runInContext(readFileSync(new URL('../../xpl-runtime.js',import.meta.url),'utf8'),c);
  vm.runInContext(section('const AUD_KIND_ALIAS=','function runCli(raw)'),c);
  vm.runInContext(section('const XPLCanal = (function(){','// ── AUDIENCIA REMOTA: sondeo'),c);
  const engine=c.window.XPLCanal;engine.start();await settle();c.forceAudience('u');c.localInfoRemoteAction('repeat');
  const base=c.mediaEl;c.forceAudience('persona');await settle();
  assert.equal(c.playlist[0].id,XTORE_MUSIC_ASSETS.person);assert.equal(f.eval('_localInfoRepeatKey'),'');
  c.localInfoRemoteAction('repeat');const top=c.mediaEl;c.forceAudience('coche');await settle();
  assert.equal(c.playlist[0].id,XTORE_MUSIC_ASSETS.car);assert.equal(f.eval('_localInfoRepeatKey'),'');
  c.localInfoRemoteAction('repeat');const deadline=c.window.__xplForce.expiresAt;
  now+=1000;c.mediaEl.onended();await settle();assert.equal(c.window.__xplForce.expiresAt,deadline);
  now=deadline;engine.tick();await settle();const returned=c.mediaEl;
  assert.equal(c.playlist[0].id,'default:base');assert.equal(f.eval('_localInfoRepeatKey'),'');assert.equal(f.messages.at(-1).data.loop,true);
  base.onended();top.onended();await settle();assert.equal(c.mediaEl,returned);
  c.forceAudience('persona');await settle();c.localInfoRemoteAction('repeat');c.forceAudience('u');await settle();
  assert.equal(c.playlist[0].id,'default:base');assert.equal(f.eval('_localInfoRepeatKey'),'');engine.stop();
});

test('assigned base accepts HTTPS media including music videos and rejects locutions/credentials',()=>{
  const {c}=fixture();
  const items=[song(),song('music',{type:'music'}),song('video',{type:'video'}),song('image',{type:'image'}),
    song('speech',{type:'locucion',assetType:'audio'}),song('known-speech'),song('bad',{url:'javascript:alert(1)'})];
  items.push(song('credentials',{url:'https://user:pass@media.example/a.mp3'}));
  assert.deepEqual(Array.from(c.xtoreMusicItems(items,[{id:'known-speech',type:'locucion'}]),it=>it.id),['default:song','default:music','default:video','default:image']);
});

test('empty #musica base never falls through to unrelated Stock',()=>{
  const f=fixture();f.c.all=[song('stock'),song('stock-video',{type:'video'})];
  f.c.xtoreMusicRebuild();
  assert.equal(f.created.length,0);assert.equal(f.c.playlist.length,0);
  assert.match(f.c.stage.innerHTML,/No hay contenidos reproducibles con #musica/);
  assert.deepEqual(JSON.parse(JSON.stringify(f.messages.at(-1))),{origin:'https://admira.tv',data:{source:'admira-tv-canal',event:'media-state',orientation:'landscape',aspect:1,
    mode:'conditional',sync:false,id:'playlist-default',phase:'playlist-empty',loop:true,music:true,musicSource:'pixeria-musica',mediaType:null,muted:false,volume:0.8}});
});

test('actual audio playback uses onended, no editorial timer and no opaque cold-cache waiting',async()=>{
  const f=fixture();f.draft([song()]);f.c.xtoreMusicRebuild();await settle();
  const audio=f.c.mediaEl;assert.equal(audio.tagName,'AUDIO');assert.deepEqual(f.timers,[]);assert.equal(f.c.usesAdv,false);
  audio.duration=420;audio.onloadedmetadata();assert.equal(f.c.editorialSec(f.c.playlist[0]),420);assert.deepEqual(f.timers,[]);
  assert.equal(f.messages.at(-1).data.phase,'playing');assert.equal(f.messages.at(-1).data.mediaType,'audio');
  audio.onended();assert.equal(f.advances.length,1);
});

test('fallback filters exact normalized hashtag before latest-five limit, accepts music video and deduplicates',()=>{
  const {c}=fixture();
  const items=Array.from({length:310},(_,i)=>song('unrelated'+i,{createdAt:'2026-09-12T00:00:00Z',tags:['news']}));
  for(let i=1;i<=7;i++)items.push(song('tag'+i,{type:i%2?'video':'audio',createdAt:`2026-09-0${i}T00:00:00Z`,tags:[i%2?'#MÚSICA':'musica']}));
  items.push({...items.at(-1)},song('same-url',{url:items.at(-1).url,tags:['musica']}),song('title-only',{title:'#musica',tags:['musical']}),song('image',{type:'image',tags:['musica']}));
  const before=items.map(i=>i.id);
  assert.deepEqual(Array.from(c.xtoreLatestStock(items,'musica'),i=>i.id),['default:tag7','default:tag6','default:tag5','default:tag4','default:tag3']);
  assert.deepEqual(items.map(i=>i.id),before);
  assert.equal(c.xtoreLatestStock(items).length,5); // generic rule without a theme
  assert.deepEqual(Array.from(c.xtoreLatestStock([song('bad-date',{tags:['musica'],createdAt:'not-a-date'}),items[310]],'musica'),i=>i.id),['default:tag1','default:bad-date']);
});

test('assigned list takes priority and deleting it restores dynamic #musica baseline',async()=>{
  const f=fixture();f.c.all=[song('tagged',{tags:['musica']})];
  f.draft([song('assigned')]);f.c.xtoreMusicRebuild();await settle();assert.equal(f.c.playlist[0].id,'default:assigned');
  const old=f.c.mediaEl;f.draft([]);f.c.xtoreMusicRebuild();await settle();
  assert.equal(f.c.playlist[0].id,'default:tagged');assert.equal(old.pauseCount,1);
  assert.equal(f.messages.at(-1).data.musicSource,'pixeria-musica');
  const playing=f.c.mediaEl;f.c.xtoreMusicRebuild();assert.equal(f.c.mediaEl,playing);
});

test('first playlist read wins the catalogue race; failure is not an unassigned playlist',async()=>{
  const f=fixture(),c=f.c;f.eval('DEFAULT_DRAFT.ready=false');c.all=[song('fallback',{tags:['musica']})];
  c.xtoreMusicRebuild();assert.equal(f.created.length,0);
  Object.assign(c,{scr:{screen:'xtore-virtual-zapatillas'},PREVIEW:{on:false},rebuild:()=>c.xtoreMusicRebuild(),xtorePublicRead:async()=>{throw new Error('offline');}});
  vm.runInContext(section('async function loadDefaultDraft()','// Entrelaza los creativos'),c);
  await c.loadDefaultDraft();await settle();assert.equal(c.playlist.length,0);assert.equal(f.messages.at(-1).data.phase,'playlist-unavailable');
  c.xtorePublicRead=async()=>({ok:true,draft:{items:[]}});await c.loadDefaultDraft();await settle();assert.equal(c.playlist[0].id,'default:fallback');
  c.xtorePublicRead=async()=>({ok:true,draft:{items:[{type:'interactive',url:'https://example.test'}]}});
  await c.loadDefaultDraft();assert.equal(c.playlist.length,0);assert.match(c.stage.innerHTML,/playlist asociada/);
  c.xtorePublicRead=async()=>({ok:true,draft:{items:[]}});await c.loadDefaultDraft();await settle();assert.equal(c.playlist[0].id,'default:fallback');
});

test('music video autoplay block waits with sound control and is not a decode failure',async()=>{
  const f=fixture();f.audioPlay(()=>Promise.reject(new Error('NotAllowedError')));
  const waits=[];f.c.setTimeout=(fn,ms)=>{waits.push({fn,ms});return waits.length;};
  f.c.all=[song('clip',{type:'video',tags:['musica']})];f.c.xtoreMusicRebuild();await settle();
  const video=f.c.mediaEl;assert.equal(video.tagName,'VIDEO');assert.equal(f.messages.at(-1).data.phase,'audio-blocked');
  waits.find(x=>x.ms===3500).fn();assert.equal(f.c.mediaEl,video);assert.deepEqual(f.timers,[]);assert.equal(f.advances.length,0);
  f.audioPlay(el=>{el.paused=false;el.emit('playing');return Promise.resolve();});
  f.c.xtoreMusicTap();await settle();assert.equal(f.messages.at(-1).data.phase,'playing');
  video.onended();assert.equal(f.advances.length,1);
});

test('permission wait over 15s does not consume music video buffering time after the gesture',async()=>{
  for(const readyState of [1,2]){
    const f=fixture(),waits=[];let now=0;
    f.c.Date=class extends Date{static now(){return now;}};
    f.c.setTimeout=(fn,ms)=>{waits.push({fn,ms});return waits.length;};
    f.audioPlay(()=>Promise.reject(new Error('NotAllowedError')));
    f.c.all=[song('clip',{type:'video',tags:['musica']})];f.c.xtoreMusicRebuild();await settle();
    const video=f.c.mediaEl;Object.assign(video,{videoWidth:640,videoHeight:360,readyState,currentTime:0});
    now=20000;waits.find(t=>t.ms===3500).fn();
    assert.equal(f.messages.at(-1).data.phase,'audio-blocked');assert.equal(f.c.mediaEl,video);
    // A gesture starts play(), but no frame/playing yet, even if a first datum exists.
    f.audioPlay(el=>{el.paused=false;return new Promise(()=>{});});
    f.c.xtoreMusicTap();now+=750;waits.at(-1).fn();
    assert.equal(f.c.mediaEl,video);assert.deepEqual(f.timers,[]);assert.equal(f.advances.length,0);
    now=23000;waits.at(-1).fn();
    assert.equal(f.c.mediaEl,video);assert.deepEqual(f.timers,[]);
    // The network/decoder allowance remains bounded, not an endless wait.
    now=readyState<2?36000:24000;waits.at(-1).fn();
    assert.equal(f.c.mediaEl,null);assert.deepEqual(f.timers,[10000]);
  }
});

test('late video metadata preserves audio-blocked and then confirmed playing instead of selected',async()=>{
  const f=fixture();f.c.setTimeout=()=>0;
  f.audioPlay(()=>Promise.reject(new Error('NotAllowedError')));
  f.c.all=[song('clip',{type:'video',tags:['musica']})];f.c.xtoreMusicRebuild();await settle();
  const video=f.c.mediaEl;Object.assign(video,{duration:420,videoWidth:640,videoHeight:360,readyState:1,currentTime:0});
  assert.equal(f.messages.at(-1).data.phase,'audio-blocked');
  video.onloadedmetadata();
  assert.equal(video.paused,true);assert.equal(f.messages.at(-1).data.phase,'audio-blocked');
  assert.equal(f.c.tap.classList.contains('show'),true);assert.deepEqual(f.timers,[]);
  f.audioPlay(el=>{el.paused=false;el.emit('playing');return Promise.resolve();});
  f.c.xtoreMusicTap();await settle();assert.equal(f.messages.at(-1).data.phase,'playing');
  video.onloadedmetadata();
  assert.equal(f.messages.at(-1).data.phase,'playing');assert.equal(f.c.mediaEl,video);
  assert.equal(f.c.tap.classList.contains('show'),false);assert.equal(f.advances.length,0);
});

test('blocked autoplay stays on the same song; tap retries sound without fullscreen',async()=>{
  const f=fixture();let blocked=true;
  f.audioPlay(el=>blocked?Promise.reject(new Error('NotAllowedError')):(el.emit('playing'),Promise.resolve()));
  f.draft([song(),song('two')]);f.c.xtoreMusicRebuild();await settle();
  const audio=f.c.mediaEl;
  assert.equal(f.messages.at(-1).data.phase,'audio-blocked');assert.equal(f.c.tap.classList.contains('show'),true);
  assert.deepEqual(f.timers,[]);assert.equal(f.advances.length,0);
  f.c.xtoreMusicRebuild();assert.equal(f.c.mediaEl,audio);assert.equal(f.created.length,1);
  blocked=false;f.c.muted=true;f.c.volume=0;assert.equal(f.c.xtoreMusicTap(),true);await settle();
  assert.equal(f.c.mediaEl,audio);assert.equal(f.c.muted,false);assert.equal(f.c.volume,0.6);
  assert.equal(f.c.tap.classList.contains('show'),false);assert.equal(f.messages.at(-1).data.phase,'playing');
  assert.match(html,/tap\.addEventListener\('click',\(\)=>\{ if\(xtoreMusicTap\(\)\)return; enterKiosk\(\)/);
});

test('first/repeated neutral and refresh preserve the selected song, even while its cache lookup is pending',async()=>{
  const f=fixture();let release;f.c.cachedSrc=()=>new Promise(resolve=>{release=resolve;});f.draft([song()]);
  f.c.xtoreMusicRebuild();const token=f.c._playTok;f.c.xtoreMusicRebuild();assert.equal(f.c._playTok,token);
  release(null);await settle();const audio=f.c.mediaEl;
  f.c.xtoreMusicRebuild();assert.equal(f.c.mediaEl,audio);assert.equal(f.c._playTok,token);
});

test('valid creative interrupts music, removes old audio, then neutral restarts the first song',async()=>{
  const f=fixture();f.draft([song(),song('two')]);f.c.xtoreMusicRebuild();await settle();
  const audio=f.c.mediaEl,ended=audio.onended;
  f.c.all=[{id:'promo',type:'image',url:'https://media.example/promo.png',title:'Promo'}];f.c.seg.ids=['promo'];f.c._condPlaylist=false;
  f.c.xtoreMusicRebuild();await settle();assert.equal(audio.pauseCount,1);assert.equal(audio.loadCount,1);assert.equal(audio.src,undefined);
  const promo=f.created.at(-1);assert.equal(promo.tagName,'IMG');assert.equal(f.messages.at(-1).data.loop,false);
  ended();assert.equal(f.advances.length,0);
  f.c.seg.ids=null;f.c._condPlaylist=true;f.c.xtoreMusicRebuild();await settle();
  assert.notEqual(f.c.mediaEl,audio);assert.equal(f.c.playlist[f.c.cur].id,'default:song');assert.equal(f.messages.at(-1).data.loop,true);
});

test('missing creatives and theme-only segments retain the music base, never broad Stock fallback',async()=>{
  const f=fixture();f.draft([song()]);f.c.xtoreMusicRebuild();await settle();const audio=f.c.mediaEl;
  f.c.all=[song('unrelated',{type:'video'})];f.c._condPlaylist=false;f.c.seg.ids=['missing'];f.c.xtoreMusicRebuild();
  assert.equal(f.c.mediaEl,audio);f.c.seg={ids:null,tag:'music',category:'all',medio:'all'};f.c.xtoreMusicRebuild();
  assert.equal(f.c.mediaEl,audio);assert.equal(f.c.playlist[0].id,'default:song');
});

test('playlist removal stops current audio and pending play callbacks cannot revive it or overwrite empty state',async()=>{
  const f=fixture();let reject;f.audioPlay(()=>new Promise((resolve,fail)=>{reject=fail;}));
  f.draft([song()]);f.c.xtoreMusicRebuild();await settle();const old=f.c.mediaEl;
  f.draft([]);f.c.xtoreMusicRebuild();const count=f.messages.length;
  reject(new Error('late denial'));await settle();assert.equal(f.messages.length,count);assert.equal(f.c.mediaEl,null);
  assert.equal(old.pauseCount,1);assert.equal(f.c.tap.classList.contains('show'),false);
});

test('late successful play of a replaced audio is stopped again',async()=>{
  const f=fixture();let resolve;f.audioPlay(()=>new Promise(done=>{resolve=done;}));
  f.draft([song()]);f.c.xtoreMusicRebuild();await settle();const old=f.c.mediaEl;
  f.draft([]);f.c.xtoreMusicRebuild();resolve();await settle();assert.equal(old.pauseCount,2);
});

test('general stall guard neither skips long music nor blocked audio but ordinary profiles retain its deadline',()=>{
  const f=fixture(),c=f.c;let recovered=0;
  Object.assign(c,{guardBeat(){},guardState:()=>({lastPlayAt:0,lastProgressAt:0}),directOn:false,PREVIEW:{on:false},
    GUARD_SLOT_MAX_S:180,GUARD_STALL_S:12,guardRecover:()=>recovered++});
  vm.runInContext(section('function guardTick()','setInterval(guardTick'),c);
  c.mediaEl={tagName:'AUDIO'};c.guardTick();assert.equal(recovered,0);
  c.XTORE_PARENT='';c.guardTick();assert.equal(recovered,1);
});

test('a song may progress beyond six minutes; only a real unpaused audio stall is recovered',()=>{
  const f=fixture(),c=f.c;let now=0,recovered=0;const guard={lastPlayAt:0,lastProgressAt:0,lastPos:-1,stalls:0};
  Object.assign(c,{guardBeat(){},guardState:()=>guard,directOn:false,PREVIEW:{on:false},
    Date:class extends Date{static now(){return now;}},GUARD_SLOT_MAX_S:180,GUARD_STALL_S:12,guardRecover:()=>recovered++});
  vm.runInContext(section('function guardTick()','setInterval(guardTick'),c);
  c.mediaEl={tagName:'AUDIO',paused:true,currentTime:0};now=600000;c.guardTick();assert.equal(recovered,0);
  c.mediaEl.paused=false;
  for(let i=1;i<=40;i++){now+=10000;c.mediaEl.currentTime=i*10;c.guardTick();}
  assert.equal(recovered,0);assert.equal(c.mediaEl.currentTime,400);
  now+=12001;c.guardTick();assert.equal(recovered,1);assert.equal(guard.stalls,1);
});

test('bad/missing metadata adds no timer, and stale metadata cannot alter the new track',async()=>{
  const f=fixture();f.draft([song()]);f.c.xtoreMusicRebuild();await settle();const old=f.c.mediaEl;
  for(const duration of [NaN,Infinity,0]){old.duration=duration;old.onloadedmetadata();assert.deepEqual(f.timers,[]);}
  f.draft([song('new')]);f.c.xtoreMusicRebuild();await settle();
  old.duration=432;old.onloadedmetadata();assert.equal(f.c.playlist[0]._dur,undefined);assert.deepEqual(f.timers,[]);
});

test('sound affordance has button semantics and Enter/Space retry without fullscreen or repeated keys',async()=>{
  const f=fixture();f.draft([song()]);f.c.xtoreMusicRebuild();await settle();let prevent=0,calls=0;
  f.audioPlay(()=>{calls++;return Promise.resolve();});
  const bind=section("if(xtoreMusicEnabled()){\n  document.documentElement.classList.add('xtore-music')",'let hideT;');
  vm.runInContext(bind,f.c);
  assert.equal(f.c.document.documentElement.classList.contains('xtore-music'),true);
  const ordinary=fixture();ordinary.c.XTORE_PARENT='';vm.runInContext(bind,ordinary.c);
  assert.equal(ordinary.c.document.documentElement.classList.contains('xtore-music'),false);
  assert.equal(f.c.tap.role,'button');assert.equal(f.c.tap.tabIndex,0);
  for(const key of ['Enter',' '])f.c.xtoreMusicKeydown({key,preventDefault(){prevent++;}});
  f.c.xtoreMusicKeydown({key:'Enter',repeat:true,preventDefault(){prevent++;}});
  f.c.xtoreMusicKeydown({key:'Escape',preventDefault(){prevent++;}});
  assert.equal(calls,2);assert.equal(prevent,3);await settle();
  f.c.XTORE_PARENT='';f.c.xtoreMusicKeydown({key:'Enter',preventDefault:()=>assert.fail('ordinary player')});assert.equal(calls,2);
});

test('outside music profile actual audio retains its editorial slot',async()=>{
  const f=fixture();f.c.qs=new URLSearchParams();f.c.STREAM_OK=true;f.c.playlist=[song()];await f.c.play(0);
  assert.deepEqual(f.timers,[10000]);assert.equal(f.c.editorialSec({...song(),_dur:420}),10);
});

test('clean music never requests kiosk fullscreen while ordinary clean profiles retain it',()=>{
  for(const music of [true,false]){
    const f=fixture(),listeners=[];f.c.document.documentElement.classList.add('clean');
    if(!music)f.c.XTORE_PARENT='';
    f.c.document.addEventListener=type=>listeners.push(type);
    vm.runInContext(section('const KIOSK =','tap.addEventListener(\'click\''),f.c);
    assert.equal(f.eval('KIOSK'),!music);
    assert.deepEqual(listeners,music?[]:['pointerdown']);
  }
});

test('music does not probe unrelated catalogue video/image media',async()=>{
  const f=fixture();vm.runInContext(section('async function measurePass()','// feedback de importación'),f.c);
  f.c.all=[song('video',{type:'video'})];await f.c.measurePass();assert.equal(f.created.length,0);
});

test('actual default reader filters raw types, recovers from empty on later read, and preserves a good list on failure',async()=>{
  const f=fixture(),c=f.c;let reply={ok:true,draft:{items:[]}},fail=false;
  Object.assign(c,{scr:{screen:'xtore-virtual-zapatillas'},PREVIEW:{on:false},
    xtorePublicRead:async resource=>{assert.equal(resource,'playlist');if(fail)throw new Error('offline');return reply;},
    rebuild:()=>c.xtoreMusicRebuild()});
  vm.runInContext(section('async function loadDefaultDraft()','// Entrelaza los creativos'),c);
  await c.loadDefaultDraft();assert.equal(f.messages.at(-1).data.phase,'playlist-empty');
  reply={ok:true,draft:{items:[{id:'music',assetType:'music',asset:'https://media.example/music.mp3'},
    {id:'speech',type:'locucion',assetType:'audio',asset:'https://media.example/speech.mp3'},
    {id:'video',assetType:'video',asset:'https://media.example/video.mp4'}]}};
  await c.loadDefaultDraft();await settle();const audio=c.mediaEl;assert.equal(c.playlist.length,2);assert.equal(c.playlist[0].id,'default:music');
  fail=true;await c.loadDefaultDraft();assert.equal(c.mediaEl,audio);
  fail=false;reply={ok:false};await c.loadDefaultDraft();assert.equal(c.mediaEl,audio);
  reply={ok:true,draft:{items:[]}};await c.loadDefaultDraft();assert.equal(c.mediaEl,null);
  assert.match(html,/loadDefaultDraft\(\); setInterval\(loadDefaultDraft, 30000\)/);
});

test('real conditional engine preserves first neutral, interrupts only a resolvable asset and returns on TTL',async()=>{
  const f=fixture(),c=f.c;let now=10000;
  Object.assign(c,{Date:class extends Date{static now(){return now;}},setInterval:()=>0,clearInterval(){},
    seenSig:'',scr:{},syncSegPanel(){},flashCli(){},setAdmiraMode:()=>assert.fail('No engine restart'),
    rebuild:()=>c.xtoreMusicRebuild(),xtorePublicRead:async()=>({rules:[
      {kind:'bicycle',tag:'music'}, // Themes alone cannot turn music into broad Stock.
      {kind:'bicycle',assets:['missing']},
      {kind:'car',assets:['promo']},
    ]})});
  c.all=[{id:'promo',type:'image',url:'https://media.example/promo.png',title:'Promo'}];
  f.draft([song()]);c.xtoreMusicRebuild();await settle();const first=c.mediaEl;
  vm.runInContext(readFileSync(new URL('../../xpl-runtime.js',import.meta.url),'utf8'),c);
  vm.runInContext(section('const AUD_KIND_ALIAS=','function runCli(raw)'),c);
  vm.runInContext(section('const XPLCanal = (function(){','// ── AUDIENCIA REMOTA: sondeo'),c);
  c.window.XPLCanal.start();await settle();c.forceAudience('u');assert.equal(c.mediaEl,first);
  c.forceAudience('bici');await settle();assert.equal(c.mediaEl,first);
  c.forceAudience('coche');await settle();assert.equal(c.playlist[0].id,'promo');assert.equal(first.pauseCount,1);
  now+=6001;c.window.XPLCanal.tick();await settle();assert.equal(c.playlist[0].id,'default:song');
  assert.notEqual(c.mediaEl,first);const resumed=c.mediaEl;c.forceAudience('u');assert.equal(c.mediaEl,resumed);
});

test('local bridge and real engine select Top Gun for any person and Power Of Love for vehicles, without editorial cuts',async()=>{
  const f=fixture(),c=f.c,replies=[];let now=10000,sequence=0;
  const target={postMessage:data=>replies.push(data)};
  const bridge=new PlayerDataBridge({target,fetcher:()=>assert.fail('Music rules never fetch/write global settings')});
  Object.assign(c,{Date:class extends Date{static now(){return now;}},setTimeout:()=>0,setInterval:()=>0,clearInterval(){},
    seenSig:'',scr:{screen:'xtore-virtual-zapatillas'},syncSegPanel(){},flashCli(){},setAdmiraMode:()=>assert.fail('No engine restart'),
    rebuild:()=>c.xtoreMusicRebuild(),xtorePublicRead:async resource=>{
      assert.equal(resource,'rules');const requestId='local-rules-'+(++sequence);
      await bridge.receive({origin:'null',source:target,data:{source:'admira-tv-public-data',resource,requestId}});
      const reply=replies.find(r=>r.requestId===requestId);assert.equal(reply.ok,true);return reply.data;
    }});
  const top={id:XTORE_MUSIC_ASSETS.person,type:'video',url:'https://media.example/topgun.mp4',title:'Top Gun'},
    future={id:XTORE_MUSIC_ASSETS.car,type:'video',url:'https://media.example/future.mp4',title:'The Power Of Love'};
  c.all=[top,future];f.draft([song('base'),song('base-two')]);c.xtoreMusicRebuild();await settle();const base=c.mediaEl;
  vm.runInContext(readFileSync(new URL('../../xpl-runtime.js',import.meta.url),'utf8'),c);
  vm.runInContext(section('const AUD_KIND_ALIAS=','function runCli(raw)'),c);
  vm.runInContext(section('const XPLCanal = (function(){','// ── AUDIENCIA REMOTA: sondeo'),c);
  const engine=c.window.XPLCanal;engine.start();await settle();c.forceAudience('u');assert.equal(c.mediaEl,base);
  c.forceAudience('persona');await settle();const personClip=c.mediaEl;
  assert.equal(c.playlist[0].id,top.id);assert.equal(f.messages.at(-1).data.loop,false);
  assert.equal(c.window.__xplForce.gender,null);assert.equal(c.window.__xplForce.age,null);
  personClip.duration=300;personClip.videoWidth=640;personClip.videoHeight=360;personClip.onloadedmetadata();
  assert.deepEqual(f.timers,[]);assert.equal(top._dur,300);
  now+=5000;c.forceAudience('persona');assert.equal(c.mediaEl,personClip);
  now+=5999;engine.tick();assert.equal(c.mediaEl,personClip);
  now+=1;engine.tick();await settle();assert.equal(c.playlist[0].id,'default:base');assert.equal(f.messages.at(-1).data.loop,true);
  let vehicleClip;
  for(const command of ['coche','moto','bici']){
    now+=1000;c.forceAudience(command);await settle();assert.equal(c.playlist[0].id,future.id);
    assert.equal(c.window.__xplForce.gender,null);assert.equal(c.window.__xplForce.age,null);
    if(vehicleClip)assert.equal(c.mediaEl,vehicleClip);else vehicleClip=c.mediaEl;
  }
  c.forceAudience('u');await settle();assert.equal(c.playlist[0].id,'default:base');const returned=c.mediaEl;
  c.forceAudience('u');assert.equal(c.mediaEl,returned);assert.deepEqual(f.timers,[]);
  // An explicit rule cannot fall through to a different song or a non-musical asset.
  for(const replacement of [null,{...top,type:'image'},{...top,type:'locucion'},
    {...top,url:'http://media.example/topgun.mp4'},{...top,url:'https://user:pass@media.example/topgun.mp4'}]){
    c.all=replacement?[replacement,future]:[future];c.forceAudience('persona');await settle();
    assert.equal(c.mediaEl,returned);assert.equal(c.playlist[0].id,'default:base');
  }
  // Expiry also invalidates a still-loading conditional piece before its cache lookup settles.
  c.all=[top,future];let release;c.cachedSrc=()=>new Promise(resolve=>{release=resolve;});
  c.forceAudience('persona');const staleToken=c._playTok;c.cachedSrc=async()=>null;
  now+=6000;engine.tick();await settle();const current=c.mediaEl;
  release(null);await settle();assert.equal(c.mediaEl,current);assert.ok(c._playTok>staleToken);
  assert.equal(c.playlist[0].id,'default:base');assert.equal(f.messages.at(-1).data.loop,true);
  engine.stop();bridge.stop();
});

test('opaque music selection/playing/blocked/empty cannot write proof, presence, playlist/cache mirrors or location',async()=>{
  const f=fixture(),c=f.c,writes=[];let tallyCalls=0;
  Object.assign(c,{PREVIEW:{on:false},fetch:(...args)=>{writes.push(args);return Promise.resolve({ok:true});},
    emitLoad:()=>{tallyCalls++;return {};},_emitDirty:true,_emitTally:{totalPlays:9},scr:{screen:'xtore-virtual-zapatillas',circuit:'admiranext'}});
  for(const [from,to] of [
    ['function emitRecord(it)',"window.addEventListener('beforeunload'"],
    ['function _postNow(item)','// ── GUARDIA DE EMISIÓN'],
    ['function signageNowPush(it)','// ── STANDBY'],
    ['function _postStandby()','function standbyOn('],
    ['function signagePlaylistPush()','// Audiencia por cámara'],
    ['function cacheReport()','// Durante una descarga'],
    ['function pushPosition(coords)','function onGeo('],
    ['function startPositionBeat()','/* ── DATOS DE TERCEROS'],
  ])vm.runInContext(section(from,to),c);
  f.draft([song()]);c.xtoreMusicRebuild();await settle();
  f.audioPlay(()=>Promise.reject(new Error('NotAllowedError')));await c.play(0);await settle();
  assert.equal(f.messages.at(-1).data.phase,'audio-blocked');
  f.draft([]);c.xtoreMusicRebuild();
  for(const fn of ['emitFlush','_postNow','_postStandby','signagePlaylistPush','cacheReport','startPositionBeat'])c[fn]();
  c.pushPosition([0,0]);
  assert.equal(tallyCalls,0);assert.deepEqual(writes,[]);assert.equal(c._nowItem,null);
});
