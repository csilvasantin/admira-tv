import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('./canal.html',import.meta.url),'utf8');
const code=html.slice(html.indexOf('async function fetchSyncState(){'),html.indexOf('\nconst $ ='));
for(const delay of [0,250,2400,8000]) test(`theme latency ${delay} ms does not shift the master clock`,async()=>{
 let at=10000;
 const context=vm.createContext({Date:{now:()=>at},SYNC_API:'clock',SYNC_PLAYLIST_API:'theme',qs:{get:()=>null},scr:{screen:'test'},SYNC_GROUP_MASTER:'',SYNC_REMOTE:null,_syncOwnPlaylist:false,_syncSig:'',syncOn:false,_cacheTech:new Map(),console,
 fetch:async url=>({ok:true,json:async()=>{if(url.startsWith('clock'))return {serverNow:10125,items:[{id:'global',dur:20}],slotMs:20000};at+=delay;return {items:[{id:'own',type:'video',dur:7}]};}})});
 vm.runInContext(code,context);await vm.runInContext('fetchSyncState()',context);
 assert.equal(context.SYNC_REMOTE.offset,125);
 assert.equal(context.SYNC_REMOTE.items[0].id,'own');
 assert.equal(context.SYNC_REMOTE.items[0]._dur,7);
});
