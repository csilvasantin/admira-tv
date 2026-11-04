// Nube de la Supercomputer (supercomputer.admira.store): une el gemelo de admira.store/supercomputer
// con el puente de METAHUMAN, que está detrás de un router y solo puede llamar hacia fuera.
//  · El puente hace POST /maquina cada 3 s con su informe y las miniaturas de los 7 ventiladores, y
//    recibe la escena y la luz deseadas (Bearer MAQUINA_KEY).
//  · El gemelo no llega aquí directamente: pasa por la función de admira.store, que comprueba la
//    sesión de Google y firma con X-Proxy-Key (PROXY_KEY) y X-Usuario.
// Un único Durable Object guarda lo deseado (SQLite, sobrevive) y lo último informado (memoria): sin
// escrituras de KV, que en octubre llegaron al tope diario de la cuenta.
import { DurableObject } from 'cloudflare:workers';
import { normalizarEscena, normalizarLuz } from '../escena.mjs';

const json = (v, status = 200) => new Response(JSON.stringify(v), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
});

// Comparación en tiempo constante (no revela cuántos caracteres coinciden).
function igual(a, b) {
  const x = new TextEncoder().encode(String(a ?? '')), y = new TextEncoder().encode(String(b ?? ''));
  if (!x.length || x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/salud') return json({ ok: true, servicio: 'supercomputer' });
    const maquina = url.pathname === '/maquina';
    const ok = maquina
      ? igual((request.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''), env.MAQUINA_KEY)
      : igual(request.headers.get('x-proxy-key'), env.PROXY_KEY);
    if (!ok) return json({ ok: false, error: 'unauthorized' }, 401);
    const stub = env.SUPERCOMPUTER.get(env.SUPERCOMPUTER.idFromName('metahuman'));
    return stub.fetch(request);
  }
};

export class Supercomputer extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.informe = null; this.visto = 0; this.miniaturas = new Map();
  }

  async deseado() { return (await this.ctx.storage.get('deseado')) || null; }

  async fetch(request) {
    const url = new URL(request.url), metodo = request.method;
    const usuario = (request.headers.get('x-usuario') || 'desconocido').slice(0, 120);
    try {
      if (url.pathname === '/maquina' && metodo === 'POST') {
        const body = await request.json();
        this.informe = body.informe || null; this.visto = Date.now();
        this.miniaturas = new Map(Object.entries(body.miniaturas || {})
          .filter(([n, b]) => /^[1-9]$/.test(n) && typeof b === 'string' && b.length < 200000)
          .map(([n, b]) => [n, b]));
        let deseado = await this.deseado();
        // Primera vez: lo que ya emite la máquina pasa a ser lo deseado (el gemelo arranca de ahí).
        if (!deseado && this.informe?.escena) {
          deseado = { escena: this.informe.escena, luz: this.informe.luz ?? null, revision: Number(this.informe.revision) || 1, por: 'METAHUMAN', at: Date.now() };
          await this.ctx.storage.put('deseado', deseado);
        }
        return json({ ok: true, deseado });
      }
      if (url.pathname === '/estado' && metodo === 'GET') {
        const ahora = Date.now();
        return json({ ok: true, ahora, deseado: await this.deseado(), informe: this.informe, visto: this.visto,
          enLinea: ahora - this.visto < 15000, miniaturas: [...this.miniaturas.keys()] });
      }
      const mini = /^\/miniatura\/([1-9])\.jpg$/.exec(url.pathname);
      if (mini && metodo === 'GET') {
        const b64 = this.miniaturas.get(mini[1]);
        if (!b64) return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });
        const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        return new Response(bytes, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'no-store' } });
      }
      if ((url.pathname === '/escena' || url.pathname === '/luz') && metodo === 'POST') {
        const body = await request.json();
        const actual = (await this.deseado()) || {};
        const cambio = url.pathname === '/escena'
          ? { escena: { ...normalizarEscena(body, 7), epoch: 0 } }   // el puente pone el reloj al aplicarla
          : { luz: body === null ? null : normalizarLuz(body) };
        const deseado = { ...actual, ...cambio, revision: Math.max(Date.now(), (Number(actual.revision) || 0) + 1), por: usuario, at: Date.now() };
        await this.ctx.storage.put('deseado', deseado);
        return json({ ok: true, deseado });
      }
      return json({ ok: false, error: 'not_found' }, 404);
    } catch (e) {
      return json({ ok: false, error: String(e.message || e).slice(0, 200) }, 400);
    }
  }
}
