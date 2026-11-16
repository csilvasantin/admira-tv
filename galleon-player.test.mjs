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
  assert.match(player, /slotAt\(playlist\.slots, serverNow\(\) \+ jump\.ms\)/);
  assert.match(player, /if \(plan\.variants \|\| plan\.item\)/);
  assert.match(player, /plan\.power === 'off'/);
  assert.match(player, /clockOffset = Number\(next\.serverNow\)/);
});

test('el gemelo puede volver a la señal real y el adaptador USB lee los fotogramas y late sólo con ?native=1', () => {
  assert.match(player, /admira:galleon:live/);
  assert.match(player, /window\.admiraGalleonFrames = sinceKeys =>/);
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
  assert.match(usb, /Elgato Stream Deck/);
  assert.match(usb, /AdmiraCorsair\/fullscreen\/ready\.json/);
  assert.match(usb, /createExitGesture\(\(\) => void returnToElgato\(\), \{ onTap: index => void jumpTo\(index\) \}\)/);
  assert.match(usb, /ADMIRA_GALLEON_INSECURE === '1' && \/\^http:\\\/\\\/\(127\\\.0\\\.0\\\.1\|localhost\)/);
  assert.match(usb, /last-lcd\.png/);
  assert.match(usb, /last-keys\.png/);
  assert.match(launcher, /tv\.admira\.galleon\.player/);
  assert.match(launcher, /SuccessfulExit<\/key><false\/>/);
  assert.match(launcher, /captura\)/);
});

test('el player suena por el Mac Studio (sólo la pista horizontal) y la rueda izquierda del Galleon es el volumen', () => {
  assert.doesNotMatch(usb, /'--mute-audio'/); // no lo pasamos nosotros…
  assert.match(usb, /ignoreDefaultArgs: \['--' \+ 'mute-audio'\]/); // …y puppeteer tampoco (lo añade a todo headless)
  assert.match(usb, /if \(!volumeControl\('rotate', control, value\)\) transportControl\('rotate', control, value\)/); // izquierda volumen, derecha transporte
  assert.match(usb, /if \(!gesture\('down', control\) && !taps\('down', control\) && !volumeControl\('down', control\)\) transportControl\('down', control\)/); // la tecla 12 sigue siendo la salida
  assert.match(usb, /createVolumeControl\(state => \{/);
  assert.match(usb, /setEncoderRingColors\(0, ringColors\(audio\)\)/);
  assert.match(usb, /volume\.json/);
  assert.match(usb, /volume: audio\.volume, muted: audio\.muted/);
  assert.match(player, /function applyAudio\(\)/);
  assert.match(player, /const sounds = orientation === 'landscape' && !audio\.muted;/);
  assert.match(player, /audio = \{ muted: !output\?\.connected \|\| output\.muted === true \|\| volume === 0, volume \};/);
  assert.match(player, /audio: \{ muted: audio\.muted, volume: audio\.volume, playing: playing && !audio\.muted && pausedAt === null \}/);
  assert.match(player, /const output = NATIVE && window\.admiraGalleonOutput/); // fuera del adaptador la página va muda
});

test('el adaptador usa su Chrome for Testing (otro bundle id) para no dejar «abierto» el Chrome de Carlos sin ventana', () => {
  assert.match(usb, /function chromeForTesting\(\)/);
  assert.match(usb, /process\.env\.ADMIRA_GALLEON_CHROME \|\| chromeForTesting\(\) \|\| '\/Applications\/Google Chrome\.app/);
  assert.match(launcher, /browsers install chrome@stable --path "\$RUNTIME\/browsers"/);
  assert.match(launcher, /ADMIRA_GALLEON_CHROME<\/key><string>\$chrome<\/string>/);
  assert.match(launcher, /navegador\) navegador ;;/);
  assert.doesNotMatch(launcher, /falta Google Chrome en \/Applications/);
});

test('el mando enseña «📺 Pantallas» solo para hotel-creel y manda pantallas-on/off por la cola confirmada', () => {
  assert.match(mando, /<button id="pantallas" hidden title="Pantalla LED del Hotel Creel/);
  assert.match(mando, /function pantallasScreen\(\)\{ return !!\(T&&T\.screen==='hotel-creel'\); \}/);
  assert.match(mando, /sendRemote\(desired\?'pantallas-on':'pantallas-off',pb\)/);
  assert.match(mando, /paintPantallas\(\);\n    \}/);
});

test('las 12 teclas son el navegador de la playlist (6 anteriores arriba, 6 siguientes abajo) y un toque salta; la LCD lleva sola el player (Carlos, 16-nov-2026)', () => {
  assert.match(player, /import \{ paintLcd, paintKeys \} from '\.\/galleon-layout\.mjs'/);
  assert.match(player, /navigatorWindow\(total, onAir\.index, \{ before: KEYS_BEFORE, after: KEYS_AFTER \}\)/);
  assert.match(player, /const KEYS_BEFORE = 6, KEYS_AFTER = 6;/);
  assert.match(player, /const tracks = \{ landscape: null \};/); // ya no se decodifica la pista vertical
  assert.doesNotMatch(player, /setTrack\('portrait'/);
  assert.match(player, /paintLcd\(lcd, landscape\);/);
  assert.match(player, /if \(jump\.rev !== playlist\.rev\) jump = \{ ms: 0, rev: playlist\.rev \};/); // el salto se olvida con otra playlist
  assert.match(player, /window\.admiraGalleonJump = key => jumpToKey\(Number\(key\)\);/);
  assert.match(player, /if \(onAir\.source !== 'playlist' \|\| twinSelection !== null \|\| !Number\.isInteger\(index\)/); // con playout mandando no hay salto
  assert.match(player, /if \(keypad\.painted && keypad\.rev !== sinceKeys\) frames\.keys = mosaic\.toDataURL/); // teclas sólo si cambiaron
  assert.match(player, /function previewOf\(item\)/);
  assert.doesNotMatch(player, /\blet navigator\b/); // sombrearía window.navigator
  assert.match(usb, /createKeyTaps\(index => void jumpTo\(index\)\)/);
  assert.match(usb, /window\.admiraGalleonJump\(key\)/);
  assert.match(usb, /window\.admiraGalleonFrames\(since\) : null, lastKeys\)/);
  assert.match(usb, /if \(frames\.frame === lastFrame\) return Boolean\(keysJpeg\);/); // la LCD a cada fotograma; las teclas, al cambiar
});

test('la rueda derecha es el transporte: pulsar pausa o reanuda (anillo ámbar/azul), girar pasa a la siguiente o a la anterior pieza (Carlos, 16-nov-2026)', () => {
  assert.match(usb, /createTransportControl\(action => void transportAction\(action\)\)/);
  assert.match(usb, /setEncoderRingColors\(1, transportRing\(\{ paused \}\)\)/);
  assert.match(usb, /window\.admiraGalleonTransport\(a\)/);
  assert.match(player, /window\.admiraGalleonTransport = action => transport\(String\(action\)\);/);
  assert.match(player, /if \(twinSelection !== null \|\| !plan \|\| pausedAt !== null\) return;/); // en pausa el programa no toca nada
  assert.match(player, /jump = \{ ms: jump\.ms - \(serverNow\(\) - pausedAt\), rev: playlist\.rev \};/); // al reanudar sigue por donde iba
  assert.match(player, /jumpToSlot\(\(\(\(onAir\.index \+ \(action === 'next' \? 1 : -1\)\) % total\) \+ total\) % total\);/);
  assert.match(player, /paused: pausedAt !== null, ready: readiness\(\)/);
});

test('las piezas del Stock etiquetadas corsair-galleon-100 (índice del Stock o lista auto de la API) se emiten detrás de la manual y el vídeo enseña su duración real (Carlos, 16-nov-2026)', () => {
  assert.match(player, /const STOCK_INDEX = 'https:\/\/stock\.admira\.store\/stock\/index\.json';/);
  assert.match(player, /taggedForScreen\(Array\.isArray\(data\) \? data : data\?\.items \|\| data\?\.assets \|\| \[\], SCREEN\)/);
  assert.match(player, /for \(const item of \[\.\.\.sources\.auto, \.\.\.sources\.tagged\]\)/); // detrás de la manual, sin repetir
  assert.match(player, /slots: pairPlaylist\(\[\.\.\.draft\.items, \.\.\.extra\]\)/);
  assert.match(player, /const rev = String\(draft\.rev\) \+ \(extra\.length \? '\+' \+ extra\.map\(item => item\.stockId \|\| item\.id\)\.join\(','\) : ''\);/); // cambia al entrar o salir una
  assert.match(player, /learnDuration\(at\.slot, tracks\.landscape\);/);
  assert.match(player, /slot\.seconds = Math\.max\(2, Math\.ceil\(duration\)\);/);
  assert.match(player, /void refreshStock\(\);/);
});

test('con lametric.json en el Mac Studio, el adaptador enseña en el reloj LaMetric el título en antena y lo retira al ceder el teclado; la clave nunca va al registro', () => {
  assert.match(usb, /const LAMETRIC_FILE = path\.join\(RUNTIME, 'lametric\.json'\);/);
  assert.match(usb, /lametricShow\(lametricText\(frames\.onAir, \{ paused, connected: true \}\)\);/);
  assert.match(usb, /device = null;\n  lametricShow\(''\);/); // al soltar el teclado, el reloj vuelve a su hora
  assert.match(usb, /\{ priority: 'info', icon_type: 'none', model: \{ cycles: 0, frames: \[\{ text \}\] \} \}/); // sin lifetime (el reloj lo rechaza); se queda hasta sustituir o retirar
  assert.match(usb, /lametricRetryAt = Date\.now\(\) \+ 30000;/); // tras un error no se insiste a cada fotograma
  assert.match(usb, /lametricRequest\('DELETE', '\/device\/notifications\/'/);
  assert.doesNotMatch(usb, /log\([^)]*lametric\.key/); // la clave no se registra
  assert.match(usb, /lametric: lametric \? \{ host: lametric\.host, shown: lametricShown \} : null/); // status.json sin la clave
});
