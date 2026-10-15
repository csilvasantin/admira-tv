// Portada con marca blanca (Carlos, 15-oct-2026): «Todas» no se leía con Lumbre y lo mismo pasaba con
// Starbucks y Altadis: la hoja puente daba a tarjetas y filtro las superficies claras de la marca con el
// texto claro de la portada encima. La portada sigue oscura con marca; el color de la marca entra
// aclarado lo justo para leerse (assets/portada-marca.js). Sin marca (Admira) no cambia nada.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const leer = p => readFileSync(new URL('./' + p, import.meta.url), 'utf8');
const portada = leer('index.html'), codigo = leer('assets/portada-marca.js');

// Lo que pone el catálogo de admiranext.com/marcablanca en modo claro (primario, texto del primario).
const MARCAS = {starbucks: ['#00704A', '#FFFFFF'], altadis: ['#D76A1C', '#361B07'], lumbre: ['#3B2318', '#FFF7EC']};
const FONDOS = ['#070a10', '#0c121c', '#101927', '#16202f'];

function montar(marca) {
  const props = {}, oyentes = {};
  const root = {
    hasAttribute: n => n === 'data-mb-marca' && !!marca,
    style: {setProperty: (k, v) => { props[k] = v; }, removeProperty: k => { delete props[k]; }},
  };
  const G = {
    document: {documentElement: root, addEventListener: (t, fn) => { oyentes[t] = fn; }},
    getComputedStyle: () => ({getPropertyValue: k => (marca ? {'--mb-primario': MARCAS[marca][0], '--mb-primario-texto': MARCAS[marca][1]}[k] || '' : '')}),
  };
  vm.runInNewContext(codigo, {window: G});
  return {G, props, oyentes, cambiar(m) { marca = m; oyentes['admira:marca'](); }};
}

test('sin marca (Admira) no pone nada', () => {
  const {props} = montar(null);
  assert.deepEqual(props, {});
});

test('el acento de cada marca se lee (4,5:1) sobre todos los fondos oscuros de la portada', () => {
  for (const m of Object.keys(MARCAS)) {
    const {G, props} = montar(m);
    const c = G.AdmiraPortadaMarca.contraste;
    for (const f of FONDOS) assert.ok(c(props['--mbh-acento'], f) >= 4.5, `${m}: ${props['--mbh-acento']} sobre ${f}`);
    assert.ok(c(props['--mbh-boton'], props['--mbh-boton-texto']) >= 4.5, `${m}: texto del botón`);
  }
});

test('Starbucks y Altadis conservan su botón (su primario y su texto); Lumbre, que no se ve sobre lo oscuro, no', () => {
  assert.equal(montar('starbucks').props['--mbh-boton'], '#00704a');
  assert.equal(montar('starbucks').props['--mbh-boton-texto'], '#ffffff');
  assert.equal(montar('altadis').props['--mbh-acento'], '#d76a1c', 'Altadis ya se lee: no se aclara');
  assert.equal(montar('altadis').props['--mbh-boton-texto'], '#361b07');
  assert.notEqual(montar('lumbre').props['--mbh-boton'], '#3b2318');
});

test('al quitar la marca (/marca off) se quitan los colores', () => {
  const p = montar('starbucks');
  assert.ok(p.props['--mbh-acento']);
  p.cambiar(null);
  assert.deepEqual(p.props, {});
});

test('la portada carga el script y, sólo con marca, conserva sus superficies oscuras', () => {
  assert.match(portada, /<script defer src="\/assets\/portada-marca\.js\?v=[^"]+"><\/script>/);
  assert.match(portada, /:root\[data-mb-marca\] main,:root\[data-mb-marca\] footer,:root\[data-mb-marca\] \.video-dialog\{--panel:#0c121c;--panel2:#101927;--line:#223047;--text:#e8eef6;--dim:#9eacc0;--green:var\(--mbh-acento,#3df08a\)\}/);
  assert.match(portada, /:root\[data-mb-marca\]\[data-mb-web="tv"\] main \.eyebrow\{color:var\(--mbh-acento,#3df08a\)!important\}/, 'gana a la hoja puente (más específica)');
  assert.match(portada, /:root\[data-mb-marca\] main \.button\.primary\{background:var\(--mbh-boton/);
  // «Todas» pulsado pinta sobre var(--panel): con marca, el de la portada.
  assert.match(portada, /\.pilares\.pilares-listo \.pilar-btn-todas\[aria-pressed="true"\]\{background:[^}]*var\(--panel\)\}/);
});
