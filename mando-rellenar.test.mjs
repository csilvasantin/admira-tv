import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const mando = await readFile(new URL('./mando.html', import.meta.url), 'utf8');
const canal = await readFile(new URL('./canal.html', import.meta.url), 'utf8');

test('el selector tiene «Rellenar» a la derecha de 270° y ocupa cinco columnas', () => {
  const i270 = mando.indexOf('data-rotation="270"'), iFit = mando.indexOf('id="fitOption"');
  assert.ok(i270 > 0 && iFit > i270, 'Rellenar va después de 270°');
  assert.match(mando, /id="fitOption" data-fit="fill" aria-label="Rellenar la pantalla[^"]*" aria-pressed="false"/);
  assert.match(mando, /\.rotation-picker\{display:grid;grid-template-columns:repeat\(5,minmax\(0,1fr\)\);/);
});

test('Rellenar envía fit-fill / fit-editorial y solo se ilumina confirmado o reportado', () => {
  assert.match(mando, /fitByScreen=new Map\(\)/);
  assert.match(mando, /sendRemote\('fit-'\+next,fitOption\)/);
  assert.match(mando, /if\(ok&&T\.screen===targetScreen\)\{ fitByScreen\.set\(targetScreen,next\); paintFitOption\(\); \}/);
  assert.match(mando, /reportedFit=d&&d\.device&&d\.device\.display&&d\.device\.display\.fit/);
  assert.match(mando, /fitOption\.setAttribute\('aria-pressed',on\?'true':'false'\)/);
});

test('con Rellenar y pieza horizontal el previo se pone apaisado ENCIMA del bloque de control', () => {
  assert.match(mando, /landscape=currentFit\(\)==='fill'&&Number\.isFinite\(ar\)&&ar>1/);
  assert.match(mando, /previewStage\.classList\.toggle\('landscape',!!landscape\)/);
  assert.match(mando, /\.stage\.landscape\{flex-direction:column\}/);
  assert.match(mando, /\.stage\.landscape \.frame\{width:100%;flex:0 0 auto;aspect-ratio:16\/9\}/);
  // El marco va antes que el bloque de control en el DOM: en columna queda encima.
  const stage = mando.slice(mando.indexOf('<div class="stage" data-mando-pane="remote">'));
  assert.ok(stage.indexOf('id="previewFrame"') < stage.indexOf('class="nowbox"'));
});

test('el player persiste el ajuste por pantalla, lo reporta y lo ejecuta por la cola confirmada', () => {
  assert.match(canal, /const DISPLAY_FIT_KEY='adtv_display_fit:'/);
  assert.match(canal, /function setDisplayFit\(mode\)/);
  assert.match(canal, /document\.documentElement\.classList\.toggle\('screen-fit',displayFit==='fill'\)/);
  assert.match(canal, /rotation:displayRotation, fit:\(typeof displayFit==='string'\?displayFit:'editorial'\)/);
  assert.match(canal, /if\(\/\^fit-\(fill\|editorial\)\$\/\.test\(cmd\)\) return applyCtrlCmd\(cmd\);/);
  assert.match(canal, /if\(fit\)\{ setDisplayFit\(fit\[1\]\);[^\n]*return 'executed'; \}/);
});

test('en «fill» el marco mide el viewport girado y la media no se recorta ni se deforma', () => {
  assert.match(canal, /if\(document\.documentElement\.classList\.contains\('screen-fit'\)\)\{\n\s*mupi\.style\.height=Math\.round\(quarterTurn\?aW:aH\)\+'px'; mupi\.style\.width=Math\.round\(quarterTurn\?aH:aW\)\+'px';/);
  assert.match(canal, /#stage video, #stage img\{ width:100%; height:100%; object-fit:contain;/);
});
