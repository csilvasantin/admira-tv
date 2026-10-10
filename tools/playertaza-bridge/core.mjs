export function missingConfig(c) {
  return ['bridgeKey', 'botToken', 'chat'].filter(k => !c[k] || k === 'chat' && !c.chat.id);
}

export function gifRpc(job, origin) {
  if (job.kind !== 'gif') throw new Error('Solo se admiten GIF');
  const bytes = Buffer.from(job.gif || '', 'base64');
  if (bytes.length < 13 || bytes.length > 40960 || !['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString())) throw new Error('GIF inválido');
  if (bytes.readUInt16LE(6) !== 32 || bytes.readUInt16LE(8) !== 16) throw new Error('El GIF debe medir 32×16');
  const url = new URL(job.contentUrl);
  if (url.origin !== new URL(origin).origin || url.pathname !== `/api/iphone/content/${job.id}.gif`) throw new Error('URL de contenido inválida');
  return { method: 'talPlayGif', params: { gifContent: { size: bytes.length, type: 'image/gif', url: url.href } } };
}

// HTTP 201 only acknowledges the command at the server. The SDK then waits
// for a device trace. A timeout (408) must never become a successful delivery.
export function deliveryResult(reply) {
  const code = Number(reply?.code);
  return code === 200 && !reply?.error
    ? { status: 'sent_to_bubble', message: 'CarlosGdG confirmó el RPC; comprobar LEDs con cámara' }
    : { status: code === 408 || code === 201 ? 'uncertain' : 'failed', message: `CarlosGdG: RPC ${Number.isFinite(code) ? code : 'sin respuesta'}` };
}
