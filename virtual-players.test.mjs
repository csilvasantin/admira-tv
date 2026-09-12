import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {XTORE_VIRTUAL_SCREEN} from './videoanalytics/xtore/virtual-player.mjs';
import {playerURL} from './videoanalytics/xtore/signage.mjs';
const context=vm.createContext({AbortController,setTimeout,clearTimeout});
vm.runInContext(fs.readFileSync(new URL('./assets/virtual-players.js',import.meta.url),'utf8'),context);
const api=context.AdmiraVirtualPlayers;
const row={screen:XTORE_VIRTUAL_SCREEN,name:'Xtore',circuit:'admiranext',player_type:'virtual',mode:'conditional'};
test('one persistent row per ID, online only from telemetry, hardware never inherited',()=>{
  const live=[{screen:'real-mac',online:true,machine:'macbookair16plata'},{screen:row.screen,online:true,machine:'host-must-not-be-hardware',showing_id:'asset'}];
  const merged=api.merge(live,[row,row]);assert.equal(merged.length,2);assert.equal(merged[0].machine,'macbookair16plata');
  assert.equal(merged[1].online,true);assert.equal(merged[1].showing_id,'asset');assert.equal(merged[1].machine,'');
  assert.equal(api.merge([],[row])[0].online,false);assert.equal('last_seen' in api.merge([],[row])[0],false);
  assert.equal(api.label(merged[1]),'Virtual · navegador');assert.equal(api.label(merged[0]),'');
});
test('paginated inventory uses public read only, detects incomplete paging',async()=>{
  const calls=[];let n=0;
  const rows=await api.list(async(url,options)=>{calls.push([url,options]);return Response.json({ok:true,players:n++===0?[row]:[],cursor:n===1?'next':null});});
  assert.equal(rows.length,1);assert.equal(calls.length,2);assert.match(calls[1][0],/cursor=next/);
  assert.equal(calls[0][1].credentials,'omit');
  await assert.rejects(api.list(async()=>Response.json({ok:true,players:[],cursor:'repeat'})),/incompleta/);
});
test('Xtore stable identity preserves opaque origin and never pretends to be hardware',()=>{
  const url=new URL(playerURL(XTORE_VIRTUAL_SCREEN));
  assert.equal(url.searchParams.get('screen'),XTORE_VIRTUAL_SCREEN);assert.equal(url.searchParams.get('machine'),'');
  assert.equal(url.searchParams.get('playerType'),'virtual');assert.equal(url.searchParams.get('cam'),'0');assert.equal(url.searchParams.get('shot'),'0');
  const ui=fs.readFileSync(new URL('./videoanalytics/xtore/signage-ui.mjs',import.meta.url),'utf8');
  assert.match(ui,/playerURL\(XTORE_VIRTUAL_SCREEN/);assert.match(ui,/setAttribute\('sandbox','allow-scripts'\)/);assert.doesNotMatch(ui,/allow-same-origin/);
});
test('fleet playlist and all destination pickers include the same virtual registry',()=>{
  for(const file of ['cms.html','players.html','mando.html','parrilla/index.html','playlists/index.html']){
    const html=fs.readFileSync(new URL(file,import.meta.url),'utf8');assert.match(html,/assets\/virtual-players\.js/,file);assert.match(html,/AdmiraVirtualPlayers\./,file);
    for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))if(!/\bsrc=|type="(?:module|application\/ld\+json)"/.test(match[0].split('>')[0]))new vm.Script(match[1],{filename:file});
  }
});
test('virtual command queues cannot consume shared hardware circuit commands',()=>{
  const canal=fs.readFileSync(new URL('./canal.html',import.meta.url),'utf8');
  assert.match(canal,/async function pollCmd\(\)\{\s*if\(XTORE_PARENT\) return;/);
  assert.match(canal,/VIRTUAL_PLAYER\?\[scr\.screen\]:\[scr\.circuit,scr\.screen\]/);
  assert.match(canal,/CMD_ACK_OUTBOX_KEY=.*VIRTUAL_PLAYER\?scr\.screen:scr\.circuit/);
});
