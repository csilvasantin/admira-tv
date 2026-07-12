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
const PERFIL_COLOR = { familias: 0xf5a623, jovenes: 0x8b7bff, turistas: 0x2fbbd6, seniors: 0x58b368 };
const PERFIL_CSS   = { familias: '#f5a623', jovenes: '#8b7bff', turistas: '#2fbbd6', seniors: '#58b368' };

// Motor de reglas ADcelerate: perfil dominante → creatividad
const REGLAS = {
  familias: { cre: 'A', titulo: 'PLAN FAMILIAR',    sub: '2×1 xocolata · Granja de la Plaça', bg: '#f5a623', fg: '#3a2400' },
  jovenes:  { cre: 'B', titulo: 'NIT DE GRÀCIA',    sub: 'Session 18–22h · craft & vinils',   bg: '#8b7bff', fg: '#14103f' },
  turistas: { cre: 'C', titulo: 'GRÀCIA WALKS',     sub: 'Guided tour EN/FR · every hour',    bg: '#2fbbd6', fg: '#062e38' },
  seniors:  { cre: 'D', titulo: 'MATINS TRANQUILS', sub: 'Farmàcia & salut · Vila de Gràcia', bg: '#58b368', fg: '#0d2a14' },
};
const AUTO_MS = 12000;
const SIGNAGE_URL = 'https://api.admira.store/signage/now?screen=oohmedia';
const SIGNAGE_POLL_MS = 30000;
const MAX_CROWD = 600;

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
scene.background = new THREE.Color(0xdfe9ee);
scene.fog = new THREE.Fog(0xdfe9ee, 420, 780);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.5, 1500);
camera.position.set(150, 170, 190);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(15, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI / 2.05;
controls.minDistance = 12;
controls.maxDistance = 520;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.35;

scene.add(new THREE.AmbientLight(0xffffff, 0.7));
scene.add(new THREE.HemisphereLight(0xcfe8ff, 0xe8dcc8, 0.55));
const sun = new THREE.DirectionalLight(0xfff4e0, 1.5);
sun.position.set(-180, 260, -120);
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
  new THREE.MeshLambertMaterial({ color: 0xe6e0d4 })
);
ground.receiveShadow = true;
ground.position.y = -0.05;
scene.add(ground);

/* ============================== plaza ============================== */
// Explanada sintética (OSM no trae polígono de plaza): rectángulo local aprox.
const PLAZA = { x0: -8, x1: 32, z0: -20, z1: 26 };
const TORRE = { x: 22.7, z: 7.1, r: 6.5 };   // Campanar de Gràcia, en medio de la plaza
const plazaMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(PLAZA.x1 - PLAZA.x0, PLAZA.z1 - PLAZA.z0).rotateX(-Math.PI / 2),
  new THREE.MeshLambertMaterial({ color: 0xf2ead9 })
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
  new THREE.LineBasicMaterial({ color: 0x5fd0ff, transparent: true, opacity: 0.85 })
);
scene.add(plazaEdge);

/* ============================== kiosko héroe ============================== */
const kiosk = new THREE.Group();
kiosk.name = 'kiosk';
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
    new THREE.MeshLambertMaterial({ color: 0x5fd0ff }));
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
  sc.fillStyle = '#5fd0ff'; sc.font = 'bold 44px Menlo, monospace';
  sc.textAlign = 'center'; sc.textBaseline = 'middle';
  sc.fillText('NEWS & COFFEE', 256, 42);
  const signTx = new THREE.CanvasTexture(signCv);
  signTx.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.56),
    new THREE.MeshBasicMaterial({ map: signTx, toneMapped: false }));
  sign.rotation.y = Math.PI / 2;
  sign.position.set(2.42, 3.15, 0);

  // halo cian en el suelo
  const halo = new THREE.Mesh(new THREE.RingGeometry(3.6, 4.5, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x5fd0ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
  halo.position.y = 0.06;

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
  realTexture: null,
};
const franja = () => FRANJAS[state.franjaIdx];

function dominanteDe(mix) {
  return PERFILES.reduce((a, b) => (mix[a] >= mix[b] ? a : b));
}

/* ============================== pantalla del kiosko ============================== */
function drawCreative() {
  const c = screenCtx, W = 640, H = 360;
  const dom = state.dominante || dominanteDe(franja().mix);
  const r = REGLAS[dom];
  if (state.realItem && state.realTexture) return; // textura real montada
  c.fillStyle = r.bg; c.fillRect(0, 0, W, H);
  c.fillStyle = 'rgba(255,255,255,.16)';
  c.fillRect(0, 0, W, 64);
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
  if (state.realItem) {
    c.fillText('● EMISIÓN REAL admira.tv · ' + realItemName(), W / 2, 322);
  } else {
    c.fillText('ADcelerate → OOH Media · Plaça Vila de Gràcia', W / 2, 322);
  }
  screenTexture.needsUpdate = true;
}
function realItemName() {
  const it = state.realItem;
  if (!it) return '';
  return String(it.name || it.title || it.file || it.id || 'contenido').slice(0, 40);
}

/* ============================== feed real admira.tv ============================== */
async function pollSignage() {
  try {
    const r = await fetch(SIGNAGE_URL, { cache: 'no-store' });
    const j = await r.json();
    const item = (j && j.ok && j.item) ? j.item : null;
    const changed = JSON.stringify(item) !== JSON.stringify(state.realItem);
    state.realItem = item;
    const badge = $('badge-real'), feed = $('feedstate');
    if (item) {
      badge.classList.remove('hidden');
      feed.textContent = 'REAL · admira.tv';
      feed.classList.add('real');
      if (changed) tryRealTexture(item);
    } else {
      badge.classList.add('hidden');
      feed.textContent = 'simulado (regla)';
      feed.classList.remove('real');
      state.realTexture = null;
      screenMat.map = screenTexture;
      screenMat.needsUpdate = true;
      drawCreative();
    }
    updateOnscreenHUD();
  } catch (e) { /* red caída: seguimos en simulado, sin romper */ }
}
function tryRealTexture(item) {
  const url = item && (item.url || item.src || item.file);
  state.realTexture = null;
  drawCreative(); // rótulo de emisión real como mínimo
  if (!url || !/\.(png|jpe?g|webp|gif)(\?|$)/i.test(String(url))) return;
  new THREE.TextureLoader().setCrossOrigin('anonymous').load(url, tx => {
    tx.colorSpace = THREE.SRGBColorSpace;
    state.realTexture = tx;
    screenMat.map = tx;
    screenMat.needsUpdate = true;
  }, undefined, () => { /* CORS u otro fallo: solo rótulo */ });
}

/* ============================== carga de la ciudad ============================== */
let buildingsMesh = null, buildingPick = [];   // [{tri0, tri1, meta}]
const rng = mulberry32(20260712);

fetch('data/gracia-local.json').then(r => r.json()).then(data => {
  buildCity(data);
  buildCrowd(data);
  $('loading').classList.add('done');
}).catch(err => {
  $('loading').innerHTML = '<p>Error cargando datos: ' + err + '</p>';
});

function buildCity(data) {
  // ---- edificios extruidos, fusionados en 1 draw call, con mapa de picking
  const palette = [0xf7f3ea, 0xefe8dc, 0xe9e2d3, 0xf2ece0, 0xece4d4];
  const geos = [];
  let triCursor = 0;
  const tmpColor = new THREE.Color();
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
    // color por edificio (determinista por id)
    const ci = (b.id || 0) % palette.length;
    tmpColor.setHex(b.name ? 0xf9edd8 : palette[ci]);
    const n = g.attributes.position.count;
    const cols = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { cols[i * 3] = tmpColor.r; cols[i * 3 + 1] = tmpColor.g; cols[i * 3 + 2] = tmpColor.b; }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const tris = n / 3;
    buildingPick.push({ tri0: triCursor, tri1: triCursor + tris, meta: b });
    triCursor += tris;
    geos.push(g);
  }
  const merged = BGU.mergeGeometries(geos, false);
  buildingsMesh = new THREE.Mesh(merged,
    new THREE.MeshLambertMaterial({ vertexColors: true }));
  buildingsMesh.castShadow = true;
  buildingsMesh.receiveShadow = true;
  buildingsMesh.name = 'buildings';
  scene.add(buildingsMesh);

  // ---- viales como cintas planas
  const W_BY_HW = { footway: 2.5, path: 2.5, steps: 2.5, pedestrian: 4, cycleway: 2.5, service: 3.5, living_street: 5, residential: 5.5, unclassified: 5.5, tertiary: 7, secondary: 9, primary: 10 };
  const pos = [];
  const v = new THREE.Vector2();
  for (const rd of data.roads) {
    const w = (W_BY_HW[rd.hw] || 4.5) / 2;
    for (let i = 0; i < rd.pts.length - 1; i++) {
      const [x1, z1] = rd.pts[i], [x2, z2] = rd.pts[i + 1];
      v.set(z2 - z1, -(x2 - x1)).normalize().multiplyScalar(w); // perpendicular
      const ax = x1 + v.x, az = z1 + v.y, bx = x1 - v.x, bz = z1 - v.y;
      const cx = x2 + v.x, cz = z2 + v.y, dx = x2 - v.x, dz = z2 - v.y;
      pos.push(ax, 0.01, az, cx, 0.01, cz, bx, 0.01, bz,
               bx, 0.01, bz, cx, 0.01, cz, dx, 0.01, dz);
    }
  }
  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  roadGeo.computeVertexNormals();
  const roads = new THREE.Mesh(roadGeo, new THREE.MeshLambertMaterial({ color: 0xd8d2c4 }));
  roads.receiveShadow = true;
  scene.add(roads);
}

/* ============================== multitud (presencias) ============================== */
let crowd = null;
const crowdProfileU = new Float32Array(MAX_CROWD); // aleatorio estable por instancia
function buildCrowd(data) {
  // puntos de spawn deterministas: 65% plaza, 35% calles cercanas
  const streetPts = [];
  for (const rd of data.roads) {
    for (const [x, z] of rd.pts) {
      if (Math.hypot(x, z) < 170) streetPts.push([x, z]);
    }
  }
  const spawns = [];
  while (spawns.length < MAX_CROWD) {
    if (rng() < 0.65 || streetPts.length === 0) {
      const x = lerp(PLAZA.x0 + 2, PLAZA.x1 - 2, rng());
      const z = lerp(PLAZA.z0 + 2, PLAZA.z1 - 2, rng());
      if (Math.hypot(x, z) < 5) continue;                              // no dentro del kiosko
      if (Math.hypot(x - TORRE.x, z - TORRE.z) < TORRE.r) continue;    // ni dentro del Campanar
      spawns.push([x, z]);
    } else {
      const [sx, sz] = streetPts[Math.floor(rng() * streetPts.length)];
      spawns.push([sx + (rng() - 0.5) * 5, sz + (rng() - 0.5) * 5]);
    }
  }
  const geo = new THREE.CapsuleGeometry(0.32, 1.05, 3, 8);
  geo.translate(0, 0.85, 0);
  crowd = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial(), MAX_CROWD);
  crowd.castShadow = true;
  crowd.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < MAX_CROWD; i++) {
    crowdProfileU[i] = rng();
    p.set(spawns[i][0], 0, spawns[i][1]);
    q.setFromAxisAngle(up, rng() * Math.PI * 2);
    const k = 0.85 + rng() * 0.3;
    s.set(k, k * (0.9 + rng() * 0.25), k);
    m.compose(p, q, s);
    crowd.setMatrixAt(i, m);
    crowd.setColorAt(i, new THREE.Color(0xaaaaaa));
  }
  crowd.count = 0;
  scene.add(crowd);
  applyFranja(state.franjaIdx, true);
}

const _c = new THREE.Color();
function updateCrowd() {
  if (!crowd) return;
  const n = Math.min(MAX_CROWD, Math.round(state.cur.aforo));
  crowd.count = n;
  // umbrales acumulados del mix interpolado
  const mx = state.cur.mix;
  const tot = PERFILES.reduce((a, p2) => a + mx[p2], 0) || 1;
  const cum = []; let acc = 0;
  for (const p2 of PERFILES) { acc += mx[p2] / tot; cum.push(acc); }
  for (let i = 0; i < n; i++) {
    const u = crowdProfileU[i];
    let pi = 0; while (pi < 3 && u > cum[pi]) pi++;
    _c.setHex(PERFIL_COLOR[PERFILES[pi]]);
    crowd.setColorAt(i, _c);
  }
  if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true;
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
  $('btn-flight').onclick = startFlight;
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
    drawCreative();
    updateOnscreenHUD();
  }
  document.querySelectorAll('#franjas button').forEach((b, i) =>
    b.classList.toggle('active', i === state.franjaIdx));
}
function updateOnscreenHUD() {
  const el = $('onscreen');
  if (state.realItem) {
    el.textContent = '▶ ' + realItemName() + ' (real)';
  } else {
    const r = REGLAS[state.dominante || dominanteDe(franja().mix)];
    el.textContent = `Creatividad ${r.cre} · ${r.titulo}`;
  }
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
});
renderer.domElement.addEventListener('pointerup', e => {
  if (!downXY) return;
  const moved = Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]);
  downXY = null;
  if (moved > 6) return; // era drag
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const targets = [kiosk, plazaMesh];
  if (buildingsMesh) targets.push(buildingsMesh);
  const hits = raycaster.intersectObjects(targets, true);
  if (!hits.length) { $('ficha').classList.add('hidden'); return; }
  const h = hits[0];
  let o = h.object;
  while (o && o !== kiosk && o.name !== 'plaza' && o.name !== 'buildings') o = o.parent;
  if (o === kiosk) return showFichaKiosk();
  if (o && o.name === 'plaza') return showFichaPlaza();
  if (o && o.name === 'buildings') return showFichaBuilding(h.faceIndex);
});

function ficha(html) {
  $('ficha-body').innerHTML = html;
  $('ficha').classList.remove('hidden');
}
function showFichaKiosk() {
  const feed = state.realItem ? 'REAL · emitiendo desde admira.tv' : 'Simulado · regla ADcelerate';
  const r = REGLAS[state.dominante || dominanteDe(franja().mix)];
  const enPantalla = state.realItem ? realItemName() : `Creatividad ${r.cre} — ${r.titulo}`;
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
function showFichaBuilding(faceIndex) {
  // búsqueda binaria del edificio por triángulo
  let lo = 0, hi = buildingPick.length - 1, found = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1, e = buildingPick[mid];
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

/* ============================== vuelo guiado ============================== */
let flight = null;
function startFlight() {
  $('ficha').classList.add('hidden');
  controls.autoRotate = false;
  controls.enabled = false;
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
  controls.enabled = true;
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

  tickFlight(now);
  controls.update();
  renderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* ============================== arranque ============================== */
buildHUD();
applyFranja(state.franjaIdx, true);
drawCreative();
updateOnscreenHUD();
pollSignage();
setInterval(pollSignage, SIGNAGE_POLL_MS);
requestAnimationFrame(animate);

// gancho de inspección (demo/debug)
window.__dbg = { camera, controls, state, startFlight, applyFranja };
