import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripLayoutFor, tileFor, VHV_WEIGHTS } from './functions/api/playout.js';

const players=fs.readFileSync(new URL('./players.html',import.meta.url),'utf8');
const canal=fs.readFileSync(new URL('./canal.html',import.meta.url),'utf8');

test('preset V·H·V reparte el lienzo en tres tiras proporcionales al aspecto (Mac Mini)',()=>{
  const l=stripLayoutFor({preset:'vhv'},3);
  assert.equal(l.preset,'vhv'); assert.equal(l.rows,1); assert.equal(l.cols,3);
  const tot=VHV_WEIGHTS.reduce((a,b)=>a+b,0);
  assert.ok(Math.abs(l.weights[0]-VHV_WEIGHTS[0]/tot)<1e-5);
  assert.ok(Math.abs(l.weights.reduce((a,b)=>a+b,0)-1)<1e-5);
  assert.ok(Math.abs(l.weights[1]-70/148)<1e-5, 'la central lleva su ancho físico (70 de 148 cm)');
  const t=[0,1,2].map(i=>tileFor(l,i,3));
  assert.equal(t[0].x,0); assert.ok(Math.abs(t[1].x-l.weights[0])<1e-5);
  assert.ok(Math.abs(t[2].x+t[2].w-1)<1e-5); assert.ok(t.every(x=>x.h===1&&x.y===0&&x.rows===1));
});

test('pesos explícitos válidos y rechazo de basura',()=>{
  assert.deepEqual(stripLayoutFor({weights:[1,2,1]},3).weights,[0.25,0.5,0.25]);
  assert.equal(stripLayoutFor({weights:[1,2]},3),null);
  assert.equal(stripLayoutFor({weights:[1,-2,1]},3),null);
  assert.equal(stripLayoutFor({preset:'vhv'},2),null);
  assert.equal(stripLayoutFor(null,3),null);
});

test('sin pesos la tesela de rejilla es la de siempre',()=>{
  const t=tileFor({rows:2,cols:2},3,4);
  assert.deepEqual(t,{index:3,total:4,row:1,col:1,rows:2,cols:2});
});

test('canal pinta tiras con --wall-sx/--wall-x y players ofrece el reparto V·H·V',()=>{
  assert.match(canal,/--wall-sx/); assert.match(canal,/--wall-x,var\(--wall-col,0\)/);
  assert.match(players,/value="vhv"/); assert.match(players,/body\.layout=\{preset:'vhv'\}/);
  assert.match(players,/'macmini-2':'Mac Mini · 2 \(central\)'/);
});

test('?standby=1|0 del lanzador fija el apagado inicial de cada pantalla del Mac Mini',()=>{
  assert.match(canal,/qs\.get\('standby'\)/);
});
