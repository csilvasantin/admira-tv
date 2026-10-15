// A missing migration means no binding exists yet. Any other database failure
// propagates: a bound screen must never silently fall back to its old KV writer.
async function query(db,sql,...args){
 if(!db?.prepare)return null;
 try{return await db.prepare(sql).bind(...args).first();}
 catch(error){if(/no such table: xpace_playlist_/.test(String(error?.message)))return null;throw error;}
}
export const bindingForScreen=(db,screen)=>query(db,'SELECT b.* FROM xpace_playlist_binding b JOIN xpace_playlist_screen s ON s.binding_id=b.id WHERE s.screen_id=?',screen);
// Explicit physical opt-in and server-generated virtual identities only. Legacy
// fleet reads retain their previous independence from the optional D1 engine.
export const scopedScreenCandidate=screen=>screen==='iphone17-mupi'||/^virtual-xp-[a-f0-9]{24}$/.test(screen);
export const bindingForPlaylist=(db,id)=>query(db,'SELECT * FROM xpace_playlist_binding WHERE playlist_id=?',id);
export const bindingForScope=(db,scope)=>query(db,'SELECT * FROM xpace_playlist_binding WHERE project_id=? AND venue_id=? AND channel_id=?',scope.projectId,scope.venueId,scope.channelId);
export async function protectedEntity(db,entity,id){
 if(entity==='playlist')return bindingForPlaylist(db,id);
 if(entity==='asignacion')return query(db,'SELECT b.* FROM xpace_playlist_binding b JOIN asignacion a ON a.playlist_id=b.playlist_id WHERE a.id=?',id);
 return null;
}
export async function authorityFence(db,entity,id,{bindingId='',targetPlaylist}={}){
 if(!['playlist','asignacion'].includes(entity)||!await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='xpace_playlist_binding'").first())return {sql:'1',args:[]};
 if(entity==='playlist')return {sql:'NOT EXISTS (SELECT 1 FROM xpace_playlist_binding WHERE playlist_id=? AND id!=?)',args:[id,bindingId]};
 const current='NOT EXISTS (SELECT 1 FROM xpace_playlist_binding b JOIN asignacion a ON a.playlist_id=b.playlist_id WHERE a.id=? AND b.id!=?)';
 return targetPlaylist?{sql:current+' AND NOT EXISTS (SELECT 1 FROM xpace_playlist_binding WHERE playlist_id=? AND id!=?)',args:[id,bindingId,targetPlaylist,bindingId]}:{sql:current,args:[id,bindingId]};
}
export function effectiveXpaceItems(playlist,auto=[]){
 const options=playlist.opciones?.xpace||{};
 if(options.managedEmpty)return [];
 const excluded=new Set(options.excludedStockIds||[]),seen=new Set();
 return [...playlist.items,...auto].filter(item=>{const id=String(item.stockId||item.id||'');if(!id||excluded.has(id)||seen.has(id))return false;seen.add(id);return true;});
}
export function boundDraft(binding,playlist){
 const options=playlist.opciones?.xpace||{};
 return {screen:binding.source_screen,playlist:'default',name:playlist.nombre,items:effectiveXpaceItems(playlist),rev:playlist.rev,updatedAt:playlist.actualizado_en,updatedBy:playlist.actualizado_por,synthetic:false,managed:true,managedEmpty:!!options.managedEmpty,bindingId:binding.id,excludedStockIds:options.excludedStockIds||[]};
}
