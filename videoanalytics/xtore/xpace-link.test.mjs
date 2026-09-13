import test from 'node:test';
import assert from 'node:assert/strict';
import {installXpaceLink,allowedTwinOrigin} from './xpace-link.mjs';
function fixture(t){
 t.mock.timers.enable({apis:['setInterval','Date'],now:10000});
 const listeners={},nodes=new Map(),sent=[],peer={closed:false,postMessage:(d,o,tr)=>sent.push({d,o,tr})};
 const node=()=>({textContent:'',addEventListener(type,fn){this[type]=fn;}});
 const document={hidden:false,getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);},addEventListener(type,fn){listeners['doc:'+type]=fn;}};
 const window={location:{origin:'https://admira.tv',search:'?twinOrigin=https%3A%2F%2Fwww.xpaceos.com&twinSession=00000000-0000-0000-0000-000000000001'},opener:peer,addEventListener(type,fn){listeners[type]=fn;}};
 const link=installXpaceLink({window,document});
 const receive=(data,origin='https://www.xpaceos.com',source=peer)=>listeners.message({source,origin,data:{source:'xpace-xtore-twin',screen:'xtore-virtual-zapatillas',session:'00000000-0000-0000-0000-000000000001',...data}});
 return {link,window,document,listeners,sent,receive,peer};
}
test('unrelated window cannot open media or camera transmission; reports retain their original age',t=>{
 const f=fixture(t);f.link.media({ts:10000,id:'a'});f.receive({event:'hello'},'https://evil.test');t.mock.timers.tick(500);
 assert.equal(f.sent.some(x=>x.d.event==='playback'),false);
 f.receive({event:'ready'});t.mock.timers.tick(500);assert.equal(f.sent.at(-1).d.playback.ts,10000);
 t.mock.timers.tick(1500);assert.equal(f.sent.at(-1).d.event,'playback-off');
});
test('pause or a late bitmap cannot retain a camera frame',async t=>{
 const f=fixture(t);f.receive({event:'ready'});let resolve,closed=0;
 f.window.createImageBitmap=()=>new Promise(r=>resolve=r);
 const pending=f.link.camera({width:640},[],0);f.link.cameraOff();resolve({close(){closed++;}});await pending;
 assert.equal(closed,1);assert.equal(f.sent.some(x=>x.d.event==='camera'),false);
 f.receive({event:'disconnect'});f.document.hidden=true;f.listeners['doc:visibilitychange']();assert.equal(f.link.backgroundActive,false);
});
test('camera sends only the crop and bounded aggregate categories to its exact peer',async t=>{
 const f=fixture(t);f.receive({event:'ready'});const bitmap={close(){}};f.window.createImageBitmap=async()=>bitmap;
 await f.link.camera({width:640},[{confirmed:true,ageMs:100,class:'person',id:123,bbox:[1,2,3,4]}]);
 const packet=f.sent.at(-1);assert.equal(packet.o,'https://www.xpaceos.com');assert.equal(packet.d.event,'camera');
 assert.deepEqual(packet.d.counts,{person:1,car:0,motorcycle:0,bicycle:0});assert.deepEqual(packet.tr,[bitmap]);assert.equal(packet.d.id,undefined);
});
test('local development origins do not expand production access',()=>{
 assert.equal(allowedTwinOrigin('https://www.xpaceos.com','https://admira.tv'),true);
 assert.equal(allowedTwinOrigin('http://localhost:9000','https://admira.tv'),false);
 assert.equal(allowedTwinOrigin('https://xpaceos.com.evil.test','https://admira.tv'),false);
});
test('camera carries confirmed passage totals separately from current presence',async t=>{
 const f=fixture(t);f.receive({event:'ready'});f.window.createImageBitmap=async()=>({close(){}});
 const totals={person:17,car:4,motorcycle:2,bicycle:1};
 await f.link.camera({width:480},[{confirmed:true,ageMs:50,class:'person'}],0,totals);
 assert.equal(f.sent.at(-1).d.counts.person,1);assert.deepEqual(f.sent.at(-1).d.passages,totals);
 t.mock.timers.tick(300);await f.link.camera({width:480},[],0,{...totals,person:-1});
 assert.equal(f.sent.at(-1).d.passages,null);
});
test('opening the twin refreshes camera-only controls without another calibration',t=>{
 t.mock.timers.enable({apis:['setInterval']});
 const button={},status={},peer={closed:false,postMessage(){}};
 const document={getElementById:id=>id==='open-xpace'?button:status,addEventListener(){}};
 button.addEventListener=(type,fn)=>{button[type]=fn;};
 let changes=0;
 const window={location:{origin:'https://admira.tv',search:''},crypto:{randomUUID:()=> '00000000-0000-0000-0000-000000000001'},open:()=>peer,addEventListener(){}};
 const link=installXpaceLink({window,document,onChange:()=>changes++});
 assert.equal(link.cameraOnly,false);button.click();
 assert.equal(link.cameraOnly,true);assert.equal(changes,1);
});

test('paired background tab keeps fresh media and camera until heartbeat expires',async t=>{
 const f=fixture(t);f.receive({event:'ready'});f.document.hidden=true;
 f.listeners['doc:visibilitychange']();assert.equal(f.link.backgroundActive,true);
 f.link.media({ts:10000,id:'live'});t.mock.timers.tick(500);
 assert.equal(f.sent.at(-1).d.event,'playback');assert.equal(f.sent.at(-1).d.playback.ts,10000);
 f.window.createImageBitmap=async()=>({close(){}});await f.link.camera({width:320},[]);
 assert.equal(f.sent.at(-1).d.event,'camera');
 t.mock.timers.tick(4000);assert.equal(f.link.backgroundActive,false);
 const frames=f.sent.filter(x=>x.d.event==='camera').length;
 await f.link.camera({width:320},[]);assert.equal(f.sent.filter(x=>x.d.event==='camera').length,frames);
 f.receive({event:'ready'});assert.equal(f.link.backgroundActive,true);
 t.mock.timers.tick(500);assert.equal(f.sent.filter(x=>x.d.event.startsWith('playback')).at(-1).d.event,'playback-off');
});

test('manual scooter passages travel independently; absent or invalid totals are not invented',async t=>{
 const f=fixture(t);f.receive({event:'ready'});f.window.createImageBitmap=async()=>({close(){}});
 const totals={person:9,car:2,motorcycle:1,bicycle:3,scooter:4};
 await f.link.camera({width:480},[],0,totals);
 assert.deepEqual(f.sent.at(-1).d.passages,totals);assert.equal(f.sent.at(-1).d.counts.scooter,undefined);
 t.mock.timers.tick(300);await f.link.camera({width:480},[],0,{...totals,scooter:-1});
 assert.equal(f.sent.at(-1).d.passages.scooter,undefined);
});

test('statistics use the exact cumulative values and propagate resets even without camera frames',t=>{
 const f=fixture(t),totals={person:47,car:0,motorcycle:1,bicycle:3,scooter:0};
 f.link.statistics(totals);assert.equal(f.sent.length,0);f.receive({event:'ready'});
 assert.deepEqual(f.sent.at(-1).d.passages,totals);assert.equal(f.sent.at(-1).d.event,'statistics');
 f.link.cameraOff();f.link.statistics({...totals,person:0,scooter:2});
 assert.equal(f.sent.at(-1).d.passages.person,0);assert.equal(f.sent.at(-1).d.passages.scooter,2);
 const count=f.sent.length;f.link.statistics({...totals,person:-1});assert.equal(f.sent.length,count);
});
test('paired views share a capture timestamp and both bitmaps close if paused or one fails',async t=>{
 const f=fixture(t);f.receive({event:'ready'});const clean={width:320},original={width:320},bitmaps=[];
 f.window.createImageBitmap=async source=>{const b={source,closed:false,close(){this.closed=true;}};bitmaps.push(b);return b;};
 await f.link.camera(clean,[],0,null,{original,modified:true});
 const packet=f.sent.at(-1);assert.equal(packet.d.modified,true);assert.equal(packet.d.bitmap.source,clean);assert.equal(packet.d.originalBitmap.source,original);assert.equal(packet.tr.length,2);
 t.mock.timers.tick(300);let resolvers=[];f.window.createImageBitmap=()=>new Promise(resolve=>resolvers.push(resolve));
 const pending=f.link.camera(clean,[],0,null,{original,modified:true});f.link.cameraOff();
 const a={closed:false,close(){this.closed=true;}},b={closed:false,close(){this.closed=true;}};resolvers[0](a);resolvers[1](b);await pending;assert.equal(a.closed,true);assert.equal(b.closed,true);
 t.mock.timers.tick(300);const c={closed:false,close(){this.closed=true;}};
 f.window.createImageBitmap=async source=>{if(source===original)throw Error('unavailable');return c;};
 await f.link.camera(clean,[],0,null,{original,modified:true});assert.equal(c.closed,true);
});
