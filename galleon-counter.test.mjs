import test from 'node:test';
import assert from 'node:assert/strict';
import {playlistCounter,paintPlaylistCounter,playlistTiming,paintPlaylistTiming} from './assets/galleon-counter.mjs';
import {paintKeyTile} from './assets/galleon-layout.mjs';
const slots=Array.from({length:15},(_,i)=>({landscape:{id:String(i)},portrait:{id:'v'+i}}));
const current={source:'playlist',id:'2',index:2,total:15};
test('counters only appear on mute, including pause and empty list',()=>{
 assert.equal(playlistCounter(current,slots),null);
 assert.equal(playlistCounter(current,slots,{paused:true}),null);
 assert.equal(playlistCounter(current,slots,{muted:true}).text,'3/15');
 assert.equal(playlistCounter(current,slots.slice(1),{muted:true}).text,'2/14');
 assert.equal(playlistCounter({...current,id:''},[],{muted:true}).text,'0/0');
 assert.equal(playlistCounter({...current,source:'playout'},slots,{muted:true}),null);
});
function canvas(){
 const calls=[];const ctx={save(){},restore(){},measureText:t=>({width:t.length*22}),fillRect(){},drawImage(){},fillText(text,...args){calls.push({text,font:this.font,args})}};
 return {width:720,height:384,calls,getContext:()=>ctx};
}
test('main LCD uses 40px text only in mute',()=>{
 const c=canvas();paintPlaylistCounter(c,playlistCounter(current,slots));assert.equal(c.calls.length,0);
 paintPlaylistCounter(c,playlistCounter(current,slots,{muted:true}));assert.equal(c.calls[0].text,'3/15');assert.match(c.calls[0].font,/40px/);
});
test('small keys use central 44px counter only in mute, empty keys stay blank',()=>{
 const entry={position:3,total:15,offset:1,next:true,title:'Video'};
 for(const muted of [true,false]){
  const c=canvas();paintKeyTile(c,entry,{muted});const counter=c.calls.find(call=>call.text==='3/15');
  assert.equal(!!counter,muted);if(counter){assert.match(counter.font,/44px/);assert.deepEqual(counter.args,[80,47,146]);}
 }
 const empty=canvas();paintKeyTile(empty,null,{muted:true});assert.equal(empty.calls.length,0);
});

test('duration and countdown follow whole seconds and hide outside muted playlist',()=>{
 const at = offsetMs => ({index:2, slot:{seconds:125}, offsetMs});
 const timing = ms => playlistTiming(current,at(ms),{muted:true});
 assert.deepEqual(timing(0),{duration:'2:05',remaining:'2:05'});
 assert.equal(timing(999).remaining,'2:05');
 assert.equal(timing(1000).remaining,'2:04');
 assert.equal(timing(125000).remaining,'0:00');
 assert.equal(timing(126000).remaining,'0:00');
 assert.equal(playlistTiming(current,at(0)),null);
 assert.equal(playlistTiming(current,null,{muted:true}),null);
 assert.equal(playlistTiming(current,{...at(0),index:3},{muted:true}),null);
 assert.equal(playlistTiming(current,{...at(0),slot:{seconds:3661}},{muted:true}).duration,'1:01:01');
 const c=canvas();paintPlaylistTiming(c,timing(1000));
 assert.deepEqual(c.calls.map(v=>[v.text,...v.args]),[['2:05',28,43],['−2:04',28,341]]);
});
