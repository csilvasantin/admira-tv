import test from 'node:test';
import assert from 'node:assert/strict';
import {stockCatalog,appendStockItems} from './_stock-playlists.js';
import {onRequestGet,onRequestPost} from './stock-playlists.js';
import {forgetMemo,stockPlaylistSnapshot,onRequestGet as playerGet} from './playlist.js';
import {cleanCircuit,serviceBindings,deduceScreenTags} from './_playlist-live.js';
const phone='iphone17-mupi',ipad='ipad-admin-mupi',secret='service-test';
const piece=id=>({id,type:'video',url:`https://stock.admira.store/stock/${id}/asset.mp4`,title:id,tags:[],routingSource:{tags:[],comment:''}});
const item=id=>({id:'stock-'+id,stockId:id,title:id,asset:piece(id).url,assetType:'video',seconds:40});
function fixture(t){
 forgetMemo();const store=new Map(),now=Date.now();
 store.set('admira-tv:screen:xpacio:v1',JSON.stringify({builtAt:now,map:{[phone]:{x:'iphone17',n:'iPhone de Carlos',c:'iphone17',b:'admiranext',i:'AdmiraNeXT_iPhone_Pantalla_1'},[ipad]:{x:'paseo103',n:'Paseo de Gracia 103',c:'starbucks-es',b:'starbucks',i:'Starbucks_Paseo103_iPad_1'}}}));
 store.set('admira-tv:playlist:live:v1',JSON.stringify({rev:1,playlists:[],circuits:[{id:'starbucks-hilo',name:'Starbucks hilo musical',target:{all:['pantalla:'+phone]},service:{brand:'starbucks',use:'hilomusical'}}]}));
 store.set('admira-tv:playlist:default:v1:'+phone,JSON.stringify({screen:phone,name:'starbucks.xpacio.hilomusical',items:[item('old1'),item('old2')],rev:7}));
 const ACCESS={get:async k=>store.get(k)||null,put:async(k,v)=>store.set(k,v),list:async()=>({keys:[],list_complete:true})};
 const stock=[piece('old1'),piece('old2'),piece('new1985'),{...piece('auto1984'),tags:['starbucks','hilomusical'],routingSource:{tags:['starbucks','hilomusical'],comment:''}}];
 t.mock.method(globalThis,'fetch',async input=>{const url=String(input);if(url.includes('/stock/index.json'))return Response.json({items:stock});if(url.includes('/grid/screens'))return Response.json({screens:[{screen:phone,circuit:'iphone17'},{screen:ipad,circuit:'starbucks-es'}]});if(url.includes('/grid/projects'))return Response.json({projects:[{id:'starbucks',name:'Starbucks',circuits:['starbucks-es']},{id:'admiranext',name:'AdmiraNeXT',circuits:['iphone17']}]});if(url.includes('/locations/')){const id=url.split('/').at(-1);return Response.json({id,name:id,iot:[]});}return new Response('no',{status:404});});
 return {env:{ACCESS,STOCK_NOTIFY_KEY:secret},store,stock};
}
const request=(body,key=secret)=>new Request('https://admira.tv/api/stock-playlists',{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Notify-Key':key},...(body?{body:JSON.stringify(body)}:{})});
test('catálogo: servicio Starbucks apunta a iPhone sin cambiar su proyecto físico y marca pertenencias efectivas',async t=>{
 const f=fixture(t),r=await onRequestGet({request:request(),env:f.env}),d=await r.json();assert.equal(r.status,200);
 assert.ok(d.rows.some(r=>r.project==='admiranext'&&r.screen===phone));assert.deepEqual(d.rows.filter(r=>r.circuit==='starbucks-hilo').map(r=>r.screen),[phone]);
 const a=d.assignments.find(a=>a.screen===phone&&a.project==='starbucks');assert.equal(a.name,'starbucks.xpacio.hilomusical');assert.equal(a.project,'starbucks');assert.deepEqual(new Set(a.stockIds),new Set(['old1','old2','auto1984']));
 assert.equal(d.assignments.some(a=>a.stockIds.includes('new1985')),false);
});
test('una playlist conserva todas sus rutas físicas y de servicio sin multiplicar su identidad',()=>{
 const data=stockCatalog({screens:[{screen:phone,facts:{screen:phone,project:'admiranext',xpace:'iphone17'}}],circuits:['starbucks','sneakerstore'].map(brand=>({id:brand,target:{all:['pantalla:'+phone]},service:{brand,use:'hilomusical'}})),playlists:[{screen:phone,name:'music',items:[item('song')]}]});
 assert.deepEqual(data.assignments.map(a=>a.project),['admiranext','starbucks','sneakerstore']);assert.equal(new Set(data.assignments.map(a=>a.id)).size,1);
});
test('circuito de catálogo Starbucks ofrece el iPad sin cambiar identidad ni habilitar contenido de marca',async t=>{
 const f=fixture(t),demo=cleanCircuit({id:'starbucks-demo-ipad',name:'Demo iPad',catalogProject:'starbucks',target:{all:['pantalla:'+ipad]}});
 f.store.set('admira-tv:screen:identity:v1',JSON.stringify({map:{[ipad]:{p:'admiranext',x:'ipad-admin',n:'iPad de Admin',xn:'iPad de Admin'}}}));
 const index=JSON.parse(f.store.get('admira-tv:screen:xpacio:v1'));index.map[ipad]={x:'ipad-admin',n:'iPad de Admin',c:'ipad-admin',b:'admiranext'};f.store.set('admira-tv:screen:xpacio:v1',JSON.stringify(index));
 f.store.set('admira-tv:playlist:live:v1',JSON.stringify({rev:2,playlists:[],circuits:[demo]}));
 f.store.set('admira-tv:playlist:default:v1:'+ipad,JSON.stringify({screen:ipad,name:'Starbucks demo',items:[item('demo1'),item('demo2')],rev:5}));
 f.stock.push(piece('demo1'),piece('demo2'),...Array.from({length:25},(_,i)=>({...piece('brand'+i),tags:['starbucks'],routingSource:{tags:['starbucks'],comment:''}})));
 const before=f.store.get('admira-tv:playlist:default:v1:'+ipad),r=await onRequestGet({request:request(),env:f.env}),catalog=await r.json();
 assert.ok(catalog.rows.some(r=>r.project==='starbucks'&&r.circuit==='starbucks-demo-ipad'&&r.screen===ipad));
 assert.equal(catalog.rows.some(r=>r.circuit==='starbucks-demo-ipad'&&r.screen===phone),false);
 assert.deepEqual(catalog.assignments.find(a=>a.screen===ipad&&a.project==='starbucks').stockIds,['demo1','demo2']);
 const player=await (await playerGet({request:new Request('https://admira.tv/api/playlist?screen='+ipad+'&player=1&o=vertical'),env:f.env})).json();
 assert.deepEqual(player.draft.items.map(i=>i.stockId),['demo1','demo2']);assert.deepEqual(player.auto,[]);assert.ok(player.screenTags.includes('proyecto:admiranext'));assert.equal(player.screenTags.includes('proyecto:starbucks'),false);
 assert.deepEqual(serviceBindings([demo],deduceScreenTags({screen:ipad,project:'admiranext'})),[]);
 assert.equal(f.store.get('admira-tv:playlist:default:v1:'+ipad),before);
 const again=await onRequestPost({request:request({screens:[ipad],stockIds:['demo1']}),env:f.env});
 assert.equal((await again.json()).results[0].added,0);assert.equal(f.store.get('admira-tv:playlist:default:v1:'+ipad),before);
});
const rule=(id,target,tag)=>({id,name:id,enabled:true,target:{all:target},content:{type:'visual',all:[tag],any:[],none:[],limit:200,seconds:30,matchOrientation:false}});
test('pertenencias resueltas con identidad actual; ignora proyecto antiguo del censo',async t=>{
 const f=fixture(t);f.env.ACCESS.list=async()=>({list_complete:true,keys:[{name:'admira-tv:screen:tags:v1:'+ipad,metadata:{tags:['proyecto:old','idioma:es'],seenAt:Date.now()}}]});
 f.stock[0].tags=['old'];f.stock[2].tags=['new'];
 f.store.set('admira-tv:playlist:live:v1',JSON.stringify({circuits:[],playlists:[rule('obsolete',['proyecto:old'],'old'),rule('current',['proyecto:starbucks'],'new')]}));
 const p=(await stockPlaylistSnapshot(f.env)).playlists.find(p=>p.screen===ipad);assert.ok(p.items.some(i=>i.stockId==='new1985'));assert.equal(p.items.some(i=>i.stockId==='old1'),false);
});
test('playlist sintética respeta el límite efectivo de 200 al unir reglas y hashtags',async t=>{
 const f=fixture(t);f.stock.splice(0,f.stock.length,...Array.from({length:200},(_,i)=>({...piece('live'+i),tags:['live']})),{...piece('extra'),tags:[ipad],routingSource:{tags:[ipad],comment:''}});
 f.store.set('admira-tv:playlist:live:v1',JSON.stringify({circuits:[],playlists:[rule('live',['pantalla:'+ipad],'live')]}));
 const p=(await stockPlaylistSnapshot(f.env)).playlists.find(p=>p.screen===ipad);assert.equal(p.items.length,200);assert.equal(p.items.some(i=>i.stockId==='extra'),false);
});
test('añadir conserva lista, orden, nombre, medios y duración previos; no fija las piezas automáticas ni duplica',async t=>{
 const f=fixture(t),body={screens:[phone],stockIds:['new1985']};
 const r=await onRequestPost({request:request(body),env:f.env});assert.equal(r.status,200);assert.equal((await r.json()).results[0].added,1);
 const saved=JSON.parse(f.store.get('admira-tv:playlist:default:v1:'+phone));assert.equal(saved.name,'starbucks.xpacio.hilomusical');assert.deepEqual(saved.items.map(i=>i.stockId),['old1','old2','new1985']);assert.equal(saved.items[0].seconds,40);assert.equal(saved.items[2].assetType,'video');
 const again=await onRequestPost({request:request(body),env:f.env});assert.equal((await again.json()).results[0].added,0);
 const auto=await onRequestPost({request:request({screens:[phone],stockIds:['auto1984']}),env:f.env});assert.equal((await auto.json()).results[0].added,0);assert.equal(JSON.parse(f.store.get('admira-tv:playlist:default:v1:'+phone)).items.length,3);
 assert.equal(f.store.has('admira-tv:playlist:default:v1:'+ipad),false);
});
test('sin clave no lee ni escribe, destinos desconocidos y assets ajenos se rechazan',async t=>{
 const f=fixture(t);assert.equal((await onRequestGet({request:request(null,'bad'),env:f.env})).status,401);
 assert.equal((await onRequestPost({request:request({screens:['unknown-player'],stockIds:['new1985']}),env:f.env})).status,400);
 assert.equal((await onRequestPost({request:request({screens:[phone],stockIds:['missing']}),env:f.env})).status,400);
});
test('fallo KV en un destino conserva y comunica los éxitos anteriores e invalida catálogo',async t=>{
 const f=fixture(t),put=f.env.ACCESS.put;await onRequestGet({request:request(),env:f.env});
 f.env.ACCESS.put=async(k,v)=>{if(k.endsWith(ipad))throw Error('KV unavailable');return put(k,v);};
 const r=await onRequestPost({request:request({screens:[phone,ipad],stockIds:['new1985']}),env:f.env});assert.equal(r.status,409);
 const d=await r.json();assert.equal(d.results[0].ok,true);assert.equal(d.results[1].ok,false);assert.equal(d.results[1].error,'distribution_failed');
 const updated=await (await onRequestGet({request:request(),env:f.env})).json();assert.ok(updated.assignments.some(a=>a.screen===phone&&a.stockIds.includes('new1985')));
});
test('protege playlists automáticas y capacidad sin truncar; no-op de una pieza ya asignada sí es válido',()=>{
 assert.throws(()=>appendStockItems({synthetic:true,manual:[],items:[]},[item('new')]),/explicit_pin/);
 assert.equal(appendStockItems({synthetic:true,manual:[],items:[item('auto')]},[item('auto')]).added,0);
 assert.throws(()=>appendStockItems({items:Array.from({length:200},(_,i)=>item('a'+i))},[item('new')]),/playlist_full/);
});
