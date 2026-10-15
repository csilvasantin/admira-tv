import * as A from './almacen.js';
import {idDefecto} from './legado.js';
import {limpiarPieza} from './modelo.js';
import {bindingForScope,bindingForScreen,boundDraft,effectiveXpaceItems} from './xpace-binding.js';
const encoder=new TextEncoder();
import {verifyPlaylistGrant as verifySharedGrant,validPlaylistScope} from '../../_xpace-playlist-grant.js';
export const validScope=validPlaylistScope;
export async function verifyPlaylistGrant(token,secret,options={}){
 try{
  // This candidate is not trusted until the shared signature/context/TTL verifier
  // succeeds; no resolver or database operation runs before that verification.
  const part=token.split('.')[1],raw=atob(part.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-part.length%4)%4));
  const candidate=JSON.parse(raw).scope;
  return verifySharedGrant(token,secret,{...options,scope:options.scope||candidate});
 }catch{return null;}
}
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))),x=>x.toString(16).padStart(2,'0')).join('');
export async function scopeIdentity(scope){if(!validScope(scope))throw Error('invalid_scope');const digest=(await hash(JSON.stringify([scope.projectId,scope.venueId,scope.channelId]))).slice(0,24);return {bindingId:'xp-'+digest,screen:'virtual-xp-'+digest,playlistId:'defecto-virtual-xp-'+digest};}
export function channelAllows(channelId,item){return channelId==='music'?['audio','video'].includes(item.assetType):['image','video'].includes(item.assetType);}
export function stockItem(stock,id){
 const raw=stock.find(x=>String(x.id||x.stockId)===id);if(!raw||raw.oculto)return null;
 const item=limpiarPieza({...raw,id,stockId:id,asset:raw.asset||raw.url||raw.assetUrl||raw.videoUrl||raw.imageUrl,assetType:raw.assetType||raw.kind||raw.type,seconds:raw.seconds||raw.duration});
 return item;
}
export async function readBoundPlaylist(db,binding,auto=[]){
 if(binding.state!=='active')return {ok:false,status:409,error:'playlist_initializing'};
 const playlist=await A.leerPlaylist(db,binding.playlist_id);if(!playlist)throw Error('bound_playlist_missing');
 const allowedAuto=binding.auto_mode==='screen'?auto:[];
 return {ok:true,binding,playlist,draft:boundDraft(binding,playlist),effectiveItems:effectiveXpaceItems(playlist,allowedAuto)};
}
export async function ensureVirtualPlaylist(db,scope,{actor,seedItems=[],name=scope.channelId,receipt=null,initialOptions=null}={}){
 let existing=await bindingForScope(db,scope);if(existing)return existing;
 const ids=await scopeIdentity(scope),kind=scope.channelId==='music'?'music':'signage';
 if(seedItems.some(item=>!channelAllows(scope.channelId,item)))throw Error('incompatible_seed');
 const result=await A.guardarPlaylist(db,{id:ids.playlistId,nombre:String(name).slice(0,80),proyecto:scope.projectId,tipo:'fija',items:seedItems,origen:'xpace:bootstrap',opciones:{xpace:initialOptions||{managedEmpty:seedItems.length===0,excludedStockIds:[]}}},{actor,receipt,motivo:'Bootstrap de selección local',accompanying:({db,mia,yo})=>[
  db.prepare(`INSERT INTO xpace_playlist_binding(id,project_id,venue_id,channel_id,playlist_id,source_screen,channel_kind,auto_mode,state,created_at,created_by) SELECT ?,?,?,?,?,?,?,'none','active',?,? WHERE ${mia}`).bind(ids.bindingId,scope.projectId,scope.venueId,scope.channelId,ids.playlistId,ids.screen,kind,Date.now(),actor,...yo),
  db.prepare(`INSERT INTO xpace_playlist_screen(screen_id,binding_id,associated_at,associated_by) SELECT ?,?,?,? WHERE ${mia}`).bind(ids.screen,ids.bindingId,Date.now(),actor,...yo)
 ]});
 if(!result.ok){existing=await bindingForScope(db,scope);if(existing)return existing;throw Error(result.error);}
 return {...await bindingForScope(db,scope),created:true};
}
export async function readReceipt(db,bindingId,actor,requestId,bodyHash){
 const row=await db.prepare('SELECT body_hash,result FROM xpace_playlist_request WHERE binding_id=? AND actor=? AND request_id=?').bind(bindingId,actor,requestId).first();
 if(!row)return null;
 return row.body_hash===bodyHash?{ok:true,...JSON.parse(row.result),replayed:true}:{ok:false,status:409,error:'request_id_conflict'};
}
export async function operationIdentity(body){
 if(!['add','remove'].includes(body.operation)||typeof body.stockId!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,159}$/.test(body.stockId)||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0||typeof body.requestId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.requestId)||body.seedStockIds!==undefined&&(!Array.isArray(body.seedStockIds)||body.seedStockIds.length>200||body.seedStockIds.some(id=>typeof id!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,159}$/.test(id))))return null;
 const seed=[...new Set(body.seedStockIds||[])];return {bodyHash:await hash(JSON.stringify([body.operation,body.stockId,body.expectedRevision,seed])),seedStockIds:seed};
}
export async function mutateScopedPlaylist(db,binding,body,{actor,stock=[],auto=[]}={}){
 const {operation,stockId,expectedRevision,requestId}=body,identity=await operationIdentity(body);if(!identity)return {ok:false,status:400,error:'invalid_operation'};
 const {bodyHash}=identity;
 const previous=await readReceipt(db,binding.id,actor,requestId,bodyHash);if(previous)return previous;
 const current=await readBoundPlaylist(db,binding,auto);if(!current.ok)return current;
 const {playlist,effectiveItems}=current;if(playlist.rev!==expectedRevision)return {ok:false,status:409,error:'revision_conflict',actual:playlist};
 const exclusions=new Set(playlist.opciones?.xpace?.excludedStockIds||[]);let items=playlist.items.filter(item=>String(item.stockId||item.id)!==stockId);
 if(operation==='add'){
  const item=stockItem(stock,stockId);if(!item)return {ok:false,status:404,error:'stock_item_not_found'};
  if(!channelAllows(binding.channel_id,item))return {ok:false,status:422,error:'incompatible_media'};
  exclusions.delete(stockId);if(playlist.items.some(x=>String(x.stockId||x.id)===stockId))items=playlist.items;else items.push(item);
 }else{
  if(!effectiveItems.some(item=>String(item.stockId||item.id)===stockId))return {ok:false,status:404,error:'playlist_item_not_found'};
  exclusions.add(stockId);
 }
 const next={...playlist,items,opciones:{...playlist.opciones,xpace:{excludedStockIds:[...exclusions],managedEmpty:false}}};
 next.opciones.xpace.managedEmpty=operation==='remove'&&effectiveXpaceItems(next,binding.auto_mode==='screen'?auto:[]).length===0;
 let saved;
 try{saved=await A.guardarPlaylist(db,next,{actor,rev:expectedRevision,bindingId:binding.id,motivo:'Xpace '+operation+' '+stockId,receipt:{bindingId:binding.id,requestId,bodyHash,effectiveItems:effectiveXpaceItems(next,binding.auto_mode==='screen'?auto:[])}});}
 catch(error){const replay=await readReceipt(db,binding.id,actor,requestId,bodyHash);if(replay)return replay;throw error;}
 if(!saved.ok){const replay=await readReceipt(db,binding.id,actor,requestId,bodyHash);if(replay)return replay;}return saved;
}
// Legacy callers still address their own screen, but can no longer bypass the
// authoritative revision, venue ownership or exclusions by writing its old KV.
export async function replaceBoundDraft(db,binding,body,actor){
 const current=await readBoundPlaylist(db,binding);if(!current.ok)return current;
 const expected=Number(body.rev);if(!Number.isSafeInteger(expected)||expected!==current.playlist.rev)return {ok:false,status:409,error:'revision_conflict',draft:current.draft};
 if(!Array.isArray(body.items)||body.items.length>200||body.items.some(x=>!channelAllows(binding.channel_id,x)))return {ok:false,status:422,error:'incompatible_media'};
 const removed=current.playlist.items.filter(old=>!body.items.some(x=>String(x.stockId||x.id)===String(old.stockId||old.id))).map(x=>String(x.stockId||x.id));
 const exclusions=new Set([...(current.playlist.opciones?.xpace?.excludedStockIds||[]),...removed]);for(const item of body.items)exclusions.delete(String(item.stockId||item.id));
 const saved=await A.guardarPlaylist(db,{...current.playlist,nombre:body.name||current.playlist.nombre,items:body.items,opciones:{...current.playlist.opciones,xpace:{managedEmpty:body.items.length===0,excludedStockIds:[...exclusions]}}},{actor,rev:expected,bindingId:binding.id,motivo:'Editor de la pantalla asociada'});
 return saved.ok?{ok:true,draft:boundDraft(binding,saved.playlist),rev:saved.playlist.rev,updatedAt:saved.playlist.actualizado_en}:saved;
}
export {bindingForScope,bindingForScreen,idDefecto};
