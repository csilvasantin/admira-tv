import test from 'node:test';import assert from 'node:assert/strict';
import {onRequestGet,onRequestPost} from './virtual-players.js';
function environment(email='csilva@admira.com'){
 const players=new Map(),pairs=new Map();
 return {players,pairs,ACCESS:{async get(key){if(key==='admira-tv:auth:session:test')return JSON.stringify({email,expiresAt:Date.now()+60000});return null;}},VIRTUAL_PLAYERS:{getByName(id){return{async register(args){const p={...args,player_type:'virtual'};players.set(id,p);return{ok:true,created:true,player:p};},async readPlayer(){return players.get(id)||null;},async readPairing(){return pairs.get(id)||{source:null,revision:0};},async assignPairing(args){const prev=pairs.get(id)||{revision:0};if(prev.revision!==args.revision)throw Error('revision_conflict');const result={...args,revision:args.revision+1};pairs.set(id,result);return result;}};}}};
}
const request=(body,headers={})=>new Request('https://admira.tv/api/virtual-players',{method:'POST',headers:{Cookie:'__Host-atv_session=test',Origin:'https://admira.tv','Content-Type':'application/json',...headers},body:JSON.stringify(body)});
const player={screen:'xtore-virtual-zapatillas',name:'Zapatillas',circuit:'admiranext',mode:'conditional'};
test('unauthorized, cross-origin and viewer requests never write',async()=>{
 for(const [env,headers] of [[environment(),{Cookie:''}],[environment(),{Origin:'https://evil.example'}],[environment('viewer@example.org'),{}]]){
 const r=await onRequestPost({env,request:request({action:'register',...player},headers)});assert.ok([401,403].includes(r.status));assert.equal(env.players.size,0);}
});
test('register, pair, public read and unlink keep IDs separate',async()=>{
 const env=environment();assert.equal((await onRequestPost({env,request:request({action:'register',...player})})).status,200);
 const pair=()=>request({action:'pair',device:'ipad-luna',screen:player.screen,revision:0});
 assert.equal((await onRequestPost({env,request:pair()})).status,200);
 assert.equal((await onRequestPost({env,request:pair()})).status,409);
 const data=await(await onRequestGet({env,request:new Request('https://admira.tv/api/virtual-players?device=ipad-luna')})).json();
 assert.equal(data.pairing.screen,'ipad-luna');assert.equal(data.pairing.source.screen,player.screen);
 assert.equal((await onRequestPost({env,request:request({action:'pair',device:'ipad-luna',screen:null,revision:1})})).status,200);
 assert.equal(env.pairs.get('physical:ipad-luna').source,null);
});
test('missing virtual player, virtual device and bad JSON cannot be paired',async()=>{
 const env=environment();
 for(const [body,status] of [[{action:'pair',device:'ipad-luna',screen:player.screen,revision:0},404],[{action:'pair',device:player.screen,screen:player.screen,revision:0},400],[null,400]])assert.equal((await onRequestPost({env,request:request(body)})).status,status);
 assert.equal(env.pairs.size,0);
 assert.equal((await onRequestGet({env,request:new Request('https://admira.tv/api/virtual-players?device=../ipad')})).status,400);
});
