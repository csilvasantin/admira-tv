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

test('Quitar limpia tanto contenidos añadidos como el filtro histórico', () => {
  assert.match(mando, /Promise\.all\(\[sendRemote\('content-clear'\),sendRemote\('tag-'\)\]\)/);
  assert.match(canal, /function clearTaggedContent\(\)/);
});
