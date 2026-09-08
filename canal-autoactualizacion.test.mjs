import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const canal = await readFile(new URL('./canal.html', import.meta.url), 'utf8');
const index = await readFile(new URL('./index.html', import.meta.url), 'utf8');

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `falta ${name}`);
  const brace = source.indexOf('{', start);
  let depth = 0, quote = '', escaped = false;
  for (let i = brace; i < source.length; i += 1) {
    const c = source[i];
    if (quote) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === quote) quote = ''; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth += 1;
    else if (c === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`${name} incompleta`);
}

test('en kiosko el canal vigila /version.json y se recarga en el siguiente cambio de pieza', () => {
  assert.match(canal, /function next\(\)\{ if\(directOn\) return; if\(kioskReloadIfDue\(\)\) return; if\(finishForcedTagPlayback\(\)\) return;/);
  const check = functionSource(canal, 'kioskVersionCheck');
  assert.match(check, /if\(!__adtvClean\) return;/);
  assert.match(check, /fetch\('\/version\.json\?vw='\+Date\.now\(\),\{cache:'no-store'\}\)/);
  assert.match(check, /if\(_releaseRef===null\)\{ _releaseRef=id; return; \}/);
  assert.match(check, /if\(id!==_releaseRef&&!_pendingReload\)\{ _pendingReload=Date\.now\(\);/);
  assert.match(canal, /setTimeout\(kioskVersionCheck,15000\); setInterval\(kioskVersionCheck,60000\);/);
});

test('la identidad del release es la misma que usa el avisador: versión + commit + deployedAt + firma', () => {
  const ctx = vm.createContext({});
  vm.runInContext(`${functionSource(canal, 'releaseIdentity')}\nglobalThis.id=releaseIdentity;`, ctx);
  const a = ctx.id({ version: 'v.1', gitFull: 'abc', deployedAt: '2026-09-08T00:00:00Z', signature: 'Neo · MBP16' });
  const b = ctx.id({ version: 'v.1', gitFull: 'abc', deployedAt: '2026-09-08T00:05:00Z', signature: 'Neo · MBP16' });
  assert.notEqual(a, b, 'un redeploy sin subir la r también cuenta');
  assert.equal(ctx.id(null), '');
  assert.equal(ctx.id({}), '');
});

test('nunca recarga a mitad de una orden #ID o de una descarga, salvo tope de 15 min', () => {
  const due = functionSource(canal, 'kioskReloadIfDue');
  assert.match(due, /if\(!_pendingReload\) return false;/);
  assert.match(due, /const busy=!!_forcedTagPlayback\|\|!!_asapItemId\|\|_dl\.size>0;/);
  assert.match(due, /if\(busy&&Date\.now\(\)-_pendingReload<15\*60000\) return false;/);
  assert.match(due, /location\.reload\(\)/);
});

test('el botón «VERSIÓN NUEVA» del avisador compartido no se pinta en una pantalla pública', () => {
  assert.match(canal, /if\(__adtvClean\)\{[\s\S]*?st\.textContent='\.admira-stale\{display:none!important\}'/);
});

test('la portada conserva el literal ADMIRA_VERSION que sondean los players macOS', () => {
  const meta = /<meta name="admiranext-version" content="(v\.[^"]+)">/.exec(index);
  const literal = /window\.ADMIRA_VERSION='(v\.[^']+)';/.exec(index);
  assert.ok(meta && literal, 'faltan el meta o el literal');
  assert.equal(literal[1], meta[1], 'el literal debe ir al sello, como el meta');
  // El player macOS busca la PRIMERA aparición de ADMIRA_VERSION y lee la cadena entrecomillada.
  assert.equal(index.indexOf('ADMIRA_VERSION'), index.indexOf("window.ADMIRA_VERSION='") + 'window.'.length, 'nada antes del literal puede llamarse ADMIRA_VERSION');
});
