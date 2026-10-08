// PROGRAMACIÓN EN HORA DE PARED DE MADRID (modelo único de playlists, E2 · 8-oct-2026).
//
// Una asignación dice CUÁNDO se emite con campos de calendario, no con instantes:
//   · fecha_desde / fecha_hasta  'YYYY-MM-DD' inclusivas; null = rango abierto por ese lado.
//   · dias                       máscara L=1 M=2 X=4 J=8 V=16 S=32 D=64 (127 = todos).
//   · franjas                    [{desde, hasta}] en minutos locales (0…1440). Si hasta <= desde, la franja cruza la
//                                medianoche y TERMINA al día siguiente: pertenece al día en que empieza (dias, fechas y
//                                excepciones se miran en ese día). Sin franjas = el día entero.
//   · recurrencia                null · {tipo:'semanal', cada:N, ancla:'YYYY-MM-DD'} (una semana sí y N-1 no, contadas de
//                                lunes a domingo desde la semana del ancla) · {tipo:'fechas', fechas:[…]}.
//   · excepciones                ['YYYY-MM-DD' | {desde, hasta}]: días en los que no se emite.
//
// Cambio de hora: se programa en hora de pared. Una hora que no existe (el salto de primavera, 02:00–03:00) se lleva
// al instante del salto, las 03:00; una hora que existe dos veces (la vuelta de otoño, 02:00–03:00) toma la PRIMERA
// ocurrencia. Así 00:00–02:30 y 02:30–24:00 siguen cubriendo el día sin huecos ni solapes.
//
// Puro: sin red ni almacenamiento; la zona se resuelve con Intl. Todos los instantes son milisegundos UTC.

export const ZONA = "Europe/Madrid";
export const MIN_MS = 60_000, HORA_MS = 3_600_000, DIA_MS = 86_400_000;
export const HORIZONTE_MS = 48 * HORA_MS;
/** fin_utc de una programación sin fecha de fin: 10000-01-01T00:00:00Z. */
export const FIN_ABIERTO = 253_402_300_800_000;
export const DIAS = Object.freeze({ L: 1, M: 2, X: 4, J: 8, V: 16, S: 32, D: 64 });
export const TODOS_LOS_DIAS = 127;
export const MAX_FRANJAS = 24, MAX_FECHAS = 366, MAX_DIAS_EXPANDIDOS = 800;

const FECHA_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// ── Calendario civil (sin zona) ─────────────────────────────────────────────────────────────────────────────────
/** Número de día desde 1970-01-01 de una fecha 'YYYY-MM-DD' (o NaN). */
export function numeroDia(fecha) {
  const m = FECHA_RE.exec(String(fecha || ""));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / DIA_MS : NaN;
}
const fechaDeNumero = n => new Date(n * DIA_MS).toISOString().slice(0, 10);
export const esFecha = f => { const n = numeroDia(f); return Number.isFinite(n) && fechaDeNumero(n) === f; };
export const sumarDias = (fecha, dias) => fechaDeNumero(numeroDia(fecha) + dias);
/** 0 = lunes … 6 = domingo. */
export const diaSemana = fecha => (new Date(numeroDia(fecha) * DIA_MS).getUTCDay() + 6) % 7;
/** Bit del día en la máscara `dias`: lunes 1 … domingo 64. */
export const bitDia = fecha => 1 << diaSemana(fecha);

/** 'HH:MM' (00:00–24:00) o número de minutos → minutos; null si no vale. */
export function aMinutos(v, max = 1440) {
  if (typeof v === "number") return Number.isInteger(v) && v >= 0 && v <= max ? v : null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v == null ? "" : v).trim());
  if (!m || +m[2] > 59) return null;
  const n = +m[1] * 60 + +m[2];
  return n <= max ? n : null;
}
export const aHHMM = min => String(Math.floor(min / 60)).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0");

// ── Zona horaria con Intl ───────────────────────────────────────────────────────────────────────────────────────
const formatos = new Map();
function formato(zona) {
  let f = formatos.get(zona);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
    formatos.set(zona, f);
  }
  return f;
}
/** Hora de pared de un instante: {fecha, minuto (0…1439), segundo, hhmm, diaSemana (0 = lunes)}. */
export function partesLocales(ms, zona = ZONA) {
  const p = {};
  for (const { type, value } of formato(zona).formatToParts(new Date(ms))) p[type] = value;
  const fecha = `${p.year}-${p.month}-${p.day}`, minuto = (Number(p.hour) % 24) * 60 + Number(p.minute);
  return { fecha, minuto, segundo: Number(p.second), hhmm: aHHMM(minuto), diaSemana: diaSemana(fecha) };
}
/** Desfase de la zona en un instante, en minutos (Madrid: +60 en invierno, +120 en verano). */
export function desfase(ms, zona = ZONA) {
  const l = partesLocales(ms, zona);
  return Math.round((numeroDia(l.fecha) * DIA_MS + l.minuto * MIN_MS + l.segundo * 1000 - Math.floor(ms / 1000) * 1000) / MIN_MS);
}

const memoUtc = new Map();
/** Instante UTC de una hora de pared (fecha + minuto 0…1440). Inexistente → el salto; ambigua → la primera. */
export function aUtc(fecha, minuto, zona = ZONA) {
  const clave = zona + "|" + fecha + "|" + minuto;
  let v = memoUtc.get(clave);
  if (v === undefined) {
    v = calcularUtc(fecha, minuto, zona);
    if (memoUtc.size > 20000) memoUtc.clear();
    memoUtc.set(clave, v);
  }
  return v;
}
function calcularUtc(fecha, minuto, zona) {
  const ingenuo = numeroDia(fecha) * DIA_MS + minuto * MIN_MS;   // la hora de pared leída como si fuera UTC
  if (!Number.isFinite(ingenuo)) return NaN;
  const desfases = new Set([desfase(ingenuo - DIA_MS, zona), desfase(ingenuo, zona), desfase(ingenuo + DIA_MS, zona)]);
  const validos = [];
  for (const o of desfases) { const t = ingenuo - o * MIN_MS; if (desfase(t, zona) === o) validos.push(t); }
  if (validos.length) return Math.min(...validos);                // ambigua: la primera ocurrencia
  // No existe: el reloj salta por encima. Se busca el instante del salto (en Madrid, las 03:00 de verano).
  const extremos = [...desfases].map(o => ingenuo - o * MIN_MS).sort((a, b) => a - b);
  let lo = extremos[0], hi = extremos[extremos.length - 1];
  const despues = desfase(hi, zona);
  while (hi - lo > MIN_MS) {
    const medio = lo + Math.floor((hi - lo) / (2 * MIN_MS)) * MIN_MS;
    if (desfase(medio, zona) === despues) hi = medio; else lo = medio;
  }
  return hi;
}

// ── Normalización ───────────────────────────────────────────────────────────────────────────────────────────────
function fechaOpcional(v, error) {
  if (v == null || v === "") return null;
  const f = String(v).trim().slice(0, 10);
  if (!esFecha(f)) throw new Error(error);
  return f;
}
function franja(raw) {
  let desde, hasta;
  if (typeof raw === "string") { const [a, b] = raw.split(/\s*[-–]\s*/); desde = aMinutos(a, 1439); hasta = aMinutos(b); }
  else if (raw && typeof raw === "object") { desde = aMinutos(raw.desde, 1439); hasta = aMinutos(raw.hasta); }
  if (desde == null || hasta == null) throw new Error("franja_invalida");
  return { desde, hasta };
}
function mascaraDias(v) {
  if (v == null || v === "" || v === 0) return TODOS_LOS_DIAS;
  if (Array.isArray(v)) {
    let m = 0;
    for (const d of v) {
      const bit = typeof d === "number" ? (d >= 0 && d <= 6 ? 1 << d : 0) : DIAS[String(d).trim().toUpperCase()] || 0;
      if (!bit) throw new Error("dias_invalidos");
      m |= bit;
    }
    return m || TODOS_LOS_DIAS;
  }
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > TODOS_LOS_DIAS) throw new Error("dias_invalidos");
  return n;
}
function excepcion(raw) {
  if (typeof raw === "string") return fechaOpcional(raw, "excepcion_invalida");
  const desde = fechaOpcional(raw && raw.desde, "excepcion_invalida"), hasta = fechaOpcional(raw && raw.hasta, "excepcion_invalida");
  if (!desde || !hasta || hasta < desde) throw new Error("excepcion_invalida");
  return desde === hasta ? desde : { desde, hasta };
}
/** Campos de programación saneados. Lanza Error con el código del problema. */
export function limpiarProgramacion(raw = {}) {
  const fecha_desde = fechaOpcional(raw.fecha_desde, "fecha_desde_invalida"), fecha_hasta = fechaOpcional(raw.fecha_hasta, "fecha_hasta_invalida");
  if (fecha_desde && fecha_hasta && fecha_hasta < fecha_desde) throw new Error("fechas_invertidas");
  const dias = mascaraDias(raw.dias);
  const lista = raw.franjas == null ? [] : raw.franjas;
  if (!Array.isArray(lista) || lista.length > MAX_FRANJAS) throw new Error("franjas_invalidas");
  const franjas = lista.map(franja).sort((a, b) => a.desde - b.desde || a.hasta - b.hasta);
  let recurrencia = null;
  const r = raw.recurrencia;
  if (r && typeof r === "object") {
    if (r.tipo === "semanal") {
      const cada = Number(r.cada == null ? 1 : r.cada);
      if (!Number.isInteger(cada) || cada < 1 || cada > 52) throw new Error("recurrencia_invalida");
      const ancla = fechaOpcional(r.ancla, "recurrencia_invalida") || fecha_desde;
      if (cada > 1 && !ancla) throw new Error("recurrencia_sin_ancla");
      if (cada > 1) recurrencia = { tipo: "semanal", cada, ancla };
    } else if (r.tipo === "fechas") {
      const fechas = [...new Set((Array.isArray(r.fechas) ? r.fechas : []).map(f => fechaOpcional(f, "recurrencia_invalida")).filter(Boolean))].sort();
      if (!fechas.length || fechas.length > MAX_FECHAS) throw new Error("recurrencia_invalida");
      recurrencia = { tipo: "fechas", fechas };
    } else throw new Error("recurrencia_invalida");
  }
  const ex = raw.excepciones == null ? [] : raw.excepciones;
  if (!Array.isArray(ex) || ex.length > MAX_FECHAS) throw new Error("excepciones_invalidas");
  const excepciones = ex.map(excepcion).sort((a, b) => String(a.desde || a).localeCompare(String(b.desde || b)));
  return { fecha_desde, fecha_hasta, dias, franjas, recurrencia, excepciones };
}

// ── Expansión ───────────────────────────────────────────────────────────────────────────────────────────────────
const franjasDe = prog => (Array.isArray(prog.franjas) && prog.franjas.length ? prog.franjas : [{ desde: 0, hasta: 1440 }]);
const excluida = (prog, fecha) => (prog.excepciones || []).some(e => (typeof e === "string" ? e === fecha : fecha >= e.desde && fecha <= e.hasta));

/** ¿La programación emite (alguna franja que EMPIEZA) en ese día local? */
export function diaActivo(prog, fecha) {
  if (!prog || !esFecha(fecha)) return false;
  if (prog.fecha_desde && fecha < prog.fecha_desde) return false;
  if (prog.fecha_hasta && fecha > prog.fecha_hasta) return false;
  if (!((prog.dias || TODOS_LOS_DIAS) & bitDia(fecha))) return false;
  if (excluida(prog, fecha)) return false;
  const r = prog.recurrencia;
  if (r && r.tipo === "fechas" && !r.fechas.includes(fecha)) return false;
  if (r && r.tipo === "semanal" && r.cada > 1) {
    const lunes = f => numeroDia(f) - diaSemana(f);
    const semanas = Math.round((lunes(fecha) - lunes(r.ancla)) / 7);
    if (((semanas % r.cada) + r.cada) % r.cada !== 0) return false;
  }
  return true;
}
/** Ocurrencias que empiezan ese día: [{fecha, inicio, fin, desde, hasta}] en ms UTC (las vacías por el salto, fuera). */
export function ocurrenciasDia(prog, fecha, zona = ZONA) {
  if (!diaActivo(prog, fecha)) return [];
  const out = [];
  for (const f of franjasDe(prog)) {
    const inicio = aUtc(fecha, f.desde, zona);
    const fin = f.hasta > f.desde ? aUtc(fecha, f.hasta, zona) : aUtc(sumarDias(fecha, 1), f.hasta, zona);
    if (fin > inicio) out.push({ fecha, inicio, fin, desde: f.desde, hasta: f.hasta });
  }
  return out;
}
/** ¿La programación cubre el instante T? (una franja nunca dura más de 24 h de pared: basta mirar T y la víspera). */
export function cubre(prog, T, zona = ZONA) {
  const hoy = partesLocales(T, zona).fecha;
  for (const fecha of [sumarDias(hoy, -1), hoy])
    for (const o of ocurrenciasDia(prog, fecha, zona)) if (o.inicio <= T && T < o.fin) return true;
  return false;
}
/** Ocurrencias que se solapan con [desde, hasta), en orden (sin fundir). */
export function expandir(prog, desde, hasta, zona = ZONA) {
  const out = [];
  if (!(hasta > desde)) return out;
  let fecha = sumarDias(partesLocales(desde, zona).fecha, -1);
  const ultima = partesLocales(hasta, zona).fecha;
  for (let n = 0; fecha <= ultima && n < MAX_DIAS_EXPANDIDOS; n += 1, fecha = sumarDias(fecha, 1))
    for (const o of ocurrenciasDia(prog, fecha, zona)) if (o.fin > desde && o.inicio < hasta) out.push(o);
  return out.sort((a, b) => a.inicio - b.inicio || a.fin - b.fin);
}
/** Intervalos de emisión fundidos (franjas contiguas o solapadas son uno solo) que tocan [desde, hasta). */
export function intervalos(prog, desde, hasta, zona = ZONA) {
  const out = [];
  for (const o of expandir(prog, desde, hasta, zona)) {
    const ultimo = out[out.length - 1];
    if (ultimo && o.inicio <= ultimo.fin) ultimo.fin = Math.max(ultimo.fin, o.fin);
    else out.push({ inicio: o.inicio, fin: o.fin });
  }
  return out;
}
/**
 * Próximo instante > T en el que la programación empieza o deja de emitir, como mucho `limite` (48 h por defecto).
 * null si no cambia nada antes. Los bordes entre franjas contiguas (o entre un día entero y el siguiente) no cuentan.
 */
export function proximoBorde(prog, T, limite = T + HORIZONTE_MS, zona = ZONA) {
  let mejor = null;
  for (const { inicio, fin } of intervalos(prog, T - DIA_MS, limite + DIA_MS, zona))
    for (const b of [inicio, fin]) if (b > T && b <= limite && (mejor === null || b < mejor)) mejor = b;
  return mejor;
}
/**
 * Cotas precalculadas para el filtro SQL (inicio_utc <= instante < fin_utc): conservadoras, nunca más estrechas que
 * la programación real. Rango abierto: inicio 0 y fin FIN_ABIERTO.
 */
export function rangoUtc(prog, zona = ZONA) {
  let desde = prog.fecha_desde || null, hasta = prog.fecha_hasta || null;
  const r = prog.recurrencia;
  if (r && r.tipo === "fechas" && r.fechas.length) {
    const a = r.fechas[0], b = r.fechas[r.fechas.length - 1];
    if (!desde || a > desde) desde = a;
    if (!hasta || b < hasta) hasta = b;
  }
  const cruzan = franjasDe(prog).filter(f => f.hasta <= f.desde);
  const extra = cruzan.length ? Math.max(...cruzan.map(f => f.hasta)) : 0;
  return { inicio_utc: desde ? aUtc(desde, 0, zona) : 0, fin_utc: hasta ? aUtc(sumarDias(hasta, 1), extra, zona) : FIN_ABIERTO };
}
