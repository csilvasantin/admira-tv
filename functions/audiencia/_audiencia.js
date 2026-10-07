/*
 * audiencia.js — Contenidos SEGMENTADOS por la audiencia del tótem/quiosco (Carlos, 8-oct-2026):
 * «finalizar los contenidos condicionados por sexo, edad y número a través de la cámara» que admira.tv tuvo en sus
 * primeras versiones (canal.html ?cam=1 + face-api, reglas de admira.tv/condicional.html). Aquí, para el quiosco.
 *
 * Lógica pura (sin red) + consultas D1. La usan:
 *   · mcp-ainimation (este worker): /audiencia/reglas|evento|estado|resumen|simular y las herramientas MCP audiencia_*.
 *   · admira.tv (Pages Functions, functions/audiencia/api): COPIA de este fichero (functions/audiencia/_audiencia.js)
 *     para el backoffice con sesión. Si cambias uno, cambia el otro.
 *
 * PRIVACIDAD (RGPD, por diseño): el navegador estima en local cuántas personas hay, su franja de edad y su género y
 * descarta el fotograma. Aquí solo llegan ESTIMACIONES AGREGADAS de una visita. La lista blanca de campos rechaza
 * cualquier otra cosa (imágenes, fotogramas, descriptores/vectores de cara, cajas, identificadores personales).
 * Retención 90 días, como el registro de avatares. Sin IP, sin cookies, sin identificador de persona.
 */
export const VERSION_AUDIENCIA = 'audiencia-v1';
export const TIENDA = /^[a-z0-9-]{2,80}$/;
export const SLUG = /^[a-z0-9][a-z0-9_-]{0,59}$/;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ORIGENES = ['real', 'qa', 'demo'];
export const CANALES = ['quiosco', 'gemelo', 'simulador', 'mcp', 'backoffice'];
export const CAMARAS = ['on', 'simulada', 'sin-permiso', 'sin-camara', 'off', 'cargando', 'error'];
export const GENEROS = ['any', 'm', 'f'];
export const EDADES = ['any', 'nino', 'joven', 'adulto', 'senior'];
export const BANDAS = ['nino', 'joven', 'adulto', 'senior'];
export const GRUPOS = ['any', 'individuo', 'grupo'];
export const FRANJAS = ['any', 'manana', 'mediodia', 'tarde', 'noche'];
export const RETENCION_DIAS = 90;
export const DIA = 86_400_000;
export const QA_TIENDA = 'starbucks-qa';
export const esQA = (t) => /-qa$/.test(String(t || ''));

/** Franja de edad a partir de la edad estimada (años). Mismo corte que admira.tv canal.html (nino<13, joven<30, adulto<60), senior = 60+. */
export function bandaEdad(a) { a = Number(a); if (!Number.isFinite(a) || a <= 0) return null; return a < 13 ? 'nino' : a < 30 ? 'joven' : a < 60 ? 'adulto' : 'senior'; }
/** Hora de Madrid (0-23) de un instante. */
export function horaMadrid(ms) { return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hourCycle: 'h23' }).format(new Date(ms))); }
export function diaMadrid(ms) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms)); }
/** Franja horaria (hora de Madrid): mañana 6-12, mediodía 12-16, tarde 16-20, noche 20-6. */
export function franjaDe(ms) { const h = horaMadrid(ms); return h >= 6 && h < 12 ? 'manana' : h >= 12 && h < 16 ? 'mediodia' : h >= 16 && h < 20 ? 'tarde' : 'noche'; }

const L = (es, en) => ({ es, en });
/** Variantes y reglas de ejemplo de Starbucks (Carlos: «un menú para hombres y otro para mujeres, para jóvenes y adultos y para individuos o grupos»). */
export function semilla(tienda = 'starbucks-paseo-de-gracia') {
  const sb = /^starbucks/.test(tienda);
  const variantes = {
    general: { nombre: L('General', 'General'), titulo: null, subtitulo: null, oferta: null, destacados: [] },
  };
  if (!sb) return { v: 1, tienda, por_defecto: 'general', histeresis: { lecturas: 3, min_ms: 8000, vacio_ms: 6000 }, variantes, reglas: [] };
  Object.assign(variantes, {
    grupo: { nombre: L('Para compartir (grupo)', 'To share (group)'), titulo: L('¿Venís en grupo? Para compartir', 'Here as a group? Made to share'), subtitulo: L('Bebidas y dulces para todos', 'Drinks and treats for everyone'), oferta: L('Combo grupo: 2 bebidas + 2 dulces (demo)', 'Group combo: 2 drinks + 2 treats (demo)'), destacados: ['caffe-latte', 'frappe-caramelo', 'croissant', 'muffin', 'cookie'] },
    joven: { nombre: L('Joven', 'Young'), titulo: L('Frío, dulce y con color', 'Cold, sweet and colourful'), subtitulo: L('Frappés y Refreshers para ti', 'Frappés and Refreshers for you'), oferta: L('Frappé + cookie (demo)', 'Frappé + cookie (demo)'), destacados: ['frappe-caramelo', 'refresher-fresa', 'cold-brew', 'cookie'] },
    adulto: { nombre: L('Adulto', 'Adult'), titulo: L('Los clásicos de siempre', 'The everyday classics'), subtitulo: L('Espresso, capuchino y latte', 'Espresso, cappuccino and latte'), oferta: null, destacados: ['americano', 'capuchino', 'caffe-latte', 'croissant'] },
    senior: { nombre: L('Senior', 'Senior'), titulo: L('Un momento tranquilo', 'A quiet moment'), subtitulo: L('Tés y cafés suaves', 'Teas and mild coffees'), oferta: null, destacados: ['te-verde', 'capuchino', 'chai-latte', 'croissant'] },
    mujer: { nombre: L('Menú mujer', 'Women menu'), titulo: L('Tu momento Starbucks', 'Your Starbucks moment'), subtitulo: L('Latte, chai y fresa', 'Latte, chai and strawberry'), oferta: L('Latte + croissant (demo)', 'Latte + croissant (demo)'), destacados: ['caffe-latte', 'chai-latte', 'refresher-fresa', 'croissant'] },
    hombre: { nombre: L('Menú hombre', 'Men menu'), titulo: L('Café con carácter', 'Coffee with character'), subtitulo: L('Americano, cold brew y mocha', 'Americano, cold brew and mocha'), oferta: L('Americano + muffin (demo)', 'Americano + muffin (demo)'), destacados: ['americano', 'cold-brew', 'mocha', 'muffin'] },
  });
  const R = (id, nombre, prioridad, f, variante) => ({ id, nombre, activa: true, prioridad, genero: 'any', edad: 'any', grupo: 'any', franja: 'any', ...f, variante });
  return {
    v: 1, tienda, por_defecto: 'general',
    // histéresis: N lecturas iguales seguidas, mínimo de ms entre cambios y ms sin nadie para volver a la general
    histeresis: { lecturas: 3, min_ms: 8000, vacio_ms: 6000 },
    variantes,
    reglas: [
      R('r-grupo', 'Grupo → para compartir', 90, { grupo: 'grupo' }, 'grupo'),
      R('r-joven', 'Joven → frío y dulce', 70, { edad: 'joven', grupo: 'individuo' }, 'joven'),
      R('r-senior', 'Senior → tranquilo', 60, { edad: 'senior', grupo: 'individuo' }, 'senior'),
      R('r-mujer', 'Mujer → menú mujer', 50, { genero: 'f', grupo: 'individuo' }, 'mujer'),
      R('r-hombre', 'Hombre → menú hombre', 50, { genero: 'm', grupo: 'individuo' }, 'hombre'),
      R('r-adulto', 'Adulto → clásicos', 40, { edad: 'adulto' }, 'adulto'),
    ],
  };
}

const txt = (v, n) => String(v == null ? '' : v).normalize('NFC').replace(/<[^>]*>?/g, ' ').replace(/[<>\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const loc = (o, n) => { if (o == null || o === '') return null; if (typeof o === 'string') { const s = txt(o, n); return s ? { es: s, en: s } : null; } if (typeof o !== 'object') return null; const es = txt(o.es, n), en = txt(o.en, n) || es; return es || en ? { es: es || en, en } : null; };
const enumDe = (v, lista, def = 'any') => lista.includes(v) ? v : def;

/** Valida y normaliza un documento de reglas. Devuelve {ok, doc, errores}. */
export function validarReglas(entrada, tienda) {
  const errores = [];
  const d = entrada && typeof entrada === 'object' ? entrada : {};
  const variantes = {};
  const vs = d.variantes && typeof d.variantes === 'object' && !Array.isArray(d.variantes) ? Object.entries(d.variantes) : [];
  for (const [id, v] of vs.slice(0, 40)) {
    if (!SLUG.test(id)) { errores.push(`variante «${txt(id, 40)}»: id en minúsculas, dígitos, _ y -`); continue; }
    const x = v && typeof v === 'object' ? v : {};
    variantes[id] = { nombre: loc(x.nombre, 60) || { es: id, en: id }, titulo: loc(x.titulo, 90), subtitulo: loc(x.subtitulo, 120), oferta: loc(x.oferta, 120),
      destacados: (Array.isArray(x.destacados) ? x.destacados : []).map((s) => String(s || '').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 40)).filter(Boolean).slice(0, 12) };
  }
  if (!variantes.general) variantes.general = { nombre: { es: 'General', en: 'General' }, titulo: null, subtitulo: null, oferta: null, destacados: [] };
  const por_defecto = SLUG.test(d.por_defecto || '') && variantes[d.por_defecto] ? d.por_defecto : 'general';
  const reglas = [];
  const ids = new Set();
  for (const [i, r0] of (Array.isArray(d.reglas) ? d.reglas : []).slice(0, 60).entries()) {
    const r = r0 && typeof r0 === 'object' ? r0 : {};
    let id = SLUG.test(r.id || '') ? r.id : 'r' + (i + 1); while (ids.has(id)) id += 'x'; ids.add(id);
    if (!variantes[r.variante]) { errores.push(`regla ${id}: la variante «${txt(r.variante, 40)}» no existe`); continue; }
    reglas.push({ id, nombre: txt(r.nombre, 80) || id, activa: r.activa !== false, prioridad: Math.max(0, Math.min(999, Math.round(+r.prioridad || 0))),
      genero: enumDe(r.genero, GENEROS), edad: enumDe(r.edad, EDADES), grupo: enumDe(r.grupo, GRUPOS), franja: enumDe(r.franja, FRANJAS), variante: r.variante });
  }
  const h = d.histeresis && typeof d.histeresis === 'object' ? d.histeresis : {};
  const histeresis = { lecturas: Math.max(1, Math.min(10, Math.round(+h.lecturas || 3))), min_ms: Math.max(0, Math.min(120000, Math.round(+h.min_ms || 8000))), vacio_ms: Math.max(1000, Math.min(120000, Math.round(+h.vacio_ms || 6000))) };
  return { ok: !errores.length, errores, doc: { v: 1, tienda: TIENDA.test(tienda || '') ? tienda : (TIENDA.test(d.tienda || '') ? d.tienda : ''), por_defecto, histeresis, variantes, reglas } };
}

/** ¿Casa una regla con un segmento {personas, grupo, genero, edad, franja}? Sin nadie delante solo casa la variante por defecto. */
export function casa(r, s) {
  if (!r || r.activa === false || !s || !(s.personas > 0)) return false;
  if (r.grupo !== 'any' && r.grupo !== s.grupo) return false;
  if (r.genero !== 'any' && r.genero !== s.genero) return false;
  if (r.edad !== 'any' && r.edad !== s.edad) return false;
  if (r.franja !== 'any' && r.franja !== s.franja) return false;
  return true;
}
/** Regla ganadora (mayor prioridad; a igualdad, la primera de la lista) y su variante; si ninguna, la variante por defecto. */
export function elegir(doc, s) {
  const reglas = (doc && doc.reglas) || [];
  const orden = reglas.map((r, i) => [r, i]).sort((a, b) => (b[0].prioridad - a[0].prioridad) || (a[1] - b[1]));
  for (const [r] of orden) if (casa(r, s)) return { regla: r.id, variante: r.variante };
  return { regla: null, variante: (doc && doc.por_defecto) || 'general' };
}
/** Segmento a partir de las caras estimadas [{g:'m'|'f', e:'joven'…}]. Grupo = 2 o más. Género del grupo: mayoría o «mixto». */
export function segmentoDe(caras, ahora = Date.now()) {
  const cs = Array.isArray(caras) ? caras : [];
  const personas = cs.length;
  if (!personas) return { personas: 0, grupo: null, genero: null, edad: null, franja: franjaDe(ahora) };
  const m = cs.filter((c) => c.g === 'm').length, f = cs.filter((c) => c.g === 'f').length;
  const genero = m > f ? 'm' : f > m ? 'f' : (personas === 1 ? null : 'mixto');
  const cuenta = {}; for (const c of cs) if (BANDAS.includes(c.e)) cuenta[c.e] = (cuenta[c.e] || 0) + 1;
  const edad = Object.entries(cuenta).sort((a, b) => b[1] - a[1] || BANDAS.indexOf(b[0]) - BANDAS.indexOf(a[0]))[0]?.[0] || null;
  return { personas, grupo: personas >= 2 ? 'grupo' : 'individuo', genero, edad, franja: franjaDe(ahora) };
}

const CAMPOS = {
  visita: ['tipo', 'id', 'tienda', 'dispositivo', 'origen', 'canal', 'inicio', 'fin', 'personas', 'caras', 'regla', 'variante', 'pedido', 'pedido_num', 'demo_run'],
  pedido: ['tipo', 'visita', 'tienda', 'pedido', 'pedido_num'],
  estado: ['tipo', 'tienda', 'dispositivo', 'origen', 'camara', 'personas', 'grupo', 'genero', 'edad', 'regla', 'variante', 'visita'],
};
const CARA = ['g', 'gc', 'e', 'dc'];
const num01 = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(1, Math.round(n * 100) / 100)) : null; };
const slugOpt = (v, n = 60) => { const s = String(v || '').toLowerCase(); return SLUG.test(s) ? s.slice(0, n) : null; };
/** Origen coherente con la tienda: QA/demo solo en tiendas *-qa; una tienda *-qa nunca guarda «real». Lanza Error si no cuadra. */
export function origenDe(origen, tienda) {
  const o = ORIGENES.includes(origen) ? origen : 'real';
  if (o !== 'real' && !esQA(tienda)) throw new Error(`origen «${o}» solo en tiendas de pruebas (*-qa, p. ej. ${QA_TIENDA}): nunca en ${tienda}`);
  return esQA(tienda) && o === 'real' ? 'qa' : o;
}
/**
 * Lista blanca estricta de un evento del tótem. Cualquier campo de más (una imagen, un fotograma, un descriptor de
 * cara…) → Error. Devuelve el evento normalizado.
 */
export function validarEvento(b, ahora = Date.now()) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw new Error('cuerpo JSON {tipo, …}');
  const tipo = b.tipo;
  if (!CAMPOS[tipo]) throw new Error('tipo: visita | pedido | estado');
  const sobra = Object.keys(b).filter((k) => !CAMPOS[tipo].includes(k));
  if (sobra.length) throw new Error('campos no admitidos (privacidad: solo estimaciones agregadas): ' + sobra.slice(0, 5).join(', '));
  const tienda = String(b.tienda || '');
  if (!TIENDA.test(tienda)) throw new Error('tienda inválida (slug)');
  if (tipo === 'pedido') {
    if (!UUID.test(String(b.visita || ''))) throw new Error('visita: uuid');
    const pedido = String(b.pedido || '').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 64);
    if (!pedido) throw new Error('pedido: id');
    return { tipo, visita: String(b.visita).toLowerCase(), tienda, pedido, pedido_num: String(b.pedido_num || '').replace(/[^A-Z0-9]/g, '').slice(0, 8) || null };
  }
  const dispositivo = slugOpt(b.dispositivo);
  if (!dispositivo) throw new Error('dispositivo: slug');
  const origen = origenDe(b.origen, tienda);
  if (tipo === 'estado') {
    const personas = Math.max(0, Math.min(20, Math.round(+b.personas || 0)));
    return { tipo, tienda, dispositivo, origen, camara: enumDe(b.camara, CAMARAS, 'on'), personas, grupo: personas ? enumDe(b.grupo, GRUPOS.slice(1), personas > 1 ? 'grupo' : 'individuo') : null,
      genero: personas ? enumDe(b.genero, ['m', 'f', 'mixto'], null) : null, edad: personas ? enumDe(b.edad, BANDAS, null) : null, regla: slugOpt(b.regla, 40), variante: slugOpt(b.variante, 40) || 'general',
      visita: UUID.test(String(b.visita || '')) ? String(b.visita).toLowerCase() : null, ts: ahora };
  }
  // visita
  if (!UUID.test(String(b.id || ''))) throw new Error('id: uuid de la visita');
  const inicio = Math.round(+b.inicio), fin = Math.round(+b.fin);
  if (!Number.isSafeInteger(inicio) || !Number.isSafeInteger(fin) || fin < inicio) throw new Error('inicio/fin: ms');
  if (inicio < ahora - RETENCION_DIAS * DIA || fin > ahora + 60_000) throw new Error('inicio/fin fuera de rango');
  if (fin - inicio > 6 * 3600_000) throw new Error('visita de más de 6 h');
  if (!Array.isArray(b.caras) || b.caras.length > 10) throw new Error('caras: lista de 0 a 10 estimaciones');
  const caras = b.caras.map((c) => {
    if (!c || typeof c !== 'object' || Array.isArray(c) || Object.keys(c).some((k) => !CARA.includes(k))) throw new Error('cara: solo {g, gc, e, dc} (género, confianza, franja de edad, confianza de detección)');
    return { g: c.g === 'm' || c.g === 'f' ? c.g : null, gc: num01(c.gc), e: BANDAS.includes(c.e) ? c.e : null, dc: num01(c.dc) };
  });
  const personas = Math.max(caras.length, Math.min(20, Math.round(+b.personas || 0)));
  if (!personas) throw new Error('una visita tiene al menos una persona');
  const seg = segmentoDe(caras.length ? caras : [{}], inicio);
  return { tipo, id: String(b.id).toLowerCase(), tienda, dispositivo, origen, canal: enumDe(b.canal, CANALES, 'quiosco'), inicio, fin, dwell_ms: fin - inicio, personas,
    hombres: caras.filter((c) => c.g === 'm').length, mujeres: caras.filter((c) => c.g === 'f').length,
    nino: caras.filter((c) => c.e === 'nino').length, joven: caras.filter((c) => c.e === 'joven').length, adulto: caras.filter((c) => c.e === 'adulto').length, senior: caras.filter((c) => c.e === 'senior').length,
    grupo: personas >= 2 ? 'grupo' : 'individuo', genero_seg: personas >= 2 && seg.genero === null ? 'mixto' : seg.genero, edad_seg: seg.edad, franja: franjaDe(inicio), caras,
    regla: slugOpt(b.regla, 40), variante: slugOpt(b.variante, 40) || 'general', pedido: b.pedido ? String(b.pedido).replace(/[^A-Za-z0-9._-]/g, '').slice(0, 64) || null : null,
    pedido_num: String(b.pedido_num || '').replace(/[^A-Z0-9]/g, '').slice(0, 8) || null, demo_run: slugOpt(b.demo_run, 40) };
}

/* ── D1 ─────────────────────────────────────────────────────────────────────────────────────────────── */
export async function purgar(db, ahora = Date.now()) {
  const lim = ahora - RETENCION_DIAS * DIA;
  await db.batch([db.prepare('DELETE FROM aud_visitas WHERE creado < ?').bind(lim), db.prepare('DELETE FROM aud_estado WHERE ts < ?').bind(lim)]);
}
/** Guarda un evento ya validado. Idempotente por id de visita. */
export async function guardarEvento(db, ev, ahora = Date.now()) {
  if (ev.tipo === 'visita') {
    const r = await db.prepare(`INSERT INTO aud_visitas (id, tienda, dispositivo, origen, canal, inicio, fin, dwell_ms, personas, hombres, mujeres, nino, joven, adulto, senior, grupo, genero_seg, edad_seg, franja, caras, regla, variante, pedido, pedido_num, demo_run, creado)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET fin=excluded.fin, dwell_ms=excluded.dwell_ms, personas=MAX(aud_visitas.personas, excluded.personas), pedido=COALESCE(excluded.pedido, aud_visitas.pedido), pedido_num=COALESCE(excluded.pedido_num, aud_visitas.pedido_num)
      WHERE aud_visitas.tienda = excluded.tienda`)
      .bind(ev.id, ev.tienda, ev.dispositivo, ev.origen, ev.canal, ev.inicio, ev.fin, ev.dwell_ms, ev.personas, ev.hombres, ev.mujeres, ev.nino, ev.joven, ev.adulto, ev.senior, ev.grupo, ev.genero_seg, ev.edad_seg, ev.franja, JSON.stringify(ev.caras), ev.regla, ev.variante, ev.pedido, ev.pedido_num, ev.demo_run, ahora).run();
    if (Math.random() < 0.05) await purgar(db, ahora).catch(() => {});
    return { ok: true, guardado: 'visita', id: ev.id, cambios: r.meta?.changes ?? null };
  }
  if (ev.tipo === 'pedido') {
    const r = await db.prepare('UPDATE aud_visitas SET pedido = ?, pedido_num = COALESCE(?, pedido_num) WHERE id = ? AND tienda = ?').bind(ev.pedido, ev.pedido_num, ev.visita, ev.tienda).run();
    return { ok: true, guardado: 'pedido', visita: ev.visita, enlazado: (r.meta?.changes || 0) > 0 };
  }
  await db.prepare(`INSERT INTO aud_estado (tienda, dispositivo, origen, ts, camara, personas, grupo, genero_seg, edad_seg, regla, variante, visita) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(tienda, dispositivo) DO UPDATE SET origen=excluded.origen, ts=excluded.ts, camara=excluded.camara, personas=excluded.personas, grupo=excluded.grupo, genero_seg=excluded.genero_seg, edad_seg=excluded.edad_seg, regla=excluded.regla, variante=excluded.variante, visita=excluded.visita`)
    .bind(ev.tienda, ev.dispositivo, ev.origen, ev.ts, ev.camara, ev.personas, ev.grupo, ev.genero, ev.edad, ev.regla, ev.variante, ev.visita).run();
  return { ok: true, guardado: 'estado' };
}
export async function leerReglas(db, tienda) {
  const row = db ? await db.prepare('SELECT doc, actualizado, por FROM aud_reglas WHERE tienda = ?').bind(tienda).first().catch(() => null) : null;
  if (row) { try { return { ...validarReglas(JSON.parse(row.doc), tienda).doc, actualizado: row.actualizado, por: row.por || null, semilla: false }; } catch { /* doc roto → semilla */ } }
  return { ...semilla(tienda), actualizado: null, por: null, semilla: true };
}
export async function guardarReglas(db, tienda, entrada, por, ahora = Date.now()) {
  const v = validarReglas(entrada, tienda);
  if (!v.ok) return { ok: false, errores: v.errores };
  await db.prepare('INSERT INTO aud_reglas (tienda, doc, actualizado, por) VALUES (?,?,?,?) ON CONFLICT(tienda) DO UPDATE SET doc=excluded.doc, actualizado=excluded.actualizado, por=excluded.por')
    .bind(tienda, JSON.stringify(v.doc), ahora, String(por || '').slice(0, 120)).run();
  return { ok: true, doc: { ...v.doc, actualizado: ahora, por, semilla: false } };
}
export async function leerEstado(db, tienda, ahora = Date.now()) {
  const { results } = await db.prepare('SELECT * FROM aud_estado WHERE tienda = ? ORDER BY ts DESC LIMIT 20').bind(tienda).all();
  const dispositivos = (results || []).map((r) => ({ dispositivo: r.dispositivo, origen: r.origen, camara: r.camara, personas: r.personas, grupo: r.grupo, genero: r.genero_seg, edad: r.edad_seg, regla: r.regla, variante: r.variante, visita: r.visita, ts: new Date(r.ts).toISOString(), vivo: ahora - r.ts < 60_000 }));
  const ult = await db.prepare('SELECT id, inicio, fin, personas, grupo, genero_seg, edad_seg, variante, regla, pedido_num, origen FROM aud_visitas WHERE tienda = ? ORDER BY inicio DESC LIMIT 5').bind(tienda).all();
  return { tienda, ahora: new Date(ahora).toISOString(), en_vivo: dispositivos.filter((d) => d.vivo), dispositivos, ultimas_visitas: (ult.results || []).map((v) => ({ ...v, inicio: new Date(v.inicio).toISOString(), fin: new Date(v.fin).toISOString() })) };
}
export function filtrosDe(q, ahora = Date.now()) {
  const g = (k) => (q && typeof q.get === 'function' ? q.get(k) : q && q[k]);
  const dias = Math.max(1, Math.min(RETENCION_DIAS, Math.round(+g('dias') || 7)));
  let hasta = Math.round(+g('hasta') || 0) || ahora + 60_000, desde = Math.round(+g('desde') || 0) || hasta - dias * DIA;
  if (hasta - desde > RETENCION_DIAS * DIA + DIA) desde = hasta - RETENCION_DIAS * DIA;
  const tienda = String(g('tienda') || '');
  const origenes = String(g('origen') || 'real,demo').split(',').map((s) => s.trim()).filter((o) => ORIGENES.includes(o));
  return { tienda: TIENDA.test(tienda) ? tienda : '', desde, hasta, origenes: origenes.length ? origenes : ['real', 'demo'] };
}
const COLS = 'id, tienda, dispositivo, origen, canal, inicio, fin, dwell_ms, personas, hombres, mujeres, nino, joven, adulto, senior, grupo, genero_seg, edad_seg, franja, regla, variante, pedido, pedido_num, demo_run, caras';
export async function visitas(db, f, limite = 50000) {
  const where = ['inicio >= ?', 'inicio < ?', `origen IN (${f.origenes.map(() => '?').join(',')})`]; const b = [f.desde, f.hasta, ...f.origenes];
  if (f.tienda) { where.push('tienda = ?'); b.push(f.tienda); }
  const { results } = await db.prepare(`SELECT ${COLS} FROM aud_visitas WHERE ${where.join(' AND ')} ORDER BY inicio DESC LIMIT ?`).bind(...b, limite).all();
  return results || [];
}
/** Agregados para el panel y el MCP: KPIs, género, edad, tamaño del grupo, hora de Madrid, día, variante y regla. */
export function agregar(filas, f = {}) {
  const k = { visitas: filas.length, personas: 0, hombres: 0, mujeres: 0, grupos: 0, individuos: 0, con_pedido: 0, dwell_ms_medio: 0 };
  const edad = { nino: 0, joven: 0, adulto: 0, senior: 0 }, tam = { '1': 0, '2': 0, '3': 0, '4+': 0 }, hora = Array.from({ length: 24 }, (_, h) => ({ h, visitas: 0, personas: 0 }));
  const porVar = {}, porRegla = {}, porDia = {}, porOrigen = {}, porTienda = {};
  let dwell = 0;
  for (const v of filas) {
    k.personas += v.personas; k.hombres += v.hombres; k.mujeres += v.mujeres; dwell += v.dwell_ms;
    if (v.grupo === 'grupo') k.grupos++; else k.individuos++;
    if (v.pedido) k.con_pedido++;
    for (const b of BANDAS) edad[b] += v[b] || 0;
    tam[v.personas >= 4 ? '4+' : String(v.personas)]++;
    const h = horaMadrid(v.inicio); hora[h].visitas++; hora[h].personas += v.personas;
    const pv = porVar[v.variante || 'general'] ||= { variante: v.variante || 'general', visitas: 0, personas: 0, pedidos: 0 }; pv.visitas++; pv.personas += v.personas; if (v.pedido) pv.pedidos++;
    const pr = porRegla[v.regla || '(por defecto)'] ||= { regla: v.regla || '(por defecto)', visitas: 0, pedidos: 0 }; pr.visitas++; if (v.pedido) pr.pedidos++;
    const d = diaMadrid(v.inicio); const pd = porDia[d] ||= { dia: d, visitas: 0, personas: 0 }; pd.visitas++; pd.personas += v.personas;
    porOrigen[v.origen] = (porOrigen[v.origen] || 0) + 1; porTienda[v.tienda] = (porTienda[v.tienda] || 0) + 1;
  }
  k.dwell_ms_medio = filas.length ? Math.round(dwell / filas.length) : 0;
  k.conversion = filas.length ? Math.round((k.con_pedido / filas.length) * 1000) / 10 : 0;
  return { filtros: { ...f, desde: f.desde ? new Date(f.desde).toISOString() : null, hasta: f.hasta ? new Date(f.hasta).toISOString() : null }, zona: 'Europe/Madrid', kpis: k, genero: { m: k.hombres, f: k.mujeres }, edad, tamano: tam, por_hora: hora,
    por_variante: Object.values(porVar).sort((a, b) => b.visitas - a.visitas), por_regla: Object.values(porRegla).sort((a, b) => b.visitas - a.visitas), por_dia: Object.values(porDia).sort((a, b) => a.dia < b.dia ? -1 : 1), por_origen: porOrigen, por_tienda: porTienda };
}
export const CSV_CABECERA = ['id', 'tienda', 'dispositivo', 'origen', 'canal', 'inicio_madrid', 'fin_madrid', 'dwell_s', 'personas', 'hombres', 'mujeres', 'nino', 'joven', 'adulto', 'senior', 'grupo', 'genero_seg', 'edad_seg', 'franja', 'regla', 'variante', 'pedido', 'pedido_num', 'demo_run'];
export function aCSV(filas) {
  const f = (ms) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'medium' }).format(new Date(ms));
  const c = (v) => { const s = v == null ? '' : String(v); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return [CSV_CABECERA.join(','), ...filas.map((v) => [v.id, v.tienda, v.dispositivo, v.origen, v.canal, f(v.inicio), f(v.fin), Math.round(v.dwell_ms / 1000), v.personas, v.hombres, v.mujeres, v.nino, v.joven, v.adulto, v.senior, v.grupo, v.genero_seg, v.edad_seg, v.franja, v.regla, v.variante, v.pedido, v.pedido_num, v.demo_run].map(c).join(','))].join('\n') + '\n';
}

/* ── Simulación (QA sin cámara) ───────────────────────────────────────────────────────────────────────
 * Visitas sintéticas SOLO en tiendas *-qa (por defecto starbucks-qa) y con origen «demo»: nunca ensucian
 * starbucks-paseo-de-gracia. Reparte n visitas en las últimas `horas` (hora de Madrid realista).          */
function azar(semilla) { let s = (semilla >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const elige = (r, pesos) => { const t = Object.values(pesos).reduce((a, b) => a + b, 0); let x = r() * t; for (const [k, p] of Object.entries(pesos)) { if ((x -= p) < 0) return k; } return Object.keys(pesos)[0]; };
export function simular({ tienda = QA_TIENDA, n = 30, horas = 12, demo_run, doc, semilla: sem, ahora = Date.now(), caras: fijas } = {}) {
  if (!esQA(tienda)) throw new Error(`la simulación solo escribe en tiendas de pruebas (*-qa, p. ej. ${QA_TIENDA})`);
  n = Math.max(1, Math.min(200, Math.round(+n || 30))); horas = Math.max(1, Math.min(24 * 30, Math.round(+horas || 12)));
  const r = azar(sem || Math.floor(ahora / 1000)), run = slugOpt(demo_run, 40) || 'sim-' + new Date(ahora).toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const reglas = doc || semilla(tienda);
  const out = [];
  for (let i = 0; i < n; i++) {
    const personas = fijas ? fijas.length : Number(elige(r, { 1: 58, 2: 26, 3: 11, 4: 5 }));
    const caras = fijas ? fijas.map((c) => ({ g: c.g, gc: 0.9, e: c.e, dc: 0.95 })) : Array.from({ length: personas }, () => ({ g: r() < 0.5 ? 'm' : 'f', gc: Math.round((0.7 + r() * 0.29) * 100) / 100, e: elige(r, { nino: 6, joven: 36, adulto: 44, senior: 14 }), dc: Math.round((0.75 + r() * 0.24) * 100) / 100 }));
    // más gente a media mañana, mediodía y tarde
    let inicio; for (let k = 0; k < 6; k++) { inicio = Math.round(ahora - r() * horas * 3600_000); const h = horaMadrid(inicio); if (h >= 8 && h <= 21 || r() < 0.15) break; }
    const dwell = Math.round((6 + r() * (personas > 1 ? 120 : 75)) * 1000), seg = segmentoDe(caras, inicio), e = elegir(reglas, seg);
    const conPedido = r() < (personas > 1 ? 0.45 : 0.32);
    const id = crypto.randomUUID();
    out.push({ tipo: 'visita', id, tienda, dispositivo: 'simulador', origen: 'demo', canal: 'simulador', inicio, fin: Math.min(ahora, inicio + dwell), personas, caras, regla: e.regla, variante: e.variante,
      pedido: conPedido ? 'sim-' + id.slice(0, 8) : null, pedido_num: conPedido ? 'S' + String(1 + Math.floor(r() * 999)).padStart(3, '0') : null, demo_run: run });
  }
  return { demo_run: run, tienda, visitas: out };
}
