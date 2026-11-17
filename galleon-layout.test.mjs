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

test('el navegador pinta las 12 teclas en orden físico y las compone en el mosaico; la tecla sin pieza queda apagada', async () => {
  const { paintKeys, paintLcd, wrapTitle } = await import('./assets/galleon-layout.mjs');
  const text = () => {
    const calls = [];
    const context = { fillRect: (...a) => calls.push(['fill', ...a]), drawImage: (...a) => calls.push(['draw', ...a]), fillText: (...a) => calls.push(['text', ...a]), measureText: t => ({ width: t.length * 8 }) };
    return { width: 0, height: 0, calls, getContext: () => context };
  };
  const mosaic = text(), keys = Array.from({ length: 12 }, text);
  const image = { videoWidth: 1920, videoHeight: 1080 };
  const entries = Array(12).fill(null);
  entries[5] = { image, title: 'Me at the zoo · Locución ES', offset: -1, position: 2, total: 2, next: false };
  entries[6] = { image: null, title: 'Así Sonaba 1985… Cuando los 80s No Tenían Competencia', offset: 1, position: 1, total: 2, next: true };
  paintKeys({ mosaic, keys }, entries, { muted: true });
  assert.deepEqual([mosaic.width, mosaic.height], [480, 640]);
  assert.deepEqual(mosaic.calls.filter(c => c[0] === 'draw').map(c => c.slice(2, 4)), [
    [0, 0], [160, 0], [320, 0], [0, 160], [160, 160], [320, 160], [0, 320], [160, 320], [320, 320], [0, 480], [160, 480], [320, 480],
  ]);
  assert.deepEqual(keys[0].calls, [['fill', 0, 0, 160, 160]]); // apagada
  assert.deepEqual(keys[5].calls[1], ['draw', image, 0, 0, 160, 90]); // previo 16:9 arriba
  assert.ok(keys[5].calls.some(c => c[0] === 'text' && c[1] === '-1'));
  assert.ok(keys[6].calls.some(c => c[0] === 'text' && c[1] === '+1'));
  assert.ok(keys[6].calls.some(c => c[0] === 'text' && c[1] === '1/2'));
  assert.deepEqual(wrapTitle(keys[0].getContext(), 'Así Sonaba 1985… Cuando los 80s No Tenían Competencia', 148, 2), ['Así Sonaba 1985…', 'Cuando los 80s No…']);
  const lcd = text();
  paintLcd(lcd, image);
  assert.deepEqual(lcd.calls[1], ['draw', image, 18, 0, 683, 384]);
});

test('el contenido activo tiene borde verde también sin mute', async () => {
  const { paintKeyTile } = await import('./assets/galleon-layout.mjs');
  const fills = [], texts = [];
  const ctx = { fillRect: (...args) => fills.push([ctx.fillStyle, ...args]), fillText: text => texts.push(text), measureText: t => ({width:t.length*8}) };
  const tile = {width:160,height:160,getContext:()=>ctx};
  paintKeyTile(tile, {active:true,title:'Actual',position:8,total:12,offset:0});
  assert.equal(fills.filter(f=>f[0]==='#00e676').length,4);
  assert.ok(texts.includes('EN EMISIÓN'));
  assert.ok(!texts.includes('8/12'));
  fills.length=0;
  paintKeyTile(tile, {active:false,title:'Otro',position:1,total:12,offset:-7}, {muted:true});
  assert.equal(fills.filter(f=>f[0]==='#00e676').length,0);
  assert.ok(texts.includes('1/12'));
});
