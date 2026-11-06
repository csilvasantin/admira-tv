// Strimer Plus de Lian Li (USB 0CF2:A200): los cables RGB de la gráfica y del conector de 24 pines de la placa.
// Órdenes por informe de característica 0xE0 y colores por informe de salida, con 40 ms entre órdenes.
// 12 puertos en 2 canales. En PC-COCINA (comprobado con la webcam el 6-nov-2026): puertos 0-5 = canal 1 = cable de
// 24 pines de la placa; puertos 6-11 = canal 2 = cable de la gráfica.
// Referencia: sgtaziz/lian-li-linux (MIT), crates/lianli-devices/src/strimer_plus.rs.
import { createRequire } from 'node:module';
import { cargaStrimer } from './escena.mjs';

const HID = createRequire(import.meta.url)('node-hid');
const VID = 0x0cf2, PID = 0xa200, ID = 0xe0, ESPERA = 40;
export const PUERTOS_STRIMER = { placa: [0, 1, 2, 3, 4, 5], grafica: [6, 7, 8, 9, 10, 11] };
const TODOS = 0x0fff;   // todos los modos que usamos son «individuales»: se activan los 12 puertos
const dormir = ms => new Promise(r => setTimeout(r, ms));

export class Strimer {
  static async abrir() {
    const info = (await HID.devicesAsync(VID, PID))[0];
    return info ? new Strimer(await HID.HIDAsync.open(info.path, { nonExclusive: true }), info) : null;
  }
  constructor(dev, info) { this.dev = dev; this.producto = info?.product || 'Strimer Plus'; this.cola = Promise.resolve(); }

  // Las órdenes van en fila: el cambio de un cable no se cruza con el del otro.
  luz(clave, luz) {
    const p = this.cola.then(() => this.aplicar(clave, luz));
    this.cola = p.catch(() => {});
    return p;
  }
  async aplicar(clave, luz) {
    const puertos = PUERTOS_STRIMER[clave];
    if (!puertos) throw new Error(`cable desconocido: ${clave}`);
    const c = cargaStrimer(luz);
    for (const p of puertos) {
      await this.caracteristica([ID, 0x10 | p, c.modo, c.velocidad, 0, c.brillo]);
      if (c.colores.length) await this.salida([ID, 0x30 | p, ...c.colores]);
    }
    await this.caracteristica([ID, 0x20 | 0x0c, TODOS >> 8, TODOS & 0xff]);
  }
  async caracteristica(bytes) { await this.dev.sendFeatureReport(bytes); await dormir(ESPERA); }
  async salida(bytes) { await this.dev.write(bytes); await dormir(ESPERA); }

  close() { try { this.dev.close(); } catch {} }
}
