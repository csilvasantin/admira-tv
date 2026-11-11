import test from 'node:test';
import assert from 'node:assert/strict';
import { modoCanonico, normalizarEscena, asignacion, normalizarLuz, cargaLuz, luzDe, colorRgb, efectoCanonico, luzDispositivo, cargaStrimer, dispositivoCanonico, cargaGalahad, mismoContenido, inquilinoEn } from './escena.mjs';

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

test('identificar: cada pantalla enseña su propio número, sin piezas', () => {
  const e = normalizarEscena({ modo: 'identify' });
  assert.equal(e.modo, 'identificar');
  assert.deepEqual(asignacion(e, 5, 0), { tipo: 'numero', fan: 5 });
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

test('secuencia: la pieza entera en cada ventilador, del 1 al 7, y vuelta a empezar', () => {
  assert.equal(modoCanonico('sequence'), 'secuencia');
  assert.equal(modoCanonico('Secuencia'), 'secuencia');
  const e = normalizarEscena({ modo: 'secuencia', pieza: 'v1', duracion: 10, epoch: 0 });
  const quien = ahora => [1, 2, 3, 4, 5, 6, 7].filter(f => asignacion(e, f, ahora).tipo === 'pieza');
  assert.deepEqual(quien(0), [1]);
  assert.deepEqual(quien(9999), [1], 'el 1 la pone entera');
  assert.deepEqual(quien(10000), [2]);
  assert.equal(asignacion(e, 2, 13000).t, 3, 'en el 2 empieza desde el principio');
  assert.deepEqual(quien(69000), [7]);
  assert.deepEqual(quien(70000), [1], 'da la vuelta');
  assert.equal(asignacion(e, 4, 0).tipo, 'negro');
});

test('secuencia: sin duración (imagen o aún sin medir) 10 s en cada ventilador, y solo la primera pieza', () => {
  const e = normalizarEscena({ modo: 'secuencia', piezas: ['a', 'b'], paso: 5, epoch: 0 });
  assert.equal(e.duracion, 0);
  assert.equal(asignacion(e, 1, 9999).tipo, 'pieza', 'el paso de sincro no cuenta en secuencia');
  assert.equal(asignacion(e, 2, 10000).pieza, 'a');
  assert.equal(normalizarEscena({ modo: 'secuencia', duracion: 99999 }).duracion, 3600);
});

test('secuencia: la luz acompaña siempre al vídeo, aunque la general esté apagada', () => {
  const e = normalizarEscena({ modo: 'secuencia', pieza: 'v1', duracion: 8, epoch: 0 });
  const luz = normalizarLuz({ efecto: 'apagado', color: '#00ff00' });
  assert.equal(luzDe(luz, 1, e, 1000).efecto, 'fijo');
  assert.ok(luzDe(luz, 1, e, 1000).brillo > 0, 'el activo brilla');
  assert.equal(luzDe(luz, 2, e, 1000).brillo, 0, 'los demás no');
  assert.ok(luzDe(luz, 2, e, 9000).brillo > 0, 'a los 8 s el relevo pasa al 2');
  assert.equal(luzDe(normalizarLuz({ efecto: 'respirar' }), 1, e, 0).efecto, 'fijo', 'respirar es de grupo: fijo');
});

test('dispositivos: los cables Strimer y la memoria siguen a la general salvo luz propia', () => {
  assert.equal(dispositivoCanonico('GPU'), 'grafica');
  assert.equal(dispositivoCanonico('24 pines'), 'placa');
  assert.equal(dispositivoCanonico('RAM'), 'memoria');
  assert.equal(dispositivoCanonico('teclado'), null);
  const l = normalizarLuz({ efecto: 'arcoiris', brillo: 3, dispositivos: { gpu: { efecto: 'fijo', color: '#ff0000' }, teclado: { efecto: 'fijo' }, ram: null } });
  assert.deepEqual(Object.keys(l.dispositivos), ['grafica'], 'solo claves conocidas y con objeto');
  assert.equal(luzDispositivo(l, 'grafica').efecto, 'fijo');
  assert.deepEqual(luzDispositivo(l, 'grafica').colores, [[255, 0, 0]]);
  assert.equal(luzDispositivo(l, 'grafica').brillo, 3, 'hereda de la general lo que no dice');
  assert.equal(luzDispositivo(l, 'placa').efecto, 'arcoiris', 'sin luz propia, la general');
  assert.equal(normalizarLuz({}).dispositivos && Object.keys(normalizarLuz({}).dispositivos).length, 0);
});

test('Strimer: modo, velocidad y brillo del firmware y colores en R, B, G', () => {
  const fijo = cargaStrimer(normalizarLuz({ efecto: 'fijo', color: '#0a0b0c', brillo: 4, velocidad: 2 }));
  assert.equal(fijo.modo, 1);
  assert.equal(fijo.brillo, 0, 'brillo 4 = el máximo del firmware (0)');
  assert.equal(fijo.velocidad, 0);
  assert.equal(fijo.colores.length, 27 * 3, 'fijo: el color en los 27 LED');
  assert.deepEqual(fijo.colores.slice(0, 3), [10, 12, 11], 'R, B, G');
  const arco = cargaStrimer(normalizarLuz({ efecto: 'rainbow', brillo: 0, velocidad: 4 }));
  assert.deepEqual([arco.modo, arco.brillo, arco.velocidad, arco.colores.length], [5, 4, 254, 18]);
  const off = cargaStrimer(normalizarLuz({ efecto: 'apagado' }));
  assert.deepEqual([off.modo, off.colores.length], [0, 0]);
  assert.equal(cargaStrimer(normalizarLuz({ efecto: 'meteoro', colores: ['#ff0000', '#0000ff'] })).colores.length, 6);
});

test('audio: un solo ventilador, salida por nombre y volumen 0–1', async () => {
  const { normalizarAudio } = await import('./escena.mjs');
  assert.deepEqual(normalizarAudio(undefined), { ventilador: 0, salida: '', volumen: 1 });
  assert.deepEqual(normalizarAudio({ fan: 9, output: ' Altavoces\u0007 ', volume: 2 }, 7), { ventilador: 7, salida: 'Altavoces', volumen: 1 });
  assert.equal(normalizarEscena({ modo: 'secuencia', audio: { ventilador: 1, volumen: 0.333 } }).audio.volumen, 0.33);
});

test('Galahad II Trinity: ventiladores de arriba (0x85) y bomba (0x83)', () => {
  assert.equal(dispositivoCanonico('radiador'), 'superiores');
  assert.equal(dispositivoCanonico('pump'), 'bomba');
  const l = normalizarLuz({ efecto: 'fijo', color: '#0a0b0c', brillo: 3, velocidad: 1, dispositivos: { arriba: { efecto: 'arcoiris' } } });
  assert.equal(luzDispositivo(l, 'superiores').efecto, 'arcoiris');
  const v = cargaGalahad(luzDispositivo(l, 'bomba'), 'superiores');
  assert.equal(v.length, 20);
  assert.deepEqual(v.slice(0, 6), [3, 3, 1, 10, 11, 12], 'modo fijo, brillo, velocidad y el color en RGB');
  assert.deepEqual(v.slice(15), [0, 0, 0, 0, 24], 'dirección, encendido, origen propio, sin sincro con la bomba, 24 LED');
  const b = cargaGalahad(luzDispositivo(l, 'bomba'), 'bomba');
  assert.equal(b.length, 19); assert.equal(b[0], 2, 'los dos aros');
  const off = cargaGalahad(normalizarLuz({ efecto: 'apagado' }), 'superiores');
  assert.deepEqual([off[0], off[1], off[16]], [3, 0, 1], 'apagado: fijo, brillo 0 y la marca de apagado');
  assert.equal(cargaGalahad(normalizarLuz({ efecto: 'ola' }))[0], 7);
});

test('secuencia «cada x s»: el relevo a los segundos pedidos, desde el principio de la pieza en cada ventilador', () => {
  const e = normalizarEscena({ modo: 'secuencia', pieza: 'v1', duracion: 23.8, cada: 10, epoch: 0 });
  assert.equal(e.cada, 10);
  const quien = ahora => [1, 2, 3, 4, 5, 6, 7].filter(f => asignacion(e, f, ahora).tipo === 'pieza');
  assert.deepEqual(quien(9999), [1]);
  assert.deepEqual(quien(10000), [2], 'a los 10 s, aunque la pieza dure 23,8');
  assert.equal(asignacion(e, 2, 12000).t, 2, 'el 2 la empieza desde el principio');
  assert.equal(normalizarEscena({ modo: 'secuencia', cada: 'x' }).cada, 0, 'sin número: al acabar la pieza');
  assert.equal(normalizarEscena({ modo: 'secuencia', every: 99999 }).cada, 3600);
  const luz = normalizarLuz({ efecto: 'fijo', color: '#00ff00' });
  assert.equal(luzDe(luz, 2, e, 10500).brillo, 4, 'la luz sigue el relevo de cada x s');
  assert.equal(luzDe(luz, 1, e, 10500).brillo, 0);
});

test('mismo contenido: la luz o el audio no reinician el reloj; otra pieza, otro modo o cada x s sí', () => {
  const viva = normalizarEscena({ modo: 'secuencia', pieza: 'v1', epoch: 1793970000000, duracion: 23.8 });
  const deLaNube = normalizarEscena({ modo: 'secuencia', pieza: 'v1', epoch: 0, audio: { ventilador: 1 } });
  assert.equal(mismoContenido(deLaNube, viva), true, 'reloj a cero, sin duración y con otro audio: el mismo contenido');
  assert.equal(mismoContenido(normalizarEscena({ modo: 'secuencia', pieza: 'v2' }), viva), false, 'otra pieza');
  assert.equal(mismoContenido(normalizarEscena({ modo: 'secuencia', pieza: 'v1', cada: 10 }), viva), false, 'cada x s');
  assert.equal(mismoContenido(normalizarEscena({ modo: 'sincro', pieza: 'v1' }), viva), false, 'otro modo');
  assert.equal(mismoContenido(deLaNube, null), false);
});

// ── Inquilinos (PortAventuraNeXT, Carlos 10-nov-2026 14:51) ─────────────────────────────────────────
test('inquilinos: la figura sale (vacío, luz BLANCA) y llega otra (ocupado, luz ROJA)', () => {
  const e = normalizarEscena({ modo: 'pan', fans: { 2: [[0, 'once'], [1000, null], [3000, 'steve']], 1: [[0, null]] }, encendidos: [1], nombres: { once: 'Eleven' } }, 7);
  assert.equal(e.modo, 'inquilinos');
  assert.deepEqual(asignacion(e, 2, 500), { tipo: 'inquilino', figura: 'once', nombre: 'Eleven' });
  assert.deepEqual(asignacion(e, 2, 1500), { tipo: 'vacio' });
  assert.equal(asignacion(e, 2, 3500).figura, 'steve');
  assert.deepEqual(luzDe(normalizarLuz({ efecto: 'arcoiris' }), 2, e, 500).colores, [[255, 0, 0]]);
  assert.deepEqual(luzDe(normalizarLuz({ efecto: 'arcoiris' }), 2, e, 1500).colores, [[255, 255, 255]]);
  assert.equal(luzDe(null, 2, e, 1500).efecto, 'fijo');
  // el ventilador 1 del show: siempre rojo aunque esté vacío
  assert.deepEqual(asignacion(e, 1, 1500), { tipo: 'vacio' });
  assert.deepEqual(luzDe(null, 1, e, 1500).colores, [[255, 0, 0]]);
  // un ventilador sin línea de tiempo está vacío y en blanco
  assert.deepEqual(luzDe(null, 5, e, 0).colores, [[255, 255, 255]]);
});

test('inquilinos: ids de figura y ventiladores fuera de rango se descartan', () => {
  const e = normalizarEscena({ modo: 'inquilinos', fans: { 9: [[0, 'x']], 3: [[0, '<script>'], [5, 'ok-1']], a: [[0, 'y']] }, encendidos: [0, 1, 1, 8] }, 7);
  assert.deepEqual(Object.keys(e.inquilinos), ['3']);
  assert.deepEqual(e.inquilinos['3'], [[0, null], [5, 'ok-1']]);
  assert.deepEqual(e.encendidos, [1]);
  assert.equal(inquilinoEn(e, 3, 4), null);
  assert.equal(inquilinoEn(e, 3, 5), 'ok-1');
});

test('cacería en la sala: figura abatida camino del ventilador → estroboscópico ROJO 2 s, luego BLANCO con «DOWN»', async () => {
  const { caidoEn, STROBE_MS } = await import('./escena.mjs');
  const e = normalizarEscena({ modo: 'inquilinos', fans: { 3: [[0, 'will'], [1000, null]] }, caidos: { 3: [[1000, 'will']] }, nombres: { will: 'Will' }, encendidos: [1] }, 7);
  // antes del disparo: ocupado = rojo fijo, sin caído
  assert.equal(caidoEn(e, 3, 500), null);
  assert.deepEqual(luzDe(null, 3, e, 500).colores, [[255, 0, 0]]);
  // disparo a t=1000: fases de 250 ms rojo/apagado durante 2 s
  const fases = [1000, 1250, 1500, 1750, 2000, 2250, 2500, 2750].map(t => luzDe(null, 3, e, t));
  assert.deepEqual(fases.map(l => l.brillo), [4, 0, 4, 0, 4, 0, 4, 0]);
  assert.ok(fases.every(l => l.efecto === 'fijo' && l.colores[0].join() === '255,0,0'));
  // pasado el estroboscópico: blanco fijo, y la pantalla dice DOWN + nombre
  const despues = luzDe(null, 3, e, 1000 + STROBE_MS + 10);
  assert.deepEqual(despues.colores, [[255, 255, 255]]); assert.equal(despues.brillo, 4);
  assert.deepEqual(asignacion(e, 3, 1000 + STROBE_MS + 10), { tipo: 'caido', figura: 'will', nombre: 'Will' });
  // otro ventilador sin caídos: igual que antes; el 1 (encendido) sigue rojo
  assert.deepEqual(asignacion(e, 2, 3000), { tipo: 'vacio' });
  assert.deepEqual(luzDe(null, 1, e, 1500).colores, [[255, 0, 0]]);
});

test('cacería en la sala: si llega otro inquilino manda él; caídos inválidos se descartan; sin `caidos` nada cambia', () => {
  const e = normalizarEscena({ modo: 'inquilinos', fans: { 3: [[0, null], [5000, 'once']] }, caidos: { 3: [[1000, 'will'], [2000, '<x>']], 9: [[0, 'y']], 4: 'no' } }, 7);
  assert.deepEqual(Object.keys(e.caidos), ['3']); assert.equal(e.caidos['3'].length, 1);
  assert.equal(asignacion(e, 3, 6000).tipo, 'inquilino');
  assert.deepEqual(luzDe(null, 3, e, 6000).colores, [[255, 0, 0]]);
  assert.equal(luzDe(null, 3, e, 6000).brillo, 4);
  const viejo = normalizarEscena({ modo: 'inquilinos', fans: { 3: [[0, null]] } }, 7);
  assert.deepEqual(viejo.caidos, {});
  assert.deepEqual(asignacion(viejo, 3, 1000), { tipo: 'vacio' });
});
