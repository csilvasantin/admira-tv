// Caché local de piezas del Stock para extender y sincro: cada pieza se baja una vez y se
// sirve a los 7 Chrome desde 127.0.0.1 con rangos (el vídeo necesita saltar al segundo exacto).
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const STOCK = 'https://api.admira.store/stock/asset/';
const ID = /^[A-Za-z0-9-]{1,80}$/;

export class Medios {
  constructor(dir) { this.dir = dir; this.info = new Map(); this.bajando = new Map(); }

  ruta(id) { return path.join(this.dir, id); }

  // Devuelve { url, tipo } cuando la pieza está entera en disco.
  async asegurar(id) {
    if (!ID.test(id)) throw new Error(`id inválido: ${id}`);
    if (this.info.has(id)) return this.info.get(id);
    if (!this.bajando.has(id)) this.bajando.set(id, this.bajar(id).finally(() => this.bajando.delete(id)));
    return this.bajando.get(id);
  }

  async bajar(id) {
    await fsp.mkdir(this.dir, { recursive: true });
    const meta = this.ruta(id) + '.json';
    const previa = await fsp.readFile(meta, 'utf8').then(JSON.parse).catch(() => null);
    if (previa && (await fsp.stat(this.ruta(id)).catch(() => null))?.size === previa.size) {
      this.info.set(id, previa.medio); return previa.medio;
    }
    const r = await fetch(STOCK + id, { redirect: 'follow', signal: AbortSignal.timeout(180000) });
    if (!r.ok || !r.body) throw new Error(`Stock ${id}: HTTP ${r.status}`);
    const mime = (r.headers.get('content-type') || 'video/mp4').split(';')[0];
    const tmp = this.ruta(id) + '.parcial';
    await pipeline(Readable.fromWeb(r.body), fs.createWriteStream(tmp));
    await fsp.rename(tmp, this.ruta(id));
    const size = (await fsp.stat(this.ruta(id))).size;
    const medio = { url: `/media/${id}`, tipo: mime.startsWith('image/') ? 'image' : 'video', mime };
    await fsp.writeFile(meta, JSON.stringify({ size, medio }));
    this.info.set(id, medio);
    return medio;
  }

  // GET /media/<id> con soporte de Range (206).
  async servir(id, req, res) {
    const medio = ID.test(id) && this.info.get(id);
    const stat = medio && await fsp.stat(this.ruta(id)).catch(() => null);
    if (!stat) { res.statusCode = 404; return res.end(); }
    res.setHeader('content-type', medio.mime);
    res.setHeader('accept-ranges', 'bytes');
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    let ini = 0, fin = stat.size - 1;
    if (m) {
      if (m[1]) { ini = Number(m[1]); if (m[2]) fin = Math.min(fin, Number(m[2])); }
      else if (m[2]) ini = Math.max(0, stat.size - Number(m[2]));
      if (ini > fin) { res.statusCode = 416; res.setHeader('content-range', `bytes */${stat.size}`); return res.end(); }
      res.statusCode = 206;
      res.setHeader('content-range', `bytes ${ini}-${fin}/${stat.size}`);
    }
    res.setHeader('content-length', fin - ini + 1);
    fs.createReadStream(this.ruta(id), { start: ini, end: fin }).pipe(res);
  }
}
