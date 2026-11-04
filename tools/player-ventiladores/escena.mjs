// Escena de la Supercomputer: qué pinta cada ventilador y cómo se ilumina.
// Lo usan el puente (Node), la página de render (navegador) y el gemelo, así que aquí no
// puede haber APIs de Node: solo lógica pura.

// Modos (en castellano y en inglés):
//  · independiente  — cada ventilador es su propio player con su pieza (independent, autónomo)
//  · repetir        — la misma pieza en los 7, al mismo tiempo (repeat, espejo)
//  · extender       — una pieza estirada sobre los 7 como un mural (extend, adaptar, adapt)
//  · sincro         — la pieza pasa de un ventilador al siguiente sin perder el hilo (sync, relevo)
const ALIAS_MODO = {
  independiente: 'independiente', independent: 'independiente', autonomo: 'independiente', 'autónomo': 'independiente', autonomous: 'independiente',
  repetir: 'repetir', repeat: 'repetir', repeticion: 'repetir', 'repetición': 'repetir', espejo: 'repetir', mirror: 'repetir',
  extender: 'extender', extend: 'extender', extendido: 'extender', extended: 'extender', adaptar: 'extender', adapt: 'extender', estirar: 'extender', stretch: 'extender',
  sincro: 'sincro', sync: 'sincro', sincronizar: 'sincro', synchronized: 'sincro', relevo: 'sincro',
  identificar: 'identificar', identify: 'identificar', numeros: 'identificar', 'números': 'identificar'
};
//  · identificar    — cada pantalla enseña su número, puerto y posición (para ubicarlos en el gemelo)
export const MODOS = ['independiente', 'repetir', 'extender', 'sincro', 'identificar'];
export const modoCanonico = m => ALIAS_MODO[String(m ?? '').toLowerCase().trim()] || null;

const ALIAS_AJUSTE = { cubrir: 'cubrir', cover: 'cubrir', estirar: 'estirar', stretch: 'estirar', fill: 'estirar', contener: 'contener', contain: 'contener' };
const ID = /^[A-Za-z0-9-]{1,80}$/;
const lista = v => [].concat(v ?? []).map(String).filter(id => ID.test(id));
const entero = (v, min, max, def) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def; };

export function normalizarEscena(raw = {}, fans = 7) {
  const modo = modoCanonico(raw.modo ?? raw.mode);
  if (!modo) throw new Error(`modo desconocido: ${raw.modo ?? raw.mode}`);
  const todos = Array.from({ length: fans }, (_, i) => i + 1);
  const orden = lista(raw.orden).map(Number).filter((n, i, a) => n >= 1 && n <= fans && a.indexOf(n) === i);
  const ids = Object.fromEntries(Object.entries(raw.ids || {}).map(([k, v]) => [String(k), lista(v).slice(0, 12)]).filter(([, v]) => v.length));
  const piezas = lista(raw.piezas ?? raw.pieza).slice(0, fans);
  const columnas = entero(raw.columnas, 1, fans, fans);
  return {
    modo, ids, piezas,
    paso: entero(raw.paso, 1, 120, 4),                       // sincro: segundos en cada ventilador
    orden: orden.length === fans ? orden : todos,            // recorrido de extender y sincro
    columnas, filas: entero(raw.filas, 1, fans, Math.ceil(fans / columnas)),
    ajuste: ALIAS_AJUSTE[String(raw.ajuste ?? '').toLowerCase()] || 'cubrir',
    epoch: Number(raw.epoch) > 0 ? Number(raw.epoch) : 0,    // origen del reloj común (ms)
    revision: Number(raw.revision) || 0
  };
}

// Qué pinta el ventilador `fan` (número físico 1..7) en el instante `ahora` (ms).
//  extender → una tesela de la rejilla; sincro → la pieza que le toca en este paso o negro.
// El reloj de vídeo es común: t = (ahora − epoch) / 1000, así el relevo no reinicia la pieza.
export function asignacion(escena, fan, ahora = Date.now()) {
  if (escena.modo === 'identificar') return { tipo: 'numero', fan };
  const pos = escena.orden.indexOf(fan);
  if (pos < 0) return { tipo: 'negro' };
  const t = Math.max(0, (ahora - escena.epoch) / 1000);
  if (escena.modo === 'extender') {
    if (!escena.piezas.length) return { tipo: 'negro' };
    return { tipo: 'tesela', pieza: escena.piezas[0], t, ajuste: escena.ajuste,
      col: pos % escena.columnas, fila: Math.floor(pos / escena.columnas), columnas: escena.columnas, filas: escena.filas };
  }
  if (escena.modo === 'sincro') {
    const n = escena.orden.length, paso = Math.floor(t / escena.paso);
    const k = (((pos - paso) % n) + n) % n;                  // la pieza k avanza un ventilador por paso
    return k < escena.piezas.length ? { tipo: 'pieza', pieza: escena.piezas[k], t, k } : { tipo: 'negro' };
  }
  return { tipo: 'canal' };                                  // independiente y repetir los pinta el canal
}

// ── Iluminación ────────────────────────────────────────────────────────────────
// Efectos del controlador UNI FAN TL (byte de modo). «respirar» solo existe como efecto de grupo.
const EFECTOS = {
  apagado: 0, fijo: 3, arcoiris: 1, respirar: 4, ciclo: 7, meteoro: 6, pista: 5, ola: 21, carrera: 22
};
const ALIAS_EFECTO = {
  apagado: 'apagado', off: 'apagado', fijo: 'fijo', static: 'fijo', estatico: 'fijo', 'estático': 'fijo', color: 'fijo',
  arcoiris: 'arcoiris', 'arcoíris': 'arcoiris', rainbow: 'arcoiris', respirar: 'respirar', breathing: 'respirar', breathe: 'respirar',
  ciclo: 'ciclo', cycle: 'ciclo', colorcycle: 'ciclo', meteoro: 'meteoro', meteor: 'meteoro', pista: 'pista', runway: 'pista',
  ola: 'ola', wave: 'ola', carrera: 'carrera', racing: 'carrera'
};
export const EFECTOS_LUZ = Object.keys(EFECTOS);
export const efectoCanonico = e => ALIAS_EFECTO[String(e ?? '').toLowerCase().trim()] || null;

export function colorRgb(v) {
  if (Array.isArray(v) && v.length === 3) return v.map(c => entero(c, 0, 255, 0));
  const m = /^#?([0-9a-f]{6})$/i.exec(String(v ?? ''));
  if (!m) return [255, 255, 255];
  const n = parseInt(m[1], 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

function luzSimple(raw = {}, base = {}) {
  const efecto = efectoCanonico(raw.efecto ?? raw.modo ?? raw.mode) || base.efecto || 'fijo';
  // brillo: 0–4 del firmware o 0–100 (porcentaje); velocidad 0–4.
  const b = Number(raw.brillo ?? raw.brightness);
  const brillo = Number.isFinite(b) ? (b > 4 ? Math.round(Math.min(100, b) / 25) : entero(b, 0, 4, 4)) : (base.brillo ?? 4);
  const colores = [].concat(raw.colores ?? raw.color ?? base.colores ?? ['#ffffff']).slice(0, 4).map(colorRgb);
  return { efecto, brillo, velocidad: entero(raw.velocidad ?? raw.speed, 0, 4, base.velocidad ?? 2), colores };
}

// { efecto, color|colores, brillo, velocidad, ventiladores: { "3": {…} }, sigueVideo }
export function normalizarLuz(raw = {}) {
  const general = luzSimple(raw);
  const ventiladores = Object.fromEntries(Object.entries(raw.ventiladores || {})
    .filter(([k]) => /^[1-9]$/.test(k)).map(([k, v]) => [k, luzSimple(v, general)]));
  return { ...general, ventiladores, sigueVideo: !!raw.sigueVideo, revision: Number(raw.revision) || 0 };
}

// Carga de 20 bytes de SetFanLight (0xA3) / SetFanGroupLight (0xB0):
// [0..1] destino · [2] efecto · [3] brillo 0–4 · [4] velocidad 0–4 · [5..16] 4 colores RGB ·
// [17] dirección · [18] apagado · [19] nº de colores.
export function cargaLuz(destino, luz) {
  const p = new Uint8Array(20);
  p[0] = destino[0]; p[1] = destino[1];
  p[2] = luz.efecto === 'apagado' ? EFECTOS.fijo : EFECTOS[luz.efecto];
  p[3] = luz.efecto === 'apagado' ? 0 : luz.brillo;
  p[4] = luz.velocidad;
  luz.colores.forEach((c, i) => { p[5 + i * 3] = c[0]; p[6 + i * 3] = c[1]; p[7 + i * 3] = c[2]; });
  p[18] = luz.efecto === 'apagado' ? 1 : 0;
  p[19] = luz.colores.length;
  return p;
}

// Luz efectiva de cada ventilador. Con sigueVideo en sincro, el ventilador que tiene la pieza
// se enciende con la luz general y los demás quedan a brillo mínimo.
export function luzDe(luz, fan, escena, ahora = Date.now()) {
  const propia = luz.ventiladores[String(fan)] || luz;
  if (luz.sigueVideo && escena?.modo === 'sincro' && asignacion(escena, fan, ahora).tipo === 'negro') {
    return { ...propia, efecto: 'fijo', brillo: 0 };
  }
  return propia;
}
