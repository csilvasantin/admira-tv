// Real player functions in a minimal in-memory DOM; no browser, network or media files.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

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
      emit(type){handlers.get(type)?.();},
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
    document:{body:node(),createElement(tag){const el=node(tag);created.push(el);return el;}},
    $:id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);},
    guardPlayStarted(){},stopBar(){},syncOn:false,playlist:[],all:[],cur:-1,
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
  vm.runInContext(section('function editorialSec(','function syncNow('),c);
  vm.runInContext(section('function emitFrameState(','// r62: cada cambio de carril'),c);
  vm.runInContext(section('function mediaAdvance(','// antes de cada nuevo contenido'),c);
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

test('base accepts HTTPS audio/music only and rejects known locutions before/after mapping',()=>{
  const {c}=fixture();
  const items=[song(),song('music',{type:'music'}),song('video',{type:'video'}),song('image',{type:'image'}),
    song('speech',{type:'locucion',assetType:'audio'}),song('known-speech'),song('bad',{url:'javascript:alert(1)'})];
  assert.deepEqual(Array.from(c.xtoreMusicItems(items,[{id:'known-speech',type:'locucion'}]),it=>it.id),['default:song','default:music']);
});

test('empty base emits an explicit empty state and never plays Stock',()=>{
  const f=fixture();f.c.all=[song('stock'),song('stock-video',{type:'video'})];
  f.c.xtoreMusicRebuild();
  assert.equal(f.created.length,0);assert.equal(f.c.playlist.length,0);
  assert.match(f.c.stage.innerHTML,/Asocia una playlist de música/);
  assert.deepEqual(JSON.parse(JSON.stringify(f.messages.at(-1))),{origin:'https://admira.tv',data:{source:'admira-tv-canal',event:'media-state',orientation:'landscape',aspect:1,
    mode:'conditional',sync:false,id:'playlist-default',phase:'playlist-empty',loop:true,music:true,mediaType:null,muted:false,volume:0.8}});
});

test('actual audio playback uses onended, no editorial timer and no opaque cold-cache waiting',async()=>{
  const f=fixture();f.draft([song()]);f.c.xtoreMusicRebuild();await settle();
  const audio=f.c.mediaEl;assert.equal(audio.tagName,'AUDIO');assert.deepEqual(f.timers,[]);assert.equal(f.c.usesAdv,false);
  audio.duration=420;audio.onloadedmetadata();assert.equal(f.c.editorialSec(f.c.playlist[0]),420);assert.deepEqual(f.timers,[]);
  assert.equal(f.messages.at(-1).data.phase,'playing');assert.equal(f.messages.at(-1).data.mediaType,'audio');
  audio.onended();assert.equal(f.advances.length,1);
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
  vm.runInContext(section("if(xtoreMusicEnabled()){\n  tap.setAttribute('role'",'let hideT;'),f.c);
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
  await c.loadDefaultDraft();await settle();const audio=c.mediaEl;assert.equal(c.playlist.length,1);assert.equal(c.playlist[0].id,'default:music');
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
