import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const mando = await readFile(new URL('./mando.html', import.meta.url), 'utf8');
const canal = await readFile(new URL('./canal.html', import.meta.url), 'utf8');

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `falta ${name}`);
  const brace = source.indexOf('{', start);
  let depth = 0, quote = '', escaped = false;
  for (let i = brace; i < source.length; i += 1) {
    const c = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth += 1;
    else if (c === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`${name} incompleta`);
}

test('el Remote distingue #ID de metatag antes de encolar el comando', () => {
  const context = vm.createContext({});
  vm.runInContext(`${functionSource(mando, 'canonTag')}\n${functionSource(mando, 'taggedCommand')}\nglobalThis.command=taggedCommand;`, context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.command('712'))), { clean:'712', kind:'content', cmd:'content-712' });
  assert.deepEqual(JSON.parse(JSON.stringify(context.command('#712'))), { clean:'712', kind:'content', cmd:'content-712' });
  assert.deepEqual(JSON.parse(JSON.stringify(context.command('oferta 2x1'))), { clean:'oferta-2x1', kind:'tag', cmd:'tag-oferta-2x1' });
});

test('el player persiste el #ID e inyecta la pieza sin sustituir la playlist', () => {
  assert.match(canal, /const TAGGED_CONTENT_KEY='adtv_tagged_content:'/);
  assert.match(canal, /return injected\.concat\(base\.filter/);
  assert.match(canal, /playlist=injectTaggedContent\(playlist\)/);
  assert.match(canal, /taggedContentNums=\[wanted\]\.concat/);
  assert.match(canal, /saveTaggedContent\(\); seenSig=''; rebuild\(false\)/);
});

test('content-712 refresca Stock, prioriza descarga y sólo salta cuando esa pieza está lista', () => {
  const queue = functionSource(canal, 'queueTaggedContent');
  const resume = functionSource(canal, 'maybeResumeCold');
  assert.match(queue, /await loadFeed\(false\)/);
  assert.match(queue, /precachePriority\(it\)/);
  assert.match(queue, /_asapItemId=it\.id/);
  assert.match(resume, /if\(_asapItemId\)/);
  assert.match(resume, /_ready\.has\(target\.id\)/);
  assert.match(resume, /play\(idx,target\)/);
  assert.match(canal, /const tagged=\/\^content-\(\\d\{1,6\}\)\$\//);
  assert.match(canal, /if\(cmd==='content'\)\{ Promise\.resolve\(queueTaggedContent\(rest\)\)/);
});

test('la reproducción forzada conserva el gobierno hasta terminar la cápsula', () => {
  const queue = functionSource(canal, 'queueTaggedContent');
  const next = functionSource(canal, 'next');
  const poll = functionSource(canal, 'pollMode');
  assert.match(queue, /const forcedState=beginForcedTagPlayback\(wanted\)/);
  assert.ok(queue.indexOf('beginForcedTagPlayback(wanted)') < queue.indexOf('disableAdmiraSync()'));
  assert.match(queue, /markForcedTagPlaying\(forcedState,it\); await play\(idx,it\)/);
  assert.match(next, /if\(finishForcedTagPlayback\(\)\) return/);
  assert.match(poll, /_liveMode\|\|_forcedTagPlayback/);
  assert.equal((poll.match(/if\(_forcedTagPlayback\) return/g)||[]).length,2,'debe cerrar las dos carreras de red');
  const finish = functionSource(canal, 'finishForcedTagPlayback');
  assert.match(finish, /state\.phase!=='playing'/);
  assert.match(finish, /play\(\(forcedIndex>=0\?forcedIndex:cur\)\+1\)/);
  assert.match(finish, /Promise\.resolve\(\)\.then\(\(\)=>pollMode\(\)\)/);
});

test('Limpiar tag espera confirmación secuencial antes de borrar el estado local', () => {
  assert.match(mando, /curTag\(\)\.charAt\(0\)===['"]@['"]&&!await sendRemote\('content-clear',b\)/);
  assert.match(mando, /if\(!await sendRemote\('tag-',b\)\) return/);
  assert.match(canal, /function clearTaggedContent\(\)/);
});

test('tag-terminator de la cola legacy usa el dispatcher correcto y refresca Stock primero', () => {
  assert.match(canal, /if\(\/\^tag-\[a-z0-9_,\+\-\]\*\$\/\.test\(cmd\)\) return applyCtrlCmd\(cmd\)/);
  const ctrl = functionSource(canal, 'applyCtrlCmd');
  assert.match(ctrl, /if\(t\[1\]\)\{ await loadFeed\(false\)/);
  assert.match(ctrl, /return n>0\?'executed':'failed'/);
});

test('un hashtag del Remote crea una playlist alternativa pura con todos sus contenidos', () => {
  const rebuild = functionSource(canal, 'rebuild');
  assert.match(canal, /const LIVE_TAG_KEY='adtv_live_tag:'/);
  assert.match(canal, /if\(_liveTag\) seg\.tag=_storedLiveTag/);
  assert.match(rebuild, /if\(_liveTag&&seg\.tag\)/);
  assert.match(rebuild, /medio:'all',audience:'all',category:'all',age:'all',slot:'all',tag:seg\.tag,format:'',ids:\[\]/);
  assert.match(rebuild, /all\.filter\(it=>it&&!it\._grid&&matchesSeg\(it,alternativeSeg\)\)/);
  assert.match(rebuild, /PLAYLIST ALTERNATIVA #/);
  const alternativeBranch = rebuild.slice(rebuild.indexOf('if(_liveTag&&seg.tag)'), rebuild.indexOf('// ── CORTAFUEGOS'));
  assert.doesNotMatch(alternativeBranch, /gridWeave|injectTaggedContent|cfg\.max/);
  assert.match(canal, /save\(LIVE_TAG_KEY,canonicalPlayTag\(t\[1\]\)\)/);
  assert.match(canal, /save\(LIVE_TAG_KEY,''\)/);
});

test('la coincidencia de hashtag es exacta y conserva aliases música/music', () => {
  const matches = functionSource(canal, 'matchesSeg');
  assert.match(matches, /const tg=\(it\.tags\|\|\[\]\)\.map\(canonicalPlayTag\)/);
  assert.match(matches, /needles\.includes\(t\)/);
  assert.doesNotMatch(matches, /t\.includes\(n\)/);
});

test('el Remote confirma por ACK exacto y dirige cada orden a una sola pantalla', () => {
  assert.match(mando, /body = JSON\.stringify\(\{id:target\.screen, screen:target\.screen, cmd:cmd\}\)/);
  assert.match(mando, /ack\.action===receipt\.action&&ack\.cid===receipt\.cid&&ack\.cmd===cmd&&ack\.screen===target\.screen/);
  assert.match(mando, /remote-pending::after/);
  assert.match(mando, /remote-applied/);
});

test('el campo de tags mantiene el feedback hasta que la descarga remota está lista', () => {
  assert.match(mando, /id="tagEntry"/);
  assert.match(mando, /CACHE_API = 'https:\/\/api\.admira\.store\/screen\/cache'/);
  assert.match(mando, /PLAYLIST_APIS = \['\/api\/control\/playlist\/','https:\/\/omnipublicity-api\.csilvasantin\.workers\.dev\/control\/playlist'\]/);
  assert.match(mando, /state\.ready\?'✓ Disponible':\('⇩ '\+state\.pct\+'%'\)/);
  assert.match(mando, /visual\.progress=Math\.max\(\.02,Math\.min\(1,state\.pct\/100\)\)/);
  assert.match(mando, /holdAfterAck:true,returnAction:true,mirror:entry,input:input,label:b/);
  assert.match(mando, /if\(!await waitTaggedAvailability\(sent,action\)\) return/);
});

test('la sombra visual del hashtag pertenece a la pantalla exacta, no a todo el circuito', () => {
  assert.match(mando, /var TAG_KEY='mando_tag_by_screen'/);
  assert.match(mando, /function curTag\(\)\{ return tagStore\(\)\[T\.screen\]\|\|''; \}/);
  assert.match(mando, /setStoredTag\(T\.screen, action\.kind/);
  assert.doesNotMatch(mando, /setStoredTag\(T\.circuit/);
});

test('salir de una playlist alternativa no borra las piezas añadidas antes por #ID', () => {
  assert.match(mando, /if\(curTag\(\)\.charAt\(0\)===['"]@['"]&&!await sendRemote\(['"]content-clear['"],b\)\) return;/);
  assert.match(mando, /if\(!await sendRemote\(['"]tag-['"],b\)\) return;/);
});

test('una pieza ya descargada finaliza directamente en verde', () => {
  assert.match(mando, /ids\.length>0&&ids\.every\(function\(id\)\{ return ready\.has\(id\); \}\)/);
  assert.match(mando, /if\(state\.ready\)\{ visual\.doneLabel='✓ Disponible'; finishRemoteButton\(visual,'executed'\)/);
  assert.match(mando, /\.tag-entry\.remote-applied input\{border-color:#39d98a/);
});

test('el player publica progreso con cadencia visible mientras descarga', () => {
  assert.match(canal, /function cacheReportThrottled\(\)\{ if\(Date\.now\(\)-_lastCacheRep>750\) cacheReport\(\); \}/);
});

test('el antiguo Quitar es ahora un apagado confirmado que se convierte en Arrancar', () => {
  assert.match(mando, /id="power"[^>]*>⏻ Apagar player<\/button>/);
  assert.match(mando, /pwr\.textContent=standby\?'▶ Arrancar':'⏻ Apagar player'/);
  assert.match(mando, /sendRemote\(desired\?'standby':'resume',pwr\)/);
});

test('el player escucha la cola de pantalla y la de circuito con cursores independientes', () => {
  assert.match(canal, /const __cmdIds=Array\.from\(new Set\(\[scr\.circuit,scr\.screen\]/);
  assert.match(canal, /const __cmdState=Object\.fromEntries/);
  assert.match(canal, /for\(const id of __cmdIds\)/);
  assert.match(canal, /c\._queueId=id/);
  assert.match(canal, /id:c\._queueId\|\|scr\.circuit\|\|scr\.screen/);
});

test('la playlist del Remote enseña el inventario real y sólo deja pulsar lo descargado', () => {
  assert.match(mando, /href="#remote" data-mando-view-link="remote"[^>]*>Remote<\/a>/);
  assert.match(mando, /href="#playlist" data-mando-view-link="playlist">Playlist<\/a>/);
  assert.match(mando, /id="playlistView" data-mando-pane="playlist" hidden/);
  assert.match(mando, /id="remoteTools" data-mando-pane="remote"/);
  assert.match(mando, /function setMandoView\(view\)/);
  assert.match(mando, /p\.hidden=p\.dataset\.mandoPane!==view/);
  assert.match(mando, /body\[data-mando-view="playlist"\] \.player-playlist\{max-height:none;overflow:visible\}/);
  assert.doesNotMatch(mando, /href="#playerPlaylist"/);
  assert.doesNotMatch(mando, />Dashboard<\/a>/);
  assert.match(mando, /id="playlistList"/);
  assert.match(mando, /Promise\.all\(\[remotePlaylistData\(target\.screen\),remoteCacheData\(target\.screen\)\]\)/);
  assert.match(mando, /var ready=new Set\(\(cache&&cache\.ready\|\|\[\]\)\.map\(String\)\)/);
  assert.match(mando, /b\.disabled=!isReady/);
  assert.match(mando, /state\.textContent=isReady\?'✓ en disco':pct!=null\?\('⇩ '\+pct\+'%'\):'pendiente'/);
  assert.match(mando, /sendRemote\('goto-'\+index,b\)/);
  assert.match(mando, /loadRemotePlaylist\(it&&it\.id\)/);
});

test('Anterior, Siguiente y audio muestran el contenido contextual como fondo', () => {
  assert.match(mando, /id="previousControl"[^>]*data-cmd="prev"/);
  assert.match(mando, /id="nextControl"[^>]*data-cmd="next"/);
  assert.match(mando, /id="muteTitle"/);
  assert.match(mando, /function paintRemoteContext\(items,current\)/);
  assert.match(mando, /items\[\(index-1\+items\.length\)%items\.length\]/);
  assert.match(mando, /items\[\(index\+1\)%items\.length\]/);
  assert.match(mando, /paintMediaControl\(mb,document\.getElementById\('muteTitle'\),current/);
  assert.match(mando, /setSafePreview\(button,candidates\|\|youtubeFrameCandidates\(it,0\),it,true\)/);
  assert.match(mando, /Playlist alternativa #'\+cur/);
  assert.match(mando, /currentMedia=index>=0\?Object\.assign\(\{\},items\[index\],current\|\|\{\}\):current/);
  assert.match(mando, /filter\(function\(it\)\{ return String\(it&&it\.id\|\|''\)===currentId; \}\)\.length===1/);
  assert.match(mando, /syncLocked=!!\(current&&current\.sinc&&current\.sinc\.on\)/);
  assert.match(mando, /setAttribute\('aria-label',\(actionText\|\|'Control'\)\+': '\+title\)/);
  assert.match(mando, /\.b:focus-visible/);
  assert.match(mando, /@media\(forced-colors:active\)/);
  assert.match(mando, /\.now-controls\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(mando, /\.media-control-title\{[^}]*-webkit-line-clamp:2/);
});

test('las pastillas eliminan la posición y contienen título y estado dentro del botón', () => {
  assert.doesNotMatch(mando, /className='pl-meta'/);
  assert.doesNotMatch(mando, /'posición '\+\(index\+1\)/);
  assert.match(mando, /\.pl-item\{[^}]*max-width:100%[^}]*overflow:hidden/);
  assert.match(mando, /\.pl-title\{display:block;width:100%;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap/);
  assert.match(mando, /\.pl-state\{display:block;max-width:90px;overflow:hidden;text-overflow:ellipsis;text-align:right/);
});

test('goto-N atraviesa la cola confirmada y sólo acusa después de ejecutarlo', () => {
  assert.match(canal, /if\(\/\^goto-\\d\{1,3\}\$\/\.test\(cmd\)\) return applyCtrlCmd\(cmd\)/);
  assert.match(canal, /const m=\/\^goto-\(\\d\{1,3\}\)\$\/\.exec\(cmd\)/);
  assert.match(canal, /await play\(n,playlist\[n\]\)/);
});

test('el modo sincro publica la playlist efectiva antes de reproducir y retornar', () => {
  const rebuild = functionSource(canal, 'rebuild');
  const branch = /if\(syncOn\)\{([\s\S]*?)\n\s*return;/.exec(rebuild);
  assert.ok(branch, 'no se encontró la rama sincro de rebuild');
  assert.match(branch[1], /signagePlaylistPush\(\)/);
  assert.ok(branch[1].indexOf('signagePlaylistPush()') < branch[1].indexOf('play(syncIndex())'));
});
