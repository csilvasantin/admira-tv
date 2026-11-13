import assert from 'node:assert/strict';
import test from 'node:test';
import { cycleMs, familyKey, linked, orientationOf, pairPlaylist, slotAt, trackOf } from './assets/galleon-schedule.mjs';

const H = { id: '1794501557972-tiftm4', stockId: '1794501557972-tiftm4', title: 'Así Sonaba 1985… Cuando los 80s No Tenían Competencia · Adaptación · 16:9 · Admira', seconds: 183, asset: 'https://api.admira.store/stock/asset/1794501557972-tiftm4?v=51154428', assetType: 'video', tags: ['horizontal', 'good'] };
const V = { id: '1794427190641-t7e6p3', stockId: '1794427190641-t7e6p3', title: 'Así Sonaba 1985… Cuando los 80s No Tenían Competencia · 16:9 · subtítulos ES · 9:16', seconds: 179, asset: 'https://api.admira.store/stock/asset/1794427190641-t7e6p3?v=76206571', assetType: 'video', tags: ['vertical', 'formato-alterno'] };
const ZOO_H = { id: 'zoo-h', title: 'Me at the zoo · Locución ES · 16:9 · Admira', seconds: 23, asset: 'https://api.admira.store/stock/asset/zoo-h', assetType: 'video', tags: ['horizontal', 'par-zoo-v'] };
const ZOO_V = { id: 'zoo-v', title: 'Me at the zoo · Locución ES · 9:16 · Admira', seconds: 23, asset: 'https://api.admira.store/stock/asset/zoo-v', assetType: 'video', tags: ['vertical'] };

test('la orientación sale de las etiquetas, del campo o de las medidas', () => {
  assert.equal(orientationOf(H), 'landscape');
  assert.equal(orientationOf(V), 'portrait');
  assert.equal(orientationOf({ orientacion: 'Vertical' }), 'portrait');
  assert.equal(orientationOf({ ancho: 1920, alto: 1080 }), 'landscape');
  assert.equal(orientationOf({ width: 1080, height: 1080 }), '');
  assert.equal(orientationOf(null), '');
});

test('la familia es el título sin los sufijos de formato', () => {
  assert.equal(familyKey(H), 'así sonaba 1985… cuando los 80s no tenían competencia');
  assert.equal(familyKey(V), familyKey(H));
  assert.equal(familyKey(ZOO_V), familyKey(ZOO_H));
  assert.equal(familyKey({ title: 'Café de la mañana' }), 'café de la mañana');
});

test('dos piezas están enlazadas por par-<id> o externalRef en cualquier sentido', () => {
  assert.equal(linked(ZOO_H, ZOO_V), true);
  assert.equal(linked(ZOO_V, ZOO_H), true);
  assert.equal(linked({ id: 'a', externalRef: 'b' }, { id: 'b' }), true);
  assert.equal(linked(H, ZOO_V), false);
});

test('la playlist se empareja H·V por enlace, por familia o por vecindad; sin pareja la pieza ocupa las dos superficies', () => {
  const solo = { id: 'solo', title: 'Pieza sola', seconds: 10, asset: 'https://stock.admira.store/stock/solo/asset.mp4', assetType: 'video', tags: ['vertical'] };
  const vecinoH = { id: 'vh', title: 'Vecino horizontal', seconds: 8, asset: 'https://stock.admira.store/stock/vh/asset.mp4', assetType: 'video', tags: ['horizontal'] };
  const vecinoV = { id: 'vv', title: 'Otro título', seconds: 12, asset: 'https://stock.admira.store/stock/vv/asset.mp4', assetType: 'video', tags: ['vertical'] };
  const slots = pairPlaylist([V, ZOO_V, H, solo, ZOO_H, vecinoH, vecinoV]);
  assert.deepEqual(slots.map(slot => [slot.landscape.id, slot.portrait.id, slot.paired, slot.seconds]), [
    [H.id, V.id, true, 183],
    [ZOO_H.id, ZOO_V.id, true, 23],
    ['solo', 'solo', false, 10],
    ['vh', 'vv', true, 12],
  ]);
  assert.equal(slots[0].title, V.title);
  assert.deepEqual(pairPlaylist([]), []);
  assert.deepEqual(pairPlaylist(null), []);
});

test('el turno en antena se calcula desde la época del servidor: dos players con el mismo reloj coinciden', () => {
  const slots = pairPlaylist([H, V, ZOO_H, ZOO_V]);
  assert.equal(cycleMs(slots), 206000);
  const physical = slotAt(slots, 1794595597981), twin = slotAt(slots, 1794595597981);
  assert.deepEqual(physical, twin);
  assert.deepEqual(slotAt(slots, 0), { index: 0, slot: slots[0], offsetMs: 0, total: 2 });
  assert.deepEqual(slotAt(slots, 183000 + 5000), { index: 1, slot: slots[1], offsetMs: 5000, total: 2 });
  assert.equal(slotAt(slots, 206000).index, 0);
  assert.deepEqual([slotAt(slots, -1000).index, slotAt(slots, -1000).offsetMs], [1, 22000]);
  assert.equal(slotAt([], 1), null);
});

test('una pieza de playlist se vuelve pista con la forma del playout', () => {
  assert.deepEqual(trackOf(H), { id: H.id, type: 'video', url: H.asset, title: H.title });
  assert.deepEqual(trackOf({ id: 'img', url: 'https://stock.admira.store/stock/img/asset.jpg', type: 'image' }), { id: 'img', type: 'image', url: 'https://stock.admira.store/stock/img/asset.jpg', title: '' });
  assert.equal(trackOf({ id: 'x', asset: 'http://inseguro', assetType: 'video' }), null);
  assert.equal(trackOf({ id: 'x', asset: 'https://a/b', assetType: 'audio' }), null);
  assert.equal(trackOf(null), null);
});
