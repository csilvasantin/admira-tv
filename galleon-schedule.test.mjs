import assert from 'node:assert/strict';
import test from 'node:test';
import { cycleMs, familyKey, jumpOffsetMs, linked, navigatorWindow, orientationOf, pairPlaylist, rebaseMs, slotAt, taggedForScreen, trackOf } from './assets/galleon-schedule.mjs';

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

test('las 12 teclas enseñan las 6 piezas anteriores (arriba, −6…−1) y las 6 siguientes (abajo, +1…+6), apagadas si no hay tantas', () => {
  assert.deepEqual(navigatorWindow(20, 10), [4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16]);
  assert.deepEqual(navigatorWindow(8, 0), [2, 3, 4, 5, 6, 7, 1, 2, 3, 4, 5, 6]); // ciclo: −1 es la última del ciclo
  assert.deepEqual(navigatorWindow(3, 1), [null, null, null, null, 2, 0, 2, 0, null, null, null, null]); // sólo 2 piezas distintas por lado
  assert.deepEqual(navigatorWindow(2, 0), [null, null, null, null, null, 1, 1, null, null, null, null, null]);
  assert.deepEqual(navigatorWindow(1, 0), Array(12).fill(null));
  assert.deepEqual(navigatorWindow(0, -1), Array(12).fill(null));
  assert.deepEqual(navigatorWindow(5, 2, { before: 2, after: 2 }), [0, 1, 3, 4]);
});

test('el salto por tecla desplaza el reloj para que el turno elegido empiece ahora mismo', () => {
  const slots = pairPlaylist([H, V, ZOO_H, ZOO_V]); // 183 s + 23 s
  const now = 1_700_000_000_000;
  for (const index of [0, 1]) {
    const at = slotAt(slots, now + jumpOffsetMs(slots, index, now));
    assert.equal(at.index, index);
    assert.equal(at.offsetMs, 0);
  }
  assert.equal(jumpOffsetMs(slots, 7, now), 0);
  assert.equal(jumpOffsetMs([], 0, now), 0);
});

test('una pieza dirigida por etiqueta (auto, 10 s fijos) deja el turno marcado para aprender la duración real', () => {
  const auto = { ...ZOO_H, id: 'stock-zoo-h', stockId: 'zoo-h', seconds: 10, secondsGuessed: true, tags: ['horizontal'] };
  const slots = pairPlaylist([H, V, auto]);
  assert.deepEqual(slots.map(s => [s.seconds, s.guessed]), [[183, false], [10, true]]);
});

test('del índice del Stock salen las piezas etiquetadas con el nombre de la pantalla, con cualquier otra etiqueta libre, como piezas de playlist', () => {
  const stock = [
    { id: '1794862042758-1631g8', type: 'video', title: 'Best Songs Of 1986 #oldsong', url: 'https://stock.admira.store/stock/1794862042758-1631g8/asset.mp4?v=3194', tags: ['oldsong', '80smusic', 'vertical', '#corsair-galleon-100'] },
    { id: '1794000000000-aaaaaa', type: 'image', title: 'Cartel', url: 'https://stock.admira.store/stock/1794000000000-aaaaaa/asset.jpg', tags: ['pantalla:Corsair-Galleon-100'], seconds: 15 },
    { id: 'oculta', type: 'video', title: 'Oculta', url: 'https://stock.admira.store/x.mp4', tags: ['corsair-galleon-100'], oculto: true },
    { id: 'otra', type: 'video', title: 'Otra pantalla', url: 'https://stock.admira.store/y.mp4', tags: ['hotel-creel'] },
    { id: 'interactiva', type: 'interactive', title: 'No es vídeo', url: 'https://stock.admira.store/z', tags: ['corsair-galleon-100'] },
    { id: 'http', type: 'video', title: 'Sin https', url: 'http://stock.admira.store/w.mp4', tags: ['corsair-galleon-100'] },
  ];
  const items = taggedForScreen(stock, 'corsair-galleon-100');
  assert.deepEqual(items.map(i => [i.stockId, i.assetType, i.seconds, i.secondsGuessed]), [['1794000000000-aaaaaa', 'image', 15, false], ['1794862042758-1631g8', 'video', 10, true]]);
  assert.equal(orientationOf(items[1]), 'portrait');
  assert.equal(trackOf(items[1]).url, 'https://stock.admira.store/stock/1794862042758-1631g8/asset.mp4?v=3194');
  assert.deepEqual(taggedForScreen(stock, ''), []);
  assert.deepEqual(taggedForScreen(null, 'corsair-galleon-100'), []);
});

test('al cambiar la playlist o una duración, la pieza en antena sigue por donde iba (rebaseMs)', () => {
  const now = 1_700_000_000_000;
  const slots = pairPlaylist([H, V, ZOO_H, ZOO_V]);
  let at = slotAt(slots, now + rebaseMs(slots, 1, 12_000, now));
  assert.deepEqual([at.index, at.offsetMs], [1, 12_000]);
  const bigger = pairPlaylist([H, V, ZOO_H, ZOO_V, { id: 'x', title: 'Nueva', seconds: 10, asset: 'https://stock.admira.store/x.mp4', assetType: 'video', tags: ['horizontal'] }]);
  at = slotAt(bigger, now + rebaseMs(bigger, 1, 12_000, now)); // la misma pieza (índice 1) con la misma posición, en el ciclo nuevo
  assert.deepEqual([at.index, at.offsetMs, at.total], [1, 12_000, 3]);
  at = slotAt(slots, now + rebaseMs(slots, 1, 99_000, now)); // una posición más allá del turno se recorta al final
  assert.deepEqual([at.index, at.offsetMs], [1, 22_999]);
  assert.equal(rebaseMs([], 0, 5, now), 0);
});
