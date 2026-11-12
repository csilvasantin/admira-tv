import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const mando = await readFile(new URL('./mando.html', import.meta.url), 'utf8');
const players = await readFile(new URL('./players.html', import.meta.url), 'utf8');

test('Remote, Playlist and Contenidos share a single importer and Players embeds the same form', () => {
  assert.equal((mando.match(/id="tagApply"/g) || []).length, 1);
  assert.match(mando, /taggedImport'\)\.hidden=!taggedEmbed&&!\['remote','playlist','contents'\]\.includes\(view\)/);
  assert.match(mando, /URLSearchParams\(\{screen:T\.screen,circuit:T\.circuit\}\)/);
  assert.match(mando, /wantS\)\{ startIdx=FLAT\.findIndex\(function\(t\)\{ return t\.screen===wantS;/);
  assert.match(mando, /selEl\.value=taggedEmbed&&!wantS&&!wantC&&!wantN\?'':startIdx;/);
  assert.match(mando, /importer\.disabled=!T;/);
  assert.match(players, /embed\.set\('embed','tagged'\);\s*frame\.src='\/mando\.html\?'/);
});

function verification({ lists, now, cache, switchTarget = false, itemId = 'asset-667' }) {
  const events = [];
  const expectedScreen = 'test-screen-2';
  const scope = {
    DOWNLOAD_TIMEOUT_MS: 4000,
    targetGeneration: 1,
    Date: { now: () => clock },
    setTimeout(callback, ms) { clock += ms; callback(); },
    taggedStockId: async () => itemId,
    async remotePlaylistData(screen) {
      assert.equal(screen, expectedScreen);
      if (switchTarget) scope.targetGeneration++;
      return lists.length > 1 ? lists.shift() : lists[0];
    },
    async taggedNow(screen) {
      assert.equal(screen, expectedScreen);
      return now;
    },
    async taggedCacheState(screen, ids) {
      assert.equal(screen, expectedScreen);
      events.push(['cache', Array.from(ids)]);
      return cache;
    },
    paintTagDownload(pct, state) { events.push(['progress', pct, state]); },
    paintRemoteButton() {},
    finishRemoteButton(action, result) { events.push(['finish', result, action.doneLabel]); },
    toast(message) { events.push(['toast', message]); },
    pollNow() {},
    loadRemotePlaylist() {},
  };
  let clock = 0;
  const body = mando.slice(mando.indexOf('    async function waitTaggedAvailability('), mando.indexOf('    async function applyTag('));
  vm.runInNewContext(body, scope);
  const run = (kind = 'content', clean = '667') => scope.waitTaggedAvailability(
    { target: { screen: expectedScreen }, action: { generation: 1 } }, { kind, clean },
  );
  return { events, run };
}

const asset = { id: 'asset-667', type: 'image', url: 'https://example.test/667.png' };

test('a cached piece is verified only after it appears in the selected player playlist', async () => {
  const { events, run } = verification({
    lists: [{ items: [] }, { items: [asset] }],
    now: { id: asset.id },
    cache: { ready: true, pct: 100 },
  });
  assert.equal(await run(), true);
  assert.deepEqual(events.filter(([kind]) => kind === 'cache'), [['cache', [asset.id]]]);
  assert.ok(events.some(e => e[0] === 'finish' && e[2] === '✓ En emisión'));
});

test('an unchanged playlist never confirms a requested hashtag and a target change stops feedback', async () => {
  const unrelated = verification({
    lists: [{ items: [asset] }],
    now: { id: asset.id, playlist: { name: '#otra' } },
    cache: { ready: true, pct: 100 },
  });
  assert.equal(await unrelated.run('tag', 'promo'), false);
  assert.ok(unrelated.events.every(e => e[0] !== 'cache'));

  const changed = verification({ lists: [{ items: [asset] }], switchTarget: true });
  assert.equal(await changed.run(), false);
  assert.ok(changed.events.every(e => e[0] !== 'toast' && e[0] !== 'cache'));
});
