// Acceso USB a las pantallas de los ventiladores UNI FAN TL LCD (una interfaz HID por ventilador).
import { createRequire } from 'node:module';
import { VID, PID, CMD, buildPacket, framePackets, parseIdentity, settingsPayload } from './core.mjs';
import { cargaLuz } from './escena.mjs';

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

// Controlador UNI FAN TL (USB 0416:7372): informe 0x01 de 64 bytes [0x01, cmd, 0, 0, 0, longitud, datos…].
// Se usa para leer RPM (saludo 0xA1) y para la iluminación. Nunca fija velocidades.
const TL = { SALUDO: 0xa1, LUZ_VENTILADOR: 0xa3, GRUPO: 0xad, LUZ_GRUPO: 0xb0 };

export class Controlador {
  static async abrir() {
    const info = (await HID.devicesAsync(0x0416, 0x7372)).find(d => d.usagePage === 0xff1b);
    return info ? new Controlador(await HID.HIDAsync.open(info.path, { nonExclusive: true })) : null;
  }
  constructor(dev) { this.dev = dev; this.cola = Promise.resolve(); this.gruposListos = new Set(); }

  // Las órdenes van en fila y cada una espera su respuesta: así no se cruzan las lecturas.
  orden(cmd, datos = [], espera = 150) {
    const p = this.cola.then(() => this.enviar(cmd, datos, espera));
    this.cola = p.catch(() => {});
    return p;
  }
  async enviar(cmd, datos, espera) {
    const p = Buffer.alloc(64); p[0] = 0x01; p[1] = cmd; p[5] = datos.length;
    Buffer.from(datos).copy(p, 6);
    await this.dev.write(p);
    for (let i = 0; i < 5; i++) {
      const r = await this.dev.read(espera);
      if (!r || !r.length) return null;
      if (r[1] === cmd) return r;
    }
    return null;
  }

  async rpm() {
    const r = await this.orden(TL.SALUDO, [], 1000);
    if (!r) return null;
    const out = [];
    for (let k = 0; k < r[5] / 3; k++) {
      const b = r[6 + k * 3];
      if (b & 0x80) out.push({ port: (b >> 4) & 3, index: b & 15, rpm: r.readUInt16BE(7 + k * 3) });
    }
    return out;
  }

  luzVentilador(port, index, luz) {
    return this.orden(TL.LUZ_VENTILADOR, cargaLuz([port << 4, (port << 4) | (index & 15)], luz));
  }

  // «respirar» solo existe como efecto de grupo: dos grupos por puerto (LED de arriba y de abajo),
  // los mismos que da de alta L-Connect al arrancar.
  async luzPuerto(port, ventiladores, luz) {
    const base = port * 8;
    if (!this.gruposListos.has(port)) {
      const lista = Array.from({ length: ventiladores }, (_, i) => i);
      await this.orden(TL.GRUPO, [base, ventiladores, ...lista.map(i => 0x80 | (port << 4) | i)]);
      await this.orden(TL.GRUPO, [base + 1, ventiladores, ...lista.map(i => 0x40 | (port << 4) | i)]);
      this.gruposListos.add(port);
    }
    await this.orden(TL.LUZ_GRUPO, cargaLuz([0, base], luz));
    await this.orden(TL.LUZ_GRUPO, cargaLuz([0, base + 1], luz));
  }

  close() { try { this.dev.close(); } catch {} }
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
