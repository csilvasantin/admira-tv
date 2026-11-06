// AIO Lian Li Galahad II Trinity (USB 0416:7373, interfaz de la página 0xFF1B): la luz de los ventiladores del radiador
// (los de arriba, sin pantalla) y la de la bomba, y sus RPM. Informe 0x01 de 64 bytes: [0x01, orden, 0, 0, 0, longitud,
// datos…]. Solo luz y lectura: el puente nunca cambia la velocidad de la bomba ni de los ventiladores.
// En PC-COCINA (6-nov-2026, webcam): con 0x85 en rojo se tiñe de rojo el techo de la caja; con 0x83, el aro de la bomba.
// Referencia: sgtaziz/lian-li-linux (MIT), crates/lianli-devices/src/galahad2_trinity.rs.
import { createRequire } from 'node:module';
import { cargaGalahad } from './escena.mjs';

const HID = createRequire(import.meta.url)('node-hid');
const VID = 0x0416, PIDS = [0x7373, 0x7371], PAGINA = 0xff1b;
const ORDEN = { SALUDO: 0x81, LUZ_BOMBA: 0x83, LUZ_RADIADOR: 0x85 };
const dormir = ms => new Promise(r => setTimeout(r, ms));

export class Galahad {
  static async abrir() {
    for (const pid of PIDS) {
      const info = (await HID.devicesAsync(VID, pid)).find(d => d.usagePage === PAGINA);
      if (info) return new Galahad(await HID.HIDAsync.open(info.path, { nonExclusive: true }), info);
    }
    return null;
  }
  constructor(dev, info) { this.dev = dev; this.producto = info?.product || 'Galahad II Trinity'; this.cola = Promise.resolve(); this.rpm = null; }

  orden(f) { const p = this.cola.then(f); this.cola = p.catch(() => {}); return p; }
  async enviar(cmd, datos) {
    const p = Buffer.alloc(64); p[0] = 0x01; p[1] = cmd; p[5] = datos.length; Buffer.from(datos).copy(p, 6);
    await this.dev.write([...p]);
    await dormir(20);
  }

  // clave: 'superiores' (radiador) o 'bomba'.
  luz(clave, luz) {
    if (!['superiores', 'bomba'].includes(clave)) return Promise.reject(new Error(`luz desconocida: ${clave}`));
    return this.orden(() => this.enviar(clave === 'bomba' ? ORDEN.LUZ_BOMBA : ORDEN.LUZ_RADIADOR, cargaGalahad(luz, clave)));
  }

  // Saludo: RPM de los ventiladores del radiador y de la bomba (bytes 6-7 y 8-9).
  leerRpm() {
    return this.orden(async () => {
      const p = Buffer.alloc(64); p[0] = 0x01; p[1] = ORDEN.SALUDO;
      await this.dev.write([...p]);
      for (let i = 0; i < 3; i++) {
        const r = await this.dev.read(500);
        if (!r || !r.length) break;
        if (r[1] === ORDEN.SALUDO) return (this.rpm = { ventiladores: (r[6] << 8) | r[7], bomba: (r[8] << 8) | r[9] });
      }
      return this.rpm;
    });
  }

  close() { try { this.dev.close(); } catch {} }
}
