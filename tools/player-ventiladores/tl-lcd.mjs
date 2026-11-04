// Acceso USB a las pantallas de los ventiladores UNI FAN TL LCD (una interfaz HID por ventilador).
import { createRequire } from 'node:module';
import { VID, PID, CMD, buildPacket, framePackets, parseIdentity, settingsPayload } from './core.mjs';

const HID = createRequire(import.meta.url)('node-hid');

export class TlLcd {
  constructor(dev, info) {
    this.dev = dev; this.path = info.path;
    this.port = 0; this.index = 0; this.n = 0;
    this.busy = false; this.sent = 0; this.errors = 0; this.lastError = '';
  }

  async ask(cmd, payload) {
    await this.dev.write(buildPacket(cmd, payload ? payload.length : 0, 0, payload));
    const r = await this.dev.read(3000);
    if (!r || !r.length) throw new Error(`sin respuesta al comando ${cmd}`);
    return r;
  }

  // Solo lectura: nunca reescribe la serie del ventilador (eso lo gestiona L-Connect).
  async identify() {
    const id = parseIdentity(await this.ask(CMD.READ_SERIAL));
    this.port = id.port; this.index = id.index;
    return id;
  }

  async handshake() {
    const d = (await this.ask(CMD.HANDSHAKE)).subarray(11);
    return { mode: d[0], frame: d.readUInt16BE(1) };
  }

  async settings(brightness, degrees) {
    await this.ask(CMD.LCD_CONTROL, settingsPayload(brightness, degrees));
  }

  // Streaming sin acuse (lo mismo que usa L-Connect en modo sincronizado).
  async frame(jpeg) {
    this.busy = true;
    try {
      for (const p of framePackets(jpeg)) await this.dev.write(p);
      this.sent++;
    } catch (e) {
      this.errors++; this.lastError = String(e.message || e);
      throw e;
    } finally { this.busy = false; }
  }

  close() { try { this.dev.close(); } catch {} }
}

// Vigilancia: RPM de cada ventilador desde el controlador UNI FAN TL (USB 0416:7372,
// informe 0x01 de 64 bytes, saludo 0xA1). Solo lectura: nunca fija velocidades.
export async function readRpm() {
  const info = (await HID.devicesAsync(0x0416, 0x7372)).find(d => d.usagePage === 0xff1b);
  if (!info) return null;
  const dev = await HID.HIDAsync.open(info.path, { nonExclusive: true });
  try {
    const p = Buffer.alloc(64); p[0] = 0x01; p[1] = 0xa1;
    await dev.write(p);
    for (let i = 0; i < 5; i++) {
      const r = await dev.read(1000);
      if (!r || !r.length) return null;
      if (r[1] !== 0xa1) continue;
      const out = [];
      for (let k = 0; k < r[5] / 3; k++) {
        const b = r[6 + k * 3];
        if (b & 0x80) out.push({ port: (b >> 4) & 3, index: b & 15, rpm: r.readUInt16BE(7 + k * 3) });
      }
      return out;
    }
    return null;
  } finally { try { dev.close(); } catch {} }
}

export async function openFans() {
  const infos = (await HID.devicesAsync(VID, PID)).filter(d => d.interface === 0 || d.interface === -1);
  const fans = [];
  for (const info of infos) {
    let dev;
    try {
      dev = await HID.HIDAsync.open(info.path, { nonExclusive: true });
      const fan = new TlLcd(dev, info);
      await fan.identify();
      fans.push(fan);
    } catch (e) {
      try { dev?.close(); } catch {}
      console.error(JSON.stringify({ at: new Date().toISOString(), state: 'fan_open_failed', error: String(e.message || e) }));
    }
  }
  fans.sort((a, b) => a.port - b.port || a.index - b.index).forEach((f, i) => { f.n = i + 1; });
  return fans;
}
