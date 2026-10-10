import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Player de tinta electrónica (role 'eink', encargo 5579). Latido real de eink-sy11-ab tal
// como lo devuelve api.admira.store/signage/screens desde v.10.10.2026.r1.16:43.
const read = f => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
const mando = read('./mando.html'), players = read('./players.html'), playlists = read('./playlists/index.html');
const remote = read('./remotecontrol/index.html'), room = read('./roombooking/index.html'), lib = read('./assets/admira-eink.js');

const ctx = vm.createContext({});
vm.runInContext(lib, ctx);
const E = ctx.AdmiraEink;
const plain = v => JSON.parse(JSON.stringify(v));

const SY11 = { screen: 'eink-sy11-ab', role: 'eink', online: true, locName: 'Tinta electrónica · SY11-ab',
  user_agent: 'AdmiraEinkBridge/1.0 (+admira.tv player eink)',
  device: { display: { width: 480, height: 800, colorDepth: 2 },
    eink: { type: 'eink', model: 'SY11-ab', firmware: 'SY11-014', resolution: '480x800', palette: ['black', 'white', 'yellow', 'red'],
      imageOnly: true, slowRefresh: true, status: 'ok', lastSendAt: '2026-10-10T16:36:56+0200', sends: 1, paused: false, pin: 1453 } },
  health: { ok: true, status: 'ok' } };

test('se reconoce un player de tinta por rol, por device.eink o por el UA del puente', () => {
  assert.equal(E.isEink(SY11), true);
  assert.equal(E.isEink({ role: 'eink' }), true);
  assert.equal(E.isEink({ device: { eink: { model: 'SY11-ab' } } }), true);
  assert.equal(E.isEink({ user_agent: 'AdmiraEinkBridge/1.0' }), true);
  assert.equal(E.isEink({ role: 'canal', user_agent: 'Mozilla/5.0 Chrome/151' }), false);
  assert.equal(E.isEink(null), false);
});

test('el rótulo dice 480x800 BWRY, solo imagen, refresco lento, último envío y batería n/d', () => {
  assert.equal(E.resumen(SY11), 'Tinta · 480x800 BWRY · solo imagen · refresco lento · último envío 16:36 · batería n/d');
  const conError = { ...SY11, device: { ...SY11.device, eink: { ...SY11.device.eink, status: 'error', lastError: 'BLE: no encontrado', battery: 87 } }, health: { ok: false, status: 'error' } };
  assert.match(E.resumen(conError), /batería 87 % · ERROR$/);
  assert.equal(E.estado(conError).error, true);
});

test('Status enseña el estado guardado en device.eink y health', () => {
  const rows = Object.fromEntries(plain(E.statusRows(SY11)).map(r => [r[0], r[1]]));
  assert.equal(rows['Tipo'], 'Tinta electrónica · SY11-ab');
  assert.equal(rows['Panel'], '480 × 800 px · 4 colores BWRY');
  assert.equal(rows['Firmware'], 'SY11-014');
  assert.equal(rows['Contenido'], 'Solo imagen');
  assert.match(rows['Refresco'], /^Lento/);
  assert.equal(rows['Estado'], 'Correcto');
  assert.equal(rows['Último envío'], '10/10 · 16:36');
  assert.equal(rows['Pieza fijada'], '#1453');
  assert.match(rows['Batería'], /^n\/d/);
  assert.match(mando, /<script src="\/assets\/admira-eink\.js/);
  assert.match(mando, /grid\.insertBefore\(statusCard\(AdmiraEink\.ICONO\+' '\+AdmiraEink\.NOMBRE,AdmiraEink\.statusRows\(einkRec\),true\)/);
  assert.match(mando, /health:nowData\.health\|\|record\.health\|\|null/);
});

test('el Mando no ofrece vídeo, volumen ni rotación a una pantalla de tinta', () => {
  assert.match(mando, /document\.body\.classList\.toggle\('eink-target',on\)/);
  const css = /body\.eink-target #rotationPicker[^{]*\{display:none\}/.exec(mando);
  assert.ok(css, 'falta la regla que oculta los controles');
  for (const sel of ['#rotationPicker', '#mute', '.vol', '#seekStrip', '[data-cmd="medio video"]']) assert.ok(css[0].includes('body.eink-target ' + sel) || css[0].includes(sel), sel);
  for (const cmd of ['content-1453', 'content-clear', 'next', 'prev', 'first', 'last', 'refresh', 'standby', 'resume']) assert.equal(E.aceptaOrden(cmd), true, cmd);
  for (const cmd of ['volume 40', 'rotation-90', 'audiooff', 'medio video', 'fit-fill']) assert.equal(E.aceptaOrden(cmd), false, cmd);
});

test('el Mando espera el acuse de la tinta el tiempo que tarda en pintar el panel', () => {
  assert.match(mando, /var EINK_TIMEOUT_MS = 180000;/);
  assert.match(mando, /limit=ackTimeoutFor\(target\.screen\)/);
  // No publica /screen/cache: el acuse «executed» cierra el envío, sin esperar una descarga.
  assert.match(mando, /if\(targetIsEink\(\)\)\{ if\(sent\.action\)\{ sent\.action\.doneLabel='✓ Enviado a tinta'/);
  assert.match(mando, /else if\(!await waitTaggedAvailability\(sent,action\)\) return;/);
});

test('«apto tinta» = imagen vertical, o pieza etiquetada para tinta', () => {
  assert.equal(E.apto({ type: 'image', ancho: 480, alto: 800 }), true);
  assert.equal(E.apto({ type: 'image', ancho: 1920, alto: 1080 }), false);
  assert.equal(E.apto({ type: 'image', orientacion: 'vertical' }), true);
  assert.equal(E.apto({ type: 'image', tags: ['9:16'] }), true);
  assert.equal(E.apto({ type: 'image', tags: ['eink-sy11-ab'] }), true);
  assert.equal(E.apto({ type: 'image', tags: [] }), false, 'sin medidas ni etiqueta no se da por vertical');
  assert.equal(E.apto({ type: 'video', ancho: 1080, alto: 1920 }), false, 'la tinta no reproduce vídeo');
});

test('Playlists filtra «apto tinta» y envía la pieza con content-<nº>', () => {
  assert.match(playlists, /<option value="eink">🖋️ Apto tinta \(imagen vertical\)<\/option>/);
  assert.match(playlists, /else if\(ty==='eink'\)\{ if\(!AdmiraEink\.apto\(it\)\) return false; \}/);
  assert.match(playlists, /class="pkInk" data-ink="'\+esc\(it\.num\)\+'"/);
  assert.match(playlists, /const screen=\$\('pkInkTarget'\)\.value, cmd='content-'\+num/);
  assert.match(playlists, /body:JSON\.stringify\(\{id:screen,screen,cmd\}\)/);
  assert.match(playlists, /LIVE\.filter\(s=>AdmiraEink\.isEink\(s\)\)/);
});

test('players.html lista la tinta aparte y no la deja entrar en sincronizado ni en mural', () => {
  assert.match(players, /<section id="inkPanel" class="panel" hidden>/);
  assert.match(players, /state\.ink=state\.screens\.filter\(p=>AdmiraEink\.isEink\(p\)\);state\.screens=state\.screens\.filter\(p=>!AdmiraEink\.isEink\(p\)\);renderInk\(\);/);
  assert.match(players, /AdmiraEink\.resumen\(p\)/);
  assert.match(players, /mando\.html\?screen='\+encodeURIComponent\(p\.screen\)/);
});

test('Control remoto rotula la tinta y no le ofrece su botonera', () => {
  assert.match(remote, /if\(\/AdmiraEinkBridge\/i\.test\(ua\)\) return '🖋️';/);
  assert.match(remote, /if\(\/AdmiraEinkBridge\/i\.test\(ua\)\) return 'Tinta electrónica';/);
  assert.match(remote, /\.card\.eink button\.b,\.card\.eink \.ctlrow\{display:none\}/);
});

test('Room Booking enlaza el panel de tinta de la sala', () => {
  assert.match(room, /href="\/mando\.html\?screen=eink-sy11-ab&amp;equipo=[^"]+#status"/);
  assert.match(room, /panel de tinta electrónica \(480 × 800, 4 colores, solo imagen\)/);
});

test('todos los scripts inline tocados siguen compilando', () => {
  for (const [name, html] of [['mando', mando], ['players', players], ['playlists', playlists], ['remotecontrol', remote]]) {
    const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.trim() && !/^\s*[{[]/.test(s));
    assert.ok(scripts.length, name);
    scripts.forEach((code, i) => assert.doesNotThrow(() => new vm.Script(code, { filename: `${name}#${i}` }), `${name}#${i}`));
  }
});
