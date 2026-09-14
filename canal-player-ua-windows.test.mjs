import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// PASO 1 del inventario de players (14-sep-2026, FLT-100421): el shell Electron firma el UA como
// AdmiraWindowsPlayer/<v> · AdmiraLinuxPlayer/<v> (admira-player/electron/src/config.js) y el canal
// no lo reconocía: los Windows salían como «Web Player» sin versión en players.html y en el mando.
const canal = await readFile(new URL('./canal.html', import.meta.url), 'utf8');

test('el canal reconoce el player Windows y Linux por su token de UA y publica su versión', () => {
  assert.match(canal, /const nativeWin=\/AdmiraWindowsPlayer\\\/\(\[\^\\s\(\]\+\)\/i\.exec\(ua\)/);
  assert.match(canal, /nativeLinux=\/AdmiraLinuxPlayer\\\/\(\[\^\\s\(\]\+\)\/i\.exec\(ua\)/);
  assert.match(canal, /else if\(nativeWin\)\{ player='AdmiraNeXT Windows Player'; playerVersion=nativeWin\[1\]; \}/);
  assert.match(canal, /else if\(nativeLinux\)\{ player='AdmiraNeXT Linux Player'; playerVersion=nativeLinux\[1\]; \}/);
});

test('la detección de Windows va después de macOS, Android e iOS y no rompe la de Android por WebView', () => {
  const i = (re) => canal.search(re);
  assert.ok(i(/if\(nativeMac\)/) < i(/else if\(nativeWin\)/));
  assert.ok(i(/else if\(nativeIOS\)/) < i(/else if\(nativeWin\)/));
  assert.match(canal, /else if\(nativeAndroid \|\| \(\/Android\/i\.test\(ua\)&&\/\\bwv\\b\/i\.test\(ua\)\)\)/);
});
