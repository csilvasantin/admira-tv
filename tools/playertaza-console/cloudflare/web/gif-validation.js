// Structural validation before forwarding a GIF to the manufacturer's API.
// Preserves the original bytes and animation; it does not re-encode frames.
export function inspectGif(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const bad = message => { throw new Error(message); };
  if (bytes.length > 40960) bad('El GIF supera los 40 KB admitidos por la taza.');
  if (bytes.length < 14) bad('GIF incompleto.');
  const signature = new TextDecoder().decode(bytes.subarray(0, 6));
  if (!['GIF87a', 'GIF89a'].includes(signature)) bad('El archivo no es un GIF.');
  const u16 = offset => bytes[offset] | bytes[offset + 1] << 8;
  if (u16(6) !== 32 || u16(8) !== 16) bad('El GIF debe medir exactamente 32×16 píxeles.');
  let offset = 13, frames = 0, durationMs = 0, delay = 0;
  const take = count => { if (offset + count > bytes.length) bad('GIF truncado.'); const start = offset; offset += count; return start; };
  if (bytes[10] & 0x80) take(3 * 2 ** ((bytes[10] & 7) + 1));
  const blocks = () => { let count; do { count = bytes[take(1)]; take(count); } while (count); };
  while (offset < bytes.length) {
    const marker = bytes[take(1)];
    if (marker === 0x3b) {
      if (!frames || offset !== bytes.length) bad('GIF sin fotogramas o con datos adicionales.');
      return { width: 32, height: 16, size: bytes.length, frames, animated: frames > 1, durationMs };
    }
    if (marker === 0x21) {
      const label = bytes[take(1)];
      if (label === 0xf9) {
        if (bytes[take(1)] !== 4) bad('Control de animación no válido.');
        const control = take(4); delay = u16(control + 1) * 10;
        if (bytes[take(1)] !== 0) bad('Control de animación incompleto.');
      } else blocks();
    } else if (marker === 0x2c) {
      const desc = take(9), x = u16(desc), y = u16(desc + 2), width = u16(desc + 4), height = u16(desc + 6);
      if (!width || !height || x + width > 32 || y + height > 16) bad('Fotograma fuera de la pantalla de 32×16.');
      const localPalette = bytes[desc + 8];
      if (localPalette & 0x80) take(3 * 2 ** ((localPalette & 7) + 1));
      else if (!(bytes[10] & 0x80)) bad('GIF sin paleta de colores.');
      const codeSize = bytes[take(1)];
      if (codeSize < 2 || codeSize > 8) bad('Compresión GIF no válida.');
      if (bytes[offset] === 0) bad('Fotograma vacío.');
      blocks(); frames++; durationMs += delay; delay = 0;
    } else bad('Bloque GIF no reconocido.');
  }
  bad('Falta el cierre del GIF.');
}
export function gifCommand(bytes, contentUrl) {
  const info = inspectGif(bytes);
  const url = new URL(contentUrl);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('La taza necesita una URL HTTPS sin credenciales.');
  return { method: 'talPlayGif', params: { gifContent: { size: info.size, type: 'image/gif', url: url.href } } };
}
