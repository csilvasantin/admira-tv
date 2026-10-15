import {onRequestGet as playerPlaylist,loadStock} from './playlist.js';
import {bindingForScope,scopeIdentity,verifyPlaylistGrant,readBoundPlaylist,ensureVirtualPlaylist,mutateScopedPlaylist,stockItem,channelAllows,operationIdentity,readReceipt} from './_programacion/xpace-playlist.js';
import {legacySeed} from './_programacion/xpace-seeds.js';
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const allowedKeys=new Set(['operation','stockId','expectedRevision','requestId','seedStockIds']);
export async function registerVirtualProjection(binding,env,name){
 if(!binding.source_screen.startsWith('virtual-xp-'))return {status:'not-required'};
 let timer,expired=false;
 try{
  if(!env.VIRTUAL_PLAYERS)return {status:'pending'};
  const registry=env.VIRTUAL_PLAYERS.getByName(binding.source_screen);
  const projection=(async()=>{
   // This is the local programming projection, not the commercial circuit.
   const existing=await registry.readPlayer();
   if(expired)return {status:'pending'};
   if(!existing)await registry.register({screen:binding.source_screen,name,circuit:binding.source_screen,mode:'conditional'});
   return {status:'ready'};
  })();
  // This auxiliary service must not turn a committed D1 save into a BFF timeout.
  return await Promise.race([projection,new Promise(resolve=>{timer=setTimeout(()=>{expired=true;resolve({status:'pending'});},1500);})]);
 }catch{return {status:'pending'};}finally{clearTimeout(timer);}
}
export async function automaticItems(binding,env){
 if(binding.auto_mode!=='screen')return [];
 const response=await playerPlaylist({env,request:new Request('https://admira.tv/api/playlist?screen='+encodeURIComponent(binding.source_screen))});
 if(!response.ok)throw Error('playlist_source_unavailable');return (await response.json()).auto||[];
}
export async function scopeSurfaceAllowed(scope,context,fetcher=fetch){
 if(scope.channelId==='music')return ['starbucks','xtanco','office','lab','cafeteria','sneakers-store'].includes(context?.renderer);
 const surface=scope.channelId.slice(7),renderer=context?.renderer;
 if(/(?:ipad|eink|e-ink)/.test(surface))return false;
 const path=new URL(context.xpaceUrl).pathname;
 if(path==='/admira-xp/'&&['xtanco','office','lab','cafeteria','sneakers-store'].includes(renderer)&&['ds1','ds2','escaparate','metahuman'].includes(surface))return true;
 if(path==='/admira-xp/'&&renderer==='starbucks'&&/^starbucks-wall-0[1-6]$/.test(surface))return true;
 if(['office','lab'].includes(renderer)&&path.startsWith('/xpacios/')){
  const result=await Promise.allSettled(['https://www.admira.biz','https://www.admira.store'].map(origin=>fetcher(origin+'/data/xpacios/'+encodeURIComponent(scope.venueId)+'.json',{signal:AbortSignal.timeout(2000),cache:'no-store'}).then(async response=>{if(!response.ok)throw Error('inventory');return response.json();})));
  return result.some(value=>value.status==='fulfilled'&&value.value?.id===scope.venueId&&Array.isArray(value.value.pantallas)&&value.value.pantallas.some(screen=>screen.id===surface));
 }
 return false;
}
export async function onRequest({request,env},deps={}){
 if(request.method!=='POST')return json({ok:false,error:'method_not_allowed'},405);
 const grant=await verifyPlaylistGrant((request.headers.get('Authorization')||'').replace(/^Bearer /,''),env.XPACE_PLAYLIST_GRANT_SECRET);
 if(!grant)return json({ok:false,error:'invalid_grant'},403);
 const db=env.PROGRAMACION_DB;if(!db)return json({ok:false,error:'programacion_unavailable'},503);
 let body;try{body=await request.json();}catch{return json({ok:false,error:'invalid_json'},400);}
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!allowedKeys.has(key))||!['resolve','add','remove'].includes(body.operation))return json({ok:false,error:'invalid_operation'},400);
 if(body.operation!=='resolve'&&!grant.operations.includes(body.operation))return json({ok:false,error:'forbidden'},403);
 const command=body.operation==='resolve'?null:await operationIdentity(body);if(body.operation!=='resolve'&&!command)return json({ok:false,error:'invalid_operation'},400);
 const scope=grant.scope,context=grant.context;
 if(!await scopeSurfaceAllowed(scope,context,deps.fetcher||fetch))return json({ok:false,error:'surface_not_registered'},422);
 try{
  let binding=await bindingForScope(db,scope),seed=[],saved=null;
  const stock=await (deps.loadStock||loadStock)();
  const added=body.operation==='add'?stockItem(stock,body.stockId):null;
  if(!binding&&body.operation==='add'&&!added)return json({ok:false,error:'stock_item_not_found'},404);
  if(!binding&&added&&!channelAllows(scope.channelId,added))return json({ok:false,error:'incompatible_media'},422);
  if(!binding){
   if(body.operation!=='resolve'&&!grant.operations.includes('add'))return json({ok:false,error:'initialization_requires_add'},403);
   // The real demo is activated separately after its current six+one snapshot
   // has been verified. It must never accidentally become a new virtual list.
   if(scope.projectId==='starbucks'&&scope.venueId==='alsea-sbux-021'&&scope.channelId==='music')return json({ok:false,error:'physical_binding_pending'},409);
   if(body.seedStockIds!==undefined&&(!Array.isArray(body.seedStockIds)||body.seedStockIds.length>200||body.seedStockIds.some(id=>typeof id!=='string')))return json({ok:false,error:'invalid_seed'},400);
   let legacyState=null;if(context.renderer==='starbucks'&&scope.channelId!=='music'){
    const response=await (deps.fetcher||fetch)('https://mcp.admira.store/matrix/starbucks',{signal:AbortSignal.timeout(2000),cache:'no-store'});if(!response.ok)throw Error('legacy_authority_unavailable');legacyState=await response.json();if(!legacyState?.playlists)throw Error('legacy_authority_unavailable');
   }
   seed=legacySeed(scope,context,stockItem,stock,legacyState);
   const seen=new Set(seed.map(item=>item.stockId));for(const id of body.seedStockIds||[]){if(seen.has(id))continue;seen.add(id);const item=stockItem(stock,id);if(!item||!channelAllows(scope.channelId,item))return json({ok:false,error:'invalid_seed_item'},422);seed.push(item);}
   if(body.operation!=='resolve'&&grant.operations.includes('add')){
    if(body.expectedRevision!==0)return json({ok:false,error:'revision_conflict'},409);
    const had=seed.some(item=>String(item.stockId||item.id)===body.stockId);
    if(body.operation==='remove'&&!had)return json({ok:false,error:'playlist_item_not_found'},404);
    const finalItems=body.operation==='remove'?seed.filter(item=>String(item.stockId||item.id)!==body.stockId):had?seed:[...seed,added];
    if(finalItems.length>200)return json({ok:false,error:'playlist_limit'},422);
    const identity=await scopeIdentity(scope);
    binding=await ensureVirtualPlaylist(db,scope,{actor:grant.sub,seedItems:finalItems,name:(context?.venueName||scope.venueId)+' · '+scope.channelId,initialOptions:{managedEmpty:finalItems.length===0,excludedStockIds:body.operation==='remove'?[body.stockId]:[]},receipt:{bindingId:identity.bindingId,requestId:body.requestId,bodyHash:command.bodyHash,effectiveItems:finalItems}});
    saved=await readReceipt(db,binding.id,grant.sub,body.requestId,command.bodyHash);if(!saved)return json({ok:false,error:'revision_conflict'},409);if(!saved.ok)return json(saved,saved.status||409);saved.replayed=!binding.created;
   }else{
    const ids=await scopeIdentity(scope);return json({ok:true,scope,binding:{id:ids.bindingId,source_screen:ids.screen,channel_kind:scope.channelId==='music'?'music':'signage',virtual:true},revision:0,effectiveItems:seed,empty:seed.length===0,capabilities:{read:true,add:grant.operations.includes('add'),remove:grant.operations.includes('remove')},initialized:false,bootstrap:'known-server-selection'});
   }
  }
  const auto=await automaticItems(binding,env);
  if(body.operation!=='resolve'&&!saved){
   saved=await mutateScopedPlaylist(db,binding,body,{actor:grant.sub,stock,auto});if(!saved.ok)return json(saved,saved.status||409);
  }
  let read=await readBoundPlaylist(db,binding,auto);if(!read.ok)return json(read,read.status||409);
  const registry=await registerVirtualProjection(binding,env,context?.venueName||scope.venueId);
  if(saved?.replayed&&saved.playlist&&saved.effectiveItems)read={...read,playlist:saved.playlist,effectiveItems:saved.effectiveItems};
  return json({ok:true,scope,binding:{id:binding.id,source_screen:binding.source_screen,channel_kind:binding.channel_kind,virtual:binding.source_screen.startsWith('virtual-')},registry,revision:read.playlist.rev,effectiveItems:read.effectiveItems,empty:read.effectiveItems.length===0,managedEmpty:!!read.playlist.opciones?.xpace?.managedEmpty,capabilities:{read:true,add:grant.operations.includes('add'),remove:grant.operations.includes('remove')},initialized:true,persistence:'admira.tv:PROGRAMACION_DB',...(saved?{saved:true,replayed:!!saved.replayed}:{}),physicalReceipt:null});
 }catch(error){console.error('xpace-playlist operation failed',error?.message?.replace(/https?:\/\/\S+/g,'[url]'));return json({ok:false,error:'playlist_temporarily_unavailable'},503);}
}
