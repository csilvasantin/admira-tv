// Los cinco pilares de digitalsignage.ai en la home de admira.tv (3-oct-2026).
//
// Carlos: «el ecosistema de Admira.tv son todas las soluciones de los cinco
// pilares de digitalsignage.ai; me gustaría que también estuvieran representados
// por los colores del logo de AdmiraNeXT». Colores y reparto los decidió él: este
// test los fija para que nadie los cambie de pasada, comprueba que la home
// generada lleva la etiqueta del pilar en cada tarjeta y que el filtro funciona.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const catalog = JSON.parse(await read('./apps/public-catalog.json'));
const datos = JSON.parse(await read('./apps/pilares.json'));
const home = await read('./index.html');
const client = await read('./public-apps.js');
const pilares = datos.pilares;
const porId = Object.fromEntries(pilares.map((p) => [p.id, p]));

const COLORES = {
  studio: ['01', 'Studio', 'Crear', 'admira.studio', '#FF3366'],
  tv: ['02', 'TV', 'Distribuir', 'admira.tv', '#FFCC00'],
  store: ['03', 'Store', 'Controlar', 'admira.store', '#33FF99'],
  app: ['04', 'App', 'Coordinar', 'admira.app', '#FF33CC'],
  biz: ['05', 'Biz', 'Monetizar', 'admira.biz', '#26DEEC'],
};

const REPARTO = {
  studio: ['contentcatalogue', 'virtualreality', 'augmentedreality', 'gamification'],
  tv: ['digitalsignage', 'pushnotifications', 'audiobranding', 'olfactorymarketing'],
  store: ['iotmanager', 'xpaceos', 'socialwifi', 'queuemanager', 'roombooking'],
  app: ['dashboard', 'support', 'virtualassistant', 'yarig'],
  biz: ['adcelerate', 'videoanalytics', 'radioanalytics'],
};

test('los cinco pilares tienen exactamente los colores del logo de ADmiraNeXT', () => {
  assert.equal(pilares.length, 5);
  assert.deepEqual(pilares.map((p) => p.id), Object.keys(COLORES), 'orden 01→05');
  for (const p of pilares) {
    const [n, nombre, verbo, dominio, color] = COLORES[p.id];
    assert.deepEqual([p.n, p.nombre, p.verbo_es, p.dominio, p.color.toUpperCase()], [n, nombre, verbo, dominio, color], p.id);
    assert.ok(p.verbo_en, `${p.id}: verbo en inglés`);
  }
  assert.equal(datos.fuente, 'https://www.digitalsignage.ai/');
});

test('cada una de las 20 soluciones tiene un pilar válido, con el reparto aprobado', () => {
  assert.equal(catalog.length, 20);
  for (const app of catalog) assert.ok(porId[app.pilar], `${app.slug}: pilar «${app.pilar}» no existe`);
  for (const [pilar, slugs] of Object.entries(REPARTO)) {
    assert.deepEqual(catalog.filter((a) => a.pilar === pilar).map((a) => a.slug).sort(), [...slugs].sort(), pilar);
  }
});

test('el HTML generado lleva la etiqueta del pilar en cada tarjeta y en orden de pilar', () => {
  const cards = [...home.matchAll(/<article class="app-card[^"]*" data-public-app-card="([a-z]+)" data-pilar="([a-z]+)"[^>]*>([\s\S]*?)<\/article>/g)];
  assert.equal(cards.length, 20);
  const ordenPilar = pilares.map((p) => p.id);
  let previo = 0;
  for (const [, slug, pilar, cuerpo] of cards) {
    const app = catalog.find((a) => a.slug === slug);
    assert.equal(pilar, app.pilar, `${slug}: data-pilar no cuadra con el catálogo`);
    const p = porId[pilar];
    const texto = cuerpo.replace(/<[^>]+>/g, '');
    assert.ok(texto.includes(`${p.n} · ${p.nombre} · ${p.verbo_es}`), `${slug}: falta la etiqueta «${p.n} · ${p.nombre} · ${p.verbo_es}»`);
    const i = ordenPilar.indexOf(pilar);
    assert.ok(i >= previo, `${slug}: la rejilla no va en orden de pilar`);
    previo = i;
  }
  // Ningún color de pilar se escribe a mano: sólo en el bloque generado.
  const sinGenerado = home.replace(/<style id="pilaresCss">[\s\S]*?<\/style>/, '');
  for (const p of pilares) assert.ok(!sinGenerado.toUpperCase().includes(p.color.toUpperCase()), `${p.color} escrito a mano en index.html`);
  for (const p of pilares) assert.match(home, new RegExp(`\\[data-pilar="${p.id}"\\]\\{--pc:${p.color}`));
});

test('la leyenda enlaza digitalsignage.ai y sus botones son accesibles sin JS y con JS', () => {
  assert.match(home, /Los cinco pilares · <a href="https:\/\/www\.digitalsignage\.ai\/" target="_blank" rel="noopener">digitalsignage\.ai/);
  const botones = [...home.matchAll(/<button type="button" class="pilar-btn[^"]*"[^>]*>/g)].map((m) => m[0]);
  assert.equal(botones.length, 6, 'Todas + 5 pilares');
  for (const b of botones) {
    assert.match(b, /aria-pressed="(true|false)"/);
    assert.match(b, / disabled>$/, 'sin JS es una leyenda: no se puede pulsar algo que no hace nada');
  }
  assert.match(botones[0], /data-pilar-filtro="todas" aria-pressed="true"/);
  assert.match(home, /\.pilar-btn:focus-visible\{outline:3px solid var\(--pc\)/);
  assert.match(home, /\.app-card\[hidden\]\{display:none\}/);
});

test('el texto del pilar cumple AA (4,5:1) sobre la tarjeta y sobre su chip', () => {
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const lum = (c) => {
    const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const tinte = Number(home.match(/\[data-pilar\]\{--pc-tinte:([0-9.]+)\}/)[1]);
  const panel2 = rgb('#101927');
  for (const p of pilares) {
    const vars = home.match(new RegExp(`\\[data-pilar="${p.id}"\\]\\{--pc:(#[0-9A-Fa-f]{6});--pc-rgb:[0-9,]+;--pc-ink:(#[0-9A-Fa-f]{6});--pc-chip-ink:(#[0-9A-Fa-f]{6})\\}`));
    assert.ok(vars, `${p.id}: variables de color generadas`);
    const color = rgb(vars[1]);
    const fondo = color.map((c, i) => Math.round(tinte * c + (1 - tinte) * panel2[i]));
    assert.ok(ratio(rgb(vars[2]), fondo) >= 4.5, `${p.id}: texto sobre la tarjeta < 4,5:1`);
    assert.ok(ratio(rgb(vars[3]), color) >= 4.5, `${p.id}: texto sobre el chip < 4,5:1`);
  }
});

test('el generador está sincronizado (lo que comprueba deploy.sh)', () => {
  const out = execFileSync('python3', [fileURLToPath(new URL('./tools/gen-apps-grid.py', import.meta.url)), '--check'], {encoding: 'utf8'});
  assert.match(out, /20 soluciones y sus 5 pilares/);
});

test('el filtro muestra sólo el pilar pulsado, «Todas» devuelve las 20 y anuncia el recuento', () => {
  const filtro = client.match(/\/\* Filtro de los cinco pilares[\s\S]*$/)?.[0];
  assert.ok(filtro, 'bloque del filtro en public-apps.js');
  const nodo = (attrs = {}) => ({
    attrs: {...attrs}, hidden: false, disabled: true, listeners: {}, textContent: '', classList: {set: new Set(), add(c) { this.set.add(c); }},
    getAttribute(k) { return this.attrs[k] ?? null; }, setAttribute(k, v) { this.attrs[k] = String(v); },
    addEventListener(t, fn) { this.listeners[t] = fn; }, click() { this.listeners.click(); },
  });
  const botones = ['todas', ...pilares.map((p) => p.id)].map((id) => {
    const b = nodo({'data-pilar-filtro': id, 'aria-pressed': id === 'todas' ? 'true' : 'false'});
    const nombre = id === 'todas' ? 'Todas' : porId[id].nombre;
    b.querySelector = () => ({textContent: nombre});
    return b;
  });
  const tarjetas = catalog.map((a) => nodo({'data-pilar': a.pilar}));
  const grupo = nodo(); grupo.querySelectorAll = () => botones;
  const rejilla = nodo(); rejilla.querySelectorAll = () => tarjetas;
  const estado = nodo();
  const document = {getElementById: (id) => ({pilares: grupo, publicApps: rejilla, appsStatus: estado})[id] || null};
  vm.runInNewContext(filtro, {document});

  assert.ok(botones.every((b) => b.disabled === false), 'con JS los botones se habilitan');
  assert.ok(grupo.classList.set.has('pilares-listo'));
  const visibles = () => tarjetas.filter((t) => !t.hidden).length;
  const pulsado = () => botones.filter((b) => b.attrs['aria-pressed'] === 'true').map((b) => b.attrs['data-pilar-filtro']);

  for (const [i, p] of pilares.entries()) {
    botones[i + 1].click();
    assert.equal(visibles(), REPARTO[p.id].length, p.id);
    assert.ok(tarjetas.every((t) => t.hidden === (t.attrs['data-pilar'] !== p.id)));
    assert.deepEqual(pulsado(), [p.id]);
    assert.match(estado.textContent, new RegExp(`^${p.nombre} · ${REPARTO[p.id].length} de 20 soluciones`));
  }
  botones[0].click();
  assert.equal(visibles(), 20);
  assert.deepEqual(pulsado(), ['todas']);
  assert.equal(estado.textContent, '20 soluciones · 20 solutions');
  // Volver a pulsar el pilar activo lo suelta.
  botones[3].click(); botones[3].click();
  assert.equal(visibles(), 20);
  assert.deepEqual(pulsado(), ['todas']);
});
