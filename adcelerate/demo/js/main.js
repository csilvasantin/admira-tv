// ADcelerate demo — gemelo Plaça de la Vila de Gràcia
// x = este (m), z = sur (m); origen = kiosko News & Coffee (OSM 3350101407)
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';

/* ============================== datos de demo ============================== */
// «Datos telco de zona (simulados sobre patrón MITMA)» — deterministas
const FRANJAS = [
  { id: '08h', aforo: 140, mix: { familias: 30, jovenes: 25, turistas: 10, seniors: 35 } },
  { id: '13h', aforo: 320, mix: { familias: 40, jovenes: 20, turistas: 25, seniors: 15 } },
  { id: '18h', aforo: 460, mix: { familias: 25, jovenes: 40, turistas: 20, seniors: 15 } },
  { id: '22h', aforo: 300, mix: { familias: 5,  jovenes: 38, turistas: 45, seniors: 12 } },
];
const PERFILES = ['familias', 'jovenes', 'turistas', 'seniors'];
const PERFIL_LABEL = { familias: 'Familias', jovenes: 'Jóvenes', turistas: 'Turistas', seniors: 'Seniors' };
// Paleta de marcas AdmiraNeXT (tokens.css): amber · violet · magenta · green; el CIAN es la espina
const PERFIL_COLOR = { familias: 0xffd866, jovenes: 0xaa88ff, turistas: 0xff4488, seniors: 0x76b900 };
const PERFIL_CSS   = { familias: '#ffd866', jovenes: '#aa88ff', turistas: '#ff4488', seniors: '#76b900' };
const SPINE = 0x50c8ff;                    // --admira-cyan

// Motor de reglas ADcelerate: perfil dominante → creatividad
const REGLAS = {
  familias: { cre: 'A', titulo: 'PLAN FAMILIAR',    sub: '2×1 xocolata · Granja de la Plaça', bg: '#ffd866', fg: '#3a2a00' },
  jovenes:  { cre: 'B', titulo: 'NIT DE GRÀCIA',    sub: 'Session 18–22h · craft & vinils',   bg: '#aa88ff', fg: '#180f3a' },
  turistas: { cre: 'C', titulo: 'GRÀCIA WALKS',     sub: 'Guided tour EN/FR · every hour',    bg: '#ff4488', fg: '#33020f' },
  seniors:  { cre: 'D', titulo: 'MATINS TRANQUILS', sub: 'Farmàcia & salut · Vila de Gràcia', bg: '#76b900', fg: '#152600' },
};
const DAY_SECONDS = 90;               // AUTO: el día completo del gemelo en 90 s
const FRANJA_H = [8, 13, 18, 22];     // los botones de franja son atajos del reloj

// CURVA 24h construida sobre la tabla de franjas: valle nocturno 2–6h casi vacío,
// pico de mediodía y pico de tarde 18–20h (patrón MITMA simulado, continuo)
const CURVA24 = [
  { h: 0,    aforo: 90,  mix: { familias: 4,  jovenes: 42, turistas: 42, seniors: 12 } },
  { h: 2,    aforo: 22,  mix: { familias: 2,  jovenes: 56, turistas: 36, seniors: 6 } },
  { h: 4,    aforo: 8,   mix: { familias: 2,  jovenes: 48, turistas: 30, seniors: 20 } },
  { h: 6,    aforo: 30,  mix: { familias: 8,  jovenes: 14, turistas: 14, seniors: 64 } },
  { h: 8,    aforo: 140, mix: { familias: 30, jovenes: 25, turistas: 10, seniors: 35 } },
  { h: 10.5, aforo: 235, mix: { familias: 36, jovenes: 20, turistas: 18, seniors: 26 } },
  { h: 13,   aforo: 320, mix: { familias: 40, jovenes: 20, turistas: 25, seniors: 15 } },
  { h: 15.5, aforo: 265, mix: { familias: 32, jovenes: 24, turistas: 28, seniors: 16 } },
  { h: 18,   aforo: 460, mix: { familias: 25, jovenes: 40, turistas: 20, seniors: 15 } },
  { h: 20,   aforo: 430, mix: { familias: 18, jovenes: 42, turistas: 28, seniors: 12 } },
  { h: 22,   aforo: 300, mix: { familias: 5,  jovenes: 38, turistas: 45, seniors: 12 } },
  { h: 24,   aforo: 90,  mix: { familias: 4,  jovenes: 42, turistas: 42, seniors: 12 } },
];
function audienciaAt(h) {
  h = ((h % 24) + 24) % 24;
  let a = CURVA24[0], b = CURVA24[CURVA24.length - 1];
  for (let i = 0; i < CURVA24.length - 1; i++) {
    if (h >= CURVA24[i].h && h <= CURVA24[i + 1].h) { a = CURVA24[i]; b = CURVA24[i + 1]; break; }
  }
  const t = b.h === a.h ? 0 : (h - a.h) / (b.h - a.h);
  const mix = {};
  for (const p of PERFILES) mix[p] = lerp(a.mix[p], b.mix[p], t);
  return { aforo: lerp(a.aforo, b.aforo, t), mix };
}
function nearestFranjaIdx(h) {
  let best = 0, bd = 99;
  FRANJA_H.forEach((fh, i) => {
    const d = Math.min(Math.abs(h - fh), 24 - Math.abs(h - fh));
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}
function fmtHora(h) {
  const q = Math.round((((h % 24) + 24) % 24) * 4) % 96;   // pasos de 15 min
  return String(Math.floor(q / 4)).padStart(2, '0') + ':' + String((q % 4) * 15).padStart(2, '0');
}
function fmtHoraSec(h) {                                   // HH:MM:SS (RT · 1:1)
  const s = Math.floor((((h % 24) + 24) % 24) * 3600);
  return String(Math.floor(s / 3600)).padStart(2, '0') + ':' +
         String(Math.floor(s / 60) % 60).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}
const SIGNAGE_URL = 'https://api.admira.store/signage/now?screen=oohmedia';
const SIGNAGE_POLL_MS = 30000;
const MAX_CROWD = 800;                // techo del slider de personas (y de las instancias)
// Stock público del canal admira.tv (R2, CORS abierto) — el contenido REAL en antena
const STOCK_URL = 'https://pub-bf043a4daa3b43b7a0b769617729d074.r2.dev/stock/index.json';
const STOCK_MAX_ITEMS = 14;
const STOCK_MAX_VIDEO_BYTES = 15e6;   // ?v= es Content-Length: fuera mp4 gigantes
const IMG_SECONDS = 9;                // como canal.html
const VIDEO_CAP_MS = 30000;           // tope por pieza en la demo

/* ============================== utilidades ============================== */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const $ = id => document.getElementById(id);

/* ============================== escena base ============================== */
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe9e2d2);      // tarde cálida
scene.fog = new THREE.Fog(0xe9e2d2, 420, 780);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.5, 1500);
camera.position.set(95, 34, 95);           // arranque en volado libre mirando al kiosko
camera.rotation.order = 'YXZ';

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(15, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI / 2.05;
controls.minDistance = 12;
controls.maxDistance = 520;
controls.autoRotate = false;
controls.autoRotateSpeed = 0.35;
controls.enabled = false;                  // el modo por defecto es volado libre

const ambLight = new THREE.AmbientLight(0xfff2df, 0.62);
const hemiLight = new THREE.HemisphereLight(0xd8e6f2, 0xead9bd, 0.6);
scene.add(ambLight, hemiLight);
const sun = new THREE.DirectionalLight(0xffd9a6, 1.8);   // sol de tarde, bajo y cálido
sun.position.set(-240, 170, -60);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -320; sun.shadow.camera.right = 320;
sun.shadow.camera.top = 320; sun.shadow.camera.bottom = -320;
sun.shadow.camera.far = 900;
sun.shadow.camera.updateProjectionMatrix();
sun.shadow.bias = -0.0004;
scene.add(sun);

// suelo — disco tipo maqueta
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(340, 64).rotateX(-Math.PI / 2),
  new THREE.MeshLambertMaterial({ color: 0xe4dcc9 })
);
ground.receiveShadow = true;
ground.position.y = -0.05;
scene.add(ground);

/* ============ CICLO SOLAR CONTINUO (hora 0–24 → luz/cielo/neones) ============ */
// El reloj del gemelo manda. SUN.sr/ss = amanecer/ocaso REALES de la fecha cargada
// (daily=sunrise,sunset de Open-Meteo); si no hay dato, defaults verano BCN aprox.
const SUN_DEFAULT = { sr: 7, ss: 20.5 };
const SUN = { ...SUN_DEFAULT };
const SKY24 = [   // keyframes de cielo/niebla por hora (día nominal 7→20.5, ver skyRemap)
  [0, 0x07090f], [4.6, 0x07090f], [6.0, 0x1c2138], [7.2, 0xd9906b], [9, 0xe9e2d2],
  [13, 0xedf0ec], [17.5, 0xe9e2d2], [19.6, 0xf0a868], [20.8, 0x3a2c48],
  [21.8, 0x10131f], [23, 0x07090f], [24, 0x07090f],
];
const _skyA = new THREE.Color(), _mixC = new THREE.Color();
const _sunNoon = new THREE.Color(0xfff2dd);
const _ambDay = new THREE.Color(0xfff2df);
const smooth01 = (a, b, x) => {
  let t = (x - a) / (b - a);
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
};
function skyAt(h, out) {
  for (let i = 0; i < SKY24.length - 1; i++) {
    const [ha, ca] = SKY24[i], [hb, cb] = SKY24[i + 1];
    if (h >= ha && h <= hb) {
      const t = hb === ha ? 0 : (h - ha) / (hb - ha);
      return out.setHex(ca).lerp(_mixC.setHex(cb), t);
    }
  }
  return out.setHex(SKY24[0][1]);
}
let forceNight = false;
// Los keyframes SKY24 están en el «día nominal» (7→20.5). Con sunrise/sunset REALES
// de la fecha, remapea la hora para que alba/ocaso del cielo caigan en su hora real.
function skyRemap(h) {
  const NR = 7, NS = 20.5;
  if (h <= SUN.sr) return h * (NR / Math.max(0.1, SUN.sr));
  if (h >= SUN.ss) return NS + (h - SUN.ss) * ((24 - NS) / Math.max(0.1, 24 - SUN.ss));
  return NR + (h - SUN.sr) * ((NS - NR) / Math.max(0.1, SUN.ss - SUN.sr));
}
function applyEnvironment(h) {
  const sr = SUN.sr, ss = SUN.ss;          // ciclo solar en la hora REAL de la fecha
  const dayT = (h - sr) / (ss - sr);
  const dl = (dayT > 0 && dayT < 1) ? Math.sin(Math.PI * dayT) : 0;   // luz diurna 0..1
  // farolas/ventanas/neón: encendido en crepúsculo, pleno de noche (relativo al ocaso/alba)
  const lampF = Math.min(1, smooth01(ss - 0.7, ss + 0.4, h) + smooth01(sr + 0.6, sr - 0.6, h));
  skyAt(skyRemap(h), _skyA);
  scene.background.copy(_skyA);
  scene.fog.color.copy(_skyA);
  if (dl > 0.02) {                       // sol: recorre este→oeste, cálido cuando rasante
    sun.position.set(Math.cos(Math.PI * dayT) * 240, 40 + Math.sin(Math.PI * dayT) * 220, -80);
    sun.color.copy(_mixC.setHex(0xffa860).lerp(_sunNoon, Math.min(1, dl * 1.4)));
    sun.intensity = 0.25 + 1.65 * dl;
    sun.castShadow = true;
  } else {                               // luna fría, sin sombras (ahorro nocturno de FPS)
    sun.position.set(-120, 210, 80);
    sun.color.setHex(0x8fa8e0);
    sun.intensity = 0.3;
    sun.castShadow = false;
  }
  ambLight.intensity = 0.24 + 0.40 * dl;   // mínimo nocturno: multitud legible
  ambLight.color.copy(_mixC.setHex(0x9aa8d8).lerp(_ambDay, dl));
  hemiLight.intensity = 0.10 + 0.50 * dl;
  if (buildingsMesh) buildingsMesh.material.emissive.setScalar(lampF * 0.9); // ventanas
  for (const L of lampLights) L.intensity = lampF * 95;                      // farolas
  lampGlowMat.opacity = lampF;
  if (kioskLight) kioskLight.intensity = lampF * 85;                         // kiosko-neón
  if (kioskHalo) kioskHalo.material.opacity = 0.3 + 0.4 * lampF;
  plazaEdge.material.opacity = 0.7 + 0.3 * lampF;
}

/* ============ METEO REAL (Open-Meteo) aplicada al gemelo ============ */
// Barcelona · Plaça de la Vila de Gràcia. Sin clave, CORS abierto.
const WX_LAT = 41.4002, WX_LON = 2.1576;
const WX_FORECAST = 'https://api.open-meteo.com/v1/forecast';
const WX_ARCHIVE  = 'https://archive-api.open-meteo.com/v1/archive';
const WX_QS = 'hourly=temperature_2m,weather_code,precipitation&daily=sunrise,sunset&timezone=Europe%2FMadrid';

const weather = {
  date: null, temp: null, code: null, precip: null,   // arrays horarios (24)
  endpoint: '', raw: null, ok: false, loading: false,
  current: null,                                       // RT: {temp, code, precip, time} de AHORA
  sunrise: null, sunset: null,                         // horas decimales reales de la fecha
  msg: 'meteo real · Open-Meteo · Vila de Gràcia',
};
// "2026-07-12T06:24" → 6.4 (hora decimal)
const isoHourOf = s => { const m = /T(\d\d):(\d\d)/.exec(s || ''); return m ? +m[1] + +m[2] / 60 : null; };
// factores aplicados a la escena (lerp suave hacia el objetivo de la hora)
const wxApplied = { cloud: 0, rain: 0, snow: 0, storm: 0, cold: 0, warm: 0 };
let wxCrowdFactor = 1, wxFlash = 0, wxFlashNext = 3;

const isoOf = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const isoToday = () => isoOf(new Date());
const addDays = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); return isoOf(new Date(y, m - 1, d + n)); };
function daysFromToday(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const a = new Date(y, m - 1, d), b = new Date(); b.setHours(0, 0, 0, 0);
  return Math.round((a - b) / 86400000);
}
// override de test para capturas: ?wx=rain|snow|storm|clouds|clear|fog → 24h sintéticas
function wxTestOverride() {
  const p = new URLSearchParams(location.search).get('wx');
  if (!p) return null;
  const map = { clear: { c: 0, t: 26, pr: 0 }, clouds: { c: 3, t: 17, pr: 0 }, rain: { c: 63, t: 12, pr: 2.4 },
                storm: { c: 95, t: 14, pr: 3.2 }, snow: { c: 73, t: -1, pr: 1.1 }, fog: { c: 45, t: 6, pr: 0 } };
  const w = map[p]; if (!w) return null;
  return { temp: Array(24).fill(w.t), code: Array(24).fill(w.c), precip: Array(24).fill(w.pr), test: p };
}

async function loadWeather(iso, jumpToSunrise = false) {
  weather.date = iso; weather.loading = true;
  onWeatherLoaded();                                   // pinta «cargando…»
  const test = wxTestOverride();
  if (test) {
    weather.temp = test.temp; weather.code = test.code; weather.precip = test.precip;
    weather.endpoint = 'test?wx=' + test.test; weather.raw = { test: test.test };
    weather.sunrise = weather.sunset = null; Object.assign(SUN, SUN_DEFAULT);
    weather.ok = true; weather.loading = false; weather.msg = 'meteo TEST (' + test.test + ')';
    onWeatherLoaded();
    if (jumpToSunrise) jumpHourToSunrise();
    return;
  }
  const base = daysFromToday(iso) < -90 ? WX_ARCHIVE : WX_FORECAST;
  const url = `${base}?latitude=${WX_LAT}&longitude=${WX_LON}&${WX_QS}&start_date=${iso}&end_date=${iso}`;
  weather.endpoint = url;
  try {
    const r = await fetch(url, { cache: 'no-store' });
    const j = await r.json();
    const h = j.hourly;
    if (!h || !h.temperature_2m || h.temperature_2m.length < 24 || h.temperature_2m[0] == null) throw new Error('sin datos');
    weather.temp = h.temperature_2m; weather.code = h.weather_code; weather.precip = h.precipitation || Array(24).fill(0);
    // sunrise/sunset REALES de la fecha → ciclo solar del gemelo en su hora real
    weather.sunrise = isoHourOf(j.daily?.sunrise?.[0]); weather.sunset = isoHourOf(j.daily?.sunset?.[0]);
    SUN.sr = weather.sunrise ?? SUN_DEFAULT.sr; SUN.ss = weather.sunset ?? SUN_DEFAULT.ss;
    weather.raw = j; weather.ok = true; weather.msg = 'meteo real · Open-Meteo · Vila de Gràcia';
  } catch (e) {
    weather.ok = false; weather.temp = weather.code = weather.precip = null; weather.raw = null;
    weather.sunrise = weather.sunset = null; Object.assign(SUN, SUN_DEFAULT);
    weather.msg = 'meteo no disponible (la escena sigue)';
  }
  weather.loading = false;
  onWeatherLoaded();
  if (jumpToSunrise) jumpHourToSunrise();
}
// al cambiar de día a mano: el reloj arranca en el AMANECER real de esa fecha
function jumpHourToSunrise() {
  if (rt.active) return;                               // con RT activo manda RT
  $('auto-toggle').checked = false; state.auto = false;
  setHour(weather.sunrise ?? SUN.sr, false);
  updateHoraUI();
}

/* ============ RT · TIEMPO REAL (hora + meteo de ahora, Europe/Madrid) ============ */
// Al activar: calendario→HOY, reloj→hora real ESTRICTA 1:1 (un segundo aquí = un
// segundo en la plaza; el bucle animate copia rtHourNow() cada frame, sin lerp ni
// aceleración), chip/escena→current de Open-Meteo. AUTO queda INCOMPATIBLE con RT.
// Se desactiva solo al tocar slider/fecha/franja.
const rt = { active: false, timer: 0, baseHour: 0, baseMs: 0 };
let calSetDate = null;                                 // ref al setter del calendario (buildHUD)
// reloj 1:1 anclado: baseHour (Madrid) + tiempo transcurrido real; re-ancla cada 30 s
function rtHourNow() {
  return rt.baseMs ? (rt.baseHour + (Date.now() - rt.baseMs) / 3600000) % 24 : madridNow();
}
// hora decimal actual en Europe/Madrid (independiente del huso del navegador)
function madridNow() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const g = t => +(parts.find(p => p.type === t)?.value || 0);
  let hh = g('hour'); if (hh === 24) hh = 0;
  return (hh + g('minute') / 60 + g('second') / 3600) % 24;
}
async function fetchCurrentWx() {
  try {
    const url = `${WX_FORECAST}?latitude=${WX_LAT}&longitude=${WX_LON}&current=temperature_2m,weather_code,precipitation&timezone=Europe%2FMadrid`;
    const r = await fetch(url, { cache: 'no-store' });
    const j = await r.json();
    if (j && j.current && j.current.temperature_2m != null) {
      weather.current = {
        temp: j.current.temperature_2m, code: j.current.weather_code,
        precip: j.current.precipitation ?? 0, time: j.current.time,
      };
      updateWxChip(); updateExpert(true);
    }
  } catch (e) { /* mantenemos el último current */ }
}
// sincroniza calendario/ancla/meteo con AHORA (se repite cada 30 s mientras RT esté activo)
function rtSync() {
  if (!rt.active) return;
  const cal = $('cal-date');
  if (cal && calSetDate && cal.value !== isoToday()) calSetDate(isoToday());   // (a) calendario→HOY
  rt.baseHour = madridNow(); rt.baseMs = Date.now();                            // (b) re-ancla el 1:1
  state.hour = state.targetHour = rt.baseHour; hourDirty = true;
  updateHoraUI();
  fetchCurrentWx();                                                             // (c) meteo de ahora
}
function setRT(on) {
  if (rt.active === on) { if (on) rtSync(); return; }
  rt.active = on;
  const btn = $('rt-btn');
  if (btn) { btn.classList.toggle('rt-on', on); btn.setAttribute('aria-pressed', on ? 'true' : 'false'); }
  if (on) {
    $('auto-toggle').checked = false; state.auto = false;   // el AUTO de 90 s se desactiva
    rtSync();
    if (!rt.timer) rt.timer = setInterval(rtSync, 30000);   // avanza en vivo (≤30 s)
  } else {
    clearInterval(rt.timer); rt.timer = 0; rt.baseMs = 0;
    weather.current = null;
    updateHoraUI(); updateWxChip(); updateExpert(true);
  }
}

// muestreo horario interpolado (temp/precip continuos; code por hora más cercana)
function wxSample(h) {
  // RT activo: la escena y el chip reflejan el dato REAL de ahora mismo (current=…)
  if (rt.active && weather.current) {
    return { temp: weather.current.temp, precip: weather.current.precip ?? 0, code: weather.current.code };
  }
  if (!weather.ok || !weather.temp) return null;
  h = ((h % 24) + 24) % 24;
  const i0 = Math.floor(h) % 24, i1 = (i0 + 1) % 24, t = h - Math.floor(h);
  return {
    temp: lerp(weather.temp[i0] ?? 0, weather.temp[i1] ?? 0, t),
    precip: lerp(weather.precip?.[i0] ?? 0, weather.precip?.[i1] ?? 0, t),
    code: weather.code[t < 0.5 ? i0 : i1] ?? 0,
  };
}
// WMO → icono. De NOCHE (mismo criterio que el ciclo solar: SUN.sr/ss reales de la
// fecha) ningún icono lleva sol ni «nube de mediodía» pelada: matiz nocturno 🌙.
function wxIcon(code, h) {
  if (code == null) return '·';
  const night = (h < SUN.sr || h > SUN.ss + 0.1);
  if (code === 0) return night ? '🌙' : '☀️';                        // despejado
  if (code <= 2) return night ? '🌙☁️' : '🌤';                       // poco nuboso → luna + nube
  if (code === 3) return night ? '☁️🌙' : '☁️';                      // nublado → nube con matiz nocturno
  if (code >= 45 && code <= 48) return night ? '🌫🌙' : '🌫';        // niebla
  if (code >= 51 && code <= 67) return night ? '🌧🌙' : '🌧';        // llovizna/lluvia
  if (code >= 71 && code <= 77) return night ? '🌨🌙' : '🌨';        // nieve
  if (code >= 80 && code <= 82) return night ? '🌧🌙' : '🌦';        // chubascos (🌦 lleva sol de día)
  if (code === 85 || code === 86) return night ? '🌨🌙' : '🌨';      // chubascos de nieve
  if (code >= 95) return night ? '⛈🌙' : '⛈';                       // tormenta
  return night ? '☁️🌙' : '☁️';
}
// sample → factores objetivo de escena
function wxTargets(s) {
  const T = { cloud: 0, rain: 0, snow: 0, storm: 0, cold: 0, warm: 0 };
  if (!s) return T;
  const c = s.code;
  if (c === 1) T.cloud = 0.2;
  else if (c === 2) T.cloud = 0.5;
  else if (c === 3) T.cloud = 0.85;
  if (c >= 45 && c <= 48) T.cloud = Math.max(T.cloud, 0.75);         // niebla = cielo cerrado
  const rainy = (c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95;
  if (rainy) {
    T.cloud = Math.max(T.cloud, 0.9);
    const byCode = c >= 63 ? 0.9 : (c >= 55 ? 0.65 : 0.4);
    T.rain = Math.max(0.35, Math.min(1, Math.max(byCode, s.precip / 3)));
  }
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) {                // nieve
    T.cloud = Math.max(T.cloud, 0.85);
    T.snow = c >= 75 ? 0.9 : 0.55; T.rain = 0;
  }
  if (c >= 95) T.storm = 1;
  T.cold = Math.max(0, Math.min(1, (10 - s.temp) / 12));             // frío <10º → azulado
  T.warm = Math.max(0, Math.min(1, (s.temp - 28) / 8));             // calor >28º → cálido/bruma
  return T;
}

/* ---- sistema de partículas de precipitación (Points reciclados, barato) ---- */
const MAX_DROPS = 1400;
let dropCap = MAX_DROPS;                 // se recorta si el FPS baja de 50
let precipPoints = null, precipPos = null, dropData = null, precipMode = 'none';
let dropTex = null, snowTex = null, groundBase = null, plazaBase = null;
const _grey = new THREE.Color(0x9aa0a6), _coldTint = new THREE.Color(0xbcd0ff),
      _warmTint = new THREE.Color(0xffcf9e), _wetGround = new THREE.Color(0x8f8a7c),
      _wetPlaza = new THREE.Color(0x8a8168), _flashCol = new THREE.Color(0xdfe8ff), _wxTmp = new THREE.Color();
function buildPrecip() {
  const geo = new THREE.BufferGeometry();
  precipPos = new Float32Array(MAX_DROPS * 3);
  dropData = new Float32Array(MAX_DROPS);          // fase de deriva por copo
  for (let i = 0; i < MAX_DROPS; i++) {
    precipPos[i * 3] = (Math.random() - .5) * 160;
    precipPos[i * 3 + 1] = Math.random() * 70;
    precipPos[i * 3 + 2] = (Math.random() - .5) * 160;
    dropData[i] = Math.random() * Math.PI * 2;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(precipPos, 3));
  geo.setDrawRange(0, 0);
  dropTex = canvasTexture(16, 40, (c, w, hh) => {                   // gota: estría vertical
    c.clearRect(0, 0, w, hh);
    const g = c.createLinearGradient(0, 0, 0, hh);
    g.addColorStop(0, 'rgba(198,222,255,0)'); g.addColorStop(.5, 'rgba(200,226,255,.9)'); g.addColorStop(1, 'rgba(198,222,255,0)');
    c.fillStyle = g; c.fillRect(w / 2 - 1.6, 2, 3.2, hh - 4);
  });
  snowTex = canvasTexture(32, 32, (c, w, hh) => {                   // copo: disco suave
    c.clearRect(0, 0, w, hh);
    const g = c.createRadialGradient(w / 2, hh / 2, 0, w / 2, hh / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(.5, 'rgba(240,246,255,.6)'); g.addColorStop(1, 'rgba(240,246,255,0)');
    c.fillStyle = g; c.beginPath(); c.arc(w / 2, hh / 2, w / 2, 0, 7); c.fill();
  });
  const mat = new THREE.PointsMaterial({ map: dropTex, size: 2.6, transparent: true,
    depthWrite: false, opacity: 0, sizeAttenuation: true });
  precipPoints = new THREE.Points(geo, mat);
  precipPoints.frustumCulled = false; precipPoints.renderOrder = 6; precipPoints.visible = false;
  scene.add(precipPoints);
  groundBase = ground.material.color.clone();
  plazaBase = plazaMesh.material.color.clone();
}
function updatePrecip(dt) {
  if (!precipPoints) return;
  const rain = wxApplied.rain, snow = wxApplied.snow, inten = Math.max(rain, snow);
  if (inten < 0.01) { precipPoints.visible = false; return; }
  precipPoints.visible = true;
  const mode = snow > rain ? 'snow' : 'rain', mat = precipPoints.material;
  if (mode !== precipMode) {
    precipMode = mode;
    mat.map = mode === 'snow' ? snowTex : dropTex;
    mat.size = mode === 'snow' ? 1.7 : 2.7;
    mat.needsUpdate = true;
  }
  mat.opacity = mode === 'snow' ? snow * 0.92 : rain * 0.85;
  const n = Math.min(dropCap, Math.round(MAX_DROPS * inten));
  precipPoints.geometry.setDrawRange(0, n);
  const cx = camera.position.x, cz = camera.position.z;
  const fall = mode === 'snow' ? 6.5 : 58, t = performance.now() / 1000;
  for (let i = 0; i < n; i++) {
    const b = i * 3;
    precipPos[b + 1] -= fall * dt * (mode === 'snow' ? 1 : (0.8 + (i % 5) * 0.08));
    if (mode === 'snow') {
      precipPos[b] += Math.sin(t * 0.6 + dropData[i]) * dt * 1.3;
      precipPos[b + 2] += Math.cos(t * 0.5 + dropData[i]) * dt * 1.1;
    }
    if (precipPos[b + 1] < 0.3) {
      precipPos[b + 1] = 52 + Math.random() * 22;
      precipPos[b] = cx + (Math.random() - .5) * 150;
      precipPos[b + 2] = cz + (Math.random() - .5) * 150;
    }
    if (Math.abs(precipPos[b] - cx) > 92) precipPos[b] = cx + (Math.random() - .5) * 150;      // seguir a la cámara
    if (Math.abs(precipPos[b + 2] - cz) > 92) precipPos[b + 2] = cz + (Math.random() - .5) * 150;
  }
  precipPoints.geometry.attributes.position.needsUpdate = true;
}
// overlay meteo sobre el ciclo solar (se llama tras applyEnvironment; no acumula)
function applyWeatherToScene() {
  const w = wxApplied, overcast = Math.max(w.cloud, w.rain, w.snow);
  sun.intensity *= (1 - overcast * 0.60);                          // sol plano y difuso
  if (overcast > 0.01) {
    scene.background.lerp(_grey, overcast * ((w.rain > 0.2 || w.snow > 0.2) ? 0.55 : 0.38));
    scene.fog.color.copy(scene.background);
  }
  const fogPull = Math.max(w.rain, w.snow, w.storm) * 0.6 + w.cloud * 0.15;
  scene.fog.near = lerp(420, 120, fogPull);
  scene.fog.far = lerp(780, 430, fogPull);
  ambLight.intensity += overcast * 0.10;                           // difusa: legibilidad
  hemiLight.intensity += overcast * 0.08;
  if (w.cold > 0.01) { sun.color.lerp(_coldTint, w.cold * 0.5); ambLight.color.lerp(_coldTint, w.cold * 0.4); }
  if (w.warm > 0.01) { sun.color.lerp(_warmTint, w.warm * 0.5); scene.fog.near = lerp(scene.fog.near, 260, w.warm * 0.5); }
  const wet = Math.min(1, w.rain * 0.9 + w.snow * 0.2);            // suelo mojado
  if (groundBase) ground.material.color.copy(groundBase).lerp(_wetGround, wet * 0.5);
  if (plazaBase) plazaMesh.material.color.copy(plazaBase).lerp(_wetPlaza, wet * 0.6);
  if (w.storm > 0.3 && wxFlash > 0) {                              // relámpago
    ambLight.intensity += wxFlash * 1.6; hemiLight.intensity += wxFlash * 0.8;
    scene.background.lerp(_flashCol, wxFlash * 0.5); scene.fog.color.copy(scene.background);
  }
}

/* ---- texturas procedurales (canvas, coste 0) ---- */
function canvasTexture(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const tx = new THREE.CanvasTexture(cv);
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
  tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
}
// celda de fachada 3×3 m: una ventana por planta (v = altura en m)
const winTx = canvasTexture(96, 96, (c, w, h) => {
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
  c.fillStyle = 'rgba(70,92,106,.85)';                 // hueco
  c.fillRect(30, 26, 36, 46);
  c.fillStyle = 'rgba(255,255,255,.55)';               // cristal con brillo
  c.fillRect(33, 29, 30, 18);
  c.strokeStyle = 'rgba(46,62,72,.9)'; c.lineWidth = 3; // marco
  c.strokeRect(30, 26, 36, 46);
  c.fillStyle = 'rgba(46,62,72,.35)';                  // alfeizar
  c.fillRect(26, 70, 44, 4);
});
winTx.repeat.set(1 / 3, 1 / 3);
// ventanas ENCENDIDAS de noche: mosaico 4×4 de celdas (unas iluminadas, otras no)
// → emissiveMap con repeat/4: patrón pseudoaleatorio sin materiales extra
const winNightTx = canvasTexture(384, 384, (c, w, h) => {
  c.fillStyle = '#000000'; c.fillRect(0, 0, w, h);
  const rr = mulberry32(99);
  const warm = ['#ffd27a', '#ffc063', '#f2e3b2', '#e8a94e'];
  for (let cy = 0; cy < 4; cy++) {
    for (let cx = 0; cx < 4; cx++) {
      if (rr() < 0.42) {                      // ~42% de ventanas con luz
        c.fillStyle = warm[Math.floor(rr() * warm.length)];
        c.globalAlpha = 0.55 + rr() * 0.45;
        c.fillRect(cx * 96 + 30, cy * 96 + 26, 36, 46);
        c.globalAlpha = 1;
      }
    }
  }
});
winNightTx.repeat.set(1 / 12, 1 / 12);
// pavimento de la plaza (baldosa 2×2 m)
const plazaTx = canvasTexture(128, 128, (c, w, h) => {
  c.fillStyle = '#e9dcbb'; c.fillRect(0, 0, w, h);
  c.strokeStyle = 'rgba(120,104,72,.35)'; c.lineWidth = 3;
  c.strokeRect(0, 0, w, h);
  c.strokeStyle = 'rgba(120,104,72,.16)'; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(w / 2, 0); c.lineTo(w / 2, h); c.moveTo(0, h / 2); c.lineTo(w, h / 2); c.stroke();
});
// asfalto con grano
const asfaltoTx = canvasTexture(128, 128, (c, w, h) => {
  c.fillStyle = '#b9b4a8'; c.fillRect(0, 0, w, h);
  const rr = mulberry32(7);
  for (let i = 0; i < 420; i++) {
    c.fillStyle = rr() > 0.5 ? 'rgba(90,88,80,.20)' : 'rgba(240,238,230,.18)';
    c.fillRect(rr() * w, rr() * h, 1.6, 1.6);
  }
});
// adoquín peatonal
const adoquinTx = canvasTexture(128, 128, (c, w, h) => {
  c.fillStyle = '#d8cdb4'; c.fillRect(0, 0, w, h);
  c.strokeStyle = 'rgba(110,96,70,.3)'; c.lineWidth = 2;
  for (let y = 0; y < h; y += 32) {
    for (let x = 0; x < w; x += 32) {
      const off = (y / 32) % 2 ? 16 : 0;
      c.strokeRect(x + off, y, 32, 32);
    }
  }
});

/* ============================== plaza ============================== */
// Explanada sintética (OSM no trae polígono de plaza): rectángulo local aprox.
const PLAZA = { x0: -8, x1: 32, z0: -20, z1: 26 };
const TORRE = { x: 22.7, z: 7.1, r: 6.5 };   // Campanar de Gràcia, en medio de la plaza
plazaTx.repeat.set((PLAZA.x1 - PLAZA.x0) / 2, (PLAZA.z1 - PLAZA.z0) / 2);
const plazaMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(PLAZA.x1 - PLAZA.x0, PLAZA.z1 - PLAZA.z0).rotateX(-Math.PI / 2),
  new THREE.MeshLambertMaterial({ map: plazaTx })
);
plazaMesh.position.set((PLAZA.x0 + PLAZA.x1) / 2, 0.02, (PLAZA.z0 + PLAZA.z1) / 2);
plazaMesh.receiveShadow = true;
plazaMesh.name = 'plaza';
scene.add(plazaMesh);
const plazaEdge = new THREE.LineLoop(
  new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(PLAZA.x0, 0.08, PLAZA.z0), new THREE.Vector3(PLAZA.x1, 0.08, PLAZA.z0),
    new THREE.Vector3(PLAZA.x1, 0.08, PLAZA.z1), new THREE.Vector3(PLAZA.x0, 0.08, PLAZA.z1),
  ]),
  new THREE.LineBasicMaterial({ color: 0x50c8ff, transparent: true, opacity: 0.85 })
);
scene.add(plazaEdge);

// farolas de la plaza (4 puntos de luz cálidos, solo de noche; sin sombras = baratas)
const lampLights = [];
const lampGlowMat = new THREE.MeshBasicMaterial({ color: 0xffc880, transparent: true, opacity: 0 });
{
  const poleGeo = new THREE.CylinderGeometry(0.06, 0.10, 4.6, 6);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2a333c });
  const bulbGeo = new THREE.SphereGeometry(0.17, 8, 6);
  for (const [lx, lz] of [[-5, -17], [29, -17], [29, 23], [-5, 23]]) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(poleGeo, poleMat); pole.position.y = 2.3;
    const bulb = new THREE.Mesh(bulbGeo, lampGlowMat); bulb.position.y = 4.55;
    const light = new THREE.PointLight(0xffc880, 0, 26, 1.8); light.position.y = 4.4;
    g.add(pole, bulb, light);
    g.position.set(lx, 0, lz);
    scene.add(g);
    lampLights.push(light);
  }
}

/* ============================== kiosko héroe ============================== */
const kiosk = new THREE.Group();
kiosk.name = 'kiosk';
let kioskHalo = null, kioskLight = null;
const screenCanvas = document.createElement('canvas');
screenCanvas.width = 640; screenCanvas.height = 360;
const screenCtx = screenCanvas.getContext('2d');
const screenTexture = new THREE.CanvasTexture(screenCanvas);
screenTexture.colorSpace = THREE.SRGBColorSpace;
let screenMat;
{
  const base = new THREE.Mesh(new THREE.BoxGeometry(4.6, 3.0, 3.4),
    new THREE.MeshLambertMaterial({ color: 0x2e4b57 }));
  base.position.y = 1.5; base.castShadow = true;

  const trim = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.25, 3.6),
    new THREE.MeshLambertMaterial({ color: 0x50c8ff }));
  trim.position.y = 3.1;

  // techo abovedado (media caña a lo largo de x)
  const roofGeo = new THREE.CylinderGeometry(1.75, 1.75, 4.9, 24, 1, false, 0, Math.PI);
  roofGeo.rotateZ(Math.PI / 2);
  const roof = new THREE.Mesh(roofGeo, new THREE.MeshLambertMaterial({ color: 0x3d6d7d }));
  roof.position.y = 3.2; roof.castShadow = true;

  // LA pantalla — cara este (hacia la plaza)
  screenMat = new THREE.MeshBasicMaterial({ map: screenTexture, toneMapped: false });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 1.75), screenMat);
  screen.rotation.y = Math.PI / 2;
  screen.position.set(2.34, 1.75, 0);
  screen.name = 'kioskScreen';
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.0, 3.35),
    new THREE.MeshLambertMaterial({ color: 0x14262e }));
  frame.position.set(2.26, 1.75, 0);

  // rótulo "News & Coffee"
  const signCv = document.createElement('canvas');
  signCv.width = 512; signCv.height = 80;
  const sc = signCv.getContext('2d');
  sc.fillStyle = '#14262e'; sc.fillRect(0, 0, 512, 80);
  sc.fillStyle = '#50c8ff'; sc.font = 'bold 44px Menlo, monospace';
  sc.textAlign = 'center'; sc.textBaseline = 'middle';
  sc.fillText('NEWS & COFFEE', 256, 42);
  const signTx = new THREE.CanvasTexture(signCv);
  signTx.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.56),
    new THREE.MeshBasicMaterial({ map: signTx, toneMapped: false }));
  sign.rotation.y = Math.PI / 2;
  sign.position.set(2.42, 3.15, 0);

  // halo cian en el suelo (espina)
  const halo = new THREE.Mesh(new THREE.RingGeometry(3.6, 4.5, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x50c8ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
  halo.position.y = 0.06;
  kioskHalo = halo;

  // de noche la pantalla brilla como neón e ilumina su entorno
  kioskLight = new THREE.PointLight(0x9fdcff, 0, 32, 1.6);
  kioskLight.position.set(5, 3.2, 0);

  kiosk.add(base, trim, roof, screen, frame, sign, halo, kioskLight);
}
scene.add(kiosk);

/* ============================== estado ============================== */
const state = {
  franjaIdx: 2,                      // franja más cercana al reloj (para fichas/experto)
  hour: 18, targetHour: 18,          // reloj de 24 h del gemelo (arranca en hora punta)
  auto: true,
  cur: { aforo: 0, mix: { familias: 25, jovenes: 25, turistas: 25, seniors: 25 } },
  dominante: null,
  realItem: null,
};
let hourDirty = true;
// aforo manual (slider de personas): manual=false → sigue el dato telco de la curva
const aforoCtl = { manual: false, value: 0 };
function setHour(h, animar = true) {
  state.targetHour = ((h % 24) + 24) % 24;
  if (!animar) state.hour = state.targetHour;
  hourDirty = true;
}
const franja = () => FRANJAS[state.franjaIdx];

function dominanteDe(mix) {
  return PERFILES.reduce((a, b) => (mix[a] >= mix[b] ? a : b));
}

/* ============== pantalla del kiosko: canal admira.tv REAL + banda ADcelerate ============== */
// Estado normal: emite el Stock real del canal (vídeo/imagen desde R2, CORS abierto).
// La regla ADcelerate pasa a ser una RECOMENDACIÓN en banda inferior (no sustituye la emisión).
// Fallback (sin red / sin piezas): creatividades canvas A–D.
let stockQueue = [], stockIdx = -1, stockItem = null, stockImg = null;
let stockLive = false, stockErrors = 0, stockTimer = 0;
const vid = document.createElement('video');
vid.muted = true; vid.playsInline = true; vid.preload = 'auto'; vid.crossOrigin = 'anonymous';
vid.addEventListener('ended', () => nextStock());
vid.addEventListener('error', () => stockSkipError());
vid.addEventListener('loadeddata', () => { stockErrors = 0; });

// Creatividades por perfil (subTrinity-pixeria) — same-origin, viajan con la deploy.
// Prioridad de pantalla: canal real admira.tv > creatividad demo por perfil > canvas.
let creManifest = null;
const creImgs = {};
fetch('creatividades/creatividades.json', { cache: 'no-store' })
  .then(r => r.json())
  .then(j => {
    creManifest = j.creatividades || null;
    for (const p of PERFILES) {
      if (!creManifest || !creManifest[p]) continue;
      const im = new Image();
      im.onload = () => { creImgs[p] = im; };
      im.src = 'creatividades/' + p + '.png';   // same-origin (mismo deploy)
    }
  })
  .catch(() => { /* sin manifiesto: canvas fallback */ });

async function loadStock() {
  try {
    const r = await fetch(STOCK_URL, { cache: 'no-store' });
    const j = await r.json();
    const size = u => { const m = /[?&]v=(\d+)/.exec(u || ''); return m ? +m[1] : 0; };
    stockQueue = (j.items || []).filter(it => it.url && (
      (it.type === 'video' && size(it.url) > 0 && size(it.url) <= STOCK_MAX_VIDEO_BYTES) ||
      it.type === 'image'
    )).slice(0, STOCK_MAX_ITEMS);
    if (stockQueue.length) { stockLive = true; stockErrors = 0; nextStock(); }
    else stockLive = false;
  } catch (e) { stockLive = false; }
  updateFeedHUD(); updateOnscreenHUD();
}
function stockSkipError() {
  stockErrors++;
  if (stockErrors > stockQueue.length) {   // todo falla → fallback honesto
    stockLive = false; stockItem = null;
    updateFeedHUD(); updateOnscreenHUD();
    return;
  }
  nextStock();
}
function nextStock() { playStock(stockIdx + 1); }
let playSeq = 0;                          // token: descarta rechazos de play() obsoletos
function playStock(i) {
  clearTimeout(stockTimer);
  if (!stockQueue.length) return;
  const seq = ++playSeq;
  stockIdx = ((i % stockQueue.length) + stockQueue.length) % stockQueue.length;
  stockItem = stockQueue[stockIdx];
  stockImg = null;
  if (stockItem.type === 'video') {
    vid.src = stockItem.url;
    // un salto rápido del player ABORTA el play() anterior: eso no es un fallo de pieza
    vid.play().catch(() => { if (seq === playSeq && vid.error) stockSkipError(); });
    stockTimer = setTimeout(nextStock, VIDEO_CAP_MS);
  } else {
    vid.pause(); vid.removeAttribute('src');
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => { stockImg = im; stockErrors = 0; };
    im.onerror = () => stockSkipError();
    im.src = stockItem.url;
    stockTimer = setTimeout(nextStock, IMG_SECONDS * 1000);
  }
  updateOnscreenHUD();
}
function stockTitle() {
  if (!stockItem) return '';
  return String(stockItem.title || stockItem.id).replace(/&#39;/g, "'").slice(0, 60);
}
/* ---- mando del player del kiosko (⇧+flechas, como un player de admira.tv) ----
   ⇧→ siguiente pieza · ⇧← anterior · ⇧↑ primera · ⇧↓ última. La altura del vuelo
   pasó a Av/Re Pág en exclusiva para liberar ⇧+↑↓ (antes también era altura). */
let toastTimer = 0;
function showToast(msg) {
  const t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}
function playerCmd(key) {
  if (!stockQueue.length) { showToast('▶ canal sin loop activo (fallback)'); return; }
  stockErrors = 0;                        // mando manual: borrón y cuenta nueva
  if (!stockLive) { stockLive = true; updateFeedHUD(); }   // revive el loop si había caído
  if (key === 'ArrowRight') playStock(stockIdx + 1);
  else if (key === 'ArrowLeft') playStock(stockIdx - 1);
  else if (key === 'ArrowUp') playStock(0);
  else if (key === 'ArrowDown') playStock(stockQueue.length - 1);
  else return;
  showToast('▶ pieza ' + (stockIdx + 1) + '/' + stockQueue.length + ' · ' + stockTitle().slice(0, 44));
}
function realItemName() {
  const it = state.realItem;
  if (!it) return '';
  return String(it.name || it.title || it.file || it.id || 'contenido').slice(0, 40);
}

function renderScreen() {
  const c = screenCtx, W = 640, H = 360;
  const dom = state.dominante || dominanteDe(franja().mix);
  const r = REGLAS[dom];
  let media = false;
  if (stockLive && stockItem) {
    let src = null, sw = 0, sh = 0;
    if (stockItem.type === 'video' && vid.readyState >= 2) { src = vid; sw = vid.videoWidth; sh = vid.videoHeight; }
    else if (stockImg) { src = stockImg; sw = stockImg.naturalWidth; sh = stockImg.naturalHeight; }
    c.fillStyle = '#06141a'; c.fillRect(0, 0, W, H);
    if (src && sw && sh) {
      const s = Math.max(W / sw, H / sh);
      c.drawImage(src, (W - sw * s) / 2, (H - sh * s) / 2, sw * s, sh * s);
    } else {
      c.fillStyle = '#50c8ff'; c.font = '20px Menlo, monospace';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('· cargando canal admira.tv ·', W / 2, H / 2);
    }
    media = true;
    // barra superior: qué emite el canal
    c.fillStyle = 'rgba(6,20,26,.78)'; c.fillRect(0, 0, W, 34);
    c.textAlign = 'left'; c.textBaseline = 'middle'; c.font = 'bold 15px Menlo, monospace';
    c.fillStyle = '#ff5252'; c.fillText('●', 12, 18);
    c.fillStyle = '#eaf6fb'; c.fillText(('EN ANTENA admira.tv · ' + stockTitle()).slice(0, 56), 30, 18);
  }
  if (media) {
    // banda inferior: recomendación ADcelerate sobre la emisión real (+miniatura pixeria)
    c.fillStyle = 'rgba(6,20,26,.84)'; c.fillRect(0, H - 54, W, 54);
    c.fillStyle = r.bg; c.fillRect(0, H - 54, 8, 54);
    c.textAlign = 'left'; c.textBaseline = 'middle'; c.font = 'bold 16px Menlo, monospace';
    c.fillStyle = '#9fdcf5'; c.fillText('ADcelerate recomienda:', 20, H - 37);
    c.fillStyle = '#ffffff';
    c.fillText(`Creatividad ${r.cre} · ${r.titulo} (${PERFIL_LABEL[dom].toLowerCase()})`, 20, H - 15);
    if (creImgs[dom]) c.drawImage(creImgs[dom], W - 94, H - 50, 82, 46);
  } else if (creImgs[dom]) {
    // creatividad demo por perfil (pixeria): imagen real 16:9
    c.drawImage(creImgs[dom], 0, 0, W, H);
    c.fillStyle = 'rgba(6,20,26,.78)'; c.fillRect(0, 0, W, 30);
    c.textAlign = 'left'; c.textBaseline = 'middle'; c.font = 'bold 14px Menlo, monospace';
    c.fillStyle = '#9fdcf5';
    c.fillText(`CREATIVIDAD DEMO · ADcelerate → ${PERFIL_LABEL[dom]} (regla ${r.cre})`, 12, 16);
  } else {
    // último fallback: creatividad canvas de la regla
    c.fillStyle = r.bg; c.fillRect(0, 0, W, H);
    c.fillStyle = 'rgba(255,255,255,.16)'; c.fillRect(0, 0, W, 64);
    c.fillStyle = r.fg;
    c.font = 'bold 26px Menlo, monospace'; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText(`CREATIVIDAD ${r.cre}`, 24, 32);
    c.textAlign = 'center';
    c.font = 'bold 58px -apple-system, sans-serif';
    c.fillText(r.titulo, W / 2, 168);
    c.font = '26px -apple-system, sans-serif';
    c.fillText(r.sub, W / 2, 222);
    c.font = '17px Menlo, monospace';
    c.fillStyle = 'rgba(0,0,0,.55)';
    c.fillText('ADcelerate → OOH Media · Plaça Vila de Gràcia', W / 2, 322);
  }
  screenTexture.needsUpdate = true;
}

/* ============================== feed del circuito (signage/now) ============================== */
async function pollSignage() {
  try {
    const r = await fetch(SIGNAGE_URL, { cache: 'no-store' });
    const j = await r.json();
    lastSignageRaw = j;
    state.realItem = (j && j.ok && j.item) ? j.item : null;
    updateFeedHUD(); updateOnscreenHUD();
  } catch (e) { /* red caída: sin romper */ }
}
function updateFeedHUD() {
  const badge = $('badge-real'), feed = $('feedstate'), sig = $('signagestate');
  // qué alimenta la pantalla del kiosko del gemelo
  feed.textContent = stockLive ? 'CANAL admira.tv (stock R2)' :
    (creManifest ? 'creatividad demo (pixeria)' : 'simulado (regla)');
  feed.classList.toggle('live', stockLive);
  // qué reporta el player físico del circuito
  if (state.realItem) {
    badge.classList.remove('hidden');
    sig.textContent = 'EMITIENDO · ' + realItemName().slice(0, 22);
    sig.classList.add('real');
  } else {
    badge.classList.add('hidden');
    sig.classList.remove('real');
    sig.textContent = 'sin emisión (item:null)';
  }
}

/* ============================== carga de la ciudad ============================== */
let buildingsMesh = null, roofsMesh = null, roadsMesh = null;
let buildingPick = [], roofsPick = [];   // [{tri0, tri1, meta}] por malla
const rng = mulberry32(20260712);

fetch('data/gracia-local.json').then(r => r.json()).then(data => {
  buildCity(data);
  buildCrowd(data);
  $('loading').classList.add('done');
}).catch(err => {
  $('loading').innerHTML = '<p>Error cargando datos: ' + err + '</p>';
});

function buildCity(data) {
  // ---- edificios extruidos: FACHADAS (con ventanas procedurales) y CUBIERTAS separadas,
  //      fusionadas en 2 draw calls, con mapa de picking por triángulo en cada una
  const palette = [0xf2e3c9, 0xe9d5b8, 0xdfc9a8, 0xecdcc4, 0xe4cfae, 0xd9c3a5];
  const walls = { pos: [], col: [], uv: [], pick: [], tri: 0 };
  const roofs = { pos: [], col: [], uv: [], pick: [], tri: 0 };
  const tmpColor = new THREE.Color();
  const roofColor = new THREE.Color();
  for (const b of data.buildings) {
    if (b.pts.length < 3) continue;
    const shape = new THREE.Shape();
    shape.moveTo(b.pts[0][0], -b.pts[0][1]);
    for (let i = 1; i < b.pts.length; i++) shape.lineTo(b.pts[i][0], -b.pts[i][1]);
    let g;
    try {
      g = new THREE.ExtrudeGeometry(shape, { depth: b.h, bevelEnabled: false });
    } catch (e) { continue; }
    g.rotateX(-Math.PI / 2);
    const ci = (b.id || 0) % palette.length;
    tmpColor.setHex(b.name ? 0xf0dbb5 : palette[ci]);
    roofColor.copy(tmpColor).multiplyScalar(0.82);      // cubierta más apagada
    const posA = g.attributes.position.array;
    const uvA = g.attributes.uv.array;
    // groups: materialIndex 0 = tapas (cubierta), 1 = laterales (fachada)
    for (const grp of g.groups) {
      const dst = grp.materialIndex === 1 ? walls : roofs;
      const col = grp.materialIndex === 1 ? tmpColor : roofColor;
      const nTri = grp.count / 3;
      for (let vi = grp.start; vi < grp.start + grp.count; vi++) {
        dst.pos.push(posA[vi * 3], posA[vi * 3 + 1], posA[vi * 3 + 2]);
        dst.uv.push(uvA[vi * 2], uvA[vi * 2 + 1]);
        dst.col.push(col.r, col.g, col.b);
      }
      dst.pick.push({ tri0: dst.tri, tri1: dst.tri + nTri, meta: b });
      dst.tri += nTri;
    }
  }
  const mkGeo = acc => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(acc.pos), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(acc.uv), 2));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(acc.col), 3));
    geo.computeVertexNormals();
    return geo;
  };
  buildingsMesh = new THREE.Mesh(mkGeo(walls),
    new THREE.MeshLambertMaterial({
      vertexColors: true, map: winTx,
      emissiveMap: winNightTx, emissive: 0x000000,   // ventanas encendidas de noche
    }));
  buildingsMesh.castShadow = true;
  buildingsMesh.receiveShadow = true;
  buildingsMesh.name = 'buildings';
  buildingPick = walls.pick;
  roofsMesh = new THREE.Mesh(mkGeo(roofs),
    new THREE.MeshLambertMaterial({ vertexColors: true }));
  roofsMesh.castShadow = true;
  roofsMesh.receiveShadow = true;
  roofsMesh.name = 'roofs';
  roofsPick = roofs.pick;
  scene.add(buildingsMesh, roofsMesh);

  // ---- viales como cintas planas con textura (asfalto vs peatonal/adoquín)
  const W_BY_HW = { footway: 2.5, path: 2.5, steps: 2.5, pedestrian: 4, cycleway: 2.5, service: 3.5, living_street: 5, residential: 5.5, unclassified: 5.5, tertiary: 7, secondary: 9, primary: 10 };
  const PEATONAL = new Set(['footway', 'path', 'steps', 'pedestrian', 'living_street', 'cycleway']);
  const acc = { asf: { pos: [], uv: [] }, ado: { pos: [], uv: [] } };
  const v = new THREE.Vector2();
  for (const rd of data.roads) {
    const w = (W_BY_HW[rd.hw] || 4.5) / 2;
    const dst = PEATONAL.has(rd.hw) ? acc.ado : acc.asf;
    let u = 0;
    for (let i = 0; i < rd.pts.length - 1; i++) {
      const [x1, z1] = rd.pts[i], [x2, z2] = rd.pts[i + 1];
      const len = Math.hypot(x2 - x1, z2 - z1);
      v.set(z2 - z1, -(x2 - x1)).normalize().multiplyScalar(w); // perpendicular
      const u0 = u / 4, u1 = (u + len) / 4; u += len;
      const ax = x1 + v.x, az = z1 + v.y, bx = x1 - v.x, bz = z1 - v.y;
      const cx = x2 + v.x, cz = z2 + v.y, dx = x2 - v.x, dz = z2 - v.y;
      dst.pos.push(ax, 0.01, az, cx, 0.01, cz, bx, 0.01, bz,
                   bx, 0.01, bz, cx, 0.01, cz, dx, 0.01, dz);
      dst.uv.push(u0, 1, u1, 1, u0, 0, u0, 0, u1, 1, u1, 0);
    }
  }
  const mkRoad = (a, tx) => {
    if (!a.pos.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(a.pos), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(a.uv), 2));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tx }));
    m.receiveShadow = true;
    return m;
  };
  roadsMesh = new THREE.Group();
  const asf = mkRoad(acc.asf, asfaltoTx), ado = mkRoad(acc.ado, adoquinTx);
  if (asf) roadsMesh.add(asf);
  if (ado) roadsMesh.add(ado);
  scene.add(roadsMesh);
}

/* ============== multitud: figuras humanas low-poly que CAMINAN ============== */
// ~110 triángulos/figura (torso+brazos, piernas, cabeza en 3 InstancedMesh sincronizados).
// 600 figuras ≈ 66k triángulos → LOD innecesario (medir FPS en modo experto).
const ROPA = {   // ropa por perfil — variaciones de la paleta de marcas admira
  familias: [0xffd866, 0xf0b84a, 0xd99b2b, 0xffe9a8],   // ámbar
  jovenes:  [0xaa88ff, 0x8f66f0, 0xc9b3ff, 0x7d5ce0],   // violeta
  turistas: [0xff4488, 0xe03070, 0xff7aa8, 0xc72a60],   // magenta
  seniors:  [0x76b900, 0x5c8f0a, 0x8fce33, 0x4a7300],   // verde
};
let figures = null;                 // {group, body, legs, head}
let figCount = 0;
const crowdProfileU = new Float32Array(MAX_CROWD);
const figState = [];                // {x,z,tx,tz,speed,phase,s,kind,road,idx,dir}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _sv = new THREE.Vector3(), _pv = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function plazaPointValido() {
  for (let k = 0; k < 40; k++) {
    const x = lerp(PLAZA.x0 + 2, PLAZA.x1 - 2, rng());
    const z = lerp(PLAZA.z0 + 2, PLAZA.z1 - 2, rng());
    if (Math.hypot(x, z) < 5) continue;
    if (Math.hypot(x - TORRE.x, z - TORRE.z) < TORRE.r) continue;
    if (Math.hypot(x - 7.6, z) < 1.8) continue;    // no meterse dentro de la cámara Humano
    return [x, z];
  }
  return [PLAZA.x0 + 4, PLAZA.z1 - 4];
}

function buildCrowd(data) {
  const roadsNear = data.roads.filter(rd =>
    rd.pts.length > 1 && rd.pts.some(([x, z]) => Math.hypot(x, z) < 170));
  for (let i = 0; i < MAX_CROWD; i++) {
    crowdProfileU[i] = rng();
    const enPlaza = rng() < 0.65 || !roadsNear.length;
    const st = {
      speed: 0.7 + rng() * 0.8,
      phase: rng() * Math.PI * 2,
      s: rng() < 0.12 ? 0.55 + rng() * 0.1 : 0.88 + rng() * 0.24,  // 12% niños
      yaw: rng() * Math.PI * 2,
      kind: enPlaza ? 'plaza' : 'street',
      road: null, idx: 0, dir: 1,
    };
    if (enPlaza) {
      [st.x, st.z] = plazaPointValido();
      [st.tx, st.tz] = plazaPointValido();
    } else {
      st.road = roadsNear[Math.floor(rng() * roadsNear.length)];
      st.idx = Math.floor(rng() * st.road.pts.length);
      st.dir = rng() < 0.5 ? 1 : -1;
      const [px, pz] = st.road.pts[st.idx];
      st.x = px + (rng() - 0.5) * 3; st.z = pz + (rng() - 0.5) * 3;
      const j = Math.min(st.road.pts.length - 1, Math.max(0, st.idx + st.dir));
      [st.tx, st.tz] = st.road.pts[j];
    }
    figState.push(st);
  }
  // geometrías (low-poly): torso+brazos · piernas · cabeza
  const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  const bodyGeo = BGU.mergeGeometries([
    box(0.34, 0.56, 0.20, 0, 1.13, 0),
    box(0.09, 0.52, 0.11, -0.235, 1.10, 0),
    box(0.09, 0.52, 0.11, 0.235, 1.10, 0),
  ]);
  const legsGeo = BGU.mergeGeometries([
    box(0.13, 0.85, 0.15, -0.095, 0.425, 0),
    box(0.13, 0.85, 0.15, 0.095, 0.425, 0),
  ]);
  const headGeo = new THREE.SphereGeometry(0.115, 6, 5).translate(0, 1.56, 0);
  const body = new THREE.InstancedMesh(bodyGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), MAX_CROWD);
  const legs = new THREE.InstancedMesh(legsGeo, new THREE.MeshLambertMaterial({ color: 0x3b4148 }), MAX_CROWD);
  const head = new THREE.InstancedMesh(headGeo, new THREE.MeshLambertMaterial({ color: 0xe8b48c }), MAX_CROWD);
  for (const im of [body, legs, head]) {
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.count = 0;
    im.castShadow = true;
  }
  const group = new THREE.Group();
  group.add(body, legs, head);
  scene.add(group);
  figures = { group, body, legs, head };
  applyFranja(state.franjaIdx, true);
}

const _c = new THREE.Color();
function updateCrowd() {
  if (!figures) return;
  const n = Math.min(MAX_CROWD, Math.round(state.cur.aforo * wxCrowdFactor));   // aforo ajustado por meteo
  figCount = n;
  figures.body.count = n; figures.legs.count = n; figures.head.count = n;
  // umbrales acumulados del mix interpolado → perfil por figura → ropa de su paleta
  const mx = state.cur.mix;
  const tot = PERFILES.reduce((a, p2) => a + mx[p2], 0) || 1;
  const cum = []; let acc = 0;
  for (const p2 of PERFILES) { acc += mx[p2] / tot; cum.push(acc); }
  for (let i = 0; i < n; i++) {
    const u = crowdProfileU[i];
    let pi = 0; while (pi < 3 && u > cum[pi]) pi++;
    const pal = ROPA[PERFILES[pi]];
    _c.setHex(pal[(i * 7 + pi) % pal.length]);
    figures.body.setColorAt(i, _c);
  }
  if (figures.body.instanceColor) figures.body.instanceColor.needsUpdate = true;
}

// paseo por waypoints: plaza = deambular; calle = seguir el vial y volver
function updateFigureMotion(dt, t) {
  if (!figures || !figCount) return;
  for (let i = 0; i < figCount; i++) {
    const st = figState[i];
    const dx = st.tx - st.x, dz = st.tz - st.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.5) {
      if (st.kind === 'plaza') {
        [st.tx, st.tz] = plazaPointValido();
      } else {
        st.idx += st.dir;
        if (st.idx <= 0 || st.idx >= st.road.pts.length - 1) st.dir *= -1;
        st.idx = Math.min(st.road.pts.length - 1, Math.max(0, st.idx));
        const [px, pz] = st.road.pts[st.idx];
        st.tx = px + (rng() - 0.5) * 2; st.tz = pz + (rng() - 0.5) * 2;
      }
    } else {
      const vv = st.speed * dt / d;
      st.x += dx * vv; st.z += dz * vv;
      st.yaw = Math.atan2(dx, dz);
    }
    const paso = t * st.speed * 5 + st.phase;
    const bob = Math.abs(Math.sin(paso)) * 0.055;         // andar: bob
    _pv.set(st.x, bob, st.z);
    _q.setFromAxisAngle(UP, st.yaw + Math.sin(paso) * 0.06);  // leve balanceo
    _sv.set(st.s, st.s, st.s);
    _m.compose(_pv, _q, _sv);
    figures.body.setMatrixAt(i, _m);
    figures.legs.setMatrixAt(i, _m);
    figures.head.setMatrixAt(i, _m);
  }
  figures.body.instanceMatrix.needsUpdate = true;
  figures.legs.instanceMatrix.needsUpdate = true;
  figures.head.instanceMatrix.needsUpdate = true;
}

/* ============================== HUD ============================== */
function buildHUD() {
  const fr = $('franjas');
  FRANJAS.forEach((f, i) => {
    const b = document.createElement('button');
    b.textContent = f.id;
    b.onclick = () => { setRT(false); $('auto-toggle').checked = false; state.auto = false; setHour(FRANJA_H[i]); };
    fr.appendChild(b);
  });
  // AUTO es INCOMPATIBLE con RT: con RT activo no se puede armar (hay que apagar RT antes)
  $('auto-toggle').onchange = e => {
    if (e.target.checked && rt.active) { e.target.checked = false; showToast('RT activo · apaga RT para usar AUTO'); return; }
    state.auto = e.target.checked;
  };
  // botón RT: activa/desactiva el tiempo real
  const rtBtn = $('rt-btn');
  if (rtBtn) rtBtn.onclick = () => setRT(!rt.active);

  // calendario: fecha del gemelo → meteo real de esa fecha (Open-Meteo)
  const cal = $('cal-date');
  cal.min = '2020-01-01';
  cal.max = addDays(isoToday(), 15);                 // +15 d = límite de previsión
  const setDate = (iso, jumpToSunrise = false) => {
    if (iso < cal.min) iso = cal.min;
    if (iso > cal.max) iso = cal.max;
    cal.value = iso;
    $('cal-today').disabled = (iso === isoToday());
    $('cal-prev').disabled = (iso <= cal.min);
    $('cal-next').disabled = (iso >= cal.max);
    loadWeather(iso, jumpToSunrise);
  };
  // cambio de día A MANO → el reloj arranca en el AMANECER real de esa fecha
  cal.onchange = () => { setRT(false); setDate(cal.value || isoToday(), true); };
  $('cal-prev').onclick = () => { setRT(false); setDate(addDays(cal.value, -1), true); };
  $('cal-next').onclick = () => { setRT(false); setDate(addDays(cal.value, 1), true); };
  $('cal-today').onclick = () => { setRT(false); setDate(isoToday(), true); };
  calSetDate = setDate;                              // RT usa este setter sin desactivarse
  setDate(isoToday());                               // por defecto HOY (sin salto: arranca 18h)

  // slider de 24 h: arrastrar la hora mueve sol, luces y audiencia
  $('hora-slider').oninput = e => {
    setRT(false);
    $('auto-toggle').checked = false; state.auto = false;
    setHour(parseFloat(e.target.value), false);
  };
  const rl = $('rules');
  PERFILES.forEach(p => {
    const li = document.createElement('li');
    li.dataset.perfil = p;
    li.innerHTML = `<span>${PERFIL_LABEL[p]}</span><span>→ creatividad ${REGLAS[p].cre}</span>`;
    rl.appendChild(li);
  });
  const mb = $('mixbars');
  PERFILES.forEach(p => {
    const row = document.createElement('div');
    row.className = 'bar-row';
    row.innerHTML = `<div class="lbl"><span>${PERFIL_LABEL[p]}</span><span id="pct-${p}">—</span></div>
      <div class="track"><div class="fill" id="bar-${p}" style="background:${PERFIL_CSS[p]}"></div></div>`;
    mb.appendChild(row);
  });
  // slider de PERSONAS: por defecto sigue el dato telco; al moverlo entra en manual
  const asl = $('aforo-slider');
  if (asl) {
    asl.max = String(MAX_CROWD);
    asl.oninput = () => { aforoCtl.manual = true; aforoCtl.value = +asl.value; updateAforoUI(); };
    $('aforo-reset').onclick = () => { aforoCtl.manual = false; updateAforoUI(); };
    updateAforoUI();
  }
  $('ficha-close').onclick = () => $('ficha').classList.add('hidden');
  document.querySelectorAll('#cammodes button').forEach(b => {
    b.onclick = () => setCamMode(b.dataset.mode);
  });
  setTimeout(() => $('hint') && $('hint').classList.add('gone'), 8000);

  // capas visibles
  $('capa-multitud').onchange = e => { if (figures) figures.group.visible = e.target.checked; };
  $('capa-edificios').onchange = e => {
    if (buildingsMesh) buildingsMesh.visible = e.target.checked;
    if (roofsMesh) roofsMesh.visible = e.target.checked;
  };
  $('capa-viales').onchange = e => { if (roadsMesh) roadsMesh.visible = e.target.checked; };
  $('escena-noche').onchange = e => { forceNight = e.target.checked; };

  // escalera Good · Better · Best
  document.querySelectorAll('#quality button').forEach(b => {
    b.onclick = () => setQuality(b.dataset.q);
  });
  // nivel inicial por parámetro (?q=good|better) — coherencia con la vuelta desde best/
  const q0 = new URLSearchParams(location.search).get('q');
  if (q0 === 'good' || q0 === 'better') setQuality(q0);

  // barra inferior = panel EXPERTO. El icono EXPERTO de la barra reutiliza este mismo toggle.
  const toggleExpert = () => {
    const collapsed = $('expertbar').classList.toggle('collapsed');
    $('tg-expert').classList.toggle('on', !collapsed);   // encendido sincronizado
    updateExpert(true);
    try { localStorage.setItem('adc.expert', collapsed ? '0' : '1'); } catch (e) {}
  };
  $('expert-toggle').onclick = toggleExpert;
  $('tg-expert').onclick = toggleExpert;
  $('ex-endpoints').innerHTML =
    `stock: ${STOCK_URL.replace('https://', '')}<br>` +
    `signage: ${SIGNAGE_URL.replace('https://', '')}<br>` +
    `meteo: api.open-meteo.com/v1/forecast (+archive, daily=sunrise,sunset) · sin clave<br>` +
    `geodatos: data/gracia-local.json (OSM/ODbL)<br>` +
    `atajos player: ⇧+→ siguiente · ⇧+← anterior · ⇧+↑ primera · ⇧+↓ última<br>` +
    `vuelo: flechas avance/giro · Av/Re Pág altura (⇧+↑↓ ya no es altura)`;

  // OPCIONES (izquierda) y AVANZADO (derecha): overlays plegables, uno abierto a la vez.
  const syncSideIcons = () => {
    $('tg-left').classList.toggle('on', $('sidebar').classList.contains('open'));
    $('tg-right').classList.toggle('on', $('rightbar').classList.contains('open'));
  };
  const persistSides = () => {
    try {
      localStorage.setItem('adc.opts', $('sidebar').classList.contains('open') ? '1' : '0');
      localStorage.setItem('adc.adv',  $('rightbar').classList.contains('open') ? '1' : '0');
    } catch (e) {}
  };
  const closeSides = () => {
    if (!$('sidebar').classList.contains('open') && !$('rightbar').classList.contains('open')) return;
    $('sidebar').classList.remove('open');
    $('rightbar').classList.remove('open');
    syncSideIcons(); persistSides();
  };
  const toggleSide = which => {
    const el = which === 'left' ? $('sidebar') : $('rightbar');
    const other = which === 'left' ? $('rightbar') : $('sidebar');
    el.classList.toggle('open');
    other.classList.remove('open');
    syncSideIcons(); persistSides();
  };
  $('tg-left').onclick = () => toggleSide('left');
  $('tg-right').onclick = () => toggleSide('right');
  document.querySelectorAll('#mainnav a[data-open]').forEach(a => {
    a.onclick = e => { e.preventDefault(); toggleSide(a.dataset.open); };
  });
  // tocar la escena cierra los overlays laterales (no roba el foco al canvas para las flechas)
  renderer.domElement.addEventListener('pointerdown', closeSides);

  // restaurar estado (plegado por defecto: solo abre lo que estuviera guardado como '1')
  try {
    if (localStorage.getItem('adc.opts') === '1') $('sidebar').classList.add('open');
    if (localStorage.getItem('adc.adv')  === '1') $('rightbar').classList.add('open');
    if (localStorage.getItem('adc.expert') === '1') $('expertbar').classList.remove('collapsed');
  } catch (e) {}
  syncSideIcons();
  $('tg-expert').classList.toggle('on', !$('expertbar').classList.contains('collapsed'));

  // Escape cierra cualquier panel abierto — SOLO Escape y SOLO si hay algo abierto,
  // para no interferir con las flechas / Av-Re Pág que maneja la cámara del gemelo.
  addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const open = $('sidebar').classList.contains('open')
              || $('rightbar').classList.contains('open')
              || !$('expertbar').classList.contains('collapsed');
    if (!open) return;
    e.preventDefault();
    $('sidebar').classList.remove('open');
    $('rightbar').classList.remove('open');
    $('expertbar').classList.add('collapsed');
    syncSideIcons(); persistSides();
    $('tg-expert').classList.remove('on');
    try { localStorage.setItem('adc.expert', '0'); } catch (err) {}
  });
}

/* ---- modo experto: telemetría + JSON crudos ---- */
let fpsEMA = 60, lastExpert = 0, lastSignageRaw = null;
function updateExpert(force = false) {
  if ($('expertbar').classList.contains('collapsed')) return;
  const now = performance.now();
  if (!force && now - lastExpert < 500) return;
  lastExpert = now;
  $('ex-fps').textContent = Math.round(fpsEMA);
  $('ex-crowd').textContent = figCount;
  $('ex-calls').textContent = renderer.info.render.calls;
  $('ex-tris').textContent = renderer.info.render.triangles.toLocaleString('es');
  const f = franja();
  const obj24 = audienciaAt(state.hour);
  $('ex-audience').textContent = JSON.stringify({
    hora: fmtHora(state.hour), franja_cercana: f.id,
    objetivo_curva24: {
      aforo: Math.round(obj24.aforo),
      mix: Object.fromEntries(PERFILES.map(p => [p, +obj24.mix[p].toFixed(1)])),
    },
    interpolado: {
      aforo: Math.round(state.cur.aforo),
      mix: Object.fromEntries(PERFILES.map(p => [p, +state.cur.mix[p].toFixed(1)])),
      dominante: state.dominante,
    },
    aforo_fuente: aforoCtl.manual ? 'MANUAL (slider ' + aforoCtl.value + ')' : 'dato telco (curva 24h)',
    reloj: rt.active ? 'RT 1:1 (Europe/Madrid)' : (state.auto ? 'AUTO 90s' : 'manual'),
    fuente: 'simulado (patrón MITMA)',
  }, null, 1);
  $('ex-signage').textContent = JSON.stringify({
    signage_now: lastSignageRaw,
    canal_stock: stockItem ? { idx: stockIdx + 1, de: stockQueue.length, type: stockItem.type, title: stockTitle(), url: stockItem.url } : null,
  }, null, 1);
  const s = wxSample(state.hour);
  $('ex-weather').textContent = JSON.stringify({
    fecha: weather.date,
    endpoint: weather.ok ? weather.endpoint.replace('https://', '') : weather.msg,
    hora: fmtHora(state.hour),
    rt: rt.active,
    sol: weather.sunrise != null ? { amanecer: fmtHora(weather.sunrise), ocaso: fmtHora(weather.sunset) } : 'aprox (7:00/20:30)',
    current: weather.current ? { icono: wxIcon(weather.current.code, state.hour), code_wmo: weather.current.code, temp: +(+weather.current.temp).toFixed(1), precip_mm: +(+weather.current.precip).toFixed(2), time: weather.current.time } : null,
    ahora: s ? { icono: wxIcon(s.code, state.hour), code_wmo: s.code, temp: +s.temp.toFixed(1), precip_mm: +s.precip.toFixed(2) } : null,
    factores: { cloud: +wxApplied.cloud.toFixed(2), rain: +wxApplied.rain.toFixed(2), snow: +wxApplied.snow.toFixed(2), storm: +wxApplied.storm.toFixed(2) },
    aforo_factor: +wxCrowdFactor.toFixed(2), drops: precipPoints && precipPoints.visible ? Math.round(MAX_DROPS * Math.max(wxApplied.rain, wxApplied.snow)) : 0,
    codes_24h: weather.ok ? weather.code : null,
  }, null, 1);
}
function updateAforoUI() {
  const src = $('aforo-src'), rst = $('aforo-reset');
  if (!src) return;
  src.textContent = aforoCtl.manual ? 'aforo manual' : 'dato telco';
  src.classList.toggle('manual', aforoCtl.manual);
  rst.classList.toggle('hidden', !aforoCtl.manual);
}
function refreshHUD() {
  $('aforo').textContent = Math.round(state.cur.aforo);
  // en automático el slider SIGUE al dato telco (posición viva)
  const asl = $('aforo-slider');
  if (asl && !aforoCtl.manual && document.activeElement !== asl) asl.value = String(Math.round(state.cur.aforo));
  const mx = state.cur.mix;
  const tot = PERFILES.reduce((a, p) => a + mx[p], 0) || 1;
  PERFILES.forEach(p => {
    const pct = Math.round(mx[p] / tot * 100);
    $('pct-' + p).textContent = pct + '%';
    $('bar-' + p).style.width = pct + '%';
  });
  const dom = dominanteDe(mx);
  if (dom !== state.dominante) {
    state.dominante = dom;
    $('dominante').textContent = PERFIL_LABEL[dom];
    $('dominante').style.color = PERFIL_CSS[dom];
    document.querySelectorAll('#rules li').forEach(li =>
      li.classList.toggle('active', li.dataset.perfil === dom));
    updateOnscreenHUD();
  }
}
function updateHoraUI() {
  $('hora-lbl').textContent = rt.active ? fmtHoraSec(state.hour) : fmtHora(state.hour);
  const sl = $('hora-slider');
  if (document.activeElement !== sl) sl.value = String(Math.round(state.hour * 4) / 4);
  document.querySelectorAll('#franjas button').forEach((b, i) =>
    b.classList.toggle('active', Math.abs(state.hour - FRANJA_H[i]) < 1));
  updateWxChip();
}
// chip de meteo junto al reloj: icono + temperatura de la hora del slider
function updateWxChip() {
  const chip = $('wx-chip'), ico = $('wx-ico'), tmp = $('wx-temp');
  if (!chip) return;
  const s = wxSample(state.hour);
  if (!s) {
    chip.classList.add('wx-off');
    ico.textContent = weather.loading ? '…' : '⚠';
    tmp.textContent = weather.loading ? 'cargando' : 'sin meteo';
    return;
  }
  chip.classList.remove('wx-off');
  ico.textContent = wxIcon(s.code, state.hour);
  tmp.textContent = Math.round(s.temp) + '°';
}
function onWeatherLoaded() {
  const note = $('wx-note');
  if (note) {
    note.textContent = weather.loading ? 'cargando meteo…' : weather.msg;
    note.classList.toggle('wx-warn', !weather.ok && !weather.loading);
    note.classList.toggle('wx-live', weather.ok && !weather.loading);
  }
  updateWxChip();
  updateExpert(true);
}
function updateWxAdjustHUD() {
  const row = $('wx-adjust-row'), b = $('wx-adjust');
  if (!row) return;
  if (weather.ok && wxCrowdFactor < 0.985) {
    row.classList.remove('hidden');
    b.textContent = Math.round(state.cur.aforo * wxCrowdFactor) + ' · −' + Math.round((1 - wxCrowdFactor) * 100) + '% por meteo';
  } else row.classList.add('hidden');
}
function updateOnscreenHUD() {
  const el = $('onscreen');
  const r = REGLAS[state.dominante || dominanteDe(franja().mix)];
  if (state.realItem) {
    el.textContent = '▶ ' + realItemName() + ' (player circuito)';
  } else if (stockLive && stockItem) {
    el.textContent = '▶ ' + stockTitle().slice(0, 34) + ' · canal admira.tv';
  } else if (creImgs[state.dominante || dominanteDe(franja().mix)]) {
    el.textContent = `Creatividad ${r.cre} · ${r.titulo} (demo pixeria)`;
  } else {
    el.textContent = `Creatividad ${r.cre} · ${r.titulo}`;
  }
  $('recomendacion').textContent = `Creatividad ${r.cre} · ${r.titulo}`;
}

function applyFranja(i, snap = false) {
  state.franjaIdx = i;
  setHour(FRANJA_H[i], !snap ? true : false);
  if (snap) {
    const a = audienciaAt(state.hour);
    state.cur.aforo = a.aforo;
    state.cur.mix = { ...a.mix };
    updateCrowd();
  }
  refreshHUD();
  updateHoraUI();
}

/* ============================== fichas (raycast) ============================== */
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downXY = null;
renderer.domElement.addEventListener('pointerdown', e => {
  downXY = [e.clientX, e.clientY];
  controls.autoRotate = false;
  stopFlight();
  looking = true; lookPX = e.clientX; lookPY = e.clientY;
});
renderer.domElement.addEventListener('pointermove', e => {
  if (!looking || (camMode !== 'free' && camMode !== 'human')) return;
  fly.yaw -= (e.clientX - lookPX) * 0.0032;
  fly.pitch = Math.max(-1.25, Math.min(0.9, fly.pitch - (e.clientY - lookPY) * 0.0032));
  lookPX = e.clientX; lookPY = e.clientY;
});
addEventListener('pointerup', () => { looking = false; });
renderer.domElement.addEventListener('pointerup', e => {
  if (!downXY) return;
  const moved = Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]);
  downXY = null;
  if (moved > 6) return; // era drag
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, activeCamera());
  const targets = [kiosk, plazaMesh];
  if (buildingsMesh) targets.push(buildingsMesh);
  if (roofsMesh) targets.push(roofsMesh);
  const hits = raycaster.intersectObjects(targets, true);
  if (!hits.length) { $('ficha').classList.add('hidden'); return; }
  const h = hits[0];
  let o = h.object;
  while (o && o !== kiosk && o.name !== 'plaza' && o.name !== 'buildings' && o.name !== 'roofs') o = o.parent;
  if (o === kiosk) return showFichaKiosk();
  if (o && o.name === 'plaza') return showFichaPlaza();
  if (o && o.name === 'buildings') return showFichaBuilding(buildingPick, h.faceIndex);
  if (o && o.name === 'roofs') return showFichaBuilding(roofsPick, h.faceIndex);
});

function ficha(html) {
  $('ficha-body').innerHTML = html;
  $('ficha').classList.remove('hidden');
}
function showFichaKiosk() {
  const feed = state.realItem ? 'REAL · player del circuito' :
    (stockLive ? 'REAL · Stock del canal admira.tv' : 'Simulado · regla ADcelerate');
  const r = REGLAS[state.dominante || dominanteDe(franja().mix)];
  const enPantalla = state.realItem ? realItemName() :
    (stockLive && stockItem ? stockTitle() : `Creatividad ${r.cre} — ${r.titulo}`);
  ficha(`
    <p class="tag">Pantalla reactiva · OOH</p>
    <h3>News &amp; Coffee — Kiosko de la Plaça</h3>
    <dl>
      <dt>Circuito</dt><dd>OOH Media · kioskos de prensa (Barcelona)</dd>
      <dt>Emite desde</dt><dd>admira.tv (motor canal)</dd>
      <dt>Venta</dt><dd><a href="https://clearchannel.tv" target="_blank" rel="noopener">clearchannel.tv</a></dd>
      <dt>En pantalla ahora</dt><dd>${enPantalla}</dd>
      <dt>Fuente</dt><dd>${feed}</dd>
      <dt>OSM</dt><dd>node 3350101407 · 41.40026 N, 2.15733 E</dd>
    </dl>`);
}
function showFichaPlaza() {
  const f = franja();
  const mixTxt = PERFILES.map(p => `${PERFIL_LABEL[p]} ${f.mix[p]}%`).join(' · ');
  ficha(`
    <p class="tag">Zona de audiencia</p>
    <h3>Plaça de la Vila de Gràcia</h3>
    <dl>
      <dt>Franja</dt><dd>${f.id}</dd>
      <dt>Aforo estimado</dt><dd>${f.aforo} personas</dd>
      <dt>Mezcla de perfiles</dt><dd>${mixTxt}</dd>
      <dt>Perfil dominante</dt><dd>${PERFIL_LABEL[dominanteDe(f.mix)]}</dd>
      <dt>Fuente</dt><dd>Datos telco de zona (simulados sobre patrón MITMA)</dd>
    </dl>`);
}
function showFichaBuilding(pickArr, faceIndex) {
  // búsqueda binaria del edificio por triángulo
  let lo = 0, hi = pickArr.length - 1, found = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1, e = pickArr[mid];
    if (faceIndex < e.tri0) hi = mid - 1;
    else if (faceIndex >= e.tri1) lo = mid + 1;
    else { found = e; break; }
  }
  if (!found) return;
  const b = found.meta;
  ficha(`
    <p class="tag">Edificio</p>
    <h3>${b.name || 'Edificio residencial'}</h3>
    <dl>
      <dt>Altura</dt><dd>${b.h} m (~${Math.max(1, Math.round(b.h / 3))} plantas)</dd>
      ${b.id ? `<dt>OSM</dt><dd>way ${b.id}</dd>` : ''}
      <dt>Datos</dt><dd>© OpenStreetMap contributors (ODbL)</dd>
    </dl>`);
}

/* ============== escalera GOOD (2D) · BETTER (3D) · BEST (en el horno) ============== */
let quality = 'better';
const camera2D = new THREE.OrthographicCamera(-240, 240, 240, -240, 1, 900);
camera2D.position.set(0, 420, 0);
camera2D.up.set(0, 0, -1);          // norte arriba
camera2D.lookAt(0, 0, 0);
function fitOrtho() {
  const a = innerWidth / innerHeight, half = 250;
  camera2D.left = -half * a; camera2D.right = half * a;
  camera2D.top = half; camera2D.bottom = -half;
  camera2D.updateProjectionMatrix();
}
fitOrtho();
function activeCamera() { return quality === 'good' ? camera2D : camera; }
function setQuality(q) {
  if (q === 'best') {                       // nivel fotorrealista: vive en la subcarpeta best/
    location.href = 'best/';
    return;
  }
  quality = q;
  document.querySelectorAll('#quality button').forEach(b =>
    b.classList.toggle('active', b.dataset.q === q));
  if (q === 'good') {
    controls.enabled = false;
    $('hint').classList.add('gone');
  } else if (camMode === 'free') {
    controls.enabled = false;
  } else {
    controls.enabled = true;
  }
}
// zoom con rueda en la vista 2D
renderer.domElement.addEventListener('wheel', e => {
  if (quality !== 'good') return;
  e.preventDefault();
  camera2D.zoom = Math.min(6, Math.max(0.6, camera2D.zoom * (e.deltaY < 0 ? 1.12 : 0.89)));
  camera2D.updateProjectionMatrix();
}, { passive: false });

/* ============== cámara: volado libre (defecto) · órbita · vuelo guiado ============== */
let camMode = 'free';
// yaw inicial mirando de (95,·,95) hacia el kiosko en el origen
const fly = { yaw: Math.PI / 4, pitch: -0.24, vF: 0, vY: 0, vYaw: 0, keys: {} };

function updateModeButtons() {
  document.querySelectorAll('#cammodes button').forEach(b =>
    b.classList.toggle('active', b.dataset.mode === camMode));
}
function setCamMode(m) {
  if (m === 'guided') { startFlight(); return; }
  if (m === 'human') { enterHuman(); return; }
  stopFlight();                    // corta un vuelo guiado si lo hubiera
  camMode = m;
  if (m === 'free') {
    controls.enabled = false; controls.autoRotate = false;
    const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    fly.yaw = e.y; fly.pitch = e.x;
    fly.vF = fly.vY = fly.vYaw = 0;
  } else {                         // orbit
    controls.enabled = true; controls.autoRotate = false;
    const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
    const t = camera.position.clone().add(dir.multiplyScalar(60));
    t.y = Math.min(10, Math.max(0, t.y));
    controls.target.copy(t);
  }
  updateModeButtons();
}

// --- teclado del volado libre (↑↓ avance · ←→ giro · Av/Re Pág altura · ⇧+flechas = player)
const FLY_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown'];
// vista GOOD (2D): las flechas hacen PAN del plano cenital (la rueda ya hace zoom)
const pan2D = { keys: {}, vx: 0, vz: 0 };
addEventListener('keydown', e => {
  if (!FLY_KEYS.includes(e.key)) return;
  const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
  // ⇧+flechas = mando del PLAYER del kiosko (exclusivo; la altura de vuelo es Av/Re Pág)
  if (e.shiftKey && e.key.startsWith('Arrow')) { e.preventDefault(); playerCmd(e.key); return; }
  if (quality === 'good') {                  // 2D: flechas = pan del plano
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      pan2D.keys[e.key] = true; e.preventDefault();
    }
    return;
  }
  if (camMode !== 'free' && camMode !== 'human') setCamMode('free');
  fly.keys[e.key] = true;
  e.preventDefault();
});
addEventListener('keyup', e => {
  if (!FLY_KEYS.includes(e.key)) return;
  pan2D.keys[e.key] = false;
  fly.keys[e.key] = false;
});
// PAN del plano cenital: ← → mueven este/oeste, ↑ ↓ norte/sur (norte = −z). Paso escalado
// por el zoom (más zoom → paso en pantalla constante), con inercia y límites de la maqueta.
function tickPan2D(dt) {
  const k = pan2D.keys, ACC = 520, MAXV = 340;
  if (k.ArrowLeft)  pan2D.vx = Math.max(-MAXV, pan2D.vx - ACC * dt);
  if (k.ArrowRight) pan2D.vx = Math.min(MAXV, pan2D.vx + ACC * dt);
  if (k.ArrowUp)    pan2D.vz = Math.max(-MAXV, pan2D.vz - ACC * dt);   // norte = −z
  if (k.ArrowDown)  pan2D.vz = Math.min(MAXV, pan2D.vz + ACC * dt);
  const damp = Math.exp(-3 * dt);
  pan2D.vx *= damp; pan2D.vz *= damp;
  const s = dt / camera2D.zoom;                                        // escala por zoom
  camera2D.position.x = Math.max(-330, Math.min(330, camera2D.position.x + pan2D.vx * s));
  camera2D.position.z = Math.max(-330, Math.min(330, camera2D.position.z + pan2D.vz * s));
}

let _tickFreeCalls = 0;
function tickFree(dt) {
  _tickFreeCalls++;
  const k = fly.keys;
  const ACC = 55, MAXV = 36, YAWA = 3.4, MAXYAW = 1.5, VACC = 38, MAXVY = 20;
  // altura SOLO con Av/Re Pág: ⇧+↑↓ quedó reservado al player del kiosko
  if (k.ArrowUp)   fly.vF = Math.min(MAXV, fly.vF + ACC * dt);
  if (k.ArrowDown) fly.vF = Math.max(-MAXV, fly.vF - ACC * dt);
  if (k.ArrowLeft)  fly.vYaw = Math.min(MAXYAW, fly.vYaw + YAWA * dt);
  if (k.ArrowRight) fly.vYaw = Math.max(-MAXYAW, fly.vYaw - YAWA * dt);
  if (k.PageUp)   fly.vY = Math.min(MAXVY, fly.vY + VACC * dt);
  if (k.PageDown) fly.vY = Math.max(-MAXVY, fly.vY - VACC * dt);
  // inercia ligera
  fly.vF *= Math.exp(-2.4 * dt);
  fly.vY *= Math.exp(-2.4 * dt);
  fly.vYaw *= Math.exp(-4.2 * dt);
  fly.yaw += fly.vYaw * dt;
  camera.position.x += -Math.sin(fly.yaw) * fly.vF * dt;
  camera.position.z += -Math.cos(fly.yaw) * fly.vF * dt;
  camera.position.y += fly.vY * dt;
  // límites: ni bajo el suelo, ni por encima de 150 m, ni fuera de la maqueta
  camera.position.y = Math.max(2, Math.min(150, camera.position.y));
  const rad = Math.hypot(camera.position.x, camera.position.z);
  if (rad > 330) { camera.position.x *= 330 / rad; camera.position.z *= 330 / rad; }
  camera.rotation.set(fly.pitch, fly.yaw, 0);
}

// --- mirar con el ratón (arrastrar) en volado libre
let lookPX = 0, lookPY = 0, looking = false;

/* ============ MODO HUMANO: primera persona a pie, enfrente del kiosko ============ */
// La pantalla del kiosko está en x≈2.34 mirando a +x (hacia la plaza).
// El peatón se planta a ~5.3 m, ojos a 1.65 m, mirando de vuelta a la pantalla.
const HUMAN = {
  base: new THREE.Vector3(7.6, 1.65, 0),
  pos: new THREE.Vector3(7.6, 1.65, 0),
  yaw: Math.PI / 2, pitch: 0.02,             // yaw=π/2 → mirar hacia −x (a la pantalla)
};
const _reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let humanTween = null;
function enterHuman() {
  stopFlight();
  camMode = 'human';
  controls.enabled = false; controls.autoRotate = false;
  $('ficha').classList.add('hidden');
  HUMAN.pos.copy(HUMAN.base);
  fly.yaw = HUMAN.yaw; fly.pitch = HUMAN.pitch;
  fly.vF = fly.vY = fly.vYaw = 0;
  humanTween = { t0: performance.now(), dur: 1100, p0: camera.position.clone(), q0: camera.quaternion.clone() };
  $('hint').textContent = '🧍 Humano · arrastra para mirar la pantalla · flechas = pasito (te quedas plantado)';
  $('hint').classList.remove('gone');
  setTimeout(() => camMode === 'human' && $('hint').classList.add('gone'), 6000);
  updateModeButtons();
}
const _humFwd = new THREE.Vector3(), _humRight = new THREE.Vector3(), _humMv = new THREE.Vector3(), _humQ = new THREE.Quaternion(), _humE = new THREE.Euler();
function tickHuman(dt, now) {
  if (humanTween) {                          // transición suave a la posición humana
    const p = Math.min(1, (now - humanTween.t0) / humanTween.dur), e = easeInOut(p);
    camera.position.lerpVectors(humanTween.p0, HUMAN.pos, e);
    _humE.set(fly.pitch, fly.yaw, 0, 'YXZ');
    _humQ.setFromEuler(_humE);
    camera.quaternion.slerpQuaternions(humanTween.q0, _humQ, e);
    if (p >= 1) humanTween = null;
    return;
  }
  // pasito limitado con las flechas (radio máx 10 m del punto, sin atravesar el kiosko ni salir de la plaza)
  const k = fly.keys, step = 6 * dt;
  _humFwd.set(-Math.sin(fly.yaw), 0, -Math.cos(fly.yaw));
  _humRight.set(Math.cos(fly.yaw), 0, -Math.sin(fly.yaw));
  _humMv.set(0, 0, 0);
  if (k.ArrowUp) _humMv.add(_humFwd);
  if (k.ArrowDown) _humMv.sub(_humFwd);
  if (k.ArrowRight) _humMv.add(_humRight);
  if (k.ArrowLeft) _humMv.sub(_humRight);
  if (_humMv.lengthSq() > 0) {
    _humMv.normalize().multiplyScalar(step);
    const nx = HUMAN.pos.x + _humMv.x, nz = HUMAN.pos.z + _humMv.z;
    const okRadio = Math.hypot(nx - HUMAN.base.x, nz - HUMAN.base.z) <= 10;
    const noKiosko = nx > 3.2 || Math.abs(nz) > 2.2;             // no clavarse en el kiosko/pantalla
    const enPlaza = nx > PLAZA.x0 + 1 && nx < PLAZA.x1 - 1 && nz > PLAZA.z0 + 1 && nz < PLAZA.z1 - 1;
    if (okRadio && noKiosko && enPlaza) { HUMAN.pos.x = nx; HUMAN.pos.z = nz; }
  }
  // respiración sutilísima (±~1.8 cm, muy lenta) — se anula con prefers-reduced-motion
  const breath = _reduceMotion ? 0 : Math.sin(now * 0.0009) * 0.012 + Math.sin(now * 0.0013) * 0.006;
  camera.position.set(HUMAN.pos.x, HUMAN.pos.y + breath, HUMAN.pos.z);
  camera.rotation.set(fly.pitch, fly.yaw, 0);
}

/* ============================== vuelo guiado ============================== */
let flight = null;
function startFlight() {
  $('ficha').classList.add('hidden');
  controls.autoRotate = false;
  controls.enabled = false;
  camMode = 'guided';
  updateModeButtons();
  flight = {
    t0: performance.now(), dur: 8500,
    r0: Math.hypot(camera.position.x, camera.position.z) || 260,
    th0: Math.atan2(camera.position.z, camera.position.x),
    y0: camera.position.y,
    tgt0: controls.target.clone(),
  };
}
function stopFlight() {
  if (!flight) return;
  flight = null;
  camMode = 'orbit';               // al acabar (o interrumpir) queda en órbita
  controls.enabled = true;
  updateModeButtons();
}
function tickFlight(now) {
  if (!flight) return;
  const p = Math.min(1, (now - flight.t0) / flight.dur);
  const e = easeInOut(p);
  // órbita de ~1 vuelta que acaba al nordeste (θ≡−0.55), con línea limpia al kiosko
  // (evita el Campanar, que está a θ≈0.30 desde el kiosko)
  const theta = lerp(flight.th0, -0.55 + Math.PI * 2, e);
  const r = lerp(flight.r0, 30, e);
  const y = lerp(flight.y0, 9, e);
  camera.position.set(Math.cos(theta) * r, y, Math.sin(theta) * r);
  controls.target.lerpVectors(flight.tgt0, new THREE.Vector3(0, 2.2, 0), e);
  camera.lookAt(controls.target);
  if (p >= 1) stopFlight();
}

/* ============================== bucle ============================== */
let lastHUD = 0;
let lastT = performance.now();
let lastScreen = 0;

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;

  // RELOJ 24h: RT = 1:1 estricto (segundo a segundo, sin lerp ni aceleración);
  // AUTO recorre el día completo en DAY_SECONDS; manual tiende suave al objetivo
  if (rt.active) {
    state.hour = state.targetHour = rtHourNow();
    hourDirty = true;
  } else if (state.auto) {
    state.targetHour = (state.targetHour + dt * 24 / DAY_SECONDS) % 24;
    state.hour = state.targetHour;
    hourDirty = true;
  } else if (Math.abs(state.targetHour - state.hour) > 0.003) {
    const d = ((state.targetHour - state.hour + 36) % 24) - 12;  // camino más corto
    const paso = Math.sign(d) * Math.min(Math.abs(d), dt * 9);   // lerp, no salto
    state.hour = ((state.hour + paso) % 24 + 24) % 24;
    hourDirty = true;
  }
  state.franjaIdx = nearestFranjaIdx(state.hour);

  // METEO: objetivo de la hora → lerp suave de factores → aforo ajustado + relámpago
  const wxT = wxTargets(wxSample(state.hour));
  const wk = 1 - Math.exp(-dt * 1.6);
  for (const key in wxApplied) wxApplied[key] = lerp(wxApplied[key], wxT[key], wk);
  const heavy = Math.min(1, Math.max(0, wxApplied.rain - 0.4) / 0.6);
  wxCrowdFactor = lerp(1, 0.6, heavy);
  if (wxApplied.storm > 0.3) { wxFlashNext -= dt; if (wxFlashNext <= 0) { wxFlash = 1; wxFlashNext = 4 + Math.random() * 7; } }
  if (wxFlash > 0) wxFlash = Math.max(0, wxFlash - dt * 6);
  // recorte de densidad de partículas si el FPS cae (mantener > 50 con lluvia activa)
  if (wxApplied.rain > 0.1 || wxApplied.snow > 0.1) {
    if (fpsEMA < 50 && dropCap > 300) dropCap = Math.max(300, dropCap - 40);
    else if (fpsEMA > 58 && dropCap < MAX_DROPS) dropCap = Math.min(MAX_DROPS, dropCap + 20);
  }

  // entorno continuo: sol/cielo/farolas/ventanas/kiosko-neón según la hora
  applyEnvironment(forceNight ? 1.5 : state.hour);
  applyWeatherToScene();                 // overlay meteo sobre el ciclo solar
  updatePrecip(dt);                      // partículas de lluvia/nieve

  // interpolación aforo/mix hacia la CURVA 24h (o el aforo MANUAL del slider);
  // el lerp se mantiene → spawns/despawns suaves de la multitud
  const objetivo = audienciaAt(state.hour);
  const aforoObjetivo = aforoCtl.manual ? aforoCtl.value : objetivo.aforo;
  const k = 1 - Math.exp(-dt * 1.6);
  let moving = Math.abs(state.cur.aforo - aforoObjetivo) > 0.6;
  state.cur.aforo = lerp(state.cur.aforo, aforoObjetivo, k);
  for (const p of PERFILES) {
    if (Math.abs(state.cur.mix[p] - objetivo.mix[p]) > 0.25) moving = true;
    state.cur.mix[p] = lerp(state.cur.mix[p], objetivo.mix[p], k);
  }
  if ((moving || hourDirty) && now - lastHUD > 150) {
    lastHUD = now;
    hourDirty = false;
    updateCrowd();
    refreshHUD();
    updateHoraUI();
    updateWxAdjustHUD();
  }

  // pantalla del kiosko a ~25 fps (vídeo del canal + banda ADcelerate)
  if (now - lastScreen > 40) { lastScreen = now; renderScreen(); }

  // telemetría modo experto
  fpsEMA = fpsEMA * 0.95 + (dt > 0 ? 1 / dt : 60) * 0.05;
  updateExpert();

  updateFigureMotion(dt, now / 1000);   // la multitud camina

  if (quality === 'good') {
    tickPan2D(dt);                 // vista 2D cenital: flechas = pan · rueda = zoom
  } else if (camMode === 'free') {
    tickFree(dt);
  } else if (camMode === 'human') {
    tickHuman(dt, now);            // primera persona plantada ante el kiosko
  } else {
    controls.update();
    tickFlight(now);               // si hay vuelo guiado, manda sobre la cámara
  }
  renderer.render(scene, activeCamera());
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  fitOrtho();
  renderer.setSize(innerWidth, innerHeight);
});

/* ============================== arranque ============================== */
buildPrecip();                                // sistema de partículas de precipitación
buildHUD();                                   // (incluye init del calendario → loadWeather HOY)
updateModeButtons();
applyFranja(state.franjaIdx, true);
renderScreen();
updateOnscreenHUD();
loadStock();                                  // canal admira.tv REAL en la pantalla
setInterval(loadStock, 10 * 60 * 1000);       // refresco del stock cada 10 min
pollSignage();
setInterval(pollSignage, SIGNAGE_POLL_MS);
requestAnimationFrame(animate);

// gancho de inspección (demo/debug)
window.__dbg = {
  camera, camera2D, controls, state, startFlight, applyFranja, setCamMode, setQuality, nextStock, fly, pan2D, tickPan2D,
  get camMode() { return camMode; },
  get quality() { return quality; },
  get flight() { return flight; },
  get figures() { return figures; },
  get tickFreeCalls() { return _tickFreeCalls; },
  get fps() { return fpsEMA; },
  setHour, applyEnvironment, audienciaAt, fmtHora,
  weather, wxApplied, loadWeather, wxSample, wxIcon, enterHuman, HUMAN,
  setRT, rtSync, madridNow, rtHourNow, fmtHoraSec, get rt() { return rt; },
  playStock, playerCmd, showToast, jumpHourToSunrise, SUN, aforoCtl,
  get stockIdx() { return stockIdx; }, get stockQueue() { return stockQueue; }, get stockLive() { return stockLive; },
  get wxCrowdFactor() { return wxCrowdFactor; },
};
window.__dbgEvalCount = (window.__dbgEvalCount || 0) + 1;
