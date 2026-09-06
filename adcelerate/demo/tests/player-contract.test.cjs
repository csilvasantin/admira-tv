const {test}=require('node:test');
const assert=require('node:assert/strict');
const bridge=require('../js/outdoor-context.js');
const library=require('../js/player-library.js');
const surfaces=require('../js/dooh-surfaces.js');
const token={screenId:'vila-left',requestId:7};
test('remote commands reject unknown screens, unbounded seeks and URL injection',()=>{
 for(const command of [{action:'seek',seconds:Infinity},{action:'seek',seconds:-1},{action:'volume',volume:2},{action:'mute',muted:'false'},{action:'loop',loop:'forever'},{action:'content',url:'https://example.com/movie.mp4'},{action:'fleet-reload'}])assert.equal(bridge.validatePlayerCommand({...token,...command}),null);
 assert.equal(bridge.validatePlayerCommand({...token,screenId:'sim-gracia-kiosko',action:'next'}),null);
 assert.equal(bridge.validatePlayerCommand({...token,requestId:0,action:'next'}),null);
 assert.deepEqual(bridge.validatePlayerCommand({...token,action:'content',contentId:'stock:123',url:'https://example.com/ignored.mp4'}),{...token,action:'content',contentId:'stock:123'});
 const source={},origin='https://admira.tv',data=bridge.message('player-command',{...token,action:'next'});
 assert.equal(bridge.accepts({source,origin,data},source,origin),true);
 assert.equal(bridge.accepts({source:{},origin,data},source,origin),false);
 assert.equal(bridge.accepts({source,origin:'https://example.com',data},source,origin),false);
});
test('remote state validates real media values and strips private URL metadata',()=>{
 const state={...token,mode:'local',status:'playing',contentId:'a',title:'Cápsula',playlistId:'scheduled',index:0,total:1,position:2,duration:10,volume:.7,muted:true,loop:'one',catalog:[{id:'a',title:'Cápsula',type:'video',url:'https://admira.tv/private.mp4'}],playlists:[{id:'scheduled',title:'Programación',items:['a']}]};
 const valid=bridge.validatePlayerState(state);assert.ok(valid);assert.equal(valid.catalog[0].url,undefined);assert.equal(valid.playlists[0].items,undefined);
 for(const patch of [{status:'fake-success'},{index:1},{duration:NaN},{catalog:[state.catalog[0],state.catalog[0]]},{muted:0}])assert.equal(bridge.validatePlayerState({...state,...patch}),null);
});
test('library keeps schedule order and resolves stock outside it without arbitrary media types',()=>{
 const scheduled=[{id:'b',type:'video',title:'Anuncio',url:'https://admira.tv/b.mp4',lane:'publicidad'},{id:'a',type:'image',url:'https://admira.tv/a.jpg',lane:'municipal'}];
 const result=library.build(scheduled,[{id:'b',type:'video',url:'https://admira.tv/b.mp4'},{id:'new',type:'animation',url:'https://api.admira.store/new.mp4'}, {id:'unsafe',type:'video',url:'javascript:alert(1)'},{id:'page',type:'interactive',url:'https://admira.tv/canal.html'}]);
 const lists=Object.fromEntries(result.playlists.map(p=>[p.id,p.items]));
 assert.deepEqual(lists.scheduled,['b','a']);assert.deepEqual(lists.all,['b','a','stock:new']);assert.deepEqual(lists.publicidad,['b']);assert.deepEqual(lists.municipal,['a']);assert.deepEqual(lists.stock,['b','stock:new']);
 assert.equal(result.items[2].type,'video');assert.equal(result.items.length,3);
 assert.equal(library.build([],[{id:'asset',num:836,title:null,type:'image',url:'https://admira.tv/photo.jpg'}]).items[0].title,'Imagen 836');
});
test('catalogue fetch is a credential-free GET, failures preserve caller fallback',async()=>{
 let observed;
 assert.deepEqual(await library.fetchStock(async(url,options)=>{observed={url,options};return {ok:true,json:async()=>({items:[{id:'test'}]})}}),[{id:'test'}]);
 assert.equal(observed.url,library.STOCK_URL);assert.equal(observed.options.credentials,'omit');assert.equal(observed.options.method,undefined);
 await assert.rejects(library.fetchStock(async()=>({ok:false})),/Catálogo no disponible/);
});
test('remote framing uses freed HUD space while preserving the Lesseps optical zoom cap',()=>{
 const vila=surfaces.get('vila-left'),before=surfaces.fit(vila,1104,814),remote=surfaces.fit(vila,1104,814,{top:24,bottom:48,side:24});
 assert.ok(remote.zoom>before.zoom);
 assert.ok(surfaces.fit(surfaces.get('lesseps-main'),1104,814,{top:24,bottom:48,side:24}).zoom<=3);
});
