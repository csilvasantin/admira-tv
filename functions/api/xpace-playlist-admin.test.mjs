import test from 'node:test';import assert from 'node:assert/strict';import {playlistAdminAccess} from './xpace-playlist-admin.js';
function environment(role,email='person@example.org',sub='google-human'){return {ACCESS:{async get(key){if(key==='admira-tv:auth:session:test')return JSON.stringify({email,sub,expiresAt:Date.now()+60000});if(key==='admira-tv:users:v3')return JSON.stringify({v:3,projects:[{id:'admira-tv'},{id:'digitalsignage-player',parent:'admira-tv'}],users:[{email,status:'active',roles:{'digitalsignage-player':role}}]});return null;}}};}
const request=(headers={})=>new Request('https://admira.tv/api/xpace-playlist-admin',{method:'POST',headers:{Cookie:'__Host-atv_session=test',Origin:'https://admira.tv','X-Admira-Playlist-Admin':'1',...headers}});
test('administrative human owner/admin only, with exact Origin and CSRF header',async()=>{
 for(const role of ['owner','admin'])assert.equal((await playlistAdminAccess(request(),environment(role))).ok,true);
 for(const role of ['viewer','editor','operator'])assert.equal((await playlistAdminAccess(request(),environment(role))).error,'admin_permission_required');
 assert.equal((await playlistAdminAccess(request({Cookie:'',Authorization:'Bearer normal-playlist-grant'}),environment('admin'))).status,401);
 assert.equal((await playlistAdminAccess(request({Origin:'https://evil.example'}),environment('admin'))).status,403);
 assert.equal((await playlistAdminAccess(request({'X-Admira-Playlist-Admin':''}),environment('admin'))).status,403);
 assert.equal((await playlistAdminAccess(request(),environment('admin','agentes@silicio.admiranext.com','agente'))).error,'human_admin_required');
});
