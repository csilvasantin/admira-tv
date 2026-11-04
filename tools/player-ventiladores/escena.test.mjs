import test from 'node:test';
import assert from 'node:assert/strict';
import { modoCanonico, normalizarEscena, asignacion, normalizarLuz, cargaLuz, luzDe, colorRgb, efectoCanonico } from './escena.mjs';

test('los modos se entienden en castellano y en inglés', () => {
  for (const [dicho, modo] of [['sincro', 'sincro'], ['sync', 'sincro'], ['Repeat', 'repetir'], ['repetir', 'repetir'],
    ['extend', 'extender'], ['adapt', 'extender'], ['Adaptar', 'extender'], ['extender', 'extender'], ['independiente', 'independiente']]) {
    assert.equal(modoCanonico(dicho), modo, dicho);
  }
  assert.equal(modoCanonico('mosaico'), null);
  assert.throws(() => normalizarEscena({ modo: 'mosaico' }));
});

test('la escena se normaliza con valores seguros', () => {
  const e = normalizarEscena({ modo: 'sincro', pieza: 'abc-1', paso: 999, orden: [3, 1, 2, 4, 5, 6, 7], ids: { 2: ['x', '../y'] } });
  assert.deepEqual(e.piezas, ['abc-1']);
  assert.equal(e.paso, 120);
  assert.deepEqual(e.orden, [3, 1, 2, 4, 5, 6, 7]);
  assert.deepEqual(e.ids, { 2: ['x'] });
  assert.deepEqual(normalizarEscena({ modo: 'extend', orden: [1, 1, 2] }).orden, [1, 2, 3, 4, 5, 6, 7], 'un orden incompleto no vale');
  assert.equal(normalizarEscena({ modo: 'extend' }).columnas, 7);
  assert.equal(normalizarEscena({ modo: 'extend', ajuste: 'stretch' }).ajuste, 'estirar');
});

test('sincro: la pieza avanza un ventilador por paso y conserva su reloj', () => {
  const e = normalizarEscena({ modo: 'sincro', pieza: 'v1', paso: 4, epoch: 1000 });
  const quien = ahora => [1, 2, 3, 4, 5, 6, 7].filter(f => asignacion(e, f, ahora).tipo === 'pieza');
  assert.deepEqual(quien(1000), [1]);
  assert.deepEqual(quien(1000 + 4000), [2]);
  assert.deepEqual(quien(1000 + 7 * 4000), [1], 'da la vuelta');
  assert.equal(asignacion(e, 2, 1000 + 5000).t, 5, 'el vídeo sigue por el segundo 5, no vuelve a empezar');
  assert.equal(asignacion(e, 5, 1000).tipo, 'negro');
});

test('sincro con varias piezas: carrusel que se desplaza a la vez', () => {
  const e = normalizarEscena({ modo: 'sincro', piezas: ['a', 'b', 'c'], paso: 2, epoch: 0 });
  const fila = ahora => [1, 2, 3, 4, 5, 6, 7].map(f => asignacion(e, f, ahora).pieza || '·').join('');
  assert.equal(fila(0), 'abc····');
  assert.equal(fila(2000), '·abc···');
  assert.equal(fila(12000), 'bc····a');
});

test('extender: cada ventilador es una tesela de la rejilla en el orden pedido', () => {
  const e = normalizarEscena({ modo: 'adaptar', pieza: 'mural', orden: [7, 6, 5, 4, 3, 2, 1] });
  assert.deepEqual(asignacion(e, 7, 0), { tipo: 'tesela', pieza: 'mural', t: 0, ajuste: 'cubrir', col: 0, fila: 0, columnas: 7, filas: 1 });
  assert.equal(asignacion(e, 1, 0).col, 6);
  const g = normalizarEscena({ modo: 'extend', pieza: 'm', columnas: 4 });
  assert.deepEqual([g.filas, asignacion(g, 6, 0).fila, asignacion(g, 6, 0).col], [2, 1, 1]);
});

test('independiente y repetir los pinta el canal', () => {
  assert.equal(asignacion(normalizarEscena({ modo: 'repeat' }), 3).tipo, 'canal');
  assert.equal(asignacion(normalizarEscena({ modo: 'independiente' }), 3).tipo, 'canal');
});

test('luz: efectos en castellano/inglés, brillo 0–4 o porcentaje y color por ventilador', () => {
  assert.equal(efectoCanonico('rainbow'), 'arcoiris');
  assert.deepEqual(colorRgb('#ff8000'), [255, 128, 0]);
  const l = normalizarLuz({ efecto: 'fijo', color: '#00ff00', brillo: 50, ventiladores: { 3: { efecto: 'breathing', color: '#ff0000' }, 12: {} } });
  assert.equal(l.brillo, 2);
  assert.deepEqual(Object.keys(l.ventiladores), ['3']);
  assert.equal(l.ventiladores['3'].efecto, 'respirar');
  assert.equal(l.ventiladores['3'].brillo, 2, 'hereda el brillo general');
});

test('la carga de luz sigue el formato del controlador TL', () => {
  const p = cargaLuz([0x10, 0x12], normalizarLuz({ efecto: 'fijo', color: '#0a0b0c', brillo: 3, velocidad: 1 }));
  assert.deepEqual([...p], [0x10, 0x12, 3, 3, 1, 10, 11, 12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
  const off = cargaLuz([0, 0], normalizarLuz({ efecto: 'off' }));
  assert.deepEqual([off[3], off[18]], [0, 1]);
});

test('con sigueVideo, en sincro solo brilla el ventilador que tiene la pieza', () => {
  const e = normalizarEscena({ modo: 'sincro', pieza: 'v', paso: 4, epoch: 0 });
  const l = normalizarLuz({ efecto: 'fijo', color: '#ffffff', sigueVideo: true });
  assert.equal(luzDe(l, 1, e, 0).brillo, 4);
  assert.equal(luzDe(l, 2, e, 0).brillo, 0);
  assert.equal(luzDe(l, 2, e, 4000).brillo, 4);
});
