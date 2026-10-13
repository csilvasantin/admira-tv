import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { onRequestGet, onRequestPost, forgetMemo } from './functions/api/playlist.js';
import { desdeLegado } from './functions/api/_programacion/legado.js';
import { limpiarPieza } from './functions/api/_programacion/modelo.js';
import { resolver } from './functions/api/_programacion/resolver.js';
import { defaultDraftItems, gridInjectedFrom } from './functions/api/_emision.js';

const canal = await readFile(new URL('./canal.html', import.meta.url), 'utf8');
const SCREEN = 'tv-contract', ASSET = 'https://stock.admira.store/stock/cola/asset.html';
const AT = Date.parse('2026-10-14T08:00:00Z');
const kinds = canal.match(/^const KIND = .*;$/m)[0];
const helper = canal.match(/^function playlistAssetKind\(.*$/m)[0];
const section = (start, end) => canal.slice(canal.indexOf(start), canal.indexOf(end, canal.indexOf(start)));
const loadDefault = section('async function loadDefaultDraft()', '// Entrelaza los creativos');
const loadPreview = section('async function loadRundownPreview()', 'function previewFallback(');
const loadGrid = section('async function loadGrid()', '// ── PREVIO DE PARRILLA');
const play = section('async function play(i, forced)', '// antes de cada nuevo contenido');
// editorialSec is a standalone function; its next declaration can change independently.
const editorial = canal.match(/function editorialSec\([\s\S]*?\n\}/)[0];
const cache = canal.match(/^function cacheable\(.*$/m)[0];

function playerFixture(body, mode = 'default') {
  const made = [], turns = [], calls = [], nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { style: {}, textContent: '', classList: { remove() {} } });
    return nodes.get(id);
  };
  const stage = { children: [], appendChild(n) { this.children.push(n); }, querySelector() { return null; },
    set innerHTML(v) { this.children = []; this.html = v; }, get innerHTML() { return this.html || ''; } };
  const c = {
    URLSearchParams, Date, Math, Number, String, Set, encodeURIComponent,
    document: { body: { classList: { remove() {} } }, createElement(tag) {
      const el = { tagName: tag.toUpperCase(), style: {}, attributes: {},
        setAttribute(k, v) { this.attributes[k] = v; }, addEventListener() {} };
      made.push(el); return el;
    } }, $: node, stage, nowEl: node('now'), metaEl: node('meta'), bar: node('bar'),
    _standby: false, _playTok: 0, timer: null, mediaEl: null, usesAdv: false, paused: false,
    playlist: [], all: [], cur: 0, syncOn: false, _asapItemId: '', STREAM_OK: false,
    _warmWaiting: false, _coldWaiting: false, _extendedAssignment: false, AV1_OK: true,
    cfg: { imgSec: 9, audioSec: 18, interSec: 60 }, XTORE_PARENT: '', GRID_API: 'https://api.admira.store',
    PREVIEW: { on: mode === 'preview', items: [], screen: SCREEN, playlist: 'default' },
    DEFAULT_DRAFT: { items: [], signature: '', ready: false, assigned: false },
    pairingReady: Promise.resolve(), programScreen: () => SCREEN, programCircuit: () => SCREEN,
    navigator: { language: 'es' }, innerWidth: 1920, innerHeight: 1080, qs: new URLSearchParams(),
    scr: { screen: SCREEN }, seg: { slot: 'manana' }, _gridSig: '·', gridInjected: [], gridExactMode: false,
    xtoreMusicEnabled: () => false, guardPlayStarted() {}, stopBar() {}, renderRail() {},
    cachedSrc: async () => null, firstCachedFrom() { throw Error('HTML must not wait for disk cache'); },
    itemAR: () => 16 / 9, fitMupi() {}, emitFrameState() {}, localInfoSet() {},
    normTag: t => String(t).toLowerCase(), previewBadge() {}, setLive() {}, gridBadge() {},
    signagePlaylistPush() {}, clearTimeout() {}, setTimeout() {},
    startAdv: ms => turns.push(ms),
    fetch: async url => { calls.push(String(url)); return { ok: true, json: async () => body.current || body }; },
    rebuild() { c.playlist = (mode === 'preview' ? c.PREVIEW.items : mode === 'grid' ? c.gridInjected : c.DEFAULT_DRAFT.items).slice(); },
  };
  vm.createContext(c);
  vm.runInContext([kinds, helper, cache, editorial, loadDefault, loadPreview, loadGrid, play].join('\n'), c);
  return { c, made, turns, calls };
}

function assertInteractive(f, expectedUrl = ASSET) {
  const el = f.made.at(-1);
  assert.equal(el.tagName, 'IFRAME', 'HTML is rendered in the existing interactive iframe');
  assert.equal(el.src, expectedUrl);
  assert.equal(el.attributes.sandbox, 'allow-scripts allow-same-origin allow-forms');
  assert.equal(el.attributes.allow, 'autoplay; encrypted-media; fullscreen');
  assert.equal(f.c.cacheable(f.c.playlist[0]), false, 'HTML remains online, outside media disk cache');
  assert.equal(f.turns.at(-1), 25_000, 'the assigned editorial duration reaches the renderer');
}

function storage() {
  const data = new Map();
  return { ACCESS: { get: async k => data.get(k) || null, put: async (k, v) => data.set(k, v) }, STOCK_NOTIFY_KEY: 'test-stock-key' };
}
const write = (env, items) => onRequestPost({ env, request: new Request('https://admira.tv/api/playlist', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Notify-Key': 'test-stock-key' },
  body: JSON.stringify({ screen: SCREEN, items }),
}) });

test('interactive and xperiencia survive API write/read, programacion bridge/resolver and the real player iframe branch', async t => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ items: [] });
  t.after(() => { globalThis.fetch = realFetch; forgetMemo(); });
  for (const type of ['interactive', 'xperiencia']) for (const field of ['assetType', 'type']) {
    forgetMemo();
    const env = storage();
    const response = await write(env, [{ id: 'cola', stockId: 'cola', asset: ASSET, [field]: type, seconds: 25, title: 'Carlos · pedido listo' }]);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).draft.items[0].assetType, 'interactive');
    const get = await onRequestGet({ env, request: new Request('https://admira.tv/api/playlist?screen=' + SCREEN) });
    assert.equal(get.status, 200);
    const body = await get.json();
    assert.equal(defaultDraftItems(body)[0].type, 'interactive', 'the emission inspector agrees with the player');
    const programacion = resolver({ ahora: AT, facts: { screen: SCREEN }, stock: [], ...desdeLegado({ borradores: [body.draft] }) });
    assert.equal(programacion.items[0].assetType, 'interactive');
    assert.equal(programacion.items[0].asset, ASSET);
    assert.equal(programacion.items[0].seconds, 25);
    // Exercise both current API delivery and delivery after the programacion bridge.
    for (const items of [body.draft.items, programacion.items]) {
      const f = playerFixture({ ok: true, draft: { items } });
      await f.c.loadDefaultDraft();
      assert.equal(f.c.playlist[0].type, 'interactive');
      await f.c.play(0);
      assertInteractive(f);
    }
  }
});

test('rundown preview retains legacy xperiencia and renders it with the same sandbox', async () => {
  const f = playerFixture({ draft: { items: [{ id: 'cola', type: 'xperiencia', url: ASSET, seconds: 25 }] } }, 'preview');
  await f.c.loadRundownPreview();
  await f.c.play(0);
  assertInteractive(f);
});

test('grid mapping and programacion slots keep interactive and react to a type-only change', async () => {
  const creative = { type: 'image', url: ASSET };
  const body = { ok: true, config: { slotSeconds: 25 }, bands: [{ id: 'dia', isNow: true, from: '08:00', to: '12:00', slots: [{ kind: 'own', bookingId: 'cola', creative }] }] };
  const f = playerFixture(body, 'grid');
  await f.c.loadGrid();
  assert.equal(f.c.playlist[0].type, 'image');
  creative.type = 'xperiencia';
  await f.c.loadGrid();
  assert.equal(f.c.playlist[0].type, 'interactive');
  await f.c.play(0);
  assertInteractive(f);
  const r = resolver({ ahora: AT, facts: { screen: SCREEN }, stock: [], parrilla: { ...body, date: '2026-10-14' } });
  assert.equal(r.spots[0].assetType, 'interactive');
  assert.equal(gridInjectedFrom({ ...body, date: '2026-10-14' }, AT).items[0].type, 'interactive');
});

test('existing media aliases and HTTPS validation remain intact', async () => {
  for (const [type, expected] of [['animation', 'video'], ['music', 'audio'], ['locucion', 'audio'], ['image', 'image'], ['unknown', 'image'], ['constructor', 'image']]) {
    const piece = limpiarPieza({ asset: ASSET, type });
    assert.equal(piece.assetType, expected);
    const f = playerFixture({ draft: { items: [piece] } });
    await f.c.loadDefaultDraft();
    assert.equal(f.c.playlist[0].type, expected);
  }
  assert.equal(limpiarPieza({ asset: 'javascript:alert(1)', type: 'interactive' }), null);
  assert.equal((await write(storage(), [{ asset: 'http://insecure.example/cola.html', type: 'interactive' }])).status, 400);
});
