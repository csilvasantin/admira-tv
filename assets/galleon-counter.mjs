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

export function playlistTiming(onAir, slot, { muted = false } = {}) {
  if (!muted || onAir?.source !== 'playlist' || !slot || slot.index !== onAir.index) return null;
  const duration = slot.slot?.seconds;
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(slot.offsetMs)) return null;
  const format = seconds => {
    const value = Math.max(0, Math.ceil(seconds));
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor(value / 60) % 60;
    const secondsPart = String(value % 60).padStart(2, '0');
    return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${secondsPart}` : `${minutes}:${secondsPart}`;
  };
  return { duration: format(duration), remaining: format(duration - Math.max(0, slot.offsetMs) / 1000) };
}

export function paintPlaylistTiming(canvas, timing) {
  if (!timing) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.save();
  ctx.font = 'bold 40px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (const [text, top] of [[timing.duration, 14], ['−' + timing.remaining, canvas.height - 72]]) {
    const width = Math.ceil(ctx.measureText(text).width) + 28;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
    ctx.fillRect(14, top, width, 58);
    ctx.fillStyle = '#ff6565';
    ctx.fillText(text, 28, top + 29);
  }
  ctx.restore();
}
