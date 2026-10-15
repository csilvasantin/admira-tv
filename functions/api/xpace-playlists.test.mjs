import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {d1Memoria} from './_programacion/_d1-memoria.mjs';import {onRequest,scopeSurfaceAllowed} from './xpace-playlists.js';import {issuePlaylistGrant} from '../_xpace-playlist-grant.js';
const sql=await readFile(new URL('../../migrations/programacion/0001.sql',import.meta.url),'utf8')+await readFile(new URL('../../migrations/programacion/0002_xpace_playlist.sql',import.meta.url),'utf8'),secret='test-only-grant-secret-349-minimum-length';
const scope={projectId:'test-retail',venueId:'qa349-local',channelId:'music'},context={renderer:'lab',xpaceUrl:'https://www.admira.store/admira-xp/?project=test-retail&loc=qa349-local&circuit=test-retail',venueName:'QA local',circuitId:'test-retail'};
const video={id:'stock-one',url:'https://stock.admira.store/stock/stock-one/asset.mp4',type:'video',title:'One'},image={id:'stock-image',url:'https://stock.admira.store/stock/stock-image/asset.jpg',type:'image',title:'Image'},id='b7618c03-fd72-45c0-afc0-96114832f2a1';
async function run(db,body,{operations=['read','add','remove'],chosenScope=scope,chosenContext=context}={}){const {grant}=await issuePlaylistGrant({secret,subject:'editor@example.org',scope:chosenScope,context:chosenContext,operations,sessionVersion:1});return onRequest({env:{PROGRAMACION_DB:db,XPACE_PLAYLIST_GRANT_SECRET:secret},request:new Request('https://admira.tv/api/xpace-playlists',{method:'POST',headers:{Authorization:'Bearer '+grant,'Content-Type':'application/json'},body:JSON.stringify(body)})},{loadStock:async()=>[video,image]});}
const count=async db=>(await db.prepare('SELECT COUNT(*) AS n FROM xpace_playlist_binding').first()).n;
test('malformed, absent Stock, incompatible and forbidden initial commands create no authority',async()=>{
 const db=await d1Memoria(sql);
 for(const body of [{operation:'add',stockId:'stock-one',expectedRevision:0,requestId:'invalid'},{operation:'add',stockId:'missing-one',expectedRevision:0,requestId:id},{operation:'add',stockId:'stock-image',expectedRevision:0,requestId:id},{operation:'prepare-physical'}])assert.ok((await run(db,body)).status>=400);
 assert.equal((await run(db,{operation:'add',stockId:'stock-one',expectedRevision:0,requestId:id},{operations:['read']})).status,403);assert.equal(await count(db),0);
});
test('initial operation, binding and receipt are atomic; replay includes original seed body',async()=>{
 const db=await d1Memoria(sql),body={operation:'add',stockId:'stock-one',expectedRevision:0,requestId:id,seedStockIds:[]};
 const first=await(await run(db,body)).json();assert.equal(first.ok,true);assert.equal(first.revision,1);assert.deepEqual(first.effectiveItems.map(x=>x.stockId),['stock-one']);
 const replay=await(await run(db,body)).json();assert.equal(replay.ok,true);assert.equal(replay.replayed,true);assert.equal(replay.revision,1);
 const changed=await run(db,{...body,seedStockIds:['stock-image']});assert.equal(changed.status,409);assert.equal((await changed.json()).error,'request_id_conflict');
 const last=await(await run(db,{operation:'remove',stockId:'stock-one',expectedRevision:1,requestId:id.replace(/1$/,'2')})).json();assert.equal(last.managedEmpty,true);assert.deepEqual(last.effectiveItems,[]);
 const old=await(await run(db,body)).json();assert.equal(old.revision,1);assert.deepEqual(old.effectiveItems.map(x=>x.stockId),['stock-one']);
 assert.equal(await count(db),1);assert.equal((await db.prepare('SELECT COUNT(*) n FROM xpace_playlist_request').first()).n,2);
});
test('scope inventory excludes reserved channels and validates public office inventory ID',async()=>{
 assert.equal(await scopeSurfaceAllowed({...scope,channelId:'screen-ipad'},context),false);
 const office={...context,renderer:'office',xpaceUrl:'https://www.admira.store/xpacios/gran-de-gracia-51/?project=test-retail&loc=qa349-local&circuit=test-retail'};
 const fetcher=async()=>Response.json({id:scope.venueId,pantallas:[{id:'pantalla-1'}]});
 assert.equal(await scopeSurfaceAllowed({...scope,channelId:'screen-pantalla-1'},office,fetcher),true);assert.equal(await scopeSurfaceAllowed({...scope,channelId:'screen-other-screen'},office,fetcher),false);
});
