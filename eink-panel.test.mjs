import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Panel de control de la tinta electrónica en /eink (18-nov-2026). /eink sirve a dos públicos: las pantallas
// (la app de Samsung abre /eink/?screen=<id>) siguen yendo a su player en /eink/player/, sin verja; las
// personas ven el panel, detrás de la verja de acceso como Mando.
const read = f => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
const panel = read('./eink/index.html'), player = read('./eink/player/index.html'), gate = read('./auth-gate.js');
const tizen = read('./tools/tizen-epaper/src/index.html');

function router(search, ua = 'Mozilla/5.0 (Macintosh) Chrome/157') {
  const code = /<script>\s*([\s\S]*?)<\/script>/.exec(panel)[1];
  let destino = null;
  vm.runInNewContext(code, { location: { search, hash: '', replace: u => { destino = u; } }, navigator: { userAgent: ua } });
  return destino;
}

test('una pantalla que abre /eink/?screen= acaba en el player, con su identidad', () => {
  assert.equal(router('?screen=samsung-epaper-ab12'), '/eink/player/?screen=samsung-epaper-ab12');
  assert.equal(router('?cover=1&screen=x1'), '/eink/player/?cover=1&screen=x1');
  assert.equal(router('?player=1'), '/eink/player/?player=1');
});

test('Tizen sin parámetros también va al player; una persona se queda en el panel', () => {
  assert.equal(router('', 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.5) AppleWebKit/537.36'), '/eink/player/');
  assert.equal(router(''), null);
  assert.equal(router('?q=algo'), null);
});

test('el redirector va antes de la verja: el player nunca pasa por el login', () => {
  const redir = panel.indexOf('location.replace("/eink/player/"'), verja = panel.indexOf('src="/auth-gate.js?v=');
  assert.ok(redir > 0 && verja > redir, 'el redirector tiene que ejecutarse antes que auth-gate.js');
  assert.ok(!/auth-gate/.test(player), 'el player de tinta no lleva verja: si se gatea, la pantalla se queda en blanco');
});

test('la app de Samsung sigue apuntando a /eink/ y el player conserva su contrato', () => {
  assert.match(tizen, /https:\/\/www\.admira\.tv\/eink\//);
  assert.match(player, /locations\/cmd/);
  assert.match(player, /signage\/now/);
});

test('/eink se protege con el proyecto del mando a distancia', () => {
  assert.match(gate, /"eink":"digitalsignage-remotecontrol"/);
});

test('el panel usa los contratos de la flota y del Stock', () => {
  for (const url of ['https://api.admira.store/signage/screens', 'https://api.admira.store/locations/cmd', 'https://stock.admira.store/stock/index.json', 'https://api.admira.store/stock/publish'])
    assert.ok(panel.includes(url), url);
  assert.match(panel, /"\/ack\?id="/, 'espera el acuse de cada orden');
  assert.match(panel, /ACK_LIMIT_MS = 180000/, 'la tinta acusa después de pintar: hasta 3 min');
  assert.match(panel, /type: "image", motor: "local"/, 'sube como imagen local, igual que el Stock de admira.studio');
  assert.match(panel, /indexOf\("eink"\) < 0\) t\.unshift\("eink"\)/, 'lo subido lleva siempre #eink');
  assert.ok(!/stock\/list\?/.test(panel), '/stock/list con filtros tarda ~20 s: se filtra el índice público');
});

test('las órdenes de seguir novedades son válidas para una pantalla de tinta', () => {
  const ctx = vm.createContext({});
  vm.runInContext(read('./assets/admira-eink.js'), ctx);
  for (const cmd of ['follow', 'follow-off', 'content-2089', 'content-clear', 'standby', 'resume', 'refresh']) assert.equal(ctx.AdmiraEink.aceptaOrden(cmd), true, cmd);
  for (const cmd of ['follow-everything', 'volume 40']) assert.equal(ctx.AdmiraEink.aceptaOrden(cmd), false, cmd);
});

test('al emitir hay progreso en la misma línea hasta el acuse, y no se duplican órdenes', () => {
  assert.match(panel, /id="progresoEmitir"/, 'la barra de progreso va justo debajo de «Emitir»');
  assert.match(panel, /id="progresoSubir"/, 'subir y emitir también enseña el progreso');
  assert.match(panel, /function faseEstimada\(seg\)/);
  assert.match(panel, /seg < ESPERADO_S \? 4 \+ 92 \* seg \/ ESPERADO_S/, 'no llega al 100 % hasta que la pantalla confirma');
  assert.match(panel, /✓ Ya está en la pantalla/);
  assert.match(panel, /!enCurso\.has\(k\)/, 'una emisión por pantalla a la vez');
  assert.ok(!/y enviada a " \+ ds\.join/.test(panel), 'subir no dice «enviada» si la pantalla no pudo pintarla');
});

test('las fases estimadas siguen los tiempos reales de la SY11', () => {
  const code = /function faseEstimada[\s\S]*?function pctEstimado[^\n]*\n/.exec(panel)[0];
  const ctx = { ESPERADO_S: 95 }; vm.runInNewContext(code + 'this.f=faseEstimada; this.p=pctEstimado;', ctx);
  assert.match(ctx.f(2), /recogiendo/); assert.match(ctx.f(8), /Preparando/); assert.match(ctx.f(40), /Bluetooth/);
  assert.match(ctx.f(95), /Pintando/); assert.match(ctx.f(130), /reintentando/);
  assert.ok(ctx.p(0) < 5 && ctx.p(47) > 45 && ctx.p(94) <= 96 && ctx.p(200) <= 99);
});
