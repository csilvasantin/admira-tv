// «alsea» es Starbucks (Carlos, 15-oct-2026: Alsea opera Starbucks; por si alguien se equivoca). En admira.tv
// lo traduce admira-contexto.js antes de cargar el módulo común (shared/, copia de admira-design).
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const codigo = readFileSync(new URL('./admira-contexto.js', import.meta.url), 'utf8');
const bloque = codigo.slice(codigo.indexOf('  var ALIAS_MARCA'), codigo.indexOf('  } catch (_) {}', codigo.indexOf('  var ALIAS_MARCA')) + '  } catch (_) {}'.length);

function correr(href, guardada) {
  const m = new Map(guardada ? [['mb:marca', guardada]] : []);
  const ctx = {
    URL, location: new URL(href), history: {state: null, replaceState(_s, _t, u) { ctx.nueva = u; }},
    sessionStorage: {getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v)},
  };
  vm.runInNewContext(bloque, ctx);
  return {url: ctx.nueva || null, marca: m.get('mb:marca') || null, canonica: ctx.canonica};
}

test('?marca=alsea y ?proyecto=alsea pasan a starbucks antes de cargar el módulo común', () => {
  assert.equal(correr('https://admira.tv/?marca=alsea').url, '/?marca=starbucks');
  assert.equal(correr('https://admira.tv/parrilla/?proyecto=ALSEA&x=1#a').url, '/parrilla/?proyecto=starbucks&x=1#a');
  assert.equal(correr('https://admira.tv/?marca=starbucks').url, null, 'lo demás no se toca');
  assert.equal(correr('https://admira.tv/?marca=altadis').url, null);
});

test('la marca recordada «alsea» pasa a starbucks y /marca alsea también', () => {
  assert.equal(correr('https://admira.tv/', 'alsea').marca, 'starbucks');
  assert.equal(correr('https://admira.tv/', 'altadis').marca, 'altadis');
  assert.match(codigo, /var arg = \(m\[2\] \|\| ''\)\.trim\(\);\n    if \(canonica\(arg\)\) arg = canonica\(arg\);/);
});
