import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {priorityState,writePriority} from './_import-priority.js';
import {onRequestGet} from './import-priority.js';
import '../../assets/import-priorities.js';

function localD1(){
  const sql=new DatabaseSync(':memory:');
  function prepare(query){
    const statement={bind(...values){return {...statement,values};},values:[],
      async all(){return {results:sql.prepare(query).all(...this.values)};}};
    return statement;
  }
  return {prepare,async batch(batch){
    sql.exec('BEGIN');try{const rows=[];for(const st of batch)rows.push(await st.all());sql.exec('COMMIT');return rows;}
    catch(error){sql.exec('ROLLBACK');throw error;}
  }};
}
const item=stockId=>({stockId,id:stockId,assetType:'image',asset:'https://stock.admira.store/stock/'+stockId});
const ids=list=>list.map(it=>it.stockId||it.id);
test('normal FIFO, inmediata delante y destino aislado; las repeticiones conservan el turno',async()=>{
  const db=localD1(), screen='ensayo',base=[item('A'),item('B')];
  const put=(priority,id,event=crypto.randomUUID())=>writePriority(db,{screen,event,priority,item:item(id)});
  const ev=crypto.randomUUID();
  await put(2,'C',ev);await put(2,'D');await put(1,'E');await put(1,'B');
  assert.equal(await put(2,'C',ev),true);
  assert.equal(await put(2,'otra',ev),false);
  assert.deepEqual(ids(AdmiraImportPriority.ordered(base,await priorityState(db,screen))),['B','E','A','C','D']);
  assert.deepEqual(AdmiraImportPriority.ordered(base,await priorityState(db,'otra')),base);
});
test('una emergencia sustituye a la anterior y retiene incorporaciones hasta el fin explícito de la vigente',async()=>{
  const db=localD1(),screen='ensayo',base=[item('A')],a=crypto.randomUUID(),b=crypto.randomUUID();
  const send=(priority,id,event)=>writePriority(db,{screen,priority,item:item(id),event});
  const clear=(expected,event)=>writePriority(db,{screen,priority:3,expected,event});
  const active=async()=>ids(AdmiraImportPriority.ordered(base,await priorityState(db,screen)));
  await send(0,'aviso1',a);await send(2,'B',crypto.randomUUID());await send(1,'C',crypto.randomUUID());
  assert.deepEqual(await active(),['aviso1']);
  await send(0,'aviso2',b);await send(0,'aviso1',a);
  assert.equal(await clear(a,crypto.randomUUID()),false);assert.deepEqual(await active(),['aviso2']);
  const receipt=crypto.randomUUID();assert.equal(await clear(b,receipt),true);assert.equal(await clear(b,receipt),true);
  assert.deepEqual(await active(),['C','A','B']);
});
test('un fallo de datos nunca se comunica al player como fin de emergencia',async()=>{
  const request=new Request('https://admira.tv/api/import-priority?screen=prueba');
  assert.equal((await onRequestGet({request,env:{}})).status,503);
  const first=await onRequestGet({request,env:{PROGRAMACION_DB:localD1()}});
  assert.deepEqual(await first.json(),{ok:true,emergency:null,front:[],tail:[]});
});

test('el player de emergencia muestra un único medio, su sustitución y la vuelta al canal elegido',async()=>{
  const {readFileSync}=await import('node:fs'),{runInNewContext}=await import('node:vm');
  let notify,returned='',children=[];
  const main={replaceChildren(){children=[];},append(media){children.push(media);}};
  const nodes={querySelector(){return main;},createElement(kind){return {kind,play:async()=>{}};}};
  const location={origin:'https://admira.tv',search:'?screen=prueba&back=%2Fcanal%3Fscreen%3Dprueba',replace(url){returned=url;}};
  const script=readFileSync(new URL('../../assets/emergency-player.js',import.meta.url),'utf8');
  runInNewContext(script,{URL,URLSearchParams,document:nodes,location,AdmiraImportPriority:{watch({onChange}){notify=onChange;}}});
  const first={...item('aviso'),event:'A'},second={...item('aviso2'),assetType:'video',event:'B'};
  notify({emergency:first});assert.deepEqual(children.map(n=>n.src),[first.asset]);
  notify({emergency:second});assert.deepEqual(children.map(n=>n.src),[second.asset]);assert.equal(children[0].loop,true);
  notify({emergency:null});assert.equal(returned,'https://admira.tv/canal?screen=prueba');
});
