import {readSession,accessFor,authHeaders} from '../_auth-session.js';
import {onRequestGet as playerPlaylist} from './playlist.js';
import {preparePhysicalPlaylist,activatePhysicalPlaylist,physicalSource} from './_programacion/xpace-physical-bootstrap.js';
import {bindingForScope} from './_programacion/xpace-binding.js';
import {validPlaylistScope} from '../_xpace-playlist-grant.js';
const json=(value,status=200)=>Response.json(value,{status,headers:authHeaders()});
export async function playlistAdminAccess(request,env){
 const url=new URL(request.url);if(request.method!=='POST'||!['https://admira.tv','https://www.admira.tv'].includes(url.origin)||request.headers.get('Origin')!==url.origin||request.headers.get('X-Admira-Playlist-Admin')!=='1')return {ok:false,status:403,error:'invalid_admin_origin'};
 const session=await readSession(request,env);if(!session)return {ok:false,status:401,error:'admin_session_required'};
 if(session.lectura||session.agent||session.sub==='agente'||String(session.email).toLowerCase()==='agentes@silicio.admiranext.com')return {ok:false,status:403,error:'human_admin_required'};
 const access=await accessFor(env,session.email,'digitalsignage-player');
 if(!access.allowed||!['owner','admin'].includes(access.role))return {ok:false,status:403,error:'admin_permission_required'};
 return {ok:true,actor:session.email};
}
export async function onRequest({request,env}){
 const access=await playlistAdminAccess(request,env);if(!access.ok)return json({ok:false,error:access.error},access.status);
 let body;try{body=await request.json();}catch{return json({ok:false,error:'invalid_json'},400);}
 const scope=body?.scope,allowed=new Set(['operation','scope','expectedSourceRevision','expectedSourceIds']);
 if(!body||Array.isArray(body)||Object.keys(body).some(key=>!allowed.has(key))||!['prepare','activate'].includes(body.operation)||!validPlaylistScope(scope)||!physicalSource(scope||{}))return json({ok:false,error:'invalid_admin_operation'},400);
 const db=env.PROGRAMACION_DB;if(!db)return json({ok:false,error:'programacion_unavailable'},503);
 try{
  let prepared;
  if(body.operation==='prepare')prepared=await preparePhysicalPlaylist(db,scope,access.actor);
  else{const binding=await bindingForScope(db,scope);if(!binding)return json({ok:false,error:'prepare_required'},409);prepared={ok:true,binding};}
  if(!prepared.ok)return json(prepared,prepared.status||409);
  const response=await playerPlaylist({env,request:new Request('https://admira.tv/api/playlist?screen='+physicalSource(scope)),legacyOnly:true});if(!response.ok)throw Error('legacy_snapshot_unavailable');const snapshot=await response.json();
  if(body.operation==='prepare')return json({...prepared,sourceSnapshot:snapshot});
  const result=await activatePhysicalPlaylist(db,prepared.binding,snapshot,{expectedSourceRevision:body.expectedSourceRevision,expectedSourceIds:body.expectedSourceIds,actor:access.actor});return json(result,result.status||200);
 }catch(error){console.error('xpace-playlist administrative operation failed',error?.message);return json({ok:false,error:'administrative_operation_failed'},503);}
}
