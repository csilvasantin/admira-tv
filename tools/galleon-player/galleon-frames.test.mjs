import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const { LCD, KEYS, MOSAIC, dataUrlToBuffer, keyTiles, createExitGesture } = createRequire(import.meta.url)('./galleon-frames.cjs');

test('la geometría es la del Galleon 100 SD: LCD 720×384 y 12 teclas 160×160 en 3 columnas × 4 filas', () => {
  assert.deepEqual(LCD, { width: 720, height: 384 });
  assert.deepEqual(KEYS, { columns: 3, rows: 4, size: 160 });
  assert.deepEqual(MOSAIC, { width: 480, height: 640 });
});

test('sólo se aceptan JPEG o PNG en data URL; un lienzo vacío («data:,») no se manda al teclado', () => {
  assert.deepEqual(dataUrlToBuffer('data:image/jpeg;base64,/9j/4AAQ'), Buffer.from('/9j/4AAQ', 'base64'));
  assert.equal(dataUrlToBuffer('data:,'), null);
  assert.equal(dataUrlToBuffer('data:text/html;base64,PGI+'), null);
  assert.equal(dataUrlToBuffer(undefined), null);
});

test('el mosaico se trocea en el orden físico de las teclas, fila a fila', () => {
  const raw = Buffer.alloc(MOSAIC.width * MOSAIC.height * 3);
  for (let y = 0; y < MOSAIC.height; y++) for (let x = 0; x < MOSAIC.width; x++) {
    const at = (y * MOSAIC.width + x) * 3;
    raw[at] = Math.floor(x / KEYS.size); raw[at + 1] = Math.floor(y / KEYS.size); raw[at + 2] = 7;
  }
  const tiles = keyTiles(raw);
  assert.equal(tiles.length, 12);
  tiles.forEach((tile, index) => {
    assert.equal(tile.length, 160 * 160 * 3);
    const column = index % 3, row = Math.floor(index / 3);
    for (const at of [0, 159 * 3, (160 * 160 - 1) * 3]) assert.deepEqual([tile[at], tile[at + 1], tile[at + 2]], [column, row, 7]);
  });
  assert.throws(() => keyTiles(Buffer.alloc(10)), RangeError);
});

test('mantener la tecla 12 un segundo sale; un toque breve o cualquier otra tecla no hacen nada', () => {
  let exits = 0, clock = 0; const timers = new Map(); let next = 1;
  const gesture = createExitGesture(() => exits++, {
    now: () => clock,
    setTimer: (fn, delay) => { const id = next++; timers.set(id, { fn, at: clock + delay }); return id; },
    clearTimer: id => timers.delete(id),
  });
  const tick = until => { clock = until; for (const [id, t] of timers) if (t.at <= clock) { timers.delete(id); t.fn(); } };
  assert.equal(gesture('down', { type: 'button', index: 3 }), false);
  assert.equal(gesture('down', { type: 'encoder', index: 11 }), false);
  assert.equal(gesture('down', { type: 'button', index: 11 }), true);
  tick(300); gesture('up', { type: 'button', index: 11 }); tick(2000);
  assert.equal(exits, 0);
  gesture('down', { type: 'button', index: 11 }); tick(3100);
  assert.equal(exits, 1);
  gesture('up', { type: 'button', index: 11 }); tick(5000);
  assert.equal(exits, 1);
});
