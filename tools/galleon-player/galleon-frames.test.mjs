import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const { LCD, KEYS, MOSAIC, dataUrlToBuffer, keyTiles, createExitGesture, createVolumeControl, ringColors, clampVolume } = createRequire(import.meta.url)('./galleon-frames.cjs');

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

test('girar cualquiera de los dos diales sube o baja el volumen a saltos de 5 % y pulsarlo silencia o devuelve el sonido', () => {
  const changes = [];
  const volume = createVolumeControl(state => changes.push(state), { volume: 0.5 });
  assert.deepEqual(volume.state(), { volume: 0.5, muted: false });
  assert.equal(volume('rotate', { type: 'button', index: 0 }, 1), false); // las teclas no son ruedas
  assert.equal(volume('rotate', { type: 'encoder', index: 0 }, 1), true);
  assert.equal(volume('rotate', { type: 'encoder', index: 1 }, -3), true); // giro rápido: varias muescas de golpe
  assert.deepEqual(changes, [{ volume: 0.55, muted: false }, { volume: 0.4, muted: false }]);
  assert.equal(volume('rotate', { type: 'encoder', index: 0 }, 0), true); // sin muescas, sin cambio
  assert.equal(changes.length, 2);
  volume('down', { type: 'encoder', index: 1 });
  assert.deepEqual(volume.state(), { volume: 0.4, muted: true });
  volume('up', { type: 'encoder', index: 1 }); // soltar no hace nada
  assert.equal(changes.length, 3);
  volume('rotate', { type: 'encoder', index: 1 }, 1); // girar en silencio devuelve el sonido
  assert.deepEqual(volume.state(), { volume: 0.45, muted: false });
  volume('down', { type: 'encoder', index: 0 }); volume('down', { type: 'encoder', index: 0 });
  assert.deepEqual(volume.state(), { volume: 0.45, muted: false });
  for (let i = 0; i < 30; i++) volume('rotate', { type: 'encoder', index: 0 }, 1);
  assert.equal(volume.state().volume, 1); // tope arriba
  for (let i = 0; i < 30; i++) volume('rotate', { type: 'encoder', index: 0 }, -1);
  assert.deepEqual(volume.state(), { volume: 0, muted: false }); // tope abajo
  assert.equal(clampVolume(1.7), 1); assert.equal(clampVolume(-2), 0); assert.equal(clampVolume('x'), 0); assert.equal(clampVolume(0.333), 0.33);
});

test('el anillo del dial enseña el nivel: LEDs verdes según el volumen, todo rojo tenue en silencio', () => {
  assert.deepEqual(ringColors({ volume: 0.5 }), [0, 150, 60, 0, 150, 60, 6, 6, 6, 6, 6, 6]);
  assert.deepEqual(ringColors({ volume: 1 }), [0, 150, 60, 0, 150, 60, 0, 150, 60, 0, 150, 60]);
  assert.deepEqual(ringColors({ volume: 0 }), [6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6]);
  assert.deepEqual(ringColors({ volume: 0.8, muted: true }), [90, 0, 0, 90, 0, 0, 90, 0, 0, 90, 0, 0]);
  assert.equal(ringColors({ volume: 0.3 }, 10).length, 30);
});
