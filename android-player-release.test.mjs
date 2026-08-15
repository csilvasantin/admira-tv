import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const canal = await readFile(new URL('./canal.html', import.meta.url), 'utf8');
const downloads = await readFile(new URL('./player/index.html', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('./player/android-release.json', import.meta.url), 'utf8'));
const apk = await readFile(new URL('./player/admira-player.apk', import.meta.url));
const headers = await readFile(new URL('./_headers', import.meta.url), 'utf8');

test('Android publica la nomenclatura AdmiraNeXTv sin hora y con release', () => {
  assert.match(downloads, /AdmiraNeXTv\.2026\.15\.08\.r16 · versionCode 7/);
  assert.match(canal, /'AdmiraNeXTv\.'\+m\[3\]\+'\.'\+m\[1\]\+'\.'\+m\[2\]\+'\.r'\+m\[4\]/);
  assert.match(canal, /player='AdmiraNeXT Android Player'/);
  assert.match(canal, /playerVersion=\(nativeAndroid&&nativeAndroid\[1\]\)\|\|androidRelease/);
});

test('el manifiesto OTA corresponde byte por byte con el APK publicado', () => {
  assert.equal(manifest.versionCode, 7);
  assert.equal(manifest.versionName, 'AdmiraNeXTv.2026.15.08.r16');
  assert.equal(manifest.url, 'https://admira.tv/player/admira-player.apk');
  assert.equal(manifest.size, apk.length);
  assert.equal(manifest.sha256, createHash('sha256').update(apk).digest('hex'));
  assert.match(headers, /\/player\/android-release\.json\n  Content-Type: application\/json; charset=utf-8\n  Cache-Control: no-store/);
});

test('un Android WebView sin token nativo deja de aparecer como Web Player', () => {
  assert.match(canal, /\/Android\/i\.test\(ua\)&&\/\\bwv\\b\/i\.test\(ua\)/);
  assert.match(canal, /nativeAndroid=\/AdmiraAndroidPlayer\\\/\(\[\^\\s\(\]\+\)\/i\.exec\(ua\)/);
});
