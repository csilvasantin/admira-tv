'use strict';
// Piezas puras del adaptador USB del Corsair Galleon 100 SD (encargo #7569): geometría, troceado del mosaico en
// las 12 teclas y el gesto de salida. Sin dependencias, para poder probarlas sin teclado.

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
function createExitGesture(onExit, { index = 11, delay = 1000, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let pressedAt = null, timer = null;
  return (event, control) => {
    if (control?.type !== 'button' || control.index !== index) return false;
    if (event === 'down' && pressedAt === null) {
      pressedAt = now();
      timer = setTimer(() => { timer = null; pressedAt = null; onExit(); }, delay);
    }
    if (event === 'up' && pressedAt !== null) {
      if (timer !== null) { clearTimer(timer); timer = null; }
      pressedAt = null;
    }
    return true;
  };
}

module.exports = { LCD, KEYS, MOSAIC, dataUrlToBuffer, keyTiles, createExitGesture };
