export const GALLEON_LCD = Object.freeze({ width: 720, height: 384 });
export const GALLEON_KEYS = Object.freeze({ columns: 3, rows: 4, size: 160 });

export function containFrame(sourceWidth, sourceHeight, width, height) {
  if (![sourceWidth, sourceHeight, width, height].every(value => Number.isFinite(value) && value > 0)) {
    throw new RangeError('Las dimensiones de origen y destino deben ser positivas.');
  }
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const drawnWidth = Math.round(sourceWidth * scale);
  const drawnHeight = Math.round(sourceHeight * scale);
  return {
    x: Math.floor((width - drawnWidth) / 2),
    y: Math.floor((height - drawnHeight) / 2),
    width: drawnWidth,
    height: drawnHeight,
  };
}

function paintFrame(canvas, source, width, height) {
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No se pudo abrir el lienzo del Galleon.');
  context.fillStyle = '#000';
  context.fillRect(0, 0, width, height);
  if (!source) return;
  const sourceWidth = source.videoWidth || source.naturalWidth || source.width;
  const sourceHeight = source.videoHeight || source.naturalHeight || source.height;
  if (!sourceWidth || !sourceHeight) return;
  const frame = containFrame(sourceWidth, sourceHeight, width, height);
  context.drawImage(source, frame.x, frame.y, frame.width, frame.height);
}

/** Compone primero la superficie vertical para que las 12 teclas compartan el mismo fotograma. */
export function paintGalleon({ lcd, mosaic, keys }, { landscape, portrait }) {
  const { columns, rows, size } = GALLEON_KEYS;
  if (keys.length !== columns * rows) throw new RangeError('El Galleon requiere 12 teclas LCD.');
  paintFrame(lcd, landscape, GALLEON_LCD.width, GALLEON_LCD.height);
  paintFrame(mosaic, portrait, columns * size, rows * size);

  keys.forEach((key, index) => {
    if (key.width !== size) key.width = size;
    if (key.height !== size) key.height = size;
    const context = key.getContext('2d');
    if (!context) throw new Error('No se pudo abrir el lienzo de una tecla del Galleon.');
    const column = index % columns;
    const row = Math.floor(index / columns);
    context.drawImage(mosaic, column * size, row * size, size, size, 0, 0, size, size);
  });
}

/** Sólo la pantalla superior: el player horizontal. Las teclas van aparte (paintKeys), no se repintan a cada fotograma. */
export function paintLcd(lcd, landscape) {
  paintFrame(lcd, landscape, GALLEON_LCD.width, GALLEON_LCD.height);
}

/** Troceo de un título en hasta `lines` líneas que quepan en `width` (con measureText si el lienzo lo da). */
export function wrapTitle(context, title, width, lines = 2) {
  const words = String(title || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const fits = text => typeof context?.measureText === 'function' ? context.measureText(text).width <= width : text.length <= 16;
  const out = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? line + ' ' + word : word;
    if (fits(candidate)) { line = candidate; continue; }
    if (line) out.push(line);
    line = word;
    if (out.length === lines) break;
  }
  if (line && out.length < lines) out.push(line);
  if (out.length > lines) out.length = lines;
  if (words.length && out.length === lines) {
    const used = out.join(' ').split(' ').length;
    if (used < words.length) { let last = out[lines - 1]; while (last && !fits(last + '…')) last = last.replace(/\s*\S+$/, ''); out[lines - 1] = (last || out[lines - 1].slice(0, 8)) + '…'; }
  }
  return out;
}

/**
 * Una tecla del navegador (160×160): el previo de la pieza arriba (16:9, 160×90), el título debajo en dos líneas, el
 * desplazamiento («−3», «+1») y la posición en la playlist («4/12»). Sin pieza (`entry` null) la tecla queda apagada.
 */
export function paintKeyTile(canvas, entry, { muted = false } = {}) {
  const { size } = GALLEON_KEYS;
  if (canvas.width !== size) canvas.width = size;
  if (canvas.height !== size) canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No se pudo abrir el lienzo de una tecla del Galleon.');
  context.fillStyle = '#000';
  context.fillRect(0, 0, size, size);
  if (!entry) return;
  const previewHeight = 90;
  if (entry.image) {
    const sourceWidth = entry.image.videoWidth || entry.image.naturalWidth || entry.image.width;
    const sourceHeight = entry.image.videoHeight || entry.image.naturalHeight || entry.image.height;
    if (sourceWidth && sourceHeight) {
      const frame = containFrame(sourceWidth, sourceHeight, size, previewHeight);
      context.drawImage(entry.image, frame.x, frame.y, frame.width, frame.height);
    }
  } else {
    context.fillStyle = '#1a1a1a';
    context.fillRect(0, 0, size, previewHeight);
  }
  context.fillStyle = entry.next ? '#ffd166' : '#8ecae6';
  context.font = 'bold 15px system-ui, sans-serif';
  context.textBaseline = 'top';
  context.textAlign = 'left';
  context.fillText(String(entry.offset > 0 ? '+' + entry.offset : entry.offset), 6, previewHeight + 6);
  context.textAlign = 'right';
  if (muted) {
    // A large central badge is readable on the physical 160px key display.
    const counter = String(entry.position) + '/' + String(entry.total);
    context.font = 'bold 44px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = 'rgba(0, 0, 0, 0.9)';
    context.fillRect(3, 18, size - 6, 58);
    context.fillStyle = '#ffffff';
    context.fillText(counter, size / 2, 47, size - 14);
  }
  context.textBaseline = 'top';
  context.textAlign = 'left';
  context.fillStyle = '#fff';
  context.font = '14px system-ui, sans-serif';
  const lines = wrapTitle(context, entry.title, size - 12, 2);
  lines.forEach((line, index) => context.fillText(line, 6, previewHeight + 26 + index * 17));
}

/** Pinta las 12 teclas (orden físico) y compone el mosaico 480×640 con ellas, para el adaptador USB y el gemelo. */
export function paintKeys({ mosaic, keys }, entries, options = {}) {
  const { columns, rows, size } = GALLEON_KEYS;
  if (keys.length !== columns * rows) throw new RangeError('El Galleon requiere 12 teclas LCD.');
  if (mosaic.width !== columns * size) mosaic.width = columns * size;
  if (mosaic.height !== rows * size) mosaic.height = rows * size;
  const context = mosaic.getContext('2d');
  if (!context) throw new Error('No se pudo abrir el lienzo del Galleon.');
  context.fillStyle = '#000';
  context.fillRect(0, 0, mosaic.width, mosaic.height);
  keys.forEach((key, index) => {
    paintKeyTile(key, entries?.[index] ?? null, options);
    context.drawImage(key, (index % columns) * size, Math.floor(index / columns) * size, size, size);
  });
}
