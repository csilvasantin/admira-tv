import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';
const code=fs.readFileSync(new URL('./assets/player-pairing.js',import.meta.url),'utf8');
function runtime({search='?screen=ipad-local-test',saved=null,fetcher}={}){
 let reloads=0,interval,requests=0;const stored=new Map(saved?[['adtv_pairing:ipad-local-test',JSON.stringify(saved)]]:[]);
 const ctx=vm.createContext({URLSearchParams,AbortController,console:{warn(){}},setTimeout,clearTimeout,setInterval(fn){interval=fn;},location:{search,reload(){reloads++;}},localStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)},fetch:async(...args)=>{requests++;return fetcher(...args);}});ctx.window=ctx;vm.runInContext(code,ctx);return{ctx,stored,poll:()=>interval(),reloads:()=>reloads,requests:()=>requests};
}
const source={screen:'xtore-virtual-zapatillas',name:'Zapatillas',circuit:'admiranext',mode:'conditional'};
test('boot reads assignment; an unchanged poll never reloads; unlink reloads once',async()=>{
 let revision=1;const app=runtime({fetcher:async()=>Response.json({ok:true,pairing:{screen:'ipad-local-test',source:revision===1?source:null,revision}})});
 await app.ctx.AdmiraPlayerPairing.ready;assert.equal(app.ctx.AdmiraPlayerPairing.source.screen,source.screen);assert.equal(app.reloads(),0);
 await app.poll();assert.equal(app.reloads(),0);revision=2;await app.poll();assert.equal(app.reloads(),1);assert.equal(app.ctx.AdmiraPlayerPairing.source,null);
});
test('network failure keeps the last confirmed source across restart',async()=>{
 const app=runtime({saved:{screen:'ipad-local-test',source,revision:4},fetcher:async()=>{throw Error('offline');}});await app.ctx.AdmiraPlayerPairing.ready;assert.equal(app.ctx.AdmiraPlayerPairing.source.screen,source.screen);assert.equal(app.reloads(),0);
});
test('virtual iframe and rundown never poll or consume hardware assignment',async()=>{
 for(const search of ['?screen=xtore-virtual-zapatillas','?screen=ipad-local-test&xtoreParent=1','?screen=ipad-local-test&rundown=preview']){
 const app=runtime({search,fetcher:async()=>{throw Error('should not call');}});await app.ctx.AdmiraPlayerPairing.ready;assert.equal(app.requests(),0);assert.equal(app.ctx.AdmiraPlayerPairing.source,null);}
});
test('playlist is read from logical source while physical identity is retained',async()=>{
 const html=fs.readFileSync(new URL('./canal.html',import.meta.url),'utf8');
 const fn=html.slice(html.indexOf('async function loadDefaultDraft(){'),html.indexOf('// Entrelaza los creativos'));
 const calls=[];const ctx=vm.createContext({pairingReady:Promise.resolve(),programScreen:()=>source.screen,programCircuit:()=>source.circuit,scr:{screen:'ipad-local-test',circuit:'luna'},PREVIEW:{on:false},XTORE_PARENT:false,xtoreMusicEnabled:()=>false,DEFAULT_DRAFT:{signature:'',items:[]},fetch:async url=>{calls.push(url);return Response.json({ok:true,draft:{items:[{id:'shoe',asset:'https://example.com/shoe.jpg',type:'image',seconds:12}]}});},rebuild(){},encodeURIComponent,Date});vm.runInContext(fn,ctx);await ctx.loadDefaultDraft();assert.match(calls[0],/screen=xtore-virtual-zapatillas/);assert.equal(ctx.scr.screen,'ipad-local-test');assert.equal(ctx.DEFAULT_DRAFT.items[0]._previewSec,12);
});
