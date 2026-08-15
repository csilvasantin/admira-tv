import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const mando = await readFile(new URL('./mando.html', import.meta.url), 'utf8');
const canal = await readFile(new URL('./canal.html', import.meta.url), 'utf8');

test('el selector comparte una fila compacta con cuatro giros absolutos', () => {
  assert.match(mando, /class="target-row"/);
  assert.match(mando, /class="rotation-picker"[^>]*role="group"[^>]*aria-label="Orientación de la pantalla"/);
  for (const degrees of [0, 90, 180, 270]) {
    assert.match(mando, new RegExp(`data-rotation="${degrees}"[^>]*aria-label="Girar pantalla a ${degrees} grados"`));
  }
});

test('cada sección envía el ángulo elegido y solo se activa tras confirmación', () => {
  assert.match(mando, /rotationByScreen=new Map\(\)/);
  assert.match(mando, /sendRemote\('rotation-'\+degrees,button\)/);
  assert.match(mando, /if\(ok&&T\.screen===targetScreen\)\{ rotationByScreen\.set\(targetScreen,degrees\); paintRotationPicker\(\); \}/);
  assert.match(mando, /button\.setAttribute\('aria-pressed',selected\?'true':'false'\)/);
  assert.match(mando, /reportedRotation=Number\(d&&d\.device&&d\.device\.display&&d\.device\.display\.rotation\)/);
});

test('un solo ángulo puede conservar el estado verde y no se solapan órdenes', () => {
  assert.match(mando, /if\(!selected\) button\.classList\.remove\('remote-applied'\)/);
  assert.match(mando, /clearRotationFeedback\(button\); setRotationBusy\(true\)/);
  assert.match(mando, /rotationOptions\.some\(function\(candidate\)\{ return BUTTON_ACTIONS\.has\(candidate\); \}\)/);
  assert.match(mando, /finally\{ setRotationBusy\(false\); \}/);
});

test('el mando no repite una cabecera redundante bajo la navegación', () => {
  const body = mando.slice(mando.indexOf('<body>'));
  assert.doesNotMatch(body, /Emitir · Mando a distancia/);
  assert.doesNotMatch(body, /<h1>Mando · Admira\.tv<\/h1>/);
});

test('el player aplica grados absolutos y conserva el giro incremental anterior', () => {
  assert.match(canal, /DISPLAY_ROTATION_KEY='adtv_display_rotation:'/);
  assert.match(canal, /function setDisplayRotation\(degrees\)/);
  assert.match(canal, /displayRotation=\(\(Math\.round\(n\/90\)\*90\)%360\+360\)%360/);
  assert.match(canal, /mupi\.style\.transform=displayRotation\?'rotate\('\+displayRotation\+'deg\)'/);
  assert.match(canal, /quarterTurn\?aW:aH/);
  assert.match(canal, /\^rotation-\(0\|90\|180\|270\)\$/);
  assert.match(canal, /setDisplayRotation\(Number\(rotation\[1\]\)\)/);
  assert.match(canal, /case 'rotate-90': applyDisplayRotation\(90\)/);
  assert.match(canal, /cmd==='rotate-90'\|\|cmd==='rotate90'/);
  assert.match(canal, /orientation:\(screen\.orientation&&screen\.orientation\.type\)\|\|'', rotation:displayRotation/);
  assert.match(canal, /DEVICE_TELEMETRY\.display\.rotation=displayRotation/);
});
