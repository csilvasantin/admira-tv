function rgbToIndex(w, h, rgb) {
  const idx = new Uint8Array(w * h);
  const n = Math.min(w * h, Math.floor(rgb.length / 3));
  for (let i = 0; i < n; i++) {
    const r = rgb[i * 3] & 255, g = rgb[i * 3 + 1] & 255, b = rgb[i * 3 + 2] & 255;
    idx[i] = r >> 5 << 5 | g >> 5 << 2 | b >> 6;
  }
  return idx;
}

function lzwIndex(idx) {
  const CLEAR = 256, EOI = 257;
  const bits = [];
  const put = (code, nbits) => {
    for (let i = 0; i < nbits; i++) bits.push(code >> i & 1);
  };
  put(CLEAR, 9);
  let run = 0;
  for (let i = 0; i < idx.length; i++) {
    put(idx[i], 9);
    run++;
    if (run >= 100) {
      put(CLEAR, 9);
      run = 0;
    }
  }
  put(EOI, 9);
  while (bits.length % 8) bits.push(0);
  const lzw = new Uint8Array(bits.length / 8);
  for (let i = 0; i < lzw.length; i++) {
    let v = 0;
    for (let b = 0; b < 8; b++) v |= bits[i * 8 + b] << b;
    lzw[i] = v;
  }
  return lzw;
}

function palette332() {
  const pal = new Uint8Array(768);
  for (let i = 0; i < 256; i++) {
    pal[i * 3] = (i >> 5 & 7) * 36;
    pal[i * 3 + 1] = (i >> 2 & 7) * 36;
    pal[i * 3 + 2] = (i & 3) * 85;
  }
  return pal;
}

function pushLzwBlocks(parts, lzw) {
  for (let i = 0; i < lzw.length; i += 255) {
    const chunk = lzw.subarray(i, Math.min(i + 255, lzw.length));
    parts.push(Uint8Array.of(chunk.length), chunk);
  }
}

export function gifFromRgb(w, h, rgb) {
  const pal = palette332();
  const idx = rgbToIndex(w, h, rgb);
  const u16 = v => Uint8Array.of(v & 255, v >> 8 & 255);
  const lzw = lzwIndex(idx);
  const parts = [
    new TextEncoder().encode("GIF89a"),
    u16(w),
    u16(h),
    Uint8Array.of(247, 0, 0),
    pal,
    Uint8Array.of(33, 249, 4, 0, 0, 0, 0, 0),
    Uint8Array.of(44, 0, 0, 0, 0),
    u16(w),
    u16(h),
    Uint8Array.of(0),
    Uint8Array.of(8)
  ];
  pushLzwBlocks(parts, lzw);
  parts.push(Uint8Array.of(0, 59));
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Multi-frame GIF89a (loop forever). frames: [{ rgb, delayCs }] delay in 1/100 s. */
export function gifFromFrames(w, h, frames) {
  const list = (frames || []).filter((f) => f && f.rgb);
  if (!list.length) return gifFromRgb(w, h, new Uint8Array(w * h * 3));
  const u16 = v => Uint8Array.of(v & 255, v >> 8 & 255);
  const pal = palette332();
  const parts = [
    new TextEncoder().encode("GIF89a"),
    u16(w),
    u16(h),
    Uint8Array.of(247, 0, 0),
    pal,
    Uint8Array.of(0x21, 0xFF, 0x0B),
    new TextEncoder().encode("NETSCAPE2.0"),
    Uint8Array.of(0x03, 0x01, 0x00, 0x00, 0x00)
  ];
  for (const fr of list) {
    const delay = Math.max(2, Math.min(200, Number(fr.delayCs) || 20));
    const lzw = lzwIndex(rgbToIndex(w, h, fr.rgb));
    parts.push(
      Uint8Array.of(0x21, 0xF9, 0x04, 0x04, delay & 255, delay >> 8 & 255, 0, 0),
      Uint8Array.of(0x2C, 0, 0, 0, 0),
      u16(w),
      u16(h),
      Uint8Array.of(0),
      Uint8Array.of(8)
    );
    pushLzwBlocks(parts, lzw);
    parts.push(Uint8Array.of(0));
  }
  parts.push(Uint8Array.of(0x3B));
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

