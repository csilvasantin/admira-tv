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
const AUTO_MS = 12000;
const SIGNAGE_URL = 'https://api.admira.store/signage/now?screen=oohmedia';
const SIGNAGE_POLL_MS = 30000;
const MAX_CROWD = 600;
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

/* ---- escena día/noche (metaestilo: noche = fondo admira-bg con neones) ---- */
let sceneNight = false;
function setSceneNight(on) {
  sceneNight = on;
  if (on) {
    scene.background.set(0x0a0c12);        // --admira-bg
    scene.fog.color.set(0x0a0c12);
    ambLight.color.set(0xbcc8ff); ambLight.intensity = 0.5;   // legibilidad de la multitud
    hemiLight.color.set(0x33415e); hemiLight.groundColor.set(0x141826); hemiLight.intensity = 0.35;
    sun.color.set(0x9db8ff); sun.intensity = 0.5;             // luna fría
    if (kioskHalo) { kioskHalo.material.opacity = 0.7; }      // neones arriba
    plazaEdge.material.opacity = 1.0;
  } else {
    scene.background.set(0xe9e2d2);
    scene.fog.color.set(0xe9e2d2);
    ambLight.color.set(0xfff2df); ambLight.intensity = 0.62;
    hemiLight.color.set(0xd8e6f2); hemiLight.groundColor.set(0xead9bd); hemiLight.intensity = 0.6;
    sun.color.set(0xffd9a6); sun.intensity = 1.8;
    if (kioskHalo) { kioskHalo.material.opacity = 0.35; }
    plazaEdge.material.opacity = 0.85;
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

/* ============================== kiosko héroe ============================== */
const kiosk = new THREE.Group();
kiosk.name = 'kiosk';
let kioskHalo = null;
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

  kiosk.add(base, trim, roof, screen, frame, sign, halo);
}
scene.add(kiosk);

/* ============================== estado ============================== */
const state = {
  franjaIdx: 2,                      // arranca en 18h (hora punta)
  auto: true,
  cur: { aforo: 0, mix: { familias: 25, jovenes: 25, turistas: 25, seniors: 25 } },
  dominante: null,
  realItem: null,
};
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
function nextStock() {
  clearTimeout(stockTimer);
  if (!stockQueue.length) return;
  stockIdx = (stockIdx + 1) % stockQueue.length;
  stockItem = stockQueue[stockIdx];
  stockImg = null;
  if (stockItem.type === 'video') {
    vid.src = stockItem.url;
    vid.play().catch(() => stockSkipError());
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
    new THREE.MeshLambertMaterial({ vertexColors: true, map: winTx }));
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
  const n = Math.min(MAX_CROWD, Math.round(state.cur.aforo));
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
    b.onclick = () => { $('auto-toggle').checked = false; state.auto = false; applyFranja(i); };
    fr.appendChild(b);
  });
  $('auto-toggle').onchange = e => { state.auto = e.target.checked; };
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
  $('escena-noche').onchange = e => setSceneNight(e.target.checked);

  // escalera Good · Better · Best
  document.querySelectorAll('#quality button').forEach(b => {
    b.onclick = () => setQuality(b.dataset.q);
  });

  // barra inferior: modo experto
  $('expert-toggle').onclick = () => {
    $('expertbar').classList.toggle('collapsed');
    updateExpert(true);
  };
  $('ex-endpoints').innerHTML =
    `stock: ${STOCK_URL.replace('https://', '')}<br>` +
    `signage: ${SIGNAGE_URL.replace('https://', '')}<br>` +
    `geodatos: data/gracia-local.json (OSM/ODbL)`;

  // móvil: abrir/cerrar laterales
  const toggleSide = which => {
    const el = which === 'left' ? $('sidebar') : $('rightbar');
    const other = which === 'left' ? $('rightbar') : $('sidebar');
    el.classList.toggle('open');
    other.classList.remove('open');
  };
  $('tg-left').onclick = () => toggleSide('left');
  $('tg-right').onclick = () => toggleSide('right');
  document.querySelectorAll('#mainnav a[data-open]').forEach(a => {
    a.onclick = e => { e.preventDefault(); toggleSide(a.dataset.open); };
  });
  // tocar la escena cierra los laterales en móvil
  renderer.domElement.addEventListener('pointerdown', () => {
    $('sidebar').classList.remove('open');
    $('rightbar').classList.remove('open');
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
  $('ex-audience').textContent = JSON.stringify({
    franja: f.id, objetivo: { aforo: f.aforo, mix: f.mix },
    interpolado: {
      aforo: Math.round(state.cur.aforo),
      mix: Object.fromEntries(PERFILES.map(p => [p, +state.cur.mix[p].toFixed(1)])),
      dominante: state.dominante,
    },
    fuente: 'simulado (patrón MITMA)',
  }, null, 1);
  $('ex-signage').textContent = JSON.stringify({
    signage_now: lastSignageRaw,
    canal_stock: stockItem ? { idx: stockIdx + 1, de: stockQueue.length, type: stockItem.type, title: stockTitle(), url: stockItem.url } : null,
  }, null, 1);
}
function refreshHUD() {
  $('aforo').textContent = Math.round(state.cur.aforo);
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
  document.querySelectorAll('#franjas button').forEach((b, i) =>
    b.classList.toggle('active', i === state.franjaIdx));
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
  if (snap) {
    state.cur.aforo = FRANJAS[i].aforo;
    state.cur.mix = { ...FRANJAS[i].mix };
    updateCrowd();
  }
  refreshHUD();
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
  if (!looking || camMode !== 'free') return;
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
  if (q === 'best') {                       // pestaña bloqueada: nota "en el horno"
    $('best-note').classList.toggle('hidden');
    return;
  }
  $('best-note').classList.add('hidden');
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
const fly = { yaw: Math.PI / 4, pitch: -0.24, vF: 0, vY: 0, vYaw: 0, keys: {}, shift: false };

function updateModeButtons() {
  document.querySelectorAll('#cammodes button').forEach(b =>
    b.classList.toggle('active', b.dataset.mode === camMode));
}
function setCamMode(m) {
  if (m === 'guided') { startFlight(); return; }
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

// --- teclado del volado libre (↑↓ avance · ←→ giro · Av/Re Pág o Shift+↑↓ altura)
const FLY_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown'];
addEventListener('keydown', e => {
  if (!FLY_KEYS.includes(e.key)) return;
  if (quality === 'good') return;            // en 2D no hay volado
  if (camMode !== 'free') setCamMode('free');
  fly.keys[e.key] = true; fly.shift = e.shiftKey;
  e.preventDefault();
});
addEventListener('keyup', e => {
  if (!FLY_KEYS.includes(e.key)) return;
  fly.keys[e.key] = false; fly.shift = e.shiftKey;
});

let _tickFreeCalls = 0;
function tickFree(dt) {
  _tickFreeCalls++;
  const k = fly.keys;
  const ACC = 55, MAXV = 36, YAWA = 3.4, MAXYAW = 1.5, VACC = 38, MAXVY = 20;
  const alturaConShift = fly.shift;
  if (k.ArrowUp && !alturaConShift)   fly.vF = Math.min(MAXV, fly.vF + ACC * dt);
  if (k.ArrowDown && !alturaConShift) fly.vF = Math.max(-MAXV, fly.vF - ACC * dt);
  if (k.ArrowLeft)  fly.vYaw = Math.min(MAXYAW, fly.vYaw + YAWA * dt);
  if (k.ArrowRight) fly.vYaw = Math.max(-MAXYAW, fly.vYaw - YAWA * dt);
  if (k.PageUp   || (alturaConShift && k.ArrowUp))   fly.vY = Math.min(MAXVY, fly.vY + VACC * dt);
  if (k.PageDown || (alturaConShift && k.ArrowDown)) fly.vY = Math.max(-MAXVY, fly.vY - VACC * dt);
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
let lastAuto = performance.now();
let lastHUD = 0;
let lastT = performance.now();
let lastScreen = 0;

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;

  // AUTO: rotar franja
  if (state.auto && now - lastAuto > AUTO_MS) {
    lastAuto = now;
    applyFranja((state.franjaIdx + 1) % FRANJAS.length);
  }
  if (!state.auto) lastAuto = now;

  // interpolación aforo/mix hacia la franja objetivo
  const f = franja();
  const k = 1 - Math.exp(-dt * 1.6);
  let moving = Math.abs(state.cur.aforo - f.aforo) > 0.6;
  state.cur.aforo = lerp(state.cur.aforo, f.aforo, k);
  for (const p of PERFILES) {
    if (Math.abs(state.cur.mix[p] - f.mix[p]) > 0.25) moving = true;
    state.cur.mix[p] = lerp(state.cur.mix[p], f.mix[p], k);
  }
  if (moving && now - lastHUD > 150) {
    lastHUD = now;
    updateCrowd();
    refreshHUD();
  }

  // pantalla del kiosko a ~25 fps (vídeo del canal + banda ADcelerate)
  if (now - lastScreen > 40) { lastScreen = now; renderScreen(); }

  // telemetría modo experto
  fpsEMA = fpsEMA * 0.95 + (dt > 0 ? 1 / dt : 60) * 0.05;
  updateExpert();

  updateFigureMotion(dt, now / 1000);   // la multitud camina

  if (quality === 'good') {
    // vista 2D cenital: cámara ortográfica fija (rueda = zoom)
  } else if (camMode === 'free') {
    tickFree(dt);
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
buildHUD();
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
  camera, camera2D, controls, state, startFlight, applyFranja, setCamMode, setQuality, nextStock, fly,
  get camMode() { return camMode; },
  get quality() { return quality; },
  get flight() { return flight; },
  get figures() { return figures; },
  get tickFreeCalls() { return _tickFreeCalls; },
  get fps() { return fpsEMA; },
  setSceneNight,
};
window.__dbgEvalCount = (window.__dbgEvalCount || 0) + 1;
