import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const catalog = JSON.parse(await read('./apps/public-catalog.json'));
const home = await read('./index.html');
const client = await read('./public-apps.js');
const protectedApps = await read('./apps/index.html');
const manifest = JSON.parse(await read('./apps/videos.json'));
const mediaAllowlist = await read('./functions/apps/_public-media.js');
const videoFunction = await read('./functions/apps/video/[file].js');
const pdfFunction = await read('./functions/apps/pdf/[file].js');
const mediaContext = vm.createContext({});
vm.runInContext(`${mediaAllowlist.replace(/export /g, '')}\nglobalThis.publicMediaFileTest=publicMediaFile;`, mediaContext);

const expected = [
  'dashboard','digitalsignage','contentcatalogue','support','pushnotifications',
  'virtualassistant','adcelerate','gamification','iotmanager','videoanalytics',
  'radioanalytics','socialwifi','queuemanager','roombooking','audiobranding',
  'olfactorymarketing','virtualreality','augmentedreality','xpaceos','yarig'
];

test('la allowlist pública contiene exactamente las 20 apps canónicas', () => {
  assert.equal(catalog.length, 20);
  assert.deepEqual(catalog.map((app) => app.slug), expected);
  assert.equal(new Set(catalog.map((app) => app.slug)).size, 20);
  assert.ok(!catalog.some((app) => app.slug === 'accesscontrol'));
});

test('cada card tiene icono, nombre y explicación ES/EN y estado público', () => {
  for (const app of catalog) {
    for (const field of ['icon','name_es','name_en','description_es','description_en','status']) assert.ok(app[field], `${app.slug}.${field}`);
    assert.equal(app.status, 'available');
    assert.ok(app.description_es.length >= 55);
    assert.ok(app.description_en.length >= 55);
  }
});

test('sólo se publican los 19 pares de medios verificados y nunca Access Control', () => {
  const withMedia = catalog.filter((app) => app.video || app.pdf);
  assert.equal(withMedia.length, 19);
  assert.equal(catalog.find((app) => app.slug === 'adcelerate').video, undefined);
  for (const app of withMedia) {
    assert.equal(app.video, `/apps/video/${app.slug}.mp4`);
    assert.equal(app.pdf, `/apps/pdf/${app.slug}.pdf`);
    assert.equal(manifest[app.slug].src, app.video);
    assert.equal(manifest[app.slug].pdf, app.pdf);
  }
  assert.ok(manifest.accesscontrol, 'el medio DMZ existe y por eso debe bloquearse expresamente');
  const declared = mediaAllowlist.match(/new Set\(\[([\s\S]*?)\]\)/)?.[1] || '';
  const allowed = [...declared.matchAll(/"([a-z0-9_-]+)"/g)].map((match) => match[1]);
  assert.deepEqual(allowed, expected.filter((slug) => slug !== 'adcelerate'));
  assert.doesNotMatch(mediaAllowlist, /"accesscontrol"/);
  assert.match(videoFunction, /publicMediaFile\(file, "mp4"\)/);
  assert.match(pdfFunction, /publicMediaFile\(file, "pdf"\)/);
  assert.equal(mediaContext.publicMediaFileTest('dashboard.mp4','mp4'), 'dashboard.mp4');
  assert.equal(mediaContext.publicMediaFileTest('accesscontrol.mp4','mp4'), '');
  assert.equal(mediaContext.publicMediaFileTest('../dashboard.mp4','mp4'), '');
});

test('la home es pública y no incorpora gate, navegación DMZ, APIs ni secretos', () => {
  assert.doesNotMatch(home, /auth-gate|admira-nav|admira-frame|api\.admira\.store|grid\/screens|signage\/now/i);
  assert.doesNotMatch(home, /href=["'][^"']*(?:\/apps\/|\/accesscontrol|\/cms|\/parrilla|\/wall|\/support|\/iotmanager|\/alta|\/comprar|\/condicional)/i);
  assert.doesNotMatch(home + client, /Bearer|CLIENT_ID|owners|localStorage|sessionStorage|document\.cookie/i);
  assert.match(client, /credentials: "omit"/);
});

test('la navegación pública enlaza el hero con el catálogo y renderiza 20 cards', () => {
  assert.match(home, /href="#soluciones"/);
  assert.match(home, /id="soluciones"/);
  assert.match(home, /id="publicApps"/);
  assert.match(client, /apps\.length !== 20/);
  assert.match(client, /dataset\.publicAppCard = app\.slug/);
});

test('el modal de vídeo es accesible, carga bajo demanda y restaura el foco', () => {
  assert.match(home, /role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="appVideoTitle"/);
  assert.match(home, /<video[^>]*controls[^>]*playsinline[^>]*preload="metadata"/);
  assert.match(client, /event\.key === "Escape"/);
  assert.match(client, /event\.key !== "Tab"/);
  assert.match(client, /previousFocus\.focus\(\)/);
  assert.match(client, /video\.src = src/);
});

test('el contrato responsive evita overflow entre móvil y escritorio', () => {
  assert.match(home, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(home, /@media\(max-width:980px\)/);
  assert.match(home, /@media\(max-width:720px\)/);
  assert.match(home, /@media\(max-width:480px\)/);
  assert.match(home, /grid-template-columns:1fr/);
  assert.match(home, /prefers-reduced-motion:reduce/);
});

test('la lanzadera protegida reutiliza el catálogo sin publicar sus enlaces en la home', () => {
  assert.match(protectedApps, /fetch\('\/apps\/public-catalog\.json'/);
  assert.match(protectedApps, /APPS\.length!==20/);
  assert.doesNotMatch(home, /public-catalog\.json/);
});
