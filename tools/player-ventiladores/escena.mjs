// Escena de la Supercomputer: qué pinta cada ventilador y cómo se ilumina.
// Lo usan el puente (Node), la página de render (navegador) y el gemelo, así que aquí no
// puede haber APIs de Node: solo lógica pura.

// Modos (en castellano y en inglés):
//  · independiente  — cada ventilador es su propio player con su pieza (independent, autónomo)
//  · repetir        — la misma pieza en los 7, al mismo tiempo (repeat, espejo)
//  · extender       — una pieza estirada sobre los 7 como un mural (extend, adaptar, adapt)
//  · sincro         — la pieza pasa de un ventilador al siguiente sin perder el hilo (sync, relevo)
//  · secuencia      — la pieza entera en un ventilador, luego entera en el siguiente, del 1 al 7, y vuelta a
//                     empezar; solo se enciende el que la tiene (sequence, secuencial · PC-COCINA, 6-nov-2026)
const ALIAS_MODO = {
  secuencia: 'secuencia', sequence: 'secuencia', secuencial: 'secuencia', sequential: 'secuencia', cadena: 'secuencia', chain: 'secuencia',
  independiente: 'independiente', independent: 'independiente', autonomo: 'independiente', 'autónomo': 'independiente', autonomous: 'independiente',
  repetir: 'repetir', repeat: 'repetir', repeticion: 'repetir', 'repetición': 'repetir', espejo: 'repetir', mirror: 'repetir',
  extender: 'extender', extend: 'extender', extendido: 'extender', extended: 'extender', adaptar: 'extender', adapt: 'extender', estirar: 'extender', stretch: 'extender',
  sincro: 'sincro', sync: 'sincro', sincronizar: 'sincro', synchronized: 'sincro', relevo: 'sincro',
  identificar: 'identificar', identify: 'identificar', numeros: 'identificar', 'números': 'identificar'
};
//  · identificar    — cada pantalla enseña su número, puerto y posición (para ubicarlos en el gemelo)
export const MODOS = ['independiente', 'repetir', 'extender', 'sincro', 'secuencia', 'identificar'];
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
    // secuencia: duración de la pieza en segundos. La mide la página de escena al cargar el vídeo y se la pasa
    // al puente; mientras no se sepa (0) se usa `paso`.
    duracion: Number(raw.duracion) > 0 ? Math.min(3600, Number(raw.duracion)) : 0,
    audio: normalizarAudio(raw.audio, fans),
    revision: Number(raw.revision) || 0
  };
}

// Audio (PC-COCINA, 6-nov-2026): como mucho suena un ventilador, para que no se oigan siete pistas a la vez.
//  · ventilador: el que suena (1..fans); 0 = ninguno. En repetir hay un solo canal: cualquier número = con sonido.
//  · salida: nombre del dispositivo de salida de Windows (el que enseña Chrome); vacío = el predeterminado del PC.
//  · volumen: 0–1.
export function normalizarAudio(raw, fans = 7) {
  const a = raw && typeof raw === 'object' ? raw : {};
  const v = Number(a.volumen ?? a.volume);
  return {
    ventilador: entero(a.ventilador ?? a.fan ?? 0, 0, fans, 0),
    salida: String(a.salida ?? a.output ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 160),
    volumen: Number.isFinite(v) ? Math.round(Math.max(0, Math.min(1, v)) * 100) / 100 : 1
  };
}

// Secuencia: qué ventilador tiene la pieza en el instante t (s desde epoch) y por qué segundo va.
export function turnoSecuencia(escena, t) {
  const d = escena.duracion > 0 ? escena.duracion : escena.paso, vuelta = Math.floor(Math.max(0, t) / d);
  return { fan: escena.orden[vuelta % escena.orden.length], t: Math.max(0, t) - vuelta * d, d };
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
  if (escena.modo === 'secuencia') {
    // Una sola pieza (la primera): entera en cada ventilador, en el orden de `orden`. Los demás, en negro.
    if (!escena.piezas.length) return { tipo: 'negro' };
    const turno = turnoSecuencia(escena, t);
    return turno.fan === fan ? { tipo: 'pieza', pieza: escena.piezas[0], t: turno.t } : { tipo: 'negro' };
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

// Otras luces de la caja (PC-COCINA, 6-nov-2026): los dos cables Strimer Plus (el de la gráfica y el de 24 pines
// de la placa) y la memoria. Como los ventiladores, sin luz propia siguen a la general.
const ALIAS_DISPOSITIVO = {
  grafica: 'grafica', 'gráfica': 'grafica', gpu: 'grafica', pcie: 'grafica', strimergpu: 'grafica',
  placa: 'placa', atx: 'placa', '24pin': 'placa', '24pines': 'placa', motherboard: 'placa', strimeratx: 'placa',
  memoria: 'memoria', ram: 'memoria', dram: 'memoria', memory: 'memoria'
};
export const DISPOSITIVOS_LUZ = ['grafica', 'placa', 'memoria'];
export const dispositivoCanonico = d => ALIAS_DISPOSITIVO[String(d ?? '').toLowerCase().replace(/[\s_-]/g, '')] || null;

// { efecto, color|colores, brillo, velocidad, ventiladores: { "3": {…} }, dispositivos: { grafica: {…} }, sigueVideo }
export function normalizarLuz(raw = {}) {
  const general = luzSimple(raw);
  const ventiladores = Object.fromEntries(Object.entries(raw.ventiladores || {})
    .filter(([k]) => /^[1-9]$/.test(k)).map(([k, v]) => [k, luzSimple(v, general)]));
  const dispositivos = {};
  for (const [k, v] of Object.entries(raw.dispositivos || {})) {
    const c = dispositivoCanonico(k);
    if (c && v && typeof v === 'object') dispositivos[c] = luzSimple(v, general);
  }
  return { ...general, ventiladores, dispositivos, sigueVideo: !!raw.sigueVideo, revision: Number(raw.revision) || 0 };
}

// Luz efectiva de un dispositivo: la suya o la general (sin el relevo de sincro/secuencia, que es de los ventiladores).
export function luzDispositivo(luz, clave) {
  const propia = luz?.dispositivos?.[clave];
  if (propia) return propia;
  return { efecto: luz.efecto, brillo: luz.brillo, velocidad: luz.velocidad, colores: luz.colores };
}

// Strimer Plus (USB 0CF2:A200): modo, velocidad y brillo del firmware y los colores en el orden que espera (R, B, G).
// Velocidad y brillo van al revés que en el controlador TL (0 = el más rápido / el más brillante).
// Referencia: sgtaziz/lian-li-linux (MIT), crates/lianli-devices/src/strimer_plus.rs.
const MODO_STRIMER = { apagado: 0, fijo: 1, respirar: 2, ciclo: 4, arcoiris: 5, ola: 24, carrera: 27, pista: 28, meteoro: 32 };
const ARCOIRIS_STRIMER = [[255, 0, 0], [255, 105, 0], [255, 215, 0], [0, 255, 0], [0, 0, 255], [170, 0, 255]];
export const LEDS_STRIMER = 27;
export function cargaStrimer(luz) {
  const colores = luz.efecto === 'apagado' ? []
    : ['arcoiris', 'ciclo'].includes(luz.efecto) ? ARCOIRIS_STRIMER
      : ['fijo', 'respirar'].includes(luz.efecto) ? Array(LEDS_STRIMER).fill(luz.colores[0])
        : luz.colores;
  return {
    modo: MODO_STRIMER[luz.efecto] ?? MODO_STRIMER.fijo,
    velocidad: [2, 1, 0, 255, 254][luz.velocidad] ?? 0,
    brillo: [4, 3, 2, 1, 0][luz.brillo] ?? 0,
    colores: colores.flatMap(c => [c[0], c[2], c[1]])
  };
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
// En secuencia la luz acompaña siempre al vídeo (sin casilla): solo brilla el ventilador activo, y si la
// luz general está apagada se enciende en fijo con su color para que se vea el relevo.
export function luzDe(luz, fan, escena, ahora = Date.now()) {
  const propia = luz.ventiladores[String(fan)] || luz;
  const sigue = escena?.modo === 'secuencia' || (luz.sigueVideo && escena?.modo === 'sincro');
  if (sigue && asignacion(escena, fan, ahora).tipo === 'negro') {
    return { ...propia, efecto: 'fijo', brillo: 0 };
  }
  // «respirar» es de grupo (todo el puerto): en secuencia se cambia por fijo para no encender a los vecinos.
  if (escena?.modo === 'secuencia' && ['apagado', 'respirar'].includes(propia.efecto)) return { ...propia, efecto: 'fijo', brillo: propia.brillo || 4 };
  return propia;
}
