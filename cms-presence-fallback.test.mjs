import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const cms = await readFile(new URL('./cms.html', import.meta.url), 'utf8');

test('la ficha usa presencia viva cuando falta el puntero de contenido', () => {
  assert.match(cms, /const SIGNAGE_SCREENS = 'https:\/\/api\.admira\.store\/signage\/screens'/);
  assert.match(cms, /const liveScreens=new Set\(/);
  assert.match(cms, /liveScreens\.has\(devs\[i\]\.screen\)/);
  assert.match(cms, /const isOn = !!onOf\(i\)/);
});

test('la presencia sin item tiene un rótulo honesto y no rompe la ficha', () => {
  assert.match(cms, /'player conectado'/);
  assert.match(cms, /'presencia confirmada'/);
  assert.doesNotMatch(cms, /isOn\?esc\(it\.title\|\|it\.id\|\|'emitiendo'\)/);
});

test('CSV y avisos comparten la misma decisión de estado', () => {
  assert.match(cms, /LAST_FLEET = devs\.map\(\(d,i\)=>\{ const it=nows\[i\]; const isOn=!!onOf\(i\)/);
  assert.match(cms, /devs\.forEach\(\(d,i\)=>\{ const isOn=!!onOf\(i\)/);
});
