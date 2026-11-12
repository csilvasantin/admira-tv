import assert from 'node:assert/strict';
import test from 'node:test';
import { containFrame, paintGalleon } from './assets/galleon-layout.mjs';

function canvas() {
  const calls = [];
  const context = {
    fillRect: (...args) => calls.push(['fill', ...args]),
    drawImage: (...args) => calls.push(['draw', ...args]),
  };
  return { width: 0, height: 0, calls, getContext: () => context };
}

test('respeta la proporción del vídeo sin deformar ni recortar la imagen', () => {
  assert.deepEqual(containFrame(1920, 1080, 720, 384), { x: 18, y: 0, width: 683, height: 384 });
  assert.deepEqual(containFrame(1080, 1920, 480, 640), { x: 60, y: 0, width: 360, height: 640 });
  assert.throws(() => containFrame(0, 1920, 480, 640), RangeError);
});

test('la pantalla superior y las 12 teclas reciben las dos variantes, en orden físico', () => {
  const lcd = canvas(), mosaic = canvas(), keys = Array.from({ length: 12 }, canvas);
  const landscape = { videoWidth: 1920, videoHeight: 1080 };
  const portrait = { videoWidth: 1080, videoHeight: 1920 };
  paintGalleon({ lcd, mosaic, keys }, { landscape, portrait });

  assert.deepEqual([lcd.width, lcd.height, mosaic.width, mosaic.height], [720, 384, 480, 640]);
  assert.deepEqual(lcd.calls[1], ['draw', landscape, 18, 0, 683, 384]);
  assert.deepEqual(mosaic.calls[1], ['draw', portrait, 60, 0, 360, 640]);
  assert.deepEqual(keys.map(key => key.calls[0].slice(2, 4)), [
    [0, 0], [160, 0], [320, 0],
    [0, 160], [160, 160], [320, 160],
    [0, 320], [160, 320], [320, 320],
    [0, 480], [160, 480], [320, 480],
  ]);
});

test('una variante que no se ha cargado conserva negra su superficie', () => {
  const lcd = canvas(), mosaic = canvas(), keys = Array.from({ length: 12 }, canvas);
  paintGalleon({ lcd, mosaic, keys }, { landscape: { videoWidth: 0, videoHeight: 0 } });
  assert.deepEqual(lcd.calls, [['fill', 0, 0, 720, 384]]);
  assert.deepEqual(mosaic.calls, [['fill', 0, 0, 480, 640]]);
  assert.throws(() => paintGalleon({ lcd, mosaic, keys: [] }, {}), /12 teclas/);
});
