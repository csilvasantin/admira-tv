// Backoffice de AUDIENCIA del quiosco segmentado (Carlos, 8-oct-2026).
// Lee la D1 kiosko-audiencia (la misma que escribe el relé mcp-ainimation.admira.store/audiencia/evento).
// Solo recuentos anónimos: nunca imágenes, fotogramas ni huellas faciales (lista blanca en _audiencia.js).
//
//   GET  /audiencia/api/tiendas
//   GET  /audiencia/api/resumen?tienda=&dias=&desde=&hasta=&origen=real,demo
//   GET  /audiencia/api/csv?…            (mismos filtros, text/csv con horas de Madrid)
//   GET  /audiencia/api/estado?tienda=
//   GET  /audiencia/api/reglas?tienda=
//   PUT  /audiencia/api/reglas?tienda=   {doc}   editor/admin/owner
//   POST /audiencia/api/simular          {tienda:"*-qa", n}   solo tiendas de pruebas
//
// Sesión verificada del portal (cookie) + permiso del proyecto «Contenidos condicionados»
// (digitalsignage-conditional). La sesión de solo lectura no entra.
import { accessFor, authHeaders, readSession } from '../../_auth-session.js';
import * as AUD from '../_audiencia.js';

export const PROYECTO = 'digitalsignage-conditional';
const EDITORES = new Set(['owner', 'admin', 'editor']);
const MAX_BODY = 65536;
const json = (data, status = 200) => Response.json(data, { status, headers: authHeaders() });

async function leerJSON(request) {
  const txt = await request.text();
  if (txt.length > MAX_BODY) throw new Error('size');
  return txt ? JSON.parse(txt) : {};
}
const caras = (v) => { try { return JSON.parse(v.caras || '[]'); } catch { return []; } };

export async function onRequest({ request, env, params }) {
  try {
    const url = new URL(request.url);
    const ruta = [].concat(params?.path || []).join('/') || url.pathname.replace(/^\/audiencia\/api\/?/, '');
    if (!['GET', 'PUT', 'POST'].includes(request.method)) return json({ ok: false, error: 'method' }, 405);
    if (request.method !== 'GET' && (request.headers.get('origin') !== url.origin || request.headers.get('content-type')?.split(';')[0] !== 'application/json')) return json({ ok: false, error: 'origin_or_type' }, 403);
    const session = await readSession(request, env);
    if (!session) return json({ ok: false, error: 'unauthorized' }, 401);
    if (session.lectura) return json({ ok: false, error: 'forbidden' }, 403);
    const access = await accessFor(env, session.email, PROYECTO);
    if (!access.allowed) return json({ ok: false, error: 'forbidden' }, 403);
    const db = env.AUDIENCIA_DB;
    if (!db) return json({ ok: false, error: 'audiencia_not_configured' }, 503);
    const q = url.searchParams;
    const tienda = String(q.get('tienda') || '');
    if (tienda && !AUD.TIENDA.test(tienda)) return json({ ok: false, error: 'invalid_store' }, 400);

    if (request.method === 'GET' && ruta === 'tiendas') {
      const { results } = await db.prepare("SELECT tienda, COUNT(*) AS visitas, MAX(inicio) AS ultima FROM aud_visitas GROUP BY tienda UNION ALL SELECT tienda, 0, actualizado FROM aud_reglas").all();
      const m = {};
      for (const r of results || []) { const t = m[r.tienda] ||= { tienda: r.tienda, visitas: 0, ultima: 0, qa: AUD.esQA(r.tienda) }; t.visitas += r.visitas || 0; t.ultima = Math.max(t.ultima, r.ultima || 0); }
      for (const t of ['starbucks-paseo-de-gracia', AUD.QA_TIENDA]) m[t] ||= { tienda: t, visitas: 0, ultima: 0, qa: AUD.esQA(t) };
      return json({ ok: true, tiendas: Object.values(m).sort((a, b) => a.qa - b.qa || b.visitas - a.visitas), rol: access.role, editor: EDITORES.has(access.role) });
    }
    if (request.method === 'GET' && (ruta === 'resumen' || ruta === 'csv')) {
      const f = AUD.filtrosDe(q);
      const filas = await AUD.visitas(db, f);
      if (ruta === 'csv') {
        const nombre = `audiencia-${f.tienda || 'todas'}-${AUD.diaMadrid(Date.now())}.csv`;
        return new Response('\ufeff' + AUD.aCSV(filas), { headers: authHeaders({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${nombre}"` }) });
      }
      return json({ ok: true, ...AUD.agregar(filas, f), recientes: filas.slice(0, 50).map((v) => ({ ...v, caras: caras(v) })), retencion_dias: AUD.RETENCION_DIAS });
    }
    if (request.method === 'GET' && ruta === 'estado') {
      if (!tienda) return json({ ok: false, error: 'store_required' }, 400);
      return json({ ok: true, ...(await AUD.leerEstado(db, tienda)) });
    }
    if (ruta === 'reglas' && request.method === 'GET') {
      if (!tienda) return json({ ok: false, error: 'store_required' }, 400);
      if (q.get('semilla') === '1') return json({ ok: true, tienda, ...AUD.semilla(tienda), actualizado: null, por: null, semilla: true, editor: EDITORES.has(access.role) });
      return json({ ok: true, tienda, ...(await AUD.leerReglas(db, tienda)), editor: EDITORES.has(access.role) });
    }
    if (ruta === 'reglas' && request.method === 'PUT') {
      if (!tienda) return json({ ok: false, error: 'store_required' }, 400);
      if (!EDITORES.has(access.role)) return json({ ok: false, error: 'editor_required' }, 403);
      let b; try { b = await leerJSON(request); } catch { return json({ ok: false, error: 'invalid_body' }, 400); }
      const r = await AUD.guardarReglas(db, tienda, b.doc || b, session.email);
      return json(r.ok ? { ok: true, tienda, ...r.doc } : { ok: false, error: 'invalid_rules', errores: r.errores }, r.ok ? 200 : 400);
    }
    if (ruta === 'simular' && request.method === 'POST') {
      let b; try { b = await leerJSON(request); } catch { return json({ ok: false, error: 'invalid_body' }, 400); }
      const t = String(b.tienda || AUD.QA_TIENDA);
      if (!AUD.TIENDA.test(t) || !AUD.esQA(t)) return json({ ok: false, error: 'qa_only', detalle: 'la simulación solo escribe en tiendas *-qa (starbucks-qa)' }, 400);
      const sim = AUD.simular({ tienda: t, n: Math.min(100, +b.n || 30), horas: b.horas, doc: await AUD.leerReglas(db, t) });
      for (const v of sim.visitas) await AUD.guardarEvento(db, AUD.validarEvento({ ...v, canal: 'backoffice' }));
      return json({ ok: true, tienda: t, demo_run: sim.demo_run, insertadas: sim.visitas.length });
    }
    return json({ ok: false, error: 'not_found', rutas: ['GET tiendas', 'GET resumen', 'GET csv', 'GET estado', 'GET|PUT reglas', 'POST simular'] }, 404);
  } catch (e) {
    console.error(JSON.stringify({ event: 'audiencia_api_error', msg: String(e?.message || e).slice(0, 200) }));
    return json({ ok: false, error: 'audiencia_unavailable' }, 503);
  }
}
