import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const mando = await readFile(new URL('./mando.html', import.meta.url), 'utf8');
const canal = await readFile(new URL('./canal.html', import.meta.url), 'utf8');

test('el selector comparte una fila compacta con el giro remoto de 90 grados', () => {
  assert.match(mando, /class="target-row"/);
  assert.match(mando, /grid-template-columns:minmax\(0,1fr\) 88px/);
  assert.match(mando, /id="rotateScreen"[^>]*data-cmd="rotate-90"/);
  assert.match(mando, /aria-label="Girar 90 grados la pantalla seleccionada"/);
});

test('el player aplica, persiste y confirma giros acumulativos de 90 grados', () => {
  assert.match(canal, /DISPLAY_ROTATION_KEY='adtv_display_rotation:'/);
  assert.match(canal, /displayRotation=\(displayRotation\+delta\+360\)%360/);
  assert.match(canal, /mupi\.style\.transform=displayRotation\?'rotate\('\+displayRotation\+'deg\)'/);
  assert.match(canal, /quarterTurn\?aW:aH/);
  assert.match(canal, /case 'rotate-90': applyDisplayRotation\(90\)/);
  assert.match(canal, /cmd==='rotate-90'\|\|cmd==='rotate90'/);
});
