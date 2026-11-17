import test from 'node:test';
import assert from 'node:assert/strict';
import {playlistCounter,paintPlaylistCounter} from './assets/galleon-counter.mjs';
const slots=Array.from({length:15},(_,i)=>({landscape:{id:String(i)},portrait:{id:'v'+i}}));
const current={source:'playlist',id:'2',index:2,total:15};
test('shows one-based position and counts paired slots once',()=>{
 assert.equal(playlistCounter(current,slots).text,'3/15');
});
test('tracks additions and removals even when onAir counters are stale in pause',()=>{
 assert.equal(playlistCounter(current,slots.slice(1),{paused:true}).text,'2/14');
 assert.equal(playlistCounter(current,[...slots,{landscape:{id:'new'}}]).text,'3/16');
 assert.equal(playlistCounter({...current,id:''},[]).text,'0/0');
});
test('mute red, pause amber and playback white; no false counter for playout',()=>{
 assert.equal(playlistCounter(current,slots,{muted:true,paused:true}).color,'#ff6565');
 assert.equal(playlistCounter(current,slots,{paused:true}).color,'#ffd166');
 assert.equal(playlistCounter(current,slots).color,'#ffffff');
 assert.equal(playlistCounter({...current,source:'playout'},slots),null);
});
test('draws readable top-right overlay, restores canvas and omits absent counter',()=>{
 const calls=[];const ctx={save:()=>calls.push('save'),restore:()=>calls.push('restore'),measureText:()=>({width:80}),fillRect:(...a)=>calls.push(a),fillText:(...a)=>calls.push(a)};
 const canvas={width:720,height:384,getContext:()=>ctx};
 paintPlaylistCounter(canvas,playlistCounter(current,slots));
 assert.deepEqual(calls,['save',[598,14,108,44],['3/15',692,36],'restore']);
 paintPlaylistCounter(canvas,null);assert.equal(calls.length,4);
});
