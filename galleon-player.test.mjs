// Corsair Galleon 100 SD como player (encargo #7569, Neo, 13-nov-2026): alta en /players y mando, señal al adaptador USB.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const read = file => fs.readFileSync(new URL(file, import.meta.url), 'utf8');
const player = read('./assets/galleon-player.mjs');
const players = read('./players.html');
const mando = read('./mando.html');
const usb = read('./tools/galleon-player/galleon-usb.cjs');
const launcher = read('./tools/galleon-player/macstudio-galleon.command');

test('el player emite en autónomo desde su playlist propia y cede al playout (Custom · Dual H·V / extendido)', () => {
  assert.match(player, /from '\.\/galleon-schedule\.mjs'/);
  assert.match(player, /\/api\/playlist\?screen=' \+ SCREEN/);
  assert.match(player, /slotAt\(playlist\.slots, serverNow\(\)\)/);
  assert.match(player, /if \(plan\.variants \|\| plan\.item\)/);
  assert.match(player, /plan\.power === 'off'/);
  assert.match(player, /clockOffset = Number\(next\.serverNow\)/);
});

test('el gemelo puede volver a la señal real y el adaptador USB lee los fotogramas y late sólo con ?native=1', () => {
  assert.match(player, /admira:galleon:live/);
  assert.match(player, /window\.admiraGalleonFrames = \(\) =>/);
  assert.match(player, /window\.admiraGalleonOutput/);
  const native = player.indexOf('if (NATIVE) {');
  assert.ok(native > 0);
  assert.ok(player.indexOf('fetch(NOW_API') > native, 'el latido vive dentro del bloque nativo');
  assert.ok(player.indexOf('window.admiraGalleonFrames = ') > native, 'el gancho de fotogramas sólo existe en modo nativo');
  assert.match(player, /standby: !\(playing && output\.connected\)/);
  assert.match(player, /locName: 'Corsair Galleon 100 SD', machine: 'MacStudio'/);
  assert.match(player, /const producer = 'galleon-usb-' \+ SCREEN;/);
  assert.doesNotMatch(player, /adtv_galleon_producer/);
});

test('/players y el mando dan de alta el Galleon aunque el adaptador USB no esté emitiendo', () => {
  assert.match(players, /'corsair-galleon-100':'Corsair Galleon 100 SD'/);
  assert.match(players, /const DECLARED=\[\{screen:'corsair-galleon-100',name:'Corsair Galleon 100 SD'\},\{screen:'hotel-creel',name:'Hotel Creel · LED \(PortAventura\)'\}\]/);
  assert.match(players, /for\(const d of DECLARED\)/);
  assert.match(players, /<section id="galleon" class="panel"><div class="ph"><h2>Corsair Galleon 100 SD<\/h2>/);
  assert.match(players, /data-galleon="\/mando\.html\?screen=corsair-galleon-100"/);
  assert.match(players, /data-galleon="https:\/\/www\.admira\.store\/objeto\/galleon-100\/"/);
  assert.match(players, /function renderGalleon\(\)/);
  assert.match(players, /renderInk\(\);renderGalleon\(\);\}\);/);
  assert.match(mando, /add\('corsair-galleon-100','Corsair Galleon 100 SD','corsair'\);/);
  assert.match(mando, /add\('hotel-creel','Hotel Creel · LED \(PortAventura\)','portaventura'\);/); // la pantalla LED del Hotel Creel también está en el mando
});

test('el adaptador USB cede el teclado, no roba el foco y sólo relaja la seguridad web en pruebas locales', () => {
  execFileSync(process.execPath, ['--check', new URL('./tools/galleon-player/galleon-usb.cjs', import.meta.url).pathname]);
  assert.match(usb, /model === 'galleon-k100'/);
  assert.match(usb, /headless: true/);
  assert.match(usb, /'--mute-audio'/);
  assert.match(usb, /Elgato Stream Deck/);
  assert.match(usb, /AdmiraCorsair\/fullscreen\/ready\.json/);
  assert.match(usb, /createExitGesture\(\(\) => void returnToElgato\(\)\)/);
  assert.match(usb, /ADMIRA_GALLEON_INSECURE === '1' && \/\^http:\\\/\\\/\(127\\\.0\\\.0\\\.1\|localhost\)/);
  assert.match(usb, /last-lcd\.png/);
  assert.match(usb, /last-keys\.png/);
  assert.match(launcher, /tv\.admira\.galleon\.player/);
  assert.match(launcher, /SuccessfulExit<\/key><false\/>/);
  assert.match(launcher, /captura\)/);
});
