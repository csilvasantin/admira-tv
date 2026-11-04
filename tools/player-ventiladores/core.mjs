// Piezas puras del puente: protocolo de la pantalla TL LCD y nombres de pantalla.
// Protocolo (UNI FAN TL LCD, USB 04FC:7393): informe HID de salida 0x02 de 512 bytes,
// cabecera de 11 [id, cmd, tamaño total 4 BE, nº de paquete 3 BE, longitud 2 BE] y
// 501 bytes de carga. Un fotograma es un JPEG 400×400 troceado en paquetes.
// Referencia: sgtaziz/lian-li-linux (MIT), crates/lianli-devices/src/tl_lcd.rs.

export const VID = 0x04fc, PID = 0x7393;
export const REPORT_ID = 0x02, PACKET_SIZE = 512, HEADER_LEN = 11;
export const MAX_PAYLOAD = PACKET_SIZE - HEADER_LEN; // 501
export const SIDE = 400;
export const CMD = { HANDSHAKE: 60, READ_SERIAL: 62, LCD_CONTROL: 64, WRITE_JPG: 0x41, WRITE_SYNC_JPG: 0x46 };
export const MODE = { SHOW_JPG: 1, SHOW_AVI: 3, APP_SYNC: 4, SETTING: 5 };

export function buildPacket(cmd, total, num, payload = new Uint8Array(0)) {
  const p = Buffer.alloc(PACKET_SIZE);
  const len = Math.min(payload.length, MAX_PAYLOAD);
  p[0] = REPORT_ID; p[1] = cmd;
  p.writeUInt32BE(total >>> 0, 2);
  p[6] = (num >> 16) & 255; p[7] = (num >> 8) & 255; p[8] = num & 255;
  p.writeUInt16BE(len, 9);
  if (len) Buffer.from(payload.buffer, payload.byteOffset, len).copy(p, HEADER_LEN);
  return p;
}

export function framePackets(jpeg, cmd = CMD.WRITE_SYNC_JPG) {
  if (!jpeg.length) return [buildPacket(cmd, 0, 0)];
  const out = [];
  for (let off = 0, n = 0; off < jpeg.length; off += MAX_PAYLOAD, n++) {
    out.push(buildPacket(cmd, jpeg.length, n, jpeg.subarray(off, off + MAX_PAYLOAD)));
  }
  return out;
}

export function isJpeg(buf) {
  return buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[buf.length - 2] === 0xff && buf[buf.length - 1] === 0xd9;
}

// Brillo 0–100 y giro 0/90/180/270 → carga del LCD_CONTROL en modo ajustes.
export function settingsPayload(brightness, degrees) {
  const rot = { 90: 1, 180: 2, 270: 3 }[degrees] || 0;
  return Uint8Array.from([MODE.SETTING, 0, 0, 0, Math.max(0, Math.min(100, brightness | 0)), 30, rot, 0, 0, 0, 0]);
}

// Respuesta de READ_SERIAL: 32 bytes de serie, luego puerto e índice en la cadena.
export function parseIdentity(resp) {
  const d = resp.subarray(HEADER_LEN);
  return { serial: Buffer.from(d.subarray(0, 32)).toString('utf8').replace(/\0+$/, ''), port: d[32] ?? 0, index: d[33] ?? 0 };
}

// Orden físico estable: puerto del controlador y posición en la cadena. Ventilador 1 = puerto 0, primero.
export function numberFans(fans) {
  return [...fans].sort((a, b) => a.port - b.port || a.index - b.index).map((f, i) => ({ ...f, n: i + 1 }));
}

// «espejo»: una pantalla para todo el grupo (los 7 ventiladores pintan lo mismo).
// «independiente»: una pantalla por ventilador, como manda el contrato (un ID por aparato).
// `ids` fija piezas concretas del Stock con el ?ids= del canal (en espejo, la clave "espejo").
export function playersFor(fans, cfg) {
  if (cfg.mode === 'independiente') {
    return fans.map(f => ({ screen: `${cfg.screenPrefix}-${f.n}`, fans: [f.n], ids: cfg.ids[String(f.n)] || [] }));
  }
  return [{ screen: cfg.screen, fans: fans.map(f => f.n), ids: cfg.ids.espejo || [] }];
}

export function canalUrl(cfg, screen, ids = []) {
  const u = new URL(cfg.canal);
  if (ids.length) u.searchParams.set('ids', ids.join(','));
  u.searchParams.set('embed', 'mupi');
  u.searchParams.set('clean', '1');
  u.searchParams.set('fit', 'screen');
  u.searchParams.set('screen', screen);
  if (cfg.circuit) u.searchParams.set('circuit', cfg.circuit);
  if (cfg.machine) u.searchParams.set('machine', cfg.machine);
  u.searchParams.set('muted', '1');
  return u.toString();
}

export const DEFAULTS = {
  mode: 'espejo',
  screen: 'metahuman-ventiladores',
  screenPrefix: 'metahuman-ventilador',
  circuit: 'metahuman-ventiladores',
  machine: 'METAHUMAN',
  canal: 'https://www.admira.tv/canal.html',
  fps: 25,
  quality: 80,
  brightness: null,          // null = no tocar lo que dejó L-Connect
  rotation: {},              // { "7": 270 } por número de ventilador; vacío = no tocar
  ids: {},                   // { "1": ["<id del Stock>"], … } o { "espejo": [...] }; vacío = playlist del canal
  healthPort: 4749,
  chrome: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  userAgentToken: 'AdmiraWindowsPlayer/tl-lcd-1.0'
};

export function mergeConfig(raw = {}) {
  const cfg = { ...DEFAULTS, ...raw, rotation: { ...DEFAULTS.rotation, ...(raw.rotation || {}) } };
  if (!['espejo', 'independiente'].includes(cfg.mode)) throw new Error(`modo desconocido: ${cfg.mode}`);
  // Mismo filtro que el canal (URL_IDS): letras, números y guiones; como mucho 12 por player.
  cfg.ids = Object.fromEntries(Object.entries(raw.ids || {}).map(([k, v]) => {
    const list = [].concat(v || []).map(String);
    const bad = list.find(id => !/^[A-Za-z0-9-]{1,80}$/.test(id));
    if (bad) throw new Error(`id del Stock inválido para ${k}: ${bad}`);
    return [k, list.slice(0, 12)];
  }));
  for (const k of ['screen', 'screenPrefix', 'circuit']) {
    if (cfg[k] && !/^[a-z0-9-]+$/i.test(cfg[k])) throw new Error(`${k} solo admite letras, números y guiones`);
  }
  cfg.fps = Math.max(1, Math.min(30, Number(cfg.fps) || DEFAULTS.fps));
  cfg.quality = Math.max(30, Math.min(95, Number(cfg.quality) || DEFAULTS.quality));
  return cfg;
}
