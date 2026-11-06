import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPacket, framePackets, settingsPayload, parseIdentity, numberFans, planEscena, escenaDeConfig, canalUrl, mergeConfig, isJpeg, MAX_PAYLOAD, renumerar } from './core.mjs';
import { normalizarEscena } from './escena.mjs';

test('el paquete sigue la cabecera HID de la TL LCD', () => {
  const p = buildPacket(0x48, 0x10000, 0x0102, new Uint8Array(501).fill(0xab));
  assert.equal(p.length, 512);
  assert.deepEqual([...p.subarray(0, 11)], [2, 0x48, 0, 1, 0, 0, 0, 1, 2, 1, 245]);
  assert.ok(p.subarray(11).every(b => b === 0xab));
});

test('un JPEG se trocea en paquetes de 501 bytes numerados con el tamaño total', () => {
  const jpeg = new Uint8Array(1200).map((_, i) => i & 255);
  const pk = framePackets(jpeg);
  assert.equal(pk.length, 3);
  assert.deepEqual(pk.map(p => p[1]), [0x46, 0x46, 0x46]);
  assert.deepEqual(pk.map(p => p.readUInt32BE(2)), [1200, 1200, 1200]);
  assert.deepEqual(pk.map(p => p[8]), [0, 1, 2]);
  assert.deepEqual(pk.map(p => p.readUInt16BE(9)), [MAX_PAYLOAD, MAX_PAYLOAD, 1200 - 2 * MAX_PAYLOAD]);
  assert.equal(pk[2][11], (2 * MAX_PAYLOAD) & 255);
});

test('ajustes: brillo acotado y giro en pasos de 90°', () => {
  assert.deepEqual([...settingsPayload(255, 270)], [5, 0, 0, 0, 100, 30, 3, 0, 0, 0, 0]);
  assert.deepEqual([...settingsPayload(40, 45)], [5, 0, 0, 0, 40, 30, 0, 0, 0, 0, 0]);
});

test('la identidad lee puerto e índice detrás de la serie', () => {
  const r = Buffer.alloc(64); r.write('TL_LCDV0.1', 11); r[11 + 32] = 1; r[11 + 33] = 2;
  assert.deepEqual(parseIdentity(r), { serial: 'TL_LCDV0.1', port: 1, index: 2 });
});

test('los ventiladores se numeran por puerto y posición en la cadena', () => {
  const n = numberFans([{ port: 2, index: 0 }, { port: 0, index: 1 }, { port: 0, index: 0 }, { port: 1, index: 2 }]);
  assert.deepEqual(n.map(f => [f.port, f.index, f.n]), [[0, 0, 1], [0, 1, 2], [1, 2, 3], [2, 0, 4]]);
});

test('plan por modo: un canal por ventilador, un canal para los 7, o la escena local por ventilador', () => {
  const fans = numberFans([{ port: 0, index: 0 }, { port: 0, index: 1 }]);
  const cfg = mergeConfig();
  const ind = planEscena(normalizarEscena({ modo: 'independiente', ids: { 2: 'auto-69b7b99959e1f062947f' } }, 2), fans, cfg);
  assert.deepEqual(ind.map(p => [p.screen, p.fans, new URL(p.url).searchParams.get('ids')]),
    [['supercomputer-ventilador-1', [1], null], ['supercomputer-ventilador-2', [2], 'auto-69b7b99959e1f062947f']]);
  const rep = planEscena(normalizarEscena({ modo: 'repeat', pieza: 'abc' }, 2), fans, cfg);
  assert.deepEqual(rep.map(p => [p.screen, p.fans, new URL(p.url).searchParams.get('ids')]), [['supercomputer-ventiladores', [1, 2], 'abc']]);
  for (const modo of ['sincro', 'extend']) {
    assert.deepEqual(planEscena(normalizarEscena({ modo, pieza: 'abc' }, 2), fans, cfg).map(p => p.url),
      ['http://127.0.0.1:4749/escena.html?fan=1', 'http://127.0.0.1:4749/escena.html?fan=2']);
  }
});

test('config.json del formato anterior (mode + ids) sigue valiendo como escena', () => {
  assert.deepEqual(escenaDeConfig(mergeConfig({ mode: 'independiente', ids: { 1: 'x' } })), { modo: 'independiente', ids: { 1: ['x'] } });
  assert.deepEqual(escenaDeConfig(mergeConfig({ ids: { espejo: 'y' } })), { modo: 'repetir', piezas: ['y'] });
  assert.deepEqual(escenaDeConfig(mergeConfig({ escena: { modo: 'sincro' } })), { modo: 'sincro' });
});

test('cada player puede fijar sus piezas del Stock con ?ids= (mismo filtro que el canal)', () => {
  const cfg = mergeConfig({ ids: { espejo: ['1793045953771-x9tbz7', 'auto-8985fa5f5f9ec8776256'] } });
  const u = new URL(canalUrl(cfg, 'supercomputer-ventiladores', cfg.ids.espejo));
  assert.equal(u.searchParams.get('ids'), '1793045953771-x9tbz7,auto-8985fa5f5f9ec8776256');
  assert.equal(new URL(canalUrl(cfg, 'x')).searchParams.has('ids'), false, 'sin ids, la playlist del canal');
  assert.throws(() => mergeConfig({ ids: { 1: '../x' } }));
  assert.equal(mergeConfig({ ids: { 1: Array.from({ length: 20 }, (_, i) => 'p' + i) } }).ids['1'].length, 12);
});

test('la URL del canal usa el contrato público del player (sin tocar canal.html)', () => {
  const u = new URL(canalUrl(mergeConfig(), 'supercomputer-ventiladores'));
  assert.equal(u.origin + u.pathname, 'https://www.admira.tv/canal.html');
  for (const [k, v] of Object.entries({ embed: 'mupi', clean: '1', fit: 'screen', screen: 'supercomputer-ventiladores', circuit: 'supercomputer', machine: 'METAHUMAN', muted: '1' })) {
    assert.equal(u.searchParams.get(k), v, k);
  }
  for (const k of ['tag', 'mode', 'sincro', 'modeLock']) assert.equal(u.searchParams.has(k), false, `${k} bloquearía el gobierno remoto`);
});

test('la configuración rechaza modos e IDs inválidos y acota fps', () => {
  assert.throws(() => mergeConfig({ mode: 'mosaico' }));
  assert.throws(() => mergeConfig({ screen: 'con espacio' }));
  assert.equal(mergeConfig({ fps: 120 }).fps, 30);
});

test('solo se emiten JPEG completos', () => {
  assert.equal(isJpeg(Buffer.from([0xff, 0xd8, 1, 2, 0xff, 0xd9])), true);
  assert.equal(isJpeg(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0])), false);
});

test('audio: solo suena el ventilador elegido, con muted=0 en el canal o audio=1 en la escena', () => {
  const cfg = mergeConfig({ machine: 'PC-COCINA' }), fans = [{ n: 1 }, { n: 2 }, { n: 3 }];
  const ind = planEscena(normalizarEscena({ modo: 'independiente', audio: { ventilador: 2, volumen: 0.5 } }, 3), fans, cfg);
  assert.deepEqual(ind.map(p => p.audio), [false, true, false]);
  assert.deepEqual(ind.map(p => new URL(p.url).searchParams.get('muted')), ['1', '0', '1']);
  assert.equal(new URL(ind[1].url).searchParams.get('volume'), '0.5');
  const sec = planEscena(normalizarEscena({ modo: 'secuencia', pieza: 'abc', audio: { ventilador: 1, salida: 'Altavoces (Realtek(R) Audio)' } }, 3), fans, cfg);
  assert.deepEqual(sec.map(p => new URL(p.url).searchParams.get('audio')), ['1', null, null]);
  assert.equal(sec[0].salida, 'Altavoces (Realtek(R) Audio)');
  const rep = planEscena(normalizarEscena({ modo: 'repetir', pieza: 'abc', audio: { ventilador: 3 } }, 3), fans, cfg);
  assert.equal(rep.length, 1); assert.equal(rep[0].audio, true, 'en repetir un solo canal: con sonido');
  const mudo = planEscena(normalizarEscena({ modo: 'independiente' }, 3), fans, cfg);
  assert.ok(mudo.every(p => !p.audio && new URL(p.url).searchParams.get('muted') === '1'), 'sin audio, todo callado como antes');
});

test('numeración: el puerto 2 de PC-COCINA sube desde el suelo (5 junto al 4, 7 arriba)', () => {
  const fans = [[0, 0], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]].map(([port, index], i) => ({ port, index, n: i + 1 }));
  const r = renumerar(fans, { '2:0': 7, '2:2': 5 });
  assert.equal(r.aplicada, true);
  assert.deepEqual(r.fans.map(f => `${f.n}=${f.port}:${f.index}`), ['1=0:0', '2=1:0', '3=1:1', '4=1:2', '5=2:2', '6=2:1', '7=2:0']);
  assert.equal(renumerar(fans, null).aplicada, false, 'sin numeración, la de la cadena');
  const mala = renumerar(fans, { '2:0': 6 });
  assert.equal(mala.aplicada, false, 'dos ventiladores con el 6: se ignora');
  assert.deepEqual(mala.fans.map(f => f.n), [1, 2, 3, 4, 5, 6, 7]);
});

test('la pantalla no se queda sin señal: reenvío del último fotograma cada mantenerMs (250 por defecto, 100–2000)', () => {
  assert.equal(mergeConfig().mantenerMs, 250);
  assert.equal(mergeConfig({ mantenerMs: 10 }).mantenerMs, 100);
  assert.equal(mergeConfig({ mantenerMs: 99999 }).mantenerMs, 2000);
});
