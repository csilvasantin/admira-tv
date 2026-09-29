import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  assignmentPlan, cachePercentOf, circuitsFromSurfaces, copy, decideProposal, formatDuration,
  higherPriority, isCapsule, itemFormat, itemLanguage, madridClock, matchesCriteria, metastyle,
  normTag, playbackItems, playerAirState, proofHref, proposeMix, refreshProposal, regenerateAuto,
  reorderItems, resolveTargets, scheduleActive, selectByCriteria, totalSeconds,
} from './creator.mjs';

const alsea = {
  id: 'alsea-1', type: 'video', url: 'https://api.admira.store/stock/asset/alsea-1',
  title: 'Tu pausa', tags: ['#Alsea', 'horizontal'], audience: 'all', category: 'promo',
  ancho: 1920, alto: 1080, language: 'es', timeSlot: 'manana', seconds: 15,
};
const capsule = {
  id: 'cap-1', type: 'video', url: 'https://api.admira.store/stock/asset/cap-1',
  title: 'Cápsula de conocimiento · café', tags: ['alsea', 'conocimiento'], audience: 'all',
  category: 'sabias', orientacion: 'vertical', lang: 'es', seconds: 8,
};
const other = {
  id: 'otro', type: 'image', url: 'https://api.admira.store/stock/asset/otro',
  title: 'Otra marca', tags: ['jti'], audience: 'm', category: 'marca',
};

test('el hashtag #alsea casa con Alsea y no con otra marca', () => {
  assert.equal(normTag('#Alsea'), 'alsea');
  assert.equal(matchesCriteria(alsea, { hashtag: '#alsea' }), true);
  assert.equal(matchesCriteria(other, { hashtag: '#alsea' }), false);
  assert.equal(itemFormat(alsea), 'horizontal');
  assert.equal(itemFormat(capsule), 'vertical');
  assert.equal(itemLanguage(alsea), 'es');
  assert.equal(itemLanguage({ tags: ['en'] }), 'en');
});

test('los criterios combinan tipo, formato, idioma, audiencia, categoría y franja', () => {
  const criteria = { hashtag: 'alsea', type: 'video', format: 'horizontal', language: 'es', audience: 'all', category: 'promo', timeSlot: 'manana' };
  const picked = selectByCriteria([alsea, capsule, other], criteria);
  assert.deepEqual(picked.map(item => item.id), ['alsea-1']);
  assert.equal(picked[0].seconds, 15);
  assert.equal(selectByCriteria([alsea], {}).length, 0);
});

test('la duración por pieza suma el total y el arrastre reordena', () => {
  const items = [{ id: 'a', seconds: 10 }, { id: 'b', seconds: 20 }, { id: 'c' }];
  assert.equal(totalSeconds(items), 40);
  assert.equal(formatDuration(90, 'es'), '1 min 30 s');
  assert.deepEqual(reorderItems(items, 0, 2).map(item => item.id), ['b', 'c', 'a']);
  assert.deepEqual(reorderItems(items, 5, 0).map(item => item.id), ['a', 'b', 'c']);
});

test('la playlist automática se regenera cuando entra una pieza nueva con el hashtag', () => {
  const playlist = { mode: 'auto', criteria: { hashtag: 'alsea' }, items: [{ id: 'alsea-1', seconds: 12 }] };
  const quiet = regenerateAuto(playlist, [alsea]);
  assert.equal(quiet.changed, false);
  assert.equal(quiet.playlist.items[0].seconds, 12);
  const fresh = { ...alsea, id: 'alsea-2', title: 'Nueva' };
  const next = regenerateAuto(playlist, [alsea, fresh], 1000);
  assert.equal(next.changed, true);
  assert.deepEqual(next.playlist.items.map(item => item.id), ['alsea-1', 'alsea-2']);
  assert.equal(next.playlist.items[0].seconds, 12);
  assert.equal(next.playlist.regeneratedAt, 1000);
});

test('la IA mete una cápsula cada 3 piezas y no emite hasta que alguien aprueba', () => {
  const pool = [
    { ...alsea, id: 'a' }, { ...alsea, id: 'b' }, { ...alsea, id: 'c' }, { ...alsea, id: 'd' }, capsule,
  ];
  assert.equal(isCapsule(capsule), true);
  assert.equal(isCapsule(alsea), false);
  const proposal = proposeMix(pool, { every: 3 });
  assert.equal(proposal.status, 'pending');
  assert.deepEqual(proposal.items.map(item => item.id), ['a', 'b', 'c', 'cap-1', 'd']);
  const playlist = { mode: 'ia', items: [{ id: 'viejo' }], proposal, criteria: { hashtag: 'alsea' }, every: 3 };
  const rejected = decideProposal(playlist, 'reject', 5);
  assert.deepEqual(rejected.items.map(item => item.id), ['viejo']);
  assert.equal(rejected.proposal.status, 'rejected');
  const approved = decideProposal(playlist, 'approve', 9);
  assert.deepEqual(approved.items.map(item => item.id), ['a', 'b', 'c', 'cap-1', 'd']);
  assert.equal(approved.proposal.status, 'approved');
  assert.equal(approved.approvedAt, 9);
  const empty = proposeMix([{ ...alsea, id: 'a' }], { every: 3 });
  assert.equal(empty.note, 'no-capsules');
});

test('una pieza nueva deja otra propuesta pendiente sin pisar lo ya aprobado', () => {
  const approved = decideProposal({
    mode: 'ia', criteria: { hashtag: 'alsea' }, every: 3, items: [],
    proposal: proposeMix([alsea, capsule], { every: 3 }),
  }, 'approve', 1);
  const again = refreshProposal(approved, [alsea, capsule]);
  assert.equal(again.changed, false);
  const extra = { ...alsea, id: 'alsea-9' };
  const pending = refreshProposal(approved, [alsea, extra, capsule], 20);
  assert.equal(pending.changed, true);
  assert.equal(pending.playlist.proposal.status, 'pending');
  assert.deepEqual(approved.items.map(item => item.id), pending.playlist.items.map(item => item.id));
});

test('el circuito entero, un grupo y players sueltos se resuelven sin duplicar', () => {
  const surfaces = [
    { screen: 's1', circuit: 'alsea' },
    { screen: 's2', circuit: 'alsea' },
    { screen: 's3', circuit: 'jti' },
  ];
  assert.deepEqual(circuitsFromSurfaces(surfaces).map(row => row.id), ['alsea', 'jti']);
  const targets = resolveTargets({
    circuits: ['alsea'],
    groups: [{ id: 'barra', screens: ['s3', 's1'] }],
    players: ['suelto', 's2'],
    surfaces,
  });
  assert.deepEqual(targets, ['s1', 's2', 's3', 'suelto']);
  const sync = assignmentPlan(targets, 'sync');
  assert.equal(sync[0].role, 'master');
  assert.equal(sync[1].role, 'follower');
  assert.equal(sync[0].mode, 'sync');
  const random = assignmentPlan(['s1'], 'random');
  assert.equal(random[0].mode, 'random');
  const shuffled = playbackItems([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }], 'random', random[0].seed);
  assert.equal(shuffled.length, 4);
  assert.deepEqual(playbackItems([{ id: 'a' }, { id: 'b' }], 'linear', 1).map(item => item.id), ['a', 'b']);
});

test('la programación respeta días, fechas, franja y la prioridad gana', () => {
  const clock = { ymd: '2026-09-30', weekday: 'wed', hm: '11:00' };
  const schedule = { days: ['wed', 'thu'], start: '2026-09-30', end: '2026-10-02', from: '10:00', to: '14:00', priority: 2 };
  assert.equal(scheduleActive(schedule, clock), true);
  assert.equal(scheduleActive(schedule, { ...clock, weekday: 'sun' }), false);
  assert.equal(scheduleActive(schedule, { ...clock, hm: '09:00' }), false);
  assert.equal(scheduleActive(schedule, { ...clock, ymd: '2026-10-03' }), false);
  assert.equal(higherPriority({ id: 'alta', priority: 5 }, { id: 'baja', priority: 1 }).id, 'alta');
  const madrid = madridClock(new Date('2026-09-30T09:00:00Z'));
  assert.equal(madrid.ymd, '2026-09-30');
  assert.equal(madrid.hm, '11:00');
  assert.equal(madrid.weekday, 'wed');
});

test('el estado real del player y el proof of play salen de /signage/now', () => {
  assert.equal(playerAirState({ now: { item: { id: 'a' }, health: { source: 'live' } }, online: true }).state, 'emitiendo');
  assert.equal(playerAirState({ now: { health: { source: 'cache' } }, cachePercent: 100 }).state, 'descargada');
  assert.equal(playerAirState({ now: { health: { source: 'error', lastReason: 'stall' } } }).state, 'error');
  assert.equal(playerAirState({ now: null }).state, 'error');
  assert.equal(cachePercentOf({ lists: [{ percent: 40 }, { percent: 60 }] }), 50);
  assert.equal(proofHref('alsea-barra'), '/estadisticas/?screen=alsea-barra');
});

test('metestilo Alsea y los textos en español e inglés', () => {
  assert.equal(metastyle('alsea').accent, '#e4002b');
  assert.equal(metastyle('admira').id, 'admira');
  const es = copy('es');
  const en = copy('en');
  assert.equal(es.manual, 'Manual');
  assert.equal(en.manual, 'Manual');
  assert.equal(en.auto, 'Automatic');
  assert.equal(es.syncHint.includes('máster'), true);
  assert.equal(en.proof, 'Proof of play');
  for (const key of Object.keys(es)) assert.equal(typeof en[key], 'string');
});

test('la página de playlists usa el creador y no sustituye el flujo anterior', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(html, /from '\.\/creator\.mjs'/);
  assert.match(html, /data-mode="manual"/);
  assert.match(html, /data-mode="auto"/);
  assert.match(html, /data-mode="ia"/);
  assert.match(html, /data-play="sync"/);
  assert.match(html, /id="edPreview"/);
  assert.match(html, /id="metaToggle"/);
  assert.match(html, /\/grid\/book/);
  assert.match(html, /xpl-store|PLSTORE/);
});
