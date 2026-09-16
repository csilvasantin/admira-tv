// El instalador de un clic de Windows (player/reuniones2.ps1).
//
// Traía la URL del .exe escrita a mano, así que el 16-09-2026 seguía instalando el
// binario del 27 de junio aunque el CI publicara uno nuevo cada día. Ahora lee el
// manifiesto que publica el flujo y comprueba la huella antes de ejecutar nada.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ps1 = readFileSync(new URL('./player/reuniones2.ps1', import.meta.url), 'utf8');

test('la versión sale del manifiesto, no de una URL escrita a mano', () => {
  assert.match(ps1, /\$manifiesto\s*=\s*'https:\/\/player\.admira\.store\/windows-release\.json'/);
  assert.match(ps1, /Invoke-RestMethod -Uri "\$manifiesto/);
  assert.match(ps1, /\$exe\.url/, 'la URL del .exe la da el manifiesto');
  assert.doesNotMatch(ps1, /v\.26\.06\.27\.r1\.exe/, 'el binario de junio ya no se instala');
});

test('si el manifiesto no responde, hay una última versión conocida y se avisa', () => {
  assert.match(ps1, /\$fallback\s*=\s*'https:\/\/player\.admira\.store\/AdmiraSignagePlayer-win-x64-v\.[0-9.r]+\.exe'/);
  assert.match(ps1, /no he podido leer el manifiesto/);
});

test('se comprueba la huella ANTES de ejecutar, y un fallo aborta de verdad', () => {
  const orden = (t) => ps1.indexOf(t);
  assert.ok(orden('Get-FileHash') > -1);
  assert.ok(orden('Get-FileHash') < orden('Start-Process -FilePath $dst'), 'primero verificar, luego ejecutar');
  assert.match(ps1, /Remove-Item \$dst -Force/, 'un instalador que no cuadra no se queda en el disco');
  assert.match(ps1, /throw "La huella del instalador no coincide/);
});

test('no se vende la huella como si fuera una firma', () => {
  assert.match(ps1, /no que lo hayamos hecho nosotros/);
  assert.match(ps1, /sin firmar/, 'el aviso de SmartScreen sigue estando');
});

test('los campos que lee son los que el manifiesto publica de verdad', () => {
  // manifiesto-player.mjs escribe artifacts[] con nombre, url y sha256.
  for (const campo of ['nombre', 'url', 'sha256']) assert.match(ps1, new RegExp('\\$exe\\.' + campo + '|_\\.' + campo));
  assert.match(ps1, /\$m\.release/);
});
