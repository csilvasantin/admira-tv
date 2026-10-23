import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const html = await read('./envivo/index.html');
const js = await read('./envivo/envivo.js');
const sandbox = { window: {}, URL, URLSearchParams };
vm.runInNewContext(js, sandbox);
const api = sandbox.window.AdmiraEnvivo;

test('la página solo lee ahora y la cola publicada', () => {
  assert.match(html, /src="\/envivo\/envivo\.js/);
  assert.match(js, /signage\/now\?screen=/);
  assert.match(js, /\/api\/control\/playlist\?screen=/);
  assert.match(js, /method: "GET"/);
  assert.doesNotMatch(js, /method:\s*["']POST["']|locations\/cmd|\/api\/playlist\?/);
  assert.match(html, /cliente\.xpacio\.hilomusical/);
  assert.match(html, /hilomusical\/next\?store=starbucks/);
  assert.match(html, /data-es="Playlist en vivo"/);
  assert.match(html, /data-en="Live playlist"/);
  assert.match(html, /id="ykLangToggle"/);
});

test('la pieza de ahora y la siguiente salen de los dos GET, sin inventar', () => {
  const ahora = { item: { id: 'a', title: 'Ahora real', dur: 15, startedAt: Date.now() - 4000, thumbnail: 'http://evil.example/x.jpg' } };
  const cola = { items: [
    { id: 'z', title: 'Otra', thumb: 'https://stock.admira.store/stock/z/poster.jpg' },
    { id: 'a', title: 'Ahora en cola', thumb: 'https://stock.admira.store/stock/a/poster.jpg?v=1' },
    { id: 'b', title: 'Siguiente real', thumb: 'https://api.admira.store/stock/asset/b' }
  ] };
  const pista = api.pistaDe(ahora, cola);
  assert.equal(pista.estado, 'en-antena');
  assert.equal(pista.titulo, 'Ahora real');
  assert.equal(pista.siguiente.titulo, 'Siguiente real');
  assert.equal(api.portadaSegura(pista.portada), 'https://stock.admira.store/stock/a/poster.jpg?v=1');
  assert.equal(api.portadaSegura(ahora.item.thumbnail), '');
  assert.equal(api.pistaDe({ item: null }, cola).estado, 'vacio');
  assert.equal(api.pistaDe(ahora, { items: [] }).siguiente, null);
  assert.equal(api.pantallaDe(''), 'xpaceos-web');
  assert.equal(api.pantallaDe('?screen=XpaceOS-Web'), 'xpaceos-web');
  assert.equal(api.pantallaDe('?screen=../emit'), 'xpaceos-web');
});
