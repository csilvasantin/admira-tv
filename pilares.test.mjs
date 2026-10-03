// Los cinco pilares de digitalsignage.ai en la home de admira.tv (3-oct-2026) y
// las cinco zonas de cuatro tarjetas (4-oct-2026).
//
// Carlos: «el ecosistema de Admira.tv son todas las soluciones de los cinco
// pilares de digitalsignage.ai; me gustaría que también estuvieran representados
// por los colores del logo de AdmiraNeXT». Al día siguiente dictó el reparto en
// zonas: cada zona es la tarjeta del propio pilar más tres soluciones, en el orden
// studio · store · tv · app · biz. Colores, verbos, orden y reparto los decidió él:
// este test los fija para que nadie los cambie de pasada, comprueba que la home
// generada pinta exactamente eso y que el filtro funciona.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const catalog = JSON.parse(await read('./apps/public-catalog.json'));
const homeCatalog = JSON.parse(await read('./apps/home-catalog.json'));
const datos = JSON.parse(await read('./apps/pilares.json'));
const home = await read('./index.html');
const client = await read('./public-apps.js');
const pilares = datos.pilares;
const porId = Object.fromEntries(pilares.map((p) => [p.id, p]));

const COLORES = {
  studio: ['01', 'Studio', 'Crear', 'Create', 'admira.studio', '#FF3366'],
  store: ['02', 'Store', 'Distribuir', 'Distribute', 'admira.store', '#33FF99'],
  tv: ['03', 'TV', 'Reproducir', 'Play', 'admira.tv', '#FFCC00'],
  app: ['04', 'App', 'Coordinar', 'Coordinate', 'admira.app', '#FF33CC'],
  biz: ['05', 'Biz', 'Monetizar', 'Monetise', 'admira.biz', '#26DEEC'],
};

// Orden exacto de la rejilla, zona a zona: [slug, nombre en español].
const ZONAS = {
  studio: [['admira-studio', 'Admira.studio'], ['locuciones-musica', 'Creador de Locuciones y Música'], ['imagenes-videos', 'Creador de Imágenes y Vídeos'], ['adaptador-formatos', 'Adaptador de Formatos']],
  store: [['admira-store', 'Admira.store'], ['circuitos', 'Gestión de Circuitos'], ['inventario-espacios', 'Gestión de Inventario'], ['xperiencias', 'Gestión de Xperiencias']],
  tv: [['admira-tv', 'Admira.tv'], ['digitalsignage', 'Cartelería Digital'], ['hilo-musical', 'Hilo Musical'], ['turnos', 'Gestión de Turnos']],
  app: [['admira-app', 'Admira.app'], ['direccion-proyecto', 'Dirección de Proyecto'], ['incidencias', 'Gestión de Incidencias'], ['inventario-equipos', 'Gestión del Inventario']],
  biz: [['admira-biz', 'Admira.biz'], ['dooh', 'DooH'], ['retail-media', 'Retail Media'], ['venta-asistida', 'Venta Asistida']],
};
const ORDEN = Object.values(ZONAS).flat().map(([slug]) => slug);
const REUTILIZADAS = ['digitalsignage'];

// Las 19 que salieron de la home el 4-oct-2026 (las 18 del encargo y Dashboard,
// que Carlos sacó en la corrección de app/biz). Siguen en public-catalog.json
// (lanzadera /apps/ y allowlist de medios) y sus páginas y medios siguen en su sitio.
const FUERA_DE_LA_HOME = ['dashboard', 'contentcatalogue', 'support', 'pushnotifications', 'virtualassistant', 'adcelerate',
  'gamification', 'iotmanager', 'videoanalytics', 'radioanalytics', 'socialwifi', 'queuemanager', 'roombooking',
  'audiobranding', 'olfactorymarketing', 'virtualreality', 'augmentedreality', 'xpaceos', 'yarig'];

const tarjetasHtml = [...home.matchAll(/<article class="(app-card[^"]*)" data-public-app-card="([a-z0-9-]+)" data-pilar="([a-z]+)"[^>]*>([\s\S]*?)<\/article>/g)]
  .map(([, clases, slug, pilar, cuerpo]) => ({clases: clases.split(' '), slug, pilar, cuerpo, texto: cuerpo.replace(/<[^>]+>/g, '')}));

test('los cinco pilares tienen exactamente los colores del logo y los verbos de Carlos, en orden studio·store·tv·app·biz', () => {
  assert.equal(pilares.length, 5);
  assert.deepEqual(pilares.map((p) => p.id), Object.keys(COLORES), 'orden 01→05');
  for (const p of pilares) {
    const [n, nombre, verbo, verb, dominio, color] = COLORES[p.id];
    assert.deepEqual([p.n, p.nombre, p.verbo_es, p.verbo_en, p.dominio, p.color.toUpperCase()], [n, nombre, verbo, verb, dominio, color], p.id);
  }
  assert.equal(datos.fuente, 'https://www.digitalsignage.ai/');
});

test('home-catalog: 5 zonas × 4 tarjetas, en el orden exacto y con el pilar abriendo cada zona', () => {
  assert.deepEqual(homeCatalog.zonas.map((z) => z.pilar), Object.keys(ZONAS));
  for (const z of homeCatalog.zonas) {
    assert.equal(z.tarjetas.length, 4, z.pilar);
    assert.deepEqual(z.tarjetas.map((t) => t.slug), ZONAS[z.pilar].map(([s]) => s), z.pilar);
    assert.equal(z.tarjetas[0].tipo, 'pilar', `${z.pilar}: la primera tarjeta es el pilar`);
    assert.ok(z.tarjetas.slice(1).every((t) => t.tipo !== 'pilar'), `${z.pilar}: sólo una tarjeta de pilar`);
    for (const t of z.tarjetas) {
      if (t.desde_catalogo) {
        assert.ok(REUTILIZADAS.includes(t.slug), `${t.slug}: sólo Cartelería Digital reutiliza su ficha`);
        continue;
      }
      for (const f of ['icon', 'name_es', 'name_en', 'description_es', 'description_en', 'status']) assert.ok(t[f], `${t.slug}.${f}`);
      assert.ok(t.description_es.length >= 55 && t.description_es.length <= 115, `${t.slug}: longitud ES`);
      assert.ok(t.description_en.length >= 55 && t.description_en.length <= 115, `${t.slug}: longitud EN`);
      // Campos preparados para cuando Carlos tenga los vídeos y PDFs.
      assert.ok('video' in t && 'pdf' in t, `${t.slug}: campos video/pdf preparados`);
      assert.equal(t.video, null, `${t.slug}: vídeo aún no publicado`);
      assert.equal(t.pdf, null, `${t.slug}: PDF aún no publicado`);
    }
  }
  // Los dos inventarios no se confunden: espacios publicitarios vs. equipos de la red.
  const t = Object.fromEntries(homeCatalog.zonas.flatMap((z) => z.tarjetas).map((x) => [x.slug, x]));
  assert.match(t['inventario-espacios'].description_es, /circuitos publicitarios/);
  assert.match(t['inventario-equipos'].description_es, /players|activos/);
  assert.notEqual(t['inventario-espacios'].name_en, t['inventario-equipos'].name_en);
  // admira.app es la parte de coordinación (Yokup): mantenimiento, incidencias e
  // inventario. admira.biz es «business»: ingresos con la red (Carlos, 4-oct).
  assert.match(t['admira-app'].description_es, /mantenimiento.*incidencias.*inventario/);
  assert.match(t['incidencias'].description_es, /mantenimiento/);
  assert.match(t['admira-biz'].description_es, /ingresos/);
  assert.match(t['admira-biz'].description_es, /upselling con DooH/);
  assert.match(t['admira-biz'].description_es, /cross-selling con retail media/);
  assert.match(t['admira-biz'].description_es, /self selling/);
  assert.match(t['dooh'].name_en, /Digital Out of Home/);
  // Modelo de ingresos de Carlos (4-oct): DooH = upselling, Retail Media = cross-selling, Venta Asistida = self selling.
  assert.match(t['dooh'].description_es, /^Upselling:/);
  assert.match(t['retail-media'].description_es, /^Cross-selling:/);
  for (const v of ['Self selling', 'quioscos', 'avatares', 'ahorro de personal']) assert.ok(t['venta-asistida'].description_es.includes(v), `Venta Asistida: ${v}`);
});

test('la home pinta las 20 tarjetas en el orden de las zonas, cada una con su etiqueta de pilar', () => {
  assert.equal(tarjetasHtml.length, 20);
  assert.deepEqual(tarjetasHtml.map((c) => c.slug), ORDEN);
  for (const [i, c] of tarjetasHtml.entries()) {
    const zona = Object.keys(ZONAS)[Math.floor(i / 4)];
    assert.equal(c.pilar, zona, `${c.slug}: data-pilar`);
    const p = porId[zona];
    assert.ok(c.texto.includes(`${p.n} · ${p.nombre} · ${p.verbo_es} · ${p.verbo_en}`), `${c.slug}: falta «${p.n} · ${p.nombre} · ${p.verbo_es} · ${p.verbo_en}»`);
    const nombre = ZONAS[zona][i % 4][1];
    assert.match(c.cuerpo, new RegExp(`<h3>(?:<a [^>]*>)?${nombre}(?:</a>)?</h3>`), `${c.slug}: nombre`);
    assert.equal(c.clases.includes('app-card-pilar'), i % 4 === 0, `${c.slug}: sólo la primera de la zona es la del pilar`);
  }
  for (const slug of FUERA_DE_LA_HOME) {
    assert.ok(!ORDEN.includes(slug) && !home.includes(`data-public-app-card="${slug}"`), `${slug} ya no va en la home`);
    assert.ok(catalog.some((a) => a.slug === slug), `${slug} sigue en public-catalog.json (lanzadera /apps/)`);
  }
  assert.equal(catalog.length, 20, 'public-catalog.json no se recorta');
});

test('la tarjeta de cada pilar enlaza su dominio y explica sus tres soluciones', () => {
  for (const c of tarjetasHtml.filter((x) => x.clases.includes('app-card-pilar'))) {
    const p = porId[c.pilar];
    assert.match(c.cuerpo, new RegExp(`<a class="app-entry" href="https://www\\.${p.dominio.replace('.', '\\.')}/" target="_blank" rel="noopener"`), c.slug);
    assert.ok(c.texto.includes(`Abrir ${p.dominio} →`), `${c.slug}: «Abrir ${p.dominio} →»`);
    assert.ok(c.clases.includes('app-card-entry'));
  }
});

test('Cartelería Digital conserva descripción, vídeo, PDF y enlace del catálogo', () => {
  for (const slug of REUTILIZADAS) {
    const app = catalog.find((a) => a.slug === slug);
    const c = tarjetasHtml.find((x) => x.slug === slug);
    assert.ok(c.texto.includes(app.description_es) && c.texto.includes(app.description_en), `${slug}: descripción`);
    assert.match(c.cuerpo, new RegExp(`data-app-video="${app.video}"`));
    assert.match(c.cuerpo, new RegExp(`data-app-pdf="${app.pdf}"`));
    assert.doesNotMatch(c.cuerpo, /app-pronto/);
  }
  const cartel = tarjetasHtml.find((x) => x.slug === 'digitalsignage');
  assert.match(cartel.cuerpo, /<a class="app-entry" href="\/digitalsignage\/#circuitos"/);
  assert.ok(cartel.texto.includes('Abrir los circuitos →'));
});

test('sin medio publicado, Vídeo y PDF aparecen como «pronto»: presentes, aria-disabled y sin acción', () => {
  for (const c of tarjetasHtml.filter((x) => !REUTILIZADAS.includes(x.slug))) {
    const pronto = [...c.cuerpo.matchAll(/<button[^>]*class="app-action app-pronto"[^>]*>([^<]*)<\/button>/g)];
    assert.equal(pronto.length, 2, `${c.slug}: dos botones «pronto»`);
    assert.deepEqual(pronto.map((m) => m[1]), ['▶ Vídeo · pronto', '↓ PDF · pronto'], c.slug);
    for (const [b] of pronto) {
      assert.match(b, /aria-disabled="true"/);
      assert.match(b, /aria-label="(Vídeo|PDF) de [^"]+: próximamente"/);
      assert.doesNotMatch(b, /data-app-(video|pdf)/, 'public-apps.js no le engancha nada');
    }
    assert.doesNotMatch(c.cuerpo, /data-app-(video|pdf)=/, `${c.slug}: sin medio real`);
  }
  assert.match(home, /\.app-action\.app-pronto\{[^}]*cursor:not-allowed/);
});

test('la leyenda enlaza digitalsignage.ai, cuenta 4 por pilar y sus botones son accesibles sin JS y con JS', () => {
  assert.match(home, /Los cinco pilares · <a href="https:\/\/www\.digitalsignage\.ai\/" target="_blank" rel="noopener">digitalsignage\.ai/);
  const botones = [...home.matchAll(/<button type="button" class="pilar-btn[^"]*"[^>]*>[\s\S]*?<\/button>/g)].map((m) => m[0]);
  assert.equal(botones.length, 6, 'Todas + 5 pilares');
  for (const b of botones) {
    assert.match(b, /aria-pressed="(true|false)"/);
    assert.match(b, / disabled>/, 'sin JS es una leyenda: no se puede pulsar algo que no hace nada');
  }
  assert.match(botones[0], /data-pilar-filtro="todas" aria-pressed="true"/);
  assert.deepEqual(botones.slice(1).map((b) => b.match(/data-pilar-filtro="([a-z]+)"/)[1]), Object.keys(ZONAS));
  for (const b of botones.slice(1)) assert.match(b, /aria-label="Pilar [^"]*: 4 soluciones"/);
  assert.match(home, /\.pilar-btn:focus-visible\{outline:3px solid var\(--pc\)/);
  assert.match(home, /\.app-card\[hidden\]\{display:none\}/);
});

test('ningún color de pilar se escribe a mano: sólo en el bloque generado', () => {
  const sinGenerado = home.replace(/<style id="pilaresCss">[\s\S]*?<\/style>/, '');
  for (const p of pilares) assert.ok(!sinGenerado.toUpperCase().includes(p.color.toUpperCase()), `${p.color} escrito a mano en index.html`);
  for (const p of pilares) assert.match(home, new RegExp(`\\[data-pilar="${p.id}"\\]\\{--pc:${p.color}`));
});

test('el texto del pilar cumple AA (4,5:1) sobre la tarjeta normal, la del pilar y su chip', () => {
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const lum = (c) => {
    const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const [, tinte, tintePilar] = home.match(/\[data-pilar\]\{--pc-tinte:([0-9.]+);--pc-tinte-pilar:([0-9.]+)\}/).map(Number);
  assert.ok(tintePilar > tinte, 'la tarjeta del pilar lleva más tinte');
  const panel2 = rgb('#101927');
  const textosFijos = {descripción: '#c2cddd', dim: '#9eacc0', texto: '#e8eef6'};
  for (const p of pilares) {
    const vars = home.match(new RegExp(`\\[data-pilar="${p.id}"\\]\\{--pc:(#[0-9A-Fa-f]{6});--pc-rgb:[0-9,]+;--pc-ink:(#[0-9A-Fa-f]{6});--pc-chip-ink:(#[0-9A-Fa-f]{6})\\}`));
    assert.ok(vars, `${p.id}: variables de color generadas`);
    const color = rgb(vars[1]);
    for (const t of [tinte, tintePilar]) {
      const fondo = color.map((c, i) => Math.round(t * c + (1 - t) * panel2[i]));
      assert.ok(ratio(rgb(vars[2]), fondo) >= 4.5, `${p.id}: texto del pilar sobre la tarjeta (tinte ${t}) < 4,5:1`);
      for (const [que, hex] of Object.entries(textosFijos)) assert.ok(ratio(rgb(hex), fondo) >= 4.5, `${p.id}: ${que} sobre la tarjeta (tinte ${t}) < 4,5:1`);
    }
    // Chip del número y el icono relleno de la tarjeta del pilar.
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
  const tarjetas = tarjetasHtml.map((c) => nodo({'data-pilar': c.pilar}));
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
    assert.equal(visibles(), 4, p.id);
    assert.ok(tarjetas.every((t) => t.hidden === (t.attrs['data-pilar'] !== p.id)));
    assert.deepEqual(pulsado(), [p.id]);
    assert.match(estado.textContent, new RegExp(`^${p.nombre} · 4 de 20 soluciones`));
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

test('los contadores escritos a mano siguen diciendo 20', () => {
  assert.match(home, /Descubre las 20 soluciones/);
  assert.match(home, /<a href="#soluciones">20 soluciones<\/a>/);
  assert.match(home, /Descubrir las 20 soluciones/);
  assert.match(home, /Una plataforma, 20 formas de activar el espacio\./);
  assert.match(home, /id="appsStatus"[^>]*>20 soluciones · 20 solutions</);
  assert.match(home, /<span class="pilar-btn-cuenta">20 soluciones<\/span>/);
});
