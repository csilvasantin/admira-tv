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
test('the same fader number resumes its song after a remote player override',async()=>{
 let current=true,plays=0;const c=music.create({load:()=>Promise.resolve(music.resolve([item('a')])),play:()=>plays++,stop:()=>{},isCurrent:()=>current});await c.select(1);await c.select(1);assert.equal(plays,1);current=false;await c.select(1);assert.equal(plays,2);
});

test('Metahuman preference uses the assigned artist, not the stock ordinal',()=>{const s=music.resolve([item('1781952357264-shzjr3',['musica','10'])])[9];assert.equal(s.item.artist,'Blur');assert.equal(music.preference(s.number,s.item.artist),'A Metahuman 10 le gusta Blur');});

test('dropping person 1 selects exact Top Gun asset without changing person 7 tags',async()=>{
 const stock=[item('one'),item('1786533143983-n2y09e',['musica','7'])],slots=music.resolve(stock),played=[];
 assert.equal(slots[6].item.number,7);assert.equal(slots.topGun.number,1);
 const player=music.create({load:()=>Promise.resolve(slots),play:(i,items)=>{played.push(i.id);assert.equal(items.filter(x=>x.id===i.id).length,1)},stop:()=>{}});
 await player.select(1,{atKiosk:true});await player.select(1);assert.deepEqual(played,['music:1786533143983-n2y09e','music:one']);
});
test('missing Top Gun fails explicitly and leaving cancels a pending drop',async()=>{
 const states=[];const missing=music.create({load:()=>Promise.resolve(music.resolve([item('one')])),play:()=>assert.fail('unrelated video'),stop:()=>{},onState:s=>states.push(s)});
 await missing.select(1,{atKiosk:true});assert.match(states.at(-1).title,/Top Gun/);assert.equal(states.at(-1).status,'error');
 let ready;const p=music.create({load:()=>new Promise(r=>ready=r),play:()=>assert.fail('stale drop'),stop:()=>{}});const drop=p.select(1,{atKiosk:true});await p.select(0);ready(music.resolve([item('1786533143983-n2y09e',['musica','7'])]));await drop;
});
