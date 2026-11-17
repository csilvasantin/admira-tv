'use strict';
// Piezas puras del adaptador USB del Corsair Galleon 100 SD (encargo #7569): geometría, troceado del mosaico en
// las 12 teclas, el gesto de salida, los toques del navegador y las dos ruedas (volumen y transporte). Sin dependencias, para poder probarlas sin teclado.

const LCD = Object.freeze({ width: 720, height: 384 });
const KEYS = Object.freeze({ columns: 3, rows: 4, size: 160 });
const MOSAIC = Object.freeze({ width: KEYS.columns * KEYS.size, height: KEYS.rows * KEYS.size });

/** JPEG o PNG en data URL → bytes; cualquier otra cosa (p. ej. «data:,» de un lienzo vacío) → null. */
function dataUrlToBuffer(value) {
  const match = /^data:image\/(?:jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(String(value || ''));
  return match ? Buffer.from(match[1], 'base64') : null;
}

/** Trocea un mosaico RGB (480×640) en 12 teclas de 160×160 en el orden físico (fila a fila, de izquierda a derecha). */
function keyTiles(raw, { columns = KEYS.columns, rows = KEYS.rows, size = KEYS.size, channels = 3 } = {}) {
  const width = columns * size, rowBytes = width * channels, tileRow = size * channels;
  if (!Buffer.isBuffer(raw) || raw.length !== rowBytes * rows * size) {
    throw new RangeError('El mosaico debe medir ' + width + '×' + rows * size + ' con ' + channels + ' canales.');
  }
  const tiles = [];
  for (let index = 0; index < columns * rows; index++) {
    const column = index % columns, row = Math.floor(index / columns);
    const tile = Buffer.alloc(size * tileRow);
    for (let y = 0; y < size; y++) {
      const from = (row * size + y) * rowBytes + column * tileRow;
      raw.copy(tile, y * tileRow, from, from + tileRow);
    }
    tiles.push(tile);
  }
  return tiles;
}

/**
 * Gesto de salida: mantener la tecla 12 (índice 11) un segundo devuelve el teclado a Elgato. Un toque breve no
 * hace nada: las teclas son pantalla de contenido y no deben reaccionar a un roce.
 */
function createExitGesture(onExit, { index = 11, delay = 1000, onTap = null, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let pressedAt = null, timer = null;
  return (event, control) => {
    if (control?.type !== 'button' || control.index !== index) return false;
    if (event === 'down' && pressedAt === null) {
      pressedAt = now();
      timer = setTimer(() => { timer = null; pressedAt = null; onExit(); }, delay);
    }
    if (event === 'up' && pressedAt !== null) {
      // Soltada antes del segundo: un toque. Desde el navegador (16-nov-2026) el toque también salta de pieza (onTap).
      if (timer !== null) { clearTimer(timer); timer = null; if (typeof onTap === 'function') onTap(index); }
      pressedAt = null;
    }
    return true;
  };
}

/**
 * Toque en una tecla del navegador (Carlos, 16-nov-2026): pulsar y soltar una tecla (antes de `maxHold` ms) salta a la
 * pieza que enseña. Una pulsación larga no salta (no es un toque). Las ruedas no pasan por aquí.
 */
function createKeyTaps(onTap, { maxHold = 800, now = Date.now } = {}) {
  const pressed = new Map();
  return (event, control) => {
    if (control?.type !== 'button') return false;
    if (event === 'down') pressed.set(control.index, now());
    else if (event === 'up') {
      const since = pressed.get(control.index);
      pressed.delete(control.index);
      if (since !== undefined && now() - since < maxHold) onTap(control.index);
    }
    return true;
  };
}

/** Volumen entre 0 y 1, redondeado a centésimas (los diales van a saltos de 5 %). */
const clampVolume = value => Math.min(1, Math.max(0, Math.round((Number(value) || 0) * 100) / 100));

/**
 * Rueda de volumen (encargo de Carlos, 16-nov-2026): girar el dial IZQUIERDO (`index` 0) sube o baja el volumen del
 * player (`step` por muesca; el teclado manda ±1 por muesca, más si se gira deprisa) y pulsarlo silencia o devuelve
 * el sonido. Girar con el sonido silenciado lo recupera. El otro dial y las teclas no intervienen. `onChange` recibe
 * el estado nuevo en cada cambio; `handler.state()` lo devuelve en cualquier momento.
 */
function createVolumeControl(onChange, { volume = 0.5, muted = false, step = 0.05, index = 0 } = {}) {
  const state = { volume: clampVolume(volume), muted: Boolean(muted) };
  const handler = (event, control, value) => {
    if (control?.type !== 'encoder' || control.index !== index) return false;
    if (event === 'rotate') {
      const notches = Math.trunc(Number(value) || 0);
      if (notches === 0) return true;
      state.volume = clampVolume(state.volume + notches * step);
      if (state.volume > 0) state.muted = false;
    } else if (event === 'down') {
      state.muted = !state.muted;
    } else {
      return true;
    }
    onChange({ ...state });
    return true;
  };
  handler.state = () => ({ ...state });
  return handler;
}

/**
 * Rueda de transporte (Carlos, 16-nov-2026): el dial DERECHO (`index` 1). Pulsarlo pausa o reanuda el vídeo; girarlo a
 * la derecha pasa a la pieza siguiente y a la izquierda a la anterior. Un giro manda varias muescas seguidas: sólo se
 * atiende una orden cada `cooldown` ms para no saltar tres piezas de golpe. `onAction` recibe 'toggle' | 'next' | 'prev'.
 */
function createTransportControl(onAction, { index = 1, cooldown = 350, now = Date.now } = {}) {
  let lastRotate = -Infinity;
  return (event, control, value) => {
    if (control?.type !== 'encoder' || control.index !== index) return false;
    if (event === 'down') onAction('toggle');
    else if (event === 'rotate') {
      const notches = Math.trunc(Number(value) || 0);
      if (notches === 0 || now() - lastRotate < cooldown) return true;
      lastRotate = now();
      onAction(notches > 0 ? 'next' : 'prev');
    }
    return true;
  };
}

/** Anillo del dial de transporte: azul entero en marcha, ámbar entero en pausa (otro color que el volumen, a simple vista). */
function transportRing({ paused = false } = {}, steps = 4) {
  const colors = [];
  for (let index = 0; index < steps; index++) colors.push(...(paused ? [200, 110, 0] : [0, 60, 200]));
  return colors;
}

/**
 * Colores del anillo de LEDs del dial de volumen (RGB por LED, `steps` LEDs): tantos LEDs verdes como volumen hay; en
 * silencio, todo el anillo en rojo tenue. Así se ve el nivel sin mirar ninguna pantalla.
 */
function ringColors({ volume = 0, muted = false } = {}, steps = 4) {
  const lit = muted ? 0 : Math.round(clampVolume(volume) * steps);
  const colors = [];
  for (let index = 0; index < steps; index++) colors.push(...(muted ? [90, 0, 0] : index < lit ? [0, 150, 60] : [6, 6, 6]));
  return colors;
}

/** Título sin los sufijos de formato («· Adaptación · 16:9 · Admira», «· 9:16»…), como la familia de la pieza en la página. */
const FORMAT_SUFFIX = /\s*(?:·|-|–|—|\|)\s*(?:admira|adaptaci[oó]n|subt[ií]tulos(?: [a-z]{2})?|16:9|9:16|4:3|3:4|horizontal|vertical|landscape|portrait|apaisad[oa]|formato[- ]altern[oa]|locuci[oó]n(?: [a-z]{2})?)\s*$/i;
function cleanTitle(title) {
  // Fuera los hashtags del título (los vídeos importados del Stock los traen: «Best Songs Of 1986 #oldsong #80smusic»).
  let text = String(title || '').replace(/(^|\s)#[^\s#]+/g, ' ').replace(/\s+/g, ' ').trim(), previous;
  do { previous = text; text = text.replace(FORMAT_SUFFIX, ''); } while (text !== previous);
  return text.trim();
}

/**
 * Lo que enseña el reloj LaMetric (Carlos, 16-nov-2026): el título de la pieza en antena, sin sufijos de formato, con
 * «PAUSA ·» delante si el transporte está en pausa; nada (cadena vacía) cuando el teclado no emite.
 */
function lametricText(onAir, { paused = false, connected = true } = {}) {
  const title = cleanTitle(onAir?.title);
  if (!connected || !title) return '';
  const { index, total } = onAir;
  const position = Number.isInteger(index) && Number.isInteger(total) && index >= 0 && index < total
    ? `${index + 1}/${total} · ` : '';
  return position + (paused ? 'PAUSA · ' : '') + title.slice(0, 120);
}

/**
 * Pieza nueva en la playlist (Carlos, 16-nov-2026): parpadeo de recreativa en los anillos de los dos diales. Para el
 * fotograma `frame` (cada ~80 ms) devuelve los colores de un anillo: los LEDs van rotando en magenta, cian, amarillo y
 * verde, y en los fotogramas impares se apagan a medias para que titile. `steps` LEDs por anillo.
 */
const ARCADE = [[255, 0, 180], [0, 220, 255], [255, 220, 0], [40, 255, 60]];
function arcadeFlicker(frame, steps = 4) {
  const colors = [];
  for (let index = 0; index < steps; index++) {
    const [r, g, b] = ARCADE[(index + frame) % ARCADE.length];
    const dim = frame % 2 === 1 && (index + frame) % 2 === 0 ? 0.15 : 1;
    colors.push(Math.round(r * dim), Math.round(g * dim), Math.round(b * dim));
  }
  return colors;
}

/**
 * Jingle de recreativa de los 80 (onda cuadrada, 8 bits de espíritu): arpegio ascendente C5·E5·G5·C6 con un «coin»
 * final, como WAV PCM 16 bits mono a 22 050 Hz (~0,9 s). Se escribe a disco una vez y se reproduce con afplay.
 */
function arcadeJingle({ rate = 22050 } = {}) {
  const notes = [[523.25, 0.09], [659.25, 0.09], [783.99, 0.09], [1046.5, 0.16], [0, 0.04], [1318.5, 0.07], [1567.98, 0.22]];
  const lengths = notes.map(([, seconds]) => Math.round(seconds * rate));
  const pcm = Buffer.alloc(lengths.reduce((sum, length) => sum + length, 0) * 2);
  let at = 0;
  for (const [index, [frequency]] of notes.entries()) {
    const length = lengths[index];
    for (let i = 0; i < length; i++, at++) {
      if (!frequency) continue;
      const t = i / rate, envelope = Math.min(1, (length - i) / (rate * 0.03)) * 0.5; // caída corta al final de cada nota
      const square = Math.sin(2 * Math.PI * frequency * t) >= 0 ? 1 : -1;
      pcm.writeInt16LE(Math.round(square * envelope * 32767), at * 2);
    }
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** Piezas que han entrado en la playlist respecto a la lista anterior (null = primera lectura: nada que celebrar). */
function newPieces(previous, current) {
  if (!Array.isArray(current)) return [];
  if (!previous) return [];
  const known = new Set(previous);
  return current.filter(id => !known.has(id));
}

module.exports = { LCD, KEYS, MOSAIC, dataUrlToBuffer, keyTiles, createExitGesture, createKeyTaps, createVolumeControl, createTransportControl, ringColors, transportRing, clampVolume, cleanTitle, lametricText, arcadeFlicker, arcadeJingle, newPieces };
