// LCD counter follows effective slots (one H/V pair = one content).
export function playlistCounter(onAir, slots, { muted = false } = {}) {
  if (!muted || onAir?.source !== 'playlist') return null;
  const total = slots.length;
  const index = slots.findIndex(slot => String(slot.landscape?.stockId || slot.landscape?.id || '') === onAir.id);
  const position = index >= 0 ? index + 1 : 0;
  return { text: `${position}/${total}`, color: '#ff6565' };
}

export function paintPlaylistCounter(canvas, counter) {
  if (!counter) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.save();
  ctx.font = 'bold 40px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const width = Math.ceil(ctx.measureText(counter.text).width) + 28;
  const right = canvas.width - 14;
  const top = 14;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
  ctx.fillRect(right - width, top, width, 58);
  ctx.fillStyle = counter.color;
  ctx.fillText(counter.text, right - 14, top + 29);
  ctx.restore();
}
