import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const main=readFileSync(new URL('./adcelerate/demo/js/main.js',import.meta.url),'utf8');
const html=readFileSync(new URL('./adcelerate/demo/best/index.html',import.meta.url),'utf8');
const between=(start,end)=>{const a=html.indexOf(start),b=html.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,start);return html.slice(a,b);};
const flag=html.match(/^const READONLY_DEMO = .*;$/m)[0];
const screen=between('async function mandarAlaPantalla(','function viandanteTick(');
const audience=between('function viandanteTick(','setInterval(viandanteTick');
const mug=between('function mappedMusicToMug(','function mappedMusicToScreen(');
const zone=between('async function mandarZonaTaza(','const tazaZonas=');
function fixture(query){
  const requests=[],preview=[],labels=[];
  const item={id:'coffee',num:712,title:'Coffee'};
  const context=vm.createContext({location:{search:query},URLSearchParams,Date,Map,console:{info(){}},chTimer:null,clearTimeout(){},setTimeout(){return 1;},
    fetch:async(url,options)=>{requests.push({url,options});return{ok:true,json:async()=>({ok:true})};},
    stockIndexById:new Map([[item.id,item]]),SITE_CIRCUIT:{jardinets:'fixture-circuit'},SITE_SCREEN:{jardinets:'fixture-screen'},SITE_EXTRA:{jardinets:[{circuit:'extra-circuit',screen:'extra-screen'}]},CMD_URL:'https://api.admira.store/locations/cmd',
    lastMugKey:'',liveMirrorOn:()=>true,currentAudience:()=>({mix:{}}),dominanteDe:()=> 'tourists',perfilDominante:'adults',perfilOverride:null,syncSiteId:()=> 'jardinets',piezaParaPerfil:()=>item,syncDurMs:()=>9000,chQueue:[],chIdx:0,_chSig:'old',chPlay:()=>preview.push('audience'),chTitle:()=> 'Coffee',chTag:s=>labels.push(s),
    JardinetsTaza:{fetchCatalog:async()=>[{id:'fixture-zone',item}],ordenes:()=>[{id:'fixture-mug',cmd:'tag-fixture'}]},ponerEnElQuiosco:()=>preview.push('zone')});
  vm.runInContext(flag+'\n'+screen+audience+mug+zone,context);
  return{context,requests,preview,labels,call:expression=>vm.runInContext(expression,context)};
}

test('only the TV demo launch propagates readonly to the native photo child',()=>{
  const prepare=main.match(/const url = new URL\('best\/', location.href\);[\s\S]*?frame.src = url.href;/)[0];
  for(const [query,expected] of [['?ax_demo=tv&site=starbucks','1'],['?site=starbucks',null],['?tour=dooh',null],['?ax_demo=store',null],['?ax_demo=TV',null]]){
    const frame={},context={URL,URLSearchParams,location:{href:'https://admira.tv/adcelerate/demo/'+query,search:query},mode:'human',photo:{siteId:'starbucks'},frame};
    vm.runInNewContext(prepare,context);const url=new URL(frame.src);assert.equal(url.searchParams.get('readonly'),expected);assert.equal(url.searchParams.get('embed'),'1');assert.equal(url.searchParams.get('walk'),'1');assert.equal(url.searchParams.get('site'),'starbucks');
  }
});

test('readonly audience changes keep local preview without dispatching to physical screens',async()=>{
  const f=fixture('?embed=1&walk=1&readonly=1');f.call('viandanteTick()');await Promise.resolve();assert.deepEqual(f.preview,['audience']);assert.equal(f.requests.length,0);assert.equal(await f.call("mandarAlaPantalla('jardinets',{id:'coffee',num:712})"),false);
  assert.equal(f.requests.length,0);assert.match(f.labels[0],/tourists/);assert.match(f.labels[0],/vista local/);assert.doesNotMatch(f.labels[0],/también en/);
});

test('readonly music and taza zones never POST, while the local zone preview remains available',async()=>{
  const f=fixture('?readonly=1');f.call('mappedMusicToMug(null)');assert.equal(await f.call("mandarZonaTaza({id:'fixture-zone',etiqueta:'coffee',rotulo:'Coffee'})"),true);assert.deepEqual(f.preview,['zone']);assert.equal(f.requests.length,0);assert.match(f.labels[0],/vista local/);assert.doesNotMatch(f.labels[0],/taza sin respuesta/);
});

test('ordinary visits retain physical screen and mug dispatch',async()=>{
  for(const query of ['', '?readonly=0']){
    const f=fixture(query);assert.equal(await f.call("mandarAlaPantalla('jardinets',{id:'coffee',num:712})"),true);assert.equal(f.requests.length,2);assert.ok(f.requests.every(r=>JSON.parse(r.options.body).cmd==='play712'));
    f.call('mappedMusicToMug(null)');await Promise.resolve();assert.equal(f.requests.length,3);assert.match(f.requests[2].url,/mug-status/);
    await f.call("mandarZonaTaza({id:'fixture-zone',etiqueta:'coffee',rotulo:'Coffee'})");assert.equal(f.requests.length,4);assert.equal(JSON.parse(f.requests[3].options.body).cmd,'tag-fixture');assert.ok(f.requests.every(r=>r.options.method==='POST'));
  }
});
