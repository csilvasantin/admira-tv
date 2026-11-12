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
