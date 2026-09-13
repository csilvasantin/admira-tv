// FLT-100394 (Carlos, 13-sep-2026): «se ponen popups por encima y eso no puede ser en un player de
// Digital Signage» y «el iPad no ocupa toda la pantalla». Contrato: en modo limpio no se pinta nada
// encima de la emisión salvo que se pida con ?overlays=1; la ficha solo la abre el mando y se cierra
// sola; y existe «cubrir» (fit-cover) para llenar pantallas de otra proporción.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const canal = readFileSync(new URL('./canal.html', import.meta.url), 'utf8');

test('modo limpio oculta HUD de pruebas, «recién creado» y distintivo de parrilla (salvo ?overlays=1)', () => {
  assert.match(canal, /html\.clean:not\(\.overlays\) #testHud,\s*html\.clean:not\(\.overlays\) #freshBadge,\s*html\.clean:not\(\.overlays\) #gridBadge\{ display:none!important; \}/);
  assert.match(canal, /if \(__adtvParams\.get\('overlays'\) === '1'\) document\.documentElement\.classList\.add\('overlays'\);/);
  assert.match(canal, /\.clean #tap,/, 'el aviso «toca para arrancar» sigue oculto en limpio');
});

test('la ficha no se abre con el dedo en limpio y, abierta por el mando, se cierra sola a los 12 s', () => {
  assert.match(canal, /const LOCAL_INFO_TOUCH=!LOCAL_INFO_CLEAN\|\|qs\.get\('touchinfo'\)==='1';/);
  assert.match(canal, /function localInfoPointerUp\(e\)\{\n  if\(!LOCAL_INFO_TOUCH\) return;/);
  assert.match(canal, /function localInfoDoubleClick\(e\)\{\n  if\(!LOCAL_INFO_TOUCH\) return;/);
  assert.match(canal, /if\(opening&&LOCAL_INFO_CLEAN\) _localInfoAutoClose=setTimeout\(\(\)=>localInfoVisible\(false\),12000\);/);
});

test('fit-cover llena la pantalla recortando y se gobierna desde las dos colas del mando', () => {
  assert.match(canal, /\.screen-cover #stage video, \.screen-cover #stage img\{ object-fit:cover!important; \}/);
  assert.match(canal, /displayFit=\(m==='cover'\|\|m==='cubrir'\|\|m==='full'\)\?'cover':/);
  assert.match(canal, /if\(v==='fill'\|\|v==='editorial'\|\|v==='cover'\) return v;/, 'cubrir persiste tras recargar');
  assert.match(canal, /const fit=\/\^fit-\(fill\|editorial\|cover\)\$\/\.exec\(cmd\);/);
});
