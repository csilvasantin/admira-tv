// FLT-100400: el analizador replica al bus del player virtual SOLO la categoría, para que los
// equipos físicos emparejados sigan al mismo público. Nunca más de una vez por segundo por categoría.
import test from 'node:test';
import assert from 'node:assert/strict';
import {SignageBridge} from './signage.mjs';

function puente(relay){
  let now=0,serial=0;const sent=[];
  const target={postMessage:data=>sent.push(data)};
  const bridge=new SignageBridge({target,id:()=>String(++serial),now:()=>now,setTimer:()=>0,clearTimer(){},relay});
  return {bridge,sent,avanza:ms=>{now+=ms;}};
}

test('cada categoría sale una vez por segundo como mucho; un cambio o «none» sale al instante', () => {
  const relayed=[];const {bridge,avanza}=puente(kind=>{relayed.push(kind);});
  bridge.command('car'); avanza(300); bridge.command('car'); avanza(300); bridge.command('car');
  assert.deepEqual(relayed,['car']);
  avanza(400); bridge.command('car'); assert.deepEqual(relayed,['car','car']);
  bridge.command('person'); bridge.command('none'); bridge.command('none');
  assert.deepEqual(relayed,['car','car','person','none']);
});

test('al relé solo llega la categoría, y su fallo no toca la orden al player local', () => {
  const args=[];const {bridge,sent}=puente((...a)=>{args.push(a);return Promise.reject(new Error('sin sesión'));});
  bridge.command('bicycle');
  assert.deepEqual(args,[['bicycle']]);
  assert.equal(sent.length,1);
  assert.match(sent[0].command,/^admiratv audiencia bici$/);
  const {bridge:sinRele,sent:local}=puente(null); sinRele.command('car'); assert.equal(local.length,1);
});
