// Las dos zonas nuevas de Jardinets (Carlos, 16-09-2026): papelera → Queen y contador
// de luz → Michael Jackson, las dos con #taza para que la pieza acabe también en la
// taza pixelada. El contrato de etiquetas es exacto: ni se adivina ni se sustituye.
const { test } = require('node:test'), assert = require('node:assert/strict');
const T = require('../jardinets-taza.js');

const pieza = (id, tags, extra = {}) => ({ id, type: 'video', title: 'Pieza ' + id, tags,
  url: 'https://stock.admira.store/stock/' + id + '/asset.mp4', ...extra });
const CATALOGO = [
  pieza('queen', ['música', 'videoclip', 'taza', 'papelera'], { title: 'Queen - The Show Must Go On' }),
  pieza('mj', ['música', 'videoclip', 'taza', 'contador'], { title: 'Michael Jackson - Beat It' }),
  pieza('ruido', ['música', 'videoclip', 'rock']),
];
const porId = (filas, id) => filas.find((f) => f.id === id);

test('cada zona resuelve su pieza por #taza mas su etiqueta, con acentos o sin ellos', () => {
  const filas = T.resolve(CATALOGO);
  assert.deepEqual(filas.map((f) => f.id), ['papelera', 'contador']);
  assert.equal(porId(filas, 'papelera').item.title, 'Queen - The Show Must Go On');
  assert.equal(porId(filas, 'contador').item.title, 'Michael Jackson - Beat It');
  assert.equal(porId(filas, 'papelera').error, null);
});

test('la almohadilla y las mayusculas de la etiqueta dan igual', () => {
  const filas = T.resolve([pieza('q', ['#TAZA', '#Papelera'])]);
  assert.equal(porId(filas, 'papelera').item.stockId, 'q');
});

test('sin la etiqueta no hay pieza, y lo dice en vez de poner otra parecida', () => {
  const filas = T.resolve([pieza('queen', ['música', 'rock'])]);
  assert.equal(porId(filas, 'papelera').item, null);
  assert.equal(porId(filas, 'papelera').error, 'Falta #taza + #papelera');
  assert.equal(porId(filas, 'contador').error, 'Falta #taza + #contador');
});

test('#taza sola no basta: sin la segunda etiqueta no se sabe de que zona es', () => {
  const filas = T.resolve([pieza('q', ['taza'])]);
  assert.equal(porId(filas, 'papelera').item, null);
  assert.equal(porId(filas, 'contador').item, null);
});

test('dos candidatas para la misma zona no se desempatan a dedo', () => {
  const filas = T.resolve([pieza('a', ['taza', 'papelera']), pieza('b', ['taza', 'papelera'])]);
  assert.equal(porId(filas, 'papelera').item, null);
  assert.match(porId(filas, 'papelera').error, /varias piezas/);
});

test('una URL que no sea https limpio se rechaza', () => {
  for (const url of ['http://stock.admira.store/x.mp4', 'https://user:clave@stock.admira.store/x.mp4']) {
    const filas = T.resolve([pieza('q', ['taza', 'papelera'], { url })]);
    assert.equal(porId(filas, 'papelera').item, null);
  }
});

test('solo vídeo o animación: una foto no se emite como si fuera la canción', () => {
  const filas = T.resolve([pieza('q', ['taza', 'papelera'], { type: 'image' })]);
  assert.equal(porId(filas, 'papelera').item, null);
});

test('la orden llega a las pantallas del sitio Y siempre a la taza', () => {
  const ordenes = T.ordenes(T.ZONAS[0], [
    { circuit: 'ipad-admin', screen: 'ipad-admin-mupi' },
    { circuit: 'samsung-galaxy-fold-8', screen: 'samsung-galaxy-fold-8-mupi' },
  ]);
  assert.deepEqual(ordenes, [
    { id: 'ipad-admin', screen: 'ipad-admin-mupi', cmd: 'tag-papelera' },
    { id: 'samsung-galaxy-fold-8', screen: 'samsung-galaxy-fold-8-mupi', cmd: 'tag-papelera' },
    { id: 'playertaza', screen: 'playertaza', cmd: 'tag-papelera' },
  ]);
});

test('sin pantallas de sitio la taza sigue recibiendo lo suyo', () => {
  assert.deepEqual(T.ordenes(T.ZONAS[1], []), [{ id: 'playertaza', screen: 'playertaza', cmd: 'tag-contador' }]);
});

test('las esquinas no se inventan: las dos zonas nacen sin calibrar y no se pintan', () => {
  assert.deepEqual(T.sinCalibrar(), ['papelera', 'contador']);
  for (const zona of T.ZONAS) assert.equal(zona.corners, null);
});
