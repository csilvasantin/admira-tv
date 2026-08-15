import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const canal = await readFile(new URL('./canal.html', import.meta.url), 'utf8');
const downloads = await readFile(new URL('./player/index.html', import.meta.url), 'utf8');

test('Android publica la nomenclatura AdmiraNeXTv sin hora y con release', () => {
  assert.match(downloads, /AdmiraNeXTv\.2026\.15\.08\.r15 · versionCode 6/);
  assert.match(canal, /'AdmiraNeXTv\.'\+m\[3\]\+'\.'\+m\[1\]\+'\.'\+m\[2\]\+'\.r'\+m\[4\]/);
  assert.match(canal, /player='AdmiraNeXT Android Player'/);
  assert.match(canal, /playerVersion=\(nativeAndroid&&nativeAndroid\[1\]\)\|\|androidRelease/);
});

test('un Android WebView sin token nativo deja de aparecer como Web Player', () => {
  assert.match(canal, /\/Android\/i\.test\(ua\)&&\/\\bwv\\b\/i\.test\(ua\)/);
  assert.match(canal, /nativeAndroid=\/AdmiraAndroidPlayer\\\/\(\[\^\\s\(\]\+\)\/i\.exec\(ua\)/);
});
