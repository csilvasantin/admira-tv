import {sessionEmail,accessFor,authHeaders} from '../_auth-session.js';
import {stockActor,stockPlaylistSnapshot,onRequestPost as savePlaylist} from './playlist.js';
import {stockCatalog,appendStockItems} from './_stock-playlists.js';

const reply=(body,status=200)=>Response.json(body,{status,headers:authHeaders()});
const memo=new WeakMap();
async function allowed(request,env){
  if(stockActor(request,env,{}))return true;
  const email=await sessionEmail(request,env);
  return !!email&&(await accessFor(env,email,'digitalsignage-player',false)).allowed;
}
async function snapshot(env,waitUntil,fresh=false){
  const hit=memo.get(env.ACCESS);
  if(!fresh&&hit&&Date.now()-hit.at<15000)return hit.value;
  const value=await stockPlaylistSnapshot(env,waitUntil);memo.set(env.ACCESS,{at:Date.now(),value});return value;
}
export async function onRequestGet({request,env,waitUntil}){
  if(!await allowed(request,env))return reply({ok:false,error:'unauthorized'},401);
  if(!env.ACCESS)return reply({ok:false,error:'storage_unavailable'},503);
  return reply(stockCatalog(await snapshot(env,waitUntil)));
}
export async function onRequestPost({request,env,waitUntil}){
  if(!await allowed(request,env))return reply({ok:false,error:'unauthorized'},401);
  if(!env.ACCESS)return reply({ok:false,error:'storage_unavailable'},503);
  let body;try{body=await request.json();}catch{return reply({ok:false,error:'invalid_json'},400);}
  const screens=[...new Set(Array.isArray(body.screens)?body.screens:[])],ids=[...new Set(Array.isArray(body.stockIds)?body.stockIds:[])];
  if(!screens.length||screens.length>36||!ids.length||ids.length>100||!screens.every(s=>/^[a-z0-9][a-z0-9-]{1,79}$/.test(s))||!ids.every(s=>/^[A-Za-z0-9_-]{1,160}$/.test(s)))return reply({ok:false,error:'invalid_selection'},400);
  const snap=await snapshot(env,waitUntil,true), known=new Set(snap.screens.map(s=>s.screen));
  if(screens.some(s=>!known.has(s)))return reply({ok:false,error:'unknown_screen'},400);
  const index=await fetch('https://stock.admira.store/stock/index.json').then(r=>r.ok?r.json():null).catch(()=>null);
  if(!Array.isArray(index?.items))return reply({ok:false,error:'stock_unavailable'},503);
  const pieces=ids.map(id=>index.items.find(p=>p.id===id&&!p.oculto));
  if(pieces.some(p=>!p||!['video','image','audio','music','locucion','animation'].includes(p.type)||!/^https:\/\/stock\.admira\.store\//.test(p.url||'')))return reply({ok:false,error:'invalid_stock_item'},400);
  const items=pieces.map(p=>({id:'stock-'+p.id,stockId:p.id,title:p.title||p.id,asset:p.url,assetType:['music','locucion'].includes(p.type)?'audio':p.type,seconds:p.type==='image'?10:600,tags:p.tags||[]}));
  const plans=[];
  for(const screen of screens){
    const draft=snap.playlists.find(p=>p.screen===screen);
    let change;try{change=appendStockItems(draft,items);}catch(e){return reply({ok:false,error:e.message,screen},409);}
    plans.push({screen,draft,...change});
  }
  const results=[];
  for(const plan of plans){
    if(!plan.added){results.push({screen:plan.screen,ok:true,added:0,name:plan.draft.name});continue;}
    try{
    const headers=new Headers(request.headers);headers.set('Content-Type','application/json');
    const r=await savePlaylist({request:new Request('https://admira.tv/api/playlist',{method:'POST',headers,body:JSON.stringify({screen:plan.screen,name:plan.draft.name||body.name||'Por defecto',items:plan.items,rev:plan.draft.rev,guardRevision:true,source:'stock-add'})}),env,waitUntil});
    const d=await r.json();results.push({screen:plan.screen,ok:r.ok&&d.ok,added:r.ok?plan.added:0,name:plan.draft.name,error:d.error||null});
    }catch{results.push({screen:plan.screen,ok:false,added:0,name:plan.draft.name,error:'distribution_failed'});}
  }
  memo.delete(env.ACCESS);
  return reply({ok:results.every(r=>r.ok),results},results.every(r=>r.ok)?200:409);
}
