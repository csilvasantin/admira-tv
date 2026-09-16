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

test('las dos zonas estan calibradas: cuatro esquinas cada una, y en su sitio', () => {
  assert.deepEqual(T.sinCalibrar(), []);
  for (const zona of T.ZONAS) {
    assert.equal(zona.corners.length, 4, zona.id + ' necesita cuatro esquinas');
    for (const [rumbo, inclinacion] of zona.corners) {
      assert.ok(rumbo >= 0 && rumbo < 360, 'rumbo fuera de la rosa: ' + rumbo);
      assert.ok(inclinacion > -90 && inclinacion < 90, 'inclinacion imposible: ' + inclinacion);
      // Las dos son mobiliario de acera: se ven POR DEBAJO del horizonte del panorama.
      assert.ok(inclinacion < 0, zona.id + ' no puede estar por encima del horizonte');
    }
  }
  // Medidas sobre el panorama, no a ojo: la papelera esta junto al cajero (~293 grados)
  // y los armarios grises de la pintada TAZO mas a la izquierda (~254).
  const rumboMedio = (z) => z.corners.reduce((n, c) => n + c[0], 0) / 4;
  assert.ok(Math.abs(rumboMedio(T.ZONAS[0]) - 293) < 4, 'la papelera se ha movido de sitio');
  assert.ok(Math.abs(rumboMedio(T.ZONAS[1]) - 254) < 4, 'el contador se ha movido de sitio');
  assert.ok(rumboMedio(T.ZONAS[0]) > rumboMedio(T.ZONAS[1]), 'la papelera queda a la derecha del contador');
});

test('una zona sin medir no se pinta, aunque el resto si', () => {
  const guardadas = T.ZONAS[0].corners;
  T.ZONAS[0].corners = null;
  try {
    assert.deepEqual(T.sinCalibrar(), ['papelera']);
  } finally { T.ZONAS[0].corners = guardadas; }
});

// ── Cableado en la página, que es donde fallaba ──────────────────────────────
// Carlos, 16-09-2026: «no está funcionando como el enlace de las zapatillas, tiene que
// estar fijado al objeto, del mismo color, y activar el player de admira.tv —el virtual
// del quiosco— que a su vez activa el real del Samsung Fold». Las tres cosas se fijan
// aquí para que no se vuelvan a perder.
const fs = require('node:fs');
const pagina = fs.readFileSync(require('node:path').join(__dirname, '..', '..', 'best', 'index.html'), 'utf8');
const css = fs.readFileSync(require('node:path').join(__dirname, '..', '..', 'css', 'interactive-scene.css'), 'utf8');
const fuenteModulo = fs.readFileSync(require('node:path').join(__dirname, '..', 'jardinets-taza.js'), 'utf8');

test('las zonas se recolocan en el mismo bucle que las zapatillas: van pegadas al objeto', () => {
  const bucle = pagina.slice(pagina.indexOf('function layoutSvPanels()'), pagina.indexOf('function layoutSvPanels()') + 700);
  assert.match(bucle, /shoeMapping\?\.layout\(\);/);
  assert.match(bucle, /tazaZonas\?\.layout\(\);/, 'sin esto se quedan clavadas donde se pintaron la primera vez');
});

test('suena en el player VIRTUAL del quiosco, y es ese el que manda a la pantalla real', () => {
  assert.match(pagina, /ponerEnElQuiosco\(fila\.item,\[fila\.item\],'Taza · #'\+zona\.etiqueta\)/);
  // La función compartida es la misma que usa el mapeo de viandantes.
  assert.match(pagina, /play:\(item,items\)=>ponerEnElQuiosco\(item,items,'Personas · #musica'\)/);
  const quiosco = pagina.slice(pagina.indexOf('function ponerEnElQuiosco'), pagina.indexOf('let mappedMusicSentAt'));
  assert.match(quiosco, /screenPlayers\.set\('jardinets-main',mappedMusicPlayer\)/, 'la pieza entra en la pantalla virtual del quiosco');
  assert.match(quiosco, /mappedMusicToScreen\(item, true\)/, 'y desde ahí sale a la pantalla real');
  // El reenvío a la pantalla real tiene que entender también los ids de la taza.
  assert.match(pagina, /replace\(\/\^\(\?:music\|taza\):\/,''\)/);
});

test('la taza recibe su orden, que para eso existe la zona', () => {
  assert.match(pagina, /const taza=JardinetsTaza\.ordenes\(zona,\[\]\)\[0\]/);
  assert.match(pagina, /body:JSON\.stringify\(taza\)/);
});

// Carlos, 16-09-2026: «que no se vean las zonas seleccionables… lo dejamos invisible,
// solo pulsa quien lo sabe». Es un escondite, así que nada puede delatarlo: ni borde,
// ni fondo, ni rótulo, ni un cursor de mano al pasar por encima.
test('la zona no se ve: sin borde, sin fondo y sin rotulo', () => {
  const taza = css.slice(css.indexOf('.jardinets-taza{'), css.indexOf('.jardinets-taza[hidden]'));
  assert.match(taza, /border:0/);
  assert.match(taza, /background:none/);
  assert.doesNotMatch(taza, /border:2px solid/);
  assert.match(css, /\.jardinets-taza span\{display:none\}/, 'el rótulo no asoma ni al pasar por encima');
  assert.doesNotMatch(css, /#8cd7f5/i, 'el azul de la primera versión ya no pinta nada');
});

test('el cursor no la delata al pasar por encima', () => {
  const taza = css.slice(css.indexOf('.jardinets-taza{'), css.indexOf('.jardinets-taza[hidden]'));
  assert.match(taza, /cursor:default/);
  assert.doesNotMatch(taza, /cursor:pointer/);
});

test('sigue siendo pulsable: invisible no es desactivada', () => {
  const taza = css.slice(css.indexOf('.jardinets-taza{'), css.indexOf('.jardinets-taza[hidden]'));
  assert.match(taza, /pointer-events:auto/);
  assert.match(fuenteModulo, /el\.addEventListener\('click'/);
});

test('fuera del recorrido de teclado y sin anunciarse: es un escondite, no un boton', () => {
  assert.match(fuenteModulo, /el\.tabIndex=-1/);
  assert.match(fuenteModulo, /setAttribute\('aria-hidden','true'\)/);
  assert.doesNotMatch(fuenteModulo, /el\.title=zona\.rotulo/, 'un globito al pasar por encima la delataria');
});
