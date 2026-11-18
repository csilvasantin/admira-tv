import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';

// Puente Web Bluetooth de la SY11-ab (/eink/puente/, 18-nov-2026): el Fold sustituye al Mac Studio como puente.
// assets/eink-sy11.js reproduce byte a byte el codificador del Mac (~/.admira-eink/eink_encode.py + pack12k):
// se comprobó con una imagen de colores puros de la paleta, 540 paquetes y 0 bytes distintos.
const require = createRequire(import.meta.url);
const E = require('./assets/eink-sy11.js');
const puente = fs.readFileSync(new URL('./eink/puente/index.html', import.meta.url), 'utf8');

function lienzo(color) {
  const rgba = new Uint8Array(480 * 800 * 4);
  for (let i = 0; i < 480 * 800; i++) rgba.set([...color, 255], i * 4);
  return rgba;
}

test('el saludo 0x81 de la SY11-ab sale de su MAC igual que en el Mac Studio', async () => {
  assert.equal(E.hex(await E.saludo('FF:FF:FF:10:B4:B6', webcrypto.subtle)), '8100040101010171b11e680000');
});

test('colores puros: negro 00, blanco 01, rojo 11 y amarillo 10, 4 píxeles por byte', () => {
  for (const [color, byte] of [[[0, 0, 0], 0x00], [[255, 255, 255], 0x55], [[255, 0, 0], 0xff], [[255, 255, 0], 0xaa]]) {
    const datos = E.empaqueta(E.trama(lienzo(color)));
    assert.equal(datos.length, 96000);
    assert.ok(datos.every(b => b === byte), color.join(','));
  }
});

test('la imagen va girada 180° y por columnas', () => {
  const rgba = lienzo([255, 255, 255]);
  rgba.set([0, 0, 0, 255], 0);                    // píxel negro arriba a la izquierda
  const datos = E.empaqueta(E.trama(rgba));
  // girado 180°: acaba en la última columna, último píxel (bits bajos del último byte)
  assert.equal(datos[95999] & 0b11, 0b00);
  assert.equal(datos[0], 0x55);
});

test('formato «ratio 01»: 540 paquetes 86 00 <índice> + 200 bytes + suma, con la franja central duplicada', () => {
  const datos = new Uint8Array(96000).map((_, i) => i % 251);
  const lista = E.paquetes(datos);
  assert.equal(lista.length, 540);
  assert.deepEqual([...lista[0].slice(0, 4)], [0x86, 0x00, 0x00, 0x01]);
  assert.deepEqual([...lista[539].slice(0, 4)], [0x86, 0x00, 0x02, 0x1c]);
  const cuerpo = Uint8Array.from(lista.flatMap(p => [...p.slice(4, 204)]));
  assert.deepEqual([...cuerpo.slice(48000, 60000)], [...datos.slice(42000, 54000)]);
  assert.deepEqual([...cuerpo.slice(60000)], [...datos.slice(48000)]);
  for (const p of lista) assert.equal(p[204], p.slice(4, 204).reduce((a, b) => a + b, 0) & 255);
});

test('la respuesta al saludo da firmware y tamaño', () => {
  assert.deepEqual(E.leeInfo(Buffer.from('11001100535931312d30313401e00320040000c8', 'hex')), { firmware: 'SY11-014', width: 480, height: 800, colorModel: 4 });
});

test('el puente usa el contrato de la flota y se identifica para que el Mac se aparte', () => {
  assert.match(puente, /namePrefix: "SY11"/);
  assert.match(puente, /optionalServices: \[E\.SERVICIO\]/);
  assert.match(puente, /writeValueWithoutResponse/);
  assert.match(puente, /RITMO_MS = 90/, 'el mismo ritmo que el Mac: ~90 ms entre paquetes');
  for (const url of ['https://api.admira.store/locations/cmd', 'https://api.admira.store/signage/now', 'https://stock.admira.store/stock/index.json']) assert.ok(puente.includes(url), url);
  assert.match(puente, /machine: MAQUINA/, 'late con su máquina: el Mac se aparta mientras ve a otro puente');
  assert.match(puente, /player: "Admira e-ink bridge"/, 'el panel le ofrece «Seguir novedades»');
  assert.match(puente, /navigator\.wakeLock\.request\("screen"\)/, 'mantiene la pantalla del móvil encendida');
  assert.ok(!/auth-gate/.test(puente), 'un puente es un player: sin verja');
});

test('relevo: al conectar pide al Mac que se aparte y no ejecuta su propia orden de relevo', () => {
  assert.match(puente, /cmd: "puente-" \+ MAQUINA\.toLowerCase\(\)/);
  assert.match(puente, /despierto\(\); releva\(\); beat\(\);/);
  assert.match(puente, /if \(\/\^\\\/\?puente-\/i\.test\(String\(c\.cmd \|\| ""\)\)\) continue;/);
});
