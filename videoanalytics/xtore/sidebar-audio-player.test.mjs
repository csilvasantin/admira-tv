// Execute the actual player controls and message listener, not a duplicate implementation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../../canal.html',import.meta.url),'utf8');
function portion(from,to){const start=html.indexOf(from);assert.ok(start>=0,from);const end=html.indexOf(to,start);assert.ok(end>start,to);return html.slice(start,end);}
function player({parentOrigin='https://admira.tv',mediaOverride={}}={}){
  const messages=[],nodes=new Map(),calls={play:0,paint:0,push:0,tap:0};let listener;
  const parent={postMessage(data,origin){messages.push({data:JSON.parse(JSON.stringify(data)),origin});}};
  const media={muted:false,volume:.6,currentTime:42,paused:false,src:'https://stock.example/song.mp3',
    pause(){assert.fail('Audio controls must not pause playback');},play(){calls.play++;return Promise.resolve();},...mediaOverride};
  const context={XTORE_PARENT:parentOrigin,window:{parent,addEventListener(name,fn){if(name==='message')listener=fn;}},
    mediaEl:media,muted:false,volume:.6,paused:false,playlist:[{id:'current-song'}],cur:0,_standby:false,directOn:false,
    _localInfoRemoteBusy:false,_localInfoRepeatKey:'',_xtoreMusicItem:{id:'current-song'},_playTok:7,
    $(id){if(!nodes.has(id))nodes.set(id,{hidden:false,textContent:'',value:0});return nodes.get(id);},save(){},
    localInfoAudioPaint(){calls.paint++;},localInfoRemoteRender(){},pushAudioStateSoon(){calls.push++;},
    xtoreMusicEnabled:()=>true,localInfoRepeatAllowed:()=>false,
    next(){assert.fail('Mute must not advance the song');},prev(){assert.fail('Mute must not rewind the playlist');},
    play(){assert.fail('Mute must not replace the current media');},forceAudience(){assert.fail('Audio is independent from audience');},
    setAdmiraMode(){assert.fail('Audio must not change the playback mode');},
    navigator:{mediaDevices:{getUserMedia(){assert.fail('Audio controls must not open the camera');}}},
    tap:{classList:{add(name){if(name==='show')calls.tap++;}}},console};
  vm.createContext(context);
  vm.runInContext(portion('function localInfoRemoteAudio(){','function localInfoRemoteRender(){'),context);
  vm.runInContext(portion('function applyAudio(){','// barra/avance temporizado'),context);
  vm.runInContext(portion('function bridgeOriginAllowed(origin){','function emitFrameState('),context);
  vm.runInContext(portion("window.addEventListener('message',event=>{\n  const d0=",'// ── CONTROLES OCULTOS DE TESTING'),context);
  vm.runInContext(portion('function localInfoRemoteAction(action){','function localInfoRemoteBind(){'),context);
  return {context,media,messages,calls,parent,command(command,extra={},source=parent,origin=parentOrigin){listener({source,origin,data:{source:'admira-tv-panel',command,requestId:'audio-1',...extra}});}};
}

test('Remote mute reports effective state and acknowledgement without pausing, changing track or forcing video',()=>{
  const p=player();p.command('audiooff');
  assert.equal(p.media.muted,true);assert.equal(p.media.currentTime,42);assert.equal(p.context.cur,0);assert.equal(p.context.playlist[0].id,'current-song');
  assert.equal(p.media.src,'https://stock.example/song.mp3');assert.equal(p.media.paused,false);assert.equal(p.calls.play,0);
  assert.deepEqual(p.messages.map(m=>m.origin),['https://admira.tv','https://admira.tv']);
  assert.deepEqual(p.messages[0].data,{source:'admira-tv-canal',event:'audio-state',muted:true,volume:.6});
  assert.deepEqual(p.messages[1].data.audio,{muted:true,volume:.6});assert.equal(p.messages[1].data.requestId,'audio-1');assert.equal(p.messages[1].data.ok,true);
});

test('Unmute stays on the same audio and reports the actual new volume',()=>{
  const p=player();p.command('audiooff');p.messages.length=0;p.command('audioon',{volume:.35});
  assert.equal(p.media.muted,false);assert.equal(p.media.volume,.35);assert.equal(p.media.currentTime,42);assert.equal(p.context.cur,0);assert.equal(p.calls.play,1);
  assert.deepEqual(p.messages[0].data,{source:'admira-tv-canal',event:'audio-state',muted:false,volume:.35});
  assert.deepEqual(p.messages[1].data.audio,{muted:false,volume:.35});
});

test('Zero effective volume remains muted even when the requested mute flag is false',()=>{
  const p=player();Object.defineProperty(p.media,'volume',{get:()=>0,set(){}});p.command('audioon',{volume:.8});
  assert.equal(p.context.volume,.8);assert.equal(p.media.muted,false);
  assert.deepEqual(p.messages[0].data,{source:'admira-tv-canal',event:'audio-state',muted:true,volume:0});
  assert.deepEqual(p.messages[1].data.audio,{muted:true,volume:0});
});

test('The internal mini remote publishes its own fresh audio state through applyAudio',()=>{
  const p=player();assert.equal(p.context.localInfoRemoteAction('mute'),true);
  assert.equal(p.media.muted,true);assert.equal(p.messages.length,1);assert.equal(p.messages[0].data.event,'audio-state');
  assert.equal(p.messages[0].data.muted,true);assert.equal(p.calls.play,0);
  assert.equal(p.context.localInfoRemoteAction('mute'),true);assert.equal(p.media.muted,false);assert.equal(p.messages[1].data.muted,false);
  assert.equal(p.media.currentTime,42);assert.equal(p.context._localInfoRemoteBusy,false);
});

test('Rejected autoplay keeps the existing tap-to-play path; acknowledgement is configuration only',async()=>{
  const p=player({mediaOverride:{paused:true,play(){return Promise.reject(new Error('NotAllowedError'));}}});
  p.command('audioon');await Promise.resolve();
  assert.equal(p.calls.tap,1);assert.equal(p.media.paused,true);assert.equal(p.media.currentTime,42);
  assert.deepEqual(p.messages.at(-1).data.audio,{muted:false,volume:.6});
  assert.equal(Object.hasOwn(p.messages.at(-1).data.audio,'playing'),false);assert.equal(Object.hasOwn(p.messages.at(-1).data.audio,'audible'),false);
});

test('Only the exact configured parent and origin may control the isolated player',()=>{
  const p=player();p.command('audiooff',{},p.parent,'https://xpaceos.com');
  p.command('audiooff',{}, {postMessage(){assert.fail('Sibling must receive no reply');}},'https://admira.tv');
  p.command('audiooff',{},p.parent,'https://admira.tv.evil.example');
  assert.equal(p.media.muted,false);assert.equal(p.messages.length,0);
  p.command('audiooff');assert.equal(p.media.muted,true);assert.equal(p.messages.length,2);
});

test('Standalone players retain their existing reply contract and do not emit Xtore audio events',()=>{
  const p=player({parentOrigin:''});p.context.applyAudio();assert.equal(p.messages.length,0);
  p.context.bridgeReply({source:p.parent,origin:'https://xpaceos.com',data:{requestId:'standalone'}},true,'ok');
  assert.equal(p.messages.length,1);assert.equal(Object.hasOwn(p.messages[0].data,'audio'),false);
});
