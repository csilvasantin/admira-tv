import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const S = require('./assets/showsync.js');
const canal = await readFile(new URL('./canal.html', import.meta.url), 'utf8');

test('show-sync: offset NTP de dos marcas y mejor muestra por RTT', () => {
  assert.deepEqual(S.sample(1000, 1040, 5020), { offset: 4000, rtt: 40 });
  assert.equal(S.sample(1000, 990, 5000), null);          // RTT negativo
  assert.equal(S.sample(1000, 1010, NaN), null);
  const best = S.bestSample([{ offset: 10, rtt: 80 }, null, { offset: 12, rtt: 9 }, { offset: 30, rtt: 200 }]);
  assert.deepEqual(best, { offset: 12, rtt: 9 });
});

test('show-sync: formato HH:MM:SS.mmm en Madrid y posición en ms', () => {
  const ms = Date.UTC(2026, 10, 12, 11, 22, 33, 45);
  assert.equal(S.tzOffsetMinutes(ms, 'Europe/Madrid'), 60);
  assert.equal(S.formatClock(ms, 60), '12:22:33.045');
  assert.equal(S.formatClock(Date.UTC(2026, 6, 1, 23, 59, 59, 999), 120), '01:59:59.999');
  assert.equal(S.formatPosition(87290.4), '1:27.290  ·  87290 ms');
  assert.equal(S.formatPosition(NaN), '—');
});

test('show-sync: reloj de servidor corrige por retardo de red', async () => {
  let perf = 0;
  const clock = S.createServerClock({
    perfNow: () => perf, wallNow: () => 1_000_000,
    fetchServerNow: async () => { perf += 50; const server = 2_000_000 + perf; perf += 50; return server; },
    samples: 3,
  });
  assert.equal(clock.ready, false);
  assert.equal(await clock.measure(), true);
  assert.equal(clock.rtt, 100);
  // El servidor marcó a mitad del viaje: el reloj corregido coincide con él.
  assert.equal(clock.offset, 1_000_000);
  assert.equal(clock.now(), 2_000_000 + perf);
});

test('show-sync: mando on/off/toggle y parámetro de URL', () => {
  assert.equal(S.commandState('showsync-on', false), true);
  assert.equal(S.commandState('/SHOWSYNC-OFF', true), false);
  assert.equal(S.commandState('showsync-toggle', true), false);
  assert.equal(S.commandState('ontop-on', false), null);
  assert.equal(S.parseFlag('1'), true);
  assert.equal(S.parseFlag('0'), false);
  assert.equal(S.parseFlag(null), null);
});

test('show-sync: canal carga el módulo y lo engancha a la cola /locations/cmd sin tocar la emisión', () => {
  assert.match(canal, /<script src="\/assets\/showsync\.js\?v=[^"]+"><\/script>/);
  const exec = canal.slice(canal.indexOf('async function executeQueuedCommand('), canal.indexOf("if(['standby','blackout'"));
  assert.match(exec, /AdmiraShowSync\.commandState\(cmd/);
  assert.match(canal, /const ADM_SHOWSYNC=\(function\(\)\{/);
  assert.match(canal, /\/api\/playout\?screen=/);
  const src = await_src();
  assert.match(src, /pointer-events:none/);
  assert.match(src, /requestAnimationFrame/);
  assert.doesNotMatch(src, /\.currentTime\s*=|\.play\(|\.pause\(/);   // sólo lectura
});
function await_src() { return require('node:fs').readFileSync(new URL('./assets/showsync.js', import.meta.url), 'utf8'); }
