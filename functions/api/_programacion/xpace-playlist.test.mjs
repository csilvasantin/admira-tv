import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {d1Memoria} from './_d1-memoria.mjs';
import * as A from './almacen.js';
import {ensureVirtualPlaylist,mutateScopedPlaylist,readBoundPlaylist,scopeIdentity,verifyPlaylistGrant} from './xpace-playlist.js';
import {effectiveXpaceItems,boundDraft} from './xpace-binding.js';
import {preparePhysicalPlaylist,activatePhysicalPlaylist,PHYSICAL_DRAIN_MS} from './xpace-physical-bootstrap.js';
const sql=await readFile(new URL('../../../migrations/programacion/0001.sql',import.meta.url),'utf8')+await readFile(new URL('../../../migrations/programacion/0002_xpace_playlist.sql',import.meta.url),'utf8');
const scope=venueId=>({projectId:'test-retail',venueId,channelId:'music'}),actor='editor@example.com',requestId='b7618c03-fd72-45c0-afc0-96114832f2a1';
const item=id=>({id,stockId:id,title:id,asset:'https://stock.admira.store/stock/'+id+'/asset.mp4',assetType:'video',seconds:10});
test('player channel kind comes from the authoritative binding',()=>{
 const playlist={nombre:'Demo',items:[],rev:1,opciones:{channelKind:'music'}};
 assert.equal(boundDraft({source_screen:'virtual-qa',channel_kind:'signage'},playlist).channelKind,'signage');
 assert.equal(boundDraft({source_screen:'iphone17-mupi',channel_kind:'music'},playlist).channelKind,'music');
});
test('three venues have independent persistent authorities; seed retained by first add',async()=>{
 const db=await d1Memoria(sql),a=await ensureVirtualPlaylist(db,scope('venue-one'),{actor,seedItems:[item('seed-one')]}),b=await ensureVirtualPlaylist(db,scope('venue-two'),{actor,seedItems:[item('seed-one')]}),c=await ensureVirtualPlaylist(db,scope('venue-three'),{actor});
 assert.notEqual(a.playlist_id,b.playlist_id);assert.notEqual(a.source_screen,c.source_screen);
 const result=await mutateScopedPlaylist(db,a,{operation:'add',stockId:'added-one',expectedRevision:1,requestId},{actor,stock:[item('added-one')]});assert.equal(result.ok,true);
 assert.deepEqual((await readBoundPlaylist(db,a)).effectiveItems.map(x=>x.stockId),['seed-one','added-one']);
 assert.deepEqual((await readBoundPlaylist(db,b)).effectiveItems.map(x=>x.stockId),['seed-one']);assert.deepEqual((await readBoundPlaylist(db,c)).effectiveItems,[]);
 assert.equal((await ensureVirtualPlaylist(db,scope('venue-one'),{actor,seedItems:[item('different')]})).id,a.id);
});
test('CAS and request identity leave one mutation; changed body on repeated ID is rejected',async()=>{
 const db=await d1Memoria(sql),binding=await ensureVirtualPlaylist(db,scope('venue-one'),{actor,seedItems:[item('seed-one')]});
 const operation={operation:'add',stockId:'added-one',expectedRevision:1,requestId};
 const second={...operation,requestId:'b7618c03-fd72-45c0-afc0-96114832f2a2'};
 const [a,b]=await Promise.all([mutateScopedPlaylist(db,binding,operation,{actor,stock:[item('added-one')]}),mutateScopedPlaylist(db,binding,second,{actor,stock:[item('added-one')]})]);
 assert.deepEqual([a.ok,b.ok].sort(),[false,true]);assert.equal((await A.leerPlaylist(db,binding.playlist_id)).rev,2);
 const winner=a.ok?operation:second;
 const replay=await mutateScopedPlaylist(db,binding,winner,{actor,stock:[item('added-one')]});assert.equal(replay.replayed,true);assert.equal(replay.playlist.rev,2);
 const changed=await mutateScopedPlaylist(db,binding,{...winner,stockId:'other-one'},{actor,stock:[item('other-one')]});assert.equal(changed.error,'request_id_conflict');
});
test('remove automatic piece persists exclusion; remove last persists managed-empty and add exits empty',async()=>{
 const db=await d1Memoria(sql),binding=await ensureVirtualPlaylist(db,scope('venue-one'),{actor,seedItems:[item('seed-one')]});
 await db.prepare("UPDATE xpace_playlist_binding SET auto_mode='screen' WHERE id=?").bind(binding.id).run();binding.auto_mode='screen';const auto=[item('automatic-one')];
 const remove=await mutateScopedPlaylist(db,binding,{operation:'remove',stockId:'automatic-one',expectedRevision:1,requestId},{actor,auto});assert.equal(remove.ok,true);
 assert.deepEqual(effectiveXpaceItems(remove.playlist,auto).map(x=>x.stockId),['seed-one']);
 const last=await mutateScopedPlaylist(db,binding,{operation:'remove',stockId:'seed-one',expectedRevision:2,requestId:requestId.replace(/1$/,'2')},{actor,auto});assert.equal(last.playlist.opciones.xpace.managedEmpty,true);assert.deepEqual(effectiveXpaceItems(last.playlist,[item('new-auto')]),[]);
 const add=await mutateScopedPlaylist(db,binding,{operation:'add',stockId:'seed-one',expectedRevision:3,requestId:requestId.replace(/1$/,'3')},{actor,stock:[item('seed-one')],auto});assert.equal(add.playlist.opciones.xpace.managedEmpty,false);
});
test('legacy importer/direct API cannot overwrite, delete or assign a bound playlist',async()=>{
 const db=await d1Memoria(sql),binding=await ensureVirtualPlaylist(db,scope('venue-one'),{actor,seedItems:[item('seed-one')]});const current=await A.leerPlaylist(db,binding.playlist_id);
 for(const writer of ['importador:admin','importador:espejo:stock','admin']){
  const result=await A.guardarPlaylist(db,{...current,items:[item('foreign-one')]},{actor:writer,rev:1});assert.equal(result.error,'playlist_scope_required');
 }
 assert.equal((await A.borrarPlaylist(db,current.id,{actor,rev:1})).error,'playlist_scope_required');
 const assignment=await A.guardarAsignacion(db,{id:'foreign-assignment',playlist_id:current.id,destino:{all:['pantalla:other-player']},capa:'por_defecto',mezcla:'sustituye'},{actor});assert.equal(assignment.error,'playlist_scope_required');
 assert.deepEqual((await A.leerPlaylist(db,current.id)).items.map(x=>x.stockId),['seed-one']);
});
test('source identity is deterministic and does not accept absent/global/screen scope',async()=>{
 assert.deepEqual(await scopeIdentity(scope('venue-one')),await scopeIdentity(scope('venue-one')));await assert.rejects(()=>scopeIdentity({projectId:'test-retail',venueId:'',channelId:'music'}));
 assert.equal(await verifyPlaylistGrant('untrusted','secret'),null);
});
test('an importer already past JS precheck is fenced inside its SQL batch after preparing',async()=>{
 const db=await d1Memoria(sql),id='defecto-iphone17-mupi';await A.guardarPlaylist(db,{id,nombre:'Physical',tipo:'fija',items:[item('old-one')]},{actor});
 let reached,release;const arrived=new Promise(r=>reached=r),wait=new Promise(r=>release=r),gated={...db,batch:async statements=>{reached();await wait;return db.batch(statements);}};
 const writer=A.guardarPlaylist(gated,{id,nombre:'Overwrite',tipo:'fija',items:[item('foreign-one')]},{actor:'importador:late',rev:1});await arrived;
 await preparePhysicalPlaylist(db,{projectId:'starbucks',venueId:'alsea-sbux-021',channelId:'music'},actor,100000);release();const result=await writer;assert.equal(result.error,'playlist_scope_required');assert.deepEqual((await A.leerPlaylist(db,id)).items.map(x=>x.stockId),['old-one']);
});
test('physical adoption requires drain and exact revision+order; adoption and activation share CAS',async()=>{
 const db=await d1Memoria(sql),scope={projectId:'starbucks',venueId:'alsea-sbux-021',channelId:'music'},prepared=await preparePhysicalPlaylist(db,scope,actor,100000),snapshot={ok:true,draft:{items:[item('manual-one')],rev:900,name:'Physical'},auto:[item('auto-one')]};
 const options={expectedSourceRevision:900,expectedSourceIds:['manual-one','auto-one'],actor};
 assert.equal((await activatePhysicalPlaylist(db,prepared.binding,snapshot,{...options,now:100001})).error,'physical_writers_draining');
 assert.equal((await activatePhysicalPlaylist(db,prepared.binding,snapshot,{...options,expectedSourceIds:['other-one'],now:100000+PHYSICAL_DRAIN_MS})).error,'physical_source_changed');
 const result=await activatePhysicalPlaylist(db,prepared.binding,snapshot,{...options,now:100000+PHYSICAL_DRAIN_MS});assert.equal(result.binding.state,'active');assert.deepEqual(result.effectiveIds,['manual-one','auto-one']);assert.equal((await A.leerPlaylist(db,prepared.binding.playlist_id)).items.length,1);
});
