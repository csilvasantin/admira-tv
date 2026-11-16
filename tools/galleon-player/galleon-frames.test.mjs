import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const { LCD, KEYS, MOSAIC, dataUrlToBuffer, keyTiles, createExitGesture, createKeyTaps, createVolumeControl, createTransportControl, ringColors, transportRing, clampVolume } = createRequire(import.meta.url)('./galleon-frames.cjs');

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

test('girar el dial izquierdo sube o baja el volumen a saltos de 5 % y pulsarlo silencia o devuelve el sonido; el derecho no es volumen', () => {
  const changes = [];
  const volume = createVolumeControl(state => changes.push(state), { volume: 0.5 });
  assert.deepEqual(volume.state(), { volume: 0.5, muted: false });
  assert.equal(volume('rotate', { type: 'button', index: 0 }, 1), false); // las teclas no son ruedas
  assert.equal(volume('rotate', { type: 'encoder', index: 1 }, 1), false); // el dial derecho es el transporte
  assert.equal(volume('down', { type: 'encoder', index: 1 }), false);
  assert.equal(volume('rotate', { type: 'encoder', index: 0 }, 1), true);
  assert.equal(volume('rotate', { type: 'encoder', index: 0 }, -3), true); // giro rápido: varias muescas de golpe
  assert.deepEqual(changes, [{ volume: 0.55, muted: false }, { volume: 0.4, muted: false }]);
  assert.equal(volume('rotate', { type: 'encoder', index: 0 }, 0), true); // sin muescas, sin cambio
  assert.equal(changes.length, 2);
  volume('down', { type: 'encoder', index: 0 });
  assert.deepEqual(volume.state(), { volume: 0.4, muted: true });
  volume('up', { type: 'encoder', index: 0 }); // soltar no hace nada
  assert.equal(changes.length, 3);
  volume('rotate', { type: 'encoder', index: 0 }, 1); // girar en silencio devuelve el sonido
  assert.deepEqual(volume.state(), { volume: 0.45, muted: false });
  volume('down', { type: 'encoder', index: 0 }); volume('down', { type: 'encoder', index: 0 });
  assert.deepEqual(volume.state(), { volume: 0.45, muted: false });
  for (let i = 0; i < 30; i++) volume('rotate', { type: 'encoder', index: 0 }, 1);
  assert.equal(volume.state().volume, 1); // tope arriba
  for (let i = 0; i < 30; i++) volume('rotate', { type: 'encoder', index: 0 }, -1);
  assert.deepEqual(volume.state(), { volume: 0, muted: false }); // tope abajo
  assert.equal(clampVolume(1.7), 1); assert.equal(clampVolume(-2), 0); assert.equal(clampVolume('x'), 0); assert.equal(clampVolume(0.333), 0.33);
});

test('el dial derecho es el transporte: pulsar pausa o reanuda, girar a la derecha pasa a la siguiente y a la izquierda a la anterior, una orden por giro', () => {
  let clock = 0;
  const actions = [];
  const transport = createTransportControl(action => actions.push(action), { now: () => clock });
  assert.equal(transport('down', { type: 'encoder', index: 0 }), false); // el izquierdo es el volumen
  assert.equal(transport('down', { type: 'button', index: 1 }), false);
  assert.equal(transport('down', { type: 'encoder', index: 1 }), true);
  transport('up', { type: 'encoder', index: 1 });
  assert.equal(transport('rotate', { type: 'encoder', index: 1 }, 2), true);
  transport('rotate', { type: 'encoder', index: 1 }, 1); // mismo giro (dentro del cooldown): no repite
  clock = 400;
  transport('rotate', { type: 'encoder', index: 1 }, -1);
  transport('rotate', { type: 'encoder', index: 1 }, 0); // sin muescas, nada
  clock = 800;
  transport('rotate', { type: 'encoder', index: 1 }, -4);
  assert.deepEqual(actions, ['toggle', 'next', 'prev', 'prev']);
  assert.deepEqual(transportRing({ paused: false }), [0, 60, 200, 0, 60, 200, 0, 60, 200, 0, 60, 200]);
  assert.deepEqual(transportRing({ paused: true }), [200, 110, 0, 200, 110, 0, 200, 110, 0, 200, 110, 0]);
});

test('el anillo del dial enseña el nivel: LEDs verdes según el volumen, todo rojo tenue en silencio', () => {
  assert.deepEqual(ringColors({ volume: 0.5 }), [0, 150, 60, 0, 150, 60, 6, 6, 6, 6, 6, 6]);
  assert.deepEqual(ringColors({ volume: 1 }), [0, 150, 60, 0, 150, 60, 0, 150, 60, 0, 150, 60]);
  assert.deepEqual(ringColors({ volume: 0 }), [6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6]);
  assert.deepEqual(ringColors({ volume: 0.8, muted: true }), [90, 0, 0, 90, 0, 0, 90, 0, 0, 90, 0, 0]);
  assert.equal(ringColors({ volume: 0.3 }, 10).length, 30);
});

test('un toque en una tecla salta a su pieza; una pulsación larga no; la tecla 12 salta al soltar antes del segundo y sale si se mantiene', () => {
  let clock = 1000;
  const taps = [];
  const tap = createKeyTaps(index => taps.push(index), { maxHold: 800, now: () => clock });
  assert.equal(tap('down', { type: 'encoder', index: 0 }), false); // las ruedas no son teclas
  assert.equal(tap('down', { type: 'button', index: 7 }), true);
  clock += 150;
  tap('up', { type: 'button', index: 7 });
  tap('down', { type: 'button', index: 2 });
  clock += 2000;
  tap('up', { type: 'button', index: 2 }); // larga: no salta
  tap('up', { type: 'button', index: 4 }); // soltada sin pulsación conocida: nada
  assert.deepEqual(taps, [7]);

  const exits = [], jumps = [];
  let timer = null;
  const gesture = createExitGesture(() => exits.push('exit'), { onTap: index => jumps.push(index), now: () => clock,
    setTimer: (fn, ms) => { timer = { fn, ms }; return timer; }, clearTimer: () => { timer = null; } });
  gesture('down', { type: 'button', index: 11 });
  gesture('up', { type: 'button', index: 11 }); // toque: salta a +6
  assert.deepEqual([jumps, exits, timer], [[11], [], null]);
  gesture('down', { type: 'button', index: 11 });
  timer.fn(); // mantenida un segundo: vuelve a Elgato, sin salto
  assert.deepEqual([jumps, exits], [[11], ['exit']]);
});
