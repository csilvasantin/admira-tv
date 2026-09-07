const {test}=require('node:test'),assert=require('node:assert/strict');
const music=require('../../js/pedestrian-music.js');
const item=(id,tags=['musica','1'],type='video')=>({id,type,tags,url:'https://media.example/'+id+'.mp4',title:id});
test('matches music AND an exact numeric tag, never ordinal stock numbers or audio',()=>{
 const slots=music.resolve([item('wrong',['1']),item('audio',['musica','1'],'audio'),item('ten',['#música','#10']),item('one',['musica','1']),{...item('ordinal',['musica']),num:2},item('hundred',['musica','100'])]);
 assert.equal(slots[0].item.id,'music:one');assert.equal(slots[9].item.id,'music:ten');assert.equal(slots[1].item,null);
});
test('ambiguous tags and duplicate videos fail explicitly instead of choosing a random song',()=>{
 let slots=music.resolve([item('a'),item('b')]);assert.match(slots[0].error,/varios/);
 slots=music.resolve([item('a',['musica','1','2'])]);assert.ok(slots[0].item);assert.equal(slots[1].item,null);
});
test('rapid fader intentions select only the latest song; zero cancels pending music',async()=>{
 let resolveLoad,played=[],stopped=0;const load=new Promise(r=>resolveLoad=r);
 const player=music.create({load:()=>load,play:i=>played.push(i.number),stop:()=>stopped++});
 const one=player.select(1),two=player.select(2);resolveLoad(music.resolve([item('a'),item('b',['musica','2'])]));await Promise.all([one,two]);assert.deepEqual(played,[2]);
 await player.select(2);assert.deepEqual(played,[2]);await player.select(2,{restart:true});assert.deepEqual(played,[2,2]);await player.select(0);assert.equal(stopped,1);
 let unblock;const pending=new Promise(r=>unblock=r);const next=music.create({load:()=>pending,play:()=>assert.fail('stale selection played'),stop:()=>{}});const task=next.select(1);await next.select(0);unblock(music.resolve([item('a')]));await task;
});
test('missing music stops previous playback and reports the unavailable tag',async()=>{
 const states=[];let stopped=0;const c=music.create({load:()=>Promise.resolve(music.resolve([])),play:()=>assert.fail(),stop:()=>stopped++,onState:s=>states.push(s)});await c.select(4);assert.equal(stopped,1);assert.equal(states.at(-1).status,'error');assert.match(states.at(-1).title,/#4/);
});
