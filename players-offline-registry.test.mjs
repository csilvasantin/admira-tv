import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const players = fs.readFileSync(new URL('./players.html', import.meta.url), 'utf8');

test('la composición consulta el censo registrado además de los players vivos', () => {
  assert.match(players, /const FLEET='https:\/\/omnipublicity-api\.csilvasantin\.workers\.dev\/locations\?selfreg=1'/);
  assert.match(players, /fetch\(FLEET,\{cache:'no-store'\}\)/);
});

test('un player registrado offline sigue siendo seleccionable para sincro y expansión', () => {
  assert.match(players, /byScreen\.set\(screen,\{screen,name:loc\.name\|\|screen,version:'',online:false,registered:true\}\)/);
  assert.match(players, /p\.online\?\(p\.version\|\|'online'\):'registrado · offline'/);
  assert.match(players, /state\.selected=\(state\.saved\.screens\|\|\[\]\)\.filter\(s=>state\.screens\.some\(p=>p\.screen===s\)\)/);
});
