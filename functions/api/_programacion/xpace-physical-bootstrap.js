import {bindingForScope,bindingForScreen,scopeIdentity,idDefecto} from './xpace-playlist.js';
import * as A from './almacen.js';
export const PHYSICAL_DRAIN_MS=30_000;
export const physicalSource=scope=>scope.projectId==='starbucks'&&scope.venueId==='alsea-sbux-021'&&scope.channelId==='music'?'iphone17-mupi':null;
export async function preparePhysicalPlaylist(db,scope,actor,now=Date.now()){
 const screen=physicalSource(scope);if(!screen)return {ok:false,status:422,error:'physical_binding_not_configured'};
 const previous=await bindingForScope(db,scope);if(previous)return {ok:true,binding:previous,readyAt:previous.created_at+PHYSICAL_DRAIN_MS};
 if(await bindingForScreen(db,screen))return {ok:false,status:409,error:'screen_already_associated'};
 const {bindingId}=await scopeIdentity(scope);
 try{await db.batch([
  db.prepare("INSERT INTO xpace_playlist_binding(id,project_id,venue_id,channel_id,playlist_id,source_screen,channel_kind,auto_mode,state,created_at,created_by) VALUES(?,?,?,?,?,?,'music','screen','preparing',?,?)").bind(bindingId,scope.projectId,scope.venueId,scope.channelId,idDefecto(screen),screen,now,actor),
  db.prepare('INSERT INTO xpace_playlist_screen(screen_id,binding_id,associated_at,associated_by) VALUES(?,?,?,?)').bind(screen,bindingId,now,actor)
  ,db.prepare("INSERT INTO auditoria(en,actor,accion,entidad,entidad_id,version,detalle) SELECT ?,?,'preparar_asociacion','xpace_binding',?,version+1,? FROM meta WHERE id=1").bind(now,actor,bindingId,JSON.stringify({scope,screen,drainMs:PHYSICAL_DRAIN_MS}))
  ,db.prepare('UPDATE meta SET version=version+1,actualizado_en=? WHERE id=1').bind(now)
 ]);}catch(error){const winner=await bindingForScope(db,scope);if(winner)return {ok:true,binding:winner,readyAt:winner.created_at+PHYSICAL_DRAIN_MS};throw error;}
 return {ok:true,binding:await bindingForScope(db,scope),readyAt:now+PHYSICAL_DRAIN_MS};
}
export async function activatePhysicalPlaylist(db,binding,snapshot,{expectedSourceRevision,expectedSourceIds,actor,now=Date.now()}={}){
 if(binding.state==='active')return {ok:true,binding,alreadyActive:true};
 if(now<binding.created_at+PHYSICAL_DRAIN_MS)return {ok:false,status:409,error:'physical_writers_draining',readyAt:binding.created_at+PHYSICAL_DRAIN_MS};
 if(snapshot?.ok!==true||!Array.isArray(snapshot.draft?.items)||!Array.isArray(snapshot.auto)||!Number.isSafeInteger(expectedSourceRevision)||!Array.isArray(expectedSourceIds))return {ok:false,status:400,error:'invalid_source_snapshot'};
 const effective=[...new Set([...snapshot.draft.items,...snapshot.auto].map(item=>String(item.stockId||item.id)))];
 if(expectedSourceRevision!==snapshot.draft.rev||JSON.stringify(expectedSourceIds)!==JSON.stringify(effective))return {ok:false,status:409,error:'physical_source_changed'};
 const previous=await A.leerPlaylist(db,binding.playlist_id);
 const saved=await A.guardarPlaylist(db,{id:binding.playlist_id,nombre:snapshot.draft.name||'Hilo musical',proyecto:binding.project_id,tipo:'fija',items:snapshot.draft.items,origen:'xpace:adopted-physical',opciones:{xpace:{managedEmpty:effective.length===0,excludedStockIds:[]}}},{actor,rev:previous?.rev||0,bindingId:binding.id,motivo:'Adopción de autoridad física verificada',accompanying:({db,mia,yo})=>[
  db.prepare(`UPDATE xpace_playlist_binding SET state='active' WHERE id=? AND state='preparing' AND ${mia}`).bind(binding.id,...yo)
 ]});
 return saved.ok?{ok:true,binding:{...binding,state:'active'},playlist:saved.playlist,effectiveIds:effective}:saved;
}
