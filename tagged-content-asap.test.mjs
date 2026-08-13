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

test('Limpiar tag espera confirmación secuencial antes de borrar el estado local', () => {
  assert.match(mando, /if\(!await sendRemote\('content-clear',b\)\) return/);
  assert.match(mando, /if\(!await sendRemote\('tag-',b\)\) return/);
  assert.match(canal, /function clearTaggedContent\(\)/);
});

test('tag-terminator de la cola legacy usa el dispatcher correcto y refresca Stock primero', () => {
  assert.match(canal, /if\(\/\^tag-\[a-z0-9_,\+\-\]\*\$\/\.test\(cmd\)\) return applyCtrlCmd\(cmd\)/);
  const ctrl = functionSource(canal, 'applyCtrlCmd');
  assert.match(ctrl, /if\(t\[1\]\)\{ await loadFeed\(false\)/);
  assert.match(ctrl, /return n>0\?'executed':'failed'/);
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
  assert.match(mando, /PLAYLIST_APIS = \['\/api\/control\/playlist','https:\/\/omnipublicity-api\.csilvasantin\.workers\.dev\/control\/playlist'\]/);
  assert.match(mando, /state\.ready\?'✓ Disponible':\('⇩ '\+state\.pct\+'%'\)/);
  assert.match(mando, /visual\.progress=Math\.max\(\.02,Math\.min\(1,state\.pct\/100\)\)/);
  assert.match(mando, /holdAfterAck:true,returnAction:true,mirror:entry,input:input,label:b/);
  assert.match(mando, /if\(!await waitTaggedAvailability\(sent,action\)\) return/);
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
